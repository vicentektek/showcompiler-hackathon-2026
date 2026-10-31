#!/usr/bin/env node
// Explicitly gated export: approved, licensed, train-only examples.
import fs from 'node:fs';
import path from 'node:path';
const input=process.argv[2]??'fixtures/qa/specialization/examples.jsonl';
const output=process.argv[3]??'artifacts/runq-sft-train.jsonl';
const lines=fs.readFileSync(input,'utf8').split(/\r?\n/).filter(Boolean);
const rows=lines.map(line=>JSON.parse(line));
const picked=rows.filter(r=>r.split==='train'&&r.review_status==='approved'&&r.allow_training===true&&r.license_status==='cleared');
if(rows.some(r=>r.allow_training===true && (r.split!=='train'||r.review_status!=='approved'||r.license_status!=='cleared')))throw Error('INVALID_TRAINING_ELIGIBILITY');
if(!picked.length)throw Error('NO_APPROVED_LICENSED_TRAINING_EXAMPLES');
fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});
const data=picked.map(r=>JSON.stringify({messages:[
 {role:'system',content:'Interpret RUNQ cue-editing requests into validated structured operations. Never execute GO/STOP; request clarification when ambiguous.'},
 {role:'user',content:JSON.stringify({language:r.language,context:r.context,instruction:r.instruction})},
 {role:'assistant',content:JSON.stringify(r.expected)}
]})).join('\n')+'\n';
fs.writeFileSync(output,data,'utf8');
console.log(JSON.stringify({output,exported:picked.length}));
