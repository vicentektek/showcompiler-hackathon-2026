import { normalizeShowProject } from './projectPersistence.mjs';
import { parseScript } from './script.mjs';
import { nextAvailableId, assignAudioToCue } from './workspace.mjs';

const renumber = cues => cues.map((cue,index)=>({...cue,number:index+1}));

/** Stored PLAN_AUDIO prompt of a cue whose sound the operator has not chosen yet (kept for saved-project compatibility). */
export const OPERATOR_SOUND_PENDING_PROMPT='Operator sound selection pending';

export function isOperatorSoundPlaceholder(prompt) {
  return typeof prompt==='string'&&prompt.trim().toLowerCase()===OPERATOR_SOUND_PENDING_PROMPT.toLowerCase();
}

/** Human sound idea of a planned-audio action, or '' when only the internal placeholder is stored. */
export function plannedAudioDetail(prompt) {
  return typeof prompt==='string'&&!isOperatorSoundPlaceholder(prompt)?prompt.trim():'';
}

/**
 * A follow/continue cue needs a next cue. When a structural edit leaves one in
 * last position, it is downgraded to MANUAL (never upgraded to automatic) so the
 * edit succeeds; fades, loop and stop targets are preserved.
 */
function releaseTrailingFollow(cues) {
  const last=cues.at(-1);
  if(!last?.automation||last.automation.mode==='MANUAL')return cues;
  return [...cues.slice(0,-1),{...last,automation:{...last.automation,mode:'MANUAL',delayMs:0}}];
}

/** Cue id whose automatic follow an edit would release, or null. */
export function trailingFollowReleased(before,after) {
  const last=after?.cues?.at(-1);
  if(!last||last.automation?.mode!=='MANUAL')return null;
  const previous=before?.cues?.find(c=>c.id===last.id);
  return previous?.automation&&previous.automation.mode!=='MANUAL'?last.id:null;
}

/** Operator creates a cue without needing any script or AI suggestion. */
export function insertManualCue(project,{afterCueId=null,label='New cue'}={}) {
  const show=normalizeShowProject(project);
  if (show.cues.length>=2000) throw new RangeError('Show cue limit reached');
  if (typeof label!=='string'||!label.trim()||label.length>200) throw new TypeError('Invalid cue name');
  const at=afterCueId===null?show.cues.length:show.cues.findIndex(c=>c.id===afterCueId)+1;
  if (afterCueId!==null&&at===0) throw new TypeError('Cue position not found');
  const cue={id:nextAvailableId('cue',show.cues.map(c=>c.id)),origin:'MANUAL',
    number:at+1,label:label.trim(),sourceLineIds:[],status:'DRAFT',
    actions:[{type:'PLAN_AUDIO',prompt:OPERATOR_SOUND_PENDING_PROMPT,resolution:'DEFER'}]};
  const cues=[...show.cues.slice(0,at),cue,...show.cues.slice(at)];
  return {project:normalizeShowProject({...show,cues:renumber(cues)}),cueId:cue.id};
}

/** Create one reviewed manual cue anchored to a bounded set of real source lines. */
export function insertManualCueFromScriptLines(project,lineIds) {
  const show=normalizeShowProject(project);
  if(!Array.isArray(lineIds)||lineIds.length<1||lineIds.length>20||
     lineIds.some(id=>typeof id!=='string')||new Set(lineIds).size!==lineIds.length)
    throw new TypeError('Select between 1 and 20 unique script lines');
  if(!show.scriptText.trim())throw new TypeError('A source script is required');
  const lines=parseScript(show.scriptText);
  const sourceLines=lineIds.map(id=>lines.find(line=>line.id===id))
    .sort((left,right)=>left.lineNumber-right.lineNumber);
  if(sourceLines.some(line=>!line))throw new TypeError('Selected script line is unavailable');
  const firstText=sourceLines.find(line=>line.text.trim())?.text.trim();
  const label=(firstText||`Cue from ${sourceLines[0].id}`).slice(0,200);
  const result=insertManualCue(show,{label});
  const cues=result.project.cues.map(cue=>cue.id===result.cueId
    ?{...cue,sourceLineIds:sourceLines.map(line=>line.id)}
    :cue);
  return {...result,project:normalizeShowProject({...result.project,cues})};
}

