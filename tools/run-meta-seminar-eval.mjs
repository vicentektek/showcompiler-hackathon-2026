#!/usr/bin/env node
/**
 * Default is DRY RUN. Real inference requires --live --ack-paid and
 * MODEL_API_KEY in the LOCAL terminal. NEVER call this in CI.
 */
import { parseLiveOptions, runMetaSeminarEval } from './metaSeminarEval.mjs';
import { acquireMetaBudgetLedger } from './metaBudgetLedger.mjs';
try{
  const options=parseLiveOptions(process.argv.slice(2));
  // An exclusive local budget ledger protects against repeated VS Code runs.
  // Offline planning must never create or modify the paid ledger.
  const ledger=options.live?await acquireMetaBudgetLedger():null;
  let run;
  try{
    run=await runMetaSeminarEval({
      ...options,ledger,
      apiKey:options.live?process.env.MODEL_API_KEY:undefined,
    });
  }finally{await ledger?.close()}
  console.log('RunQ '+run.kind);
  console.log('Meta requests sent: '+run.submittedRequests+'; conservative reserve $'+run.conservativeReservedUsd.toFixed(4)+' of $'+run.budgetCapUsd.toFixed(2));
  console.log('Estimated usage charge: '+(run.observedUsageEstimatedUsd===null?'not available':'$'+run.observedUsageEstimatedUsd.toFixed(4)));
  console.log('Scored complete cases: '+run.scoredCases+'; halt reason: '+(run.haltReason??'none'));
  if(options.live)console.log('Persistent local cumulative reserve: .runq-local/meta-eval-budget.json (max $2).');
  console.log('Private local reports: artifacts/seminar-live/report.{md,json} (or --output path)');
  if(run.haltReason&&options.live)process.exitCode=1;
}catch(error){
  // Do not reflect credentials, source, model output, raw HTTP error or stacks.
  const code=(error instanceof TypeError||error instanceof RangeError)?'INVALID_EVAL_CONFIGURATION':'EVAL_FAILED';
  console.error('RunQ Meta evaluation stopped safely: '+code+'. Check MODEL_API_KEY and CLI options; no automatic retry.');
  process.exitCode=1;
}
