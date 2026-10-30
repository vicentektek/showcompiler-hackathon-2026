import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('professional RunQ shell assets are wired to the browser and allowlisted', async () => {
  const [html, server, css, menu] = await Promise.all([
    read('index.html'), read('tools/dev-server.mjs'),
    read('src/ui/runq-theme.css'), read('src/ui/runq-menu.mjs'),
  ]);
  assert.match(html, /<title>RunQ · Show Workspace \(Preview\)<\/title>/);
  assert.match(html, /href="\/src\/ui\/runq-theme\.css"/);
  assert.match(html, /src="\/src\/ui\/runq-menu\.mjs"/);
  assert.match(server, /'\/*src\/ui\/runq-theme\.css'/);
  assert.match(server, /'\/*src\/ui\/runq-menu\.mjs'/);
  assert.match(css, /\.shell\[data-active-workspace="cues"\] \.operator-queue/);
  assert.match(css, /#operatorPanicBtn/);
  assert.match(css, /@media\(max-width:740px\)/);
  assert.match(menu, /executeCommand\(action\)/);
});
test('desktop menu has visible navigation and does not impersonate transport', async () => {
  const menu=await read('src/ui/runq-menu.mjs');
  for (const name of ['File','Edit','View','Cues','Tools','Help']) {
    assert.match(menu, new RegExp('name:"' + name + '"'));
  }
  assert.doesNotMatch(menu, /["']operatorGoBtn["']/);
  assert.doesNotMatch(menu, /["']operatorPanicBtn["']/);
  assert.doesNotMatch(menu, /\.play\(/);
  assert.doesNotMatch(menu, /\.go\(/);
});
test('UI branding keeps original project/runtime identifiers unchanged', async () => {
  const html=await read('index.html');
  assert.match(html, /id="operatorGoBtn"/);
  assert.match(html, /id="operatorPanicBtn"/);
  assert.match(html, /id="preparedCueStatus"/);
  assert.match(html, /id="cueInspector"/);
  assert.match(html, /id="uiLocaleSelect"/);
  assert.match(html, /id="saveBundleBtn"/);
});

test('RunQ workspace v2 keeps dense editor and library independent of execution', async () => {
  const [html, server, css, enhancement] = await Promise.all([
    read('index.html'),read('tools/dev-server.mjs'),
    read('src/ui/runq-workspaces-v2.css'),read('src/ui/runq-workspaces-v2.mjs')
  ]);
  assert.match(html,/runq-workspaces-v2\.css/);
  assert.match(html,/runq-workspaces-v2\.mjs/);
  assert.match(server,/runq-workspaces-v2\.css/);
  assert.match(server,/runq-workspaces-v2\.mjs/);
  assert.match(css,/runq-cue-columns/);
  assert.match(css,/runq-audio-overview/);
  assert.match(css,/data-cue-density="standard"/);
  assert.match(enhancement,/function createAudioEnhancements/);
  assert.match(enhancement,/function createEditorEnhancements/);
  assert.match(enhancement,/function translateEnhancements/);
  assert.doesNotMatch(enhancement,/operatorGoBtn|operatorPanicBtn|\.go\(|\.play\(/);
  assert.match(enhancement,/MutationObserver\(updateCounts\)/);
});

test('RunQ shell leaves shared workspace panels under app.mjs visibility control', async () => {
  const [html, app, shell] = await Promise.all([
    read('index.html'), read('src/ui/app.mjs'), read('src/ui/runq-shell.mjs'),
  ]);

  assert.match(html, /data-workspaces="script rehearsal"/);
  assert.match(html, /data-workspaces="cues operation rehearsal"/);
  assert.match(
    app,
    /panel\.hidden\s*=\s*!panel\.dataset\.workspaces\.split\(' '\)\.includes\(activeWorkspace\)/,
  );
  assert.doesNotMatch(shell, /querySelectorAll\(['"]\[data-workspaces\]['"]\)/);
  assert.doesNotMatch(shell, /panel\.before\(|view\.append\(panel\)|data\.rqView|data-rq-view/);
});

test('RunQ density changes preserve unrelated root feature classes', async () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    getElementById: () => null,
    querySelector: () => null,
    readyState: 'loading',
    addEventListener() {},
  };

  try {
    const { applyDensity } = await import(
      new URL('../src/ui/runq-shell.mjs?runq-density-regression', import.meta.url)
    );
    assert.equal(typeof applyDensity, 'function');

    const classes = new Set(['rq8', 'rq14', 'density-compact']);
    const root = {
      classList: {
        add: (...names) => names.forEach((name) => classes.add(name)),
        remove: (...names) => names.forEach((name) => classes.delete(name)),
      },
    };

    assert.equal(applyDensity(root, 'comfortable'), true);
    assert.deepEqual([...classes].sort(), ['density-comfortable', 'rq14', 'rq8']);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

function assertBalancedCss(source) {
  let depth = 0;
  let line = 1;
  let quote = '';
  let inComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '\n') line += 1;

    if (inComment) {
      if (char === '*' && next === '/') {
        inComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (char === '\\') index += 1;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '/' && next === '*') {
      inComment = true;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      assert.ok(depth > 0, `orphan closing brace at line ${line}`);
      depth -= 1;
    }
  }

  assert.equal(depth, 0, `${depth} unclosed CSS block(s)`);
}

test('RunQ shell stylesheet has balanced rule blocks', async () => {
  assertBalancedCss(await read('src/ui/runq-shell.css'));
});
