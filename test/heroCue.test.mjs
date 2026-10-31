import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {interpretHeroCueCommand,validateHeroCueOperation} from '../src/core/heroCue.mjs';
const scriptText=readFileSync(new URL('../fixtures/demo/runq-the-last-go-en.txt',import.meta.url),'utf8');
const show=()=>({scriptText,cues:[1,2,3].map(i=>({id:'cue-'+i,number:i,trigger:'existing foot '+i})),assets:[{id:'asset-1',name:'01_atmosphere.wav'}]});
const spoken='Insert a cue before cue three. Name it Decision Tension. Use the selected sound. Set the voice trigger to line twenty.';
const ready={selectedAssetId:'asset-1',assetAvailable:()=>true};

test('fixture is 31 lines and L20 is exactly Ella dialogue',()=>{
 const lines=scriptText.trimEnd().split('\n');
 assert.equal(lines.length,31);
 assert.equal(lines[19],'ELLA: And what happens if we skip straight to the decision?');
});
test('pure, anchored plan before cue 3 with zero mutation',()=>{
 const p=show(),before=JSON.stringify(p);
 const r=interpretHeroCueCommand(p,spoken,ready);
 assert.equal(r.status,'PLAN');
 assert.deepEqual(r.operations,[{op:'CREATE_CONFIGURED_CUE',afterCueId:'cue-2',label:'Decision Tension',
  assetId:'asset-1',sourceLineId:'L20',trigger:'And what happens if we skip straight to the decision?'}]);
 assert.deepEqual(validateHeroCueOperation(p,r.operations[0],ready),r.operations[0]);
 assert.equal(JSON.stringify(p),before);
});
test('missing, unready or unselected WAV always abstains',()=>{
 for(const opts of [{},{selectedAssetId:null,assetAvailable:()=>true},
  {selectedAssetId:'asset-1',assetAvailable:()=>false}])
  assert.equal(interpretHeroCueCommand(show(),spoken,opts).status,'CLARIFY');
});
test('bad cue destination or before-first insertion is refused',()=>{
 assert.equal(interpretHeroCueCommand(show(),spoken.replace('cue three','cue five'),ready).status,'CLARIFY');
 assert.equal(interpretHeroCueCommand(show(),spoken.replace('cue three','cue one'),ready).status,'CLARIFY');
});
test('nondialogue and duplicate voice triggers never produce a plan',()=>{
 assert.equal(interpretHeroCueCommand(show(),spoken.replace('line twenty','line twenty two'),ready).status,'CLARIFY');
 const p=show();p.cues[0].trigger='And what happens if we skip straight to the decision?';
 assert.equal(interpretHeroCueCommand(p,spoken,ready).status,'CLARIFY');
});
test('rejects fabricated trigger, missing asset and forbidden operation fields',()=>{
 const p=show(),op=interpretHeroCueCommand(p,spoken,ready).operations[0];
 assert.throws(()=>validateHeroCueOperation(p,{...op,trigger:'Invented spoken foot'},ready),/HERO_TRIGGER_NOT_FROM_SCRIPT/);
 assert.throws(()=>validateHeroCueOperation(p,{...op,assetId:'absent'},ready),/HERO_AUDIO_UNAVAILABLE/);
 assert.throws(()=>validateHeroCueOperation(p,{...op,go:true},ready),/INVALID_HERO_OPERATION/);
});
test('validation fails closed without a live ready-asset callback',()=>{
 const p=show(),op=interpretHeroCueCommand(p,spoken,ready).operations[0];
 assert.throws(()=>validateHeroCueOperation(p,op),/HERO_AUDIO_UNAVAILABLE/);
});
test('rechecks current script and current audio availability',()=>{
 const p=show(),op=interpretHeroCueCommand(p,spoken,ready).operations[0];
 const altered={...p,scriptText:p.scriptText.replace('skip straight to the decision?','skip ahead?')};
 assert.throws(()=>validateHeroCueOperation(altered,op,ready),/HERO_TRIGGER_NOT_FROM_SCRIPT/);
 assert.throws(()=>validateHeroCueOperation(p,op,{assetAvailable:()=>false}),/HERO_AUDIO_UNAVAILABLE/);
});
test('unrelated agent requests go to existing interpreter',()=>{
 assert.equal(interpretHeroCueCommand(show(),'Review the show',ready),null);
});
