#!/usr/bin/env node
// RUNQ specialization dataset validator. Offline, no external dependencies or requests.
import fs from 'node:fs';
import crypto from 'node:crypto';
const path=process.argv[2]??'fixtures/qa/specialization/examples.jsonl';
const lines=fs.readFileSync(path,'utf8').split(/\r?\n/).filter(x=>x.trim());
const errors=[],seen=new Set(),stats={total:0,train:0,dev:0,holdout:0,reviewed:0,pending:0};
for(let i=0;i<lines.length;i++){
 let r;try{r=JSON.parse(lines[i]);}catch{errors.push(`line ${i+1}: invalid JSON`);continue;}
 stats.total++;
 if(typeof r.id!=='string'||!r.id)errors.push(`line ${i+1}: missing id`);
 if(seen.has(r.id))errors.push(`line ${i+1}: duplicate id ${r.id}`);seen.add(r.id);
 if(!['train','dev','holdout'].includes(r.split))errors.push(`line ${i+1}: invalid split`);else stats[r.split]++;
 if(!['es','en'].includes(r.language))errors.push(`line ${i+1}: invalid language`);
 if(typeof r.instruction!=='string'||!r.instruction.trim())errors.push(`line ${i+1}: missing instruction`);
 if(!r.context||typeof r.context!=='object')errors.push(`line ${i+1}: missing context`);
 if(!r.expected||typeof r.expected!=='object')errors.push(`line ${i+1}: missing expected`);
 if(typeof r.work_id!=='string')errors.push(`line ${i+1}: missing work_id`);
 if(r.review_status==='approved')stats.reviewed++;else stats.pending++;
 if(r.review_status==='approved'&&!r.reviewer)errors.push(`line ${i+1}: approved without reviewer`);
 if(r.split==='holdout'&&r.allow_training===true)errors.push(`line ${i+1}: holdout cannot train`);
 if(r.allow_training===true&&r.review_status!=='approved')errors.push(`line ${i+1}: unreviewed training example`);
 if(r.allow_training===true&&r.license_status!=='cleared')errors.push(`line ${i+1}: training without rights clearance`);
}
const hash=crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
console.log(JSON.stringify({path,sha256:hash,stats,errors},null,2));
process.exitCode=errors.length?1:0;
