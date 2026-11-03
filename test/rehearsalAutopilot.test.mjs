import test from 'node:test';
import assert from 'node:assert/strict';
import {makeProjectVoiceScenario} from '../src/core/voiceScenario.mjs';
import {initialRehearsalAutoState,decideRehearsalAutoGo,acknowledgeRehearsalAutoGo,
 discardRehearsalTurn} from '../src/core/rehearsalAutopilot.mjs';
const cues=[
 {id:'c1',lineId:'L2',trigger:'Escuchad el sonido de la tormenta'},
 {id:'c2',lineId:'L8',trigger:'La puerta se cierra muy lentamente'},
 {id:'c3',lineId:'L15',trigger:'Comienza la música de la escena'},
 {id:'c4',lineId:'L46',trigger:'Se oyen campanas desde la torre'},
 {id:'c5',lineId:'L51',trigger:'Escuchamos los pasos de los soldados'},
];
const speech=(text,atMs=10000)=>({text,final:true,endMs:atMs-40});
function choose(state,text,id,atMs=10000,extra={}){
 return decideRehearsalAutoGo({cues,transcript:speech(text,atMs),turnId:id,atMs,state,armed:true,...extra});
}
test('never automatically fires while disarmed, on partial, ambiguous or stale results',()=>{
 const state=initialRehearsalAutoState({focusLine:2});
 const text=cues[0].trigger;
 assert.equal(decideRehearsalAutoGo({cues,state,transcript:speech(text),turnId:1,atMs:10000}).action.reason,'NOT_ARMED');
 assert.equal(choose(state,text,'p',10000,{transcript:{...speech(text),final:false}}).action.reason,'NOT_FINAL');
 assert.equal(choose(state,text,'old',10000,{transcript:speech(text,1000)}).action.reason,'STALE');
 assert.equal(choose(state,'Hola','x').action.reason,'TOO_SHORT');
 assert.equal(choose(state,'Una frase completamente distinta','y').action.reason,'NO_MATCH');
});
test('play first then jump forward without firing intervening cues; rewind to earlier scene',()=>{
 let state=initialRehearsalAutoState({focusLine:2});
 let result=choose(state,cues[0].trigger,1,10000);
 assert.equal(result.action.type,'FIRE');
 state=acknowledgeRehearsalAutoGo(state,result.action);
 result=choose(state,cues[3].trigger,2,20000);
 assert.equal(result.action.type,'FIRE');
 assert.equal(result.action.movement,'SKIP_FORWARD');
 assert.equal(result.action.skippedCount,2);
 state=acknowledgeRehearsalAutoGo(state,result.action);
 result=choose(state,cues[1].trigger,3,30000);
 assert.equal(result.action.type,'FIRE');
 assert.equal(result.action.movement,'REWIND');
 state=acknowledgeRehearsalAutoGo(state,result.action);
 assert.deepEqual(state.history.map(x=>x.cueId),['c1','c4','c2']);
 assert.equal(state.focusLine,8);
});
test('same cue can replay when actor repeats the take, never double-fire same turn',()=>{
 let state=initialRehearsalAutoState({focusLine:8});
 let result=choose(state,cues[1].trigger,'turn-1',10000);
 state=acknowledgeRehearsalAutoGo(state,result.action);
 assert.equal(choose(state,cues[1].trigger,'turn-1',14000).action.reason,'DUPLICATE_TURN');
 assert.equal(choose(state,cues[1].trigger,'turn-2',11000).action.reason,'REPEAT_COOLDOWN');
 result=choose(state,cues[1].trigger,'turn-2',14000);
 assert.equal(result.action.type,'FIRE');
 assert.equal(result.action.movement,'REPEAT');
 state=acknowledgeRehearsalAutoGo(state,result.action);
 assert.equal(state.history.length,2);
});
test('global seek requires near-exact and sufficiently long text',()=>{
 const state=initialRehearsalAutoState({focusLine:2});
 const far=choose(state,cues[4].trigger,'far',10000);
 assert.equal(far.action.type,'FIRE');
 assert.equal(far.action.movement,'FIRST');
 assert.equal(choose(state,'Se oyen campanas de la torre','weaker',10000).action.type,'NONE');
});
test('identical cue triggers are ambiguous even with very high confidence',()=>{
 const duplicate={id:'c6',lineId:'L35',trigger:cues[1].trigger};
 const state=initialRehearsalAutoState({focusLine:8});
 const result=choose(state,cues[1].trigger,'dup',10000,{cues:[...cues,duplicate]});
 assert.equal(result.action.type,'NONE');
 assert.equal(result.action.reason,'AMBIGUOUS');
});
test('failed GO does not move playhead or mark action as fired; duplicate turn can be discarded',()=>{
 const state=initialRehearsalAutoState({focusLine:2}),r=choose(state,cues[0].trigger,'x');
 assert.equal(r.state,state);
 assert.equal(state.history.length,0);
 const discarded=discardRehearsalTurn(state,'x');
 assert.equal(choose(discarded,cues[0].trigger,'x').action.reason,'DUPLICATE_TURN');
});
test('English cues and spoken English match as strongly as Spanish',()=>{
 const state=initialRehearsalAutoState({focusLine:1});
 const english=[{id:'en',lineId:'L8',trigger:'Listen to the distant thunder coming'}];
 const result=decideRehearsalAutoGo({state,cues:english,
  transcript:speech('Listen to the distant thunder coming'),atMs:10000,turnId:1,armed:true});
 assert.equal(result.action.type,'FIRE');
 assert.equal(result.action.score,1);
});

test('configured two-word trigger survives autopilot loading and fires on an exact nearby final turn',()=>{
 const project={scriptText:'Opening\nThe stage is quiet\nA low drone',cues:[
  {id:'short',trigger:'is holding',sourceLineIds:['L3']},
 ]};
 const scenario=makeProjectVoiceScenario(project,{minimumWords:2});
 assert.equal(scenario?.cues.length,1);
 const state=initialRehearsalAutoState({focusLine:1});
 const result=choose(state,'Is holding.','short-turn',10000,{cues:scenario.cues});
 assert.equal(result.action.type,'FIRE');
 assert.equal(result.action.cueId,'short');
});

test('two-word triggers require exact whole-turn speech, proximity and uniqueness',()=>{
 const state=initialRehearsalAutoState({focusLine:1});
 const short=[{id:'short',lineId:'L3',trigger:'is holding'}];
 for(const text of ['holding','is hoping','someone is holding','is holding the door']) {
  assert.equal(choose(state,text,text,10000,{cues:short}).action.type,'NONE');
 }
 assert.equal(choose(state,'is holding','far',10000,{cues:[{...short[0],lineId:'L80'}]}).action.reason,'SEEK_TOO_SHORT');
 assert.equal(choose(state,'is holding','ambiguous',10000,{cues:[...short,{...short[0],id:'other'}]}).action.reason,'AMBIGUOUS');
 const fired=choose(state,'is holding','one',10000,{cues:short}).action;
 const after=acknowledgeRehearsalAutoGo(state,fired);
 assert.equal(choose(after,'is holding','one',14000,{cues:short}).action.reason,'DUPLICATE_TURN');
 assert.equal(choose(after,'is holding','two',11000,{cues:short}).action.reason,'REPEAT_COOLDOWN');
 assert.equal(choose(after,'is holding','three',14000,{cues:short}).action.type,'FIRE');
});
