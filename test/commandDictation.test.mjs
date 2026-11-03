import test,{beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {createCommandDictation} from '../src/ui/command-dictation.mjs';
import {convertToMuseWav} from '../tools/voiceTranscribeRoutes.mjs';

let descriptors,processor,key,transcripts,statuses,calls,stops,controllers,media;
class CaptureContext{
 constructor(){this.state='running';this.sampleRate=16000;this.destination={};}
 async resume(){}
 async close(){this.state='closed';}
 createMediaStreamSource(){return {connect(){},disconnect(){}};}
 createGain(){return {gain:{value:1},connect(){},disconnect(){}};}
 createScriptProcessor(){processor={connect(){},disconnect(){}};return processor;}
}
const stream=()=>({getTracks:()=>[{stop(){stops++;}}]});
function controller(){
 const result=createCommandDictation({owner:'test-command',contextKey:()=>key,
  onTranscript:text=>transcripts.push(text),onStatus:code=>statuses.push(code),onChange:()=>{}});
 controllers.push(result);return result;
}
const speak=(length=4000)=>processor.onaudioprocess({
 inputBuffer:{getChannelData:()=>new Float32Array(length).fill(.1)},
});
beforeEach(()=>{
 descriptors=new Map(['document','navigator','window','fetch'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 key='project-1';transcripts=[];statuses=[];calls=[];stops=0;controllers=[];
 media={getUserMedia:async()=>stream()};
 for(const [name,value] of Object.entries({
  document:{body:{dataset:{}},getElementById:()=>null},navigator:{mediaDevices:media},
  window:{AudioContext:CaptureContext},fetch:async(url,options)=>{
   calls.push({url,options});return {ok:true,json:async()=>({transcript:'Reviewed instruction'})};
  },
 }))Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});
});
afterEach(()=>{
 controllers.forEach(item=>item.cancel());
 for(const [name,descriptor] of descriptors){
  if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];
 }
});
test('capture and upload are separate explicit steps; bounded mono WAV only fills the editor',async()=>{
 const voice=controller();
 await voice.record();speak();await voice.record();
 assert.equal(voice.canTranscribe,true);assert.equal(calls.length,0);
 await voice.transcribe(false,'en');
 assert.equal(calls.length,0);assert.equal(statuses.at(-1),'consent_required');
 await voice.transcribe(true,'en');
 assert.equal(calls.length,1);assert.equal(calls[0].options.headers['X-RunQ-Voice-Consent'],'yes');
 const wav=convertToMuseWav(await calls[0].options.body.arrayBuffer());
 assert.equal(wav.readUInt32LE(24),16000);assert.equal(wav.length,8044);
 assert.deepEqual(transcripts,['Reviewed instruction']);assert.equal(stops,1);
 assert.equal(voice.canTranscribe,false);
});
test('cancel while awaiting permission stops the late stream without stealing a newer reservation',async()=>{
 let deliver;
 media.getUserMedia=()=>new Promise(resolve=>{deliver=resolve;});
 const voice=controller(),old=voice.record();voice.cancel();
 media.getUserMedia=async()=>stream();
 await voice.record();
 deliver(stream());await old;
 assert.equal(stops,1);assert.equal(voice.phase,'recording');
 assert.equal(document.body.dataset.runqVoiceCapture,'test-command');
 voice.cancel();assert.equal(stops,2);
 assert.equal(document.body.dataset.runqVoiceCapture,undefined);
});
test('cancelled transcription cannot overwrite a newer command or reset its busy state',async()=>{
 const replies=[];
 globalThis.fetch=(url,options)=>new Promise(resolve=>{calls.push({url,options});replies.push(resolve);});
 const voice=controller();
 await voice.record();speak();await voice.record();
 const first=voice.transcribe(true,'en');voice.cancel();
 assert.equal(calls[0].options.signal.aborted,true);
 await voice.record();speak();await voice.record();
 const second=voice.transcribe(true,'en');
 replies[0]({ok:true,json:async()=>({transcript:'Stale instruction'})});await first;
 assert.deepEqual(transcripts,[]);assert.equal(voice.phase,'transcribing');
 replies[1]({ok:true,json:async()=>({transcript:'Current instruction'})});await second;
 assert.deepEqual(transcripts,['Current instruction']);
});
test('context replacement rejects a ready take and empty transcription fails explicitly without retry',async()=>{
 const voice=controller();
 await voice.record();speak();await voice.record();key='project-2';
 await voice.transcribe(true,'en');
 assert.equal(calls.length,0);assert.equal(statuses.at(-1),'context_changed');
 await voice.record();speak();await voice.record();
 globalThis.fetch=async()=>{calls.push({});return {ok:true,json:async()=>({transcript:''})};};
 await voice.transcribe(true,'en');
 assert.deepEqual(transcripts,[]);assert.equal(calls.length,1);
 assert.equal(statuses.at(-1),'transcription_failed');assert.equal(voice.phase,'idle');
});
test('another microphone is not captured or cleared and unsupported capture is reported',async()=>{
 document.body.dataset.runqVoiceCapture='live';
 const voice=controller();await voice.record();
 assert.equal(statuses.at(-1),'microphone_busy');voice.cancel();
 assert.equal(document.body.dataset.runqVoiceCapture,'live');
 delete document.body.dataset.runqVoiceCapture;media.getUserMedia=null;
 await voice.record();assert.equal(statuses.at(-1),'microphone_unavailable');
});
test('ten-second limit is exact and sub-200ms audio never becomes uploadable',async()=>{
 const voice=controller();
 await voice.record();speak(320000);
 assert.equal(voice.phase,'ready');assert.equal(stops,1);
 await voice.transcribe(true,'en');
 const wav=convertToMuseWav(await calls[0].options.body.arrayBuffer());
 assert.equal(wav.length,320044,'Exactly ten seconds, not the oversized incoming frame');
 await voice.record();speak(3199);await voice.record();
 assert.equal(voice.canTranscribe,false);assert.equal(statuses.at(-1),'insufficient_audio');
 assert.equal(calls.length,1);
});
test('command capture uses the operator-selected microphone without transmitting other show data',async()=>{
 let requested;
 document.getElementById=()=>({value:'selected-mic'});
 media.getUserMedia=async constraints=>{requested=constraints;return stream();};
 const voice=controller();await voice.record();
 assert.deepEqual(requested.audio.deviceId,{exact:'selected-mic'});
 assert.equal(requested.video,false);assert.equal(calls.length,0);voice.cancel();
});
