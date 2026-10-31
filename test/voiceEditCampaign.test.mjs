import test from 'node:test';
import assert from 'node:assert/strict';
import {runVoiceEditCampaign} from '../tools/runq-voice-edit-campaign.mjs';

test('500-case simulated voice/text edit campaign judges the resulting project',async()=>{
 const {summary,rows}=await runVoiceEditCampaign({write:false});
 assert.equal(summary.total,500);
 assert.equal(summary.kind,'SIMULATED_OFFLINE');
 assert.equal(summary.paidRequests,0);assert.equal(summary.costUsd,0);
 assert.deepEqual(rows.filter(x=>!x.pass).map(x=>x.id+':'+x.failure),[]);
 assert.ok(summary.byChannel.find(x=>x.name==='voice').total>=250);
 assert.ok(summary.distinctUtterances>=250);
 assert.ok(rows.some(x=>x.route.startsWith('HTTP_403')),'route consent path exercised');
 assert.ok(rows.some(x=>x.route.startsWith('HTTP_400')),'route WAV validation exercised');
 assert.ok(rows.filter(x=>x.category==='transport-safety').every(x=>!x.applied));
});
test('a different seed changes the scenarios',async()=>{
 const a=await runVoiceEditCampaign({write:false,seed:1}),b=await runVoiceEditCampaign({write:false,seed:2});
 assert.notEqual(a.summary.planHash,b.summary.planHash);
 assert.equal(a.summary.failed+b.summary.failed,0);
});
