/**
 * Optional offline English sound prompt suggestion from the existing strictly
 * bounded theatrical sound compiler. It is NOT general translation or AI.
 * Suggestions never submit a generation and must be reviewed by an operator.
 */
import {compileSoundProposals} from '../core/soundPromptCompiler.mjs';
export function suggestEnglishSfxPrompt(original,sourceLineId=null){
  if(typeof original!=='string'||!original.trim()||original.length>400)return null;
  try{
    const proposals=compileSoundProposals({
      fragment:original,sourceLineId:sourceLineId||null,mode:'STRICT',
    });
    if(proposals.length!==1)return null;
    const p=proposals[0];
    if(!['SFX','ENVIRONMENT'].includes(p.category)||
      typeof p.prompt!=='string'||!p.prompt.trim()||p.prompt.length>1000||
      !Number.isFinite(p.confidence)||p.confidence<0.7||
      typeof p.soundSource!=='string'||/unidentified|unspecified|unknown/i.test(p.soundSource))return null;
    return Object.freeze({
      original,prompt:p.prompt,kind:p.category,
      suggestedDurationSeconds:p.suggestedDurationSeconds,
      confidence:p.confidence,uncertainties:[...(p.uncertainties??[])],
      provenance:'OFFLINE_RULE_BASED_SUGGESTION',
    });
  }catch{return null;}
}
