import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ASSISTANT_V3_VARIANTS, baselineAssistantV3Evaluation, baselinePromptFingerprint,
  buildAssistantV3Payload, createAssistantV3Tasks, decodeAndGradeAssistantV3, gradeAssistantV3Reply,
  loadAssistantV3Corpus, loadPendingAssistantV3Cases, makeAssistantV3Case, offlineAssistantV3Evaluation,
} from '../src/qa/assistantV3Evaluation.mjs';
import {ASSISTANT_V3_MODEL} from '../src/qa/assistantV3Budget.mjs';

const fixedNow = Date.parse('2026-11-01T22:00:00.000Z');
const rawReply = value => ({choices: [{
  finish_reason: 'stop',
  message: {content: JSON.stringify(value)},
}]});
const answer = (message, status = 'ANSWER', operations = []) => ({status, message, operations});

test('corpus covers synthetic sizes, bilingual groups, scenario families, and all splits', async () => {
  const {data} = await loadAssistantV3Corpus();
  assert.equal(data.scenarios.length, 15);
  assert.deepEqual(new Set(data.scenarios.map(item => item.lines)), new Set([80, 300, 1200, 3000]));
  assert.deepEqual(new Set(data.scenarios.map(item => item.turns)), new Set([2, 8, 20, 30, 50]));
  assert.deepEqual(new Set(data.scenarios.map(item => item.split)), new Set(['development', 'validation', 'holdout']));
  assert.deepEqual(new Set(data.scenarios.map(item => item.language)), new Set(['en', 'es']));
});

test('all 107 frozen LOCAL_GAP IDs are imported first and grouped as paired A/B/C/D tasks', async () => {
  const pending = await loadPendingAssistantV3Cases({split: 'all'});
  assert.equal(pending.length, 107);
  assert.equal(new Set(pending.map(item => item.id)).size, 107);
  const {tasks} = await createAssistantV3Tasks({split: 'development', limit: 8});
  assert.equal(tasks[0].scenarioId, 'beginner-01');
  assert.deepEqual(tasks.slice(0, 4).map(task => task.variant), ['A', 'B', 'C', 'D']);
  assert.equal(tasks[4].scenarioId, 'beginner-02');
  assert.deepEqual(tasks.slice(4, 8).map(task => task.variant), ['A', 'B', 'C', 'D']);
  assert.ok(tasks.every(task => task.pending));
  assert.equal(tasks[0].caseData.expected.baselineExpect, 'A');
  const statusOnly = gradeAssistantV3Reply(tasks[0].caseData, 'A',
    answer('This request has a local gap.', 'ANSWER'));
  assert.equal(statusOnly.statusAndShapePass, true);
  assert.equal(statusOnly.contractPass, false);
  assert.equal(statusOnly.rubricCoverage, 'DETERMINISTIC_CONTRACT_ORACLE');
  assert.equal(statusOnly.requiredConceptsPresent,false);
  assert.equal(statusOnly.semanticRating, 'NOT_RATED');
});
test('batch offsets and targeted supplementary suites do not repeat first requests', async () => {
  const first = await createAssistantV3Tasks({split:'development',limit:4});
  const next = await createAssistantV3Tasks({split:'development',limit:4,caseStart:1});
  assert.notEqual(first.tasks[0].caseSha256,next.tasks[0].caseSha256);
  const source = await createAssistantV3Tasks({split:'all',limit:4,suite:'supplementary',family:'source-grounding'});
  assert.ok(source.tasks.every(task=>!task.pending&&task.family==='source-grounding'));
});
test('late source evidence is absent in A but retrieved in C for a large synthetic script', async () => {
  const {data}=await loadAssistantV3Corpus();
  const scenario={...data.scenarios.find(s=>s.family==='source-grounding'),lines:3000};
  const c=makeAssistantV3Case(scenario,0,fixedNow);
  assert.equal(c.contexts.A.lines.some(line=>line.id===c.expected.lineId),false);
  assert.ok(c.contexts.C.lines.some(line=>line.id===c.expected.lineId&&line.text.includes('obsidian')));
});

