#!/usr/bin/env node
// Gated SFT export. Only human-approved, rights-cleared TRAIN rows are exported, in the exact message
// format the real route sends (developer prompt + user JSON) with the wire-format target as assistant.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {readJsonl,validateRows} from './validate-dataset.mjs';
import {routeMessages} from './contract.mjs';

export function exportSft(rows){
  const {errors}=validateRows(rows);
  if(errors.length)throw new Error('INVALID_DATASET: '+errors[0]);
  const picked=rows.filter(r=>r.split==='train'&&r.review_status==='approved'&&r.allow_training===true
    &&['cleared','original'].includes(r.license_status));
  if(!picked.length)throw new Error('NO_APPROVED_LICENSED_TRAINING_EXAMPLES');
  return picked.map(r=>({messages:[...routeMessages(r),{role:'assistant',content:JSON.stringify(r.expected)}]}));
}

const invoked=process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href;
if(invoked){
  const input=process.argv[2]??'fixtures/qa/specialization/examples.jsonl';
  const output=process.argv[3]??'artifacts/runq-sft-train.jsonl';
  const data=exportSft(readJsonl(input));
  fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});
  fs.writeFileSync(output,data.map(x=>JSON.stringify(x)).join('\n')+'\n','utf8');
  console.log(JSON.stringify({output,exported:data.length}));
}
