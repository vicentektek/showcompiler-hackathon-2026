import { parseScript, getScriptLine } from '../core/script.mjs';
import { serializeShowProject, deserializeShowProject, normalizeShowProject, MAX_PROJECT_JSON_BYTES } from '../core/projectPersistence.mjs';
import { createNewShow, addAudioReference, addMockProposal, decideProposal } from '../core/workspace.mjs';

const $ = (id) => document.getElementById(id);
const sampleText = 'ESCENA 1. COMIENZA EL ENSAYO\n(Ambiente musical de apertura.)\nANA: ¿Está todo listo?\nLUIS: Preparados.\n(Suena una campana a lo lejos.)\nANA: ¡Adelante!\n';
const limitScriptBytes = 1_000_000;
const maximumShownLines = 300;
let show = createNewShow();
let dirty = false;

function node(tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (value !== undefined) element.textContent = String(value);
  return element;
}
function feedback(message, tone = 'info') {
  const target = $('statusMessage');
  target.textContent = message;
  target.dataset.tone = tone;
}
function safeOperation(operation, successMessage) {
  try {
    const next = operation();
    if (next) show = next;
    dirty = true;
    render();
    feedback(successMessage, 'success');
  } catch (error) {
    feedback(error instanceof Error ? error.message : 'Operación no válida', 'error');
  }
}
function replaceOptions(select, entries, oldValue) {
  select.replaceChildren();
  for (const [value, label] of entries) {
    const option = node('option', '', label);
    option.value = value;
    select.append(option);
  }
  if (entries.some(([value]) => value === oldValue)) select.value = oldValue;
  select.disabled = entries.length === 0;
}
function render() {
  const lines = parseScript(show.scriptText);
  $('showName').value = show.name;
  $('linesCount').textContent = show.scriptText ? String(lines.length) : '0';
  $('proposalsCount').textContent = String(show.proposals.length);
  $('cuesCount').textContent = String(show.cues.length);
  const preview = $('scriptPreview');
  preview.replaceChildren();
  if (!show.scriptText) {
    preview.append(node('p', 'empty', 'Todavía no hay un guion cargado.'));
  } else {
    for (const line of lines.slice(0, maximumShownLines)) {
      const row = node('div', 'script-line');
      row.append(node('span', 'line-ref', line.id), node('span', 'line-text', line.text || ' '));
      preview.append(row);
    }
  }
  $('scriptLimitNote').textContent = lines.length > maximumShownLines ? `Mostrando ${maximumShownLines} de ${lines.length}` : '';

  const list = $('assetList');
  list.replaceChildren();
  if (show.assets.length === 0) list.append(node('span', 'caption', 'Sin referencias registradas.'));
  for (const asset of show.assets) list.append(node('span', 'tag', `${asset.id} · ${asset.name}`));

  replaceOptions($('lineSelect'), show.scriptText ? lines.slice(0, 1000).map(line => [line.id, `${line.id} · ${line.text.slice(0, 90) || '(línea vacía)'}`]) : [], $('lineSelect').value);
  replaceOptions($('assetSelect'), show.assets.map(asset => [asset.id, `${asset.id} · ${asset.name}`]), $('assetSelect').value);
  $('createProposalBtn').disabled = !show.scriptText || show.assets.length === 0;

  const proposalList = $('proposalList');
  proposalList.replaceChildren();
  if (!show.proposals.length) proposalList.append(node('p', 'empty', 'Todavía no hay propuestas.'));
  for (const proposal of show.proposals) {
    const card = node('article', 'item');
    const top = node('div', 'item-head');
    top.append(node('strong', '', proposal.label), node('span', 'state', proposal.status));
    card.append(top);
    const line = getScriptLine(lines, proposal.sourceLineIds[0]);
    card.append(node('p', 'item-detail', `${proposal.sourceLineIds.join(', ')} · ${line?.text ?? 'Sin línea'}`));
    card.append(node('p', 'item-detail', `PLAY → ${proposal.actions.map(action => action.assetId).join(', ')}`));
    if (proposal.status === 'PENDING') {
      const controls = node('div', 'item-actions');
      const approve = node('button', 'btn primary small', 'Aprobar');
      approve.type = 'button';
      approve.addEventListener('click', () => safeOperation(() => decideProposal(show, proposal.id, 'APPROVE'), `Propuesta ${proposal.id} aprobada. Cue creado en DRAFT.`));
      const reject = node('button', 'btn subtle small', 'Rechazar');
      reject.type = 'button';
      reject.addEventListener('click', () => safeOperation(() => decideProposal(show, proposal.id, 'REJECT'), `Propuesta ${proposal.id} rechazada.`));
      controls.append(approve, reject);
      card.append(controls);
    }
    proposalList.append(card);
  }

  const cueList = $('cueList');
  cueList.replaceChildren();
  if (show.cues.length === 0) cueList.append(node('p', 'empty', 'Aprueba una propuesta para crear el primer cue.'));
  for (const cue of show.cues) {
    const card = node('article', 'item cue-item');
    const top = node('div', 'item-head');
    top.append(node('strong', '', `${cue.number}. ${cue.label}`), node('span', 'state', cue.status));
    card.append(top, node('p', 'item-detail', `Guion: ${cue.sourceLineIds.join(', ')}`), node('p', 'item-detail', `PLAY → ${cue.actions.map(action => action.assetId).join(', ')}`));
    cueList.append(card);
  }
}
function userAllowsReplacement() {
  if (!dirty && !show.scriptText && !show.proposals.length && !show.assets.length) return true;
  return window.confirm('El espectáculo actual se sustituirá. ¿Has guardado el JSON si deseas conservarlo?');
}
function saveProject() {
  const name = $('showName').value.trim();
  const serialized = serializeShowProject({ ...show, name });
  show = deserializeShowProject(serialized);
  const url = URL.createObjectURL(new Blob([serialized], { type: 'application/json;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'showcompiler-' + show.id + '.json';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  dirty = false;
  render();
  feedback('Archivo JSON preparado para descarga. Recuerda que no incluye los audios.', 'success');
}
async function readTextFile(file, maxBytes) {
  if (!file) return null;
  if (file.size > maxBytes) throw new Error(`Archivo demasiado grande (límite ${maxBytes} bytes).`);
  const buffer = await file.arrayBuffer();
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
  catch { throw new Error('El archivo debe utilizar codificación UTF-8 válida.'); }
}
function setNewShow(project, message) {
  show = project;
  dirty = true;
  render();
  feedback(message, 'success');
}
$('exampleBtn').addEventListener('click', () => {
  if (!userAllowsReplacement()) return;
  safeOperation(() => addAudioReference(createNewShow({ name: 'Escena de prueba', scriptText: sampleText }), 'ambiente-demo.wav'), 'Ejemplo cargado. El audio es una referencia simulada, no un archivo reproducible.');
});
$('newShowBtn').addEventListener('click', () => {
  if (!userAllowsReplacement()) return;
  setNewShow(createNewShow(), 'Espectáculo nuevo. No se ha borrado ningún archivo del ordenador.');
  dirty = false;
});
$('importScriptBtn').addEventListener('click', () => $('scriptFileInput').click());
$('scriptFileInput').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file || !userAllowsReplacement()) return;
  try {
    if (!file.name.toLowerCase().endsWith('.txt')) throw new Error('Selecciona un archivo .txt');
    const text = await readTextFile(file, limitScriptBytes);
    const title = file.name.replace(/\.txt$/i, '').slice(0, 120).trim() || 'Nuevo espectáculo';
    setNewShow(createNewShow({ name: title, scriptText: text }), `Guion ${file.name} importado. Los cues antiguos no se han mezclado.`);
  } catch (error) { feedback(error.message, 'error'); }
});
$('assetForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = $('assetName');
  const name = input.value;
  safeOperation(() => addAudioReference(show, name), 'Referencia de audio añadida (solo metadatos).');
  if (show.assets.some(a => a.name === name.trim())) input.value = '';
});
$('proposalForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const label = $('proposalLabel').value;
  safeOperation(() => addMockProposal(show, { label, lineId: $('lineSelect').value, assetId: $('assetSelect').value }), 'Propuesta SIMULADA creada. Requiere revisión humana.');
  if (show.proposals.some(p => p.label === label)) $('proposalLabel').value = '';
});
$('showName').addEventListener('change', () => safeOperation(() => normalizeShowProject({ ...show, name: $('showName').value.trim() }), 'Nombre del espectáculo actualizado.'));
$('saveProjectBtn').addEventListener('click', () => { try { saveProject(); } catch (error) { feedback(error.message, 'error'); } });
$('openProjectBtn').addEventListener('click', () => $('projectFileInput').click());
$('projectFileInput').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file || !userAllowsReplacement()) return;
  try {
    if (!file.name.toLowerCase().endsWith('.json')) throw new Error('Selecciona un archivo .json');
    const text = await readTextFile(file, MAX_PROJECT_JSON_BYTES);
    const restored = deserializeShowProject(text);
    show = restored; dirty = false; render();
    feedback(`Proyecto ${restored.name} cargado y validado. Los audios deben registrarse por separado.`, 'success');
  } catch (error) { feedback(error.message, 'error'); }
});
render();
