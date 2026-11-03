/** Validate untrusted AI cue suggestions; never execute them here. */
export function validateCueProposals(proposals, scriptLines, assetIds, options = {}) {
  const errors = [];
  const accepted = [];
  if (!Array.isArray(proposals)) return { valid: false, proposals: [], errors: ['Proposals must be an array'] };
  if (!Array.isArray(scriptLines) || !Array.isArray(assetIds)) return { valid: false, proposals: [], errors: ['Invalid validation context'] };
  const maxProposals = options?.maxProposals ?? 100;
  if (!Number.isSafeInteger(maxProposals) || maxProposals < 1 || proposals.length > maxProposals) return { valid: false, proposals: [], errors: ['Proposal limit exceeded or invalid'] };
  const knownLines = new Set(scriptLines.filter(line => line && typeof line.id === 'string').map(line => line.id));
  const knownAssets = new Set(assetIds);
  const seenIds = new Set();
  for (let i = 0; i < proposals.length; i++) {
    const p = proposals[i];
    const where = `Proposal ${i + 1}`;
    if (!p || typeof p !== 'object' || Array.isArray(p)) { errors.push(`${where}: expected object`); continue; }
    if (typeof p.id !== 'string' || !p.id.trim() || seenIds.has(p.id)) { errors.push(`${where}: missing or duplicate id`); continue; }
    seenIds.add(p.id);
    if (typeof p.label !== 'string' || !p.label.trim() || p.label.length > 200) { errors.push(`${where}: invalid label`); continue; }
    if (!Array.isArray(p.sourceLineIds) || p.sourceLineIds.length === 0 || p.sourceLineIds.some(id => typeof id !== 'string' || !knownLines.has(id))) { errors.push(`${where}: unknown or missing script reference`); continue; }
    if (!Array.isArray(p.actions) || p.actions.length === 0 || p.actions.length > 12) { errors.push(`${where}: invalid action count`); continue; }
    const badAction = p.actions.some(action => !action || typeof action !== 'object' || Array.isArray(action) || (action.type === 'PLAY' ? typeof action.assetId !== 'string' || !knownAssets.has(action.assetId) : action.type === 'SILENT' ? Object.keys(action).some(key => key !== 'type') : action.type === 'PLAN_AUDIO' ? typeof action.prompt !== 'string' || !action.prompt.trim() || action.prompt.length > 500 || !['DEFER', 'GENERATE'].includes(action.resolution) || Object.keys(action).some(key => !['type', 'prompt', 'resolution'].includes(key)) : true));
    if (badAction) { errors.push(`${where}: unsupported action or missing audio asset`); continue; }
    if (p.source !== undefined && !['MANUAL_MOCK', 'META_MODEL_API', 'BASETEN_MUSE_SPARK_OPEN'].includes(p.source)) {
      errors.push(`${where}: invalid suggestion source`);
      continue;
    }
    accepted.push({
      id: p.id, label: p.label, sourceLineIds: [...p.sourceLineIds],
      actions: p.actions.map(a => a.type === 'PLAY' ? { type: 'PLAY', assetId: a.assetId } : a.type === 'SILENT' ? {type:'SILENT'} : { type: 'PLAN_AUDIO', prompt: a.prompt, resolution: a.resolution }),
      status: 'PENDING',
      ...(p.source === undefined ? {} : { source: p.source }),
    });
  }
  return { valid: errors.length === 0, proposals: errors.length ? [] : accepted, errors };
}
