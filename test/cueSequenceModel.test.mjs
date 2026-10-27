import test from 'node:test';
import assert from 'node:assert/strict';
import { projectCueRows } from '../src/ui/v3/cueSequenceModel.mjs';

const fixture = () => ({
  assets:[{id:'a1',name:'Lluvia noche.wav'},{id:'a2',name:'Campana.wav'}],
  cues:[{
    id:'c1',number:1,label:'Tormenta',trigger:'GO al cerrar',notes:'Entrada nocturna',
    sourceLineIds:['L18'],actions:[{type:'PLAY',assetId:'a1'}],
    audioTracks:[{assetId:'a2'}],
  },{
    id:'c2',number:2,label:'Pausa',trigger:'',notes:'',
    sourceLineIds:[],actions:[{type:'PLAN_AUDIO',resolution:'DEFER'}],
  }],
});
test('cue rows expose true source, track and pending status without changing source',()=>{
  const original=fixture();const json=JSON.stringify(original);
  const rows=projectCueRows(original,{selectedCueId:'c2',preparedCueId:'c1'});
  assert.equal(rows[0].sourceLabel,'L18');
  assert.equal(rows[0].audioLabel,'Lluvia noche.wav · Campana.wav');
  assert.equal(rows[0].trackCount,2);
  assert.equal(rows[0].prepared,true);
  assert.equal(rows[0].selected,false);
  assert.equal(rows[1].unresolved,true);
  assert.equal(rows[1].selected,true);
  assert.equal(rows[1].prepared,false);
  assert.equal(JSON.stringify(original),json);
});
test('search works across labels, notes, numbers, source and audio with accents',()=>{
  const show=fixture();
  assert.deepEqual(projectCueRows(show,{query:'lluvia'}).map(r=>r.id),['c1']);
  assert.deepEqual(projectCueRows(show,{query:'nocturna'}).map(r=>r.id),['c1']);
  assert.deepEqual(projectCueRows(show,{query:'L18'}).map(r=>r.id),['c1']);
  assert.deepEqual(projectCueRows(show,{query:'campana'}).map(r=>r.id),['c1']);
  assert.deepEqual(projectCueRows(show,{query:'pausa'}).map(r=>r.id),['c2']);
  assert.deepEqual(projectCueRows(show,{query:'unrelated'}),[]);
});
test('large 500 cue sequence remains ordered, detached and independent from NEXT GO',()=>{
  const show={assets:[],cues:Array.from({length:500},(_,i)=>({
    id:'c'+i,number:i+1,label:'Cue '+i,trigger:'',sourceLineIds:[],actions:[],
  }))};
  const rows=projectCueRows(show,{selectedCueId:'c400',preparedCueId:'c2'});
  assert.equal(rows.length,500);
  assert.equal(rows[400].selected,true);
  assert.equal(rows[2].prepared,true);
  assert.equal(show.cues[400].id,'c400');
  assert.throws(()=>projectCueRows(show,{query:'x'.repeat(301)}),TypeError);
});
