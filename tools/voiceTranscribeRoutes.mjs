import { randomUUID } from 'node:crypto';

const MAX_BYTES=2_200_000;
const MAX_DURATION=10.5;
const UPSTREAM='https://api.meta.ai/v1/asr/transcribe';
const languageNames={es:'Spanish',en:'English'};

function respond(response,headers,status,body){
 response.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8'});
 response.end(JSON.stringify(body));
}
export function convertToMuseWav(bytes){
 const data=Buffer.from(bytes);
 if(data.length<44||data.toString('ascii',0,4)!=='RIFF'||data.toString('ascii',8,12)!=='WAVE')throw new TypeError('INVALID_WAV');
 let position=12,fmt=null,payload=null;
 while(position+8<=data.length){
  const size=data.readUInt32LE(position+4),start=position+8;
  if(start+size>data.length)throw new TypeError('INVALID_WAV');
  const tag=data.toString('ascii',position,position+4);
  if(tag==='fmt '){
   if(size<16)throw new TypeError('INVALID_WAV');
   fmt={format:data.readUInt16LE(start),channels:data.readUInt16LE(start+2),
      rate:data.readUInt32LE(start+4),bits:data.readUInt16LE(start+14)};
  }
  if(tag==='data')payload=data.subarray(start,start+size);
  position=start+size+(size%2);
 }
 if(!fmt||!payload||fmt.format!==1||fmt.channels!==1||fmt.bits!==16||
    fmt.rate<8000||fmt.rate>96000||payload.length%2)throw new TypeError('UNSUPPORTED_WAV');
 const count=payload.length/2,seconds=count/fmt.rate;
 if(seconds<0.2||seconds>MAX_DURATION)throw new TypeError('INVALID_DURATION');
 const rate=16000,n=Math.ceil(seconds*rate);
 const wav=Buffer.allocUnsafe(44+n*2);
 wav.write('RIFF',0);wav.writeUInt32LE(36+n*2,4);wav.write('WAVEfmt ',8);
 wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);
 wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);
 wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(n*2,40);
 for(let i=0;i<n;i++){
  const offset=i*fmt.rate/rate,lo=Math.floor(offset),hi=Math.min(count-1,lo+1),part=offset-lo;
  const value=Math.round(payload.readInt16LE(lo*2)*(1-part)+payload.readInt16LE(hi*2)*part);
  wav.writeInt16LE(Math.max(-32768,Math.min(32767,value)),44+i*2);
 }
 return wav;
}
async function readBounded(request){
 const chunks=[];let length=0;
 for await(const part of request){
  length+=part.length;if(length>MAX_BYTES)throw new TypeError('TOO_LARGE');
  chunks.push(part);
 }
 return Buffer.concat(chunks);
}
/** Explicit, single-request, fail-closed Muse transcription. No auto retry. */
export function makeVoiceTranscribeRoute({getKey=()=>process.env.MODEL_API_KEY,fetchImpl=fetch}={}){
 let active=false;
 return async(request,response,pathname,headers)=>{
  if(pathname!=='/api/voice/transcribe')return false;
  if(request.method!=='POST'){respond(response,headers,405,{error:'METHOD_NOT_ALLOWED'});return true;}
  if(request.headers['x-runq-voice-consent']!=='yes'){
   respond(response,headers,403,{error:'EXPLICIT_CONSENT_REQUIRED'});return true;
  }
  const lang=request.headers['x-runq-voice-language'];
  if(!Object.hasOwn(languageNames,lang)){respond(response,headers,400,{error:'INVALID_LANGUAGE'});return true;}
  if(request.headers['content-type']!=='audio/wav'){
   respond(response,headers,415,{error:'WAV_REQUIRED'});return true;
  }
  if(Number(request.headers['content-length'])>MAX_BYTES){
   respond(response,headers,413,{error:'TOO_LARGE'});return true;
  }
  const key=getKey();
  if(typeof key!=='string'||!key.trim()){
   respond(response,headers,503,{error:'MODEL_API_KEY_NOT_CONFIGURED'});return true;
  }
  if(active){respond(response,headers,429,{error:'VOICE_REQUEST_ALREADY_RUNNING'});return true;}
  active=true;
  try{
   const bytes=await readBounded(request);
   const wav=convertToMuseWav(bytes);
   const form=new FormData();
   form.append('request',new Blob([JSON.stringify({
     model:'muse-voice-transcribe-1.0',audioEncoding:'WAV',
     mode:'PUSH_TO_TALK',languageBias:[languageNames[lang]],
   })],{type:'application/json'}));
   form.append('audio',new Blob([wav],{type:'audio/wav'}),'speech.wav');
   const controller=new AbortController();
   const timeout=setTimeout(()=>controller.abort(),20000);
   let result;
   try{
    result=await fetchImpl(UPSTREAM,{method:'POST',headers:{
     Authorization:'Bearer '+key.trim(),Accept:'application/json'
    },body:form,signal:controller.signal});
   }finally{clearTimeout(timeout);}
   if(!result.ok){respond(response,headers,502,{error:'META_TRANSCRIPTION_FAILED',upstreamStatus:result.status});return true;}
   const data=await result.json();
   if(typeof data?.transcript!=='string'){
    respond(response,headers,502,{error:'INVALID_META_RESPONSE'});return true;
   }
   respond(response,headers,200,{
    transcript:data.transcript.slice(0,5000),language:lang,
    sessionId:typeof data.sessionId==='string'?data.sessionId.slice(0,128):null,
    audioDurationMs:Number.isFinite(data.audioDurationMs)?data.audioDurationMs:null,
   });
  }catch(error){
   const code=error?.message;
   const validation=['INVALID_WAV','UNSUPPORTED_WAV','INVALID_DURATION','TOO_LARGE'].includes(code);
   respond(response,headers,validation?400:502,{error:validation?code:'TRANSCRIPTION_UNAVAILABLE'});
  }finally{active=false;}
  return true;
 };
}
