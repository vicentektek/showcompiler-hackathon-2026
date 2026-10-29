import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {auditVideoEvidence} from '../tools/video-evidence-audit.mjs';

const template=JSON.parse(await readFile(new URL('./fixtures/video-evidence-template.json',import.meta.url),'utf8'));
const clone=x=>JSON.parse(JSON.stringify(x));

function readyFixture(variant='autopilot'){
  const m=clone(template),files={};
  m.buildSha='a'.repeat(40);
  m.officialRulesConfirmed=true;
  m.officialMaxDurationSeconds=200;
  m.actualDurationSeconds=178;
  m.narrationVariant=variant;
  const types={
    S01:'ART_ORIGINAL',S02:'ART_ORIGINAL',S03:'UI_REAL',
    S04:'REAL_PROVIDER',S05:'REAL_OPERATOR',S06:'REAL_AUDIO',
    S07:'UI_REAL',S08:variant==='assisted'?'REAL_OPERATOR_ASSISTED':'REAL_MIC',
    S09:'REAL_OPERATOR',S10:'EDIT_ORIGINAL',S11:'EDIT_ORIGINAL',
  };
  for(const shot of m.shots){
    shot.state='APPROVED';shot.evidenceType=types[shot.id];
    shot.file='artifacts/video-captures/'+shot.id.toLowerCase()+'.mp4';
    shot.sha256=shot.id.slice(-2).repeat(32).toLowerCase();
    shot.reviewedBy='operator';shot.reviewedAt='2026-10-30T12:00:00.000Z';
    files[shot.file]=shot.sha256;
  }
  m.finalVideo={file:'artifacts/video-captures/final.mp4',sha256:'f'.repeat(64)};
  files[m.finalVideo.file]=m.finalVideo.sha256;
  return {m,files};
}

test('unfilled video template is not accepted as completed footage',()=>{
  const r=auditVideoEvidence(template,{});
  assert.equal(r.ready,false);
  assert.equal(r.approved,0);
  assert.ok(r.problems.some(x=>x.includes('S08')));
});

test('structurally reviewed complete manifest can pass only with matching file hashes',()=>{
  const {m,files}=readyFixture();
  const r=auditVideoEvidence(m,files);
  assert.equal(r.ready,true,JSON.stringify(r.problems));
  assert.equal(r.approved,11);
});

test('rehearsal autopilot requires REAL_MIC evidence, not layout or synthetic ASR',()=>{
  const {m,files}=readyFixture();
  m.shots[7].evidenceType='UI_REAL';
  assert.equal(auditVideoEvidence(m,files).ready,false);
  assert.ok(auditVideoEvidence(m,files).problems.some(x=>x.startsWith('S08')));
});

test('assisted narration can only use operator-assisted evidence',()=>{
  const {m,files}=readyFixture('assisted');
  assert.equal(auditVideoEvidence(m,files).ready,true);
  m.shots[7].evidenceType='REAL_MIC';
  assert.equal(auditVideoEvidence(m,files).ready,false);
});

test('claiming simulated Meta as real is refused until properly labelled',()=>{
  const {m,files}=readyFixture();
  m.shots[3].evidenceType='LABELLED_SIMULATION';
  assert.equal(auditVideoEvidence(m,files).ready,false);
  m.shots[3].claimLabel='Illustrative simulation - no paid request';
  assert.equal(auditVideoEvidence(m,files).ready,true);
});

test('wrong file hash, missing human review, or path traversal fails',()=>{
  const {m,files}=readyFixture();
  files[m.shots[5].file]='0'.repeat(64);
  assert.equal(auditVideoEvidence(m,files).ready,false);
  files[m.shots[5].file]=m.shots[5].sha256;
  m.shots[5].reviewedBy='';
  assert.equal(auditVideoEvidence(m,files).ready,false);
  m.shots[5].reviewedBy='operator';
  m.shots[5].file='../../bad.mp4';
  assert.equal(auditVideoEvidence(m,files).ready,false);
});

test('final MP4, official limit and pinned commit are mandatory',()=>{
  const {m,files}=readyFixture();
  m.finalVideo=null;
  assert.equal(auditVideoEvidence(m,files).ready,false);
  m.finalVideo={file:'artifacts/video-captures/final.mp4',sha256:'f'.repeat(64)};
  m.actualDurationSeconds=230;
  assert.equal(auditVideoEvidence(m,files).ready,false);
  m.actualDurationSeconds=178;
  m.buildSha=null;
  assert.equal(auditVideoEvidence(m,files).ready,false);
  m.buildSha='a'.repeat(40);
  m.officialRulesConfirmed=false;
  assert.equal(auditVideoEvidence(m,files).ready,false);
});

test('missing or duplicate storyboard scene blocks readiness',()=>{
  const {m,files}=readyFixture();
  m.shots.pop();
  assert.equal(auditVideoEvidence(m,files).ready,false);
  m.shots.push(clone(m.shots[0]));
  assert.equal(auditVideoEvidence(m,files).ready,false);
});
