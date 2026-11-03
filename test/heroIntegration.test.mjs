import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {buildEnglishVideoDemo,writeEnglishVideoDemo} from '../tools/video/build-the-last-go.mjs';
import {resolveAgentDialogue} from '../src/core/agentDialogue.mjs';
import {prepareAgentPlan,commitAgentPlan,undoAgentPlan} from '../src/core/agentCore.mjs';

const command='Insert a cue before cue three. Name it Decision Tension. Use the selected sound. Set the voice trigger to line twenty.';

test('Last GO Hero creates a reviewed configured cue, preserves source, and roundtrips undo',async()=>{
 const {project}=await buildEnglishVideoDemo();
 const options={selectedAssetId:project.assets[0].id,assetAvailable:()=>true};
 const reply=resolveAgentDialogue(project,command,options);
 assert.equal(reply.status,'PLAN');
 assert.equal(reply.operations[0].op,'CREATE_CONFIGURED_CUE');
 const plan=prepareAgentPlan(project,reply.operations,options);
 assert.equal(project.cues.length,3,'Preparation does not mutate the original show');
 const created=plan.proposedProject.cues[2];
 assert.equal(created.origin,'MANUAL');
 assert.equal(created.label,'Decision Tension');
 assert.deepEqual(created.sourceLineIds,['L20']);
 assert.equal(created.trigger,'And what happens if we skip straight to the decision?');
 assert.deepEqual(created.actions,[{type:'PLAY',assetId:project.assets[0].id}]);
 assert.equal(plan.proposedProject.scriptText,project.scriptText);
 const preview=plan.changes.find(change=>change.kind==='CREATED');
 assert.equal(preview.after.trigger,created.trigger);
 assert.deepEqual(preview.after.actions,created.actions);
 assert.throws(()=>commitAgentPlan(project,plan,{editable:true,assetAvailable:()=>false}),/AGENT_PLAN_FAILED/);
 const applied=commitAgentPlan(project,plan,{editable:true,...options});
 assert.equal(applied.project.cues.length,4);
 assert.deepEqual(undoAgentPlan(applied.project,applied.undo,{editable:true}),project);
});

test('Hero refuses unselected or unready audio instead of creating an empty placeholder',async()=>{
 const {project}=await buildEnglishVideoDemo();
 assert.equal(resolveAgentDialogue(project,command).status,'CLARIFY');
 assert.equal(resolveAgentDialogue(project,command,{
  selectedAssetId:project.assets[0].id,assetAvailable:()=>false,
 }).status,'CLARIFY');
 assert.equal(resolveAgentDialogue(project,'Create one cue at the end').status,'PLAN',
  'Ordinary manual cue creation keeps its existing interpreter');
 assert.equal(resolveAgentDialogue(project,command+' Do not use the selected sound.',{
  selectedAssetId:project.assets[0].id,assetAvailable:()=>true,
 }).status,'CLARIFY');
});

test('Last GO writer refuses to overwrite an existing operator archive',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'runq-last-go-test-'));
 const output=join(directory,'operator.showcompiler.zip');
 try{
  await writeFile(output,'operator material');
  await assert.rejects(writeEnglishVideoDemo({output}),/Refusing to overwrite/);
  assert.equal(await readFile(output,'utf8'),'operator material');
 }finally{await rm(directory,{recursive:true});}
});
