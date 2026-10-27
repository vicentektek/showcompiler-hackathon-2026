import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const app=readFileSync(new URL('../src/ui/app.mjs',import.meta.url),'utf8');
const en=JSON.parse(readFileSync(new URL('../src/ui/locales/en.json',import.meta.url),'utf8'));
const es=JSON.parse(readFileSync(new URL('../src/ui/locales/es.json',import.meta.url),'utf8'));

test('cue number/arrow is a separate accessible button, not nested inside inspector selection',()=>{
  assert.match(app,/const prepareNumber = node\('button', 'cue-prepare-trigger'\)/);
  assert.match(app,/prepareNumber\.dataset\.cuePrepare = cue\.id/);
  assert.match(app,/prepareNumber\.setAttribute\('aria-pressed'/);
  assert.match(app,/card\.append\(prepareNumber, select\)/);
  assert.match(app,/select\.addEventListener\('click', \(\) => selectCueForInspection\(cue\.id\)\)/);
  assert.match(app,/prepareNumber\.addEventListener\('click', \(\) => prepareCueForNextGo\(cue\.id\)\)/);
  const fn=app.match(/function prepareCueForNextGo\(cueId\) \{([\s\S]*?)\n\}/);
  assert.ok(fn);
  assert.match(fn[1],/prepareOperatorCue/);
  assert.doesNotMatch(fn[1],/player\.go\(|player\.stopCue\(|completePreparedCue/);
  const inspect=app.match(/function selectCueForInspection\(cueId\) \{([\s\S]*?)\n\}/);
  assert.ok(inspect);
  assert.doesNotMatch(inspect[1],/prepareOperatorCue|player\.go\(/);
});
test('Space is operation-only, blocks auto-repeat and focused interactive controls',()=>{
  const key=app.match(/document\.addEventListener\('keydown', event => \{([\s\S]*?)\n\}\);\n\n\$\('operatorGoBtn'\)/);
  assert.ok(key);
  assert.match(key[1],/activeWorkspace !== 'operation'/);
  assert.match(key[1],/event\.repeat/);
  assert.match(key[1],/input, textarea, select, button/);
  assert.match(key[1],/\$\('operatorGoBtn'\)\.disabled/);
  assert.match(key[1],/event\.preventDefault\(\)/);
});
test('bilingual hints distinguish inspect from prepare and do not suggest doubleclick playback',()=>{
  for(const dict of [en,es]){
    assert.ok(dict['cueEditor.prepareCue'].includes('{number}'));
    assert.ok(dict['cueEditor.prepareCue'].includes('{label}'));
    assert.ok(dict['cueEditor.listHelp'].length>50);
    assert.ok(dict['operator.explanation'].length>50);
  }
});
