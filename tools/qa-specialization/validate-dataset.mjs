#!/usr/bin/env node
// RUNQ specialization dataset validator. Offline; checks rows against the REAL agent wire contract.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {validateWireTarget} from './contract.mjs';

export function validateRows(rows){
  const errors=[],seen=new Set(),splitOfWork=new Map(),taskSplit=new Map();
  const stats={total:0,train:0,dev:0,holdout:0,approved:0,pending:0,trainable:0};
  rows.forEach((r,i)=>{
    const at=`row ${i+1}${r?.id?` (${r.id})`:''}`,err=m=>errors.push(`${at}: ${m}`);
    stats.total++;
    if(typeof r.id!=='string'||!r.id)err('missing id');
    if(seen.has(r.id))err('duplicate id');seen.add(r.id);
    if(!['train','dev','holdout'].includes(r.split))err('invalid split');else stats[r.split]++;
    if(!['es','en'].includes(r.language))err('invalid language');
    if(typeof r.work_id!=='string'||!r.work_id)err('missing work_id');
    if(typeof r.instruction!=='string'||r.instruction.trim().length<3||r.instruction.length>1600)err('instruction length outside route limits');
    if(!Array.isArray(r.conversation??[])||(r.conversation??[]).length>8)err('conversation outside route limits');
    const ctx=r.context;
    if(!ctx||typeof ctx.projectId!=='string'||!Array.isArray(ctx.cues)||!Array.isArray(ctx.lines))err('context is not an agent context');
    else{
      if(JSON.stringify(ctx).length>15000)err('context larger than route limit');
      for(const m of validateWireTarget(r.expected,ctx))err('expected target: '+m);
    }
    if(r.review_status==='approved'){stats.approved++;if(!r.reviewer)err('approved without reviewer');}else stats.pending++;
    if(r.split==='holdout'&&r.allow_training===true)err('holdout cannot train');
    if(r.allow_training===true){
      stats.trainable++;
      if(r.review_status!=='approved')err('unreviewed training example');
      if(!['cleared','original'].includes(r.license_status))err('training without rights clearance');
      if(r.split!=='train')err('training row outside train split');
    }
    // A scene/work must not straddle partitions; the same task+context must not leak across them.
    if(splitOfWork.has(r.work_id)&&splitOfWork.get(r.work_id)!==r.split)err(`work ${r.work_id} appears in several splits`);
    splitOfWork.set(r.work_id,r.split);
    const key=crypto.createHash('sha256').update(JSON.stringify([r.language,r.instruction,r.conversation,r.context_sha256])).digest('hex');
    if(taskSplit.has(key)&&taskSplit.get(key)!==r.split)err('identical task leaks across splits');
    taskSplit.set(key,r.split);
  });
  return {stats,errors};
}

export function readJsonl(path){
  return fs.readFileSync(path,'utf8').split(/\r?\n/).filter(x=>x.trim()).map((l,i)=>{
    try{return JSON.parse(l);}catch{throw new Error(`line ${i+1}: invalid JSON`);}
  });
}

const invoked=process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href;
if(invoked){
  const path=process.argv[2]??'fixtures/qa/specialization/examples.jsonl';
  const {stats,errors}=validateRows(readJsonl(path));
  const sha256=crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
  console.log(JSON.stringify({path,sha256,stats,errors},null,2));
  process.exitCode=errors.length?1:0;
}
