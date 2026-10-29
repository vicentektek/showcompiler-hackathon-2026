/**
 * Pure checks for a reviewed English SFX draft. Never sends a provider request.
 * Conservative Spanish detection: unknown languages are never silently changed.
 */
export function likelySpanishSfxPrompt(input){
  const s=String(input??'').toLowerCase().trim();
  if(!s||s.length>1000)return false;
  if(/[ñáéíóú¿¡]/.test(s))return true;
  return /\b(?:una|unas|unos|ruido|sonido|puerta|pasos|cierra|abre|campana|lluvia|golpe|cruje|chirría|metalica|metálica|ventana|viento|fuerte|trueno|teatro|pasillo)\b/.test(s) &&
    /\b(?:de|del|que|con|sin|se|un|una|en|el|la|los|las|por|muy)\b/.test(s);
}
export function englishDraftMatches(draft,{originalPrompt,kind,durationSeconds}){
  return Boolean(draft&&draft.originalPrompt===String(originalPrompt??'').trim()&&
    draft.kind===kind&&draft.durationSeconds===durationSeconds&&
    typeof draft.englishPrompt==='string'&&draft.englishPrompt.trim().length>=12&&
    draft.englishPrompt.length<=1000);
}
export function stageEnglishDraft({originalPrompt,kind,durationSeconds,englishPrompt}){
  if(!['SFX','ENVIRONMENT'].includes(kind)||
    !Number.isInteger(durationSeconds)||durationSeconds<1||durationSeconds>12||
    typeof originalPrompt!=='string'||!originalPrompt.trim()||
    typeof englishPrompt!=='string'||englishPrompt.trim().length<12||
    englishPrompt.length>1000)throw new TypeError('INVALID_DRAFT');
  return Object.freeze({originalPrompt:originalPrompt.trim(),kind,durationSeconds,
    englishPrompt:englishPrompt.trim(),status:'REVIEW_REQUIRED'});
}
