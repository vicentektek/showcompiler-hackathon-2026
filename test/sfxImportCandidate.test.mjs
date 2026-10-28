import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { File } from 'node:buffer';
import { prepareReviewedSfxImport } from '../src/core/sfxImportCandidate.mjs';

const bytes = new Uint8Array(44).fill(1);
const checksum = Buffer.from(await webcrypto.subtle.digest('SHA-256', bytes)).toString('hex');
const job = {
  requestId:'request-1',sourceLineId:'L15',kind:'SFX',
  status:'ACCEPTED_FOR_MANUAL_IMPORT',wav:{sha256:checksum},
};
const settings = {
  FileConstructor:File,cryptoSubtle:webcrypto.subtle,
};
test('operator accepted SHA-256 audio becomes importable File, not a cue or GO',async()=>{
  const staged=await prepareReviewedSfxImport({job,audioBytes:bytes,...settings});
  assert.equal(staged.manualImportRequired,true);
  assert.equal(staged.targetCueId,null);
  assert.equal(staged.sourceLineId,'L15');
  assert.equal(staged.file.name,'runq-sfx-request-1.wav');
  assert.equal(staged.file.type,'audio/wav');
  assert.deepEqual(new Uint8Array(await staged.file.arrayBuffer()),bytes);
  assert.equal(Object.hasOwn(staged,'assetId'),false);
  assert.equal(Object.hasOwn(staged,'go'),false);
});
test('review and checksum gates: rejects queued, rejected, altered, unknown-line files',async()=>{
  for(const denied of [
    {...job,status:'QUEUED'}, {...job,status:'REJECTED'},
    {...job,sourceLineId:'L999/../'}, {...job,wav:{sha256:'0'.repeat(64)}},
  ]){
    await assert.rejects(
      prepareReviewedSfxImport({job:denied,audioBytes:bytes,...settings}),
    );
  }
  const altered=new Uint8Array(bytes);
  altered[10]=99;
  await assert.rejects(
    prepareReviewedSfxImport({job,audioBytes:altered,...settings}), /checksum mismatch/,
  );
});
