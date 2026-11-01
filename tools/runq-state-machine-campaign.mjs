#!/usr/bin/env node
/**
 * Seeded, OFFLINE state-machine campaign over RUNQ core modules.
 * No network, provider, audio device or ledger access. Synthetic original scripts only.
 *
 * Each scenario builds a show through random operator/AI-proposal operations,
 * injects invalid inputs, and checks product invariants after every step:
 * source text and L# references, human-approval-only cue creation, unique IDs,
 * fail-closed rejections, JSON round-trip, read-only operations that never move
 * the prepared cue, exact agent commit/undo, and transport runtime safety
 * (STOP ALL / dispose / late async results never leave a delayed GO alive).
 */
import { createHash } from 'node:crypto';
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import {
  createNewShow, addAudioReference, addModelProposals, decideProposal, decideProposalBatch,
  updateCuePlayback, updateCueAutomation, updateCueOperatorDetails, assignAudioToCue,
  setCueSoundResolution, replaceShowScript,
} from '../src/core/workspace.mjs';
import {
  insertManualCue, insertManualCueFromScriptLines, deleteOperatorCue, duplicateOperatorCue,
  moveOperatorCue, reorderOperatorCue,
} from '../src/core/manualCues.mjs';
import { serializeShowProject, deserializeShowProject } from '../src/core/projectPersistence.mjs';
import { parseScript, searchScript } from '../src/core/script.mjs';
import {
  startOperatorQueue, prepareOperatorCue, completePreparedCue, skipPreparedCue, previousOperatorCue,
} from '../src/core/operatorQueue.mjs';
import { createCueAutomationRuntime } from '../src/core/cueAutomationRuntime.mjs';
import { validateCueAutomationPlan, planCueGo } from '../src/core/cueAutomation.mjs';
import { prepareAgentPlan, commitAgentPlan, undoAgentPlan, buildAgentContext, auditAgentProject } from '../src/core/agentCore.mjs';
import { inspectShowReadiness } from '../src/core/showPreflight.mjs';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rng, list) => list[Math.floor(rng() * list.length)];
const int = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));

// Original synthetic fragments written for this harness; no third-party text.
const CORPUS = {
  es: {
    heading: ['ESCENA 1. Cocina de madrugada', 'ESCENA 2. Andén vacío', 'ACTO I — Salón con piano'],
    speakers: ['ANA', 'BRUNO', 'CARMEN', 'DIEGO'],
    speech: ['¿Has oído eso?', 'No era nada, vuelve a la mesa.', 'Mañana será otro día.',
      'Dijo que vendría antes de las doce.', 'Apaga la radio, por favor.', 'Aquí no queda nadie… ¿verdad?'],
    hints: ['(Suena un trueno lejano.)', '(Llaman a la puerta tres veces.)', '(Empieza a llover sobre el tejado.)',
      '(Un reloj da las doce.)', '(Oscuro. Música suave.)', '(Un tren pasa sin detenerse.)'],
  },
  en: {
    heading: ['SCENE 1. A kitchen before dawn', 'SCENE 2. Empty platform', 'ACT I — Parlour with piano'],
    speakers: ['ALEX', 'BEA', 'CAL', 'DANA'],
    speech: ['Did you hear that?', 'It was nothing, come back to the table.', 'Tomorrow is another day.',
      'She said she would come before midnight.', 'Turn the radio off, please.', 'Nobody is left here… right?'],
    hints: ['(Distant thunder.)', '(Three knocks at the door.)', '(Rain starts on the roof.)',
      '(A clock strikes twelve.)', '(Blackout. Soft music.)', '(A train passes without stopping.)'],
  },
};
export function syntheticScript(rng) {
  const lang = rng() < 0.5 ? 'es' : 'en';
  const c = CORPUS[lang];
  const lines = [pick(rng, c.heading), ''];
  const count = int(rng, 6, 36);
  for (let i = 0; i < count; i += 1) {
    const roll = rng();
    if (roll < 0.25) lines.push(pick(rng, c.hints));
    else if (roll < 0.33) lines.push('');
    else lines.push(pick(rng, c.speakers) + ': ' + pick(rng, c.speech) + (rng() < 0.1 ? '\t' : ''));
  }
  let text = lines.join(rng() < 0.2 ? '\r\n' : '\n');
  if (rng() < 0.1) text = '\uFEFF' + text;
  return { lang, text };
}

const clone = value => JSON.parse(JSON.stringify(value));
const snap = value => JSON.stringify(value);
const ids = list => list.map(item => item.id);

class Ctx {
  constructor(seed) { this.seed = seed; this.checks = 0; this.failures = []; this.findings = []; }
  check(condition, invariant, detail = {}) {
    this.checks += 1;
    if (!condition) this.failures.push({ seed: this.seed, invariant, ...detail });
    return condition;
  }
  finding(kind, detail = {}) { this.findings.push({ seed: this.seed, kind, ...detail }); }
}

