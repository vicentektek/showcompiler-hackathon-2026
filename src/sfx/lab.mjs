import { waveformPeaks, makeTrimmedPcm16Wav, trimBounds } from './waveform.mjs';

const $ = id => document.getElementById(id);
const api = '/api/sfx';
const state = {
  enabled: false, working: false, job: null, audio: null, context: null,
  source: null, gain: null, peaks: null, fileOrigin: null,
  inSeconds: 0, outSeconds: 0, dragStart: null,
};
const STATUS_WITH_AUDIO = new Set(['READY_FOR_REVIEW','ACCEPTED_FOR_MANUAL_IMPORT']);
const text = (id, value) => { $(id).textContent = value; };
function inform(message, error=false) {
  const el = $('feedback'); el.textContent=message; el.classList.toggle('error', error);
}
async function request(path, {method='GET', data}={}) {
  const opts={method,cache:'no-store'};
  if (method==='POST') {
    opts.headers={'Content-Type':'application/json'};
    opts.body=JSON.stringify(data??{});
  }
  const response=await fetch(api+path,opts);
  if (!response.ok) {
    let code='HTTP '+response.status;
    try { code=(await response.json()).code??code; } catch {}
    throw new Error(code);
  }
  return response;
}
function busy(value) { state.working=value; updateControls(); }
function updateControls() {
  const job=state.job;
  $('generateBtn').disabled = !state.enabled || state.working || !$('confirmRequest').checked;
  $('generationHint').textContent = state.enabled ?
    'Requires operator confirmation' : 'Remote generator not configured — offline WAV editing available';
  $('openJobBtn').disabled = state.working;
  const active=job && ['QUEUED','RUNNING','CANCEL_REQUESTED'].includes(job.status);
  $('refreshBtn').disabled = state.working || !state.enabled || !active;
  $('cancelBtn').disabled = state.working || !state.enabled ||
    !job || !['QUEUED','RUNNING'].includes(job.status);
  $('loadGeneratedBtn').disabled = state.working || !job || !STATUS_WITH_AUDIO.has(job.status);
  $('acceptBtn').disabled = state.working || !state.enabled || job?.status !== 'READY_FOR_REVIEW';
  $('rejectBtn').disabled = state.working || !state.enabled || job?.status !== 'READY_FOR_REVIEW';
  $('playBtn').disabled = !state.audio || state.working;
  $('stopBtn').disabled = !state.source;
  $('inPoint').disabled = !state.audio;
  $('outPoint').disabled = !state.audio;
  $('exportBtn').disabled = !state.audio || state.working ||
    (state.fileOrigin === 'remote' && state.job?.status !== 'ACCEPTED_FOR_MANUAL_IMPORT');
}
function viewJob(job) {
  state.job=job;
  $('jobState').textContent=job?.status?.replaceAll('_',' ') ?? 'No job loaded';
  $('jobDetails').textContent=job ?
    job.requestId+' · '+job.kind+' · '+job.sourceLineId+' · '+job.durationSeconds+'s\n'+job.prompt :
    'Previously submitted requests can be reopened by ID.';
  if (job) {
    $('requestId').value=job.requestId;
    try { localStorage.setItem('runq-sfx-last-id-v1',job.requestId); } catch {}
  }
  updateControls();
}
function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '--:--.---';
  const whole=Math.floor(seconds);
  return String(Math.floor(whole/60)).padStart(2,'0')+':'+
    String(whole%60).padStart(2,'0')+'.'+
    String(Math.floor((seconds-whole)*1000)).padStart(3,'0');
}
function stop() {
  const source=state.source;
  state.source=null;
  if (source) { source.onended=null; try { source.stop(); } catch {} try { source.disconnect(); } catch {} }
  if (state.gain) { try {state.gain.disconnect();} catch {} state.gain=null; }
  updateControls();
}
function drawWave() {
  const canvas=$('waveCanvas');
  const width=Math.max(1,canvas.getBoundingClientRect().width||900);
  const height=Math.max(1,canvas.getBoundingClientRect().height||245);
  const ratio=Math.min(window.devicePixelRatio||1,2);
  canvas.width=Math.round(width*ratio);
  canvas.height=Math.round(height*ratio);
  const ctx=canvas.getContext('2d');if(!ctx)return;
  ctx.scale(ratio,ratio);
  ctx.clearRect(0,0,width,height);
  const middle=height/2;
  ctx.strokeStyle='#36414e';ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(0,middle);ctx.lineTo(width,middle);ctx.stroke();
  for(let p=1;p<5;p++){
    const x=Math.round(width*p/5)+.5;
    ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,height);ctx.stroke();
  }
  if(!state.peaks || !state.audio)return;
  const duration=state.audio.duration;
  const x1=width*state.inSeconds/duration,x2=width*state.outSeconds/duration;
  ctx.fillStyle='rgba(199,227,124,.095)';
  ctx.fillRect(x1,0,x2-x1,height);
  for(let i=0;i<state.peaks.length;i++){
    const x=i*width/state.peaks.length;
    const amp=Math.max(.5,state.peaks[i]*middle*.91);
    ctx.fillStyle=x>=x1&&x<=x2?'#c7e37c':'#658497';
    ctx.fillRect(x,middle-amp,Math.max(1,width/state.peaks.length),amp*2);
  }
  for(const x of [x1,x2]){
    ctx.strokeStyle='#e3f1b1';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,height);ctx.stroke();
  }
  ctx.fillStyle='#d5e2bb';ctx.font='12px ui-monospace,monospace';
  ctx.fillText(formatTime(state.inSeconds),Math.min(width-85,x1+5),16);
  ctx.fillText(formatTime(state.outSeconds),Math.max(5,Math.min(width-85,x2-85)),height-10);
}
function updateTrim(inSeconds,outSeconds) {
  if(!state.audio)return;
  try {
    const bounds=trimBounds(inSeconds,outSeconds,state.audio.duration);
    state.inSeconds=bounds.inSeconds;state.outSeconds=bounds.outSeconds;
    $('inPoint').value=String(Number(bounds.inSeconds.toFixed(3)));
    $('outPoint').value=String(Number(bounds.outSeconds.toFixed(3)));
    drawWave();
    inform('Selection '+formatTime(state.inSeconds)+' → '+formatTime(state.outSeconds));
  }catch{inform('Select at least 10 ms of sound.',true);}
}
async function ensureContext() {
  if(!state.context) state.context=new (window.AudioContext||window.webkitAudioContext)();
  if(state.context.state==='suspended') await state.context.resume();
  return state.context;
}
async function loadAudio(bytes, name, origin='local') {
  if(!(bytes instanceof ArrayBuffer)||bytes.byteLength<44||bytes.byteLength>8_000_000)
    throw new Error('WAV file exceeds the 8 MB offline audition limit');
  stop();
  const context=await ensureContext();
  const decoded=await context.decodeAudioData(bytes.slice(0));
  if(![1,2].includes(decoded.numberOfChannels)||decoded.duration<=0||decoded.duration>600)
    throw new Error('Unsupported audio layout or duration');
  state.audio=decoded;
  state.fileOrigin=origin;
  state.inSeconds=0;state.outSeconds=decoded.duration;
  state.peaks=waveformPeaks(Array.from({length:decoded.numberOfChannels},(_,c)=>decoded.getChannelData(c)),600);
  text('audioName',name+' · '+decoded.numberOfChannels+' ch · '+decoded.sampleRate+' Hz');
  text('waveDuration',formatTime(decoded.duration));
  $('inPoint').max=String(decoded.duration);
  $('outPoint').max=String(decoded.duration);
  updateTrim(0,decoded.duration);
  updateControls();
}
function currentJobId() {
  const id=$('requestId').value.trim();
  if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(id))throw new Error('Enter a valid request ID');
  return id;
}
async function action(fn) {
  if(state.working)return;
  busy(true);
  try {await fn();}catch(error){inform('Action failed: '+(error?.message||'unknown error'),true);}
  finally {busy(false);}
}
$('generateForm').addEventListener('submit',event=>{
  event.preventDefault();
  action(async()=>{
    if(!state.enabled||!$('confirmRequest').checked)throw new Error('Generator is not enabled or confirmed');
    const requestData={
      requestId:'req-'+crypto.randomUUID(),
      authorizationId:'auth-'+crypto.randomUUID(),
      confirmed:true,sourceLineId:$('sourceLine').value.trim(),
      kind:$('soundKind').value,prompt:$('soundPrompt').value.trim(),
      durationSeconds:Number($('duration').value),seed:Number($('seed').value),
    };
    if(!confirm('Submit ONE external sound-generation request? It may consume credits. No automatic retries.'))return;
    const response=await request('/jobs',{method:'POST',data:requestData});
    viewJob(await response.json());
    $('confirmRequest').checked=false;
    inform('Submitted. Use “Check remote status” to poll manually; no automatic retries.');
  });
});
$('confirmRequest').addEventListener('change',updateControls);
$('openJobBtn').addEventListener('click',()=>action(async()=>{
  const id=currentJobId();
  viewJob(await(await request('/jobs/'+encodeURIComponent(id))).json());
  inform('Loaded saved local job record; no remote call made.');
}));
$('refreshBtn').addEventListener('click',()=>action(async()=>{
  const id=currentJobId();
  const response=await request('/jobs/'+encodeURIComponent(id)+'/refresh',{method:'POST',data:{}});
  viewJob(await response.json());
  inform('Refreshed remote status. No sound was played.');
}));
$('cancelBtn').addEventListener('click',()=>action(async()=>{
  if(!confirm('Request cancellation? GPU charges may already have occurred.'))return;
  const response=await request('/jobs/'+encodeURIComponent(currentJobId())+'/cancel',{method:'POST',data:{}});
  viewJob(await response.json());
  inform('Cancellation requested; completion is not guaranteed.');
}));
$('loadGeneratedBtn').addEventListener('click',()=>action(async()=>{
  if(!state.job||!STATUS_WITH_AUDIO.has(state.job.status))throw new Error('Generated WAV not ready');
  const result=await request('/jobs/'+encodeURIComponent(state.job.requestId)+'/audio');
  await loadAudio(await result.arrayBuffer(),'Generated · '+state.job.requestId+'.wav','remote');
  inform('Loaded generated WAV locally. Listen before approving.');
}));
for(const [id,decision] of [['acceptBtn','ACCEPT'],['rejectBtn','REJECT']]){
  $(id).addEventListener('click',()=>action(async()=>{
    if(!state.job || state.job.status!=='READY_FOR_REVIEW')throw new Error('Take not available for review');
    if(!confirm(decision==='ACCEPT'?'Mark this take accepted for manual export?':'Reject this generated take?'))return;
    const response=await request('/jobs/'+encodeURIComponent(state.job.requestId)+'/review',{method:'POST',data:{decision}});
    viewJob(await response.json());
    inform(decision==='ACCEPT'?'Accepted. Trim and export the WAV, then import into RunQ manually.':'Take rejected. No cue created.');
  }));
}
$('localWav').addEventListener('change',()=>action(async()=>{
  const file=$('localWav').files?.[0];
  if(!file)return;
  if(file.size>8_000_000)throw new Error('File is larger than 8 MB');
  await loadAudio(await file.arrayBuffer(),file.name,'local');
  inform('Local file loaded. This sound was never uploaded to a provider.');
}));
$('playBtn').addEventListener('click',()=>action(async()=>{
  if(!state.audio)return;
  stop();
  const context=await ensureContext();
  const source=context.createBufferSource();
  const gain=context.createGain();
  source.buffer=state.audio;
  gain.gain.value=Number($('monitorLevel').value)/100;
  source.connect(gain);
  gain.connect(context.destination);
  state.source=source;state.gain=gain;
  source.onended=()=>{if(state.source===source){state.source=null;gain.disconnect();state.gain=null;updateControls();}};
  source.start(0,state.inSeconds,state.outSeconds-state.inSeconds);
  updateControls();
  inform('Auditioning selected region through the default audio output.');
}));
$('stopBtn').addEventListener('click',()=>{stop();inform('Audition stopped.');});
for(const id of ['inPoint','outPoint']){
  $(id).addEventListener('change',()=>{
    if(!state.audio)return;
    updateTrim(Number($('inPoint').value),Number($('outPoint').value));
  });
}
const canvas=$('waveCanvas');
canvas.addEventListener('pointerdown',event=>{
  if(!state.audio)return;
  const rect=canvas.getBoundingClientRect();
  state.dragStart=Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width));
  try {canvas.setPointerCapture(event.pointerId);}catch{}
});
canvas.addEventListener('pointerup',event=>{
  if(!state.audio||state.dragStart===null)return;
  const rect=canvas.getBoundingClientRect();
  const end=Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width));
  const start=state.dragStart;state.dragStart=null;
  updateTrim(Math.min(start,end)*state.audio.duration,Math.max(start,end)*state.audio.duration);
});
$('exportBtn').addEventListener('click',()=>action(async()=>{
  if(!state.audio)throw new Error('No WAV loaded');
  if(state.fileOrigin==='remote' && state.job?.status!=='ACCEPTED_FOR_MANUAL_IMPORT')
    throw new Error('Operator acceptance required before exporting remote generation');
  const audio=makeTrimmedPcm16Wav(state.audio,state.inSeconds,state.outSeconds);
  const filename=state.fileOrigin==='remote'?'runq-'+state.job.requestId+'-trim.wav':'runq-local-trim.wav';
  const url=URL.createObjectURL(new Blob([audio],{type:'audio/wav'}));
  try {
    const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;
    anchor.click();
  }finally {setTimeout(()=>URL.revokeObjectURL(url),1500);}
  inform('PCM16 WAV exported. Import it into your show explicitly from the Cue Editor.');
}));
window.addEventListener('resize',drawWave);
window.addEventListener('pagehide',()=>{stop();if(state.context)void state.context.close();});
(async()=>{
  try{
    const settings=await(await request('/status')).json();
    state.enabled=settings.enabled===true;
    text('engineBadge',state.enabled?'SFX provider configured':'Offline editing');
    $('engineBadge').classList.toggle('active',state.enabled);
    try{$('requestId').value=localStorage.getItem('runq-sfx-last-id-v1')??'';}catch{}
    inform(state.enabled?'Generator available. Confirm each paid request individually.':'Offline waveform editing is ready. No provider configured.');
  }catch{
    state.enabled=false;
    text('engineBadge','Offline / no service');
    inform('Unable to reach local SFX API. Local file editing remains available.',true);
  }
  updateControls();
})();
