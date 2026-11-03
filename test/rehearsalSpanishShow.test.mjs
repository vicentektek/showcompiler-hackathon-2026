import test from 'node:test';
import assert from 'node:assert/strict';
import {makeProjectVoiceScenario} from '../src/core/voiceScenario.mjs';
import {decideRehearsalAutoGo,acknowledgeRehearsalAutoGo,
 initialRehearsalAutoState} from '../src/core/rehearsalAutopilot.mjs';

// Grounded in the actual 12-cue Spanish complete show "La última señal".
const cueRows=[
 [1,9,'Esta noche la tormenta despierta sobre el puerto vacío.'],
 [2,13,'Escucho unos pasos que se acercan por el muelle.'],
 [3,16,'La campana del faro está sonando tres veces.'],
 [4,24,'Abre despacio la puerta de hierro oxidada.'],
 [5,29,'Oigo caer gotas desde lo alto de la escalera.'],
 [6,34,'La radio ha empezado a recibir un mensaje extraño.'],
 [7,41,'Saltan chispas del cuadro eléctrico de la sala.'],
 [8,45,'El motor de emergencia empieza a girar lentamente.'],
 [9,50,'Las olas están golpeando la base del faro.'],
 [10,52,'Tenemos que encender ahora la sirena de alerta.'],
 [11,59,'La luz principal ha vuelto a iluminar la costa.'],
 [12,62,'El amanecer nos encuentra juntos frente al mar.'],
];
const script=Array.from({length:64},(_,i)=>cueRows.find(c=>c[1]===i+1)?.[2]||'Acotación de la obra.').join('\n');
const project={scriptText:script,cues:cueRows.map(([n,line,trigger])=>({
 id:'cue-'+n,number:n,label:'Sonido '+n,sourceLineIds:['L'+line],trigger,
}))};
const scenario=makeProjectVoiceScenario(project,{maxCues:200});
function propose(state,number,turn,now){
 const utterance=cueRows[number-1][2];
 return decideRehearsalAutoGo({cues:scenario.cues,state,turnId:turn,atMs:now,armed:true,
  transcript:{text:utterance,final:true,endMs:now-50}});
}
test('full Spanish show loads 12 unique spoken cues with correct line references',()=>{
 assert.equal(scenario.cues.length,12);
 assert.deepEqual(scenario.cues.map(c=>c.lineId),cueRows.map(c=>'L'+c[1]));
 assert.equal(new Set(scenario.cues.map(c=>c.trigger)).size,12);
});
test('spoken Spanish cues fire in order and can rewind and skip nonintermediate cues',()=>{
 let state=initialRehearsalAutoState({focusLine:9}),time=10000;
 for(let n=1;n<=12;n++){
  const action=propose(state,n,'normal-'+n,time).action;
  assert.equal(action.type,'FIRE','Cue '+n+' should match exactly');
  state=acknowledgeRehearsalAutoGo(state,action);time+=4000;
 }
 let action=propose(state,2,'rewind',time).action;
 assert.equal(action.type,'FIRE');
 assert.equal(action.movement,'REWIND');
 state=acknowledgeRehearsalAutoGo(state,action);
 action=propose(state,11,'forward',time+4000).action;
 assert.equal(action.type,'FIRE');
 assert.equal(action.movement,'SKIP_FORWARD');
 assert.equal(action.skippedCount,8);
});
test('reading a compound dialogue ending in a cue still recognizes its exact Spanish trigger',()=>{
 let state=initialRehearsalAutoState({focusLine:9});
 const cue=cueRows[1][2];
 const preamble='Nunca había visto el cielo tan oscuro en este lugar. El generador se paró hace un rato. ';
 const now=20000;
 const result=decideRehearsalAutoGo({cues:scenario.cues,state,turnId:'compound',atMs:now,
  armed:true,transcript:{text:preamble+cue,final:true,endMs:now-30}});
 assert.equal(result.action.type,'FIRE');
 assert.equal(result.action.cueId,'cue-2');
});
test('unarmed, short, partial or duplicate Spanish phrases never execute a cue',()=>{
 let state=initialRehearsalAutoState({focusLine:9});
 const phrase=cueRows[0][2],now=20000;
 const initial=decideRehearsalAutoGo({cues:scenario.cues,state,turnId:'one',atMs:now,
  transcript:{text:phrase,final:true,endMs:now},armed:false});
 assert.equal(initial.action.reason,'NOT_ARMED');
 const incomplete=decideRehearsalAutoGo({cues:scenario.cues,state,turnId:'one',atMs:now,
  transcript:{text:phrase,final:false,endMs:now},armed:true});
 assert.equal(incomplete.action.reason,'NOT_FINAL');
 const fired=propose(state,1,'one',now).action;
 state=acknowledgeRehearsalAutoGo(state,fired);
 assert.equal(propose(state,1,'one',now+4000).action.reason,'DUPLICATE_TURN');
 assert.equal(propose(state,1,'two',now+1000).action.reason,'REPEAT_COOLDOWN');
 assert.equal(propose(state,1,'two',now+4000).action.type,'FIRE');
});
