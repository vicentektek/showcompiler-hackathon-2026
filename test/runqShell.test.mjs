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