/** Invariants that must hold after EVERY step, accepted or rejected. */
export function checkShowInvariants(project, state, ctx, where) {
  const lines = parseScript(project.scriptText);
  const lineIds = new Set(lines.map(line => line.id));
  ctx.check(project.scriptText === state.scriptText, 'SOURCE_SCRIPT_UNCHANGED', where);
  ctx.check(lines.length === state.lineCount, 'LINE_IDS_STABLE', where);
  const refs = [...project.proposals, ...project.cues].flatMap(item => item.sourceLineIds);
  ctx.check(refs.every(id => lineIds.has(id)), 'SOURCE_REFERENCES_EXIST', where);
  for (const [name, list] of [['cues', project.cues], ['proposals', project.proposals], ['assets', project.assets]])
    ctx.check(new Set(ids(list)).size === list.length, 'UNIQUE_IDS_' + name.toUpperCase(), where);
  ctx.check(project.cues.every((cue, index) => cue.number === index + 1), 'CUE_NUMBERS_SEQUENTIAL', where);
  const approved = new Set(project.proposals.filter(p => p.status === 'APPROVED').map(p => p.id));
  ctx.check(project.cues.every(cue => cue.origin === 'MANUAL' || approved.has(cue.sourceProposalId)),
    'CUE_ONLY_FROM_APPROVAL_OR_MANUAL', where);
  ctx.check(project.cues.every(cue => cue.status === 'DRAFT'), 'CUES_REMAIN_DRAFT', where);
  const assetIds = new Set(ids(project.assets));
  ctx.check(project.cues.every(cue => cue.actions.every(a => a.type !== 'PLAY' || assetIds.has(a.assetId))),
    'PLAY_REFERENCES_KNOWN_ASSET', where);
  let reloaded = null;
  try { reloaded = deserializeShowProject(serializeShowProject(project)); } catch (error) {
    ctx.check(false, 'SERIALIZE_ROUND_TRIP_THROWS', { ...where, error: error.message });
  }
  if (reloaded) ctx.check(isDeepStrictEqual(clone(reloaded), clone(project)), 'SERIALIZE_ROUND_TRIP_EQUAL', where);
  let planOk = true;
  try { validateCueAutomationPlan(project.cues.map(cue => ({ id: cue.id, automation: cue.automation }))); }
  catch { planOk = false; }
  ctx.check(planOk, 'AUTOMATION_PLAN_VALID', where);
  ctx.check(state.queue.preparedCueId === null || project.cues.some(cue => cue.id === state.queue.preparedCueId),
    'PREPARED_CUE_EXISTS', where);
}

function nonBlankLineIds(project) {
  return parseScript(project.scriptText).filter(line => line.text.trim()).map(line => line.id);
}
function pendingIds(project) { return project.proposals.filter(p => p.status === 'PENDING').map(p => p.id); }
function playable(cue) { return cue.actions.some(a => a.type === 'PLAY' || a.type === 'PLAN_AUDIO'); }

/**
 * Operation catalogue. expect: ACCEPT (a valid operator action), REJECT (fault injection)
 * or EITHER (domain-legal refusal possible). cueDelta=null means "not asserted".
 */
