import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {buildExhaustiveCorpus} from '../test/fixtures/runq-evals/corpus.mjs';
import {createNewShow,addAudioReference,addMockProposal,decideProposal,updateCuePlayback} from '../src/core/workspace.mjs';
import {insertManualCue,insertManualAudioCue} from '../src/core/manualCues.mjs';
import {serializeShowProject,deserializeShowProject} from '../src/core/projectPersistence.mjs';
import {resolveAgentDialogue,boundedAgentConversation,updateAgentDialogueTask} from '../src/core/agentDialogue.mjs';
import {prepareAgentPlan,commitAgentPlan,undoAgentPlan,buildAgentContext} from '../src/core/agentCore.mjs';
import {planScriptAnalysis} from '../src/core/sceneAnalysis.mjs';
import {prepareTheatricalCueAnalysis} from '../src/core/theatreCueAnalysis.mjs';
import {evaluateStageEventCases} from '../src/core/stageCueQa.mjs';
import {loadShowBuilderSession,saveShowBuilderSession,assessShowBuilder,updateShowBuilderStage,
 skipShowBuilderStage,chooseShowBuilderSoundPlan,confirmShowBuilderConfiguration} from '../src/core/showBuilder.mjs';
import {globalLedgerDefaultPath} from '../src/qa/globalSpendLedger.mjs';
import {getAgentEvaluationCorpus} from './runq-agent-live-eval.mjs';
import {reviewSavedAgentEvidence} from './agentEvidenceReview.mjs';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const snapshot=project=>JSON.stringify(project);
function dialogueProject(){
 let project=createNewShow({id:'exhaustive-dialogue',name:'Original dialogue QA',
  scriptText:'SCENE 1\nANA: We are ready to begin\nSFX: bell\nANA: Wait for the closing phrase\nSFX: door\nANA: The show is ending\nSFX: final bell'});
 for(const label of ['Opening','Door','Transition','Closing'])project=insertManualCue(project,{label}).project;
 return {...project,cues:project.cues.map((cue,i)=>({...cue,sourceLineIds:['L'+(3+i)],notes:'Keep note '+i}))};
}
export function evaluateExhaustiveDialogue(item){
 const project=dialogueProject(),before=snapshot(project),last=item.turns.at(-1);
 const history=item.turns.slice(0,-1);
 let task=null;
 for(const [index,turn] of history.entries()){
  if(turn.role!=='user')continue;
  const prior=resolveAgentDialogue(project,turn.text,{history:history.slice(0,index),task});
  task=updateAgentDialogueTask(project,turn.text,prior,task);
 }
 const reply=resolveAgentDialogue(project,last.text,{history,task});
 const expected=item.expected;
 let correct=false,planError=null;
 if(expected.kind==='NO_PLAN')correct=reply.status!=='PLAN'&&reply.operations.length===0;
 else if(expected.kind==='ANSWER')correct=reply.status==='ANSWER';
 else if(reply.status==='PLAN'){
  const op=reply.operations[0],cueId=project.cues[(expected.cueNumber??1)-1].id;
  if(expected.kind==='CREATE')correct=reply.operations.length===expected.count&&reply.operations.every(x=>x.op==='CREATE_CUE');
  if(expected.kind==='DELETE')correct=reply.operations.length===1&&op.op==='DELETE_CUE'&&op.cueId===cueId;
  if(expected.kind==='REORDER')correct=reply.operations.length===1&&op.op==='REORDER_CUE'&&
   op.cueId===cueId&&op.targetCueId===project.cues[3].id&&op.position==='after';
  if(expected.kind==='LABEL')correct=reply.operations.length===1&&op.cueId===cueId&&op.changes?.label===expected.label;
  if(expected.kind==='FADE')correct=reply.operations.length===1&&op.cueId===cueId&&op.changes?.fadeOutMs===expected.fadeOutMs;
  if(expected.kind==='VOICE')correct=reply.operations.length===1&&op.cueId===cueId&&
   typeof op.changes?.trigger==='string'&&project.scriptText.includes(op.changes.trigger);
  let plan;
  try{plan=prepareAgentPlan(project,reply.operations);}
  catch(error){
   if(error.code!=='AGENT_PLAN_FAILED')throw error;
   correct=false;
   planError=error.cause?.message==='Cue must contain playable audio'
    ?'UNRESOLVED_CUE_PLAYBACK_EDIT_NOT_SUPPORTED':'AGENT_PLAN_FAILED';
  }
  if(plan){
   assert.throws(()=>commitAgentPlan(project,plan,{editable:false}),/AGENT_EDIT_NOT_ALLOWED/);
   const applied=commitAgentPlan(project,plan,{editable:true});
   assert.deepEqual(undoAgentPlan(applied.project,applied.undo,{editable:true}),project);
   assert.equal(plan.proposedProject.scriptText,project.scriptText);
   assert.deepEqual(plan.proposedProject.assets,project.assets);
  }
 }
 assert.equal(snapshot(project),before);
 return {id:item.id,language:item.language,category:item.category,split:item.split,
  difficulty:item.difficulty,status:correct?'PASS':'FAIL',observedStatus:reply.status,
  historyTurns:history.length,outboundHistoryTurns:boundedAgentConversation(history,{project,task}).length,
  expectedKind:expected.kind,planError,providerRequests:0,automaticCommit:false,automaticGo:false,
  evidenceMode:'OBSERVED_LOCAL_RESOLVER_AND_PURE_PLAN_COMMIT_UNDO_NOT_META'};
}

