import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const load=path=>readFile(resolve(root,path),'utf8');

// The dev server deliberately uses a closed allowlist. Every transitive
// browser import must be in that list or an apparently normal page has
// inert tabs/buttons after one module-loading failure.
test('all browser entrypoints and transitive module imports are served',async()=>{
  const server=await load('tools/dev-server.mjs');
  const html=await load('index.html');
  const routes=new Map([...server.matchAll(/^\s*\['(\/[^']+)', \['([^']+)'/gm)]
    .map(([,web,fsPath])=>[web,fsPath]));
  const entries=[...html.matchAll(/<(?:script|link)\b[^>]+(?:src|href)="(\/[^"]+)"/g)]
    .map(([,web])=>web);
  entries.push('/src/sfx/lab.mjs'); // separately imported when Sound Lab opens
  const pending=[...new Set(entries)],checked=new Set(),missing=[];
  while(pending.length){
    const web=pending.shift();
    if(checked.has(web))continue;
    checked.add(web);
    const file=routes.get(web);
    if(!file){missing.push(web);continue;}
    const source=await load(file);
    if(!web.endsWith('.mjs'))continue;
    const imports=[
      ...[...source.matchAll(/^\s*(?:import|export)\s+(?:[^'"\n]*?\s+from\s+)?['"]([^'"]+)['"]/gm)].map(([,d])=>d),
      ...[...source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map(([,d])=>d),
    ];
    for(const dep of imports){
      if(!dep.startsWith('.')&&!dep.startsWith('/'))continue;
      const url=dep.startsWith('/')?posix.normalize(dep):posix.resolve(posix.dirname(web),dep);
      if(!checked.has(url)&&!pending.includes(url))pending.push(url);
    }
  }
  assert.deepEqual(missing,[], 'Browser resources not mapped by tools/dev-server.mjs');
  assert.ok(checked.has('/src/core/soundPromptCompiler.mjs'));
  assert.ok(checked.has('/src/core/sfxImportCandidate.mjs'));
});

test('Sound Lab prioritizes free prompt generation with optional script interpretation',async()=>{
  const html=await load('index.html');
  const prompt=html.indexOf('id="soundPrompt"');
  const script=html.indexOf('id="sfxScriptDetails"');
  assert.ok(prompt>=0&&script>prompt,'Free text prompt must be the first step');
  assert.match(html,/<details[^>]+id="sfxScriptDetails"/);
  assert.match(html,/<button[^>]+id="sfxReconnectBtn"/);
  assert.match(html,/<input[^>]+id="confirmRequest"/);
  assert.match(html,/<button[^>]+id="generateBtn"[^>]+disabled/);
  const count=(id)=>[...html.matchAll(new RegExp('id="'+id+'"','g'))].length;
  for(const id of ['soundPrompt','duration','seed','sourceLine','scriptSfxCompile','generateBtn','confirmRequest','sfxReconnectBtn']) {
    assert.equal(count(id),1,id+' must be unique');
  }
});
