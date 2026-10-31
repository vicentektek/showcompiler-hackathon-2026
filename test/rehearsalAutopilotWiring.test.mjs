import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('rehearsal-only auto GO has conspicuous manual arming, safe default and bilingual labels',()=>{
 const html=read('index.html'),ui=read('src/ui/rehearsal-auto-ui.mjs');
 for(const token of ['id="rqLiveMode"','value="assist"','value="auto"','id="rqLiveArm"',
  'aria-pressed="false" disabled','id="rqLiveArmStatus"','id="rqLiveAutoHistory"','id="rqLivePanicBtn"',
  '/src/ui/rehearsal-auto-ui.mjs'])assert.ok(html.includes(token),token);
 assert.ok(ui.includes("runq:voice-live-ready"));
 assert.ok(ui.includes("runq:voice-live-final"));
 assert.ok(ui.includes("runq:voice-live-stopping"));
 assert.ok(ui.includes("runq:rehearsal-auto-disarm"));
 assert.ok(ui.includes('window.confirm('));
 assert.ok(ui.includes('DISARM AUTOMATIC GO'));
 assert.ok(ui.includes('ARM AUTOMATIC GO'));
 assert.ok(ui.includes('DESARMAR GO AUTOMÁTICO'));
 assert.ok(ui.includes('ARMAR GO AUTOMÁTICO'));
 assert.ok(ui.includes('STEP 2 · ARM AUTO GO TO PLAY CUES'));
 assert.ok(ui.includes('LISTENING · AUTO GO NOT ARMED'));
 assert.ok(ui.includes("if(!armed)return;"));
});
test('speech can request GO only through the existing guarded operator playback path',()=>{
 const ui=read('src/ui/rehearsal-auto-ui.mjs'),app=read('src/ui/app.mjs');
 for(const forbidden of ['player.go(','player.stopAll(','operatorGoBtn','MODEL_API_KEY','api.meta.ai'])
  assert.ok(!ui.includes(forbidden),'Autopilot must not own direct transport: '+forbidden);
 assert.ok(ui.includes("new CustomEvent('runq:rehearsal-auto-go'"));
 assert.ok(app.includes("activeWorkspace!=='rehearsal'"));
 assert.ok(app.includes("document.body?.dataset.runqVoiceCapture!=='live'"));
 assert.ok(app.includes("getAttribute('aria-pressed')!=='true'"));
 assert.ok(app.includes("player.isPlaying(cueId)"));
 assert.ok(app.includes('executePreparedGo()'));
 assert.ok(app.includes('await player.go(cue)'));
 assert.ok(app.includes('completePreparedCue(operatorQueue,show.cues,id)'));
 assert.ok(app.includes("new CustomEvent('runq:rehearsal-auto-disarm'"));
});
test('browser modules are allowlisted and ARM unlocks sound output before any ASR GO',()=>{
 const server=read('tools/dev-server.mjs'),backend=read('src/core/audioBackend.mjs');
 const voice=read('src/ui/voice-live-ui.mjs'),app=read('src/ui/app.mjs'),auto=read('src/ui/rehearsal-auto-ui.mjs');
 for(const path of ['/src/ui/rehearsal-auto-ui.mjs','/src/core/rehearsalAutopilot.mjs'])
  assert.ok(server.includes(path));
 assert.ok(backend.includes('armAudioOutput:'));
 assert.ok(app.includes('runq:rehearsal-auto-arm-audio'));
 assert.ok(auto.includes('runq:rehearsal-auto-arm-audio'));
 assert.ok(voice.includes('runq:voice-live-final'));
 assert.ok(voice.includes('runq:voice-live-ready'));
 assert.ok(voice.includes('runq:voice-live-stopping'));
 assert.ok(auto.includes('document.hidden'));
});

test('one-click autopilot start, single confirmation and non-fatal busy GO replies',()=>{
 const html=read('index.html'),ui=read('src/ui/rehearsal-auto-ui.mjs');
 assert.ok(html.includes('id="rqLiveAutoStart"'));
 assert.ok(ui.includes('confirmedThisSession'));
 assert.ok(ui.includes("'TRANSPORT_BUSY'"));
 assert.ok(ui.includes('pendingQuickArm'));
});
