/**
 * One explicitly authorized Meta Muse realtime session per local RunQ server.
 * Browser sends 16 kHz PCM16 over bounded POSTs; only this server holds the key.
 * Events are polled over the local loopback HTTP connection. No player or GO access.
 */
import {randomUUID} from 'node:crypto';
import {isCampaignProviderProhibited} from '../src/qa/campaignPolicy.mjs';

const ENDPOINT='wss://api.meta.ai/v1/asr/realtime';
const MAX_SESSION_MS=180_000;
const MAX_AUDIO_BYTES=16_000*2*185;
const CHUNK_LIMIT=16_000;
const POLL_LIMIT=40;
const LANGUAGES=Object.freeze({es:['Spanish'],en:['English'],mixed:['Spanish','English']});
const json=(res,headers,status,data)=>{
 res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8'});
 res.end(JSON.stringify(data));
};
async function body(req,limit=4096){
 let size=0;const parts=[];
 for await(const part of req){size+=part.length;if(size>limit)throw Error('TOO_LARGE');parts.push(part);}
 return Buffer.concat(parts);
}
function externalEvent(data){
 if(!data||typeof data!=='object')return null;
 const type=data.type;
 if(!['transcript','speechComplete','speechStart','speechEnd','speaker','audioProgress','error'].includes(type))return null;
 const event={type};
 if(typeof data.transcript==='string')event.transcript=data.transcript.slice(0,3000);
 if(typeof data.final==='boolean')event.final=data.final;
 if(Number.isInteger(data.turnId)&&data.turnId>=0)event.turnId=data.turnId;
 if(Number.isFinite(data.audioProcessedMs)&&data.audioProcessedMs>=0)event.audioProcessedMs=data.audioProcessedMs;
 if(type==='speaker'&&typeof data.label==='string')event.label=data.label.slice(0,24);
 if(type==='error')event.message='META_STREAM_ERROR';
 return event;
}
export function makeVoiceLiveRoute({getKey=()=>process.env.MODEL_API_KEY,WebSocketCtor=globalThis.WebSocket,clock=()=>Date.now(),
 campaignProhibited=isCampaignProviderProhibited('voice')}={}){
 let session=null;
 const close=(s,reason='stopped')=>{
  if(!s||s.closed)return;
  s.closed=true;s.state='stopped';clearTimeout(s.deadline);
  s.events.push({type:'sessionEnd',reason});
  if(s.events.length>60)s.events.splice(0,s.events.length-60);
  if(s.socket?.readyState===0||s.socket?.readyState===1){
   try{s.socket.close(1000,'RunQ session finished');}catch{}
  }
 };
 const belongs=(req,s)=>Boolean(s&&req.headers['x-runq-voice-session']===s.token);
 const authorizedOrigin=req=>{
  const origin=req.headers.origin;
  if(!origin)return true;
  try{const url=new URL(origin);return url.protocol==='http:'&&url.hostname==='127.0.0.1'&&url.host===req.headers.host;}
  catch{return false;}
 };
 return async(req,res,pathname,headers)=>{
  if(!pathname.startsWith('/api/voice/live/'))return false;
  if(!authorizedOrigin(req)){json(res,headers,403,{error:'ORIGIN_REJECTED'});return true;}
  const action=pathname.slice('/api/voice/live/'.length);
  if(action==='start'){
   if(req.method!=='POST'){json(res,headers,405,{error:'POST_REQUIRED'});return true;}
   if(req.headers['x-runq-voice-consent']!=='yes'){json(res,headers,403,{error:'EXPLICIT_CONSENT_REQUIRED'});return true;}
   if(session&&!session.closed&&session.state!=='stopped'){
    json(res,headers,409,{error:'SESSION_ALREADY_ACTIVE'});return true;
   }
   let data;
   try{data=JSON.parse((await body(req)).toString('utf8'));}catch{json(res,headers,400,{error:'INVALID_REQUEST'});return true;}
   const language=data?.language;
   if(!Object.hasOwn(LANGUAGES,language)){json(res,headers,400,{error:'INVALID_LANGUAGE'});return true;}
   if(campaignProhibited){json(res,headers,403,{error:'VOICE_CAMPAIGN_PROHIBITED'});return true;}
   const key=getKey();
   if(typeof key!=='string'||!key.trim()){json(res,headers,503,{error:'MODEL_API_KEY_NOT_CONFIGURED'});return true;}
   if(typeof WebSocketCtor!=='function'){json(res,headers,503,{error:'NODE_WEBSOCKET_UNAVAILABLE'});return true;}
   // Bias proper names only; never put complete scripts or secrets in the provider hint.
   const keywords=Array.isArray(data.keywords)
     ?[...new Set(data.keywords.filter(x=>typeof x==='string'&&x.length>=2&&x.length<=48&&/^[\p{L}\p{N} .'-]+$/u.test(x)))].slice(0,12)
     :[];
   const s={token:randomUUID(),state:'connecting',closed:false,socket:null,
     events:[],sentBytes:0,started:clock(),deadline:null};
   session=s;
   try{
    const ws=new WebSocketCtor(ENDPOINT);
    s.socket=ws;
    const ready=await new Promise((resolve,reject)=>{
     const limit=setTimeout(()=>reject(Error('UPSTREAM_TIMEOUT')),15000);
     const fail=()=>{clearTimeout(limit);reject(Error('UPSTREAM_CONNECT_ERROR'));};
     ws.addEventListener('error',fail,{once:true});
     ws.addEventListener('close',fail,{once:true});
     ws.addEventListener('open',()=>{
      ws.send(JSON.stringify({
       authorization:{accessToken:'Bearer '+key.trim()},
       model:'muse-voice-transcribe-1.0',audioEncoding:'PCM_16KHZ',
       mode:'ENDPOINTING',partialMode:'CUMULATIVE',
       languageBias:LANGUAGES[language],...(keywords.length?{keywords}:{}),
      }));
     },{once:true});
     ws.addEventListener('message',e=>{
      let incoming;try{incoming=JSON.parse(String(e.data));}catch{return;}
      if(incoming?.sessionId&&!incoming?.type){
       clearTimeout(limit);resolve(incoming);return;
      }
      const event=externalEvent(incoming);
      if(event){s.events.push(event);if(s.events.length>60)s.events.splice(0,s.events.length-60);}
      if(event?.type==='error')close(s,'provider_error');
     });
    });
    s.state='listening';
    s.events.push({type:'sessionStart'});
    ws.addEventListener('close',()=>close(s,'provider_closed'));
    s.deadline=setTimeout(()=>close(s,'time_limit'),MAX_SESSION_MS);
    json(res,headers,200,{session:s.token,language,maximumSeconds:180});
   }catch(error){
    close(s,'connection_failed');
    json(res,headers,502,{error:'MUSE_REALTIME_UNAVAILABLE'});
   }
   return true;
  }
  if(!belongs(req,session)){json(res,headers,404,{error:'VOICE_SESSION_NOT_FOUND'});return true;}
  const s=session;
  if(action==='chunk'){
   if(req.method!=='POST'){json(res,headers,405,{error:'POST_REQUIRED'});return true;}
   if(s.state!=='listening'||s.closed){json(res,headers,409,{error:'VOICE_SESSION_NOT_LISTENING'});return true;}
   if(req.headers['content-type']!=='application/octet-stream'){json(res,headers,415,{error:'PCM16_REQUIRED'});return true;}
   try{
    const bytes=await body(req,CHUNK_LIMIT);
    if(!bytes.length||bytes.length%2){json(res,headers,400,{error:'INVALID_PCM_FRAME'});return true;}
    if(s.sentBytes+bytes.length>MAX_AUDIO_BYTES||clock()-s.started>MAX_SESSION_MS){
     close(s,'time_limit');json(res,headers,409,{error:'SESSION_LIMIT_REACHED'});return true;
    }
    if(s.socket.readyState!==1){close(s,'provider_closed');json(res,headers,502,{error:'UPSTREAM_CLOSED'});return true;}
    if(s.socket.bufferedAmount>64_000){close(s,'provider_backpressure');json(res,headers,429,{error:'UPSTREAM_TOO_SLOW'});return true;}
    s.socket.send(bytes);
    s.sentBytes+=bytes.length;
    json(res,headers,200,{ok:true});
   }catch{close(s,'bad_frame');json(res,headers,413,{error:'FRAME_LIMIT'});}
   return true;
  }
  if(action==='poll'){
   if(req.method!=='GET'){json(res,headers,405,{error:'GET_REQUIRED'});return true;}
   const events=s.events.splice(0,POLL_LIMIT);
   json(res,headers,200,{state:s.state,events,audioSeconds:Math.floor(s.sentBytes/32000)});
   return true;
  }
  if(action==='stop'){
   if(req.method!=='POST'){json(res,headers,405,{error:'POST_REQUIRED'});return true;}
   if(!s.closed&&s.state==='listening'){
    s.state='finishing';
    try{s.socket.send(JSON.stringify({type:'endStream'}));}
    catch{close(s,'transport_error');}
    // Drain pending final events; the service closes normally, bounded by 8 s.
    clearTimeout(s.deadline);s.deadline=setTimeout(()=>close(s,'drain_timeout'),8000);
   }
   json(res,headers,200,{ok:true,state:s.state});
   return true;
  }
  json(res,headers,404,{error:'UNKNOWN_VOICE_ACTION'});return true;
 };
}
