import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('professional RunQ shell assets are wired to the browser and allowlisted', async () => {
  const [html, server, css, menu] = await Promise.all([
    read('index.html'), read('tools/dev-server.mjs'),
    read('src/ui/runq-theme.css'), read('src/ui/runq-menu.mjs'),
  ]);
  assert.match(html, /<title>(?:RunQ · Show Workspace \(Preview\)|RUNQ · Studio \/ Rehearsal \/ Stage)<\/title>/);
  assert.match(html, /href="\/src\/ui\/runq-theme\.css"/);
  assert.match(html, /href="\/src\/ui\/runq-visual-freeze-v15\.css"/);
  assert.match(server, /runq-visual-freeze-v15\.css/);
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
  assert.match(html, /<header class="topbar"/);
  assert.match(html, /<nav id="workspaceNav"/);
  assert.match(html, /<main>/);
  assert.match(shell, /:scope > \.topbar/);
  assert.match(shell, /:scope > #workspaceNav/);
  assert.match(shell, /:scope > main/);
  assert.match(app, /runq:workspace-changed/);
  assert.doesNotMatch(shell, /MutationObserver/);
  assert.doesNotMatch(shell, /createElement|\.append\(|\.prepend\(/);
  assert.doesNotMatch(shell, /querySelectorAll\(['"]\[data-workspaces\]['"]\)/);
  assert.doesNotMatch(shell, /panel\.before\(|view\.append\(panel\)|data\.rqView|data-rq-view/);
});

test('RunQ shell mounts on the existing DOM and handles 100 explicit workspace changes', async () => {
  const previousDocument = globalThis.document;
  const previousObserver = globalThis.MutationObserver;
  const registered = new Map();
  const makeNode = (dataset = {}) => {
    const classes = new Set();
    return {
      dataset,
      classList: {
        add: (...names) => names.forEach(name => classes.add(name)),
        remove: (...names) => names.forEach(name => classes.delete(name)),
        contains: name => classes.has(name),
      },
    };
  };
  const topbar = makeNode();
  const nav = makeNode();
  const main = makeNode();
  const navButtons = ['home', 'script', 'ai', 'cues', 'audio', 'soundlab', 'setup', 'rehearsal', 'operation']
    .map(workspace => makeNode({ workspaceNav: workspace }));
  nav.children = navButtons;
  const shell = makeNode({ activeWorkspace: 'home' });
  shell.children = [topbar, nav, main];
  shell.querySelector = selector => ({
    ':scope > .topbar': topbar,
    ':scope > #workspaceNav': nav,
    ':scope > main': main,
  }[selector] ?? null);
  const doc = {
    readyState: 'loading',
    querySelector: selector => selector === '.shell' ? shell : null,
    addEventListener: (type, callback) => registered.set(type, callback),
  };
  let observerCount = 0;
  globalThis.document = doc;
  globalThis.MutationObserver = class {
    constructor() { observerCount += 1; }
  };

  try {
    await import(
      new URL('../src/ui/runq-shell.mjs?workspace-cycle-regression', import.meta.url)
    );
    registered.get('DOMContentLoaded')();
    const workspaceListener = registered.get('runq:workspace-changed');
    assert.equal(typeof workspaceListener, 'function');
    assert.ok(topbar.classList.contains('rq-topbar'));
    assert.ok(nav.classList.contains('rq-nav'));
    assert.ok(main.classList.contains('rq-main'));

    const initialChildren = [...shell.children];
    const initialNavigation = [...nav.children];
    const workspaces = [
      'home', 'script', 'ai', 'cues', 'audio', 'soundlab', 'setup', 'rehearsal', 'operation',
    ];
    const started = Date.now();
    for (let index = 0; index < 100; index += 1) {
      const workspace = workspaces[index % workspaces.length];
      shell.dataset.activeWorkspace = workspace;
      workspaceListener({ detail: { workspace } });
    }

    assert.ok(Date.now() - started < 1000, 'workspace synchronization should not block');
    assert.equal(observerCount, 0, 'workspace synchronization must not create MutationObservers');
    assert.deepEqual(shell.children, initialChildren, 'shell structure must not be duplicated');
    assert.deepEqual(nav.children, initialNavigation, 'navigation must not be cloned');
    assert.equal(shell.dataset.activeWorkspace, 'home');
    assert.ok(shell.classList.contains('rq-ctx-studio'));
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousObserver === undefined) delete globalThis.MutationObserver;
    else globalThis.MutationObserver = previousObserver;
  }
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

test('Cue editor gives the sequence more space than the inspector on desktop', async () => {
  const css = await read('src/ui/runq-visual-freeze-v15.css');
  assertBalancedCss(css);
  assert.match(css, /\.rq8\.rq14 \.shell\[data-active-workspace="cues"\] \.rq5-show-workspace \.cue-workspace-body/);
  assert.match(css, /grid-template-columns:\s*minmax\(0,\s*2\.3fr\)\s*minmax\(390px,\s*\.95fr\)!important/);
  assert.match(css, /@media\s*\(max-width:\s*800px\)[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/);
});

test('Cue editor explorer uses real project media and keeps AI context reviewable', async () => {
  const [html,app,agent,stage,css]=await Promise.all([
    read('index.html'),read('src/ui/app.mjs'),
    read('src/ui/runq-agent-ui.mjs'),read('src/ui/runq-stagecraft-rebuild.mjs'),
    read('src/ui/runq-visual-freeze-v15.css'),
  ]);
  assert.ok(html.indexOf('id="rqProjectExplorer"') < html.indexOf('id="cueList"'));
  assert.match(html,/id="rqExplorerSearch"/);
  assert.match(html,/id="rqExplorerFiles"/);
  assert.match(html,/id="rqExplorerDetails"/);
  assert.match(app,/function renderProjectExplorer\(\)/);
  assert.match(app,/player\.hasAsset\(asset\.id\)/);
  assert.match(app,/selectCueForInspection\(cue\.id\)/);
  assert.match(agent,/buildAgentContext\(s\.project/);
  assert.match(agent,/rqAgentContextSummary/);
  assert.match(agent,/runq:cue-chat-selection',sync/);
  assert.match(agent,/uiLocaleSelect'\)\?\.addEventListener\('change',sync\)/);
  assert.match(agent,/rqAgentContextBoundary/);
  assert.match(agent,/function translateAgentUi\(\)/);
  assert.match(agent,/rqAgentExampleVoice/);
  assert.match(stage,/cueBody\.replaceChildren\(projectExplorer,sequenceFrame,inspectorFrame\)/);
  assert.match(css,/rq-project-explorer/);
  assert.match(css,/--rq15-explorer-width:clamp\(190px,16vw,270px\)/);
  assert.match(css,/grid-template-columns:var\(--rq15-explorer-width\) minmax\(0,1fr\) var\(--rq15-inspector-width\)!important/);
  assert.match(css,/grid-template-areas:"topbar" "menubar" "workspace" "main" "footer"!important/);
  assert.match(css,/data-active-workspace="operation"\],\[data-active-workspace="rehearsal"\]\) #rqProjectExplorer/);
  assert.match(css,/#workspaceNav \.workspace-tab\{\s*width:auto!important/);
  assert.match(css,/shell\[data-active-workspace="cues"\] \.runq-cue-columns\{\s*width:100%!important;margin-left:0!important/);
  assert.match(css,/@media\(max-height:950px\) and \(min-width:801px\)/);
  assert.match(css,/@media\s*\(max-width:\s*800px\)/);
  const explorer=app.slice(app.indexOf('function renderProjectExplorer'),app.indexOf('function renderCueList'));
  assert.doesNotMatch(explorer,/executeCueById|auditionAsset|operatorQueue\s*=/,
    'explorer selection must not execute, audition, or prepare a cue');
});