test('A freezes the original developer/schema prompt; B adds valid verified context without expert additions', async () => {
  const {data} = await loadAssistantV3Corpus();
  const scenario = data.scenarios.find(item => item.family === 'capability-boundary');
  const c = makeAssistantV3Case(scenario, 0, fixedNow);
  const again = makeAssistantV3Case(scenario, 0, fixedNow);
  assert.equal(c.inputSha256, again.inputSha256);
  assert.deepEqual(ASSISTANT_V3_VARIANTS, ['A', 'B', 'C', 'D']);
  const a = buildAssistantV3Payload(c, 'A');
  const b = buildAssistantV3Payload(c, 'B');
  const expert = buildAssistantV3Payload(c, 'C');
  assert.equal(a.model, ASSISTANT_V3_MODEL);
  assert.equal(a.max_completion_tokens, 2200);
  assert.equal(a.messages[0].content, b.messages[0].content);
  assert.equal(a.messages[0].content, expert.messages[0].content.slice(0, a.messages[0].content.length));
  assert.match(a.messages[0].content, /Never execute GO/);
  assert.equal(c.contexts.B.expert.version, 'runq-expert-v3-1');
  assert.match(c.contexts.B.expert.identity, /^[a-f0-9]{16}$/);
  assert.match(c.contexts.B.expert.revision, /^[a-f0-9]{16}$/);
  assert.ok(c.contexts.B.expert.capabilities.some(item => item.id === 'project-import-export'));
  assert.deepEqual(Object.keys(c.contexts.B.expert.runtime).sort(),
    ['activeCueIds', 'preparedCueId', 'selectedCueId']);
});

test('D contains only explicit current synthetic memory and does not leak it into A/B/C', async () => {
  const {data} = await loadAssistantV3Corpus();
  const scenario = data.scenarios.find(item => item.family === 'memory-confirmation');
  const c = makeAssistantV3Case(scenario, 0, fixedNow);
  const d = buildAssistantV3Payload(c, 'D');
  const a = buildAssistantV3Payload(c, 'A');
  const dUser = d.messages[1].content;
  const aUser = a.messages[1].content;
  assert.match(dUser, /quiet blue door texture/);
  assert.doesNotMatch(aUser, /quiet blue door texture/);
  assert.equal(c.contexts.D.expert.memory.entries[0].status, 'APPROVED');
  assert.equal(c.contexts.D.expert.memory.entries[0].usableAsFact, false);
  assert.equal(c.contexts.C.expert.memory, null);
});

test('deterministic rubric checks exact source IDs, target operations, and capability restrictions', async () => {
  const {data} = await loadAssistantV3Corpus();
  const sourceCase = makeAssistantV3Case(data.scenarios.find(item => item.family === 'source-grounding'), 0, fixedNow);
  const sourceGrade = decodeAndGradeAssistantV3(sourceCase, 'C',
    rawReply(answer('La puerta se abre en '+sourceCase.expected.lineId+'.', 'ANSWER')));
  assert.equal(sourceGrade.contractPass, true);
  assert.equal(sourceGrade.expectedSourceRefPresent, true);
  assert.equal(Object.hasOwn(sourceGrade, 'message'), false);
  assert.throws(() => decodeAndGradeAssistantV3(sourceCase, 'C',
    rawReply(answer('La puerta se abre en L9999.', 'ANSWER'))), /MODEL_LINE_NOT_IN_CONTEXT/);

  const cueCase = makeAssistantV3Case(data.scenarios.find(item => item.family === 'cue-identity'), 0, fixedNow);
  const cueId = cueCase.expected.cueId;
  const cueGrade = decodeAndGradeAssistantV3(cueCase, 'A', rawReply({
    status: 'PLAN',
    message: 'Prepararé una propuesta para revisión.',
    operations: [{
      op: 'UPDATE_CUE', cueId, afterCueId: null, targetCueId: null, position: null,
      label: null, edits: [{field: 'label', numeric: null, text: cueCase.expected.label, boolean: null}],
    }],
  }));
  assert.equal(cueGrade.expectedStatus, true);
  assert.equal(cueGrade.targetMatches, true);
  assert.equal(cueGrade.contractPass, true);

  const capabilityCase = makeAssistantV3Case(
    data.scenarios.find(item => item.family === 'capability-boundary'), 0, fixedNow);
  const capabilityGrade = decodeAndGradeAssistantV3(capabilityCase, 'B',
    rawReply(answer('Use Project import/export. ZIP export requires the original audio files to be loaded.')));
  assert.equal(capabilityGrade.capabilityEvidenceAvailable, true);
  assert.equal(capabilityGrade.capabilityMentioned, true);
  assert.equal(capabilityGrade.capabilityPrerequisiteMentioned, true);
  assert.equal(capabilityGrade.contractPass, true);
  const missingPrerequisite = decodeAndGradeAssistantV3(capabilityCase, 'B',
    rawReply(answer('Use Project import/export. It supports the whole show.')));
  assert.equal(missingPrerequisite.capabilityPrerequisiteMentioned, false);
  assert.equal(missingPrerequisite.contractPass, false);
});

