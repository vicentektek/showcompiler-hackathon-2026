import test from 'node:test';
import assert from 'node:assert/strict';
import {readLevel1Corpus} from '../tools/level1Corpus.mjs';
import {buildDevelopmentReview,renderDevelopmentReview} from '../tools/scenic-v2-review.mjs';

test('review preview excludes all ten locked qualification cases',async()=>{
  const corpus=await readLevel1Corpus();
  const report=buildDevelopmentReview(corpus);
  assert.equal(report.cases.length,6);
  assert.equal(corpus.cases.filter(c=>c.pool==='qualification').length,10);
  const locked=new Set(corpus.cases.filter(c=>c.pool==='qualification').map(c=>c.id));
  assert.ok(report.cases.every(c=>!locked.has(c.id)));
  const markdown=renderDevelopmentReview(report);
  for(const id of locked) assert.ok(!markdown.includes('## '+id));
  assert.match(markdown,/NOT MODEL OUTPUT OR OPERATOR APPROVAL/);
});
test('no V2 review preview certifies provisional annotations or invents approval',async()=>{
  const report=buildDevelopmentReview(await readLevel1Corpus());
  assert.equal(report.status,'OFFLINE_PROVISIONAL_PREVIEW_NOT_MODEL_RESULTS');
  assert.ok(report.cases.every(c=>c.reviewStatus==='PROVISIONAL_UNREVIEWED'));
  assert.ok(report.cases.every(c=>c.items.every(i=>i.approvalStatus==='PENDING_OPERATOR_REVIEW')));
});
