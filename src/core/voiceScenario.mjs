/** Build a bounded, explicit rehearsal exercise from operator-authored cue triggers.
 * This is synthetic transcript replay, NOT microphone recognition or live ASR.
 */
import { parseScript } from './script.mjs';
import { normalizeSpeech } from './voiceFollow.mjs';

export function makeProjectVoiceScenario(project,{maxCues=20}={}){
  if(!Number.isInteger(maxCues)||maxCues<1||maxCues>50)throw new TypeError('Invalid simulation limit');
  const scriptText=typeof project?.scriptText==='string'?project.scriptText:'';
  if(!scriptText)return null;
  const validLines=new Set(parseScript(scriptText).map(row=>row.id));
  const cues=(Array.isArray(project?.cues)?project.cues:[]).flatMap(cue=>{
    if(!cue||typeof cue.id!=='string')return [];
    const lineId=(Array.isArray(cue.sourceLineIds)?cue.sourceLineIds:[]).find(id=>validLines.has(id));
    const trigger=typeof cue.trigger==='string'?cue.trigger.trim():'';
    if(!lineId||normalizeSpeech(trigger).split(' ').filter(Boolean).length<3)return [];
    return [{id:cue.id,number:cue.number,label:cue.label,trigger,lineId}];
  }).sort((a,b)=>Number(a.lineId.slice(1))-Number(b.lineId.slice(1)));
  if(!cues.length)return null;
  const selected=cues.slice(0,maxCues);
  const events=[];
  let atMs=1000,focus=Number(selected[0].lineId.slice(1));
  for(const cue of selected){
    const line=Number(cue.lineId.slice(1));
    if(line<focus||line>focus+25){
      events.push({type:'SET_FOCUS',atMs,line});
      atMs+=500;
    }
    events.push({type:'TRANSCRIPT',atMs,endMs:atMs-100,final:true,text:cue.trigger});
    focus=line;atMs+=2000;
  }
  return {initialFocusLine:Number(selected[0].lineId.slice(1)),cues:selected,events,scriptText};
}
