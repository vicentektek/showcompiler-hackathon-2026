import { inspectShowReadiness } from './showPreflight.mjs';
import { normalizeShowProject } from './projectPersistence.mjs';

export const SHOW_BUILDER_STAGES = Object.freeze([
  'project',
  'cues',
  'audio',
  'configuration',
  'verification',
]);

const STORAGE_PREFIX = 'runq.show-builder.v1.';

function hashText(value) {
  const bytes = new TextEncoder().encode(value);
  let first = 2166136261;
  let second = 0x9e3779b9;
  for (const byte of bytes) {
    first = Math.imul(first ^ byte, 16777619) >>> 0;
    second = Math.imul(second ^ byte, 2246822519) >>> 0;
  }
  return bytes.byteLength.toString(36) + '-' + first.toString(36) + '-' + second.toString(36);
}

export function showBuilderProjectKey(project) {
  const show = normalizeShowProject(project);
  return hashText(JSON.stringify([show.id, show.name, show.scriptText]));
}

export function showBuilderConfigurationKey(project) {
  const show = normalizeShowProject(project);
  return hashText(JSON.stringify(show.cues.map(cue => ({
    id: cue.id,
    playback: cue.playback ?? null,
    automation: cue.automation ?? null,
  }))));
}

function defaultSession(project) {
  return {
    version: 1,
    projectKey: showBuilderProjectKey(project),
    currentStage: 'project',
    skippedStages: [],
    reviewedConfigurationKey: null,
    soundDecision: null,
  };
}

function storageKey(project) {
  return STORAGE_PREFIX + showBuilderProjectKey(project);
}

function validSession(value, project) {
  return Boolean(value && typeof value === 'object' &&
    value.version === 1 &&
    value.projectKey === showBuilderProjectKey(project) &&
    SHOW_BUILDER_STAGES.includes(value.currentStage) &&
    Array.isArray(value.skippedStages) &&
    value.skippedStages.every(stage => SHOW_BUILDER_STAGES.includes(stage)) &&
    (value.reviewedConfigurationKey === null || typeof value.reviewedConfigurationKey === 'string') &&
    (value.soundDecision === undefined || value.soundDecision === null ||
      value.soundDecision === 'create' || value.soundDecision === 'skip'));
}

export function loadShowBuilderSession(storage, project) {
  const initial = defaultSession(project);
  if (!storage) return { session: initial, persistenceAvailable: false };
  try {
    const raw = storage.getItem(storageKey(project));
    if (!raw) return { session: initial, persistenceAvailable: true };
    const value = JSON.parse(raw);
    return {
      session: validSession(value, project)
        ? { ...value, soundDecision: value.soundDecision ?? null }
        : initial,
      persistenceAvailable: true,
    };
  } catch {
    return { session: initial, persistenceAvailable: false };
  }
}

export function saveShowBuilderSession(storage, project, session) {
  if (!storage || !validSession(session, project)) return false;
  try {
    storage.setItem(storageKey(project), JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}

export function assessShowBuilder(project, assets, session, { audioLoading = false } = {}) {
  const show = normalizeShowProject(project);
  if (!Array.isArray(assets) || !assets.every(asset =>
    asset && typeof asset.id === 'string' && typeof asset.ready === 'boolean')) {
    throw new TypeError('Provide current local audio asset availability');
  }
  const available = new Set(assets.filter(asset => asset.ready).map(asset => asset.id));
  const readiness = inspectShowReadiness(show, assetId => available.has(assetId), { audioLoading });
  const pendingReview = show.proposals.some(proposal => proposal.status === 'PENDING');
  const linkedAudioCount = show.cues.reduce((count, cue) =>
    count + cue.actions.filter(action => action.type === 'PLAY').length +
      (cue.audioTracks?.length ?? 0), 0);
  const audioBlockers = readiness.issues.some(issue =>
    ['AUDIO_LOADING', 'FILE_NOT_LOADED', 'UNRESOLVED_AUDIO'].includes(issue.code));
  const configKey = showBuilderConfigurationKey(show);
  const hasProjectContent = Boolean(show.scriptText.trim() || show.assets.length || show.cues.length);
  const hasScript = Boolean(show.scriptText.trim());
  const cuesComplete = show.cues.length > 0 && !pendingReview;
  const audioReady = linkedAudioCount > 0 && !audioBlockers;
  const audioSkipped = session?.soundDecision === 'skip';
  const audioComplete = audioReady || audioSkipped;
  const configurationComplete = show.cues.length > 0 &&
    session?.reviewedConfigurationKey === configKey;
  const verificationComplete = show.cues.length > 0 && readiness.ready && !pendingReview;

  return {
    projectKey: showBuilderProjectKey(show),
    linkedAudioCount,
    readiness,
    stages: {
      project: { complete: hasProjectContent, notRequired: false },
      cues: {
        complete: cuesComplete,
        notRequired: !hasScript && show.cues.length === 0,
      },
      audio: { complete: audioComplete, notRequired: audioSkipped && !audioReady },
      configuration: { complete: configurationComplete, notRequired: false },
      verification: { complete: verificationComplete, notRequired: false },
    },
  };
}

export function updateShowBuilderStage(session, stage) {
  if (!SHOW_BUILDER_STAGES.includes(stage)) throw new RangeError('Unknown Show Builder stage');
  return { ...session, currentStage: stage };
}

export function skipShowBuilderStage(session, stage) {
  if (!SHOW_BUILDER_STAGES.includes(stage)) throw new RangeError('Unknown Show Builder stage');
  return {
    ...session,
    skippedStages: session.skippedStages.includes(stage)
      ? session.skippedStages
      : [...session.skippedStages, stage],
  };
}

export function confirmShowBuilderConfiguration(project, session) {
  return { ...session, reviewedConfigurationKey: showBuilderConfigurationKey(project) };
}

export function chooseShowBuilderSoundPlan(session, decision) {
  if (decision !== 'create' && decision !== 'skip') {
    throw new RangeError('Choose whether to create sounds or skip them');
  }
  return { ...session, soundDecision: decision };
}
