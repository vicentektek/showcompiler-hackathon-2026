import {inspectPcm16Wav} from '../core/modalSfxPilotClient.mjs';

export const AUDIO_QUALITY_REVISION='pcm-quality-v2';
export const AUDIO_THRESHOLDS=Object.freeze({
 frameMs:20,silenceDbfs:-60,lowLevelDbfs:-48,
 minimumSilentRunSeconds:0.1,environmentGapSeconds:0.5,
 maximumClippedFraction:0.001,durationToleranceSeconds:0.1,
});
const db=value=>value>0?20*Math.log10(value):null;

export function measureAudioQuality(bytes,expectedDuration){
 if(!Number.isFinite(expectedDuration)||expectedDuration<=0)
  throw new TypeError('INVALID_EXPECTED_AUDIO_DURATION');
 const metadata=inspectPcm16Wav(bytes),data=Buffer.from(bytes);
 let start=0,length=0;
 for(let offset=12;offset+8<=data.length;){
  const size=data.readUInt32LE(offset+4);
  if(data.toString('ascii',offset,offset+4)==='data'){
   start=offset+8;length=size;break;
  }
  offset+=8+size+(size%2);
 }
 const samples=length/2,channels=metadata.channels,frames=samples/channels;
 const blockFrames=Math.max(1,Math.round(metadata.sampleRateHz*AUDIO_THRESHOLDS.frameMs/1000));
 const silentAmplitude=10**(AUDIO_THRESHOLDS.silenceDbfs/20);
 let sum=0,peak=0,clipped=0,nearSilent=0;
 const channelSums=Array(channels).fill(0),windows=[];
 for(let frame=0;frame<frames;frame+=blockFrames){
  const end=Math.min(frames,frame+blockFrames);
  let blockSum=0;
  for(let f=frame;f<end;f++)for(let channel=0;channel<channels;channel++){
   const raw=data.readInt16LE(start+(f*channels+channel)*2),value=Math.abs(raw)/32768;
   peak=Math.max(peak,value);sum+=value*value;blockSum+=value*value;
   channelSums[channel]+=value*value;
   if(Math.abs(raw)>=32767)clipped++;
   if(value<silentAmplitude)nearSilent++;
  }
  windows.push({startSeconds:frame/metadata.sampleRateHz,endSeconds:end/metadata.sampleRateHz,
   rms:Math.sqrt(blockSum/((end-frame)*channels))});
 }
 const silenceRuns=[];
 let run=null;
 for(const window of windows){
  if(window.rms<silentAmplitude){
   run??={startSeconds:window.startSeconds,endSeconds:window.endSeconds};
   run.endSeconds=window.endSeconds;
  }else if(run){silenceRuns.push(run);run=null;}
 }
 if(run)silenceRuns.push(run);
 const active=windows.filter(w=>w.rms>=silentAmplitude);
 const first=active[0]?.startSeconds??null,last=active.at(-1)?.endSeconds??null;
 const rms=Math.sqrt(sum/samples);
 return {...metadata,evaluatorRevision:AUDIO_QUALITY_REVISION,thresholds:AUDIO_THRESHOLDS,
  durationMatches:Math.abs(metadata.durationSeconds-expectedDuration)<=AUDIO_THRESHOLDS.durationToleranceSeconds,
  rmsDbfs:db(rms),peak,peakDbfs:db(peak),clippedFraction:clipped/samples,
  nearSilentFraction:nearSilent/samples,suspectedWholeFileSilence:rms<silentAmplitude,
  channelRmsDbfs:channelSums.map(value=>db(Math.sqrt(value/frames))),
  firstActiveSeconds:first,lastActiveSeconds:last,
  effectiveDurationSeconds:first===null?0:last-first,
  activeDurationSeconds:active.reduce((total,w)=>total+w.endSeconds-w.startSeconds,0),
  silenceRuns:silenceRuns.filter(r=>r.endSeconds-r.startSeconds>=
   AUDIO_THRESHOLDS.minimumSilentRunSeconds-1e-9).map(r=>({...r,
    durationSeconds:r.endSeconds-r.startSeconds})),
  temporalResolutionMs:AUDIO_THRESHOLDS.frameMs,
  artisticReview:'PENDING_HUMAN_LISTENING',distortion:'NOT_DETERMINED_BY_PCM_METRICS'};
}

export function classifyAudioQuality(metrics,{kind='SFX',continuous=false}={}){
 if(!metrics||metrics.evaluatorRevision!==AUDIO_QUALITY_REVISION||
    !['SFX','ENVIRONMENT'].includes(kind)||typeof continuous!=='boolean')
  throw new TypeError('INVALID_AUDIO_QUALITY_EVIDENCE');
 const failures=[];
 const add=(code,severity,proposal)=>failures.push({code,severity,proposal});
 if(!metrics.durationMatches)add('AUDIO_DURATION','HIGH','Check requested duration and provider trimming; do not replace the original WAV.');
 if(metrics.suspectedWholeFileSilence)add('AUDIO_SILENCE','HIGH','Reject the silent candidate after review; propose a concrete, audible brief as a separately authorized alternative.');
 else if(metrics.rmsDbfs<AUDIO_THRESHOLDS.lowLevelDbfs)
  add('AUDIO_LOW_LEVEL','MEDIUM','Audition with calibrated gain; propose a louder source perspective, without silently normalizing the original.');
 if(metrics.clippedFraction>0)add('AUDIO_CLIPPING',
  metrics.clippedFraction>AUDIO_THRESHOLDS.maximumClippedFraction?'HIGH':'MEDIUM',
  'Inspect saturated transients; audition or compare an independently authorized alternative.');
 if(continuous&&!metrics.suspectedWholeFileSilence){
  const gaps=metrics.silenceRuns.filter(r=>r.startSeconds>0&&
   r.endSeconds<metrics.durationSeconds&&r.durationSeconds>=AUDIO_THRESHOLDS.environmentGapSeconds-1e-9);
  if(gaps.length)add('ENVIRONMENT_DROPOUT','HIGH','Review internal silent gaps; request a continuous bed in a candidate brief.');
 }
 return {evaluatorRevision:AUDIO_QUALITY_REVISION,failures,
  technicalPass:failures.length===0,reviewRequired:true,
  semanticCoherence:'NOT_AUTOMATICALLY_EVALUABLE',
  continuousBedCheck:continuous?'PCM_GAP_HEURISTIC_ONLY':'NOT_APPLICABLE',
  decision:'PENDING_HUMAN_LISTENING'};
}

export function compareAudioAlternatives(left,right){
 if(left.evaluatorRevision!==right.evaluatorRevision||left.thresholds!==right.thresholds&&
    JSON.stringify(left.thresholds)!==JSON.stringify(right.thresholds)||
    !Number.isFinite(left.durationSeconds)||!Number.isFinite(right.durationSeconds))
  throw new TypeError('INCOMPARABLE_AUDIO_EVIDENCE');
 return {identicalWav:left.sha256===right.sha256,
  rmsDeltaDb:left.rmsDbfs===null||right.rmsDbfs===null?null:right.rmsDbfs-left.rmsDbfs,
  clippingDelta:right.clippedFraction-left.clippedFraction,
  activeDurationDeltaSeconds:right.activeDurationSeconds-left.activeDurationSeconds,
  winner:null,semanticPreference:'PENDING_HUMAN_LISTENING'};
}
