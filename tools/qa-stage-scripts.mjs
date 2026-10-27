#!/usr/bin/env node
/**
 * Offline agent-workshop-inspired eval harness:
 * source -> conservative structure -> bounded proposal plan -> fake completed
 * structured response -> independent verification -> human-review-only candidates.
 *
 * ALL proposals are constructed from synthetic, manually labelled gold.
 * This is a pipeline regression suite, NOT observed Muse Spark accuracy.
 * No fetch, SDK, key, network, auto-GO or project persistence.
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseScript } from '../src/core/script.mjs';
import { planScriptAnalysis } from '../src/core/sceneAnalysis.mjs';
import { annotateDramaticStructure } from '../src/core/dramaticStructure.mjs';
import {
  prepareTheatricalCueAnalysis, parseTheatricalCueContent,
  classifyTheatricalSuggestions, THEATRE_ANALYSIS_WINDOWS_PER_REQUEST,
  THEATRE_MAX_SUGGESTIONS, THEATRE_COMPLETION_TOKEN_BUDGET,
} from '../src/core/theatreCueAnalysis.mjs';
import { reviewExplicitAudioDirections } from '../src/core/independentCueReview.mjs';
import { evaluateStageEventCases } from '../src/core/stageCueQa.mjs';
import { createNewShow } from '../src/core/workspace.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const MANIFEST='fixtures/qa/stage-scenarios-v2.json';
const OUT='artifacts/stage-script-qa';
const SAFE_SCRIPT=/^fixtures\/qa\/scripts\/[a-z0-9][a-z0-9-]{1,80}\.txt$/;
const SAFE_ID=/^[a-z0-9][a-z0-9-]{1,80}$/;
const SAFE_LINE=/^L[1-9][0-9]*$/;
const ALLOWED_ACTIONS=new Set(['PLAY','STOP','CONTINUE','SILENCE']);

function requireCondition(value,message) {
  if (!value) throw new Error('Stage corpus invalid: '+message);
}
function failureForWindow(expectedInWindow) {
  return Math.max(0,expectedInWindow.length-THEATRE_MAX_SUGGESTIONS);
}
function arrayEqual(left,right) {
  return left.length===right.length && left.every((x,i)=>x===right[i]);
}
function mapEvent(e) {
  return {sourceLineId:e.lineId,transport:e.transport,cueKind:e.cueKind,basis:e.basis};
}
function makeFakeProposal(gold,core,windowId) {
  const originalLine=core.find(x=>x.id===gold.lineId);
  requireCondition(originalLine,'gold out of analyzed core');
  // Required 16-field Meta wire DTO, not a real model response.
  return {
    windowId, sourceLineId:gold.lineId,
    sourceEvidence:originalLine.text.slice(0,240),
    cueKind:gold.cueKind, basis:gold.basis, transport:gold.transport,
    label:'Synthetic QA '+gold.soundKey,
    soundPrompt:'Original offline audio intent '+gold.soundKey+'; never trigger automatically.',
    assetId:null, trigger:'ON_LINE', durationSeconds:gold.transport==='PLAY'?3:null,
    loop:gold.transport==='PLAY'&&gold.cueKind==='AMBIENCE',
    fadeInSeconds:0,fadeOutSeconds:0,confidence:0.95,
    reason:'Simulated contract response from locked synthetic gold, not Muse.',
  };
}
export async function loadStageScriptCorpus(root=ROOT) {
  const data=JSON.parse(await readFile(join(root,MANIFEST),'utf8'));
  requireCondition(data.version===2 && Array.isArray(data.scenarios) &&
    data.scenarios.length>=10 && data.scenarios.length<=30,'manifest version/count');
  const ids=new Set();
  const cases=[];
  for(const item of data.scenarios){
    requireCondition(item && SAFE_ID.test(item.id) && !ids.has(item.id) &&
      SAFE_SCRIPT.test(item.scriptFile) && item.scriptFile.endsWith(item.id+'.txt'),
      'duplicate/unsafe scenario '+item?.id);
    ids.add(item.id);
    requireCondition(typeof item.type==='string' && typeof item.documentKind==='string' &&
      typeof item.language==='string' && typeof item.description==='string' &&
      typeof item.stress==='boolean' &&
      Array.isArray(item.expected) && Array.isArray(item.forbiddenPlayLineIds),
      'missing scenario metadata '+item.id);
    const scriptText=await readFile(join(root,item.scriptFile),'utf8');
    requireCondition(scriptText.length>50 && scriptText.length<100_000,'script size '+item.id);
    const lines=parseScript(scriptText);
    const lineById=new Map(lines.map(x=>[x.id,x]));
    const keys=new Set();
    const plays=new Map();
    for(const e of item.expected){
      requireCondition(SAFE_LINE.test(e.lineId) && ALLOWED_ACTIONS.has(e.transport) &&
        (e.basis==='EXPLICIT') && typeof e.cueKind==='string' &&
        typeof e.soundKey==='string' && e.soundKey.length<80 &&
        lineById.get(e.lineId)?.text===e.sourceText,
        'gold line/evidence '+item.id+'/'+e?.lineId);
      const key=[e.lineId,e.transport,e.cueKind,e.basis].join('|');
      requireCondition(!keys.has(key),'duplicate expected event '+item.id+'/'+key);
      keys.add(key);
      if(e.transport==='PLAY'){
        requireCondition(!plays.has(e.soundKey),'duplicate sound key '+item.id+'/'+e.soundKey);
        plays.set(e.soundKey,e.lineId);
      }
      if(e.transport==='SILENCE'){
        requireCondition(e.cueKind==='SILENCE','silence cue kind '+item.id);
      } else requireCondition(e.cueKind!=='SILENCE','silence mismatch '+item.id);
    }
    for(const e of item.expected){
      if(e.transport==='STOP'||e.transport==='CONTINUE'){
        requireCondition(plays.has(e.soundKey) &&
          Number(plays.get(e.soundKey).slice(1))<Number(e.lineId.slice(1)),
          'audio state has no prior PLAY '+item.id+'/'+e.lineId);
      }
      if(e.transport==='STOP'){
        requireCondition(e.targetPlayLineId===plays.get(e.soundKey),
          'STOP targets wrong sound '+item.id+'/'+e.lineId);
      }
    }
    const forbids=new Set(item.forbiddenPlayLineIds);
    requireCondition(forbids.size===item.forbiddenPlayLineIds.length &&
      [...forbids].every(l=>SAFE_LINE.test(l)&&lineById.has(l)) &&
      item.expected.every(e=>e.transport!=='PLAY'||!forbids.has(e.lineId)),
      'invalid forbidden PLAY labels '+item.id);
    cases.push({...item,scriptText,lines});
  }
  return {provenance:data.provenance,scenarios:cases};
}
export async function evaluateStageScriptCorpus(root=ROOT) {
  const {provenance,scenarios}=await loadStageScriptCorpus(root);
  const predictionsByCase={};
  const checks=[];
  const failures=[];
  let totalLines=0,totalExpected=0,totalForbidden=0,totalWindows=0,totalCapacityExcess=0;
  let verifiedPackets=0;
  let reviewDetected=0,reviewFalseFlags=0;
  for(const sample of scenarios){
    const {id,scriptText,lines}=sample;
    const original=JSON.stringify(scriptText);
    const show=createNewShow({name:'QA '+id,scriptText});
    const projectBefore=JSON.stringify(show);
    const plan=planScriptAnalysis(scriptText);
    const structure=annotateDramaticStructure(scriptText);
    requireCondition(structure.totalLines===lines.length &&
      arrayEqual(structure.lines.map(x=>x.lineId),lines.map(x=>x.id)) &&
      arrayEqual(structure.lines.map(x=>x.text),lines.map(x=>x.text)),
      'structure changed text/line IDs '+id);
    requireCondition(plan.coverage.coveragePercent===100 &&
      plan.coverage.uncoveredLineIds.length===0 &&
      arrayEqual(plan.coverage.coveredLineIds,lines.map(x=>x.id)),
      'planner did not cover each line exactly once '+id);
    requireCondition(THEATRE_ANALYSIS_WINDOWS_PER_REQUEST===1 &&
      THEATRE_COMPLETION_TOKEN_BUDGET>=4096 && THEATRE_COMPLETION_TOKEN_BUDGET<=16384,
      'unexpected provider cost/batching contract');
    const predicted=[];
    const windows=[];
    for(let wi=0;wi<plan.windows.length;wi++){
      const prepared=prepareTheatricalCueAnalysis(show,{
        model:'muse-spark-1.3',scriptLanguage:sample.language,
        performanceKind:sample.type,documentKind:sample.documentKind,
        designMode:'literal',windowStart:wi,
      });
      const request=prepared.request;
      requireCondition(prepared.scope.windows.length===1 &&
        prepared.coverage.analyzedWindowIds.length===1 &&
        prepared.coverage.analyzedWindowIds[0]===plan.windows[wi].id &&
        prepared.coverage.nextWindowStart===(wi+1===plan.windows.length?null:wi+1) &&
        request.messages[0].role==='developer' &&
        request.response_format.type==='json_schema' &&
        request.response_format.json_schema.strict===true &&
        request.reasoning_effort==='low' && request.stream===false &&
        request.store===false &&
        request.max_completion_tokens===THEATRE_COMPLETION_TOKEN_BUDGET &&
        !Object.hasOwn(request,'tools') &&
        !Object.hasOwn(request,'apiKey'),
        'bounded server-only Meta request '+id+'/'+wi);
      const payload=JSON.parse(request.messages[1].content);
      requireCondition(payload.batch.windows.length===1 &&
        payload.batch.windows[0].windowId===plan.windows[wi].id &&
        arrayEqual(payload.batch.windows[0].coreLines.map(x=>x.lineId),
          plan.windows[wi].coreLines.map(x=>x.id)),
        'request window/source mismatch '+id+'/'+wi);
      const scope=prepared.scope.windows[0];
      const expected=sample.expected.filter(e=>scope.coreLines.some(l=>l.id===e.lineId));
      // Measure the REAL deterministic verifier independently of fake model
      // responses: can it flag these required audio events if Meta omits all?
      const coldReview=reviewExplicitAudioDirections(prepared.scope,[]);
      const hinted=expected.filter(e=>coldReview.reviewFlags.includes(e.lineId)).length;
      const unwantedHints=coldReview.reviewFlags.filter(l=>!expected.some(e=>e.lineId===l)).length;
      reviewDetected+=hinted;
      reviewFalseFlags+=unwantedHints;
      const excess=failureForWindow(expected);
      if(excess&&!sample.stress) failures.push({id,windowId:scope.id,reason:'EVENT_CAPACITY_EXCEEDED',count:excess});
      totalCapacityExcess+=excess;
      const fake=expected.slice(0,THEATRE_MAX_SUGGESTIONS)
        .map(e=>makeFakeProposal(e,scope.coreLines,scope.id));
      const validated=parseTheatricalCueContent(JSON.stringify({proposals:fake}),prepared.scope);
      const checked=reviewExplicitAudioDirections(prepared.scope,validated);
      const classified=classifyTheatricalSuggestions(validated);
      requireCondition(classified.details.length+classified.observations.length===validated.length &&
        classified.proposals.every(p=>typeof p.lineId==='string') &&
        checked.reviewFlags.every(l=>scope.coreLines.some(x=>x.id===l)),
        'independent review or executable observation error '+id+'/'+wi);
      for(const event of validated){
        requireCondition(event.assetId===null,'fake model bound a nonexistent asset '+id);
        predicted.push(mapEvent(event));
      }
      verifiedPackets++;
      windows.push({
        id:scope.id,start:scope.coreLines[0].id,end:scope.coreLines.at(-1).id,
        explicitGold:expected.length,packetCount:fake.length,
        capacityExcess:excess,reviewFlags:checked.reviewFlags,
        verifierDetected:hinted,verifierMissing:expected.length-hinted,
        verifierFalseFlags:unwantedHints,
        playableSuggestions:classified.proposals.length,
        nonPlayableObservations:classified.observations.length,
      });
    }
    requireCondition(JSON.stringify(show)===projectBefore &&
      JSON.stringify(scriptText)===original,'test changed persistent show '+id);
    predictionsByCase[id]=predicted;
    const required=sample.expected.length;
    const missedDueToCapacity=windows.reduce((n,w)=>n+w.capacityExcess,0);
    checks.push({id,type:sample.type,documentKind:sample.documentKind,
      language:sample.language,stress:sample.stress,
      totalLines:lines.length,sceneCount:plan.coverage.sceneCount,
      windows,expectedEvents:required,forbiddenPlay:sample.forbiddenPlayLineIds.length,
      syntheticValidatedEvents:predicted.length,capacityExcess:missedDueToCapacity,
      passed:missedDueToCapacity===0 || sample.stress});
    totalLines+=lines.length;
    totalExpected+=required;
    totalForbidden+=sample.forbiddenPlayLineIds.length;
    totalWindows+=windows.length;
  }
  const gold={version:1,provenance, cases:scenarios.map(s=>({
    id:s.id,scriptText:s.scriptText,
    expected:s.expected.map(e=>({
      lineId:e.lineId,transport:e.transport,cueKind:e.cueKind,basis:e.basis,
    })),
    forbiddenPlayLineIds:s.forbiddenPlayLineIds,
  }))};
  const predictions={
    version:1,
    provenance:'FAKE_GOLD_REPLAY_NOT_REAL_MODEL_OUTPUT',
    predictionsByCase,
  };
  const evaluation=evaluateStageEventCases(gold,predictions);
  const normalCases=scenarios.filter(s=>!s.stress);
  const normalEvaluation=evaluateStageEventCases(
    {...gold,cases:gold.cases.filter(s=>normalCases.some(c=>c.id===s.id))},
    {version:1,provenance:'FAKE_GOLD_REPLAY_NOT_REAL_MODEL_OUTPUT',
      predictionsByCase:Object.fromEntries(normalCases.map(s=>[s.id,predictionsByCase[s.id]]))},
  );
  requireCondition(normalEvaluation.summary.f1===1 &&
    normalEvaluation.summary.forbiddenPlay===0 &&
    normalEvaluation.summary.invalidReferences===0 &&
    normalEvaluation.summary.falseNegatives===0,
    'synthetic gold wire replay unexpectedly fails');
  requireCondition(totalCapacityExcess>0 && failures.length===0,
    'stress capacity case missing or nonstress case exceeded cap');
  return {
    mode:'SYNTHETIC_CONTRACT_REPLAY_NOT_META_INFERENCE',
    provenance, modelQualityMeasured:false, sourceFiles:scenarios.length,
    totals:{lines:totalLines,expectedEvents:totalExpected,
      forbiddenPlayLines:totalForbidden,sceneWindows:totalWindows,
      validatedFakePackets:verifiedPackets,capacityExcess:totalCapacityExcess,
      verifierDetected:reviewDetected,verifierMissed:totalExpected-reviewDetected,
      verifierFalseFlags:reviewFalseFlags,
      verifierGoldRecall:totalExpected?reviewDetected/totalExpected:1},
    normalOracle:normalEvaluation.summary,
    stressIncludingCapacity:evaluation.summary,
    checks, failures,
    priorities:[
      {key:'P0',reason:'Retain exact Lxx source scope, strict JSON and human review'},
      {key:'P1',reason:'A scene with >8 required events cannot be fully expressed in one request'},
      {key:'P1',reason:'Independent acoustic review misses unlabelled stage directions: improve review hints, not auto cues'},
      {key:'P1',reason:'Carry sound identity and STOP targets across windows; no automatic GO'},
      {key:'P1',reason:'Measure Muse Spark only with separately authorized, privately captured results'},
    ],
  };
}
export function renderStageScriptReport(output) {
  const {totals}=output;
  const lines=[
    '# RunQ — original theatre-script regression corpus',
    '',
    '**NOT LIVE META QUALITY:** all proposed events were constructed from gold labels by test code.',
    '**Source:** '+output.provenance,
    '',
    '| Measure | Value |','| --- | ---: |',
    '| Original scenario files | '+output.sourceFiles+' |',
    '| Lines including trailing line break | '+totals.lines+' |',
    '| Script-anchored events | '+totals.expectedEvents+' |',
    '| Explicit negative PLAY lines | '+totals.forbiddenPlayLines+' |',
    '| Bounded, fake-response windows | '+totals.sceneWindows+' |',
    '| Validated fake packets | '+totals.validatedFakePackets+' |',
    '| Capacity overflow in stress case | '+totals.capacityExcess+' |',
    '| Existing heuristic reviewer: detectable gold instructions | '+totals.verifierDetected+' / '+totals.expectedEvents+' |',
    '| Existing heuristic reviewer: unflagged gold instructions | '+totals.verifierMissed+' |',
    '| Existing heuristic reviewer: flags not in mandatory gold | '+totals.verifierFalseFlags+' |',
    '| Non-stress simulated-contract F1 | '+(output.normalOracle.f1*100).toFixed(1)+'% |',
    '',
    '## By scenario','',
  ];
  for(const c of output.checks){
    lines.push('### '+c.id+(c.stress?' — deliberate capacity stress':''));
    lines.push('Type: '+c.type+' / '+c.documentKind+' / '+c.language+'. Lines '+c.totalLines+
      ', windows '+c.windows.length+', gold '+c.expectedEvents+
      ', forbidden PLAY '+c.forbiddenPlay+'.');
    for(const w of c.windows){
      lines.push('- '+w.id+' '+w.start+'–'+w.end+'; required '+w.explicitGold+
        '; synthetic packet '+w.packetCount+'; over cap '+w.capacityExcess+
        '; reviewer detected '+w.verifierDetected+'/'+w.explicitGold+
        '; reviewer false flags '+w.verifierFalseFlags+
        '; PLAY '+w.playableSuggestions+'; observations '+w.nonPlayableObservations);
    }
    lines.push('');
  }
  lines.push('## Priorities for Codex','');
  for(const item of output.priorities)lines.push('- '+item.key+': '+item.reason);
  lines.push('','## Engineering acceptance','',
    'Never use these synthetic results as actual model accuracy. Keep GO manual, no network in tests, no keys or proprietary scripts, no auto-merge. A model capture requires operator consent and human-reviewed expected events.','','');
  return lines.join('\n');
}
export async function writeStageScriptReport(root=ROOT) {
  const result=await evaluateStageScriptCorpus(root);
  const dir=join(root,OUT);
  await mkdir(dir,{recursive:true});
  await Promise.all([
    writeFile(join(dir,'report.json'),JSON.stringify(result,null,2)+'\n','utf8'),
    writeFile(join(dir,'report.md'),renderStageScriptReport(result),'utf8'),
  ]);
  return result;
}
if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try{
    const output=await writeStageScriptReport();
    console.log('Synthetic script QA: '+output.sourceFiles+' scripts, '+
      output.totals.expectedEvents+' gold events, '+output.totals.validatedFakePackets+
      ' strictly validated window packets.');
    console.log('Known capacity ceiling: '+output.totals.capacityExcess+
      ' events exceed 8-per-request in deliberately overfilled scenario.');
    console.log('NO provider calls, no real-model accuracy claims. Report: '+OUT+'/report.md');
  }catch(error){
    console.error(error instanceof Error ? error.message : 'Unknown script corpus error');
    process.exitCode=1;
  }
}
