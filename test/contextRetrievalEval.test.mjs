import test from 'node:test';
import assert from 'node:assert/strict';
import {buildShow, legacyAgentContext, serverAccepts, runContextRetrievalEval, summarize} from '../tools/runq-context-retrieval-eval.mjs';
import {buildAgentContext} from '../src/core/agentCore.mjs';
import {SUITES} from '../tools/runq-campaign.mjs';

test('context experiment reproduces the legacy rejection and the retrieval fix on a 1200-line show', () => {
  const {project, targets} = buildShow({size: 1200, locale: 'es', seed: 7});
  const legacy = legacyAgentContext(project);
  assert.equal(serverAccepts(legacy), false, 'old 120-line window with 60 cues exceeds the route budget');
  const target = targets[0];
  const fixed = buildAgentContext(project, {instruction: target.direct});
  assert.equal(serverAccepts(fixed), true);
  assert.ok(fixed.lines.some(l => l.id === target.lineId), 'planted direction is retrieved');
  assert.equal(fixed.lines.find(l => l.id === target.lineId).text, project.scriptText.split('\n')[Number(target.lineId.slice(1)) - 1]);
});

test('context experiment is deterministic, offline and reports synonym limits honestly', () => {
  const a = runContextRetrievalEval({seeds: 1, sizes: [300], locales: ['en']});
  const b = runContextRetrievalEval({seeds: 1, sizes: [300], locales: ['en']});
  assert.deepEqual(a, b);
  const s = summarize(a);
  assert.equal(s.B_RETRIEVAL.acceptedRate, 1);
  for (const t of ['LINE_REF', 'CUE_REF', 'SELECTED_CUE']) assert.equal(s['B_RETRIEVAL|' + t].usableEvidenceRate, 1, t);
  assert.ok(s['B_RETRIEVAL|KEYWORD_SYNONYM'], 'synonym tier is always measured, never dropped');
  const suite = SUITES.find(x => x.id === 'context-retrieval');
  assert.equal(suite.kind, 'offline');
  assert.deepEqual(suite.parse('CONTEXT RETRIEVAL EVAL unique=10 trials=30 checks=60 failed=0 B_accept=100.0% B_evidence=92.3% A_evidence=38.1% providerRequests=0'),
    {unique: 10, trials: 30, checks: 60, failures: 0, httpRequests: 0,
      notes: 'B_accept=100.0% B_evidence=92.3% A_evidence=38.1% (evidence availability, not Muse quality)'});
});
