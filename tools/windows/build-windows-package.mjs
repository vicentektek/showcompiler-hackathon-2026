/**
 * Offline Windows browser-demo distribution. Only server-public assets and
 * transitive server modules are copied, never worktree/config/ledger folders.
 */
import {readFile,writeFile,mkdir,readdir,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildEnglishVideoDemo} from '../video/build-the-last-go.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const quote=text=>"'"+String(text).replaceAll("'","''")+"'";
export async function buildWindowsPackage({output,nodeLicensePath,expectedNodeSha256}){
 if(process.platform!=='win32'||process.arch!=='x64')throw new Error('Windows x64 build host required');
 if(Number(process.versions.node.split('.')[0])<20)throw new Error('Node >=20 runtime required');
 if(typeof output!=='string'||typeof nodeLicensePath!=='string'||!/^[a-f\d]{64}$/i.test(expectedNodeSha256??''))
  throw new Error('Fresh external output, complete Node license and verified official Node SHA256 are required');
 const destination=path.resolve(output);
 if(destination===root||destination.toLowerCase().startsWith(root.toLowerCase()+path.sep))
  throw new Error('Windows build output must be outside the repository');
 const nodeBytes=await readFile(process.execPath);
 if(hash(nodeBytes)!==expectedNodeSha256.toLowerCase())throw new Error('Node binary does not match the supplied official checksum');
 const license=await readFile(nodeLicensePath);
 if(license.length<100000||!license.toString('utf8').startsWith('Node.js is licensed for use as follows:'))
  throw new Error('Complete Node distribution license required');
 const compiler=path.join(process.env.WINDIR,'Microsoft.NET','Framework64','v4.0.30319','csc.exe');
 await lstat(compiler);
 await mkdir(destination);
 const packageRoot=path.join(destination,'RUNQ-Windows');
 await mkdir(packageRoot);
 const records=new Map();
 async function save(name,bytes){
  const target=path.join(packageRoot,...name.split('/'));
  await mkdir(path.dirname(target),{recursive:true});
  await writeFile(target,bytes,{flag:'wx'});
  const copied=await readFile(target);
  if(hash(copied)!==hash(bytes))throw new Error('Package file hash mismatch: '+name);
  records.set(name,{name,bytes:copied.length,sha256:hash(copied)});
 }
 async function copy(name){
  if(records.has('app/'+name))return;
  const source=path.resolve(root,...name.split('/'));
  if(!source.startsWith(root+path.sep)||(await lstat(source)).isSymbolicLink())
   throw new Error('Unsupported package source: '+name);
  await save('app/'+name,await readFile(source));
 }
 const serverSource=await readFile(path.join(root,'tools','dev-server.mjs'),'utf8');
 const block=/const allowed = new Map\(\[([\s\S]*?)\]\);/.exec(serverSource)?.[1];
 if(!block)throw new Error('Server-public static manifest could not be read');
 const publicFiles=[...block.matchAll(/\['[^']+',\s*\['([^']+)'/g)].map(match=>match[1]);
 if(!publicFiles.includes('index.html')||!publicFiles.includes('src/ui/command-dictation.mjs'))
  throw new Error('Incomplete public application manifest');
 for(const name of publicFiles)await copy(name);
 const queued=['tools/windows/start-package.mjs'],visited=new Set();
 while(queued.length){
  const name=queued.shift();if(visited.has(name))continue;
  visited.add(name);await copy(name);
  const source=await readFile(path.join(root,...name.split('/')),'utf8');
  for(const match of source.matchAll(/\bfrom\s*['"](\.[^'"]+)['"]/g)){
   const imported=path.resolve(root,path.dirname(name),match[1]);
   if(!imported.startsWith(root+path.sep))throw new Error('Server dependency outside repository');
   queued.push(path.relative(root,imported).split(path.sep).join('/'));
  }
 }
 async function codec(relative){
  const directory=path.join(root,...relative.split('/'));
  for(const item of await readdir(directory,{withFileTypes:true})){
   if(item.isSymbolicLink())throw new Error('Codec symlinks are not packaged');
   const name=relative+'/'+item.name;
   if(item.isDirectory())await codec(name);else if(item.isFile())await copy(name);
  }
 }
 await codec('node_modules/libarchive.js');
 await save('app/package.json',Buffer.from(JSON.stringify({name:'runq-windows-demo',private:true,type:'module'},null,2)));
 await save('runtime/node.exe',nodeBytes);
 await save('runtime/NODE-LICENSE.txt',license);
 const demo=await buildEnglishVideoDemo();
 await save('demo/RUNQ_THE_LAST_GO_EN.showcompiler.zip',Buffer.from(demo.archive));
 await save('demo/runq-the-last-go-en.txt',await readFile(path.join(root,'fixtures','demo','runq-the-last-go-en.txt')));
 const executable=path.join(packageRoot,'RUNQ.exe');
 execFileSync(compiler,['/nologo','/target:exe','/optimize+','/out:'+executable,
  path.join(root,'tools','windows','RunqLauncher.cs')],{stdio:'pipe'});
 const binary=await readFile(executable);
 records.set('RUNQ.exe',{name:'RUNQ.exe',bytes:binary.length,sha256:hash(binary)});
 const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 await save('SOURCE_REVISION.txt',Buffer.from(revision+'\r\n'));
 await save('README.txt',Buffer.from([
  'RUNQ Windows x64 browser demo - unsigned launcher, not an installer or native audio engine.',
  'Extract the entire ZIP, then double-click RUNQ.exe. No npm install or system Node is needed.',
  'Requires Windows with .NET Framework 4.5+ and a current Chromium/Edge/Chrome browser.',
  'Open demo\\RUNQ_THE_LAST_GO_EN.showcompiler.zip as a complete show inside RUNQ.',
  'Original script and three original synthesized WAVs are included. AI is optional and requires explicit operator consent/configuration.',
  'This package uses a different working directory. It does not carry the original evaluation budget ledger; never use copies to bypass an approved spend cap.',
  'GO and STOP stay deterministic and local. Recording/AI proposals never apply or play automatically.',
  'Press STOP ALL in RUNQ and close the browser before exiting the launcher.',
  'Stopping this HTTP server alone does not stop audio already decoded in an open browser.',
  'Type exit or Ctrl+C in the console to stop only this package server. No automatic restart.',
  'RUNQ.exe --smoke-test checks startup and exits; --no-browser is for bounded local verification.',
  'The bundled Node executable was compared with its official SHA256; its complete license is in runtime\\NODE-LICENSE.txt.',
  'The original libarchive.js package and its license are preserved under app\\node_modules\\libarchive.js.',
  'FILE_HASHES.json covers package files. SOURCE_REVISION.txt records the application checkout base.',
  'Physical audio routing, microphone/ASR, real model accuracy, latency and professional live-show suitability are not certified.',
 ].join('\r\n')+'\r\n'));
 const manifest={gitHead:revision,nodeVersion:process.version,nodeSha256:hash(nodeBytes),
  createdAt:new Date().toISOString(),files:[...records.values()].sort((a,b)=>a.name.localeCompare(b.name))};
 await writeFile(path.join(packageRoot,'FILE_HASHES.json'),JSON.stringify(manifest,null,2),{flag:'wx'});
 const zip=path.join(destination,'RUNQ-Windows.zip');
 execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',
  'Compress-Archive -LiteralPath '+quote(packageRoot)+' -DestinationPath '+quote(zip)+' -CompressionLevel Optimal -ErrorAction Stop'],{stdio:'pipe'});
 const zipBytes=await readFile(zip);
 return {packageRoot,zip,sha256:hash(zipBytes),bytes:zipBytes.length,fileCount:manifest.files.length+1,revision};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);
 const get=name=>{const at=args.indexOf(name);return at<0?undefined:args[at+1];};
 try{
  const flags=new Set(args.filter((_,index)=>index%2===0));
  if(args.length!==6||flags.size!==3||[...flags].some(flag=>!['--output','--node-license','--node-sha256'].includes(flag)))
   throw new Error('Use exactly --output, --node-license and --node-sha256 with their values');
  console.log(JSON.stringify(await buildWindowsPackage({output:get('--output'),
   nodeLicensePath:get('--node-license'),expectedNodeSha256:get('--node-sha256')}),null,2));
 }catch(error){console.error('WINDOWS_PACKAGE_FAILED: '+error.message);process.exitCode=1;}
}
