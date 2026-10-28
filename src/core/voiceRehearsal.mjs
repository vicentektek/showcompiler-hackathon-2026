import { suggestVoiceCue } from './voiceFollow.mjs';

/**
 * Deterministic rehearsal replay. Never calls network, playback or queue APIs.
 * Input timestamps are elapsed milliseconds from the start of the fixture.
 */
export function replayVoiceRehearsal({cues,events,initialFocusLine=1,maxLookahead=25}){
  if(!Array.isArray(cues)||!Array.isArray(events)||!Number.isInteger(initialFocusLine)||initialFocusLine<1)
    throw new TypeError('Invalid rehearsal replay input');
  let focusLine=initialFocusLine,previousTime=-Infinity;
  const consumedIds=[],log=[];
  for(const event of events){
    if(!event||!Number.isFinite(event.atMs)||event.atMs<previousTime)
      throw new TypeError('Events must be ordered by finite atMs');
    previousTime=event.atMs;
    if(event.type==='SET_FOCUS'){
      if(!Number.isInteger(event.line)||event.line<1)throw new TypeError('Invalid focus line');
      focusLine=event.line;
      log.push({atMs:event.atMs,type:'FOCUS_CHANGED',lineId:'L'+focusLine});
      continue;
    }
    if(event.type!=='TRANSCRIPT')throw new TypeError('Unsupported rehearsal event');
    const transcript={text:event.text,final:event.final===true,endMs:event.endMs};
    const result=suggestVoiceCue({cues,transcript,focusLine,consumedIds,nowMs:event.atMs,maxLookahead});
    log.push({atMs:event.atMs,type:result.status,reason:result.reason??null,cueId:result.cueId??null,lineId:result.lineId??null,score:result.score??null});
    if(result.status==='SUGGEST_PREPARE'){
      consumedIds.push(result.cueId);
      focusLine=Number(result.lineId.slice(1));
    }
  }
  return {log,consumedIds,focusLine};
}
