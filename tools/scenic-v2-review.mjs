#!/usr/bin/env node
/** Offline preview of V1 gold annotations in the advisory V2 review categories.
 * Development corpus ONLY. No qualification scripts, models, API calls or GO.
 */
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readLevel1Corpus} from './level1Corpus.mjs';
import {bridgeV1EventsToScenicV2} from '../src/core/scenicV1Bridge.mjs';

export function buildDevelopmentReview(corpus) {
  if (corpus?.corpus !== 'RUNQ_LEVEL1_EVAL_CORPUS' ||
      corpus.humanReviewStatus !== 'PROVISIONAL_UNREVIEWED' ||
      !Array.isArray(corpus.cases)) throw new TypeError('Invalid provisional corpus');
  const cases=corpus.cases.filter(item=>item.pool==='development');
  if (!cases.length || cases.some(item=>item.reviewStatus!=='PROVISIONAL_UNREVIEWED')) {
    throw new TypeError('Unexpected review state');
  }
  return {
    version:2,
    status:'OFFLINE_PROVISIONAL_PREVIEW_NOT_MODEL_RESULTS',
    cases:cases.map(item=>({
      id:item.id,
      pool:'development',
      reviewStatus:item.reviewStatus,
      ...bridgeV1EventsToScenicV2({scriptText:item.scriptText,events:item.expected}),
    })),
  };
}

export function renderDevelopmentReview(report) {
  const out=['# RunQ — Scenic V2 development review (OFFLINE)', '',
    '**PROVISIONAL GOLD PREVIEW — NOT MODEL OUTPUT OR OPERATOR APPROVAL.**',
    'Qualification cases are excluded. No changes to V1 gold or live transport.', '',
    'A V1 event has no verified playback target, file end time or gain state.',
    'Therefore STOP/CONTINUE may remain suggestions until an operator supplies bindings.',
    'SILENCE defaults to a scenic note and never mutes the entire system.', ''];
  for(const entry of report.cases) {
    out.push('## '+entry.id, '', '| Source | V1 intent | V2 classification | Reason |',
      '|---|---|---|---|');
    for(const item of entry.items) {
      const clean=s=>String(s).replace(/\|/g,'\\|').replace(/\r?\n/g,' ');
      out.push('| '+[item.lineId,item.intent,item.disposition,item.reason].map(clean).join(' | ')+' |');
    }
    out.push('', '- [ ] Operator reviewed cue lifecycle/targets and notes.',
      '- [ ] Any necessary V2 gold revision documented separately.', '');
  }
  return out.join('\n')+'\n';
}

export async function runDevelopmentPreview({rootDir=process.cwd()}={}) {
  const corpus=await readLevel1Corpus({rootDir});
  const report=buildDevelopmentReview(corpus);
  const dir=join(rootDir,'artifacts','scenic-v2-review');
  await mkdir(dir,{recursive:true});
  await Promise.all([
    writeFile(join(dir,'review.json'),JSON.stringify(report,null,2)+'\n','utf8'),
    writeFile(join(dir,'review.md'),renderDevelopmentReview(report),'utf8'),
  ]);
  return {cases:report.cases.length,items:report.cases.reduce((n,c)=>n+c.items.length,0),directory:dir};
}

if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]) {
  runDevelopmentPreview().then(s=>console.log('SCENIC_V2_OFFLINE_ONLY '+s.cases+' development cases / '+s.items+' provisional annotations; '+s.directory))
    .catch(error=>{console.error(error.message);process.exitCode=1;});
}
