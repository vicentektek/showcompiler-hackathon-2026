/**
 * Real ASR + agent evaluation on SYNTHETIC speech (Windows System.Speech TTS), NOT human voice.
 * Measures: transcript word error rate (real Muse ASR), then the real agent on the transcript.
 * Default = dry run. Paid run needs --live --ack-paid and uses its own ledger (ASR 4 USD).
 */
import {execFileSync} from 'node:child_process';
import {writeFile,readFile,mkdir,appendFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createAppServer} from './dev-server.mjs';
import {acquireAgentEvalBudget} from './agentLiveBudget.mjs';
import {buildCases,buildSceneProject,judgeCase,judgeProject} from './theatreEvalCases.mjs';
import {SCENES} from '../fixtures/qa/theatre-real/scenes.mjs';
import {buildAgentContext,fitAgentContext,prepareAgentPlan,commitAgentPlan} from '../src/core/agentCore.mjs';

const FNS=['delete-number','move','update-fade','create-multiple','query','negation','transport'];
const SCENE_IDS=['ES-01','ES-03','EN-01','EN-03'];
const RESERVE=0.02;
export const selectVoiceCases=()=>buildCases().filter(c=>FNS.includes(c.fn)&&SCENE_IDS.includes(c.scene));
const norm=s=>String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]+/g,' ').split(/\s+/).filter(Boolean);
export function wordErrorRate(ref,hyp){
 const a=norm(ref),b=norm(hyp),d=Array.from({length:a.length+1},(_,i)=>[i,...Array(b.length).fill(0)]);
 for(let j=1;j<=b.length;j++)d[0][j]=j;
 for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)
  d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
 return a.length?d[a.length][b.length]/a.length:0;
}
function synthesize(text,lang,file,textFile){
 return writeFile(textFile,text,'utf8').then(()=>{
  const voice=lang==='es'?'Microsoft Helena Desktop':'Microsoft Zira Desktop';
  const script=`Add-Type -AssemblyName System.Speech;$s=New-Object System.Speech.Synthesis.SpeechSynthesizer;
$s.SelectVoice('${voice}');$f=New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000,[System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,[System.Speech.AudioFormat.AudioChannel]::Mono);
$s.SetOutputToWaveFile('${file}',$f);$s.Speak([IO.File]::ReadAllText('${textFile}',[Text.Encoding]::UTF8));$s.Dispose()`;
  execFileSync('powershell',['-NoProfile','-Command',script],{stdio:'ignore'});
 });
}

