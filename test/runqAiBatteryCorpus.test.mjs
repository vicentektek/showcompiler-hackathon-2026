import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const corpus=JSON.parse(await readFile(resolve('fixtures/qa/runq-ai-independent-v1.json'),'utf8'));
test('48 distinct synthetic questions over five expert-assistant areas',()=>{
  assert.equal(corpus.version,1);assert.equal(corpus.cases.length,48);
  assert.equal(new Set(corpus.cases.map(c=>c.id)).size,48);
  assert.deepEqual([...new Set(corpus.cases.map(c=>c.family))].sort(),
    ['ambiguity','diagnostics','expert-guide','memory','safety'].sort());
  assert.ok(corpus.cases.some(c=>c.language==='es'));
  assert.ok(corpus.cases.some(c=>c.language==='en'));
  for(const c of corpus.cases){
    assert.ok(c.prompt.length>=18&&c.expected?.status);
    assert.ok(['ANSWER','CLARIFY'].includes(c.expected.status));
    for(const p of [...(c.expected.requiredConceptGroups??[]),...(c.expected.forbiddenClaims??[])])
      assert.doesNotThrow(()=>new RegExp(p,'i'),`${c.id}: invalid regex ${p}`);
  }
});
test('one-command runner passes Node syntax check',()=>{
  const r=spawnSync(process.execPath,['--check','tools/runq-ai-battery.mjs'],{encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);
});
