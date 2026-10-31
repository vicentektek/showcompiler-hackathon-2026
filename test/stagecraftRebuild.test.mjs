import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createAppServer} from '../tools/dev-server.mjs';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('Stagecraft structural rebuild keeps all actual transport, project and editor handlers',async()=>{
 const [html,app,ui,css]=await Promise.all([
  read('index.html'),read('src/ui/app.mjs'),
  read('src/ui/runq-stagecraft-rebuild.mjs'),
  read('src/ui/runq-stagecraft-rebuild.css')
 ]);
 assert.match(html,/runq-stagecraft-v4\.css/);
 assert.match(html,/runq-stagecraft-rebuild\.css/);
 assert.match(html,/runq-stagecraft-rebuild\.mjs/);
 for(const id of ['cueList','cueInspector','operatorGoBtn','operatorPanicBtn',
   'preparedCueStatus','stopAllBtn','saveBundleBtn','runqCueDensity','assetList']){
   // Density selector belongs to the existing enhancement module, not static HTML.
   if(id!=='runqCueDensity')assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(ui,/cueBody\.replaceChildren\(projectExplorer,sequenceFrame,inspectorFrame\)/);
 assert.match(ui,/dock\.append\(queue\)/);
 assert.match(ui,/dock\.append\(activeCues\)/);
 assert.match(ui,/dock\.append\(footer\)/);
 assert.match(ui,/library\.append\(node\)/);
 assert.doesNotMatch(ui,/get\('operatorGoBtn'\)\?\.click\(/);
 assert.doesNotMatch(ui,/get\('operatorPanicBtn'\)\?\.click\(/);
 assert.doesNotMatch(ui,/\.go\(|\.stopAll\(|fetch\(/);
 assert.match(app,/runq:request-audio-source/);
 assert.match(css,/\.rq5-sequence-frame/);
 assert.match(css,/\.rq5-inspector-frame/);
 assert.match(css,/\.rq5-audio-grid/);
 assert.match(css,/@media\(max-height:700px\)/);
});
test('Stagecraft assets are served locally, no remote files or hidden fallback skin',async t=>{
 const server=createAppServer();
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const root='http://127.0.0.1:'+server.address().port;
 for(const [file,type] of [
  ['/src/ui/runq-stagecraft-v4.css','text/css'],
  ['/src/ui/runq-stagecraft-rebuild.css','text/css'],
  ['/src/ui/runq-stagecraft-rebuild.mjs','javascript'],
  ['/src/core/waveformPeaks.mjs','javascript'],
  ['/src/ui/operator-workbench.css','text/css'],
  ['/src/core/cueTimeEditing.mjs','javascript'],
 ]){
  const result=await fetch(root+file);
  assert.equal(result.status,200,file+' must be explicitly allowlisted');
  assert.match(result.headers.get('content-type'),new RegExp(type));
 }
 assert.equal((await fetch(root+'/src/ui/does-not-exist.css')).status,404);
});