function buildOperation(rng, project) {
  const cues = project.cues;
  const lineIds = nonBlankLineIds(project);
  const pending = pendingIds(project);
  const reviewed = project.proposals.filter(p => p.status !== 'PENDING').map(p => p.id);
  const cue = cues.length ? pick(rng, cues) : null;
  const asset = project.assets.length ? pick(rng, project.assets) : null;
  const options = [];
  const add = (weight, op) => { for (let i = 0; i < weight; i += 1) options.push(op); };
  if (lineIds.length && project.proposals.length < 90) add(4, () => {
    const n = int(rng, 1, 3);
    const suggestions = Array.from({ length: n }, (_, i) => {
      const withAsset = asset && rng() < 0.5;
      return { lineId: pick(rng, lineIds), label: 'Idea ' + i,
        ...(withAsset ? { assetId: asset.id } : { soundPrompt: 'Synthetic sound idea ' + i }) };
    });
    return { name: 'PROPOSE', expect: 'ACCEPT', cueDelta: 0, proposalDelta: n,
      apply: p => addModelProposals(p, suggestions) };
  });
  add(2, () => {
    const variants = [
      [{ lineId: 'L' + (parseScript(project.scriptText).length + 7), label: 'x', soundPrompt: 'y' }],
      [{ lineId: lineIds[0] ?? 'L1', label: 'x', assetId: 'asset-999' }],
      Array.from({ length: 9 }, () => ({ lineId: lineIds[0] ?? 'L1', label: 'x', soundPrompt: 'y' })),
      [{ lineId: lineIds[0] ?? 'L1', label: '   ', soundPrompt: 'y' }],
      [{ lineId: lineIds[0] ?? 'L1', label: 'x', soundPrompt: 'z'.repeat(501) }],
      [['L1', 'not-an-object']],
    ];
    const suggestions = pick(rng, variants);
    const provider = rng() < 0.2 ? 'BASETEN_UNKNOWN' : 'META_MODEL_API';
    return { name: 'PROPOSE_INVALID', expect: 'REJECT', apply: p => addModelProposals(p, suggestions, provider) };
  });
  if (pending.length) {
    const id = pick(rng, pending);
    add(4, () => ({ name: 'APPROVE', expect: 'ACCEPT', cueDelta: 1, proposalId: id,
      apply: p => decideProposal(p, id, 'APPROVE') }));
    add(2, () => ({ name: 'REJECT_PROPOSAL', expect: 'ACCEPT', cueDelta: 0, proposalId: id,
      apply: p => decideProposal(p, id, 'REJECT') }));
  }
  if (pending.length >= 2) add(1, () => {
    const batch = [...pending].sort(() => rng() - 0.5).slice(0, 2);
    return { name: 'BATCH_APPROVE', expect: 'ACCEPT', cueDelta: 2, apply: p => decideProposalBatch(p, batch, 'APPROVE') };
  });
  if (reviewed.length) add(1, () => {
    const id = pick(rng, reviewed);
    return { name: 'DECIDE_REVIEWED', expect: 'REJECT', apply: p => decideProposal(p, id, rng() < 0.5 ? 'APPROVE' : 'REJECT') };
  });
  add(2, () => {
    const after = cue && rng() < 0.6 ? cue.id : null;
    return { name: 'INSERT_MANUAL', expect: 'ACCEPT', cueDelta: 1,
      apply: p => insertManualCue(p, { afterCueId: after, label: 'Manual ' + int(rng, 1, 99) }).project };
  });
  if (lineIds.length) add(2, () => {
    const selection = [...new Set(Array.from({ length: int(rng, 1, 3) }, () => pick(rng, lineIds)))];
    return { name: 'INSERT_FROM_LINES', expect: 'ACCEPT', cueDelta: 1, lineSelection: selection,
      apply: p => insertManualCueFromScriptLines(p, selection).project };
  });
  add(1, () => ({ name: 'INSERT_FROM_LINES_INVALID', expect: 'REJECT',
    apply: p => insertManualCueFromScriptLines(p, ['L99999']).project }));
  if (cue) {
    add(1, () => ({ name: 'DUPLICATE', expect: 'ACCEPT', cueDelta: 1, cueId: cue.id,
      apply: p => duplicateOperatorCue(p, cue.id).project }));
    add(2, () => ({ name: 'DELETE', expect: 'ACCEPT', cueDelta: -1, cueId: cue.id,
      apply: p => deleteOperatorCue(p, cue.id) }));
    add(1, () => ({ name: 'MOVE', expect: 'EITHER', cueDelta: 0, cueId: cue.id,
      apply: p => moveOperatorCue(p, cue.id, rng() < 0.5 ? -1 : 1) }));
    add(1, () => {
      const target = pick(rng, cues);
      return { name: 'REORDER', expect: 'EITHER', cueDelta: 0, cueId: cue.id,
        apply: p => reorderOperatorCue(p, cue.id, target.id, rng() < 0.5 ? 'before' : 'after') };
    });
    if (playable(cue)) add(3, () => {
      const variants = [{ fadeInMs: int(rng, 0, 10000) }, { fadeOutMs: int(rng, 0, 10000), loop: false },
        { loop: true, fadeOutMs: 0, repeatCount: 1 }, { gainDb: -int(rng, 0, 60) }, { pan: (int(rng, -10, 10)) / 10 },
        { playbackRate: [0.5, 1, 1.5, 2][int(rng, 0, 3)] }, { loop: false, repeatCount: int(rng, 1, 20) }];
      const changes = pick(rng, variants);
      return { name: 'EDIT_PLAYBACK', expect: 'ACCEPT', cueDelta: 0, cueId: cue.id,
        apply: p => updateCuePlayback(p, cue.id, changes) };
    });
    add(1, () => {
      const changes = pick(rng, [{ gainDb: 6 }, { fadeInMs: -1 }, { volume: 1 }, { loop: true, repeatCount: 3 },
        { pan: 2 }, { playbackRate: 0 }, { loop: true, fadeOutMs: 500 }]);
      return { name: 'EDIT_PLAYBACK_INVALID', expect: 'REJECT', apply: p => updateCuePlayback(p, cue.id, changes) };
    });
    const index = cues.indexOf(cue);
    const others = cues.filter(item => item.id !== cue.id).map(item => item.id);
    add(3, () => {
      const stopCueIds = others.length && rng() < 0.4 ? [...new Set([pick(rng, others), pick(rng, others)])] : [];
      const canFollow = index < cues.length - 1;
      const mode = canFollow ? pick(rng, ['MANUAL', 'AUTO_CONTINUE', 'AUTO_FOLLOW']) : 'MANUAL';
      const changes = { mode, delayMs: mode === 'MANUAL' ? 0 : int(rng, 0, 5000), loop: false,
        fadeInMs: int(rng, 0, 3000), fadeOutMs: int(rng, 0, 3000), stopCueIds };
      return { name: 'EDIT_AUTOMATION', expect: 'ACCEPT', cueDelta: 0, cueId: cue.id,
        apply: p => updateCueAutomation(p, cue.id, changes) };
    });
    add(1, () => {
      const last = cues.at(-1);
      const variants = [[last.id, { mode: 'AUTO_CONTINUE', delayMs: 100 }], [cue.id, { stopCueIds: [cue.id] }],
        [cue.id, { colour: 'red' }], [cue.id, { mode: 'MANUAL', delayMs: 500 }], [cue.id, { stopCueIds: ['cue-9999'] }]];
      const [target, changes] = pick(rng, variants);
      return { name: 'EDIT_AUTOMATION_INVALID', expect: 'REJECT', apply: p => updateCueAutomation(p, target, changes) };
    });
    add(1, () => ({ name: 'EDIT_DETAILS', expect: 'ACCEPT', cueDelta: 0, cueId: cue.id,
      apply: p => updateCueOperatorDetails(p, cue.id, { label: 'Cue ' + int(rng, 1, 999),
        trigger: rng() < 0.5 ? 'ANA: ¿Has oído eso?' : '', notes: rng() < 0.3 ? 'Fade with the lights' : '' }) }));
    add(1, () => ({ name: 'EDIT_DETAILS_INVALID', expect: 'REJECT',
      apply: p => updateCueOperatorDetails(p, cue.id, { label: '  ' }) }));
    if (asset && cue.actions.length === 1 && cue.actions[0].type === 'PLAN_AUDIO') add(2, () => ({
      name: 'ASSIGN_AUDIO', expect: 'ACCEPT', cueDelta: 0, cueId: cue.id, apply: p => assignAudioToCue(p, cue.id, asset.id) }));
    if (cue.actions.length === 1 && cue.actions[0].type === 'PLAN_AUDIO') add(1, () => ({
      name: 'SET_RESOLUTION', expect: 'ACCEPT', cueDelta: 0, apply: p => setCueSoundResolution(p, cue.id, 'GENERATE') }));
    if (cue.actions.every(a => a.type === 'PLAY')) add(1, () => ({
      name: 'SET_RESOLUTION_ON_PLAY', expect: 'REJECT', apply: p => setCueSoundResolution(p, cue.id, 'DEFER') }));
  }
  if (cues.length || project.proposals.length) add(1, () => ({ name: 'REPLACE_SCRIPT_GUARDED', expect: 'REJECT',
    apply: p => replaceShowScript(p, 'Overwritten text') }));
  if (project.assets.length < 12) add(1, () => ({ name: 'ADD_ASSET', expect: 'ACCEPT', cueDelta: 0,
    apply: p => addAudioReference(p, 'sfx-' + int(rng, 1, 999) + '.wav') }));
  add(3, () => ({ name: 'READ', expect: 'READ' }));
  add(2, () => ({ name: 'QUEUE', expect: 'QUEUE' }));
  add(2, () => ({ name: 'AGENT', expect: 'AGENT' }));
  add(1, () => ({ name: 'SAVE_RELOAD', expect: 'RELOAD' }));
  add(1, () => ({ name: 'CORRUPT_LOAD', expect: 'CORRUPT' }));
  return pick(rng, options)();
}

