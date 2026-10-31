import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('microphone control shares Setup device and language preferences with explicit opt-in',()=>{
 const html=file('index.html'),js=file('src/ui/voice-microphone-test.mjs'),server=file('tools/dev-server.mjs');
 for(const id of ['rqMicPanel','rqMicStart','rqMicStop','rqMicMeter','rqMicStatus','rqMicListen','rqMicDownload'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.ok(html.includes('id="rqLiveDevice"'));
 assert.ok(html.includes('id="rqLiveLang"'));
 assert.equal(html.includes('id="rqMicLang"'),false);
 assert.ok(server.includes('/src/ui/voice-microphone-test.mjs'));
 assert.ok(html.includes('/src/ui/voice-microphone-test.mjs'));
 assert.ok(js.includes("getUserMedia("));
 assert.ok(js.includes('operatorPreferences.microphoneDeviceId'));
 assert.ok(js.includes('operatorPreferences.voiceLanguage'));
 assert.ok(js.includes("window.AudioContext"));
 assert.ok(js.includes('MAX_MS=10000'));
 assert.ok(js.includes("t('MICROPHONE TEST · LOCAL','PRUEBA DE MICRÓFONO · LOCAL')"));
 for(const bad of ['api.meta.ai','MODEL_API_KEY','operatorGoBtn','operatorQueue','XMLHttpRequest','WebSocket('])
  assert.equal(js.includes(bad),false,'Mic preflight cannot call '+bad);
 assert.ok(js.includes("fetch('/api/voice/transcribe'"));
 assert.ok(js.includes("$('rqMicConsent').checked"));
});
