/**
 * Pure, provider-free SFX journal recovery presentation.
 * The journal (not the browser) remains the authority on quotas, costs and
 * active submissions. Never mark an uncertain remote job safe to retry.
 */
export const ACTIVE_SFX_STATES=Object.freeze([
  'SUBMISSION_UNKNOWN','QUEUED','RUNNING','CANCEL_REQUESTED',
]);
const ACTIVE=new Set(ACTIVE_SFX_STATES);
const RECOVERABLE=new Set(['READY_FOR_REVIEW','ACCEPTED_FOR_MANUAL_IMPORT']);
export function inspectSfxHistory(payload,now=new Date()){
  const jobs=Array.isArray(payload?.jobs)?payload.jobs:[];
  const sorted=jobs.filter(job=>job&&typeof job==='object'&&
    typeof job.requestId==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(job.requestId))
    .sort((a,b)=>String(b.createdAt??'').localeCompare(String(a.createdAt??'')));
  const today=now.toISOString().slice(0,10);
  return Object.freeze({
    jobs:sorted,
    active:sorted.filter(job=>ACTIVE.has(job.status)),
    ready:sorted.filter(job=>RECOVERABLE.has(job.status)),
    startedToday:sorted.filter(job=>typeof job.createdAt==='string'&&job.createdAt.startsWith(today)).length,
    truncated:payload?.truncated===true,
  });
}
const ERRORS=Object.freeze({
  SFX_ACTIVE_LIMIT:[
    'Hay un trabajo anterior sin resolver. Abre el historial y comprueba su estado; no vuelvas a generar ni borres el registro.',
    'An earlier job is unresolved. Open job history and check its status; do not retry or erase the journal.',
  ],
  SFX_DAILY_LIMIT:[
    'Se alcanzó el límite de solicitudes diarias. Aceptar o descartar una toma NO devuelve una solicitud; espera al próximo día UTC.',
    'Daily request quota reached. Accepting or rejecting a take does NOT refund an attempt; wait until the next UTC day.',
  ],
  SFX_DAILY_BUDGET:[
    'Se agotó el presupuesto diario de reservas locales. No se han restablecido los límites ni enviado otra solicitud.',
    'The local daily reservation budget is exhausted. No limits were reset and no new request was sent.',
  ],
  SFX_SUBMISSION_UNKNOWN:[
    'No se puede confirmar si Modal recibió esta solicitud. No la repitas: verifica el historial y el trabajo en Modal.',
    'It is unknown whether Modal received this request. Do not retry: inspect the journal and Modal.',
  ],
  SFX_BUSY:[
    'Hay otra operación del generador en curso. Espera a conocer su resultado sin enviar otra solicitud.',
    'Another generator operation is in progress. Check its outcome without submitting again.',
  ],
  SFX_JOURNAL_LOCKED:[
    'El registro local está bloqueado; requiere revisión manual antes de continuar. No borres el archivo de bloqueo.',
    'The local journal is locked and needs manual investigation. Do not delete the lock file.',
  ],
  SFX_BUDGET_UNKNOWN:[
    'Existe una solicitud cuyo coste reservado es desconocido. Debe investigarse antes de generar de nuevo.',
    'An earlier request has unknown reserved cost. Investigate it before another generation.',
  ],
  SFX_NOT_CONFIGURED:[
    'Generador desconfigurado. Revisa npm run sfx:doctor y reinicia el servidor.',
    'Generator is not configured. Run npm run sfx:doctor and restart the server.',
  ],
});
export function explainSfxError(code,locale='es'){
  return ERRORS[code]?.[locale==='en'?1:0] ??
    (locale==='en'?'SFX request failed. Inspect the local job history before trying again.':
      'La solicitud falló. Comprueba el historial antes de intentarlo de nuevo.');
}
export function labelSfxHistory(job,locale='es'){
  const names={
    QUEUED:['En cola','Queued'],RUNNING:['En ejecución','Running'],
    SUBMISSION_UNKNOWN:['Envío incierto','Submission unknown'],
    CANCEL_REQUESTED:['Cancelación por verificar','Cancellation unverified'],
    READY_FOR_REVIEW:['Lista para escuchar','Ready for review'],
    ACCEPTED_FOR_MANUAL_IMPORT:['Aceptada','Accepted'],
    REJECTED:['Descartada','Rejected'],FAILED:['Fallida','Failed'],CANCELLED:['Cancelada','Cancelled'],
  };
  return String(job?.requestId??'')+' · '+
    (names[job?.status]?.[locale==='en'?1:0]??String(job?.status??'UNKNOWN'));
}
