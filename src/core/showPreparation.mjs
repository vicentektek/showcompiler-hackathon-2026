import { prepareCueSoundDraft } from './soundPromptCompiler.mjs';

export const cueSoundIdentity = cue => JSON.stringify([
  cue.id, cue.label, cue.sourceLineIds, cue.actions, cue.audioTracks ?? [],
]);

export function planShowAudio(project) {
  const items = [], excluded = [];
  for (const cue of project.cues) {
    if (cue.status !== 'DRAFT' || cue.actions.length !== 1 ||
        cue.actions[0].type !== 'PLAN_AUDIO' || cue.audioTracks?.length) {
      excluded.push({ cueId: cue.id, reason: 'EXISTING_AUDIO_OR_NON_SOUND_CUE' });
      continue;
    }
    const brief = cue.actions[0].prompt ?? cue.label;
    if (/\b(music|m[uú]sica|song|canci[oó]n|voiceover|narraci[oó]n|speech|dialogue)\b/i.test(brief)) {
      excluded.push({ cueId: cue.id, reason: 'UNSUPPORTED_SOUND_KIND' });
      continue;
    }
    items.push({
      cueId: cue.id, label: cue.label, number: cue.number,
      cueIdentity: cueSoundIdentity(cue),
      draft: prepareCueSoundDraft({ cue, scriptText: project.scriptText }),
    });
  }
  return { items, excluded };
}

/** One request at a time; cancellation invalidates late results, not remote billing. */
export async function runPreparationQueue(items, {
  signal, assertCurrent, execute, onComplete = () => {},
}) {
  const check = () => {
    if (signal?.aborted) throw new Error('PREPARATION_CANCELLED');
    assertCurrent();
  };
  const results = [];
  for (const item of items) {
    check();
    const result = await execute(item, signal);
    check();
    await onComplete(item, result);
    results.push(result);
  }
  return results;
}

export function validateAudioBatch(items, policy, confirmed) {
  if (!confirmed || !items.length || policy.enabled !== true ||
      !Number.isFinite(policy.estimatedMaxCostUsdPerRequest) || policy.estimatedMaxCostUsdPerRequest <= 0 ||
      !Number.isFinite(policy.dailyBudgetUsd) || policy.dailyBudgetUsd <= 0)
    throw new Error('BATCH_AUTHORIZATION_REQUIRED');
  if (items.length * policy.estimatedMaxCostUsdPerRequest > policy.dailyBudgetUsd + 1e-9 ||
      (Number.isSafeInteger(policy.maxDailyStarts) && items.length > policy.maxDailyStarts))
    throw new Error('BATCH_EXCEEDS_DAILY_CEILING');
  for (const { draft } of items) {
    if (!['SFX', 'ENVIRONMENT'].includes(draft.kind) || typeof draft.prompt !== 'string' ||
        !draft.prompt.trim() || draft.prompt.length > 1000 || /(?:https?|data|file):/i.test(draft.prompt) ||
        !Number.isInteger(draft.durationSeconds) || draft.durationSeconds < 1 || draft.durationSeconds > 12)
      throw new Error('BATCH_PROMPT_INVALID');
  }
}
