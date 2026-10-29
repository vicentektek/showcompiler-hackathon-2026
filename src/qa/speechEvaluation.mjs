/**
 * Pure speech transcript evaluation for RunQ test fixtures.
 *
 * Does NOT call Meta, listen to microphone, arm rehearsal, or execute cues.
 * Spoken-pie detection is scored separately from transcription text.
 */
const MAX_CHARS=10000;
const MAX_WORDS=1500;

export function normalizeSpeechText(value,{stripDiacritics=false}={}){
  if(typeof value!=='string'||value.length>MAX_CHARS)throw new TypeError('INVALID_TRANSCRIPT_TEXT');
  let text=value.normalize('NFC').toLocaleLowerCase('und')
    .replace(/[\p{P}\p{S}]+/gu,' ')
    .replace(/\s+/gu,' ').trim();
  if(stripDiacritics)text=text.normalize('NFD').replace(/\p{M}+/gu,'').normalize('NFC');
  return text;
}

export function editDistance(a,b){
  if(!Array.isArray(a)||!Array.isArray(b)||a.length>MAX_WORDS||b.length>MAX_WORDS){
    throw new TypeError('INVALID_TOKEN_SEQUENCE');
  }
  const old=new Uint32Array(b.length+1);
  const next=new Uint32Array(b.length+1);
  for(let j=0;j<=b.length;j++)old[j]=j;
  for(let i=1;i<=a.length;i++){
    next[0]=i;
    for(let j=1;j<=b.length;j++){
      const sub=old[j-1]+(a[i-1]===b[j-1]?0:1);
      next[j]=Math.min(old[j]+1,next[j-1]+1,sub);
    }
    old.set(next);
  }
  return old[b.length];
}

export function scoreTranscription({reference,hypothesis,language='es',stripDiacritics=false}={}){
  if(!['es','en'].includes(language))throw new TypeError('INVALID_LANGUAGE');
  const a=normalizeSpeechText(reference,{stripDiacritics});
  const b=normalizeSpeechText(hypothesis,{stripDiacritics});
  const aw=a?a.split(' '):[];
  const bw=b?b.split(' '):[];
  if(aw.length>MAX_WORDS||bw.length>MAX_WORDS)throw new RangeError('TOO_MANY_WORDS');
  const wordErrors=editDistance(aw,bw);
  const charErrors=editDistance([...a],[...b]);
  // If ground truth empty, do not produce a fictitious 0% WER.
  const wordErrorRate=aw.length===0?null:wordErrors/aw.length;
  const charErrorRate=a.length===0?null:charErrors/[...a].length;
  return Object.freeze({
    language,referenceWordCount:aw.length,hypothesisWordCount:bw.length,
    referenceCharCount:[...a].length,wordErrors,charErrors,
    wer:wordErrorRate,cer:charErrorRate,
    exact:wordErrors===0&&charErrors===0,
    scoringPolicy:stripDiacritics?'CASE_PUNCT_DIACRITIC_INSENSITIVE':'CASE_PUNCT_INSENSITIVE',
  });
}

export function scoreVoiceCueDecisions(events){
  if(!Array.isArray(events)||events.length>10000)throw new TypeError('INVALID_VOICE_EVENTS');
  let expected=0,detected=0,correct=0,falseGo=0,missed=0,duplicateGo=0;
  const seen=new Set();
  for(const e of events){
    if(!e||typeof e!=='object'||typeof e.id!=='string'||seen.has(e.id)||
      typeof e.armed!=='boolean'||typeof e.actualGo!=='boolean'|| 
      !(e.expectedCueId===null||typeof e.expectedCueId==='string')||
      !(e.actualCueId===null||typeof e.actualCueId==='string')){
      throw new TypeError('INVALID_VOICE_EVENT');
    }
    seen.add(e.id);
    if(e.expectedCueId!==null)expected++;
    if(e.actualGo)detected++;
    if(e.actualGo&&e.expectedCueId!==null&&e.actualCueId===e.expectedCueId)correct++;
    if(e.actualGo&&(!e.armed||e.expectedCueId===null||e.actualCueId!==e.expectedCueId))falseGo++;
    if(e.expectedCueId!==null&&(!e.actualGo||e.actualCueId!==e.expectedCueId))missed++;
    if(e.duplicateGo===true)duplicateGo++;
  }
  return {events:events.length,expected,detected,correct,falseGo,missed,duplicateGo,
    recall:expected?correct/expected:null,
    precision:detected?correct/detected:null,
    safetyPassed:falseGo===0&&duplicateGo===0,
    note:'Requires real timestamped trial evidence to estimate false GO per hour; never infer it from event count.'};
}
