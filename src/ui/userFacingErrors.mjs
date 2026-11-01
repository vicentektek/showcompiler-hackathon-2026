/**
 * User-facing AI and sound messages.
 * Internal error codes and arbitrary upstream responses must never be
 * reflected in normal RUNQ UI (they may contain hostnames or credentials).
 * This module does not affect server-side cost, consent or safety checks.
 */
const MESSAGES = Object.freeze({
  SFX_NOT_CONFIGURED: ['Sound generation is not available. Check your AI connection settings.', 'La generación de sonidos no está disponible. Revisa la configuración de IA.'],
  SFX_DAILY_LIMIT: ['The daily generation limit has been reached. Try again later.', 'Se ha alcanzado el límite diario de generación. Inténtalo más tarde.'],
  SFX_DAILY_BUDGET: ['Sound generation has reached its configured spending limit.', 'La generación ha alcanzado el límite de gasto configurado.'],
  SFX_ACTIVE_LIMIT: ['A sound is already being generated. Check its progress before trying again.', 'Ya se está generando un sonido. Comprueba su progreso antes de continuar.'],
  SFX_BUDGET_UNKNOWN: ['The previous request needs to be checked before another can start.', 'Hay que comprobar la solicitud anterior antes de iniciar otra.'],
  SFX_DUPLICATE: ['This request has already been submitted. Check its status.', 'Esta solicitud ya se ha enviado. Comprueba su estado.'],
  SFX_TRANSITION: ['This sound is not ready for that action.', 'Este sonido todavía no está listo para esa acción.'],
  META_NOT_CONFIGURED: ['Meta AI is not connected. Configure your own API key in the local server settings.', 'Meta AI no está conectado. Configura tu propia clave en el servidor local.'],
  AGENT_PROVIDER_UNAVAILABLE: ['The AI service could not complete this request. Your show has not changed.', 'El servicio de IA no pudo completar la solicitud. El espectáculo no ha cambiado.'],
  INVALID_PROJECT_TASK_MEMORY: ['Project memory is invalid or expired. Review the stored decisions before continuing; it was not reset.', 'La memoria del proyecto no es válida o ha caducado. Revisa las decisiones guardadas antes de continuar; no se ha reiniciado.'],
  UNSAFE_TASK_MEMORY: ['This decision cannot be saved: remove credentials or external links.', 'No se puede guardar esta decisión: elimina credenciales o enlaces externos.'],
  EXPERT_CONTEXT_TOO_LARGE: ['The requested evidence exceeds the context limit. Narrow the question to specific cues or source lines.', 'La evidencia solicitada supera el límite de contexto. Acota la pregunta a cues o líneas concretas.'],
  AI_CONSENT_REQUIRED: ['Authorize this AI request before continuing.', 'Autoriza esta solicitud de IA antes de continuar.'],
  EDIT_BLOCKED_BY_SHOW_STATE: ['Stop playback and save manual edits before applying AI changes.', 'Detén la reproducción y guarda las ediciones manuales antes de aplicar cambios de IA.'],
  STOP_AUDIO_OR_SAVE_MANUAL_EDITS: ['Stop playback and save manual edits before continuing.', 'Detén la reproducción y guarda las ediciones manuales antes de continuar.'],
  PROJECT_CHANGED: ['The show has changed. Review it before trying again.', 'El espectáculo ha cambiado. Revísalo antes de volver a intentarlo.'],
  STALE_PROJECT_OR_SELECTION: ['The selected cue or show has changed. Review it before applying.', 'El cue seleccionado o el espectáculo ha cambiado. Revísalo antes de aplicar.'],
  NO_CHANGES: ['There are no new changes to apply.', 'No hay cambios nuevos que aplicar.'],
  STALE_CUE_OR_PROJECT: ['The show changed while you were editing. Review it and try again.', 'El espectáculo cambió durante la edición. Revísalo y vuelve a intentarlo.'],
  HTTP_400: ['Please check the information entered and try again.', 'Revisa los datos introducidos e inténtalo de nuevo.'],
  HTTP_401: ['The AI service credentials need attention in Settings.', 'Debes revisar las credenciales del servicio de IA en Ajustes.'],
  HTTP_402: ['The AI provider has a billing or account restriction.', 'El proveedor de IA ha restringido la cuenta o la facturación.'],
  HTTP_403: ['This AI service is not authorized for the current account.', 'Este servicio de IA no está autorizado para la cuenta actual.'],
  HTTP_429: ['The AI service is busy or a usage limit has been reached. Try again later.', 'El servicio de IA está ocupado o se ha alcanzado un límite de uso. Inténtalo más tarde.'],
  NETWORK: ['Cannot reach the AI service. Check your connection.', 'No se puede conectar con el servicio de IA. Comprueba la conexión.'],
  AUDIO_FILE: ['This audio file could not be opened. Try another supported WAV.', 'No se ha podido abrir el audio. Prueba otro WAV compatible.'],
  SOUND_GENERIC: ['The sound action could not be completed. If you just started generation, check its status before trying again.', 'No se ha podido completar la operación de sonido. Si acabas de generar, comprueba su estado antes de reintentar.'],
  GENERIC: ['This action could not be completed. Your show has not changed.', 'No se ha podido completar la acción. El espectáculo no ha cambiado.']
});
export function userFacingError(error, locale='en', area='ai') {
  const raw = typeof error === 'string' ? error : String(error?.code ?? error?.message ?? '');
  const key = raw.trim().toUpperCase().replace(/[- ]/g,'_');
  let resolved = Object.hasOwn(MESSAGES,key) ? key : null;
  if (!resolved) {
    const status = /^HTTP[_ ]?(400|401|402|403|429)\b/.exec(raw.toUpperCase());
    if (status) resolved = 'HTTP_' + status[1];
    else if (/NETWORK|FAILED TO FETCH|ECONNREFUSED|ENOTFOUND/i.test(raw)) resolved='NETWORK';
    else if (/(?:WAV|AUDIO).*(?:DECOD|CHANNEL|MB|SIZE|UNSUPPORTED|CORRUPT)/i.test(raw)) resolved='AUDIO_FILE';
    else if (/^(?:SFX_|META_|AGENT_|MODEL_API_KEY)/i.test(raw)) resolved='GENERIC';
  }
  if (!resolved) resolved = area==='audio' ? 'AUDIO_FILE' : area==='sound' ? 'SOUND_GENERIC' : 'GENERIC';
  return MESSAGES[resolved][locale==='es'?1:0];
}
