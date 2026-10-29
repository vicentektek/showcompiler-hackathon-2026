#!/usr/bin/env node
/**
 * Offline mass QA for RUNQ V15 agent. All cases are ORIGINAL synthetic data.
 * No provider client, microphone, browser transport or secret is imported.
 *
 * A passing run certifies deterministic plan correctness and safety only;
 * it DOES NOT measure Meta/Baseten reasoning accuracy or professional audio.
 */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createNewShow} from '../src/core/workspace.mjs';
import {insertManualCue} from '../src/core/manualCues.mjs';
import {normalizeShowProject} from '../src/core/projectPersistence.mjs';
import {resolveAgentDialogue} from '../src/core/agentDialogue.mjs';
import {prepareAgentPlan,commitAgentPlan,undoAgentPlan} from '../src/core/agentCore.mjs';

const categories=['direct-edit','creative-closing','conversation','negative-and-bounds',
 'reorder-and-undo','script-voice-and-audit'];
const script=[
 'ACTO I',
 'ANA: Ya tenemos todo preparado para comenzar ahora',
 '(Comienza la presentación)',
 'LUIS: Esta puerta se abrirá cuando lo diga',
 '(Se oye una puerta)',
 'ANA: Llegó el momento de terminar esta historia',
 '(Se escucha un golpe)',
 'LUIS: Que todos recuerden el final de la obra',
 '(La música termina)',
 'FIN'
].join('\n');
const dialog={spanish:[
 'los que te parezcan más apropiados','tú elige los adecuados',
 'decide tú cuáles convienen al cierre','lo que te parezca apropiado'
 ],english:[
 'whatever you think fits','you decide the most appropriate',
 'you choose','as you see fit'
 ]};
