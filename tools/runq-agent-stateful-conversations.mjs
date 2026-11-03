#!/usr/bin/env node
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createNewShow} from '../src/core/workspace.mjs';
import {insertManualCue} from '../src/core/manualCues.mjs';
import {normalizeShowProject} from '../src/core/projectPersistence.mjs';
import {resolveAgentDialogue,updateAgentDialogueTask,boundedAgentConversation} from '../src/core/agentDialogue.mjs';
import {prepareAgentPlan,commitAgentPlan,undoAgentPlan} from '../src/core/agentCore.mjs';

const OUTPUT='artifacts/qa-show-assistant-stateful';
function show(id='stateful'){
 let project=createNewShow({id,name:'Stateful '+id,scriptText:'SCENE\nANA: Open the door.\n(A bell.)\nLUIS: It is raining.\nFIN'});
 for(const label of ['Intro','Door','Rain','Finale'])project=insertManualCue(project,{label}).project;
 return project;
}
const filler=index=>index%3===0?'Show summary':index%3===1?'Rehearsal note '+index:'Describe cue 1';
function turns(first,overrides={}){
 return Array.from({length:30},(_,index)=>overrides[index]??(index===0?first:filler(index)));
}
const DEFINITIONS=[
 {id:'apply-then-undo',turns:turns('Add 2 empty cues at the end'),events:{0:'APPLY',25:'UNDO'}},
 {id:'reject-then-apply',turns:turns('Add 3 empty cues at the end',{12:'Add 1 empty cue at the end'}),events:{0:'REJECT',12:'APPLY'}},
 {id:'cancel-pending',turns:turns('Add 4 empty cues at the end',{1:'Cancel the pending task',29:'you decide'}),events:{0:'PREPARE',1:'CANCEL'}},
 {id:'stale-after-edit',turns:turns('Rename cue 1 to Storm opening'),events:{0:'STALE_AFTER_MANUAL_EDIT'}},
 {id:'replace-project',turns:turns('Add 2 empty cues at the end',{29:'you decide'}),events:{0:'PREPARE',20:'REPLACE_PROJECT'}},
];
export function getStatefulConversationDefinitions(){return structuredClone(DEFINITIONS);}
export async function runStatefulConversations({write=true}={}){
 const reports=[];
 for(const definition of DEFINITIONS){
  let project=show(definition.id),task=null,history=[],pending=null,lastUndo=null;
  const initial=structuredClone(project),events=[];
  for(let index=0;index<definition.turns.length;index++){
   const prompt=definition.turns[index];
   const outgoing=boundedAgentConversation(history,{project,task});
   assert.ok(outgoing.length<=8);
   const reply=resolveAgentDialogue(project,prompt,{history:outgoing,task});
   task=updateAgentDialogueTask(project,prompt,reply,task);
   if(reply.status==='PLAN')pending=prepareAgentPlan(project,reply.operations);
   history=[...history,{role:'user',text:prompt},{role:'assistant',text:reply.message}].slice(-28);
   const event=definition.events[index];
   if(event==='APPLY'){
    assert.ok(pending);const applied=commitAgentPlan(project,pending,{editable:true});
    project=applied.project;lastUndo=applied.undo;pending=null;task=null;
   }else if(event==='UNDO'){
    assert.ok(lastUndo);project=undoAgentPlan(project,lastUndo,{editable:true});lastUndo=null;
   }else if(event==='REJECT'){
    assert.ok(pending);pending=null;task=null;
   }else if(event==='CANCEL'){
    assert.equal(reply.status,'CLARIFY');assert.equal(task,null);pending=null;
   }else if(event==='STALE_AFTER_MANUAL_EDIT'){
    assert.ok(pending);project=normalizeShowProject({...project,name:project.name+' manually edited'});
    assert.throws(()=>commitAgentPlan(project,pending,{editable:true}),/STALE_AGENT_PLAN/);
    pending=null;task=null;
   }else if(event==='REPLACE_PROJECT'){
    project=show('replacement-'+definition.id);pending=null;
    assert.equal(boundedAgentConversation(history,{project,task}).some(turn=>/Retained operator task/.test(turn.text)),false);
    task=null;
   }
   if(event)events.push({turn:index+1,event,status:reply.status,cueCount:project.cues.length});
   if(index===29&&['cancel-pending','replace-project'].includes(definition.id))
    assert.notEqual(reply.status,'PLAN','Old intent must not resurrect');
  }
  if(definition.id==='apply-then-undo')assert.deepEqual(project,initial);
  if(definition.id==='reject-then-apply')assert.equal(project.cues.length,initial.cues.length+1);
  if(definition.id==='cancel-pending')assert.deepEqual(project,initial);
  reports.push({id:definition.id,turns:definition.turns.length,events,finalCueCount:project.cues.length,
   boundedProviderConversationMax:8,paidRequests:0,transportCalls:0});
 }
 const report={version:1,mode:'OFFLINE_REAL_STATE_TRANSITIONS',conversations:reports.length,
  turns:reports.reduce((sum,row)=>sum+row.turns,0),reports};
 if(write){const dir=resolve(OUTPUT);await mkdir(dir,{recursive:true});
  await writeFile(join(dir,'report.json'),JSON.stringify(report,null,2)+'\n');
  await writeFile(join(dir,'report.md'),['# Stateful Show Assistant conversations','',
   '**Offline; no provider or transport calls.**','',
   ...reports.map(row=>'- '+row.id+': '+row.turns+' turns; '+row.events.map(event=>event.event+'@'+event.turn).join(', '))
  ].join('\n')+'\n');}
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const report=await runStatefulConversations();
 console.log('STATEFUL CONVERSATIONS',report.conversations,report.turns,'turns PASS NO PAID REQUESTS');
}
