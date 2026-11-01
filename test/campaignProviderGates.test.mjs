import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAppServer} from '../tools/dev-server.mjs';
import {CAMPAIGN_POLICY,isCampaignProviderProhibited} from '../src/qa/campaignPolicy.mjs';

// Production defaults only: no *CampaignProhibited override is injected here.
async function withServer(options,callback){
 const server=createAppServer(options);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{return await callback('http://127.0.0.1:'+server.address().port);}
 finally{await new Promise(resolve=>server.close(resolve));}
}
const spy=(value)=>{const fn=()=>{fn.calls++;return value;};fn.calls=0;return fn;};
const context={projectId:'gate',projectName:'Gate',counts:{cues:0},cues:[],lines:[],assets:[],
 truncated:{cues:false,script:false}};

test('campaign policy exposes a single fail-closed provider prohibition predicate',()=>{
 assert.equal(CAMPAIGN_POLICY.capsUsd.baseten,0);
 for(const provider of ['baseten','fireworks','voice','unknown-provider'])
  assert.equal(isCampaignProviderProhibited(provider),true,provider);
 for(const provider of ['meta','modal'])
  assert.equal(isCampaignProviderProhibited(provider),false,provider);
});

test('Baseten status reports campaign exclusion without reading BASETEN_API_KEY',async()=>{
 const getBasetenKey=spy('MUST_NOT_BE_READ');
 await withServer({getBasetenKey},async base=>{
  const response=await fetch(base+'/api/baseten/status');
  const raw=await response.text();
  assert.equal(response.status,200);
  const status=JSON.parse(raw);
  assert.equal(status.campaignProhibited,true);
  assert.equal(status.configured,false);
  assert.doesNotMatch(raw,/MUST_NOT_BE_READ/);
 });
 assert.equal(getBasetenKey.calls,0);
});

test('Baseten proposals are refused with an explicit campaign code before key, body or client',async()=>{
 const getBasetenKey=spy('MUST_NOT_BE_READ');let clientCalls=0;
 await withServer({getBasetenKey,basetenClient:async()=>{clientCalls++;}},async base=>{
  const response=await fetch(base+'/api/baseten/proposals',{method:'POST',
   headers:{origin:base,'Content-Type':'application/json'},body:'{"project":{}}'});
  assert.equal(response.status,403);
  assert.deepEqual(await response.json(),{code:'BASETEN_CAMPAIGN_PROHIBITED'});
 });
 assert.equal(getBasetenKey.calls,0);assert.equal(clientCalls,0);
});

test('agent route refuses provider baseten before reading any key or calling transport',async()=>{
 const getBasetenAgentKey=spy('MUST_NOT_BE_READ'),getAgentKey=spy('meta-test-key');let transport=0;
 await withServer({getBasetenAgentKey,getAgentKey,agentFetch:async()=>{transport++;}},async base=>{
  const response=await fetch(base+'/api/agent/interpret',{method:'POST',
   headers:{'Content-Type':'application/json',Origin:base,'X-Runq-Agent-Consent':'yes'},
   body:JSON.stringify({prompt:'Delete cue 2',language:'en',context,provider:'baseten'})});
  assert.equal(response.status,403);
  assert.deepEqual(await response.json(),{error:'PROVIDER_PROHIBITED_BY_CAMPAIGN'});
 });
 assert.equal(getBasetenAgentKey.calls,0);assert.equal(getAgentKey.calls,0);assert.equal(transport,0);
});

test('voice transcription is refused while the campaign voice cap is zero',async()=>{
 const getVoiceKey=spy('MUST_NOT_BE_READ');let upstream=0;
 await withServer({getVoiceKey,voiceFetch:async()=>{upstream++;}},async base=>{
  const response=await fetch(base+'/api/voice/transcribe',{method:'POST',headers:{
   'Content-Type':'audio/wav','X-RunQ-Voice-Consent':'yes','X-RunQ-Voice-Language':'es'},
   body:new Uint8Array(64)});
  assert.equal(response.status,403);
  assert.deepEqual(await response.json(),{error:'VOICE_CAMPAIGN_PROHIBITED'});
 });
 assert.equal(getVoiceKey.calls,0);assert.equal(upstream,0);
});

test('realtime voice session is refused while the campaign voice cap is zero',async()=>{
 const getVoiceKey=spy('MUST_NOT_BE_READ');let sockets=0;
 class Socket{constructor(){sockets++;}}
 await withServer({getVoiceKey,voiceWebSocket:Socket},async base=>{
  const response=await fetch(base+'/api/voice/live/start',{method:'POST',headers:{
   'Content-Type':'application/json','X-RunQ-Voice-Consent':'yes'},body:JSON.stringify({language:'es'})});
  assert.equal(response.status,403);
  assert.deepEqual(await response.json(),{error:'VOICE_CAMPAIGN_PROHIBITED'});
 });
 assert.equal(getVoiceKey.calls,0);assert.equal(sockets,0);
});

test('Baseten seminar runner refuses live mode before corpus, key use or any transport',async()=>{
 const {runBasetenSeminarEval}=await import('../tools/basetenSeminarEval.mjs');
 let corpusReads=0,calls=0;
 await assert.rejects(runBasetenSeminarEval({live:true,ackPaid:true,apiKey:'DUMMY_NEVER_SENT',
  corpusReader:async()=>{corpusReads++;return {cases:[]};},caller:async()=>{calls++;},
  fetchImpl:async()=>{calls++;throw new Error('network forbidden in test');}}),/CAMPAIGN_PROVIDER_PROHIBITED/);
 assert.equal(corpusReads,0);assert.equal(calls,0);
 const cli=readFileSync(new URL('../tools/run-baseten-seminar-eval.mjs',import.meta.url),'utf8');
 assert.ok(cli.indexOf("isCampaignProviderProhibited('baseten')")>=0&&
  cli.indexOf("isCampaignProviderProhibited('baseten')")<cli.indexOf('process.env.BASETEN_API_KEY'),
  'CLI must check campaign policy before touching BASETEN_API_KEY');
});

test('browser UI cannot select Baseten and explains the campaign exclusion in ES and EN',async()=>{
 const {commandDictationMessage}=await import('../src/ui/command-dictation.mjs');
 assert.match(commandDictationMessage('voice_campaign_prohibited','es'),/0 USD/);
 assert.match(commandDictationMessage('voice_campaign_prohibited','en'),/USD 0/);
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/<option value="baseten"[^>]*\bdisabled\b[^>]*data-i18n="proposals\.providerBasetenProhibited"/);
 const agent=readFileSync(new URL('../src/ui/runq-agent-ui.mjs',import.meta.url),'utf8');
 assert.match(agent,/option\.disabled=id==='baseten'/);
 const app=readFileSync(new URL('../src/ui/app.mjs',import.meta.url),'utf8');
 assert.match(app,/BASETEN_CAMPAIGN_PROHIBITED: 'errors\.basetenCampaignProhibited'/);
 for(const locale of ['en','es']){
  const messages=JSON.parse(readFileSync(new URL('../src/ui/locales/'+locale+'.json',import.meta.url),'utf8'));
  for(const key of ['proposals.providerBasetenProhibited','errors.basetenCampaignProhibited'])
   assert.ok(typeof messages[key]==='string'&&/Baseten/.test(messages[key]),locale+' '+key);
 }
});
