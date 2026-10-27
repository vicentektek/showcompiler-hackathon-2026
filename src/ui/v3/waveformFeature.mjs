/**
 * PCM-derived waveform UI, with optional manual cue-specific IN editing.
 * Library preview stays read-only. All source bytes come from the user's local
 * decoded-media store; no uploads, GO, project edits, or paid model calls.
 */
import { drawWaveform } from './waveformCanvas.mjs';

const byId=id=>document.getElementById(id);
export function createWaveformFeature({getFile,onSaveStart}){
  if(typeof getFile!=='function' || typeof onSaveStart!=='function')throw new TypeError('Waveform data and save callbacks required');
  let revision=0;
  let activeWorker=null;
  let cancelWorker=null;
  let peaks=null;
  let editing=null;
  let draggingPointer=null;
  const panel=byId('waveformPanel');
  const title=byId('waveformTitle');
  const status=byId('waveformStatus');
  const canvas=byId('waveformCanvas');
  const zoom=byId('waveformZoom');
  const pan=byId('waveformPan');
  const ruler=byId('waveformRuler');
  const trimTools=byId('waveformTrimTools');
  const inValue=byId('waveformInValue');
  const saveIn=byId('waveformSaveIn');
  const cancelIn=byId('waveformCancelIn');
  if (![panel,title,status,canvas,zoom,pan,ruler,trimTools,inValue,saveIn,cancelIn].every(Boolean)) {
    throw new TypeError('Waveform panel is incomplete');
  }
  const labels=()=>{
    const es=byId('uiLocaleSelect')?.value==='es';
    return es ? {
      loading:'Analizando audio local, sin reproducirlo…',
      unavailable:'Selecciona un archivo local decodificable. No se puede mostrar la onda.',
      tooLong:'Este audio excede el límite temporal de la vista previa; el archivo sigue disponible para reproducción.',
      ready:'Onda real PCM · Sin reproducción',
      saved:'Punto IN guardado para este cue. GO sigue siendo manual.',
      saveFailed:'No se ha podido guardar IN; no se ha modificado el cue.',
      channels:'canales',
    } : {
      loading:'Analyzing local audio without playback…',
      unavailable:'Select a decodable local file to see its waveform.',
      tooLong:'This file exceeds the waveform preview limit; normal playback remains available.',
      ready:'Real PCM waveform · No playback',
      saved:'IN point saved for this cue. GO remains manual.',
      saveFailed:'Cannot save IN; the cue has not been modified.',
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
    if(editing){
      inValue.textContent=seconds(editing.draftMs);
      const x=((editing.draftMs-range.startMs)/range.durationMs)*canvas.width;
      if(x>=0 && x<=canvas.width){
        const ctx=canvas.getContext('2d');
        ctx.fillStyle='#f7c17e';
        ctx.fillRect(Math.round(x),0,2,canvas.height);
      }
      saveIn.disabled=editing.draftMs===editing.originalMs;
    }
  };
  function reset(){
    revision++;
    if(activeWorker)activeWorker.terminate();
    if(cancelWorker)cancelWorker();
    activeWorker=null;cancelWorker=null;peaks=null;
    editing=null;draggingPointer=null;
    trimTools.hidden=true;
    saveIn.disabled=true;
    panel.hidden=true;
    status.textContent='';
    ruler.textContent='';
    zoom.value='1';pan.value='0';
  }
  async function open(assetId,assetName,{cueId=null,startAtMs=0}={}) {
    reset();
    if(cueId!==null){
      if(typeof cueId!=='string' || !cueId || !Number.isSafeInteger(startAtMs) || startAtMs<0) {
        throw new TypeError('Invalid cue IN edit target');
      }
      editing={cueId,assetId,originalMs:startAtMs,draftMs:startAtMs};
    }
    trimTools.hidden=editing===null;
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
      if(editing){
        const lastFrame=Math.max(0,Math.ceil(result.durationMs)-1);
        editing.draftMs=Math.min(editing.draftMs,lastFrame,600000);
      }
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
  function moveMarker(event){
    if(!peaks || !editing)return;
    const rect=canvas.getBoundingClientRect();
    if(!rect.width)return;
    const range=drawWaveform(canvas,peaks,{
      zoom:Number(zoom.value),pan:Number(pan.value)/100,
    });
    const frac=Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width));
    const ms=range.startMs+frac*range.durationMs;
    editing.draftMs=Math.max(0,Math.min(600000,
      Math.ceil(peaks.durationMs)-1,Math.round(ms)));
    draw();
  }
  canvas.addEventListener('pointerdown',event=>{
    if(!editing || !peaks || event.button!==0)return;
    draggingPointer=event.pointerId;
    try { canvas.setPointerCapture?.(event.pointerId); } catch {}
    moveMarker(event);
  });
  canvas.addEventListener('pointermove',event=>{
    if(draggingPointer===event.pointerId)moveMarker(event);
  });
  for(const name of ['pointerup','pointercancel']){
    canvas.addEventListener(name,event=>{
      if(draggingPointer===event.pointerId)draggingPointer=null;
    });
  }
  // Accessible fine adjustment with arrow keys; works even when a pointer
  // device is unavailable. The same explicit Save gate still applies.
  canvas.addEventListener('keydown',event=>{
    if(!editing || !peaks || !['ArrowLeft','ArrowRight'].includes(event.key))return;
    event.preventDefault();
    const step=event.shiftKey ? 100 : 10;
    const delta=event.key==='ArrowRight'?step:-step;
    editing.draftMs=Math.max(0,Math.min(600000,
      Math.ceil(peaks.durationMs)-1,editing.draftMs+delta));
    draw();
  });
  canvas.addEventListener('click',event=>{
    if(!editing || !peaks || draggingPointer!==null)return;
    moveMarker(event);
  });
  saveIn.addEventListener('click',()=>{
    if(!editing || !peaks || editing.draftMs===editing.originalMs)return;
    try{
      onSaveStart({cueId:editing.cueId,assetId:editing.assetId,startAtMs:editing.draftMs});
      editing.originalMs=editing.draftMs;
      status.textContent=labels().saved;
      draw();
    }catch{
      status.textContent=labels().saveFailed;
    }
  });
  cancelIn.addEventListener('click',()=>{
    if(!editing || !peaks)return;
    editing.draftMs=editing.originalMs;
    draw();
  });
  zoom.addEventListener('input',draw);
  pan.addEventListener('input',draw);
  byId('waveformClose').addEventListener('click',reset);
  return {open,reset};
}
