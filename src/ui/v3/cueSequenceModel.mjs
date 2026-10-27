/**
 * Read-only cue table projection for the professional RunQ editor.
 *
 * Source IDs and the project are never changed by searching or displaying
 * rows. Selection is inspector-only; NEXT GO belongs to the operator queue.
 */
function fold(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
}
export function projectCueRows(show, {
  query = '', selectedCueId = null, preparedCueId = null,
} = {}) {
  if (!show || !Array.isArray(show.cues) || !Array.isArray(show.assets) ||
      typeof query !== 'string' || query.length > 300) {
    throw new TypeError('Invalid cue table projection input');
  }
  const assets = new Map(show.assets.map(asset => [asset.id, asset.name]));
  const term = fold(query.trim());
  const rows = [];
  for (const [index, cue] of show.cues.entries()) {
    const tracks = [
      ...cue.actions.filter(action => action.type === 'PLAY').map(action => action.assetId),
      ...(cue.audioTracks ?? []).map(track => track.assetId),
    ];
    const missing = cue.actions.some(action => action.type === 'PLAN_AUDIO');
    const names = tracks.map(id => assets.get(id) ?? id);
    const audioLabel = missing ? 'PENDING MEDIA' : names.length ? names.join(' · ') : 'NO MEDIA';
    const sourceLabel = cue.sourceLineIds.length ? cue.sourceLineIds.join(', ') : '—';
    const text = fold([cue.number,cue.label,cue.trigger,cue.notes,sourceLabel,audioLabel].join(' '));
    if (term && !text.includes(term)) continue;
    rows.push({
      id: cue.id, index, number:cue.number, label:cue.label, trigger:cue.trigger ?? '',
      sourceLabel, audioLabel, trackCount:tracks.length, unresolved:missing,
      selected:cue.id===selectedCueId, prepared:cue.id===preparedCueId,
    });
  }
  return rows;
}