export function evaluateExhaustiveScript(item){
 const project=createNewShow({id:item.id,name:item.genre,scriptText:item.scriptText});
 const before=snapshot(project),plan=planScriptAnalysis(item.scriptText),covered=[];
 const windows=[];
 for(let windowStart=0;windowStart<plan.windows.length;windowStart++){
  const prepared=prepareTheatricalCueAnalysis(project,{windowStart,scriptLanguage:item.language});
  covered.push(...prepared.coverage.analyzedLineIds);
  assert.equal(prepared.request.store,false);
  assert.equal(prepared.request.response_format.json_schema.strict,true);
  const expectedInWindow=item.expected.filter(e=>prepared.coverage.analyzedLineIds.includes(e.lineId)).length;
  const maximum=prepared.request.response_format.json_schema.schema.properties.proposals.maxItems;
  windows.push({expectedInWindow,maximum,saturationRisk:expectedInWindow>maximum});
 }
 assert.equal(new Set(covered).size,covered.length);
 assert.equal(covered.length,plan.coverage.totalLines);
 assert.ok(item.expected.every(e=>covered.includes(e.lineId)));
 assert.equal(snapshot(project),before);
 const gold={version:1,provenance:item.reviewStatus,cases:[{
  id:item.id,scriptText:item.scriptText,expected:item.expected,forbiddenPlayLineIds:item.forbiddenPlayLineIds,
 }]};
 const score=events=>evaluateStageEventCases(gold,{version:1,predictionsByCase:{[item.id]:events}}).summary;
 const perfect=score(item.expected);
 assert.equal(perfect.falsePositives,0);assert.equal(perfect.falseNegatives,0);
 let mutations=0;
 const badLine={lineId:'L99999',transport:'PLAY',cueKind:'FX',basis:'EXPLICIT'};
 assert.ok(score([...item.expected,badLine]).falsePositives>0);mutations++;
 if(item.expected.length){
  assert.ok(score(item.expected.slice(1)).falseNegatives>0);mutations++;
  assert.ok(score([...item.expected,item.expected[0]]).falsePositives>0);mutations++;
  const wrong=structuredClone(item.expected);
  const e=wrong.find(x=>x.cueKind!=='SILENCE');
  if(e){e.transport=e.transport==='PLAY'?'STOP':'PLAY';assert.ok(score(wrong).falsePositives>0);mutations++;}
 }
 const forbidden=item.forbiddenPlayLineIds[0];
 assert.ok(score([...item.expected,{...badLine,lineId:forbidden}]).falsePositives>0);mutations++;
 return {id:item.id,genre:item.genre,language:item.language,motif:item.motif,
  split:item.split,difficulty:item.difficulty,lines:covered.length,windows:windows.length,
  expectedEvents:item.expected.length,negativeControl:item.negativeControl,mutationsRejected:mutations,
  saturationWindows:windows.filter(w=>w.saturationRisk).length,status:'PASS',
  evidenceMode:'SYNTHETIC_ORACLE_CONTROLS_AND_REAL_REQUEST_BUILDER_NO_INFERENCE'};
}

