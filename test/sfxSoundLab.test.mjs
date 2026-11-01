import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppServer } from '../tools/dev-server.mjs';
import { waveformPeaks, makeTrimmedPcm16Wav, trimBounds, makeOfflineImpactDemoWav } from '../src/sfx/waveform.mjs';

function mockBuffer({sampleRate=16000,channels=2,frames=32000}={}){
  const data=Array.from({length:channels},()=>new Float32Array(frames));
  data[0][sampleRate]=-1;
  if(channels===2) data[1][sampleRate]=0.5;
  return {
    sampleRate,numberOfChannels:channels,length:frames,
    duration:frames/sampleRate,
    getChannelData(channel){return data[channel];},
  };
}
test('real PCM waveform peaks follow source amplitude and preserve channel positions',()=>{
  const a=new Float32Array(200), b=new Float32Array(200);
  a[25]=-.8;b[125]=.6;
  const peaks=waveformPeaks([a,b],8);
  assert.equal(peaks.length,8);
  assert.ok(Math.abs(peaks[1]-.8)<1e-5);
  assert.ok(Math.abs(peaks[5]-.6)<1e-5);
  assert.equal(peaks[0],0);
  assert.throws(()=>waveformPeaks([new Float32Array(0)]));
  assert.throws(()=>waveformPeaks([new Float32Array(2)],5000));
});
test('PCM16 WAV trim produces proper sample frames, stereo interleaving and RIFF sizing',()=>{
  const audio=mockBuffer();
  const wav=makeTrimmedPcm16Wav(audio,.5,1.5);
  const view=new DataView(wav.buffer);
  assert.equal(Buffer.from(wav.subarray(0,4)).toString(),'RIFF');
  assert.equal(Buffer.from(wav.subarray(8,12)).toString(),'WAVE');
  assert.equal(view.getUint32(4,true)+8,wav.length);
  assert.equal(view.getUint16(20,true),1);
  assert.equal(view.getUint16(22,true),2);
  assert.equal(view.getUint32(24,true),16000);
  assert.equal(view.getUint32(40,true),16000*4);
  const transientIndex=44+(.5*16000)*4;
  assert.equal(view.getInt16(transientIndex,true),-32768);
  assert.equal(view.getInt16(transientIndex+2,true),16384);
});
test('invalid selection, bad sample and oversized export fail closed',()=>{
  const audio=mockBuffer({channels:1,frames:16000});
  assert.throws(()=>makeTrimmedPcm16Wav(audio,.5,.5));
  assert.throws(()=>makeTrimmedPcm16Wav(audio,0,2));
  audio.getChannelData(0)[1]=Number.NaN;
  assert.throws(()=>makeTrimmedPcm16Wav(audio,0,1),/Non-finite/);
  assert.throws(()=>trimBounds(0,.001,1));
  assert.deepEqual(trimBounds(-1,2,1),{inSeconds:0,outSeconds:1});
});
test('Sound Lab is served separately and app/Cue Editor entrypoint remains unchanged',async t=>{
  const server=createAppServer({sfxConfig:()=>({enabled:false})});
  await new Promise((resolve,reject)=>{
    server.once('error',reject);server.listen(0,'127.0.0.1',resolve);
  });
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base='http://127.0.0.1:'+server.address().port;
  const page=await fetch(base+'/sound-lab');
  const html=await page.text();
  assert.equal(page.status,200);
  assert.match(html,/Waveform & audition/);
  assert.match(html,/explicitly approved preparation/);
  assert.doesNotMatch(html,/id="confirmRequest"/);
  assert.match(html,/id="exportBtn"/);
  assert.doesNotMatch(html,/MODEL_API_KEY|MODAL_PROXY_TOKEN_SECRET/);
  for(const item of [
    ['/src/sfx/lab.mjs','text/javascript'],
    ['/src/sfx/waveform.mjs','text/javascript'],
    ['/src/sfx/lab.css','text/css'],
  ]){
    const r=await fetch(base+item[0]);
    assert.equal(r.status,200);
    assert.match(r.headers.get('content-type'),new RegExp(item[1]));
  }
  assert.equal((await fetch(base+'/')).status,200);
  assert.equal((await fetch(base+'/src/sfx/credentials.env')).status,404);
});

test('offline original demo produces stable valid mono WAV without any provider',()=>{
  const a=makeOfflineImpactDemoWav(), b=makeOfflineImpactDemoWav();
  assert.deepEqual(a,b);
  const view=new DataView(a.buffer,a.byteOffset,a.byteLength);
  assert.equal(view.getUint16(22,true),1);
  assert.equal(view.getUint32(24,true),22050);
  assert.equal(view.getUint32(40,true),22050*2*2);
  assert.notEqual(view.getInt16(44+100,true),0);
});
