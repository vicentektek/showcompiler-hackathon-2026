import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('provider configuration documents only server-side placeholder names',async()=>{
  const env=await readFile('.env.example','utf8');
  assert.match(env,/^MODEL_API_KEY=\s*$/m);
  assert.match(env,/^BASETEN_API_KEY=\s*$/m);
  assert.doesNotMatch(env,/Bearer|https:\/\/|sk-|secret/i);
});

test('provider reports stay local and default package commands remain offline',async()=>{
  const [ignore,pkgText]=await Promise.all([readFile('.gitignore','utf8'),readFile('package.json','utf8')]);
  assert.match(ignore,/artifacts\/seminar-baseten\//);
  assert.match(ignore,/artifacts\/seminar-compare\//);
  const scripts=JSON.parse(pkgText).scripts;
  assert.equal(scripts['qa:baseten:plan'],'node tools/run-baseten-seminar-eval.mjs');
  assert.equal(scripts['qa:compare-providers'],'node tools/compare-provider-seminar.mjs');
  assert.doesNotMatch(scripts['qa:codex'],/live|BASETEN_API_KEY|MODEL_API_KEY/);
});