function runRead(rng, project, state, ctx, where) {
  const before = snap(project), queue = snap(state.queue);
  const reads = [
    () => searchScript(parseScript(project.scriptText), pick(rng, ['eso', 'door', 'reloj', 'zzz', ''])),
    () => inspectShowReadiness(project, () => rng() < 0.5),
    () => buildAgentContext(project, { selectedCueId: project.cues[0]?.id ?? null }),
    () => auditAgentProject(project),
    () => serializeShowProject(project),
  ];
  try { pick(rng, reads)(); } catch (error) { ctx.check(false, 'READ_THROWS', { ...where, error: error.message }); }
  ctx.check(snap(project) === before, 'READ_DOES_NOT_MUTATE_PROJECT', where);
  ctx.check(snap(state.queue) === queue, 'READ_DOES_NOT_MOVE_PREPARED_CUE', where);
}

function runQueue(rng, project, state, ctx, where) {
  const cues = project.cues;
  const before = state.queue;
  const action = pick(rng, ['START', 'SELECT', 'COMPLETE', 'SKIP', 'BACK']);
  try {
    if (action === 'START') state.queue = startOperatorQueue(cues);
    else if (action === 'SELECT' && cues.length) state.queue = prepareOperatorCue(state.queue, cues, pick(rng, cues).id);
    else if (action === 'COMPLETE' && state.queue.preparedCueId) {
      const index = cues.findIndex(cue => cue.id === state.queue.preparedCueId);
      state.queue = completePreparedCue(state.queue, cues, state.queue.preparedCueId);
      ctx.check(state.queue.preparedCueId === (cues[index + 1]?.id ?? null), 'COMPLETE_ADVANCES_ONE', where);
    } else if (action === 'SKIP' && state.queue.preparedCueId) state.queue = skipPreparedCue(state.queue, cues);
    else if (action === 'BACK') state.queue = previousOperatorCue(state.queue, cues);
  } catch (error) {
    ctx.check(false, 'QUEUE_ACTION_THROWS', { ...where, action, error: error.message });
    state.queue = before;
  }
}

