import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectSyntaxTargets, runSyntaxChecks } from '../tools/check-syntax.mjs';

/**
 * Regression contract for the offline syntax gate: it must discover every
 * ES module under src/, tools/ and test/ automatically, so new modules can
 * never again silently fall outside `npm run check:syntax` coverage.
 */
test('syntax gate discovers every ES module under src, tools and test', () => {
  const targets = collectSyntaxTargets();
  assert.ok(targets.length > 100, `unexpectedly few modules discovered: ${targets.length}`);
  for (const required of [
    'src/core/workspace.mjs',
    'src/core/projectPersistence.mjs',
    'src/core/cuePlayback.mjs',
    'src/core/script.mjs',
    'src/core/audioBatchImport.mjs',
    'src/core/audioArchiveFormats.mjs',
    'src/ui/app.mjs',
    'src/ui/runq-shell.mjs',
    'src/ui/runq-workstation-v14.mjs',
    'src/ui/runq-stagecraft-rebuild.mjs',
    'tools/dev-server.mjs',
    'tools/check-syntax.mjs',
    'test/workspace.test.mjs',
  ]) {
    assert.ok(targets.includes(required), `syntax gate misses ${required}`);
  }
  // Embedded repository copies must never enter the gate.
  assert.equal(targets.filter((target) => target.startsWith('runq-v7-test')).length, 0);
});

test('syntax gate rejects a broken module and parses a valid one without executing either', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'runq-syntax-'));
  try {
    const brokenPath = join(tempDir, 'syntax-check-broken.mjs');
    writeFileSync(brokenPath, 'export const broken = { this is not valid javascript ;\n');
    const broken = runSyntaxChecks({ targets: [brokenPath] });
    assert.equal(broken.passed, false);
    assert.equal(broken.failures.length, 1);
    assert.equal(broken.failures[0].target, brokenPath);

    const valid = runSyntaxChecks({ targets: ['src/core/script.mjs'] });
    assert.equal(valid.passed, true);
    assert.deepEqual(valid.failures, []);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
