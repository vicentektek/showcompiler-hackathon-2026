/**
 * Stateful float32 mono -> little-endian PCM16 resampler for Muse Voice.
 * Interpolates across render quantum boundaries without dropping samples.
 * 16 kHz output is server-enforced; never route this stream to playback.
 */
export function makeLivePcmEncoder(inputRate,{outputRate=16000,chunkSamples=2560}={}){
 if(!Number.isFinite(inputRate)||inputRate<8000||inputRate>192000||
    !Number.isInteger(outputRate)||outputRate<8000||outputRate>48000||
    !Number.isInteger(chunkSamples)||chunkSamples<128||chunkSamples>8000)
  throw new TypeError('Invalid voice PCM format');
 let received=0,nextPosition=0,previousSample=0;
 let buffer=[];
 const ratio=inputRate/outputRate;
 return {
  push(floatSamples){
   if(!(floatSamples instanceof Float32Array))throw new TypeError('Float32 microphone samples required');
   const start=received,end=start+floatSamples.length,frames=[];
   while(nextPosition<end-1){
    const lo=Math.floor(nextPosition),fraction=nextPosition-lo;
    const first=lo<start?previousSample:floatSamples[lo-start];
    const second=lo+1<start?previousSample:floatSamples[lo+1-start];
    const sample=Math.min(1,Math.max(-1,first*(1-fraction)+second*fraction));
    buffer.push(Math.round(sample<0?sample*32768:sample*32767));
    nextPosition+=ratio;
   }
   if(floatSamples.length){previousSample=floatSamples.at(-1);received=end;}
   while(buffer.length>=chunkSamples){
    const frame=new ArrayBuffer(chunkSamples*2),view=new DataView(frame);
    for(let i=0;i<chunkSamples;i++)view.setInt16(i*2,buffer[i],true);
    buffer=buffer.slice(chunkSamples);
    frames.push(frame);
   }
   return frames;
  },
  get bufferedSamples(){return buffer.length;},
  get processedInputSamples(){return received;}
 };
}