export function evaluateCoreJourney(item){
 let project=createNewShow({id:'journey-'+item.id,name:item.name,
  scriptText:item.entry==='script'?'SCENE 1\nSFX: bell':''});
 let session=loadShowBuilderSession(null,project).session;
 const trace=[];
 const act=(action,fn)=>{const result=fn();trace.push(action);return result;};
 const assess=()=>assessShowBuilder(project,project.assets.map(a=>({id:a.id,ready:false})),session);
 const audioCue=()=>{
  project=addAudioReference(project,'original-offline-placeholder.wav');
  project=insertManualAudioCue(project,project.assets[0].id).project;
 };
 if(['audio-first','missing-wav','undecoded-wav','configuration-stale','zip-reopen'].includes(item.name)){
  act('reference-wav-and-manual-cue',audioCue);
  assert.equal(assess().stages.verification.complete,false);
 }
 if(['script-review','reject-all','approve-reviewed','sound-deferred'].includes(item.name)){
  act('stage-proposal',()=>{project=addMockProposal(project,{lineId:'L2',label:'Bell'});});
  assert.equal(project.cues.length,0);
  act(item.name==='reject-all'?'reject':'explicit-approve',()=>{
   project=decideProposal(project,project.proposals[0].id,item.name==='reject-all'?'REJECT':'APPROVE');
  });
  assert.equal(project.cues.length,item.name==='reject-all'?0:1);
 }
 if(item.name==='reopen-session'){
  const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  session=act('select-audio-stage',()=>updateShowBuilderStage(loadShowBuilderSession(storage,project).session,'audio'));
  act('save-stage',()=>assert.equal(saveShowBuilderSession(storage,project,session),true));
  act('reopen-stage',()=>assert.equal(loadShowBuilderSession(storage,project).session.currentStage,'audio'));
 }
 if(item.name==='configuration-stale'){
  session=act('confirm-settings',()=>confirmShowBuilderConfiguration(project,session));
  assert.equal(assess().stages.configuration.complete,true);
  act('edit-settings',()=>{project=updateCuePlayback(project,project.cues[0].id,{fadeOutMs:900});});
  assert.equal(assess().stages.configuration.complete,false);
 }
 if(item.name==='stale-plan'||item.name==='cancel-plan'){
  const before=snapshot(project);
  const plan=act('prepare-plan',()=>prepareAgentPlan(project,[{op:'CREATE_CUE',label:'Pending',afterCueId:null}]));
  if(item.name==='stale-plan'){
   const replacement=createNewShow({id:'replacement',name:'Other show'});
   act('reject-stale-plan',()=>assert.throws(()=>commitAgentPlan(replacement,plan,{editable:true})));
  }else act('discard-plan',()=>assert.equal(snapshot(project),before));
  assert.equal(snapshot(project),before);
 }
 if(item.name==='zip-reopen'){
  act('json-round-trip',()=>assert.deepEqual(deserializeShowProject(serializeShowProject(project)),project));
  // JSON persistence is not an audio-inclusive ZIP/browser round-trip.
 }
 if(item.name==='language-switch'){
  const before=snapshot(project);
  act('build-context-with-original-lines',()=>assert.ok(buildAgentContext(project).lines.some(l=>l.id==='L2')));
  assert.equal(snapshot(project),before);
 }
 if(item.name==='meta-offline')act('manual-cue',()=>{project=insertManualCue(project,{label:'Manual'}).project;});
 if(item.name==='skip-stage'||item.name==='sound-deferred'){
  session=act('defer-audio',()=>chooseShowBuilderSoundPlan(session,'skip'));
  assert.equal(assess().stages.verification.complete,false);
 }
 if(item.name==='empty-start'){
  session=act('skip-cues',()=>skipShowBuilderStage(session,'cues'));
  assert.equal(assess().stages.project.complete,false);
 }
 if(item.name==='storage-denied'){
  const storage={getItem(){throw new Error('denied');},setItem(){throw new Error('denied');}};
  act('storage-denied-visible',()=>assert.equal(loadShowBuilderSession(storage,project).persistenceAvailable,false));
  assert.equal(saveShowBuilderSession(storage,project,session),false);
 }
 if(item.name==='navigation-safe'){
  const before=snapshot(project);
  session=act('select-verification',()=>updateShowBuilderStage(session,'verification'));
  session=act('skip-audio',()=>skipShowBuilderStage(session,'audio'));
  assert.equal(snapshot(project),before);
 }
 act('preflight',()=>assess());
 const limitations=['NO_BROWSER_GESTURES_NO_DECODED_AUDIO_NO_PROVIDER_NO_HARDWARE'];
 if(item.name==='zip-reopen')limitations.push('ZIP_NOT_RUN_JSON_PERSISTENCE_ONLY');
 if(item.name==='language-switch')limitations.push('I18N_BROWSER_SWITCH_NOT_RUN');
 return {id:item.id,name:item.name,coreStatus:'PASS',browserStatus:'NOT_RUN',trace,
  evidenceMode:'INSTRUMENTED_PRODUCTION_CORE_NOT_BROWSER_E2E',limitations,providerRequests:0};
}

