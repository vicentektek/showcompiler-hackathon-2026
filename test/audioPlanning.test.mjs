import test from 'node:test';
import assert from 'node:assert/strict';
import { createNewShow, addAudioReference, addMockProposal, addModelProposals, decideProposal, assignAudioToCue, setCueSoundResolution } from '../src/core/workspace.mjs';
import { serializeShowProject, deserializeShowProject, normalizeShowProject } from '../src/core/projectPersistence.mjs';
import { validateCueProposals } from '../src/core/proposals.mjs';
import { BrowserAudioEngine } from '../src/core/browserAudio.mjs';

function show() { return createNewShow({ id:'show-1', name:'La ciudad suena', scriptText:'ESCENA\n(Truenos en la ciudad)\nANA: ¡Fuera!' }); }
const suggestion = {lineId:'L2',assetId:null,label:'Tormenta lejana',soundPrompt:'Low distant thunder under windy urban ambience'};

test('manual unbound sound proposal needs no assets and stays pending',()=>{
  const p=addMockProposal(show(),{lineId:'L2',label:'Sonido de tormenta'});
  assert.deepEqual(p.assets,[]);
  assert.equal(p.proposals[0].actions[0].type,'PLAN_AUDIO');
  assert.equal(p.proposals[0].actions[0].resolution,'DEFER');
  assert.equal(p.proposals[0].status,'PENDING');
  assert.equal(p.cues.length,0);
});

test('model builds traceable sound needs without an existing audio library',()=>{
 const p=addModelProposals(show(),[suggestion],'BASETEN_MUSE_SPARK_OPEN');
 assert.equal(p.proposals[0].actions[0].prompt,suggestion.soundPrompt);
 assert.equal(p.proposals[0].source,'BASETEN_MUSE_SPARK_OPEN');
 assert.equal(p.cues.length,0);
});

test('explicit approval creates unbound draft cue, not an executable cue',async()=>{
 const pending=addModelProposals(show(),[suggestion],'BASETEN_MUSE_SPARK_OPEN');
 const approved=decideProposal(pending,pending.proposals[0].id,'APPROVE');
 assert.equal(approved.proposals[0].status,'APPROVED');
 assert.equal(approved.cues[0].status,'DRAFT');
 assert.equal(approved.cues[0].actions[0].type,'PLAN_AUDIO');
 const audio=new BrowserAudioEngine({contextFactory:()=>{throw Error('should not create context');}});
 await assert.rejects(audio.go(approved.cues[0]),/sin todos sus audios/);
});

test('defer and prepare-generation options save only intent; no API or audio is called',()=>{
 let current=addModelProposals(show(),[suggestion],'META_MODEL_API');
 current=decideProposal(current,current.proposals[0].id,'APPROVE');
 const originalText=current.scriptText;
 current=setCueSoundResolution(current,current.cues[0].id,'GENERATE');
 assert.equal(current.cues[0].actions[0].resolution,'GENERATE');
 assert.equal(current.proposals[0].actions[0].resolution,'GENERATE');
 assert.equal(deserializeShowProject(serializeShowProject(current)).cues[0].actions[0].resolution,'GENERATE');
 current=setCueSoundResolution(current,current.cues[0].id,'DEFER');
 assert.equal(current.cues[0].actions[0].resolution,'DEFER');
 assert.equal(current.scriptText,originalText);
 assert.equal(current.assets.length,0);
 assert.throws(()=>setCueSoundResolution(current,current.cues[0].id,'EXECUTE'));
});

test('library assignment updates approved parent and cue together',()=>{
 let current=addModelProposals(show(),[suggestion],'BASETEN_MUSE_SPARK_OPEN');
 current=decideProposal(current,current.proposals[0].id,'APPROVE');
 current=addAudioReference(current,'rain.wav');
 const cueId=current.cues[0].id,assetId=current.assets[0].id;
 const resolved=assignAudioToCue(current,cueId,assetId);
 assert.deepEqual(resolved.cues[0].actions,[{type:'PLAY',assetId}]);
 assert.deepEqual(resolved.proposals[0].actions,[{type:'PLAY',assetId}]);
 assert.equal(deserializeShowProject(serializeShowProject(resolved)).cues[0].actions[0].assetId,assetId);
 assert.equal(current.cues[0].actions[0].type,'PLAN_AUDIO');
 assert.throws(()=>assignAudioToCue(current,cueId,'invented-asset'));
});

test('unbound plans still reject unsafe types, prompt overflow, unsupported resolution',()=>{
 let current=addModelProposals(show(),[suggestion]);
 current=decideProposal(current,current.proposals[0].id,'APPROVE');
 for(const patch of [
  {type:'PLAN_AUDIO',prompt:'oops',resolution:'EXECUTE'},
  {type:'PLAN_AUDIO',prompt:'x'.repeat(600),resolution:'DEFER'},
  {type:'PLAN_AUDIO',prompt:'',resolution:'DEFER'},
  {type:'PLAN_AUDIO',prompt:'safe',resolution:'DEFER',url:'https://bad.example'},
 ]) {
  const corrupt={...current,cues:current.cues.map(c=>({...c,actions:[patch]}))};
  assert.throws(()=>normalizeShowProject(corrupt));
 }
});

test('old bound v1 show projects continue to deserialize unchanged',()=>{
 let old=addAudioReference(show(),'intro.wav');
 old=addMockProposal(old,{lineId:'L2',label:'Thunder',assetId:old.assets[0].id});
 old=decideProposal(old,old.proposals[0].id,'APPROVE');
 const json=serializeShowProject(old);
 assert.deepEqual(deserializeShowProject(json),old);
});

test('reject suggestions referring to nonexistent resources even when planning is supported',()=>{
 const current=show();
 assert.throws(()=>addModelProposals(current,[{...suggestion,assetId:'invented'}]));
 assert.throws(()=>addModelProposals(current,[{...suggestion,lineId:'L99'}]));
 assert.throws(()=>addModelProposals(current,[{lineId:'L2',assetId:null,label:'Missing brief'}]));
 assert.throws(()=>addModelProposals(current,[{...suggestion,soundPrompt:'   '}]));
 const validated=validateCueProposals([{id:'proposal-1',label:'Test',sourceLineIds:['L2'],actions:[{type:'PLAY',assetId:'fake'}]}],[{id:'L2'}],[]);
 assert.equal(validated.valid,false);
});
