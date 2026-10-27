#!/usr/bin/env node
/**
 * Offline-only report generator. Never contacts Meta, Baseten or Codex.
 *
 * node tools/cue-qa-report.mjs
 * node tools/cue-qa-report.mjs --gold local-gold.json --predictions local-predictions.json --output artifacts/cue-qa
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { evaluateStageEventCases, renderStageEventReport } from '../src/core/stageCueQa.mjs';

const DEFAULTS={
  gold:'fixtures/qa/theatre-gold-v1.json',
  predictions:'fixtures/qa/illustrative-predictions-v1.json',
  output:'artifacts/cue-qa',
};
export function parseQaArgs(args) {
  const values={...DEFAULTS};
  for(let i=0;i<args.length;i+=2){
    if(!['--gold','--predictions','--output'].includes(args[i])||
       !args[i+1]||args[i+1].startsWith('--')) {
      throw new TypeError('Usage: node tools/cue-qa-report.mjs [--gold file] [--predictions file] [--output directory]');
    }
    values[args[i].slice(2)]=args[i+1];
  }
  return values;
}
export async function runCueQa({gold,predictions,output}=DEFAULTS) {
  if (![gold,predictions,output].every(s=>typeof s==='string'&&s.length>0)) {
    throw new TypeError('QA paths must be strings');
  }
  const [goldJson,predictionJson]=await Promise.all([
    readFile(gold,'utf8').then(JSON.parse),
    readFile(predictions,'utf8').then(JSON.parse),
  ]);
  const result=evaluateStageEventCases(goldJson,predictionJson);
  await mkdir(output,{recursive:true});
  const jsonPath=join(output,'report.json');
  const mdPath=join(output,'report.md');
  await Promise.all([
    writeFile(jsonPath,JSON.stringify(result,null,2)+'\n','utf8'),
    writeFile(mdPath,renderStageEventReport(result),'utf8'),
  ]);
  return {result,jsonPath,mdPath};
}
if (process.argv[1] && /(?:^|[/\\])cue-qa-report\.mjs$/.test(process.argv[1])){
  try {
    const out=await runCueQa(parseQaArgs(process.argv.slice(2)));
    console.log('Offline RunQ cue QA — NO provider calls or credits.');
    console.log('Fixture provenance: '+out.result.predictionProvenance);
    console.log('Exact event P/R/F1: '+[out.result.summary.precision,out.result.summary.recall,out.result.summary.f1].map(n=>(n*100).toFixed(1)+'%').join(' / '));
    console.log('Report: '+out.mdPath+' and '+out.jsonPath);
  } catch(error) {
    console.error('Offline cue QA failed: '+(error instanceof Error?error.message:'unknown error'));
    process.exitCode=1;
  }
}
