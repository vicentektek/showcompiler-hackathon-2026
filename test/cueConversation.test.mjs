import test from 'node:test';
import assert from 'node:assert/strict';
import {createNewShow,addAudioReference,assignAudioToCue} from '../src/core/workspace.mjs';
import {insertManualCue} from '../src/core/manualCues.mjs';
import {
 stageCueConversationChange,applyCueConversationDraft,validateCueChatChanges,
 validateCueChatModelReply,parseLocalCueChat,buildCueChatContext
} from '../src/core/cueConversation.mjs';

function sample(){
 let p=createNewShow({name:'La última señal',scriptText:'La tormenta se acerca.\n(Suena una puerta)\n'});
 p=addAudioReference(p,'tormenta.wav');
 const inserted=insertManualCue(p,{label:'Tormenta'});
 p=assignAudioToCue(inserted.project,inserted.cueId,p.assets[0].id);
 return {project:p,cueId:inserted.cueId};
}
test('single cue stage changes volume, fade, loop without mutating current show or GO queue',()=>{
 const {project,cueId}=sample();
 const staged=stageCueConversationChange(project,cueId,{gainDb:-9,fadeInMs:3000,loop:true});
 assert.equal(staged.diff.length,3);
 assert.equal(project.cues[0].playback?.gainDb??0,0);
 assert.equal(staged.project.cues[0].playback.gainDb,-9);
 assert.equal(staged.project.cues[0].playback.fadeInMs,3000);
 assert.equal(staged.project.cues[0].playback.loop,true);
 assert.equal(Object.hasOwn(staged,'go'),false);
 assert.equal(Object.hasOwn(staged,'queue'),false);
});
test('conversational corrections are full staged edits and preserve previous intentions',()=>{
 const {project,cueId}=sample();
 let draft={gainDb:-9,fadeInMs:3000};
 const correction=parseLocalCueChat('Mejor que sean cuatro segundos',{lastField:'fadeInMs'});
 assert.deepEqual(correction,{fadeInMs:4000});
 draft={...draft,...correction};
 const stage=stageCueConversationChange(project,cueId,draft);
 assert.deepEqual(stage.project.cues[0].playback.fadeInMs,4000);
 assert.equal(stage.project.cues[0].playback.gainDb,-9);
});
test('offline ES and EN audio commands parse without provider calls',()=>{
 assert.deepEqual(parseLocalCueChat('Pon un fade in de 3 segundos y el volumen a -9 dB'),
  {gainDb:-9,fadeInMs:3000});
 assert.deepEqual(parseLocalCueChat('Set fade out to 2 seconds'),{fadeOutMs:2000});
 assert.deepEqual(parseLocalCueChat('Fade in 2 seconds and fade out 5 seconds'),
  {fadeInMs:2000,fadeOutMs:5000});
 assert.deepEqual(parseLocalCueChat('Ponlo en bucle'),{loop:true});
 assert.deepEqual(parseLocalCueChat('Desactivar bucle'),{loop:false});
 assert.equal(parseLocalCueChat('Añade música y crea un vídeo'),null);
});
test('AI context is limited to the active cue, exact source lines, scene heading and linked audio',()=>{
 const {project,cueId}=sample(),cue=project.cues[0];
 const contextual={
  ...project,name:'La última señal',
  scriptText:'ESCENA 1. La estación\nSe oye un trueno.\nLa tormenta se acerca.\nSuena una puerta.\nNORA: No recuerdo tormentas en esta escena.\n',
  cues:[{...cue,sourceLineIds:['L3']}],
 };
 const result=buildCueChatContext(contextual,cueId,'cues');
 assert.deepEqual(result,{
  showName:'La última señal',workspace:'cues',mode:'design-manual',
  sceneHeading:{lineId:'L1',text:'ESCENA 1. La estación'},
  sourceLineCount:1,sourceLinesOmitted:0,
  sourceLines:[{lineId:'L3',text:'La tormenta se acerca.'}],
  nearbyLines:[
   {lineId:'L2',text:'Se oye un trueno.'},
   {lineId:'L4',text:'Suena una puerta.'},
  ],
  audioStatus:'LINKED',
  linkedAudio:['tormenta.wav'],
 });
 assert.equal(JSON.stringify(result).includes('No recuerdo tormentas'),false);
});
test('strict values and incompatible playback fail without partially mutating project',()=>{
 const {project,cueId}=sample();
 for(const patch of [{gainDb:2},{gainDb:-100},{fadeInMs:10001},
  {loop:'yes'},{__proto__:null},{random:'drop table'},{repeatCount:40},{endAtMs:0}]){
  assert.throws(()=>stageCueConversationChange(project,cueId,patch));
 }
 assert.throws(()=>stageCueConversationChange(project,cueId,{loop:true,fadeOutMs:1000}),/looping playback/);
 assert.throws(()=>stageCueConversationChange(project,cueId,{loop:true,repeatCount:2}),/mutually exclusive/);
 assert.equal(project.cues.length,1);
});
test('metadata edits preserve cue source and source action provenance',()=>{
 const {project,cueId}=sample(),before=project.cues[0];
 const result=stageCueConversationChange(project,cueId,{label:'Tormenta lejana',trigger:'La lluvia golpea las ventanas'});
 assert.equal(result.project.cues[0].label,'Tormenta lejana');
 assert.equal(result.project.cues[0].trigger,'La lluvia golpea las ventanas');
 assert.deepEqual(result.project.cues[0].actions,before.actions);
 assert.deepEqual(result.project.cues[0].sourceLineIds,before.sourceLineIds);
});
test('model output cannot inject transport calls, unknown fields or scope changes',()=>{
 assert.deepEqual(validateCueChatModelReply({status:'PATCH',message:'Vale',changes:{gainDb:-6}}).changes,
  {gainDb:-6});
 for(const reply of [{status:'PATCH',message:'hack',changes:{go:true}},
  {status:'PATCH',message:'hack',changes:{gainDb:NaN}},
  {status:'PATCH',message:'hack',changes:{}},
  {status:'CLARIFY',message:'?',changes:{gainDb:-6}}]){
  assert.throws(()=>validateCueChatModelReply(reply));
 }
 assert.throws(()=>validateCueChatChanges({gainDb:-6,constructor:'Function'}));
});
