import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppServer} from '../tools/dev-server.mjs';
import {validateSfxPromptSuggestion} from '../tools/sfxPromptRoutes.mjs';
import {likelySpanishSfxPrompt,englishDraftMatches,stageEnglishDraft} from '../src/sfx/englishDraft.mjs';

const suggestion={status:'READY',englishPrompt:'A heavy iron door slams shut with a sharp metallic impact and short reverberation.',sourceLanguage:'es',notes:[]};
const reply=value=>({ok:true,text:async()=>JSON.stringify({choices:[{
 finish_reason:'stop',message:{content:JSON.stringify(value)}}]})});
async function server(options,fn){
 const instance=createAppServer(options);
 await new Promise(resolve=>instance.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+instance.address().port;
 try{return await fn(base);}finally{await new Promise(resolve=>instance.close(resolve));}
}
function params(base,{consent=true,body}={}){
 return {method:'POST',headers:{
  Origin:base,'Content-Type':'application/json',
  ...(consent?{'X-RunQ-Prompt-Consent':'yes'}:{}),
 },body:JSON.stringify(body??{
  originalPrompt:'Una puerta de hierro se cierra de golpe',
  kind:'SFX',durationSeconds:4,mode:'IMPROVE',
 })};
}
test('Spanish detection is conservative; English descriptions bypass extra Meta calls',()=>{
 assert.equal(likelySpanishSfxPrompt('Una puerta de hierro se cierra de golpe'),true);
 assert.equal(likelySpanishSfxPrompt('Pasos lentos en un pasillo'),true);
 assert.equal(likelySpanishSfxPrompt('A heavy iron door slams shut'),false);
 assert.equal(likelySpanishSfxPrompt('A single bronze bell rings for two seconds'),false);
});
test('draft is invalidated on any original, type or duration change',()=>{
 const draft=stageEnglishDraft({
  originalPrompt:'Una puerta de hierro se cierra de golpe',kind:'SFX',
  durationSeconds:4,englishPrompt:suggestion.englishPrompt,
 });
 assert.equal(englishDraftMatches(draft,{originalPrompt:draft.originalPrompt,kind:'SFX',durationSeconds:4}),true);
 assert.equal(englishDraftMatches(draft,{originalPrompt:draft.originalPrompt,kind:'ENVIRONMENT',durationSeconds:4}),false);
 assert.equal(englishDraftMatches(draft,{originalPrompt:draft.originalPrompt+'!',kind:'SFX',durationSeconds:4}),false);
 assert.equal(englishDraftMatches(draft,{originalPrompt:draft.originalPrompt,kind:'SFX',durationSeconds:5}),false);
});
test('strict response rejects Spanish draft, unknown fields, invalid CLARIFY',()=>{
 assert.equal(validateSfxPromptSuggestion(suggestion).englishPrompt,suggestion.englishPrompt);
 assert.throws(()=>validateSfxPromptSuggestion({...suggestion,englishPrompt:'Una puerta de hierro se cierra de golpe'}));
 assert.throws(()=>validateSfxPromptSuggestion({...suggestion,executeGO:true}));
 assert.throws(()=>validateSfxPromptSuggestion({...suggestion,status:'CLARIFY'}));
});
test('server denies Meta prompt translation without consent or correct origin',async()=>{
 let calls=0;
 await server({getSfxPromptKey:()=> 'test-secret',sfxPromptFetch:async()=>{calls++;return reply(suggestion);}},async base=>{
  assert.equal((await fetch(base+'/api/sfx/prompt/suggest',params(base,{consent:false}))).status,403);
  assert.equal((await fetch(base+'/api/sfx/prompt/suggest',{...params(base),headers:{...params(base).headers,Origin:'http://evil.invalid'}})).status,403);
  assert.equal(calls,0);
 });
});
test('one authorized Meta call returns a draft; never calls Modal and never leaks key',async()=>{
 let calls=0,request;
 await server({getSfxPromptKey:()=> 'server-only-secret',
  sfxPromptFetch:async(url,options)=>{calls++;request={url,options};return reply(suggestion);},
 },async base=>{
  const response=await fetch(base+'/api/sfx/prompt/suggest',params(base));
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.englishPrompt,suggestion.englishPrompt);
  assert.equal(body.generationStarted,false);
  assert.equal(body.requiresManualApply,true);
  assert.equal(JSON.stringify(body).includes('server-only-secret'),false);
 });
 assert.equal(calls,1);
 assert.equal(request.url,'https://api.meta.ai/v1/chat/completions');
 const body=JSON.parse(request.options.body);
 assert.equal(body.model,'muse-spark-1.3');
 assert.ok(body.messages[1].content.includes('Una puerta de hierro'));
});
test('misconfigured Meta and malformed replies fail closed, never generate audio',async()=>{
 let calls=0;
 await server({getSfxPromptKey:()=>'',sfxPromptFetch:async()=>{calls++;return reply(suggestion);}},async base=>{
  const res=await fetch(base+'/api/sfx/prompt/suggest',params(base));
  assert.equal(res.status,503);assert.equal(calls,0);
 });
 await server({getSfxPromptKey:()=> 'key',sfxPromptFetch:async()=>reply({
  ...suggestion,englishPrompt:'¿Puerta de hierro?',})},async base=>{
   const res=await fetch(base+'/api/sfx/prompt/suggest',params(base));
   assert.equal(res.status,502);
   assert.equal((await res.json()).code,'SFX_PROMPT_INVALID_RESPONSE');
 });
});