function agentOps(rng, project) {
  const cues = project.cues;
  const ops = [];
  for (let i = 0; i < int(rng, 1, 3); i += 1) {
    const cue = cues.length ? pick(rng, cues) : null;
    const roll = rng();
    if (!cue || roll < 0.3) ops.push({ op: 'CREATE_CUE', afterCueId: cue?.id ?? null, label: 'Agent cue ' + i });
    else if (roll < 0.6 && playable(cue)) ops.push({ op: 'UPDATE_CUE', cueId: cue.id, changes: { fadeInMs: int(rng, 0, 4000) } });
    else if (roll < 0.75) ops.push({ op: 'UPDATE_CUE', cueId: cue.id, changes: { label: 'Agent label ' + i } });
    else if (roll < 0.9 && cues.length > 1) {
      const target = pick(rng, cues);
      ops.push({ op: 'REORDER_CUE', cueId: cue.id, targetCueId: target.id, position: rng() < 0.5 ? 'before' : 'after' });
    } else ops.push({ op: 'DELETE_CUE', cueId: cue.id });
  }
  return ops;
}

function runAgent(rng, project, state, ctx, where) {
  const ops = agentOps(rng, project);
  const pristine = snap(project);
  let plan;
  try { plan = prepareAgentPlan(project, ops); } catch (error) {
    const cause = String(error.cause?.message ?? error.message);
    ctx.check(snap(project) === pristine, 'REFUSED_AGENT_PLAN_DOES_NOT_MUTATE', where);
    // Ops generated against the pre-plan show may target a cue an earlier op in
    // the same batch deleted (all cues here are DRAFT, so CUE_NOT_EDITABLE also
    // means "missing"); that is a harness-generated stale batch, not a defect.
    const stale = /not found|CUE_NOT_EDITABLE/i.test(cause);
    const kind = stale ? 'AGENT_PLAN_REFUSED_STALE_TARGET' : /NO_CHANGES/.test(cause) ? 'AGENT_PLAN_NO_OP' : 'AGENT_PLAN_REFUSED';
    ctx.finding(kind, { ...where, code: error.message, cause: cause.slice(0, 160) });
    return project;
  }
  const before = snap(project);
  let refused = false;
  try { commitAgentPlan(project, plan, { editable: false }); } catch (error) { refused = /AGENT_EDIT_NOT_ALLOWED/.test(error.message); }
  ctx.check(refused, 'AGENT_COMMIT_REQUIRES_EDITABLE', where);
  ctx.check(snap(project) === before, 'AGENT_REFUSAL_DOES_NOT_MUTATE', where);
  let committed;
  try { committed = commitAgentPlan(project, plan, { editable: true }); } catch (error) {
    ctx.check(false, 'AGENT_COMMIT_OF_FRESH_PLAN_FAILS', { ...where, error: error.message });
    return project;
  }
  const created = plan.changes.filter(change => change.kind === 'CREATED').length;
  const deleted = plan.changes.filter(change => change.kind === 'DELETED').length;
  ctx.check(committed.project.cues.length === project.cues.length + created - deleted, 'AGENT_PREVIEW_MATCHES_COMMIT', where);
  let stale = false;
  try { commitAgentPlan(committed.project, plan, { editable: true }); } catch (error) { stale = /STALE_AGENT_PLAN|AGENT_PLAN/.test(error.message); }
  ctx.check(stale, 'AGENT_DOUBLE_COMMIT_REFUSED', where);
  if (rng() < 0.5) {
    const restored = undoAgentPlan(committed.project, committed.undo, { editable: true });
    ctx.check(isDeepStrictEqual(clone(restored), clone(project)), 'AGENT_UNDO_EXACT', where);
    return restored;
  }
  return committed.project;
}

function runCorrupt(rng, project, ctx, where) {
  const doc = JSON.parse(serializeShowProject(project));
  const variants = [
    d => { d.unexpectedRoot = true; },
    d => { d.schemaVersion = 99; },
    d => { if (d.cues[0]) d.cues[0].sourceLineIds = ['L99999']; else d.assets = 'nope'; },
    d => { if (d.cues.length > 1) d.cues[1].id = d.cues[0].id; else d.proposals = [{ id: 1 }]; },
    d => { if (d.cues[0]) d.cues[0].actions = [{ type: 'PLAY', assetId: 'asset-404' }]; else d.scriptText = 7; },
    d => { d.name = ''; },
  ];
  const variant = int(rng, 0, variants.length);
  let raw;
  if (variant === variants.length) raw = serializeShowProject(project).slice(0, -3);
  else { variants[variant](doc); raw = JSON.stringify(doc); }
  let rejected = false;
  try { deserializeShowProject(raw); } catch { rejected = true; }
  ctx.check(rejected, 'CORRUPT_PROJECT_REJECTED', { ...where, variant });
}

