#!/usr/bin/env node
/**
 * Offline strict scoring of the paid development campaign.
 * No model calls, no provider credentials, no network and no writes.
 * Gold annotations are PROVISIONAL_UNREVIEWED, not operator-certified.
 */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {readLevel1Corpus} from './level1Corpus.mjs';

const path=resolve(process.argv[2]??'artifacts/dual-provider-campaign/journal.json');
const corpus=await readLevel1Corpus();
const journal=JSON.parse(await readFile(path,'utf8'));
if(journal.version!==1||!Array.isArray(journal.results))throw new Error('Invalid campaign journal');
const development=corpus.cases.filter(c=>c.pool==='development');
const cases=new Map(development.map(c=>[c.id,c]));
const selected=journal.results.filter(r=>r.provider==='META'||r.provider==='BASETEN');
if(selected.length!==18||new Set(selected.map(r=>r.key)).size!==18||
   selected.some(r=>r.status!=='COMPLETED'||!Array.isArray(r.events)))throw new Error('Incomplete/duplicate campaign; refuse to score');
const tuple=e=>[e.lineId??e.sourceLineId,e.transport,e.cueKind,e.basis].join('|');
const aggregate={META:{tp:0,fp:0,fn:0,forbiddenPlay:0,rows:[]},BASETEN:{tp:0,fp:0,fn:0,forbiddenPlay:0,rows:[]}};
for(const c of development){
  for(const provider of ['META','BASETEN']){
    const records=selected.filter(r=>r.provider===provider&&r.key.startsWith(provider+':'+c.id+'/'));
    if(records.length!==c.windows.length)throw new Error('Incomplete windows for '+provider+':'+c.id);
    const predicted=records.flatMap(r=>r.events);
    const expected=new Set(c.expected.map(tuple));
    const seen=new Set();
    let tp=0,fp=0,forbiddenPlay=0;
    const errors=[];
    for(const e of predicted){
      const k=tuple(e);
      if(e.transport==='PLAY'&&c.forbiddenPlayLineIds.includes(e.sourceLineId))forbiddenPlay++;
      if(expected.has(k)&&!seen.has(k))tp++;
      else {fp++;errors.push({kind:'EXTRA_OR_MISCLASSIFIED',event:k})}
      seen.add(k);
    }
    const missing=[...expected].filter(k=>!seen.has(k));
    const fn=missing.length;
    const a=aggregate[provider];
    a.tp+=tp;a.fp+=fp;a.fn+=fn;a.forbiddenPlay+=forbiddenPlay;
    a.rows.push({caseId:c.id,tp,fp,fn,forbiddenPlay,errors,missing});
  }
}
const results={kind:'RUNQ_LEVEL1_OFFLINE_STRICT_SCORE',goldHumanReviewed:false,
  note:'Development corpus only. Provisional reference annotations; not production-certified.',
  providers:{}};
for(const [provider,a] of Object.entries(aggregate)){
  const precision=a.tp/(a.tp+a.fp),recall=a.tp/(a.tp+a.fn);
  results.providers[provider]={tp:a.tp,fp:a.fp,fn:a.fn,
    precision,recall,f1:2*a.tp/(2*a.tp+a.fp+a.fn),
    forbiddenPlay:a.forbiddenPlay,rows:a.rows};
}
console.log(JSON.stringify(results,null,2));
