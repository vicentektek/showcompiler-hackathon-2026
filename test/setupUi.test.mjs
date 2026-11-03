import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('index.html');
const setup=read('src/ui/setup-ui.mjs');
const declared=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]));

test('Setup controller references existing controls and has explicit microphone lifecycle',()=>{
 for(const [,id] of setup.matchAll(/\$\('([^']+)'\)/g))
  assert.ok(declared.has(id),'Missing Setup control: '+id);
 assert.match(setup,/mediaDevices\?\.getUserMedia/);
 assert.match(setup,/media\?\.enumerateDevices/);
 assert.match(setup,/microphoneStartToken/);
 assert.match(setup,/track\.stop\(\)/);
 assert.match(setup,/runq:workspace-changed/);
 assert.match(setup,/visibilitychange/);
 assert.doesNotMatch(setup,/fetch\(|XMLHttpRequest|operatorGoBtn|player\.go\(/);
 const mount=setup.slice(setup.indexOf('function mount()'));
 assert.doesNotMatch(mount,/getUserMedia/);
});

test('Setup audio and microphone preferences are local and excluded from show export',()=>{
 assert.match(setup,/saveOperatorPreferences\(storage\(\),next\)/);
 assert.match(setup,/runq:operator-preferences-changed/);
 assert.match(setup,/runq:audio-control/);
 assert.match(setup,/setupExportShow/);
 assert.match(setup,/saveBundleBtn/);
 assert.match(html,/data-workspaces="preflight"/);
 assert.match(html,/id="setupMicStart"/);
 assert.match(html,/id="preflightSummary"/);
 assert.match(html,/id="preflightIssues"/);
});
