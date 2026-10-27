/**
 * Read-only audio waveform UI. All source bytes come from the user's local
 * decoded-media store; no uploads, GO, project edits, or paid model calls.
 */
import { drawWaveform } from './waveformCanvas.mjs';

const byId=id=>document.getElementById(id);
export function createWaveformFeature({getFile}){
  if(typeof getFile!=='function')throw new TypeError('Waveform source resolver required');
  let revision=0;
  let activeWorker=null;
  let cancelWorker=null;
  let peaks=null;
  const panel=byId('waveformPanel');
  const title=byId('waveformTitle');
  const status=byId('waveformStatus');
  const canvas=byId('waveformCanvas');
  const zoom=byId('waveformZoom');
  const pan=byId('waveformPan');
  const ruler=byId('waveformRuler');
  if (![panel,title,status,canvas,zoom,pan,ruler].every(Boolean)) {
    throw new TypeError('Waveform panel is incomplete');
  }
  const labels=()=>{
    const es=byId('uiLocaleSelect')?.value==='es';
    return es ? {
      loading:'Analizando audio local, sin reproducirlo…',
      unavailable:'Selecciona un archivo local decodificable. No se puede mostrar la onda.',
      tooLong:'Este audio excede el límite temporal de la vista previa; el archivo sigue disponible para reproducción.',
      ready:'Onda real PCM · Vista no destructiva · Recorte gráfico todavía no disponible',
      channels:'canales',
    } : {
      loading:'Analyzing local audio without playback…',
      unavailable:'Select a decodable local file to see its waveform.',
      tooLong:'This file exceeds the waveform preview limit; normal playback remains available.',
      ready:'Real PCM waveform · Non-destructive preview · Graphical trim is not available yet',
      channels:'channels',
    };
  };
  const seconds=ms=>(ms/1000).toFixed(2)+'s';
  const draw=()=>{
    if(!peaks)return;
    const range=drawWaveform(canvas,peaks,{
      zoom:Number(zoom.value),pan:Number(pan.value)/100,
    });
    ruler.textContent=seconds(range.startMs)+' — '+seconds(range.endMs)+
      ' / '+seconds(peaks.durationMs);
    pan.disabled=Number(zoom.value)===1;
  };
  function reset(){
    revision++;
    if(activeWorker)activeWorker.terminate();
    if(cancelWorker)cancelWorker();
    activeWorker=null;cancelWorker=null;peaks=null;
    panel.hidden=true;
    status.textContent='';
    ruler.textContent='';
    zoom.value='1';pan.value='0';
  }
  async function open(assetId,assetName) {
    reset();
    const version=revision;
    const file=getFile(assetId);
    panel.hidden=false;
    title.textContent=assetName;
    status.textContent=labels().loading;
    if (!file || typeof file.arrayBuffer!=='function') {
      status.textContent=labels().unavailable;
      return;
    }
    try {
      const Offline=window.OfflineAudioContext||window.webkitOfflineAudioContext;
      if(!Offline)throw new Error('NO_OFFLINE_DECODER');
      const bytes=await file.arrayBuffer();
      if(version!==revision)return;
      // Decode with an offline context: never open an audible output path.
      const context=new Offline(1,1,44100);
      const decoded=await context.decodeAudioData(bytes);
      if(version!==revision)return;
      if(decoded.length>12_000_000 || decoded.numberOfChannels>2){
        status.textContent=labels().tooLong;
        return;
      }
      const channels=Array.from({length:decoded.numberOfChannels},
        (_,index)=>decoded.getChannelData(index).slice());
      const worker=new Worker(new URL('./peaksWorker.mjs',import.meta.url),{type:'module'});
      activeWorker=worker;
      const result=await new Promise((resolve,reject)=>{
        cancelWorker=()=>reject(new Error('CANCELLED'));
        worker.onmessage=event=>{
          if(event.data?.requestId!==version || event.data.error){
            reject(new Error('INVALID_WAVEFORM'));
          } else resolve(event.data.peaks);
        };
        worker.onerror=()=>reject(new Error('WAVEFORM_WORKER_FAILED'));
        worker.postMessage({requestId:version,channels,sampleRate:decoded.sampleRate},
          channels.map(channel=>channel.buffer));
      });
      if(version!==revision)return;
      peaks=result;
      status.textContent=labels().ready+' · '+result.channels.length+' '+labels().channels;
      draw();
    } catch {
      if(version===revision)status.textContent=labels().unavailable;
    } finally {
      if(version===revision){
        if(activeWorker)activeWorker.terminate();
        activeWorker=null;cancelWorker=null;
      }
    }
  }
  zoom.addEventListener('input',draw);
  pan.addEventListener('input',draw);
  byId('waveformClose').addEventListener('click',reset);
  return {open,reset};
}
