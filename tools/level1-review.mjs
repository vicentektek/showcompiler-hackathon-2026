#!/usr/bin/env node
/**
 * Offline human-review document generator for the RunQ Level 1 corpus.
 * Zero network calls, zero provider access, zero paid inference, no secrets.
 * Reads only fixtures/qa/level1 and writes a review draft into
 * artifacts/level1-qa/ (gitignored). The document stays PROVISIONAL: a
 * theatrical sound operator must approve or reject each case by hand.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { readLevel1Corpus, summarizeLevel1Corpus, PROVISIONAL } from './level1Corpus.mjs';

const OUTPUT_DIR = 'artifacts/level1-qa';
const TRANSPORT_LABELS = new Set(['PLAY', 'STOP', 'CONTINUE', 'SILENCE']);

function tableCell(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function scriptBlock(item) {
  const rows = [];
  let index = 1;
  for (const text of item.scriptText.split('\n')) {
    rows.push('L' + index + '  ' + text);
    index += 1;
  }
  return rows.join('\n');
}

function eventLine(item, lineId) {
  const lineIndex = Number(lineId.slice(1)) - 1;
  return item.scriptText.split('\n')[lineIndex] ?? '(line out of range)';
}

export function renderLevel1ReviewText(corpus) {
  if (corpus?.corpus !== 'RUNQ_LEVEL1_EVAL_CORPUS') {
    throw new TypeError('Invalid level1 corpus for review rendering');
  }
  const totals = summarizeLevel1Corpus(corpus);
  const rows = [
    '# RunQ — Level 1 corpus human review (OFFLINE DRAFT)',
    '',
    '**Status: ' + totals.humanReviewStatus + '.** This document is generated offline from the original',
    'Level 1 corpus (ten original scenarios). No provider was called, no model quality is measured,',
    'and nothing here runs, approves or triggers a cue.',
    '',
    'Curriculum level: ' + corpus.level.index + ' — ' + corpus.level.name +
      ' (manifest: ' + corpus.level.manifest + ', gate: ' + corpus.level.gate.kind + ' >= ' +
      corpus.level.gate.exactCasesRequired + ' exact cases).',
    'Pool policy: ' + corpus.poolPolicy,
    'Qualification policy: ' + corpus.qualificationPolicy,
    'Gold provenance: ' + corpus.provenance,
    '',
    '## Review protocol for the theatrical sound operator',
    '',
    '1. Read the script, the expected events, justifications and negatives of every case below.',
    '2. Approve or reject each annotation with your own notes; the gold status is **' + PROVISIONAL + '**',
    '   and does not qualify for curriculum progression until a person signs the review.',
    '3. Cases in the qualification pool support level 1 qualification evidence only and must never',
    '   be used for prompt optimization or tuning of any generative model.',
    '4. Editing the source script text invalidates the L# references and the fixture must be re-screened.',
    '5. Never turn this draft into truth silently: update the manifest only after human sign-off.',
    '',
    '## Totals',
    '',
    '| Scenarios | Scene windows | Script lines | Expected events | Forbidden PLAY lines | Languages | Pools |',
    '|---:|---:|---:|---:|---:|' + '---|---|',
    '| ' + totals.cases + ' | ' + totals.windows + ' | ' + totals.scriptLines + ' | ' +
      totals.expectedEvents + ' | ' + totals.forbiddenPlayLines + ' | ' +
      Object.entries(totals.languages).map(([code, count]) => code + '×' + count).join(', ') + ' | ' +
      Object.entries(totals.pools).map(([pool, count]) => pool + '×' + count).join(', ') + ' |',
    '',
    '## Scenario index',
    '',
    '| Id | Show type | Document | Language | Pool | Tuning use | Windows | Expected | Forbidden | Difficulty |',
    '|---|---|---|---|---|---|---:|---:|---:|:---:|',
    ...corpus.cases.map(item => '| ' + [
      item.id, item.type, item.documentKind, item.language, item.pool,
      item.tuningUse ? 'allowed' : 'locked', item.sceneWindowCount,
      item.expected.length, item.forbiddenPlayLineIds.length,
      item.difficulty.rating + '/3',
    ].map(tableCell).join(' | ') + ' |'),
    '',
  ];
  for (const item of corpus.cases) {
    rows.push('---');
    rows.push('');
    rows.push('## ' + item.id + ' — «' + item.title + '»');
    rows.push('');
    rows.push('- Show type: ' + item.type + ' / document kind: ' + item.documentKind +
      ' / language: ' + item.language);
    rows.push('- Difficulty: ' + item.difficulty.rating + '/3 — focus: ' + item.difficulty.focus);
    rows.push('- Pool: ' + item.pool + ' — tuning use: ' + (item.tuningUse ? 'allowed (development pool)' : 'locked (qualification pool, no prompt optimization)'));
    rows.push('- Scene windows: ' + item.sceneWindowCount + ' (' + item.windowIds.join(', ') + ') over ' + item.lineCount + ' script lines.');
    rows.push('- Gold review status: **' + item.reviewStatus + '**');
    rows.push('');
    rows.push('### Source script (stable L# references)');
    rows.push('');
    rows.push('```text');
    rows.push(scriptBlock(item));
    rows.push('```');
    rows.push('');
    rows.push('### Expected explicit audio events (' + item.expected.length + ')');
    rows.push('');
    rows.push('| Line | Transport | Kind | Basis | Line text | Justification |');
    rows.push('|---|---|---|---|---|---|');
    const justificationByLine = new Map(item.justifications.expected.map(justification => [justification.lineId, justification.text]));
    for (const event of item.expected) {
      if (!TRANSPORT_LABELS.has(event.transport)) {
        throw new TypeError('Unknown transport in corpus case ' + item.id);
      }
      rows.push('| ' + event.lineId + ' | ' + event.transport + ' | ' + event.cueKind + ' | ' + event.basis +
        ' | ' + tableCell(eventLine(item, event.lineId)) + ' | ' + tableCell(justificationByLine.get(event.lineId) ?? '') + ' |');
    }
    rows.push('');
    rows.push('### Forbidden PLAY references (' + item.forbiddenPlayLineIds.length + ')');
    rows.push('');
    rows.push('| Line | Line text | Justification |');
    rows.push('|---|---|---|');
    const negativeByLine = new Map(item.justifications.negative.map(justification => [justification.lineId, justification.text]));
    for (const lineId of item.forbiddenPlayLineIds) {
      rows.push('| ' + lineId + ' | ' + tableCell(eventLine(item, lineId)) + ' | ' + tableCell(negativeByLine.get(lineId) ?? '') + ' |');
    }
    rows.push('');
    rows.push('### Operator sign-off');
    rows.push('');
    rows.push('- Decision: [ ] APROBAR [ ] APROBAR CON NOTAS [ ] RECHAZAR');
    rows.push('- Revisora (nombre + fecha): ______________________');
    rows.push('- Notas: ______________________________________________________________');
    rows.push('');
  }
  rows.push('---');
  rows.push('');
  rows.push('Generated offline by tools/level1-review.mjs. No provider calls, no credentials, no audio transport.');
  rows.push('This draft never qualifies a level: qualification needs human-reviewed provider evidence per the curriculum.');
  rows.push('');
  return rows.join('\n');
}

export async function runLevel1Review({rootDir, outputDir = OUTPUT_DIR} = {}) {
  const corpus = await readLevel1Corpus(rootDir ? {rootDir} : {});
  const totals = summarizeLevel1Corpus(corpus);
  const text = renderLevel1ReviewText(corpus);
  const json = JSON.stringify({
    kind: 'RUNQ_LEVEL1_CORPUS_REVIEW_DRAFT',
    source: 'tools/level1-review.mjs',
    claim: 'OFFLINE_HUMAN_REVIEW_DRAFT_NO_MODEL_RESULTS',
    humanReviewStatus: corpus.humanReviewStatus,
    totals,
    cases: corpus.cases.map(item => ({
      id: item.id, title: item.title, type: item.type, documentKind: item.documentKind,
      language: item.language, pool: item.pool, tuningUse: item.tuningUse,
      difficulty: {...item.difficulty}, sceneWindowCount: item.sceneWindowCount,
      reviewStatus: item.reviewStatus, windowIds: item.windowIds, lineCount: item.lineCount,
      expected: item.expected, forbiddenPlayLineIds: item.forbiddenPlayLineIds,
      justifications: item.justifications,
    })),
  }, null, 2) + '\n';
  const outDir = resolve(process.cwd(), outputDir);
  await mkdir(outDir, {recursive: true});
  const mdPath = join(outDir, 'review.md');
  const jsonPath = join(outDir, 'review.json');
  await Promise.all([
    writeFile(mdPath, text, 'utf8'),
    writeFile(jsonPath, json, 'utf8'),
  ]);
  return {corpus, totals, text, mdPath, jsonPath};
}

if (process.argv[1] && /(?:^|[/\\])level1-review\.mjs$/.test(process.argv[1])) {
  if (process.argv.length !== 2) {
    console.error('Usage: node tools/level1-review.mjs (no arguments)');
    process.exitCode = 1;
  } else {
    try {
      const review = await runLevel1Review({});
      console.log('OFFLINE LEVEL 1 REVIEW — ' + review.totals.cases + ' scenarios / ' +
        review.totals.windows + ' scene windows / ' + review.totals.expectedEvents +
        ' expected events / ' + review.totals.forbiddenPlayLines + ' forbidden PLAY lines');
      console.log('Status: ' + review.totals.humanReviewStatus + '. NO provider calls, NO measured model quality.');
      console.log('Review document: ' + review.mdPath);
      console.log('Sanitized JSON: ' + review.jsonPath);
    } catch (error) {
      console.error('Level 1 review unavailable: ' + (error instanceof Error ? error.message : 'unknown error'));
      process.exitCode = 1;
    }
  }
}