export async function runVoiceEvaluation({live=false,ackPaid=false,outDir='artifacts/theatre50-real-eval'}={}){
 const cases=selectVoiceCases();
 const plan={cases:cases.length,asrCalls:cases.length,agentCalls:cases.length,voice:'SYNTHETIC_TTS_NOT_HUMAN'};
 if(!live)return {dryRun:true,plan};
 if(!ackPaid)throw new TypeError('EXPLICIT_PAID_OPT_IN_REQUIRED');
 if(process.env.CI==='true')throw new TypeError('PAID_TESTS_DISABLED_IN_CI');
 const dir=resolve(outDir);await mkdir(dir,{recursive:true});
 const tmp=resolve('.runq-local/voice-tts');await mkdir(tmp,{recursive:true});
 const server=createAppServer({});
 await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
 const origin='http://127.0.0.1:'+server.address().port;
 const ledger=await acquireAgentEvalBudget({file:'.runq-local/theatre-real-asr.json',limitUsd:4});
 const agentLedger=await acquireAgentEvalBudget({file:'.runq-local/theatre-real-meta.json',limitUsd:13});
 const rows=[];
 try{
  for(const c of cases){
   const wav=resolve(tmp,c.id+'.wav');
   await synthesize(c.prompt,c.language,wav,resolve(tmp,c.id+'.txt'));
   const audio=await readFile(wav);
   const row={id:c.id,fn:c.fn,language:c.language,prompt:c.prompt,transcript:'',wer:null,asrStatus:0,asrLatencyMs:null,
    httpStatus:0,status:'',operations:[],metrics:null,agentLatencyMs:null,voice:'SYNTHETIC_TTS_NOT_HUMAN',simulated:false};
   if(await ledger.reserveCase(RESERVE,'voice.asr.'+c.id)!=='RESERVED'){row.skipped='ASR_BUDGET_OR_DUPLICATE';rows.push(row);continue;}
   let t=performance.now();
   try{
    const r=await fetch(origin+'/api/voice/transcribe',{method:'POST',headers:{Origin:origin,'Content-Type':'audio/wav',
     'X-RunQ-Voice-Consent':'yes','X-RunQ-Voice-Language':c.language},body:audio});
    row.asrStatus=r.status;const data=await r.json().catch(()=>({}));
    row.transcript=data.transcript??'';row.asrError=data.error??'';
   }catch(e){row.asrError='NETWORK';}
   row.asrLatencyMs=Math.round(performance.now()-t);
   row.wer=row.transcript?+wordErrorRate(c.prompt,row.transcript).toFixed(3):null;
   if(row.transcript&&await agentLedger.reserveCase(RESERVE,'voice.agent.'+c.id)==='RESERVED'){
    const project=buildSceneProject(SCENES.find(s=>s.id===c.scene));
    const context=fitAgentContext(buildAgentContext(project,{assetAvailable:()=>true}));
    t=performance.now();
    const r=await fetch(origin+'/api/agent/interpret',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Runq-Agent-Consent':'yes'},
     body:JSON.stringify({prompt:row.transcript,language:c.language,context,provider:'meta',conversation:c.conversation})});
    row.agentLatencyMs=Math.round(performance.now()-t);row.httpStatus=r.status;
    const p=await r.json().catch(()=>({}));
    Object.assign(row,{status:p.status??'',operations:p.operations??[],message:p.message??''});
    let final=project,applyError='';
    if(r.status===200&&p.status==='PLAN'&&p.operations?.length){
     try{final=commitAgentPlan(project,prepareAgentPlan(project,p.operations),{editable:true}).project;}catch(e){applyError=e?.code??'APPLY_FAILED';}
    }
    const m=judgeCase(c,project,{httpStatus:r.status,...p});
    const pf=r.status===200?(applyError||judgeProject(project,final,c.expect)):'NO_VALID_RESPONSE';
    m.modification=pf===null?true:false;row.metrics=m;
   }
   rows.push(row);
   await appendFile(resolve(dir,'raw-voice1.jsonl'),JSON.stringify(row)+'\n');
   await rm(wav,{force:true});
  }
 }finally{
  await new Promise(done=>server.close(done));await ledger.close();await agentLedger.close();
 }
 return {dryRun:false,plan,rows};
}

const invoked=process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href;
if(invoked){
 const result=await runVoiceEvaluation({live:process.argv.includes('--live'),ackPaid:process.argv.includes('--ack-paid')});
 if(result.dryRun)console.log(JSON.stringify(result.plan));
 else{
  const ok=result.rows.filter(r=>r.transcript);
  const wers=ok.map(r=>r.wer).sort((a,b)=>a-b);
  const out={cases:result.rows.length,transcribed:ok.length,meanWer:+(wers.reduce((a,b)=>a+b,0)/Math.max(1,wers.length)).toFixed(3),
   medianWer:wers[Math.floor(wers.length/2)],exactTranscripts:ok.filter(r=>r.wer===0).length,
   interpretation:ok.filter(r=>r.metrics?.interpretation).length,modification:ok.filter(r=>r.metrics?.modification).length,
   unauthorized:ok.filter(r=>r.metrics?.unauthorized).length,note:'Synthetic TTS speech, not human voice'};
  await writeFile(resolve('artifacts/theatre50-real-eval/summary-voice1.json'),JSON.stringify(out,null,1));
  console.log(JSON.stringify(out,null,1));
 }
}
