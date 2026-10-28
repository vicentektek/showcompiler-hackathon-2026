#!/usr/bin/env node
/** Reconcile one *never started* terminated Modal call against the local ledger.
 * Read-only until --execute. Requires explicit saved Modal CLI evidence.
 * Never initiates provider jobs or calls provider APIs.
 */
import { readFile, mkdir, appendFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { createSfxJobStore } from '../src/core/sfxJobStore.mjs';

const args=process.argv.slice(2);
const get=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
const requestId=get('--request-id'),evidenceFile=get('--calls-json');
const execute=args.includes('--execute');
if(!requestId||!evidenceFile||args.some((v,i)=>v.startsWith('--')&&
  !['--request-id','--calls-json','--execute'].includes(v))){
  console.error('Usage: node tools/sfx-reconcile-terminated.mjs --request-id <id> --calls-json <file> [--execute]');
  process.exit(2);
}
try {
  const evidenceBytes=await readFile(resolve(evidenceFile));
  // Windows PowerShell may write a UTF-8 BOM or UTF-16 LE text file.
  // Decode safely without modifying the raw evidence bytes used for hashing.
  const utf16le=evidenceBytes.length>=2&&evidenceBytes[0]===0xff&&evidenceBytes[1]===0xfe;
  const decoded=utf16le?evidenceBytes.subarray(2).toString('utf16le'):evidenceBytes.toString('utf8');
  const calls=JSON.parse(decoded.replace(/^\\uFEFF/,''));
  if(!Array.isArray(calls))throw new Error('Modal calls evidence must be a JSON array');
  const directory=resolve('.runq-local/sfx-generation');
  const store=createSfxJobStore({directory,maxDailyStarts:6});
  const entry=await store.read(requestId);
  if(!entry||!entry.remoteJobId)throw new Error('Local record or remote ID missing');
  if(!['QUEUED','RUNNING'].includes(entry.status))throw new Error('Local status is not reconcilable: '+entry.status);
  const matches=calls.filter(c=>c.function_call_id===entry.remoteJobId);
  if(matches.length!==1)throw new Error('Exactly one matching Modal call must be present');
  const c=matches[0];
  if(c.status!=='terminated'||c.started_at!==null||c.container_id!==null||
     c.execution_time_seconds!==null){
    throw new Error('Remote call must be terminated BEFORE it started; manual review required');
  }
  const digest=createHash('sha256').update(evidenceBytes).digest('hex');
  const audit={at:new Date().toISOString(),action:'RECONCILE_PREEXECUTION_TERMINATION',
    requestId,remoteJobId:entry.remoteJobId,previousLocalStatus:entry.status,
    modalStatus:c.status,enqueuedAt:c.enqueued_at,evidenceSha256:digest,
    localResult:'CANCELLED'};
  if(!execute){
    console.log(JSON.stringify({dryRun:true,validated: true,audit},null,2));
    console.log('Re-run with --execute only after validating the Modal evidence.');
  } else {
    // Cannot be used as evidence of a finished paid inference: only terminated,
    // never-started calls are eligible. Durable record and audit are preserved.
    await store.update(requestId,'CANCELLED');
    await mkdir(join(directory,'audit'),{recursive:true});
    await appendFile(join(directory,'audit','journal-audit.jsonl'),JSON.stringify(audit)+'\n');
    console.log('Reconciled local never-started call as CANCELLED with audit trail: '+requestId);
  }
}catch(e){console.error('Stopped safely: '+e.message);process.exitCode=1;}
