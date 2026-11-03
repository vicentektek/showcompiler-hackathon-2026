/**
 * Original English rehearsal show for filming RUNQ. REAL WAV playback;
 * cue/source associations are MANUAL_MOCK, never claimed to be Muse inference.
 * No network, model API, Windows audio driver, microphone or paid services.
 */
import { access, readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDemoPackage } from '../../src/core/demoShow.mjs';
import { importPortableShow, exportPortableShow } from '../../src/core/showArchive.mjs';
import { createNewShow, addAudioReference, addMockProposal, decideProposal } from '../../src/core/workspace.mjs';
import { normalizeShowProject } from '../../src/core/projectPersistence.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const VIDEO_DEMO_ZIP = 'production/runq-video-kit/RUNQ_THE_LAST_GO_EN.showcompiler.zip';
export const VIDEO_DEMO_TARGETS = Object.freeze([
  {name:'01_atmosphere.wav',line:'L7',spokenLine:'L6',
   foot:'Listen carefully. The theatre is holding its breath.',
   label:'The breathing theatre'},
  {name:'02_clock_bell.wav',line:'L15',spokenLine:'L14',
   foot:'When the clock strikes once, open the envelope.',
   label:'The single bell'},
  {name:'03_finale.wav',line:'L24',spokenLine:'L23',
   foot:'When the red light comes on, we make our choice.',
   label:'The final decision'},
]);

function memoryFile(name,bytes){
  return {name,size:bytes.byteLength,async arrayBuffer(){
    return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
  }};
}
export function assertEnglishScript(scriptText){
  const lines=scriptText.replace(/\r\n/g,'\n').trimEnd().split('\n');
  if(lines.length!==31)throw Error('Original English demo must contain exactly 31 lines');
  const roles=['JAMES','MAYA','ELLA'];
  VIDEO_DEMO_TARGETS.forEach((target,i)=>{
    const raw=lines[Number(target.spokenLine.slice(1))-1];
    if(raw!==roles[i]+': '+target.foot)throw Error('Script spoken line changed: '+target.spokenLine);
    if(!lines[Number(target.line.slice(1))-1].startsWith('('))throw Error('Expected stage direction: '+target.line);
  });
  return lines;
}
export async function buildEnglishVideoDemo(){
  const scriptText=await readFile(resolve(root,'fixtures/demo/runq-the-last-go-en.txt'),'utf8');
  assertEnglishScript(scriptText);
  const original=await buildDemoPackage();
  const imported=await importPortableShow(original.archive);
  const originals=new Map(imported.audioFiles.map(f=>[f.name,f.bytes]));
  if(originals.size!==3)throw Error('Expected exactly 3 original offline WAV files');
  let show=createNewShow({id:'runq-last-go-en-video-2026',
    name:'The Last GO — original English rehearsal demo',scriptText});
  const audioMap=new Map();
  for(const target of VIDEO_DEMO_TARGETS){
    const bytes=originals.get(target.name);
    if(!bytes?.byteLength)throw Error('Missing original WAV '+target.name);
    show=addAudioReference(show,target.name);
    const assetId=show.assets.at(-1).id;
    audioMap.set(assetId,memoryFile(target.name,bytes));
    show=addMockProposal(show,{lineId:target.line,assetId,label:target.label});
    show=decideProposal(show,show.proposals.at(-1).id,'APPROVE');
  }
  show=normalizeShowProject({...show,cues:show.cues.map((cue,i)=>({
    ...cue,trigger:VIDEO_DEMO_TARGETS[i].foot
  }))});
  const archive=await exportPortableShow(show,audioMap);
  const restored=await importPortableShow(archive);
  if(restored.project.cues.length!==3||restored.audioFiles.length!==3 ||
     restored.project.cues.some((c,i)=>c.trigger!==VIDEO_DEMO_TARGETS[i].foot ||
       !c.sourceLineIds.includes(VIDEO_DEMO_TARGETS[i].line))){
    throw Error('English show ZIP roundtrip integrity failed');
  }
  return {archive,project:show,audioFiles:restored.audioFiles};
}
export async function writeEnglishVideoDemo({output=resolve(root,VIDEO_DEMO_ZIP)}={}){
  const built=await buildEnglishVideoDemo();
  const audioDir=resolve(dirname(output),'sfx');
  const destinations=[output,...built.audioFiles.map(wav=>resolve(audioDir,wav.name))];
  for(const destination of destinations){
    try{await access(destination);}
    catch(error){
      if(error.code==='ENOENT')continue;
      throw error;
    }
    throw new Error('Refusing to overwrite existing demo material: '+destination);
  }
  await mkdir(dirname(output),{recursive:true});
  await writeFile(output,built.archive,{flag:'wx'});
  await mkdir(audioDir,{recursive:true});
  for(const wav of built.audioFiles){
    await writeFile(resolve(audioDir,wav.name),wav.bytes,{flag:'wx'});
  }
  return {output,project:built.project,bytes:built.archive.byteLength};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const result=await writeEnglishVideoDemo();
  console.log('RUNQ English demo saved:',result.output);
  console.log('3 MANUALLY AUTHORED cue triggers + 3 original offline WAVs, ZIP verified.');
  console.log('NO Meta inference, network call, voice capture or automatic audio GO.');
}
