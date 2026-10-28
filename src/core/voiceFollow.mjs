/** Pure Voice Follow candidate matcher. No network, audio, or automatic GO. */
export function normalizeSpeech(text) {
  return String(text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}
const words = text => normalizeSpeech(text).split(' ').filter(Boolean);
function distance(a,b) {
  let prev=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    const next=[i];
    for(let j=1;j<=b.length;j++) next[j]=Math.min(next[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
    prev=next;
  }
  return prev[b.length];
}
export function compareSpeech(actual,expected) {
  const a=words(actual),b=words(expected);
  if(!a.length||!b.length)return 0;
  const recent=a.slice(-(b.length+2));
  let best=0;
  for(let start=0;start<recent.length;start++){
    const span=recent.slice(start);
    if(Math.abs(span.length-b.length)>2)continue;
    best=Math.max(best,1-distance(span,b)/Math.max(span.length,b.length));
  }
  return Math.max(0,best);
}
/**
 * Candidate suggestions only; never produces an executable command.
 * focusLine is an operator-confirmed 1-based position, not inferred automatically.
 */
export function suggestVoiceCue({cues,transcript,focusLine,consumedIds=[],nowMs,maxAgeMs=4000,maxLookahead=25}) {
  if(!Array.isArray(cues)||!transcript||typeof transcript.text!=='string'||!Number.isInteger(focusLine)||focusLine<1)
    throw new TypeError('Invalid voice-follow input');
  if(!transcript.final)return {status:'NO_MATCH',reason:'UNSTABLE_TRANSCRIPT'};
  if(!Number.isFinite(transcript.endMs))return {status:'NO_MATCH',reason:'MISSING_TIMESTAMP'};
  if(nowMs!==undefined&&(!Number.isFinite(nowMs)||transcript.endMs>nowMs+250||nowMs-transcript.endMs>maxAgeMs))
    return {status:'NO_MATCH',reason:'STALE_TRANSCRIPT'};
  if(words(transcript.text).length<3)return {status:'NO_MATCH',reason:'TOO_SHORT'};
  const matches=[];
  for(const cue of cues){
    const line=Number(/^L([1-9]\d*)$/.exec(cue.lineId)?.[1]);
    if(!Number.isFinite(line)||line<focusLine||line>focusLine+maxLookahead||consumedIds.includes(cue.id)||words(cue.trigger).length<3)continue;
    const score=compareSpeech(transcript.text,cue.trigger);
    if(score>=0.8)matches.push({cueId:cue.id,lineId:cue.lineId,score});
  }
  matches.sort((a,b)=>b.score-a.score);
  if(!matches.length)return {status:'NO_MATCH',reason:'NO_CONFIDENT_CANDIDATE'};
  if(matches.length>1&&matches[0].score-matches[1].score<0.12)return {status:'AMBIGUOUS',reason:'SIMILAR_CANDIDATES'};
  return {status:'SUGGEST_PREPARE',...matches[0]};
}
