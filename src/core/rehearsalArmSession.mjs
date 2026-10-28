/**
 * Shared rehearsal automatic-GO authorization.
 * UI labels/aria do not grant execution permission. Only an explicitly
 * armed session, bound to the current show fingerprint, can authorize it.
 * Neither this module nor its callers may auto-arm on navigation or reload.
 */
const state={armed:false,epoch:0,fingerprint:'',reason:'initial'};
const snapshot=()=>Object.freeze({...state});
export function rehearsalArmState(){return snapshot();}
export function armRehearsalVoice({workspace,live,fingerprint,visible}={}){
  if(workspace!=='rehearsal'||live!==true||visible!==true||
      typeof fingerprint!=='string'||!fingerprint) return false;
  state.armed=true;state.epoch++;state.fingerprint=fingerprint;
  state.reason='operator';return true;
}
export function disarmRehearsalVoice(reason='operator'){
  const wasArmed=state.armed;
  state.armed=false;state.epoch++;state.fingerprint='';
  state.reason=String(reason).slice(0,80);
  return wasArmed;
}
export function authorizeRehearsalVoice({
  workspace,live,fingerprint,visible,epoch,
}={}){
  return state.armed===true&&workspace==='rehearsal'&&live===true&&
    visible===true&&fingerprint===state.fingerprint&&
    typeof fingerprint==='string'&&Boolean(fingerprint)&&
    (epoch===undefined||epoch===state.epoch);
}
