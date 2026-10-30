/**
 * Strict speech-to-GO decision policy for explicitly armed REHEARSAL only.
 * Pure state machine: it NEVER imports audio, calls GO or performs I/O.
 * Supports backwards seeks, forward skips, and repeated takes without firing
 * intermediate cues. Only completed, unique speech turns are considered.
 */
import {compareSpeech,normalizeSpeech} from './voiceFollow.mjs';

const lineNo=id=>Number(/^L([1-9]\d*)$/.exec(id??'')?.[1]);
const wordCount=text=>normalizeSpeech(text).split(' ').filter(Boolean).length;

export const REHEARSAL_AUTO_POLICY=Object.freeze({
 nearThreshold:.88,seekThreshold:.97,nearMargin:.14,seekMargin:.14,
 nearRadius:25,repeatCooldownMs:2500,minimumWords:3,seekWords:4,
 maxTranscriptAgeMs:5000,
});

export function initialRehearsalAutoState({focusLine=1}={}){
 if(!Number.isInteger(focusLine)||focusLine<1)throw new TypeError('Invalid focus');
 return {focusLine,lastCueId:null,lastFiredMs:-Infinity,seenTurnIds:[],history:[]};
}

/** Returns {state,action}; action FIRE is a *proposal* for the scoped UI bridge. */
export function decideRehearsalAutoGo({
 cues,transcript,turnId,atMs,state,armed=false,
 policy=REHEARSAL_AUTO_POLICY,
}={}){
 if(!state||!Number.isInteger(state.focusLine)||state.focusLine<1||!Array.isArray(cues)||
   !Number.isFinite(atMs))throw new TypeError('Invalid auto rehearsal input');
 const no=(reason,candidates=[],nextState=state)=>({
  state:nextState,action:{type:'NONE',reason,candidates}
 });
 if(!armed)return no('NOT_ARMED');
 if(!transcript||typeof transcript.text!=='string'||!transcript.final)return no('NOT_FINAL');
 if(!Number.isFinite(transcript.endMs)||transcript.endMs>atMs+250||
   atMs-transcript.endMs>policy.maxTranscriptAgeMs)return no('STALE');
 if(!['string','number'].includes(typeof turnId)||!String(turnId).trim())
   return no('MISSING_TURN_ID');
 const identity=String(turnId);
 if(state.seenTurnIds.includes(identity))return no('DUPLICATE_TURN');
 const consumed=discardRehearsalTurn(state,identity);
 if(wordCount(transcript.text)<policy.minimumWords)return no('TOO_SHORT',[],consumed);
 const available=cues.filter(c=>typeof c?.id==='string'&&
  Number.isInteger(lineNo(c.lineId))&&lineNo(c.lineId)>=1&&
  typeof c.trigger==='string'&&wordCount(c.trigger)>=policy.minimumWords);
 const ranked=available.map(c=>{
  const line=lineNo(c.lineId),delta=line-state.focusLine;
  return {cueId:c.id,lineId:c.lineId,line,delta,score:compareSpeech(transcript.text,c.trigger),
    near:Math.abs(delta)<=policy.nearRadius};
 }).filter(x=>x.score>=Math.min(policy.nearThreshold,policy.seekThreshold))
 .sort((a,b)=>b.score-a.score||(a.near===b.near?0:a.near?-1:1)||
  Math.abs(a.delta)-Math.abs(b.delta));
 if(!ranked.length)return no('NO_MATCH',[],consumed);
 const top=ranked[0];
 const threshold=top.near?policy.nearThreshold:policy.seekThreshold;
 if(top.score<threshold)return no('LOW_CONFIDENCE',[],consumed);
 // Seek and rewind use near-exact, sufficiently distinctive spoken phrases.
 if(!top.near&&wordCount(transcript.text)<policy.seekWords)
  return no('SEEK_TOO_SHORT',[],consumed);
 if(ranked.length>1 && top.score-ranked[1].score<(top.near?policy.nearMargin:policy.seekMargin))
  return no('AMBIGUOUS',ranked.slice(0,3),consumed);
 if(top.cueId===state.lastCueId&&atMs-state.lastFiredMs<policy.repeatCooldownMs)
  return no('REPEAT_COOLDOWN',[],consumed);
 const index=available.findIndex(c=>c.id===top.cueId);
 const before=state.history.at(-1)?.index??-1;
 const movement=top.cueId===state.lastCueId?'REPEAT':before===-1?'FIRST':
  index<before?'REWIND':index>before+1?'SKIP_FORWARD':
  index>before?'ADVANCE':'REVISIT';
 // Never mark turn as fired until the actual guarded audio engine ACKs GO.
 return {state:consumed,action:{type:'FIRE',cueId:top.cueId,lineId:top.lineId,score:top.score,
  movement,skippedCount:movement==='SKIP_FORWARD'?index-before-1:0,
  turnId:identity,atMs,index}};
}

/** Only invoke this after transport confirms actual playback was started. */
export function acknowledgeRehearsalAutoGo(state,action){
 if(!state||action?.type!=='FIRE'||!Number.isInteger(action.index))
  throw new TypeError('Invalid automatic GO acknowledgement');
 return {
  focusLine:lineNo(action.lineId),lastCueId:action.cueId,
  lastFiredMs:action.atMs,
  seenTurnIds:state.seenTurnIds.includes(action.turnId)?state.seenTurnIds:
   [...state.seenTurnIds,action.turnId].slice(-100),
  history:[...state.history,{cueId:action.cueId,index:action.index,lineId:action.lineId,atMs:action.atMs}].slice(-100),
 };
}

/** Duplicated speechComplete turn IDs are ignored even after failed transport. */
export function discardRehearsalTurn(state,turnId){
 if(typeof turnId!=='string'&&typeof turnId!=='number')return state;
 const identity=String(turnId);
 if(state.seenTurnIds.includes(identity))return state;
 return {...state,seenTurnIds:[...state.seenTurnIds,identity].slice(-100)};
}
