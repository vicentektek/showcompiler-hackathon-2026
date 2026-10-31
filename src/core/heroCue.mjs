/**
 * RUNQ hero operator (EN): offline deterministic extraction of a configured cue.
 * Muse Voice may transcribe upstream; this is NOT Muse Spark interpretation.
 * No I/O, model calls, writes, GO or ARM.
 */
const WORDS=Object.freeze({one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30});
const norm=s=>String(s??'').toLowerCase().normalize('NFKD')
 .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const textOfLine=(script,n)=>String(script??'').replace(/\r\n/g,'\n').split('\n')[n-1]??null;
const number=t=>/^\d{1,3}$/.test(String(t??'').trim())?Number(t):WORDS[String(t??'').trim().toLowerCase()]??null;
const result=(status,message,operations=[])=>({status,message,operations});

/**
 * Dictation: "Insert a cue before cue three. Name it Decision Tension.
 * Use the selected sound. Set the voice trigger to line twenty."
 * selectedAssetId must come from a deliberate READY library choice.
 */
export function interpretHeroCueCommand(project,prompt,{selectedAssetId=null,assetAvailable=()=>false}={}){
 if(typeof prompt!=='string'||prompt.length>1600)return null;
 const raw=prompt.replace(/\s+/g,' ').trim();
 if(!/^(?:runq[, :]+)?(?:insert|add|create)\s+(?:a|one|new)\s+cue\b/i.test(raw))return null;
 const clause=/\b(before|after)\s+(?:the\s+)?(?:cue|q)\s+(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten)\b/i.exec(raw);
 const name=/\bname\s+it\s+(.+?)(?:[.;]|\s+use\s+(?:the|this)\s+)/i.exec(raw);
 const line=/\b(?:trigger|spoken\s+trigger|voice\s+trigger)\s+(?:to|at|from)?\s*(?:the\s+)?(?:script\s+)?line\s+(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty)\b(?=\s*[.!?;,]|\s*$)/i.exec(raw);
 if(!clause||!name||!line||!/\buse\s+(?:the|this)\s+selected\s+sound\b/i.test(raw))
  return result('CLARIFY','Specify before/after cue number, name, selected sound, and script line; no changes prepared.');
 const cueNumber=number(clause[2]),lineNumber=number(line[1]);
 if(!Number.isSafeInteger(cueNumber)||cueNumber<1||!Number.isSafeInteger(lineNumber)||lineNumber<1)
  return result('CLARIFY','Invalid cue number or script line; no changes prepared.');
 const cues=project?.cues,assets=project?.assets;
 if(!Array.isArray(cues)||!Array.isArray(assets))return result('CLARIFY','No active show.');
 const target=cues.find(c=>c.number===cueNumber);
 if(!target)return result('CLARIFY','The destination cue does not exist.');
 const index=cues.findIndex(c=>c.id===target.id);
 if(clause[1].toLowerCase()==='before'&&index===0)
  return result('CLARIFY','Insertion before first cue is not supported by this safe command.');
 const afterCueId=clause[1].toLowerCase()==='before'?cues[index-1].id:target.id;
 const label=name[1].trim().replace(/[.;,]+$/,'');
 if(!label||label.length>200)return result('CLARIFY','Cue name must have 1–200 characters.');
 const asset=assets.find(a=>a.id===selectedAssetId);
 if(!asset||assetAvailable(asset.id)!==true)
  return result('CLARIFY','Choose one imported, ready sound in the agent panel first; no changes prepared.');
 const dialogue=/^\s*([^:：\r\n]{1,48})\s*[:：]\s*(.+?)\s*$/.exec(textOfLine(project.scriptText,lineNumber)??'');
 if(!dialogue||norm(dialogue[2]).split(' ').filter(Boolean).length<4)
  return result('CLARIFY','The requested line is not distinctive spoken dialogue.');
 const trigger=dialogue[2].trim();
 if(cues.some(c=>norm(c.trigger)===norm(trigger)))
  return result('CLARIFY','That spoken trigger already belongs to another cue.');
 const operation={op:'CREATE_CONFIGURED_CUE',afterCueId,label,
  assetId:asset.id,sourceLineId:'L'+lineNumber,trigger};
 return result('PLAN','Insert "'+label+'" near cue '+cueNumber+', using "'+
  asset.name+'" and original dialogue L'+lineNumber+
  '. Review before applying; no audio will play.',[operation]);
}

/** Recheck at PREVIEW and COMMIT with live audio readiness. */
export function validateHeroCueOperation(project,operation,{assetAvailable=()=>false}={}){
 const keys=['op','afterCueId','label','assetId','sourceLineId','trigger'];
 if(!operation||typeof operation!=='object'||Array.isArray(operation)||
    keys.some(k=>!Object.hasOwn(operation,k))||
    Object.keys(operation).some(k=>!keys.includes(k))||
    operation.op!=='CREATE_CONFIGURED_CUE')throw new TypeError('INVALID_HERO_OPERATION');
 if(typeof operation.label!=='string'||!operation.label.trim()||operation.label.length>200||
    typeof operation.assetId!=='string'||typeof operation.sourceLineId!=='string'||
    typeof operation.trigger!=='string'||!operation.trigger.trim()||operation.trigger.length>300)
  throw new TypeError('INVALID_HERO_FIELDS');
 if(!project||!Array.isArray(project.cues)||!Array.isArray(project.assets))
  throw new TypeError('INVALID_HERO_PROJECT');
 if(operation.afterCueId!==null&&!project.cues.some(c=>c.id===operation.afterCueId))
  throw new TypeError('HERO_POSITION_NOT_FOUND');
 if(!project.assets.some(a=>a.id===operation.assetId)||assetAvailable(operation.assetId)!==true)
  throw new TypeError('HERO_AUDIO_UNAVAILABLE');
 const line=/^L([1-9]\d{0,3})$/.exec(operation.sourceLineId);
 if(!line)throw new TypeError('INVALID_SCRIPT_LINE');
 const dialogue=/^\s*([^:：\r\n]{1,48})\s*[:：]\s*(.+?)\s*$/.exec(textOfLine(project.scriptText,Number(line[1]))??'');
 if(!dialogue||norm(operation.trigger)!==norm(dialogue[2])||
    norm(operation.trigger).split(' ').filter(Boolean).length<4)
  throw new TypeError('HERO_TRIGGER_NOT_FROM_SCRIPT');
 if(project.cues.some(c=>norm(c.trigger)===norm(operation.trigger)))
  throw new TypeError('HERO_DUPLICATE_TRIGGER');
 return operation;
}
