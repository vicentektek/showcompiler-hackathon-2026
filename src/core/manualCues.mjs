import { normalizeShowProject } from './projectPersistence.mjs';
import { nextAvailableId } from './workspace.mjs';

const renumber = cues => cues.map((cue,index)=>({...cue,number:index+1}));

/** Operator creates a cue without needing any script or AI suggestion. */
export function insertManualCue(project,{afterCueId=null,label='New cue'}={}) {
  const show=normalizeShowProject(project);
  if (show.cues.length>=2000) throw new RangeError('Show cue limit reached');
  if (typeof label!=='string'||!label.trim()||label.length>200) throw new TypeError('Invalid cue name');
  const at=afterCueId===null?show.cues.length:show.cues.findIndex(c=>c.id===afterCueId)+1;
  if (afterCueId!==null&&at===0) throw new TypeError('Cue position not found');
  const cue={id:nextAvailableId('cue',show.cues.map(c=>c.id)),origin:'MANUAL',
    number:at+1,label:label.trim(),sourceLineIds:[],status:'DRAFT',
    actions:[{type:'PLAN_AUDIO',prompt:'Operator sound selection pending',resolution:'DEFER'}]};
  const cues=[...show.cues.slice(0,at),cue,...show.cues.slice(at)];
  return {project:normalizeShowProject({...show,cues:renumber(cues)}),cueId:cue.id};
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
  return normalizeShowProject({...show,cues:renumber(cues)});
}
