/**
 * Offline syntax gate for every repository ES module.
 *
 * Parses each .mjs file under src/, tools/ and test/ as a REAL ES module.
 * Node's plain `node --check` parses Script (CommonJS goal) for files without
 * a top-level import, so valid modules whose only ESM marker is a trailing
 * export (src/ui/runq-shell.mjs) were misreported as broken. This gate
 * instead compiles every module with vm.SourceTextModule behind
 * --experimental-vm-modules: it parses/compiles WITHOUT linking or
 * evaluating, so no module top-level code runs, no CLI tool can act on
 * process.argv, and no provider or network call is made.
 *
 * If the flag is absent (plain `npm run check:syntax`), the gate re-execs
 * itself exactly once with the flag and exchanges a JSON result. This
 * replaces the previous hand-maintained `&&` chain that left 41 core
 * modules (projectPersistence, cuePlayback, script, ...) uncovered.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SELF = fileURLToPath(import.meta.url);
const SYNTAX_TARGET_ROOTS = ['src', 'tools', 'test'];
const PARSE_JSON_MODE = '--parse-json';

function walkModules(dir, found) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkModules(full, found);
    else if (entry.isFile() && entry.name.endsWith('.mjs')) found.push(full);
  }
}

/** Sorted repo-relative list of every ES module covered by the syntax gate. */
export function collectSyntaxTargets() {
  const found = [];
  for (const dirRoot of SYNTAX_TARGET_ROOTS) walkModules(join(ROOT, dirRoot), found);
  return found.sort().map((full) => relative(ROOT, full).split(sep).join('/'));
}

function parseTargetsInProcess(targets) {
  const failures = [];
  for (const target of targets) {
    const absolute = isAbsolute(target) ? target : join(ROOT, target);
    try {
      new vm.SourceTextModule(readFileSync(absolute, 'utf8'), { identifier: target });
    } catch (error) {
      failures.push({ target, message: String(error?.message ?? error) });
    }
  }
  return { targets: [...targets], failures, passed: failures.length === 0 };
}

/**
 * Parse every target as an ES module. Targets may be repo-relative paths
 * (from collectSyntaxTargets) or absolute paths (used by the regression
 * test). If vm.SourceTextModule is unavailable in this process, exactly one
 * child Node with --experimental-vm-modules performs the whole batch and
 * reports back over JSON stdout.
 */
export function runSyntaxChecks({ targets = collectSyntaxTargets() } = {}) {
  if (!Array.isArray(targets) || targets.some((target) => typeof target !== 'string' || !target)) {
    throw new TypeError('Invalid syntax check targets');
  }
  if (typeof vm.SourceTextModule === 'function') return parseTargetsInProcess(targets);
  const child = spawnSync(
    process.execPath,
    ['--no-warnings', '--experimental-vm-modules', SELF, PARSE_JSON_MODE, ...targets],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (child.status === 0 && child.stdout) {
    try {
      const parsed = JSON.parse(child.stdout);
      if (parsed && Array.isArray(parsed.targets) && Array.isArray(parsed.failures)) return parsed;
    } catch {
      // Fall through: report the child output as a gate failure below.
    }
  }
  return {
    targets: [...targets],
    failures: [{
      target: targets.join(', '),
      message: String(child.stderr || child.stdout || 'syntax gate child process failed').trim(),
    }],
    passed: false,
  };
}

export function main() {
  const result = runSyntaxChecks();
  console.log(`Offline syntax gate: parsed ${result.targets.length} ES modules as real ES modules (compile-only).`);
  if (!result.passed) {
    for (const failure of result.failures) console.error(`SYNTAX FAIL ${failure.target}\n${failure.message}`);
    process.exitCode = 1;
    return;
  }
  console.log('All modules parse. No module execution, no provider calls.');
}

const args = process.argv.slice(2);
if (args[0] === PARSE_JSON_MODE) {
  // Child worker: the flag is active here, so parse in-process and answer JSON.
  console.log(JSON.stringify(parseTargetsInProcess(args.slice(1))));
} else if (args.length === 0) {
  main();
}
