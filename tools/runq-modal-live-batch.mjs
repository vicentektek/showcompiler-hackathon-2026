/**
 * Operator-started, serial Modal pilot. Never invoked by tests or CI with live
 * transports. Local receipts and original job IDs survive interruption.
 */
import {mkdir,open,readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {inspectPcm16Wav} from '../src/core/modalSfxPilotClient.mjs';
import {acquireGlobalSpendLedger} from '../src/qa/globalSpendLedger.mjs';

export const MODAL_PILOT_CASES=Object.freeze([
 ['glass','en','basic','SFX',4,'One light tap on the rim of an empty glass, clear short decay, no voice or music.'],
 ['bell','es','basic','SFX',3,'Una campanilla de laton suena una vez, decaimiento breve, sin voz ni musica.'],
 ['steps','en','basic','SFX',5,'Three slow shoe steps on a wooden stage, isolated, no speech or music.'],
 ['rain','en','intermediate','ENVIRONMENT',6,'Steady soft rain on a theatre window, no thunder, voices or music.'],
 ['room','es','intermediate','ENVIRONMENT',6,'Ambiente tenue de sala vacia, ventilacion suave y estable, sin voces ni musica.'],
 ['door','en','intermediate','SFX',5,'A heavy wooden door creaks open then stops, no slam, voices or music.'],
 ['storm','en','advanced','ENVIRONMENT',8,'Distant wind with a single low thunder rumble, no rain, voice or music.'],
 ['machine','es','advanced','SFX',7,'Un motor pequeno arranca, mantiene un zumbido y se apaga, sin voz ni musica.'],
 ['abstract','en','extreme','SFX',8,'A subtle rising metallic tension texture that ends abruptly, no voices or music.'],
].map(([id,language,difficulty,kind,durationSeconds,prompt])=>Object.freeze({
 id:'modal-quality-v1-'+id,category:kind,language,difficulty,kind,durationSeconds,prompt,
 expected:'Original sound brief; semantic/artistic match requires human listening.',
})));

export function parseModalBatchOptions(argv){
 const options={live:false,ackPaid:false,creditVerified:false,count:9,port:5192};
 const seen=new Set();
 for(let i=0;i<argv.length;i++){
  const flag=argv[i];
  if(seen.has(flag))throw new TypeError('DUPLICATE_FLAG');
  seen.add(flag);
  if(flag==='--live')options.live=true;
  else if(flag==='--ack-paid')options.ackPaid=true;
  else if(flag==='--credit-verified')options.creditVerified=true;
  else if(flag==='--count'||flag==='--port'){
   const raw=argv[++i];
   if(!/^\d+$/.test(raw??''))throw new TypeError('INVALID_OPTION_VALUE');
   options[flag.slice(2)]=Number(raw);
  }else throw new TypeError('UNKNOWN_FLAG');
 }
 if(!options.live||!options.ackPaid||!options.creditVerified)
  throw new TypeError('OPERATOR_LIVE_ACK_AND_ACTUAL_CREDIT_VERIFICATION_REQUIRED');
 if(options.count<1||options.count>MODAL_PILOT_CASES.length||
   !Number.isSafeInteger(options.port)||options.port<1024||options.port>65535)
  throw new TypeError('INVALID_BATCH_LIMIT');
 return options;
}

export function measurePilotWav(bytes,expectedDuration){
 const metadata=inspectPcm16Wav(bytes),data=Buffer.from(bytes);
 let start=0,length=0;
 for(let offset=12;offset+8<=data.length;){
  const size=data.readUInt32LE(offset+4);
  if(data.toString('ascii',offset,offset+4)==='data'){start=offset+8;length=size;break;}
  offset+=8+size+(size%2);
 }
 let sum=0,peak=0,clipped=0,nearSilent=0;
 for(let offset=start;offset<start+length;offset+=2){
  const raw=data.readInt16LE(offset),value=Math.abs(raw)/32768;
  peak=Math.max(peak,value);sum+=value*value;
  if(Math.abs(raw)>=32767)clipped++;
  if(value<0.001)nearSilent++;
 }
 const samples=length/2,rms=Math.sqrt(sum/samples);
 return {...metadata,durationMatches:Math.abs(metadata.durationSeconds-expectedDuration)<=0.1,
  rmsDbfs:rms>0?20*Math.log10(rms):null,peak,clippedFraction:clipped/samples,
  nearSilentFraction:nearSilent/samples,
  suspectedWholeFileSilence:rms<0.001,
  artisticReview:'PENDING_HUMAN_LISTENING',distortion:'NOT_DETERMINED_BY_PCM_METRICS'};
}

async function save(file,value){
 const temporary=file+'.tmp-'+randomUUID();
 await writeFile(temporary,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
 await rename(temporary,file);
}
async function readReceipt(file){
 try{return JSON.parse(await readFile(file,'utf8'));}
 catch(error){if(error.code==='ENOENT')return null;throw error;}
}
async function campaignPreflight(maximum){
 const ledger=await acquireGlobalSpendLedger();
 try{
  const s=ledger.status();
  if(maximum>s.remainingUsd||maximum>s.perProvider.modal.remainingUsd)
   throw new Error('CAMPAIGN_REMAINING_BUDGET_TOO_SMALL');
 }finally{await ledger.close();}
}

export async function runModalBatch(options,{
 fetchImpl=fetch,directory=resolve('.runq-local/modal-quality-v1'),
 preflight=campaignPreflight,wait=ms=>new Promise(r=>setTimeout(r,ms)),
 maxPolls=30,pollIntervalMs=10000,
}={}){
 const config=parseModalBatchOptions([
  ...(options?.live?['--live']:[]),...(options?.ackPaid?['--ack-paid']:[]),
  ...(options?.creditVerified?['--credit-verified']:[]),
  '--count',String(options?.count),'--port',String(options?.port),
 ]);
 if(!Number.isSafeInteger(maxPolls)||maxPolls<1||maxPolls>60)
  throw new TypeError('INVALID_POLL_BOUND');
 const origin='http://127.0.0.1:'+config.port;
 async function local(path,{method='GET',body}={}){
  const response=await fetchImpl(origin+path,{method,
   headers:{Origin:origin,'Content-Type':'application/json'},
   ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(90000)});
  return response;
 }
 const settingsResponse=await local('/api/sfx/status');
 if(!settingsResponse.ok)throw new Error('LOCAL_SFX_STATUS_FAILED');
 const settings=await settingsResponse.json(),cost=settings.estimatedMaxCostUsdPerRequest;
 if(settings.enabled!==true||settings.model!=='stabilityai/stable-audio-3-small-sfx'||
   typeof cost!=='number'||!Number.isFinite(cost)||cost<=0||cost>0.05||
   !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(settings.modelRevision??''))
  throw new Error('SFX_CONFIGURATION_OR_PILOT_COST_CHANGED');
 await preflight(cost*config.count);
 await mkdir(directory,{recursive:true,mode:0o700});
 const lockFile=join(directory,'batch.lock'),lock=await open(lockFile,'wx',0o600);
 const report={version:1,realProviderRequests:true,model:settings.model,
  modelRevision:settings.modelRevision,creditVerification:'OPERATOR_ATTESTED_NOT_PROVIDER_API',
  plannedCases:config.count,submittedThisRun:0,stopReason:'COMPLETE',cases:[]};
 try{
  for(const item of MODAL_PILOT_CASES.slice(0,config.count)){
   const file=join(directory,item.id+'.json');
   let row=await readReceipt(file);
   if(row&&(row.id!==item.id||row.modelRevision!==settings.modelRevision||
     row.inputSha256!==createHash('sha256').update(JSON.stringify(item)).digest('hex')))
    throw new Error('RECEIPT_INPUT_OR_REVISION_CHANGED');
   if(row?.status==='WAV_VERIFIED'){
    const bytes=await readFile(join(directory,item.id+'.wav'));
    if(measurePilotWav(bytes,item.durationSeconds).sha256!==row.metrics?.sha256)
     throw new Error('SAVED_WAV_CHANGED');
    report.cases.push(row);continue;
   }
   const path='/api/sfx/jobs/'+item.id;
   const existingResponse=await local(path);
   if(existingResponse.status!==404&&!existingResponse.ok)throw new Error('LOCAL_JOB_READ_FAILED');
   let job=existingResponse.ok?await existingResponse.json():null;
   if(job&&(job.requestId!==item.id||job.modelRevision!==settings.modelRevision||
     job.prompt!==item.prompt||job.durationSeconds!==item.durationSeconds))
    throw new Error('JOB_ID_OR_INPUT_MISMATCH');
   if(!row){
    row={id:item.id,provider:'modal',model:settings.model,modelRevision:settings.modelRevision,
     category:item.category,language:item.language,difficulty:item.difficulty,
     expected:item.expected,inputSha256:createHash('sha256').update(JSON.stringify(item)).digest('hex'),
     status:'NOT_EXECUTED',actualBilledUsd:null,retries:0,metrics:null,error:null};
    await save(file,row);
   }
   if(!job){
    if(row.status!=='NOT_EXECUTED'){
     row.error='UNCERTAIN_SUBMISSION_NO_RESUBMIT';report.stopReason=row.error;
     await save(file,row);report.cases.push(row);break;
    }
    row.status='SUBMISSION_UNKNOWN';row.startedAt=new Date().toISOString();
    await save(file,row);
    const start=performance.now();
    try{
     const response=await local('/api/sfx/jobs',{method:'POST',body:{
      requestId:item.id,authorizationId:'owner-'+item.id,sourceLineId:null,
      kind:item.kind,prompt:item.prompt,durationSeconds:item.durationSeconds,
      seed:162100+MODAL_PILOT_CASES.indexOf(item),confirmed:true,acknowledgedMaxCostUsd:cost,
     }});
     if(response.status!==202)throw new Error('SUBMISSION_NOT_CONFIRMED');
     job=await response.json();
     if(job.requestId!==item.id)throw new Error('SUBMISSION_ID_MISMATCH');
     report.submittedThisRun++;
     row.submissionMs=Math.round(performance.now()-start);
    }catch{
     row.error='SUBMISSION_UNCERTAIN_CHECK_ORIGINAL_ID';report.stopReason=row.error;
     await save(file,row);report.cases.push(row);break;
    }
   }
   for(let poll=0;poll<maxPolls&&['QUEUED','RUNNING'].includes(job.status);poll++){
    if(poll)await wait(pollIntervalMs);
    const response=await local(path+'/refresh',{method:'POST',body:{}});
    if(!response.ok){row.error='STATUS_OR_DOWNLOAD_FAILED';break;}
    job=await response.json();
    if(job.requestId!==item.id)throw new Error('REFRESH_ID_MISMATCH');
   }
   row.status=job.status;row.providerLatencies=job.latencies??null;
   if(['READY_FOR_REVIEW','ACCEPTED_FOR_MANUAL_IMPORT','REJECTED'].includes(job.status)){
    const response=await local(path+'/audio');
    if(!response.ok)throw new Error('LOCAL_WAV_DOWNLOAD_FAILED');
    const bytes=Buffer.from(await response.arrayBuffer());
    row.metrics=measurePilotWav(bytes,item.durationSeconds);
    if(row.metrics.sha256!==job.wav?.sha256)throw new Error('WAV_HASH_MISMATCH');
    await writeFile(join(directory,item.id+'.wav'),bytes,{mode:0o600});
    row.status='WAV_VERIFIED';row.reviewRequired=true;row.error=null;
    row.completedAt=new Date().toISOString();
   }else{
    row.error??=['FAILED','CANCELLED'].includes(job.status)
     ?'REMOTE_'+job.status:'POLL_BOUND_REACHED_NO_RESUBMISSION';
    report.stopReason=row.error;
   }
   await save(file,row);report.cases.push(row);
   await save(join(directory,'report.json'),report);
   if(row.status!=='WAV_VERIFIED')break;
  }
  const reported=new Set(report.cases.map(c=>c.id));
  for(const item of MODAL_PILOT_CASES.slice(0,config.count)){
   if(!reported.has(item.id))report.cases.push({id:item.id,provider:'modal',
    category:item.category,language:item.language,difficulty:item.difficulty,status:'NOT_EXECUTED'});
  }
  await save(join(directory,'report.json'),report);
  return report;
 }finally{await lock.close();await unlink(lockFile);}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const report=await runModalBatch(parseModalBatchOptions(process.argv.slice(2)));
  console.log(JSON.stringify({provider:'modal',submittedThisRun:report.submittedThisRun,
   verifiedWavs:report.cases.filter(c=>c.status==='WAV_VERIFIED').length,
   stopReason:report.stopReason,report:'.runq-local/modal-quality-v1/report.json',
   artisticReview:'PENDING_HUMAN_LISTENING'}));
  if(report.stopReason!=='COMPLETE')process.exitCode=1;
 }catch(error){
  const reason=/^[A-Z][A-Z0-9_]{1,100}$/.test(error.message??'')
   ?error.message:/^[A-Z][A-Z0-9_]{1,30}$/.test(error.code??'')?error.code:'LOCAL_IO_OR_TRANSPORT_FAILED';
  console.error('MODAL_BATCH_STOPPED: '+reason+'; inspect local receipts; no automatic resubmission.');
  process.exitCode=1;
 }
}
