/**
 * Optional local OBS Studio recording control over obs-websocket v5 (OBS 28+).
 * Zero cloud requests. Does not change scene/audio mixer or OBS credentials.
 * Authentication password is read only from RUNQ_OBS_PASSWORD environment.
 * Never touches an OBS recording that the director did not explicitly start.
 */
import {createHash,randomUUID} from 'node:crypto';

function digest64(s){return createHash('sha256').update(s).digest('base64');}
export function obsAuthentication(password,salt,challenge){
  if(!password||typeof password!=='string')throw Error('OBS_PASSWORD_REQUIRED');
  if(!salt||!challenge)throw Error('OBS_CHALLENGE_INVALID');
  return digest64(digest64(password+salt)+challenge);
}
export async function connectObs({url='ws://127.0.0.1:4455',
  password=process.env.RUNQ_OBS_PASSWORD,timeoutMs=10000}={}){
  if(!/^ws:\/\/(?:127\.0\.0\.1|localhost):\d{1,5}\/?$/.test(url))
    throw Error('OBS_MUST_BE_LOCAL_LOOPBACK');
  if(typeof WebSocket!=='function')throw Error('OBS_REQUIRES_NODE22_WEBSOCKET');
  const ws=new WebSocket(url);
  const pending=new Map();
  let ready=false,closed=false,ownedRecording=false;
  let setupResolve,setupReject;
  const conn=new Promise((resolve,reject)=>{setupResolve=resolve;setupReject=reject;});
  const initTimer=setTimeout(()=>setupReject(Error('OBS_CONNECT_TIMEOUT')),timeoutMs);
  function cleanup(error){
    if(closed)return;
    closed=true;ready=false;
    for(const {reject,timer} of pending.values()){clearTimeout(timer);reject(error);}
    pending.clear();
    if(error)setupReject(error);
  }
  ws.addEventListener('error',()=>cleanup(Error('OBS_WEBSOCKET_ERROR')));
  ws.addEventListener('close',()=>cleanup(Error('OBS_WEBSOCKET_CLOSED')));
  ws.addEventListener('message',event=>{
    let msg;
    try{msg=JSON.parse(String(event.data));}
    catch{return;}
    if(msg.op===0){  // Hello, protocol v5
      const auth=msg.d?.authentication;
      let authentication;
      try{authentication=auth?obsAuthentication(password,auth.salt,auth.challenge):undefined;}
      catch(e){clearTimeout(initTimer);cleanup(e);ws.close();return;}
      const d={rpcVersion:1,...(authentication?{authentication}:{})};
      ws.send(JSON.stringify({op:1,d}));
    }
    if(msg.op===2){
      ready=true;clearTimeout(initTimer);setupResolve();
    }
    if(msg.op===7){
      const id=msg.d?.requestId;
      const p=pending.get(id);
      if(!p)return;
      clearTimeout(p.timer);pending.delete(id);
      if(msg.d?.requestStatus?.result===true)
        p.resolve(msg.d?.responseData||{});
      else p.reject(Error('OBS_'+(msg.d?.requestStatus?.code??'ERROR')+
        ': '+String(msg.d?.requestStatus?.comment??'unknown').slice(0,200)));
    }
  });
  async function request(requestType,requestData={}){
    if(!ready||closed)throw Error('OBS_NOT_CONNECTED');
    const requestId=randomUUID();
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{pending.delete(requestId);reject(Error('OBS_REQUEST_TIMEOUT: '+requestType));},
        timeoutMs);
      pending.set(requestId,{resolve,reject,timer});
      ws.send(JSON.stringify({op:6,d:{requestType,requestId,requestData}}));
    });
  }
  async function beginRecording(){
    const current=await request('GetRecordStatus');
    if(current.outputActive)throw Error('OBS_ALREADY_RECORDING_DO_NOT_INTERRUPT');
    if(ownedRecording)throw Error('OBS_ALREADY_STARTED_BY_RUNQ');
    await request('StartRecord');
    ownedRecording=true;
  }
  async function stopRecording(){
    if(!ownedRecording)return null;
    ownedRecording=false;
    const result=await request('StopRecord');
    return result.outputPath??null;
  }
  async function close(){
    // Never stop an existing recording that we did not start; do stop our own.
    let path=null;
    if(ownedRecording){try{path=await stopRecording();}catch(error){
      process.stderr.write('[RUNQ OBS] Could not stop our recording: '+error.message+'\n');
    }}
    try{ws.close();}catch{}
    return path;
  }
  try{await conn;}catch(e){clearTimeout(initTimer);try{ws.close();}catch{}throw e;}
  return {request,beginRecording,stopRecording,close};
}