async function ledgerHash(){
 try{return digest(await readFile(globalLedgerDefaultPath()));}
 catch(error){if(error.code==='ENOENT')return null;throw error;}
}
export async function runExhaustiveOffline({outputDirectory=resolve('artifacts','runq-evals'),
 agentDirectory=resolve('artifacts','agent-live-eval')}={}){
 const ledgerBefore=await ledgerHash(),corpus=buildExhaustiveCorpus();
 const scripts=corpus.scripts.map(evaluateExhaustiveScript);
 const dialogues=corpus.dialogues.map(evaluateExhaustiveDialogue);
 const journeys=corpus.journeys.map(evaluateCoreJourney);
 const model=await reviewSavedAgentEvidence({directory:agentDirectory,corpus:getAgentEvaluationCorpus()});
 const ledgerAfter=await ledgerHash();
 assert.equal(ledgerAfter,ledgerBefore,'Campaign ledger changed during offline QA');
 const report={revision:'runq-exhaustive-quality-v2-local-task',createdAt:new Date().toISOString(),
  checkout:{branch:execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim(),
   head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
   trackedDiffSha256:digest(execFileSync('git',['diff','--binary','HEAD'])),
   prBase:'NO_PR_FOUND_FOR_CURRENT_BRANCH',ci:'NOT_RUN_LOCAL_DIRTY_CHECKOUT'},
  corpus:{revision:corpus.revision,sha256:digest(JSON.stringify(corpus)),sourcePlanCommit:corpus.sourcePlanCommit,
   scriptScenarioGroups:50,dialoguePairs:51,scripts:scripts.length,conversations:dialogues.length,
   plannedBrowserJourneys:journeys.length,humanGoldVerified:false},
  model,
  evaluator:{evidenceMode:'OFFLINE_EVALUATOR_NEGATIVE_CONTROLS',
   oracleMutationRejections:scripts.reduce((n,r)=>n+r.mutationsRejected,0),
   modelQualityMeasured:false,sourceReportsModified:false},
  simulated:{evidenceMode:'OFFLINE_PRODUCTION_CORE_AND_LOCAL_RESOLVER',
   scripts,dialogues,journeys,dialoguePass:dialogues.filter(r=>r.status==='PASS').length,
   dialogueFailures:dialogues.filter(r=>r.status==='FAIL'),
   browserJourneysExecuted:0,providerRequests:0,realAudioHeard:false},
  budget:{newProviderRequests:0,ledgerBeforeSha256:ledgerBefore,ledgerAfterSha256:ledgerAfter,unchanged:true},
 };
 await mkdir(outputDirectory,{recursive:true,mode:0o700});
 await writeFile(join(outputDirectory,'quality.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
 for(const [name,rows] of [['scripts',corpus.scripts],['dialogues',corpus.dialogues]])
  await writeFile(join(outputDirectory,name+'.jsonl'),rows.map(r=>JSON.stringify(r)).join('\n')+'\n',{mode:0o600});
 await writeFile(join(outputDirectory,'journeys.json'),JSON.stringify(corpus.journeys,null,2)+'\n',{mode:0o600});
 await writeFile(join(outputDirectory,'quality.md'),renderExhaustiveReport(report),{mode:0o600});
 return report;
}

export function renderExhaustiveReport(r){
 const m=r.model.summary.newBatch;
 return [
 '# RUNQ - analisis de calidad exhaustiva (privado/local)',
 '',
 `Fecha: ${r.createdAt}. Rama: ${r.checkout.branch}. HEAD: ${r.checkout.head}.`,
 'No se han ejecutado nuevas solicitudes pagadas. No se han modificado informes originales ni el ledger.',
 '',
 '## Evidencia del modelo (no confundir con simulaciones)',
 `Solicitudes historicas registradas: ${r.model.summary.reportedRequests}; entradas unicas: ${r.model.summary.uniqueInputs}; repeticiones: ${r.model.summary.duplicateInputs}.`,
 `Tanda nueva: ${m.cases} respuestas, ${m.originalCorrect} contratos originalmente correctos, ${m.originalWrong} discrepancias, ${m.originalUnscored} sin puntuacion.`,
 `Reevaluacion gratuita: ${m.typedEventReplays} proyecciones completas de eventos; ${m.retainedContractsScored} contratos retenidos evaluables, ${m.retainedContractsCorrect} correctos en ese alcance limitado.`,
 `Correcciones del oraculo: ${m.evaluatorCorrections}. Respuestas completas reconstruidas: 0.`,
 `Guiones de la tanda: ${m.minScriptLines}-${m.maxScriptLines} lineas; historial previo maximo: ${m.maxConversationTurns} turnos. Latencia mediana/p95: ${m.latencyMedianMs}/${m.latencyP95Ms} ms.`,
 'Todos los 62 casos son development: no hay holdout real. Las etiquetas advanced/extreme no equivalen a guiones o conversaciones extensos.',
 `Propiedades realmente solicitadas: ${Object.entries(m.requestedFields).map(([key,n])=>key+' ('+n+')').join(', ')}.`,
 'Esta tanda no verifica DELETE/REORDER, renombrado, pan, fade-out, loops o alternativas musicales. El historial antiguo tiene controles mas debiles y no permite replay completo.',
 'Los flags de inferencia real y HTTP local son evidencia registrada, no recibos independientes del proveedor ni facturacion medida.',
 'Los valores de edicion son hashes: podemos comprobar contratos, no recuperar respuestas, etiquetas ni repetir independientemente la preservacion del proyecto completo.',
 '',
 '| Funcionalidad | Casos reales | Original correctos | Contratos retenidos correctos/evaluables | Correcciones oraculo |',
 '|---|---:|---:|---:|---:|',
 ...Object.entries(r.model.strata.functionality).map(([k,v])=>
  `| ${k} | ${v.cases} | ${v.originalCorrect} | ${v.retainedContractsCorrect}/${v.retainedContractsScored} | ${v.evaluatorCorrections} |`),
 '',
 ...['language','difficulty','questionType','intent','endpoint','split'].flatMap(key=>[
  '### Estrato: '+key,'',
  '| Valor | Casos | Contratos retenidos correctos/evaluables |','|---|---:|---:|',
  ...Object.entries(r.model.strata[key]).map(([k,v])=>`| ${k} | ${v.cases} | ${v.retainedContractsCorrect}/${v.retainedContractsScored} |`),'',
 ]),
 '## Evaluador y pruebas gratuitas (NO miden Muse)',
 `Corpus: ${r.corpus.scripts} guiones / 50 escenarios ES-EN, ${r.corpus.conversations} conversaciones / 51 pares, ${r.corpus.plannedBrowserJourneys} recorridos previstos.`,
 'Gold provisional. Pares y variaciones relacionadas permanecen en el mismo split. Ningun PASS sintetico representa exactitud del modelo.',
 `Mutaciones deliberadas rechazadas: ${r.evaluator.oracleMutationRejections}. Conversaciones del resolver local: ${r.simulated.dialoguePass}/${r.corpus.conversations}.`,
 '18 recorridos tienen acciones instrumentadas del core. Recorridos completos de navegador ejecutados por este runner: 0. ZIP y cambio visual de idioma siguen NOT_RUN aqui.',
 '',
 '| Conversacion | Idioma | Esperado | Observado | Resultado |','|---|---|---|---|---|',
 ...r.simulated.dialogueFailures.map(d=>`| ${d.category} (${d.id}) | ${d.language} | ${d.expectedKind} | ${d.observedStatus}${d.planError?' / '+d.planError:''} | FAIL |`),
 '',
 '## Capacidades y prioridades para espectaculos',
 '- Verificacion limitada: ES/EN, direcciones explicitas simples, negativos, CONTINUE/STOP/SILENCE y L# de guiones cortos; ediciones numericas y aclaraciones en contratos acotados.',
 '- No verificado: guiones extensos reales, conversacion larga con cambios de proyecto, adecuacion artistica, generacion y escucha de sonidos, voz real, latencia operativa o audio/hardware en sala.',
 '- Memoria local de propuestas de cues de cierre: mantiene cantidad/estado vacio tras conversaciones largas y se invalida al cancelar o cambiar proyecto. No cubre todas las tareas conversacionales.',
 '- Renombrado ES/EN y ajustes de cues sin audio ahora se resuelven gratis, con validacion y aprobacion. Ninguno habilita GO.',
 '- P1: retencion privada de resultados normalizados y snapshot/contrato para replay completo; los hashes actuales no permiten auditar todas las mutaciones.',
 '- P1: separar consejos/planes de generacion de la herramienta Modal y de la aprobacion. Una respuesta del agente no genera un WAV.',
 '- P1: revisar gold con regidor y ampliar casos por evidencias nuevas, no por semillas o totales.',
 '- P2: medir A/B pareado solo despues de cambios, con holdout agrupado y recibos; no llamar al modelo para volver a puntuar respuestas existentes.',
 '',
 '## Seleccion futura de Meta (NO ejecutada)',
 'Primero resolver los fallos gratuitos. Unicamente aportarian informacion nueva: referencias fuera de ventana, continuidad entre ventanas, dos tareas con cambio de opinion y cue/activo ambiguo, memoria tras 8+ turnos, reinicio de proyecto y consejo de sonido frente a generacion real.',
 'No existe presupuesto obligatorio que gastar. Conservar reservas UNKNOWN, limites diarios y request caps. GO/STOP no se han tocado.',
 '',
 'La diagnosis Modal y la auditoria inicial estan en quality-review.md. La comparacion de mejoras locales esta en local-improvements.md.',
 '',
 ].join('\n');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 if(process.argv.length>2){console.error('OFFLINE_QA_ACCEPTS_NO_LIVE_FLAGS');process.exitCode=1;}
 else try{
  const r=await runExhaustiveOffline();
  console.log(JSON.stringify({model:r.model.summary,corpus:r.corpus,
   offlineDialoguePass:r.simulated.dialoguePass,offlineDialogueFailures:r.simulated.dialogueFailures.length,
   evaluatorMutations:r.evaluator.oracleMutationRejections,ledgerUnchanged:r.budget.unchanged,
   report:'artifacts/runq-evals/quality.md'},null,2));
 }catch(error){console.error('RUNQ exhaustive offline QA: '+error.message);process.exitCode=1;}
}