/** Deterministic fake transport and timers for the automation runtime. */
export async function runTransportScenario(rng, project, ctx, { actions = 30 } = {}) {
  const cues = project.cues;
  if (!cues.length) return { actions: 0 };
  const plan = validateCueAutomationPlan(cues.map(cue => ({ id: cue.id, automation: cue.automation })));
  const timers = new Map();
  let nextTimer = 0, explicitGo = null, cancelled = false, failNext = false, deferred = null;
  const goCalls = [];
  const transport = {
    go: cueId => {
      goCalls.push({ cueId, explicit: explicitGo === cueId, afterCancel: cancelled });
      if (failNext) { failNext = false; return Promise.reject(new Error('Injected decode failure')); }
      if (deferred) { const d = deferred; deferred = null; return d.promise; }
      return Promise.resolve();
    },
    stopCue: () => {}, stopAll: () => {},
  };
  const runtime = createCueAutomationRuntime({
    plan, transport,
    schedule: (fn, ms) => { nextTimer += 1; timers.set(nextTimer, { fn, ms }); return nextTimer; },
    cancel: token => { timers.delete(token); },
  });
  const flush = async () => {
    const due = [...timers.entries()];
    timers.clear();
    for (const [, timer] of due) { explicitGo = null; timer.fn(); }
    await new Promise(r => setImmediate(r));
  };
  const where = { phase: 'TRANSPORT' };
  let count = 0;
  for (; count < actions; count += 1) {
    const action = pick(rng, ['GO', 'GO', 'GO', 'END', 'END', 'STOP', 'STOP_ALL', 'FLUSH', 'FLUSH', 'FAIL_GO', 'LATE_GO']);
    const cue = pick(rng, cues);
    const status = runtime.getStatus();
    if (action === 'GO' || action === 'FAIL_GO') {
      if (status.activeCueIds.includes(cue.id)) continue;
      cancelled = false; explicitGo = cue.id; failNext = action === 'FAIL_GO';
      const instruction = planCueGo(plan, cue.id);
      const callsBefore = goCalls.length;
      let ok;
      try { ok = await runtime.go(cue.id); } catch { ok = 'THREW'; }
      ctx.check(goCalls.length === callsBefore + 1 && goCalls.at(-1).cueId === cue.id, 'GO_CALLS_TRANSPORT_ONCE', where);
      if (action === 'FAIL_GO') {
        const after = runtime.getStatus();
        ctx.check(ok === 'THREW' && !after.activeCueIds.includes(cue.id) && !after.pendingFollowCueIds.includes(cue.id),
          'FAILED_GO_LEAVES_NO_ACTIVE_OR_PENDING', where);
      } else if (instruction.trigger === 'AFTER_GO' && instruction.nextCueId) {
        ctx.check(runtime.getStatus().pendingFollowCueIds.includes(cue.id), 'AUTO_CONTINUE_SCHEDULED_AT_GO', where);
      } else if (instruction.trigger !== 'AFTER_GO') {
        ctx.check(!runtime.getStatus().pendingFollowCueIds.includes(cue.id), 'NO_FOLLOW_AT_GO_UNLESS_AUTO_CONTINUE', where);
      }
    } else if (action === 'LATE_GO') {
      if (status.activeCueIds.includes(cue.id)) continue;
      let release;
      deferred = { promise: new Promise(r => { release = r; }) };
      cancelled = false; explicitGo = cue.id;
      const pendingGo = runtime.go(cue.id);
      runtime.cancelAll();
      cancelled = true;
      release();
      const outcome = await pendingGo.catch(() => 'THREW');
      const after = runtime.getStatus();
      ctx.check(outcome === false && after.pendingFollowCueIds.length === 0 && after.activeCueIds.length === 0,
        'LATE_TRANSPORT_RESULT_AFTER_STOP_ALL_IGNORED', where);
    } else if (action === 'END') {
      const active = status.activeCueIds;
      if (!active.length) continue;
      const id = pick(rng, active);
      runtime.endedNaturally(id);
      const instruction = planCueGo(plan, id);
      if (instruction.trigger === 'ON_NATURAL_END' && instruction.nextCueId)
        ctx.check(runtime.getStatus().pendingFollowCueIds.includes(id), 'AUTO_FOLLOW_SCHEDULED_AT_END', where);
    } else if (action === 'STOP') {
      runtime.stopCue(cue.id);
      const after = runtime.getStatus();
      ctx.check(!after.activeCueIds.includes(cue.id) && !after.pendingFollowCueIds.includes(cue.id), 'STOP_CUE_CLEARS_ITS_FOLLOW', where);
    } else if (action === 'STOP_ALL') {
      runtime.cancelAll();
      cancelled = true;
      const after = runtime.getStatus();
      ctx.check(after.activeCueIds.length === 0 && after.pendingFollowCueIds.length === 0, 'STOP_ALL_CLEARS_EVERYTHING', where);
      ctx.check(timers.size === 0, 'STOP_ALL_CANCELS_TIMERS', where);
      const before = goCalls.length;
      await flush();
      ctx.check(goCalls.length === before, 'NO_GO_AFTER_STOP_ALL', where);
    } else if (action === 'FLUSH') {
      const pendingSources = runtime.getStatus().pendingFollowCueIds;
      const before = goCalls.length;
      await flush();
      const fired = goCalls.slice(before);
      const expectedTargets = pendingSources.map(id => planCueGo(plan, id).nextCueId);
      ctx.check(fired.every(call => !call.explicit && expectedTargets.includes(call.cueId)), 'FOLLOW_ONLY_TO_PLANNED_NEXT', where);
      ctx.check(fired.length <= pendingSources.length, 'FOLLOW_FIRES_AT_MOST_ONCE_PER_PENDING', where);
    }
  }
  ctx.check(goCalls.every(call => call.explicit || !call.afterCancel), 'NO_AUTOMATIC_GO_AFTER_CANCEL', where);
  runtime.dispose();
  const disposedCalls = goCalls.length;
  await flush();
  let disposedGoRefused = false;
  try { await runtime.go(cues[0].id); } catch { disposedGoRefused = true; }
  ctx.check(disposedGoRefused && goCalls.length === disposedCalls, 'DISPOSE_IS_FINAL', where);
  return { actions: count };
}