const addTemplates=[
 {prompt:'Añade 3 cues vacíos al final',count:3,empty:true},
 {prompt:'quiero que añadas 4 cues vacíos al finalizar el show',count:4,empty:true},
 {prompt:'Add 2 empty cues at the end',count:2,empty:true},
 {prompt:'Create 5 cues to finish the show',count:5,empty:false},
 {prompt:'agrega tres cues para el cierre',count:3,empty:false},
 {prompt:'añade algunos cues para rematar el show',count:3,empty:false},
 {prompt:'append one cue at the end',count:1,empty:false},
 {prompt:'crea dos cues vacíos al final',count:2,empty:true},
];
const forbidden=['GO','STOP','NEXT','ARM','EXECUTE_AUDIO','DELETE_FILE'];
function parseArgs(args=[]){
 const output={cases:600,seed:20261029,write:true};
 for(let index=0;index<args.length;index++){
  const flag=args[index],value=args[++index];
  if(flag==='--cases')output.cases=Number(value);
  else if(flag==='--seed')output.seed=Number(value);
  else if(flag==='--no-write'){index--;output.write=false;}
  else throw new TypeError('UNEXPECTED_CLI_FLAG');
 }
 if(!Number.isSafeInteger(output.cases)||output.cases<60||output.cases>2400||
  output.cases%6!==0||!Number.isSafeInteger(output.seed)||output.seed<1||
  output.seed>2147483647)throw new TypeError('INVALID_EVAL_OPTIONS');
 return output;
}
function random(seed){
 let state=seed>>>0;
 return ()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296;};
}
function sampleProject(id){
 let p=createNewShow({name:'Original synthetic show '+id,scriptText:script});
 for(const label of ['Introduction','Door FX','Final accent','Exit music']){
  p=insertManualCue(p,{label}).project;
 }
 return normalizeShowProject({...p,cues:p.cues.map((cue,index)=>({
  ...cue,sourceLineIds:[['L3','L5','L7','L9'][index]]
 }))});
}
function assertSafe(project,reply){
 assert.ok(['PLAN','ANSWER','CLARIFY','NEEDS_AI','SOUND_ADVICE'].includes(reply.status));
 assert.ok(Array.isArray(reply.operations));
 assert.ok(reply.operations.every(op=>!forbidden.includes(op.op)));
 assert.ok(reply.operations.length<=30);
 if(reply.status!=='PLAN'){
  assert.equal(reply.operations.length,0);
  return {applied:false,project};
 }
 const proposal=prepareAgentPlan(project,reply.operations);
 assert.equal(Object.hasOwn(proposal,'go'),false);
 assert.deepEqual(proposal.proposedProject.assets,project.assets);
 assert.equal(proposal.proposedProject.scriptText,project.scriptText);
 for(const cue of proposal.proposedProject.cues)
  assert.ok(cue.actions.every(a=>a.type!=='GO'&&a.type!=='STOP'));
 assert.throws(()=>commitAgentPlan(project,proposal,{editable:false}),/AGENT_EDIT_NOT_ALLOWED/);
 const result=commitAgentPlan(project,proposal,{editable:true});
 assert.deepEqual(undoAgentPlan(result.project,result.undo,{editable:true}),project);
 return {applied:true,project:result.project};
}
function caseCheck(id,category,rand){
 const show=sampleProject(id);
 const variant=Math.floor(id/categories.length);
 const old=JSON.stringify(show);
 let prompt='',history=[],expected=null;
 if(category==='direct-edit'){
  const target=2+Math.floor(rand()*3);
  prompt=(['elimina el cue ','borra el cue ','delete cue ','remove cue '][variant%4])+target;
  expected={kind:'DELETE_CUE',id:show.cues[target-1].id};
 }else if(category==='creative-closing'){
  const pick=addTemplates[variant%addTemplates.length];
  prompt=pick.prompt;expected={kind:'CREATE_CUE',count:pick.count,empty:pick.empty};
 }else if(category==='conversation'){
  const english=variant%3===0;
  const explicit=variant%5===0;
  history=[
   {role:'user',text:english?
    'add some cues at the end to finish the show':
    'añadelos al final son para rematar el show'},
   {role:'assistant',text:english?'Which cues should I add?':'¿Qué elementos quieres añadir?'}
  ];
  prompt=explicit?(english?'make it four cues instead':'mejor cuatro cues en vez de tres'):
   (english?dialog.english[variant%dialog.english.length]:
    dialog.spanish[variant%dialog.spanish.length]);
  expected={kind:'CREATE_CUE',count:explicit?4:3,empty:false};
 }else if(category==='negative-and-bounds'){
  const scenario=variant%5;
  if(scenario===0)prompt='No añadas 3 cues al final';
  if(scenario===1)prompt='añade 45 cues al final';
  if(scenario===2)prompt='los que te parezcan más apropiados';
  if(scenario===3)prompt='añade algunos cues';
  if(scenario===4)prompt='elimina el cue 999';
  expected={kind:'NO_PLAN'};
 }else if(category==='reorder-and-undo'){
  const from=2+Math.floor(rand()*3),to=1;
  const before=variant%2===0;
  prompt=before?('Mueve el cue '+from+' antes del '+to):
   ('Move cue '+from+' after cue '+to);
  expected={kind:'REORDER_CUE',id:show.cues[from-1].id};
 }else{
  prompt=variant%3===0?'Pon pies de voz coherentes a todos los cues':
   variant%3===1?'Audit the show':'Revisa el show';
  expected={kind:variant%3===0?'UPDATE_CUE':'AUDIT'};
 }
 const result=resolveAgentDialogue(show,prompt,{history});
 const applied=assertSafe(show,result);
 if(expected.kind==='NO_PLAN')assert.notEqual(result.status,'PLAN');
 else if(expected.kind==='AUDIT'){
  assert.equal(result.status,'ANSWER');
  assert.equal(result.report.cueCount,4);
  assert.ok(result.report.issues.length>=4);
 }else{
  assert.equal(result.status,'PLAN');
  if(expected.kind==='CREATE_CUE'){
   assert.equal(result.operations.length,expected.count);
   assert.ok(result.operations.every(op=>op.op==='CREATE_CUE'&&op.afterCueId===null));
   assert.equal(applied.project.cues.length,show.cues.length+expected.count);
   const added=applied.project.cues.slice(show.cues.length);
   assert.ok(added.every(x=>x.origin==='MANUAL'&&x.sourceLineIds.length===0&&
    x.actions.length===1&&x.actions[0].type==='PLAN_AUDIO'));
   if(expected.empty)assert.ok(added.every(c=>/cue pendiente|pending cue/i.test(c.label)));
   if(!expected.empty)assert.ok(/creative|creativ/i.test(result.message));
  }else if(expected.kind==='DELETE_CUE'){
   assert.equal(result.operations.length,1);
   assert.equal(result.operations[0].cueId,expected.id);
   assert.ok(!applied.project.cues.some(c=>c.id===expected.id));
  }else if(expected.kind==='REORDER_CUE'){
   assert.equal(result.operations[0].cueId,expected.id);
   assert.equal(applied.project.cues.length,show.cues.length);
   assert.ok(applied.project.cues.some(c=>c.id===expected.id));
  }else{
   assert.equal(result.operations.length,4);
   assert.ok(result.operations.every(op=>op.op==='UPDATE_CUE'));
   assert.ok(applied.project.cues.every(c=>(c.trigger??'').split(' ').length>=4));
  }
 }
 assert.equal(JSON.stringify(show),old,'Planning must NEVER mutate source project');
 return {status:result.status,operationCount:result.operations.length};
}
export async function evaluateAgentMass({cases=600,seed=20261029,write=false}={}){
 if(!Number.isInteger(cases)||cases<60||cases>2400||cases%6!==0)
  throw new TypeError('INVALID_EVAL_CASE_COUNT');
 const rand=random(seed),statistics=Object.fromEntries(categories.map(category=>[category,{
  attempted:0,passed:0,failed:0}]));
 const failures=[];
 for(let i=0;i<cases;i++){
  const category=categories[i%categories.length],report=statistics[category];
  report.attempted++;
  try{caseCheck(i,category,rand);report.passed++;}
  catch(error){
   report.failed++;
   failures.push({id:'agent-'+String(i+1).padStart(4,'0'),category,
    reason:String(error.code??error.message).slice(0,180)});
  }
 }
 const passed=Object.values(statistics).reduce((sum,x)=>sum+x.passed,0);
 const summary={schema:1,offline:true,paidRequests:0,providerQualityMeasured:false,
  seed,cases,passed,failed:cases-passed,statistics,failures:failures.slice(0,60)};
 if(write){
  const folder=resolve('artifacts/agent-eval');
  await mkdir(folder,{recursive:true});
  const rows=[
   '# RunQ V15 — Offline agent mass evaluation','',
   'This is deterministic synthetic QA, not a Meta/Baseten accuracy measurement.',
   'Zero provider calls, no personal scripts, no paid requests.','',
   '| Category | Passed | Cases |','| --- | ---: | ---: |',
   ...Object.entries(statistics).map(([key,value])=>
    '| '+key+' | '+value.passed+' | '+value.attempted+' |'),
   '','**Total: '+passed+'/'+cases+'**, failed '+summary.failed+'.',
   '','Seed: '+seed+'.','',
   ...summary.failures.map(f=>'- '+f.id+' / '+f.category+': '+f.reason),
  ];
  await writeFile(folder+'/summary.json',JSON.stringify(summary,null,2)+'\n');
  await writeFile(folder+'/summary.md',rows.join('\n')+'\n');
 }
 return summary;
}
const invoked=process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href;
if(invoked){
 const config=parseArgs(process.argv.slice(2));
 const report=await evaluateAgentMass(config);
 console.log('RUNQ AGENT MASS QA: '+report.passed+'/'+report.cases+
  ' PASS, '+report.failed+' FAIL, paid calls '+report.paidRequests);
 for(const [category,result] of Object.entries(report.statistics))
  console.log(category+': '+result.passed+'/'+result.attempted);
 if(report.failures.length)console.error(JSON.stringify(report.failures.slice(0,12),null,2));
 if(report.failed)process.exitCode=1;
}
