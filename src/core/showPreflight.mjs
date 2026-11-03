/**
 * Operator-facing readiness report for the local browser demo.
 * A readiness report is advisory. It neither arms live operation nor
 * guarantees sound-card reliability, timing or venue safety.
 * No persistence, model calls, side effects or automatic GO.
 */
import { normalizeShowProject } from './projectPersistence.mjs';

export function inspectShowReadiness(project, hasAudio, { audioLoading = false } = {}) {
  const show = normalizeShowProject(project);
  if (typeof hasAudio !== 'function') throw new TypeError('Provide audio availability callback');
  const issues = [];
  if (!show.cues.length) {
    issues.push({ code: 'EMPTY_SHOW', severity: 'BLOCKER' });
  }
  for (const proposal of show.proposals) {
    if (proposal.status === 'PENDING') {
      issues.push({ code: 'PENDING_REVIEW', severity: 'WARNING', proposalId: proposal.id });
    }
  }
  if (audioLoading) issues.push({ code: 'AUDIO_LOADING', severity: 'BLOCKER' });
  let readyCues = 0;
  for (const cue of show.cues) {
    let cueReady = true;
    for (const action of cue.actions) {
      if (action.type === 'PLAN_AUDIO') {
        issues.push({ code: 'UNRESOLVED_AUDIO', severity: 'BLOCKER', cueId: cue.id, cueNumber: cue.number });
        cueReady = false;
      } else if (action.type === 'PLAY' && !hasAudio(action.assetId)) {
        issues.push({ code: 'FILE_NOT_LOADED', severity: 'BLOCKER', cueId: cue.id, cueNumber: cue.number, assetId: action.assetId });
        cueReady = false;
      }
    }
    for (const track of cue.audioTracks ?? []) {
      if (!hasAudio(track.assetId)) {
        issues.push({code:'FILE_NOT_LOADED',severity:'BLOCKER',cueId:cue.id,cueNumber:cue.number,assetId:track.assetId});
        cueReady = false;
      }
    }
    if (cueReady) readyCues++;
  }
  return {
    ready: issues.every(issue => issue.severity !== 'BLOCKER'),
    readyCues,
    totalCues: show.cues.length,
    blockerCount: issues.filter(issue => issue.severity === 'BLOCKER').length,
    warningCount: issues.filter(issue => issue.severity === 'WARNING').length,
    issues,
  };
}
