#!/usr/bin/env node
/**
 * RunQ video evidence preflight. LOCAL FILES ONLY.
 * This does not infer authenticity from a recording: reviewer attestation,
 * actual footage and proper labelling remain mandatory.
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const manifestFile=join(root,'artifacts/video-captures/evidence.json');
const templateFile=join(root,'test/fixtures/video-evidence-template.json');
const validSha=/^[0-9a-f]{40}$/;
const validHash=/^[0-9a-f]{64}$/;
const validFile=/^artifacts\/video-captures\/[a-zA-Z0-9_.-]+\.(?:mp4|png|wav)$/;
const required=new Map([
  ['S01',['ART_ORIGINAL']],['S02',['ART_ORIGINAL']],['S03',['UI_REAL']],
  ['S04',['REAL_PROVIDER','LABELLED_SIMULATION']],
  ['S05',['REAL_OPERATOR']],['S06',['REAL_AUDIO']],['S07',['UI_REAL']],
  ['S08',['REAL_MIC','REAL_OPERATOR_ASSISTED']],
  ['S09',['REAL_OPERATOR']],['S10',['EDIT_ORIGINAL']],['S11',['EDIT_ORIGINAL']],
]);

export function auditVideoEvidence(data, availableHashes = {}) {
  const problems=[];
  if (!data || data.schemaVersion!==1 || !Array.isArray(data.shots)) {
    return {ready:false,problems:['Unsupported video manifest'],approved:0,total:11};
  }
  const add=(s)=>problems.push(s);
  if (!validSha.test(data.buildSha ?? ''))add('No pinned Git build SHA');
  if (data.officialRulesConfirmed!==true)add('Official video rules not confirmed');
  if (!Number.isFinite(data.officialMaxDurationSeconds) || data.officialMaxDurationSeconds<=0) {
    add('Official maximum duration not documented');
  }
  if (!Number.isFinite(data.actualDurationSeconds) || data.actualDurationSeconds<=0 ||
      (Number.isFinite(data.officialMaxDurationSeconds) &&
       data.actualDurationSeconds>data.officialMaxDurationSeconds)) {
    add('Final duration missing or exceeds confirmed official limit');
  }
  if (!['autopilot','assisted'].includes(data.narrationVariant))add('Narration variant unselected');
  const seen=new Set(); let approved=0;
  for(const shot of data.shots){
    const id=shot?.id;
    if(!required.has(id)||seen.has(id)){add('Unknown or duplicate shot: '+id);continue;}
    seen.add(id);
    if(shot.state!=='APPROVED'){add(id+': evidence not approved');continue;}
    approved++;
    if(!required.get(id).includes(shot.evidenceType))add(id+': invalid evidence type');
    if(id==='S08' && (
      (data.narrationVariant==='autopilot' && shot.evidenceType!=='REAL_MIC') ||
      (data.narrationVariant==='assisted' && shot.evidenceType!=='REAL_OPERATOR_ASSISTED'))) {
      add('S08: narration claim does not match recorded evidence');
    }
    if(id==='S04' && shot.evidenceType==='LABELLED_SIMULATION' &&
       !/simulat|ilustrat|illustrat/i.test(shot.claimLabel??'')) {
      add('S04: simulation must be explicitly labelled');
    }
    if(typeof shot.reviewedBy!=='string'||shot.reviewedBy.trim().length<2 ||
       !Number.isFinite(Date.parse(shot.reviewedAt??'')))add(id+': human reviewer missing');
    if(!validFile.test(shot.file??''))add(id+': file path invalid');
    if(!validHash.test(shot.sha256??''))add(id+': SHA-256 missing');
    if(validFile.test(shot.file??'') && validHash.test(shot.sha256??'')) {
      if(availableHashes[shot.file]!==shot.sha256) add(id+': local media not found or hash mismatch');
    }
  }
  for(const id of required.keys())if(!seen.has(id))add('Missing required shot '+id);
  if(data.shots.length!==11)add('Exactly 11 shot records required');
  if(!data.finalVideo || !validFile.test(data.finalVideo.file??'') ||
     !String(data.finalVideo.file).endsWith('.mp4') ||
     !validHash.test(data.finalVideo.sha256??'') ||
     availableHashes[data.finalVideo.file]!==data.finalVideo.sha256){
    add('Final MP4 missing or not verified by checksum');
  }
  return {ready:problems.length===0,problems,approved,total:11,
    caveat:'File/hash and self-reported human review cannot prove video content is genuine. Manually watch final MP4.'};
}

async function hashLocalFile(path) {
  if(!validFile.test(path))return null;
  const absolute=resolve(root,path), rel=relative(root,absolute);
  if(rel.startsWith('..'+sep)||rel==='..')return null;
  try{
    const stat=await lstat(absolute);
    if(!stat.isFile()||stat.isSymbolicLink())return null;
    const real=await realpath(absolute);
    const checked=relative(root,real);
    if(checked.startsWith('..'+sep)||checked==='..')return null;
    const h=createHash('sha256');
    for await(const block of createReadStream(real))h.update(block);
    return h.digest('hex');
  }catch{return null;}
}

async function main(){
  let source='CURRENT_LOCAL_MANIFEST';
  let data;
  try {data=JSON.parse(await readFile(manifestFile,'utf8'));}
  catch {data=JSON.parse(await readFile(templateFile,'utf8'));source='UNFILLED_TEMPLATE';}
  const paths=new Set();
  for(const x of data.shots ?? [])if(validFile.test(x?.file ?? ''))paths.add(x.file);
  if(validFile.test(data.finalVideo?.file ?? ''))paths.add(data.finalVideo.file);
  const hashes={};
  for(const path of paths)hashes[path]=await hashLocalFile(path);
  const result={generatedAt:new Date().toISOString(),source,...auditVideoEvidence(data,hashes)};
  await mkdir(dirname(manifestFile),{recursive:true});
  await writeFile(join(dirname(manifestFile),'evidence-audit.json'),JSON.stringify(result,null,2)+'\n');
  console.log('VIDEO_EVIDENCE_'+(result.ready?'READY':'NOT_READY')+
    ': '+result.approved+'/11 approved; '+result.problems.length+' blocking issues.');
  if(!result.ready){
    for(const issue of result.problems.slice(0,30))console.log(' - '+issue);
    console.log('Copy test/fixtures/video-evidence-template.json to artifacts/video-captures/evidence.json when recording.');
    process.exitCode=2;
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(e=>{console.error('VIDEO_EVIDENCE_ERROR: '+e.message);process.exitCode=1;});
}
