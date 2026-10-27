/**
 * Read only original, committed stage-play QA fixtures; reject path traversal,
 * missing gold IDs, hidden duplicate line IDs and unexpected format changes.
 * No network calls or model access.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, sep } from 'node:path';
import { parseScript } from '../src/core/script.mjs';

const FIXTURE_ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../fixtures/qa/seminar');
const ID=/^[a-z][a-z0-9-]{1,60}$/;
const SCRIPT_EXT=/^fixtures\/qa\/seminar\/([a-z][a-z0-9-]{1,60})\.txt$/;
const TRANSPORT=new Set(['PLAY','STOP','CONTINUE','SILENCE']);
const KINDS=new Set(['FX','AMBIENCE','MUSIC','VOICE','TRANSITION','SILENCE']);
const BASES=new Set(['EXPLICIT','SUGGESTED']);

export async function readSeminarCorpus() {
  const manifest=JSON.parse(await readFile(join(FIXTURE_ROOT,'corpus-v1.json'),'utf8'));
  if(manifest.version!==1||!Array.isArray(manifest.cases)||manifest.cases.length<1||manifest.cases.length>30){
    throw new TypeError('Unsupported seminar benchmark');
  }
  const ids=new Set();
  const cases=[];
  for(const entry of manifest.cases){
    if(!entry||!ID.test(entry.id)||ids.has(entry.id)||
       typeof entry.file!=='string'||entry.file!==('fixtures/qa/seminar/'+entry.id+'.txt')||
       !SCRIPT_EXT.test(entry.file)||!Array.isArray(entry.expected)||!Array.isArray(entry.forbiddenPlayLineIds)||
       entry.expected.length>128||entry.forbiddenPlayLineIds.length>128){
      throw new TypeError('Invalid original corpus metadata');
    }
    ids.add(entry.id);
    const absolute=join(FIXTURE_ROOT,entry.id+'.txt');
    if(!absolute.startsWith(FIXTURE_ROOT+sep))throw new TypeError('Unsafe script path');
    const scriptText=await readFile(absolute,'utf8');
    if(scriptText.length>100_000||!scriptText.trim())throw new TypeError('Invalid script length');
    const lines=parseScript(scriptText);
    const sourceLines=new Set(lines.map(l=>l.id));
    const expected=new Set();
    for(const e of entry.expected){
      if(!e||!sourceLines.has(e.lineId)||!TRANSPORT.has(e.transport)||
         !KINDS.has(e.cueKind)||!BASES.has(e.basis)||
         ((e.transport==='SILENCE')!==(e.cueKind==='SILENCE'))){
        throw new TypeError('Gold event outside original script');
      }
      const key=[e.lineId,e.transport,e.cueKind,e.basis].join('|');
      if(expected.has(key))throw new TypeError('Duplicate gold event');
      expected.add(key);
    }
    const forbidden=new Set();
    for(const lineId of entry.forbiddenPlayLineIds){
      if(!sourceLines.has(lineId)||forbidden.has(lineId)||
         entry.expected.some(e=>e.transport==='PLAY'&&e.lineId===lineId)){
        throw new TypeError('Conflicting negative source line');
      }
      forbidden.add(lineId);
    }
    cases.push({
      id:entry.id,title:entry.title,file:entry.file,type:entry.type,
      documentKind:entry.documentKind,language:entry.language,
      tags:[...(entry.tags??[])],
      scriptText,expected:entry.expected.map(e=>({...e})),
      forbiddenPlayLineIds:[...forbidden],
    });
  }
  return {version:1,provenance:manifest.provenance,
    humanReviewStatus:manifest.humanReviewStatus,
    corpus:manifest.corpus,cases};
}
