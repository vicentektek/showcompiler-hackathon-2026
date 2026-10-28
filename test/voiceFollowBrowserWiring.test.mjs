import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeProjectVoiceScenario} from '../src/core/voiceScenario.mjs';
import {replayVoiceRehearsal} from '../src/core/voiceRehearsal.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('offline UI is wired into the existing rehearsal workspace',()=>{
 const html=read('index.html');
 const server=read('tools/dev-server.mjs');
 const app=read('src/ui/app.mjs');
 for(const token of ['id="rqvfPanel"','data-workspaces="rehearsal"','id="rqvfPlay"','id="rqvfPause"','id="rqvfStep"','id="rqvfSource"','/src/ui/voice-follow-ui.mjs','/src/ui/voice-follow.css'])
   assert.ok(html.includes(token),token);
 for(const path of ['/src/ui/voice-follow-ui.mjs','/src/ui/voice-follow.css','/src/core/voiceScenario.mjs','/src/core/voiceRehearsal.mjs','/src/core/voiceFollow.mjs','/test/fixtures/voice-rehearsal.json'])
   assert.ok(server.includes(path),path);
 assert.ok(app.includes("runq:voice-follow-read-project"));
 assert.ok(app.includes("runq:voice-follow-highlight-line"));
});

test('simulator UI has no audio transport, microphone or model service calls',()=>{
 const code=read('src/ui/voice-follow-ui.mjs');
 for(const dangerous of ['player.go','player.play','operatorGoBtn','operatorPanicBtn','completePreparedCue(','navigator.mediaDevices','api.meta.ai','MODEL_API_KEY'])
   assert.equal(code.includes(dangerous),false,dangerous);
 assert.ok(code.includes('replayVoiceRehearsal('));
 assert.ok(code.includes('GO ALWAYS MANUAL'));
 assert.ok(code.includes('GO SIEMPRE MANUAL'));
 assert.equal(code.includes('runq:voice-follow-prepare-cue'),false,'offline simulator never prepares cues');
});

test('current show scenario is deterministic and never creates an executable action',()=>{
 const show={scriptText:Array.from({length:55},(_,i)=>'L'+(i+1)).join('\n'),cues:[
  {id:'a',number:1,label:'Rain',trigger:'Comienza la lluvia intensa',sourceLineIds:['L4']},
  {id:'b',number:2,label:'Bell',trigger:'Suena la vieja campana',sourceLineIds:['L45']},
  {id:'ignored',trigger:'hola',sourceLineIds:['L7']}
 ]};
 const first=makeProjectVoiceScenario(show),second=makeProjectVoiceScenario(show);
 assert.deepEqual(first,second);
 assert.equal(first.events.filter(e=>e.type==='SET_FOCUS').length,1);
 const replay=replayVoiceRehearsal({...first,events:first.events});
 assert.deepEqual(replay.consumedIds,['a','b']);
 assert.equal(replay.log.filter(e=>e.type==='SUGGEST_PREPARE').length,2);
 assert.ok(replay.log.every(e=>!['GO','PLAY'].includes(e.type)));
});

test('no cues, missing text or invalid source line produces no fabricated transcript',()=>{
 const scriptText='ESCENA\nRey: Nadie puede entrar';
 assert.equal(makeProjectVoiceScenario({scriptText,cues:[]}),null);
 assert.equal(makeProjectVoiceScenario({scriptText,cues:[{id:'x',trigger:'Nadie puede entrar',sourceLineIds:['L999']}]}),null);
 assert.equal(makeProjectVoiceScenario({scriptText:'',cues:[{id:'x',trigger:'Nadie puede entrar',sourceLineIds:['L1']}]}),null);
 assert.throws(()=>makeProjectVoiceScenario({scriptText,cues:[]},{maxCues:999}));
});

test('provided fixture stays replayable without network or recorded speech',()=>{
 const scenario=JSON.parse(read('test/fixtures/voice-rehearsal.json'));
 const result=replayVoiceRehearsal(scenario);
 assert.deepEqual(result.consumedIds,['C14','C15']);
 assert.equal(result.log[3].reason,'UNSTABLE_TRANSCRIPT');
});
