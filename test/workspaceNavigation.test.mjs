import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const client = readFileSync(new URL('../src/ui/app.mjs', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/ui/style.css', import.meta.url), 'utf8');
const en = JSON.parse(readFileSync(new URL('../src/ui/locales/en.json', import.meta.url), 'utf8'));
const es = JSON.parse(readFileSync(new URL('../src/ui/locales/es.json', import.meta.url), 'utf8'));
const workspaces = ['home', 'script', 'ai', 'cues', 'audio', 'setup', 'operation'];

test('one navigable workspace shell preserves live top-level transport controls', () => {
  for (const name of workspaces) {
    assert.match(html, new RegExp('data-workspace-nav="' + name + '"'));
    assert.match(html, new RegExp('data-workspaces="(?:[^"]*\\s)?' + name + '(?:\\s[^"]*)?"'));
    assert.ok(en['workspace.' + name]);
    assert.ok(es['workspace.' + name]);
    assert.ok(en['workspace.description.' + name]);
    assert.ok(es['workspace.description.' + name]);
  }
  assert.match(html, /id="activeShowTitle"/);
  assert.match(html, /id="saveState"/);
  assert.match(html, /id="stopAllBtn"/);
  assert.match(css, /\.topbar\{position:sticky/);
});

test('cue inspection and filtered list cannot mutate prepared operator queue', () => {
  assert.match(html, /id="cueInspector"/);
  assert.match(html, /id="cueSearchInput"/);
  assert.match(client, /let selectedCueId = null/);
  assert.match(client, /selectedCueId = cueId;/);
  assert.match(client, /const visibleCues = !cueQuery/);
  assert.match(client, /for \(const cue of visibleCues\)/);
  assert.match(client, /select\.addEventListener\('click', \(\) => selectCueForInspection\(cue\.id\)\)/);
  const selectHandler = client.match(/function selectCueForInspection\(cueId\) \{([\s\S]*?)\n\}/);
  assert.ok(selectHandler);
  assert.doesNotMatch(selectHandler[1], /operatorQueue\s*=|player\.go\(/);
  assert.match(client, /event\.key === 'ArrowDown'/);
  assert.match(client, /event\.key === 'Home'/);
  assert.match(client, /function renderCueList\(\)/);
  assert.match(client, /function renderCueInspector\(\)/);
  assert.match(client, /'cueEditor\.tab\.' \+ name/);
  assert.match(client, /function jumpToScriptLine\(lineId\) \{[\s\S]*?setWorkspace\('script'\)/);
});

test('backend capability and unreadiness are visibly disclosed in setup', () => {
  assert.match(html, /id="setupReadinessSummary"/);
  assert.match(html, /id="setupReadinessIssues"/);
  assert.match(client, /function renderSetupReadiness\(\)/);
  assert.match(client, /inspectShowReadiness\(show, assetId => player\.hasAsset\(assetId\)/);
  assert.match(html, /Not configured · no commands sent/);
  assert.match(en['workspace.engineNote'], /not wired/);
  assert.match(es['workspace.autoNotWired'], /desactivados/);
});

test('English and Spanish workspaces have matching translation keys', () => {
  const enKeys = Object.keys(en).filter(key => key.startsWith('workspace.')).sort();
  const esKeys = Object.keys(es).filter(key => key.startsWith('workspace.')).sort();
  assert.deepEqual(enKeys, esKeys);
  for (const key of enKeys) {
    assert.ok(en[key].trim(), key);
    assert.ok(es[key].trim(), key);
  }
});
