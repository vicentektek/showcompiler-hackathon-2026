/** Operator-confirmed handoff from accepted generated sound to a new manual cue.
 * This is a pure project mutation. No network, audio engine, queue or GO.
 */
import {normalizeShowProject} from './projectPersistence.mjs';
import {insertManualCue} from './manualCues.mjs';
import {assignAudioToCue,updateCuePlayback} from './workspace.mjs';
import {parseScript} from './script.mjs';

const toMs=(v,max)=>Number.isFinite(v)?Math.max(0,Math.min(max,Math.round(v*1000))):NaN;
export function createCueFromReviewedAudio(project,{assetId,job,reviewedRegion}={}){
 const current=normalizeShowProject(project);
 if(typeof assetId!=='string'||!current.assets.some(a=>a.id===assetId))
  throw new TypeError('Generated audio must already be registered in the library');
 const asset=current.assets.find(a=>a.id===assetId);
 if(!job||job.status!=='ACCEPTED_FOR_MANUAL_IMPORT'||
    asset.provenance?.origin!=='AI_GENERATED_SFX'||
    asset.provenance?.requestId!==job.requestId)
  throw new TypeError('Generated cue must use its own accepted library asset');
 const totalMs=Math.round(job.wav?.durationSeconds*1000);
 if(!Number.isSafeInteger(totalMs)||totalMs<100||totalMs>600000)
  throw new TypeError('Invalid source duration');
 const start=toMs(reviewedRegion?.inSeconds,totalMs);
 const end=toMs(reviewedRegion?.outSeconds,totalMs);
 const duration=end-start;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||duration<10)
  throw new TypeError('Invalid reviewed region');
 const fadeIn=toMs(reviewedRegion?.fadeInSeconds??0,Math.min(10000,duration));
 const fadeOut=toMs(reviewedRegion?.fadeOutSeconds??0,Math.min(10000,duration));
 if(fadeIn+fadeOut>duration)throw new TypeError('Fades exceed the region duration');
 const label=(job.prompt||'Generated sound').replace(/\s+/g,' ').trim().slice(0,100);
 const inserted=insertManualCue(current,{label:label||'Generated sound'});
 let next=assignAudioToCue(inserted.project,inserted.cueId,assetId);
 next=updateCuePlayback(next,inserted.cueId,{
  startAtMs:start,endAtMs:end===totalMs?null:end,
  fadeInMs:fadeIn,fadeOutMs:fadeOut,
 });
 const validLines=new Set(parseScript(current.scriptText||'').map(x=>x.id));
 if(validLines.has(job.sourceLineId)){
  next=normalizeShowProject({...next,cues:next.cues.map(c=>c.id===inserted.cueId
   ?{...c,sourceLineIds:[job.sourceLineId]}:c)});
 }
 return Object.freeze({project:next,cueId:inserted.cueId,assetId});
}
