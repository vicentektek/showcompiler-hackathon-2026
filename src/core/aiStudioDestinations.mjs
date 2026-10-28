/**
 * AI Studio: immutable, explicit destination for an ALREADY imported, verified
 * audio asset. This module never makes a provider request, accesses sound
 * output, mutates a live transport or accepts raw generated model payload.
 */
import { normalizeShowProject } from './projectPersistence.mjs';
import { decideProposal, assignAudioToCue, replaceCueAudioAsset, updateCuePlayback } from './workspace.mjs';
import { insertManualCue } from './manualCues.mjs';
import { stageAddCueTrack, stageChangeCueTrack } from './cueTracks.mjs';
import { normalizeCuePlayback } from './cuePlayback.mjs';

export const STUDIO_DESTINATIONS=Object.freeze(['LIBRARY','NEW_CUE','EXISTING_CUE']);
export const STUDIO_TRACK_ACTIONS=Object.freeze(['ADD','REPLACE']);

function normalizedRegion(region){
  if(region == null)return null;
  const {inMs,outMs}=region;
  if(!Number.isSafeInteger(inMs)||!Number.isSafeInteger(outMs)||
      inMs<0||outMs<=inMs||outMs>600000)throw new RangeError('Invalid reviewed audio region');
  return {startAtMs:inMs,endAtMs:outMs};
}
function withTrackRegion(project, cueId, trackId, region){
  const playback=normalizedRegion(region);
  if(!playback)return project;
  if(trackId){
    const cue=project.cues.find(c=>c.id===cueId);
    const previous=cue.audioTracks.find(t=>t.id===trackId);
    return normalizeShowProject(stageChangeCueTrack(project,cueId,trackId,{
      playback:normalizeCuePlayback({...previous.playback,...playback})
    }));
  }
  return updateCuePlayback(project,cueId,playback);
}
/**
 * Destination intent comes from an explicit operator selection.
 * Every committed action is validated against the current show, never a
 * stored "currently selected" cue that could change while sound generates.
 * Returns a NEW project object. The caller performs the save/render only
 * after validation succeeds.
 */
export function applyAiStudioDestination(project,{
  mode='LIBRARY',assetId,proposalId=null,targetCueId=null,targetTrackId=null,
  trackAction='ADD',cueLabel='New sound cue',reviewedRegion=null,
}={}){
  const current=normalizeShowProject(project);
  if(!STUDIO_DESTINATIONS.includes(mode)||!STUDIO_TRACK_ACTIONS.includes(trackAction)){
    throw new TypeError('Unsupported AI Studio destination or track action');
  }
  if(typeof assetId!=='string'||!current.assets.some(a=>a.id===assetId)){
    throw new TypeError('AI Studio audio must already be imported into this show');
  }
  const region=normalizedRegion(reviewedRegion);
  if(mode==='LIBRARY'){
    if(proposalId!==null&&typeof proposalId!=='string')throw new TypeError('Invalid source proposal');
    return Object.freeze({project:current,assetId,cueId:null,trackId:null,mode});
  }
  let result=current;
  let cueId=targetCueId;
  if(mode==='NEW_CUE'){
    if(typeof cueLabel!=='string'||!cueLabel.trim()||cueLabel.length>200)
      throw new TypeError('Cue name is required');
    if(proposalId!==null){
      const proposal=result.proposals.find(p=>p.id===proposalId);
      if(!proposal||proposal.status!=='PENDING')
        throw new TypeError('Only pending reviewed proposals can create a new linked cue');
      const used=new Set(result.cues.map(c=>c.id));
      result=decideProposal(result,proposalId,'APPROVE');
      const added=result.cues.filter(c=>!used.has(c.id));
      if(added.length!==1)throw new TypeError('Proposal approval did not create exactly one cue');
      cueId=added[0].id;
      if(added[0].label!==cueLabel.trim()){
        // Operator may rename the actual cue without rewriting model evidence.
        result=normalizeShowProject({...result,cues:result.cues.map(c=>
          c.id===cueId?{...c,label:cueLabel.trim()}:c)});
      }
    }else{
      const inserted=insertManualCue(result,{label:cueLabel.trim()});
      result=inserted.project;
      cueId=inserted.cueId;
    }
  }else if(mode==='EXISTING_CUE'){
    if(typeof targetCueId!=='string'||!result.cues.some(c=>c.id===targetCueId)){
      throw new TypeError('Choose a real existing cue');
    }
  }
  const cue=result.cues.find(c=>c.id===cueId);
  if(!cue||cue.status!=='DRAFT')throw new TypeError('Cue is not editable');
  let trackId=null;
  const unbound=cue.actions.length===1&&cue.actions[0].type==='PLAN_AUDIO'&&
    !(cue.audioTracks?.length);
  if(trackAction==='REPLACE'){
    if(unbound)throw new TypeError('No existing PLAY track to replace');
    if(targetTrackId){
      if(!cue.audioTracks?.some(t=>t.id===targetTrackId))
        throw new TypeError('Requested replacement track does not exist');
      result=normalizeShowProject(stageChangeCueTrack(result,cueId,targetTrackId,{assetId}));
      trackId=targetTrackId;
    }else{
      if(cue.actions.length!==1||cue.actions[0].type!=='PLAY')
        throw new TypeError('Select a replaceable main PLAY action');
      result=replaceCueAudioAsset(result,cueId,assetId);
    }
  }else if(unbound){
    result=assignAudioToCue(result,cueId,assetId);
  }else{
    if((cue.audioTracks?.length??0)>=11)throw new RangeError('Maximum 12 audio sources per cue');
    const used=new Set((cue.audioTracks??[]).map(t=>t.id));
    result=normalizeShowProject(stageAddCueTrack(result,cueId,assetId));
    trackId=result.cues.find(c=>c.id===cueId).audioTracks.find(t=>!used.has(t.id))?.id;
    if(!trackId)throw new TypeError('Additional sound track was not created');
  }
  result=withTrackRegion(result,cueId,trackId,region);
  return Object.freeze({project:normalizeShowProject(result),assetId,cueId,trackId,mode});
}
