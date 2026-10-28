import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const worker = () => readFile(new URL('../modal/runq_sfx_pilot.py', import.meta.url), 'utf8');

test('SFX model cache is module-scoped so warm worker reuses loaded weights', async () => {
  const code = await worker();
  const modelIndex = code.indexOf('def get_model():');
  const generateIndex = code.indexOf('def generate_sfx(');
  assert.ok(modelIndex > 0 && generateIndex > modelIndex,
    'Model should be initialized by reusable module-level get_model');
  assert.match(code.slice(modelIndex - 40, modelIndex), /@lru_cache\(maxsize=1\)/);
  assert.match(code.slice(generateIndex), /get_model\(\)\.generate\(/);
  assert.match(code, /min_containers=0, max_containers=1/,
    'Pilot must default to scale-to-zero until operator explicitly authorizes warm GPU spend');
});

test('remote API accepts a free-text SFX prompt without a script reference', async () => {
  const code = await worker();
  assert.match(code, /sourceLineId:\s*str\s*\|\s*None\s*=\s*None/);
  assert.match(code, /if data\.sourceLineId is not None and not SAFE_ID\.fullmatch\(data\.sourceLineId\)/);
  assert.match(code, /def start_job\(data: JobRequest\)/);
});

test('SFX pilot never retries a paid job implicitly', async () => {
  const code = await worker();
  assert.match(code, /retries=0/);
  assert.match(code, /@modal\.asgi_app\(requires_proxy_auth=True\)/);
  assert.doesNotMatch(code, /min_containers=1/);
});

test('GPU scheduling can fall back to compatible A10 without permanent warm spend', async () => {
  const code = await worker();
  assert.match(code, /gpu=\["L4", "A10"\]/);
  assert.match(code, /min_containers=0, max_containers=1, scaledown_window=120/);
  assert.match(code, /retries=0/);
});
