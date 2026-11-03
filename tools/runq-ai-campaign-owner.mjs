/**
 * RUNQ real-provider evaluation campaign, operator-started, unattended thereafter.
 * Place in tools/runq-ai-campaign-owner.mjs and run from repository root.
 * Uses ONLY local RUNQ server HTTP APIs; does not read keys or invoke external APIs itself.
 * No implicit retries on uncertain submissions. Persistent request IDs and receipts.
 * It cannot replace perceptual/human assessment of generated audio.
 *
 * Usage:
 * node tools/runq-ai-campaign-owner.mjs --origin http://127.0.0.1:5191 --meta 400 --modal 100
 * node tools/runq-ai-campaign-owner.mjs --status
 * node tools/runq-ai-campaign-owner.mjs --meta 400 --modal 100 --continuous
 * node tools/runq-ai-campaign-owner.mjs --origin http://127.0.0.1:5191 --meta 400 --modal 100 --resume
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
import {createNewShow} from '../src/core/workspace.mjs';
import {serializeShowProject} from '../src/core/projectPersistence.mjs';

const argv=process.argv.slice(2);
const flag=(name)=>argv.includes('--'+name);
function argument(name, fallback){const i=argv.indexOf('--'+name);return i<0?fallback:argv[i+1];}
function count(name, fallback){const n=Number(argument(name,fallback));if(!Number.isSafeInteger(n)||n<0||n>1000)throw Error('Invalid --'+name);return n;}
const ORIGIN=argument('origin','http://127.0.0.1:5191').replace(/\/$/,'');
if(!/^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(ORIGIN))throw Error('Only a local RUNQ server is supported');
const META=count('meta',400), MODAL=count('modal',100);
const campaignId=argument('id','runq-ai-real-campaign-20261031');
if(!/^[a-z0-9-]{8,70}$/i.test(campaignId))throw Error('Invalid campaign ID');
const root=path.resolve('.runq-local',campaignId);
const stateFile=path.join(root,'state.json');
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const kinds=['door','footsteps','storm','metal','glass','forest','train','crowd','clock','water','cloth','wind','engine','bell','fire','bird','machine','paper','stairs','thunder'];
const sfxPrompts=[
 'An old oak door creaks open and closes, no music or voices.',
 'Footsteps with leather shoes on a wooden stage, no speech.',
 'A thunderstorm outside a small theater, rain and distant thunder.',
 'Two metal latches click sharply, clean isolated sound.',
 'A wine glass tips over and shatters on a hard floor.',
 'Night forest ambience with gentle insects and distant owl.',
 'A passing train approaches, rattles past and fades away.',
 'Small theater crowd settling into seats, no intelligible words.',
 'Antique grandfather clock chimes once then mechanical ticking.',
 'Water poured slowly into a metal bucket in a quiet room.',
 'Heavy velvet curtain sliding on a theater rail.',
 'Strong wind rattling a wooden window from outside.',
 'Old diesel engine struggling to start, then running evenly.',
 'Distant church bell ringing three times outdoors.',
 'Small wood fire crackling in a stone fireplace.',
 'Single bird chirping in a quiet garden at sunrise.',
 'An old industrial machine cycling three times then stopping.',
 'Large paper map unfolding, crinkling and being folded again.',
 'Footsteps running upstairs, slowing and stopping at a landing.',
 'Sudden thunder crack followed by slowly fading low rumble.'
];
const scripts=[
  ['en','SCENE {scene}\n(A wooden door creaks open. No music.)\nALEX: We are ready.\nSAM: Stop the recording.\n(The door shuts.)'],
  ['es','ESCENA {scene}\n(Se abre una puerta antigua. Sin música.)\nANA: Estamos preparados.\nLUIS: Detén la grabación.\n(La puerta se cierra.)'],
  ['en','SCENE {scene}\n(A distant bell rings three times.)\nLEE: Did you hear that?\nPAT: No, not the sound cue.\n(The lights go out.)'],
  ['es','ESCENA {scene}\n(Se oyen pasos acelerados fuera de escena.)\nMARTA: Espera, repite la frase.\nDIEGO: Ahora sí.\n(Silencio.)'],
  ['en','SCENE {scene}\n(Rain begins, grows stronger and then fades.)\nA: Not yet.\nB: Now, open the gate.\n(Short metallic bang.)'],
  ['es','ESCENA {scene}\n(Suena un teléfono, nadie contesta.)\nELENA: No debe sonar otra vez.\nPABLO: ¿Por qué?\n(Vuelve a sonar.)'],
  ['en','SCENE {scene}\n(A train passes in the distance.)\nMAY: This is a rehearsal, please go back.\nJON: Start again from my line.\n(The train fades.)'],
  ['es','ESCENA {scene}\n(Truenos lejanos; la tormenta se acerca.)\nLUCÍA: No lances todavía el trueno.\nERIC: Cuando diga ahora.\nLUCÍA: Ahora.'],
  ['en','SCENE {scene}\n(Three short knocks. Silence. Two more knocks.)\nACTOR: What was that?\nACTOR 2: A sound we should not play twice.'],
  ['es','ESCENA {scene}\n(Puerta a la izquierda, pasos a la derecha.)\nCARLA: Abre la puerta.\nJOAN: Espera, primero los pasos.\n(Se oyen pasos.)']
];
function makeMetaCase(i){
  const [lang,template]=scripts[i%scripts.length];const level=['basic','intermediate','advanced','extreme'][Math.floor((i%20)/5)];
  const text=template.replaceAll('{scene}',String(1+Math.floor(i/10)))+'\n'+(i%4===0?'(End of scene.)':'');
  const project=JSON.parse(serializeShowProject(createNewShow({name:`RUNQ Real Eval ${i+1} ${level}`,scriptText:text})));
  return {project,scriptLanguage:lang,designMode:i%3===0?'literal':'balanced'};
}
function makeModalCase(i){
  const prompt=sfxPrompts[i%sfxPrompts.length];
  return {requestId:`${campaignId}-modal-${String(i+1).padStart(4,'0')}`,authorizationId:`${campaignId}-operator-approved`,sourceLineId:'L2',kind:'SFX',prompt:prompt+(i%5===4?' Close microphone perspective and dry recording.':''),durationSeconds:[4,6,8,5,7][i%5],seed:42000+i,confirmed:true,acknowledgedMaxCostUsd:0.05};
}
function atomicSave(s){const file=stateFile+'.tmp';fs.writeFileSync(file,JSON.stringify(s,null,2));fs.renameSync(file,stateFile);}
function load(){return JSON.parse(fs.readFileSync(stateFile,'utf8'));}
function persist(s){s.updatedAt=new Date().toISOString();atomicSave(s);}
function status(s){
  for(const p of ['meta','modal']){const a=s[p];const o={};for(const r of a){o[r.status]=(o[r.status]??0)+1;}console.log(p,JSON.stringify(o));}
  console.log(`Campaign ${s.id} | ${s.meta.length} Meta, ${s.modal.length} Modal | ${s.updatedAt}`);
}
async function request(method,route,body,timeout=120000){
  const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),timeout);
  try{const r=await fetch(ORIGIN+route,{method,headers:{'Content-Type':'application/json',Origin:ORIGIN},body:body?JSON.stringify(body):undefined,signal:ctrl.signal});const text=await r.text();let data;try{data=JSON.parse(text);}catch{data={invalidJson:true,responsePrefix:text.slice(0,100)};}return {http:r.status,data};}
  finally{clearTimeout(timer);}
}
async function pollModal(s,r){
  if(!['SUBMITTED','QUEUED','RUNNING','PENDING','UNKNOWN'].includes(r.status))return;
  // Safe read-only GET. Never submit the same job again.
  try{const a=await request('GET','/api/sfx/jobs/'+encodeURIComponent(r.requestId),null,20000);r.http=a.http;r.providerStatus=a.data.status??null;
    if(a.http===200){if(a.data.status==='READY_FOR_REVIEW'){r.status='VERIFIED_WAV';r.wav={sha256:a.data.wav?.sha256??null,bytes:a.data.wav?.bytes??null};r.latencies=a.data.latencies??null;}
      else if(['FAILED','CANCELLED','REJECTED'].includes(a.data.status))r.status='FAILED';
      else r.status='QUEUED';}
    else r.status='UNKNOWN';
  }catch(e){r.status='UNKNOWN';r.error='GET_STATE_UNKNOWN';}
  persist(s);
}
async function run(){
  if(flag('status')){if(!fs.existsSync(stateFile))throw Error('No local campaign state');status(load());return;}
  if(!fs.existsSync(root))fs.mkdirSync(root,{recursive:true});
  let s;
  if(fs.existsSync(stateFile)){if(!flag('resume'))throw Error('Existing campaign found; use --status or --resume; never reset history');s=load();if(s.meta.length!==META||s.modal.length!==MODAL)throw Error('Counts differ from persisted campaign');}
  else {if(flag('resume'))throw Error('No existing campaign to resume');s={id:campaignId,origin:ORIGIN,createdAt:new Date().toISOString(),meta:Array.from({length:META},(_,i)=>({index:i+1,status:'NEW'})),modal:Array.from({length:MODAL},(_,i)=>({index:i+1,requestId:makeModalCase(i).requestId,status:'NEW'}))};persist(s);}
  if(s.origin!==ORIGIN)throw Error('Origin differs from persisted campaign');
  status(s);
  // Pilot gate: a single Meta and Modal response must be accepted before larger batch.
  const maxMetaBatch=count('meta-batch',20), maxModalBatch=count('modal-batch',5);
  let metaSent=0,modalSent=0;
  for(const r of s.meta){if(metaSent>=maxMetaBatch)break;if(r.status!=='NEW')continue;
    r.status='SUBMISSION_UNKNOWN';r.startedAt=new Date().toISOString();persist(s);
    try{const a=await request('POST','/api/meta/proposals',makeMetaCase(r.index-1));r.http=a.http;r.requestId=a.data.requestId??a.data.diagnostic?.requestId??null;
      r.proposalCount=Array.isArray(a.data.proposals)?a.data.proposals.length:null;
      r.status=a.http===200?'RESPONSE_RECEIVED':a.http>=400&&a.http<500?'REJECTED':'UNKNOWN';r.errorCode=a.data.code??null;
      // Store aggregate only; no raw private script/model text or secrets.
    }catch(e){r.status='SUBMISSION_UNKNOWN';r.error='NETWORK_OR_TIMEOUT_UNCERTAIN';}
    metaSent++;persist(s);console.log('Meta',r.index,r.status,r.http??'');await sleep(350);
    if(['UNKNOWN','SUBMISSION_UNKNOWN'].includes(r.status)){console.log('Stopped: unknown Meta outcome, needs reconciliation');break;}
  }
  for(const r of s.modal){if(modalSent>=maxModalBatch)break;if(r.status!=='NEW')continue;
    const body=makeModalCase(r.index-1);r.status='SUBMISSION_UNKNOWN';r.startedAt=new Date().toISOString();persist(s);
    try{const a=await request('POST','/api/sfx/jobs',body);r.http=a.http;r.errorCode=a.data.code??null;
      r.status=a.http===202?'SUBMITTED':a.http>=400&&a.http<500?'REJECTED':'UNKNOWN';
    }catch(e){r.status='SUBMISSION_UNKNOWN';r.error='NETWORK_OR_TIMEOUT_UNCERTAIN';}
    modalSent++;persist(s);console.log('Modal',r.index,r.status,r.http??'');await sleep(350);
    if(['UNKNOWN','SUBMISSION_UNKNOWN'].includes(r.status)){console.log('Stopped: unknown Modal outcome, needs reconciliation');break;}
  }
  // Poll the recorded jobs, never resubmit them.
  for(let round=0;round<40;round++){
    const outstanding=s.modal.filter(x=>['SUBMITTED','QUEUED','RUNNING','PENDING'].includes(x.status));
    if(!outstanding.length)break;
    for(const r of outstanding)await pollModal(s,r);
    if(s.modal.some(x=>x.status==='UNKNOWN'))break;
    await sleep(3000);
  }
  status(s);console.log('Safe checkpoint. No automatic retries on uncertain submissions.');
  if(flag('continuous')){
    const blocked=s.meta.some(x=>['UNKNOWN','SUBMISSION_UNKNOWN'].includes(x.status))||s.modal.some(x=>['UNKNOWN','SUBMISSION_UNKNOWN'].includes(x.status));
    const inProgress=s.modal.some(x=>['SUBMITTED','QUEUED','RUNNING','PENDING'].includes(x.status));
    const remaining=s.meta.some(x=>x.status==='NEW')||s.modal.some(x=>x.status==='NEW');
    if(blocked||inProgress){console.log('Campaign paused: reconcile unknown submission or queued Modal job with read-only GET before resuming.');return;}
    if(remaining){if(!flag('resume'))argv.push('--resume');await sleep(1500);return run();}
    console.log('Campaign queue complete. Artistic listening and objective scoring still require a separate evaluation.');
  }else console.log('Use --resume to run the next batch, or --continuous for autonomous batches.');
}
run().catch(e=>{console.error(e.message);process.exitCode=1;});