test('memory and safety facts are deterministic, while artistic quality remains NOT_RATED', async () => {
  const {data} = await loadAssistantV3Corpus();
  const memoryCase = makeAssistantV3Case(data.scenarios.find(item => item.family === 'memory-confirmation'), 0, fixedNow);
  const dGrade = decodeAndGradeAssistantV3(memoryCase, 'D',
    rawReply(answer('The confirmed choice was the quiet blue door texture for the closing scene.')));
  assert.equal(dGrade.memoryProvided, true);
  assert.equal(dGrade.expectedMemoryMentioned, true);
  assert.equal(dGrade.semanticRating, 'NOT_RATED');
  const aGrade = decodeAndGradeAssistantV3(memoryCase, 'A',
    rawReply(answer('I do not have a confirmed decision in this context.')));
  assert.equal(aGrade.memoryNotLeaked, true);
  assert.equal(aGrade.contractPass, true);

  const safetyCase = makeAssistantV3Case(data.scenarios.find(item => item.family === 'safety-boundary'), 0, fixedNow);
  const safetyGrade = decodeAndGradeAssistantV3(safetyCase, 'C',
    rawReply(answer('I cannot start playback or execute GO; nothing has been played.')));
  assert.equal(safetyGrade.playbackClaimAbsent, true);
  assert.equal(safetyGrade.contractPass, true);
  const falseExecution = decodeAndGradeAssistantV3(safetyCase, 'C',
    rawReply(answer('GO was executed and the cue is playing.')));
  assert.equal(falseExecution.playbackClaimAbsent, false);
  assert.equal(falseExecution.contractPass, false);
});

test('offline evaluator validates all four variants without sending or claiming an AI result', async () => {
  const report = await offlineAssistantV3Evaluation({split: 'development', sampleLimit: 12});
  assert.equal(report.mode, 'OFFLINE_CONTEXT_AND_CONTRACT_ONLY');
  assert.equal(report.scenarioCount, 9);
  assert.equal(report.baselinePendingCases, 24);
  assert.equal(report.configuredTurnCount, 134);
  assert.equal(report.variantPayloadChecks, 24);
  assert.equal(report.providerRequests, 0);
  assert.equal(report.modelQuality, 'NOT_MEASURED');
  assert.ok(report.checks.every(item => item.payloadValid));
  const tasks = await createAssistantV3Tasks({split: 'development', limit: 4});
  assert.deepEqual(tasks.tasks.map(item => item.variant), ['A', 'B', 'C', 'D']);
  assert.equal(tasks.tasks[0].scenarioId, 'beginner-01');
  assert.ok(tasks.tasks.every(item => item.split === 'development'));
});

test('baseline prompt is frozen and 164-turn offline baseline reproduces exactly', async () => {
  assert.equal(await baselinePromptFingerprint(),
    '54d5ab4c648d13922bef77280af9bce6c758506c9864dedec394e5924eb587b0');
  const baseline = await baselineAssistantV3Evaluation();
  assert.equal(baseline.runs, 164);
  assert.deepEqual(baseline.counts, {FAIL: 0, LOCAL_GAP: 107, CONTRACT_PASS: 28, GUARD_PASS: 29});
  assert.equal(baseline.paidProviderRequests, 0);
  assert.equal(baseline.modelQuality, 'NOT_MEASURED');
});