export function insertManualAudioCue(project,assetId) {
  const asset=project.assets.find(item=>item.id===assetId);
  if(!asset)throw new TypeError('Unknown audio asset');
  const result=insertManualCue(project,{label:asset.name});
  return {...result,project:assignAudioToCue(result.project,result.cueId,assetId)};
}

/** Delete only the chosen cue, leaving proposals and AI evidence intact. */
export function deleteOperatorCue(project,cueId){
  const show=normalizeShowProject(project);
  if(!show.cues.some(c=>c.id===cueId))throw new TypeError('Cue not found');
  const cues=show.cues.filter(c=>c.id!==cueId).map(c=>{
    if(!c.automation?.stopCueIds.includes(cueId))return c;
    const stopCueIds=c.automation.stopCueIds.filter(id=>id!==cueId);
    const overrides={...(c.stopFadeOverrides??{})};
    delete overrides[cueId];
    return {...c,automation:{...c.automation,stopCueIds},
      ...(c.stopFadeOverrides?{stopFadeOverrides:overrides}:{})};
  });
  return normalizeShowProject({...show,cues:renumber(releaseTrailingFollow(cues))});
}

/** Duplicate any cue as an independently editable MANUAL cue. */
export function duplicateOperatorCue(project, cueId) {
  const show=normalizeShowProject(project);
  const index=show.cues.findIndex(c=>c.id===cueId);
  if(index<0)throw new TypeError('Cue not found');
  if(show.cues.length>=2000)throw new RangeError('Show cue limit reached');
  const source=show.cues[index];
  const copy={...source,id:nextAvailableId('cue',show.cues.map(c=>c.id)),
    origin:'MANUAL',label:source.label+' copy',number:index+2,
    actions:source.actions.map(a=>({...a})),sourceLineIds:[...source.sourceLineIds]};
  delete copy.sourceProposalId;
  // A duplicate never inherits stop targets: it must be expressly programmed.
  delete copy.automation;
  delete copy.stopFadeOverrides;
  const cues=[...show.cues.slice(0,index+1),copy,...show.cues.slice(index+1)];
  return {project:normalizeShowProject({...show,cues:renumber(cues)}),cueId:copy.id};
}

/** Move cue one place, keeping its asset, source evidence and approved provenance. */
export function moveOperatorCue(project,cueId,direction) {
  const show=normalizeShowProject(project);
  if(direction!==-1&&direction!==1)throw new TypeError('Invalid move direction');
  const at=show.cues.findIndex(c=>c.id===cueId);
  if(at<0)throw new TypeError('Cue not found');
  const next=at+direction;
  if(next<0||next>=show.cues.length)return show;
  const cues=[...show.cues];
  [cues[at],cues[next]]=[cues[next],cues[at]];
  return normalizeShowProject({...show,cues:renumber(releaseTrailingFollow(cues))});
}


/**
 * Move one cue directly before or after another cue, preserving identity,
 * source evidence and all cue settings. No-op on self-drop. This is editing
 * only; caller must refuse while any audio or asynchronous GO is active.
 */
export function reorderOperatorCue(project, cueId, targetCueId, position='before') {
  const show=normalizeShowProject(project);
  if(position!=='before'&&position!=='after')throw new TypeError('Invalid drop position');
  const sourceIndex=show.cues.findIndex(c=>c.id===cueId);
  const targetIndex=show.cues.findIndex(c=>c.id===targetCueId);
  if(sourceIndex<0||targetIndex<0)throw new TypeError('Cue not found');
  if(cueId===targetCueId)return show;
  const cues=[...show.cues];
  const [moved]=cues.splice(sourceIndex,1);
  const destination=cues.findIndex(c=>c.id===targetCueId)+(position==='after'?1:0);
  cues.splice(destination,0,moved);
  return normalizeShowProject({...show,cues:renumber(releaseTrailingFollow(cues))});
}
