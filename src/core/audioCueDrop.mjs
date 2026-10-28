/**
 * Pure manual audio-cue intake and reorder operations.
 * Media decoding stays in the browser adapter; these functions never play sound,
 * prepare NEXT, call models, or modify a shared audio asset.
 */
import { normalizeShowProject } from './projectPersistence.mjs';
import { nextAvailableId } from './workspace.mjs';

const renumber = cues => cues.map((cue,index)=>({...cue,number:index+1}));

export function insertAudioCues(project,assetIds,{beforeCueId=null}={}){
  const show=normalizeShowProject(project);
  if(!Array.isArray(assetIds)||!assetIds.length)throw new TypeError('Choose at least one audio asset');
  if(show.cues.length+assetIds.length>2000)throw new RangeError('Show cue limit reached');
  const before=beforeCueId===null?show.cues.length:show.cues.findIndex(c=>c.id===beforeCueId);
  if(before<0)throw new RangeError('Cue insertion target no longer exists');
  const assets=new Map(show.assets.map(asset=>[asset.id,asset]));
  const used=new Set(show.cues.map(cue=>cue.id));
  const created=[];
  for(const assetId of assetIds){
    const asset=assets.get(assetId);
    if(!asset)throw new TypeError('Unknown audio asset');
    const label=asset.name.replace(/\.(?:wav|mp3|ogg|m4a|aac|flac)$/i,'').trim()||asset.name;
    const id=nextAvailableId('cue',[...used]);used.add(id);
    created.push({
      id,origin:'MANUAL',number:1,label:label.slice(0,200),
      sourceLineIds:[],status:'DRAFT',actions:[{type:'PLAY',assetId}],
    });
  }
  const cues=renumber([...show.cues.slice(0,before),...created,...show.cues.slice(before)]);
  return {project:normalizeShowProject({...show,cues}),cueId:created[0].id,
    cueIds:created.map(cue=>cue.id)};
}

/** Reorder by stable cue ID; beforeCueId=null appends. Keeps playback metadata. */
export function moveAudioCueBefore(project,cueId,beforeCueId=null){
  const show=normalizeShowProject(project);
  if(typeof cueId!=='string'||!show.cues.some(c=>c.id===cueId))
    throw new TypeError('Cue not found');
  if(beforeCueId!==null&&!show.cues.some(c=>c.id===beforeCueId))
    throw new TypeError('Target cue not found');
  if(cueId===beforeCueId)return show;
  const moving=show.cues.find(c=>c.id===cueId);
  const others=show.cues.filter(c=>c.id!==cueId);
  const at=beforeCueId===null?others.length:others.findIndex(c=>c.id===beforeCueId);
  return normalizeShowProject({...show,cues:renumber([
    ...others.slice(0,at),moving,...others.slice(at),
  ])});
}