export async function runScenario(seed, { steps = 30, transportActions = 30 } = {}) {
  const rng = mulberry32(seed);
  const ctx = new Ctx(seed);
  const { lang, text } = syntheticScript(rng);
  let project = createNewShow({ id: 'show-' + seed, name: 'Synthetic ' + seed });
  project = replaceShowScript(project, text);
  for (let i = 0; i < int(rng, 0, 3); i += 1) project = addAudioReference(project, 'seed-' + i + '.wav');
  const state = { scriptText: project.scriptText, lineCount: parseScript(project.scriptText).length,
    queue: startOperatorQueue(project.cues) };
  const counts = { accepted: 0, expectedRejections: 0, domainRefusals: 0, validRejected: 0, invalidAccepted: 0 };
  const opCounts = {};
  checkShowInvariants(project, state, ctx, { step: 0, op: 'CREATE' });
  for (let step = 1; step <= steps; step += 1) {
    const op = buildOperation(rng, project);
    opCounts[op.name] = (opCounts[op.name] ?? 0) + 1;
    const where = { step, op: op.name };
    if (op.expect === 'READ') runRead(rng, project, state, ctx, where);
    else if (op.expect === 'QUEUE') runQueue(rng, project, state, ctx, where);
    else if (op.expect === 'AGENT') project = runAgent(rng, project, state, ctx, where);
    else if (op.expect === 'RELOAD') project = deserializeShowProject(serializeShowProject(project));
    else if (op.expect === 'CORRUPT') runCorrupt(rng, project, ctx, where);
    else {
      const before = snap(project);
      let next = null, error = null;
      try { next = op.apply(project); } catch (caught) { error = caught; }
      ctx.check(snap(project) === before, 'INPUT_PROJECT_NOT_MUTATED', where);
      if (error) {
        if (op.expect === 'REJECT') counts.expectedRejections += 1;
        else if (op.expect === 'EITHER') { counts.domainRefusals += 1; ctx.finding('DOMAIN_REFUSAL_' + op.name, { ...where, error: error.message }); }
        else { counts.validRejected += 1; ctx.finding('VALID_OPERATION_REJECTED_' + op.name, { ...where, error: error.message }); }
      } else if (op.expect === 'REJECT') {
        counts.invalidAccepted += 1;
        ctx.check(false, 'INVALID_INPUT_ACCEPTED', where);
      } else {
        counts.accepted += 1;
        if (op.cueDelta !== null && op.cueDelta !== undefined)
          ctx.check(next.cues.length === project.cues.length + op.cueDelta, 'CUE_COUNT_DELTA', { ...where, expected: op.cueDelta });
        if (op.proposalDelta) ctx.check(next.proposals.length === project.proposals.length + op.proposalDelta, 'PROPOSAL_DELTA', where);
        if (op.name === 'PROPOSE') ctx.check(next.proposals.slice(-op.proposalDelta).every(p => p.status === 'PENDING'), 'AI_PROPOSALS_START_PENDING', where);
        if (op.name === 'APPROVE') {
          const created = next.cues.at(-1);
          const proposal = next.proposals.find(p => p.id === op.proposalId);
          ctx.check(created.sourceProposalId === op.proposalId && proposal.status === 'APPROVED' &&
            isDeepStrictEqual([...created.sourceLineIds], [...proposal.sourceLineIds]), 'APPROVAL_PRESERVES_PROVENANCE', where);
        }
        if (op.name === 'INSERT_FROM_LINES') {
          const created = next.cues.find(cue => !project.cues.some(old => old.id === cue.id));
          ctx.check(created && created.sourceLineIds.every(id => op.lineSelection.includes(id)) &&
            created.sourceLineIds.length === op.lineSelection.length, 'MANUAL_CUE_KEEPS_SELECTED_LINES', where);
        }
        if (['EDIT_PLAYBACK', 'EDIT_AUTOMATION', 'EDIT_DETAILS', 'MOVE', 'REORDER'].includes(op.name)) {
          const a = project.cues.find(cue => cue.id === op.cueId), b = next.cues.find(cue => cue.id === op.cueId);
          ctx.check(b && isDeepStrictEqual([...a.sourceLineIds], [...b.sourceLineIds]) && snap(a.actions) === snap(b.actions) &&
            a.sourceProposalId === b.sourceProposalId, 'EDIT_PRESERVES_SOURCE_AND_AUDIO', where);
        }
        project = next;
      }
    }
    if (state.queue.preparedCueId && !project.cues.some(cue => cue.id === state.queue.preparedCueId)) {
      // Mirrors the UI contract: removing the prepared cue repositions without GO.
      state.queue = startOperatorQueue(project.cues);
      ctx.finding('PREPARED_CUE_REMOVED_BY_EDIT', where);
    }
    checkShowInvariants(project, state, ctx, where);
  }
  const transport = await runTransportScenario(rng, project, ctx, { actions: transportActions });
  return { seed, lang, steps, transportActions: transport.actions, checks: ctx.checks, failures: ctx.failures,
    findings: ctx.findings, counts, opCounts, finalCues: project.cues.length, finalProposals: project.proposals.length };
}

