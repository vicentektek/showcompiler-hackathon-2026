import test from 'node:test';
import assert from 'node:assert/strict';
import {createNewShow,addAudioReference} from '../src/core/workspace.mjs';
import {createCueFromReviewedAudio} from '../src/core/reviewedSfxCue.mjs';
import {serializeShowProject,deserializeShowProject} from '../src/core/projectPersistence.mjs';

const job={
 requestId:'request-1',sourceLineId:'L2',kind:'SFX',status:'ACCEPTED_FOR_MANUAL_IMPORT',
 prompt:'A heavy theatre door closes.',durationSeconds:3,seed:42,
 modelCandidate:'stabilityai/stable-audio-3-small-sfx',modelRevision:'a'.repeat(40),
 wav:{sha256:'0'.repeat(64),durationSeconds:3,sampleRateHz:44100,channels:2,byteLength:44},
 cost:{estimatedMaxCostUsd:0.02,actualBilledUsd:null},
 createdAt:'2026-10-28T10:00:00.000Z',updatedAt:'2026-10-28T10:05:00.000Z',
};
const provenance={
 origin:'AI_GENERATED_SFX',provider:'MODAL',model:job.modelCandidate,
 modelRevision:job.modelRevision,requestId:job.requestId,sourceLineId:job.sourceLineId,
 prompt:job.prompt,seed:job.seed,requestedDurationSeconds:job.durationSeconds,
 sha256:job.wav.sha256,generatedDurationSeconds:job.wav.durationSeconds,
 sampleRateHz:job.wav.sampleRateHz,channels:job.wav.channels,byteLength:job.wav.byteLength,
 reviewedRegion:{inMs:0,outMs:3000},estimatedMaxCostUsd:0.02,actualCostUsd:null,
 createdAt:job.createdAt,acceptedAt:job.updatedAt,
};
function project(){
 const initial=createNewShow({id:'show-sound-lab',name:'Sound Lab test',
  scriptText:'Scene one\nDOOR: The sound begins.\nThe end.'});
 return addAudioReference(initial,'runq-sfx-request-1.wav',{provenance});
}
test('operator can create a manual cue from a verified accepted generated sound',()=>{
 const before=project(),assetId=before.assets[0].id;
 const out=createCueFromReviewedAudio(before,{
  assetId,job,reviewedRegion:{inSeconds:0.25,outSeconds:2.5,fadeInSeconds:0.5,fadeOutSeconds:0.75},
 });
 assert.equal(before.cues.length,0);
 assert.equal(out.project.cues.length,1);
 const cue=out.project.cues[0];
 assert.equal(cue.origin,'MANUAL');
 assert.equal(cue.actions[0].type,'PLAY');
 assert.equal(cue.actions[0].assetId,assetId);
 assert.deepEqual(cue.sourceLineIds,['L2']);
 assert.equal(cue.playback.startAtMs,250);
 assert.equal(cue.playback.endAtMs,2500);
 assert.equal(cue.playback.fadeInMs,500);
 assert.equal(cue.playback.fadeOutMs,750);
 assert.deepEqual(deserializeShowProject(serializeShowProject(out.project)),out.project);
 assert.ok(!('go' in out)&&!('preparedCueId' in out));
});
test('sound review cannot mutate other assets or fabricate provenance',()=>{
 const before=project(),assetId=before.assets[0].id;
 const region={inSeconds:0,outSeconds:3,fadeInSeconds:0,fadeOutSeconds:0};
 assert.throws(()=>createCueFromReviewedAudio(before,{assetId:'unknown',job,reviewedRegion:region}),/registered/);
 assert.throws(()=>createCueFromReviewedAudio(before,{assetId,job:{...job,status:'REJECTED'},reviewedRegion:region}),/accepted/);
 assert.throws(()=>createCueFromReviewedAudio(before,{assetId,job:{...job,requestId:'other'},reviewedRegion:region}),/accepted/);
 assert.throws(()=>createCueFromReviewedAudio(before,{assetId,job,reviewedRegion:{...region,inSeconds:2.9,outSeconds:1}}),/region/);
 assert.throws(()=>createCueFromReviewedAudio(before,{assetId,job,reviewedRegion:{...region,fadeInSeconds:2,fadeOutSeconds:2}}),/Fades/);
 assert.equal(before.cues.length,0);
});
