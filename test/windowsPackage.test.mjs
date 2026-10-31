import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import {EventEmitter} from 'node:events';
import vm from 'node:vm';
import {buildWindowsPackage} from '../tools/windows/build-windows-package.mjs';

const windows=process.platform==='win32'&&process.arch==='x64';
test('Packaged startup errors exit nonzero and expose only a sanitized code',async()=>{
 const source=await readFile(new URL('../tools/windows/start-package.mjs',import.meta.url),'utf8');
 const bootstrap=source.replace(/^import \{createAppServer\} from '\.\.\/dev-server\.mjs';\r?\n/,'');
 assert.notEqual(bootstrap,source);
 const server=new EventEmitter(),processStub=new EventEmitter();
 const errors=[],exits=[];
 processStub.stdin=new EventEmitter();processStub.stdin.setEncoding=()=>{};
 processStub.exit=code=>exits.push(code);
 server.close=callback=>callback();server.closeAllConnections=()=>{};
 server.address=()=>({port:32123});
 server.listen=(port,host,callback)=>{assert.equal(port,0);assert.equal(host,'127.0.0.1');callback();};
 vm.runInNewContext(bootstrap,{createAppServer:()=>server,process:processStub,
  console:{log:()=>{},error:text=>errors.push(text)}});
 server.emit('error',Object.assign(new Error('Do not expose diagnostic details'),{code:'EACCES'}));
 processStub.stdin.emit('end');
 assert.deepEqual(exits,[1]);
 assert.deepEqual(errors,['RUNQ local server failed: EACCES']);
});
test('Windows package rejects incomplete verification inputs before creating output',{skip:!windows},async()=>{
 await assert.rejects(buildWindowsPackage({}),/Fresh external output/);
});
test('Windows build refuses to place a distribution inside the repository',{skip:!windows},async()=>{
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
 await assert.rejects(buildWindowsPackage({output:path.join(root,'should-not-be-created'),
  nodeLicensePath:'unused',expectedNodeSha256:'0'.repeat(64)}),/outside the repository/);
});
test('Windows distribution rejects an unverified runtime before writing files',{skip:!windows},async()=>{
 await assert.rejects(buildWindowsPackage({output:path.join(process.env.TEMP,'runq-unverified-never-created'),
  nodeLicensePath:'unused',expectedNodeSha256:'0'.repeat(64)}),/does not match/);
});
