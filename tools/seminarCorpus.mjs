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
const ALTERNATIVE_REVIEW=new Set(['PENDING_HUMAN_REVIEW','HUMAN_APPROVED']);

function validEvent(event,sourceLines){
  return event&&typeof event==='object'&&!Array.isArray(event)&&
    sourceLines.has(event.lineId)&&TRANSPORT.has(event.transport)&&
    KINDS.has(event.cueKind)&&BASES.has(event.basis)&&
    ((event.transport==='SILENCE')===(event.cueKind==='SILENCE'));
}

export async function readSeminarCorpus() {
  const [manifest,alternativeOverlay]=await Promise.all([
    readFile(join(FIXTURE_ROOT,'corpus-v1.json'),'utf8').then(JSON.parse),
    readFile(join(FIXTURE_ROOT,'alternative-annotations-v1.json'),'utf8').then(JSON.parse),
  ]);
  if(manifest.version!==1||!Array.isArray(manifest.cases)||manifest.cases.length<1||manifest.cases.length>30){
    throw new TypeError('Unsupported seminar benchmark');
  }
  if(alternativeOverlay.version!==1||
     typeof alternativeOverlay.provenance!=='string'||alternativeOverlay.provenance.length>160||
     typeof alternativeOverlay.sourceRunId!=='string'||!/^run-[A-Za-z0-9]{1,40}$/.test(alternativeOverlay.sourceRunId)||
     !alternativeOverlay.alternativesByCase||typeof alternativeOverlay.alternativesByCase!=='object'||
     Array.isArray(alternativeOverlay.alternativesByCase)){
    throw new TypeError('Invalid semantic alternative overlay');
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
      if(!validEvent(e,sourceLines)){
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
    const alternativeAnnotations=[];
    const seenAlternatives=new Set();
    const rawAlternatives=alternativeOverlay.alternativesByCase[entry.id]??[];
    if(!Array.isArray(rawAlternatives)||rawAlternatives.length>128){
      throw new TypeError('Invalid semantic alternatives');
    }
    for(const annotation of rawAlternatives){
      if(!annotation||typeof annotation!=='object'||Array.isArray(annotation)||
         Object.keys(annotation).some(field=>!['canonical','alternative','rationale','reviewStatus'].includes(field))||
         !validEvent(annotation.canonical,sourceLines)||!validEvent(annotation.alternative,sourceLines)||
         typeof annotation.rationale!=='string'||annotation.rationale.trim().length<10||annotation.rationale.length>300||
         !ALTERNATIVE_REVIEW.has(annotation.reviewStatus)){
        throw new TypeError('Invalid semantic alternative');
      }
      const canonicalKey=[annotation.canonical.lineId,annotation.canonical.transport,
        annotation.canonical.cueKind,annotation.canonical.basis].join('|');
      const alternativeKey=[annotation.alternative.lineId,annotation.alternative.transport,
        annotation.alternative.cueKind,annotation.alternative.basis].join('|');
      if(!expected.has(canonicalKey)||canonicalKey===alternativeKey||
         annotation.canonical.lineId!==annotation.alternative.lineId||
         annotation.canonical.transport!==annotation.alternative.transport||
         (annotation.alternative.transport==='PLAY'&&forbidden.has(annotation.alternative.lineId))||
         seenAlternatives.has(alternativeKey)){
        throw new TypeError('Conflicting semantic alternative');
      }
      seenAlternatives.add(alternativeKey);
      alternativeAnnotations.push({
        canonical:{...annotation.canonical},alternative:{...annotation.alternative},
        rationale:annotation.rationale.trim(),reviewStatus:annotation.reviewStatus,
      });
    }
    cases.push({
      id:entry.id,title:entry.title,file:entry.file,type:entry.type,
      documentKind:entry.documentKind,language:entry.language,
      tags:[...(entry.tags??[])],
      scriptText,expected:entry.expected.map(e=>({...e})),
      forbiddenPlayLineIds:[...forbidden],
      alternativeAnnotations,
    });
  }
  if(Object.keys(alternativeOverlay.alternativesByCase).some(id=>!ids.has(id))){
    throw new TypeError('Semantic alternative references unknown case');
  }
  return {version:1,provenance:manifest.provenance,
    humanReviewStatus:manifest.humanReviewStatus,
    corpus:manifest.corpus,
    alternativeProvenance:alternativeOverlay.provenance,
    alternativeSourceRunId:alternativeOverlay.sourceRunId,
    cases};
}