export async function runStateMachineCampaign({ seed = 20261101, scenarios = 200, steps = 30, transportActions = 30,
  outputDir = null, onScenario = null, startIndex = 0 } = {}) {
  const totals = { scenarios: 0, steps: 0, transportActions: 0, checks: 0, failures: 0,
    accepted: 0, expectedRejections: 0, domainRefusals: 0, validRejected: 0, invalidAccepted: 0 };
  const failureKinds = {}, findingKinds = {}, opCounts = {};
  const hash = createHash('sha256');
  if (outputDir) {
    await mkdir(outputDir, { recursive: true });
    // A fresh run replaces previous rows; a resumed run (startIndex > 0) appends.
    if (startIndex === 0) await writeFile(join(outputDir, 'cases.jsonl'), '');
  }
  for (let index = startIndex; index < scenarios; index += 1) {
    const result = await runScenario(seed + index * 7919, { steps, transportActions });
    totals.scenarios += 1; totals.steps += result.steps; totals.transportActions += result.transportActions;
    totals.checks += result.checks; totals.failures += result.failures.length;
    for (const key of ['accepted', 'expectedRejections', 'domainRefusals', 'validRejected', 'invalidAccepted'])
      totals[key] += result.counts[key];
    for (const f of result.failures) (failureKinds[f.invariant] ??= { count: 0, firstRepro: f }).count += 1;
    for (const f of result.findings) (findingKinds[f.kind] ??= { count: 0, firstRepro: f }).count += 1;
    for (const [name, value] of Object.entries(result.opCounts)) opCounts[name] = (opCounts[name] ?? 0) + value;
    const row = { index, seed: result.seed, lang: result.lang, steps: result.steps, checks: result.checks,
      failures: result.failures.slice(0, 5), failureCount: result.failures.length,
      findingKinds: [...new Set(result.findings.map(f => f.kind))], counts: result.counts,
      finalCues: result.finalCues, finalProposals: result.finalProposals };
    hash.update(JSON.stringify(row));
    if (outputDir) await appendFile(join(outputDir, 'cases.jsonl'), JSON.stringify(row) + '\n');
    if (onScenario) await onScenario(index, row);
  }
  const summary = { kind: 'RUNQ_STATE_MACHINE_CAMPAIGN', offline: true, providerRequests: 0, seed, scenarios, steps,
    startIndex, totals, failureKinds, findingKinds, opCounts, digest: hash.digest('hex') };
  if (outputDir) await writeFile(join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  return summary;
}

function parseArgs(argv) {
  const options = { seed: 20261101, scenarios: 200, steps: 30, transportActions: 30, output: null };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i], value = argv[i + 1];
    if (key === '--out') { options.output = value; continue; }
    const map = { '--seed': 'seed', '--scenarios': 'scenarios', '--steps': 'steps', '--transport-actions': 'transportActions' };
    if (!map[key] || !/^\d+$/.test(value ?? '')) throw new TypeError('Usage: --seed N --scenarios N --steps N --transport-actions N --out DIR');
    options[map[key]] = Number(value);
  }
  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const options = parseArgs(process.argv.slice(2));
  const started = Date.now();
  const summary = await runStateMachineCampaign({ ...options, outputDir: options.output ? resolve(options.output) : null });
  const t = summary.totals;
  console.log(`STATE_MACHINE_OFFLINE scenarios=${t.scenarios} steps=${t.steps} transportActions=${t.transportActions} ` +
    `checks=${t.checks} failures=${t.failures} expectedRejections=${t.expectedRejections} ` +
    `validRejected=${t.validRejected} domainRefusals=${t.domainRefusals} invalidAccepted=${t.invalidAccepted} ` +
    `ms=${Date.now() - started} digest=${summary.digest.slice(0, 12)} providerRequests=0`);
  for (const [kind, value] of Object.entries(summary.failureKinds)) console.log('FAIL', kind, value.count, JSON.stringify(value.firstRepro));
  for (const [kind, value] of Object.entries(summary.findingKinds)) console.log('FINDING', kind, value.count, JSON.stringify(value.firstRepro));
  process.exitCode = t.failures ? 1 : 0;
}
