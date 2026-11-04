/**
 * Additional operator-authored PLAY tracks. Kept separate from the approved
 * script/AI proposal so the original evidence is never rewritten.
 */
import { normalizeCuePlayback } from './cuePlayback.mjs';
const TRACK_ID = /^[a-z][a-z0-9-]{0,79}$/;

export function normalizeCueAudioTracks(tracks, knownAssets, originalPlayCount=0) {
  if (!Array.isArray(tracks) || !Number.isSafeInteger(originalPlayCount) || originalPlayCount<0 ||
      originalPlayCount>12 || tracks.length+originalPlayCount>12) throw new TypeError('Invalid extra audio tracks');
  const ids = new Set();
  return tracks.map(track => {
    if (!track || typeof track !== 'object' || Array.isArray(track) ||
        Object.keys(track).some(key => !['id','assetId','playback'].includes(key)) ||
        typeof track.id !== 'string' || !TRACK_ID.test(track.id) || ids.has(track.id) ||
        typeof track.assetId !== 'string' || !knownAssets.has(track.assetId)) {
      throw new TypeError('Invalid track ID or asset');
    }
    ids.add(track.id);
    return { id:track.id, assetId:track.assetId,
      ...(track.playback === undefined ? {} : { playback: normalizeCuePlayback(track.playback) }) };
  });
}

function stage(project, cueId, updater) {
  const cue = project?.cues?.find(c => c.id === cueId);
  if (!cue || cue.status !== 'DRAFT') throw new TypeError('Cue not editable');
  const tracks = updater(cue.audioTracks ?? [],cue);
  return {...project, cues:project.cues.map(c => c.id === cueId
    ? {...c,audioTracks:tracks} : c)};
}

export function stageAddCueTrack(project, cueId, assetId) {
  return stage(project,cueId,(tracks,cue) => {
    if (!project.assets.some(asset => asset.id === assetId)) throw new TypeError('Unknown audio');
    const originalPlayCount=cue.actions.filter(action=>action.type==='PLAY').length;
    if (tracks.length+originalPlayCount >= 12) throw new RangeError('Maximum 12 PLAY sources per cue');
    let id;
    for (let n=1;n<=12;n++) {
      if (!tracks.some(track=>track.id === 'track-'+n)) {id='track-'+n;break;}
    }
    if (!id) throw new RangeError('No track IDs available');
    return [...tracks,{id,assetId,playback:normalizeCuePlayback()}];
  });
}

export function stageChangeCueTrack(project,cueId,trackId,updates) {
  return stage(project,cueId,tracks=>{
    if (!tracks.some(track=>track.id === trackId) || !updates ||
        typeof updates !== 'object' || Array.isArray(updates) ||
        Object.keys(updates).some(key=>!['assetId','playback'].includes(key))) {
      throw new TypeError('Invalid track change');
    }
    return tracks.map(track=>track.id===trackId
      ? {...track,...updates,
        ...(updates.playback===undefined?{}:{playback:normalizeCuePlayback(updates.playback)})}
      :track);
  });
}

export function stageRemoveCueTrack(project,cueId,trackId) {
  return stage(project,cueId,tracks=>{
    if (!tracks.some(track=>track.id===trackId)) throw new TypeError('Track missing');
    return tracks.filter(track=>track.id!==trackId);
  });
}
