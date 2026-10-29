#!/usr/bin/env node
/**
 * Local RUNQ SFX journal inventory: read-only listing of non-secret metadata.
 * No network, Meta, Baseten, Modal or GPU. No automatic reconciliation or
 * deletion: CANCEL_REQUESTED and SUBMISSION_UNKNOWN must be checked manually.
 */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createSfxJobStore} from '../src/core/sfxJobStore.mjs';
import {inspectSfxHistory} from '../src/sfx/jobRecovery.mjs';

export async function inspectLocalSfxJobs({directory=resolve('.runq-local/sfx-generation'),clock=()=>new Date()}={}){
  const store=createSfxJobStore({directory});
  const history=inspectSfxHistory(await store.list({limit:100}),clock());
  return Object.freeze({
    startedToday:history.startedToday,
    unresolved:history.active.length,
    ready:history.ready.length,
    truncated:history.truncated,
    jobs:history.jobs.map(({requestId,status,createdAt})=>({requestId,status,createdAt})),
  });
}
if(process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  try{
    const result=await inspectLocalSfxJobs();
    console.log('RUNQ SFX LOCAL JOBS (READ ONLY: no requests, billing, secrets or retries)');
    console.log('Starts today (UTC): '+result.startedToday+
      ' | Unresolved: '+result.unresolved+' | Ready to review: '+result.ready);
    if(!result.jobs.length)console.log('No local SFX jobs in this checkout.');
    for(const job of result.jobs)console.log(job.createdAt+'  '+job.status.padEnd(30)+'  '+job.requestId);
    if(result.unresolved)console.log('Do not submit again until unresolved jobs are reviewed in Modal and the journal.');
    if(result.truncated)console.log('History truncated; inspect full ledger offline before spending.');
  }catch{
    console.error('Local SFX job journal cannot be read. Preserve files and investigate locally; nothing was submitted.');
    process.exitCode=1;
  }
}
