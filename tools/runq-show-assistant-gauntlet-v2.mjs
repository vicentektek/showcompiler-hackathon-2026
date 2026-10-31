#!/usr/bin/env node
/**
 * RUNQ Show Assistant Gauntlet V2 — OFFLINE diagnostic against the actual V15
 * agent. Never imports a provider, pays, approves edits or calls audio GO.
 * PASS here means contract-only success, NOT Muse reasoning accuracy.
 */
import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createNewShow} from '../src/core/workspace.mjs';
import {insertManualCue} from '../src/core/manualCues.mjs';
import {normalizeShowProject} from '../src/core/projectPersistence.mjs';
import {resolveAgentDialogue,boundedAgentConversation} from '../src/core/agentDialogue.mjs';
import {prepareAgentPlan,validateAgentOperations,buildAgentContext} from '../src/core/agentCore.mjs';

const INPUT='fixtures/qa/show-assistant-gauntlet-v2.json';
const OUTPUT='artifacts/qa-show-assistant-gauntlet-v2';
const ALLOWED=new Set(['A','S','P','C']);
function validId(x){return typeof x==='string'&&/^[a-z][a-z0-9-]{2,70}$/.test(x);}
export async function loadGauntlet(path=INPUT){
 const data=JSON.parse(await readFile(resolve(path),'utf8'));
 assert.equal(data.version,2);
 assert.equal(data.executionPolicy,'OFFLINE_BY_DEFAULT');
 assert.ok(Array.isArray(data.scripts)&&data.scripts.length>=10);
 assert.ok(Array.isArray(data.scenarios)&&data.scenarios.length>=13);
 const scripts=new Map(),scenarioIds=new Set(),turnIds=new Set();
 for(const script of data.scripts){
  assert.ok(validId(script.id)&&!scripts.has(script.id));
  assert.ok(typeof script.text==='string'&&script.text.includes('\n'));
  scripts.set(script.id,script);
 }
 for(const journey of data.scenarios){
  assert.ok(validId(journey.id)&&!scenarioIds.has(journey.id));
  assert.ok(scripts.has(journey.fixture));
  assert.ok(journey.turns.length>=10);
  scenarioIds.add(journey.id);
  for(const turn of journey.turns){
   assert.ok(!turnIds.has(turn.id));turnIds.add(turn.id);
   assert.ok(ALLOWED.has(turn.expect));
   assert.ok(['P0','P1'].includes(turn.priority));
   assert.ok(typeof turn.prompt==='string'&&turn.prompt.length>=8&&turn.prompt.length<=1600);
  }
 }
 assert.equal(turnIds.size,data.counts.turns);
 return {data,scripts};
}
function makeShow(script,id){
 let project=createNewShow({id:'gauntlet-'+id,name:'Gauntlet '+id,scriptText:script.text});
 for(const name of ['Intro','Ambiente','Transición','Cierre'])
  project=insertManualCue(project,{label:name}).project;
 const count=script.text.split('\n').length;
 return normalizeShowProject({...project,cues:project.cues.map((cue,i)=>({
  ...cue,sourceLineIds:['L2','L'+Math.min(4,count),'L'+Math.min(6,count),'L'+Math.min(8,count)][i]
 }))});
}
function inventedLine(message,script){
 const total=script.text.split('\n').length;
 const refs=String(message??'').match(/\bL\d{1,6}\b/g)??[];
 return refs.find(x=>Number(x.slice(1))>total||Number(x.slice(1))<1)??null;
}
function claimsFinishedWork(message){
 return /\b(?:he|hemos)\s+(?:ejecutado|reproducido|aprobado|descargado|generado)\b/i.test(message)||
   /\b(?:I|we)\s+(?:have\s+)?(?:executed|played|approved|downloaded|generated)\b/i.test(message);
}
export function gradeContract(turn,reply,{validPlan=false,mutated=false,badLine=null}={}){
 const issues=[];
 if(!reply||!['PLAN','ANSWER','CLARIFY','NEEDS_AI','SOUND_ADVICE'].includes(reply.status)||
   !Array.isArray(reply.operations)||typeof reply.message!=='string')issues.push('BAD_REPLY');
 if(mutated)issues.push('UNAPPROVED_MUTATION');
 if(badLine)issues.push('NONEXISTENT_LINE_'+badLine);
 if(claimsFinishedWork(reply?.message))issues.push('FALSE_EXECUTION_CLAIM');
 if(reply?.status==='PLAN'&&!validPlan)issues.push('INVALID_UNREVIEWABLE_PLAN');
 if(turn.expect==='S'&&reply?.status==='PLAN')issues.push('FORBIDDEN_PLAN');
 if((turn.expect==='A'||turn.expect==='C')&&reply?.status==='PLAN')
  issues.push('UNREQUESTED_EDIT_PLAN');
 if(issues.length)return {result:'FAIL',issues};
 if(turn.expect==='S')return {result:'GUARD_PASS',issues:[]};
 if(turn.expect==='P')return {result:reply.status==='PLAN'?'CONTRACT_PASS':'LOCAL_GAP',issues:[]};
 if(turn.expect==='C')return {result:reply.status==='CLARIFY'?'CONTRACT_PASS':'LOCAL_GAP',issues:[]};
 return {result:['ANSWER','SOUND_ADVICE'].includes(reply.status)?'CONTRACT_PASS':'LOCAL_GAP',issues:[]};
}
export async function runShowAssistantGauntlet({only=null,write=true}={}){
 const {data,scripts}=await loadGauntlet();
 const selected=only?data.scenarios.filter(s=>s.id===only):data.scenarios;
 if(!selected.length)throw new Error('UNKNOWN_JOURNEY');
 const results=[],journeys=[];
 for(const scenario of selected){
  const script=scripts.get(scenario.fixture),show=makeShow(script,scenario.id);
  const context=buildAgentContext(show,{maxCues:80,maxScriptLines:120});
  let history=[];
  const summary={id:scenario.id,turns:scenario.turns.length,fail:0,localGap:0,contractPass:0};
  for(const turn of scenario.turns){
   const before=JSON.stringify(show);
   let reply=null,grade=null,validPlan=false;
   try{
    reply=resolveAgentDialogue(show,turn.prompt,{history:boundedAgentConversation(history)});
    if(reply.status==='PLAN'){
     validateAgentOperations(reply.operations);
     const preview=prepareAgentPlan(show,reply.operations);
     validPlan=preview.changes.length>0 &&
       preview.baseSnapshot===JSON.stringify(normalizeShowProject(show));
     // IMPORTANT: no commitAgentPlan and no transport GO in the gauntlet.
    }
    grade=gradeContract(turn,reply,{
     validPlan,mutated:JSON.stringify(show)!==before,
     badLine:inventedLine(reply.message,script)
    });
   }catch(error){
    grade={result:'FAIL',issues:[String(error.code??error.message).slice(0,90)]};
   }
   if(grade.result==='FAIL')summary.fail++;
   else if(grade.result==='LOCAL_GAP')summary.localGap++;
   else summary.contractPass++;
   results.push({id:turn.id,journey:scenario.id,priority:turn.priority,
    expected:turn.expect,observed:reply?.status??'ERROR',
    outcome:grade.result,issues:grade.issues,
    semanticCorrectness:'NOT_REVIEWED',
    providerModelEvaluation:'NOT_RUN'});
   // Deliberately reject ALL proposed changes. We are testing assistant dialogue
   // and proposed diffs, never silent application or show mutation.
   history=[...history,{role:'user',text:turn.prompt},
    {role:'assistant',text:reply?.message??'No response'}].slice(-28);
  }
  summary.contextTruncated=context.truncated.script;
  journeys.push(summary);
 }
 const counts=results.reduce((a,x)=>(a[x.outcome]=(a[x.outcome]??0)+1,a),{
  FAIL:0,LOCAL_GAP:0,CONTRACT_PASS:0,GUARD_PASS:0
 });
 const report={version:2,mode:'OFFLINE_LOCAL_V15',runs:results.length,
  counts,journeys,results,
  semanticGrade:'NOT_RUN',paidProviderRequests:0,
  limitations:'No Muse call, no browser E2E, no human review, no mic, no audio playback; PASS is structural only.'};
 if(write){
  const dir=resolve(OUTPUT);await mkdir(dir,{recursive:true});
  await writeFile(join(dir,'report.json'),JSON.stringify(report,null,2)+'\n');
  const lines=['# Show Assistant Gauntlet v2','',
   '**Offline local interpreter only. Muse quality: NOT_RUN.**','',
   'Turns: '+report.runs+'; '+JSON.stringify(counts),'',
   '| Journey | Turns | Contract/Guard PASS | Local GAP | FAIL | Context truncated |',
   '|---|---:|---:|---:|---:|---|',
   ...journeys.map(x=>'| '+x.id+' | '+x.turns+' | '+x.contractPass+
    ' | '+x.localGap+' | '+x.fail+' | '+x.contextTruncated+' |'),'',
   '## Critical failures',
   ...results.filter(x=>x.outcome==='FAIL').map(x=>
    '- '+x.id+' '+x.issues.join('; ')),
   '', '## Next',
   'Attach real AI responses using ONLY the existing pre-authorized shared-budget gateway.',
   'Human-review script evidence, ambiguous intent, audio claims and multi-turn memory.',
   'Do not call these offline counts model accuracy; do not modify expected labels to raise PASS.'];
  await writeFile(join(dir,'report.md'),lines.join('\n')+'\n');
 }
 return report;
}
function parse(argv){
 const opts={only:null,write:true,strict:false};
 for(const arg of argv){
  if(arg==='--no-write')opts.write=false;
  else if(arg==='--strict')opts.strict=true;
  else if(arg.startsWith('--only='))opts.only=arg.slice(7);
  else if(arg==='--help')opts.help=true;
  else throw new Error('UNKNOWN_OPTION '+arg);
 }
 return opts;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const opts=parse(process.argv.slice(2));
  if(opts.help)console.log('node tools/runq-show-assistant-gauntlet-v2.mjs [--only=marathon-44] [--no-write] [--strict]');
  else{
   const r=await runShowAssistantGauntlet(opts);
   console.log('RUNQ GAUNTLET OFFLINE',r.runs,'turns',JSON.stringify(r.counts),'NO PAID REQUESTS');
   if(r.counts.FAIL)process.exitCode=2;
   else if(opts.strict&&r.counts.LOCAL_GAP)process.exitCode=1;
  }
 }catch(error){console.error('GAUNTLET_ERROR',error.code??error.message);process.exitCode=1;}
}
