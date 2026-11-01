import { getScriptLine, parseScript } from '../core/script.mjs';

const $ = id => document.getElementById(id);
const spanish = () => $('uiLocaleSelect')?.value === 'es';
const text = (es, en) => spanish() ? es : en;
const selectedProposalIds = new Set();
let selected = null;
let taskContext = null;
let batchUndoAvailable = false;
let renderedProjectId = null;
let renderedGeneration = null;
let lastAppCueId = null;
let panel = null;

function readState() {
  let state = null;
  document.dispatchEvent(new CustomEvent('runq:agent-read', {
    detail: { respond: value => { state = value; } },
  }));
  return state;
}

function setSelection(kind, ids) {
  const state = readState();
  if (!state?.project) return;
  selected = {
    kind,
    ids: [...new Set(ids.filter(id => typeof id === 'string'))],
    projectId: state.project.id,
    generation: state.generation,
  };
  render();
}

function describeSelection(state) {
  if (!selected || selected.projectId !== state.project.id ||
      selected.generation !== state.generation) return null;
  const project = state.project;
  const ids = selected.ids;
  if (selected.kind === 'cue') {
    const cue = project.cues.find(item => item.id === ids[0]);
    return cue ? {
      kind: 'cue',
      title: text(`Cue ${cue.number} · ${cue.label}`, `Cue ${cue.number} · ${cue.label}`),
      source: cue.sourceLineIds.join(', ') || text('Sin referencia al guion', 'No script reference'),
      status: cue.actions.some(action => action.type === 'PLAN_AUDIO')
        ? text('Necesita sonido', 'Sound needed')
        : text('Cue de borrador', 'Draft cue'),
      cue,
    } : null;
  }
  if (selected.kind === 'script-line' || selected.kind === 'script-selection') {
    const lines = parseScript(project.scriptText);
    const sourceLines = ids.map(id => getScriptLine(lines, id)).filter(Boolean);
    if (!sourceLines.length) return null;
    return {
      kind: selected.kind,
      title: selected.kind === 'script-selection'
        ? text(`${sourceLines.length} líneas seleccionadas`, `${sourceLines.length} selected lines`)
        : text(`Guion · ${sourceLines[0].id}`, `Script · ${sourceLines[0].id}`),
      source: sourceLines.map(line => `${line.id} · ${line.text}`).join('\n'),
      status: text('Texto original · no modificado', 'Original text · unchanged'),
      lines: sourceLines,
    };
  }
  if (selected.kind === 'proposal' || selected.kind === 'proposal-batch') {
    const proposals = ids.map(id => project.proposals.find(item => item.id === id)).filter(Boolean);
    if (!proposals.length) return null;
    const pending = proposals.filter(item => item.status === 'PENDING').length;
    return {
      kind: proposals.length > 1 ? 'proposal-batch' : 'proposal',
      title: proposals.length > 1
        ? text(`${proposals.length} propuestas seleccionadas`, `${proposals.length} proposals selected`)
        : proposals[0].label,
      source: [...new Set(proposals.flatMap(item => item.sourceLineIds))].join(', ') ||
        text('Sin referencia al guion', 'No script reference'),
      status: text(`${pending} pendientes`, `${pending} pending`),
      proposals,
      pendingIds: proposals.filter(item => item.status === 'PENDING').map(item => item.id),
    };
  }
  if (selected.kind === 'audio') {
    const asset = project.assets.find(item => item.id === ids[0]);
    if (!asset) return null;
    const ready = state.assets.some(item => item.id === asset.id && item.ready);
    return {
      kind: 'audio',
      title: asset.name,
      source: asset.id,
      status: ready ? text('Audio cargado', 'Audio loaded') : text('Referencia no cargada', 'Reference not loaded'),
      asset,
    };
  }
  return null;
}

function createButton(label, action, className = 'btn subtle small') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.dataset.rqContextAction = action;
  return button;
}

function ensurePanel() {
  const inspector = $('cueInspector');
  if (!inspector) return;
  if (!panel) {
    panel = document.createElement('section');
    panel.className = 'rq-context-inspector';
    panel.id = 'rqContextInspector';
    panel.setAttribute('aria-labelledby', 'rqContextInspectorTitle');
  }
  if (panel.parentElement !== inspector) inspector.prepend(panel);
  render();
}

function render() {
  if (!panel) return;
  const state = readState();
  const currentProjectId = state?.project?.id ?? null;
  const currentGeneration = state?.generation ?? null;
  if (renderedProjectId !== null &&
      (renderedProjectId !== currentProjectId || renderedGeneration !== currentGeneration)) {
    selectedProposalIds.clear();
    selected = null;
    taskContext = null;
    batchUndoAvailable = false;
    lastAppCueId = null;
  }
  renderedProjectId = currentProjectId;
  renderedGeneration = currentGeneration;
  if (!state?.project) {
    panel.replaceChildren();
    return;
  }
  // Follow cue selections made by the app (row click, approval, insertion) so the
  // panel never contradicts the cue inspector it sits in. "Clear" holds until the
  // app selects another cue; an explicit proposal batch is never replaced.
  const appCueId = state.selectedCueId ?? null;
  if (appCueId !== lastAppCueId) {
    lastAppCueId = appCueId;
    if (appCueId && !selectedProposalIds.size &&
        state.project.cues.some(cue => cue.id === appCueId)) {
      selected = {
        kind: 'cue',
        ids: [appCueId],
        projectId: currentProjectId,
        generation: currentGeneration,
      };
    }
  }
  const pendingIds = new Set(state.project.proposals
    .filter(proposal => proposal.status === 'PENDING').map(proposal => proposal.id));
  for (const id of selectedProposalIds) {
    if (!pendingIds.has(id)) selectedProposalIds.delete(id);
  }
  for (const checkbox of document.querySelectorAll('[data-proposal-select]')) {
    checkbox.checked = selectedProposalIds.has(checkbox.dataset.proposalSelect);
  }

  const selection = describeSelection(state);
  const heading = document.createElement('header');
  heading.className = 'rq-context-inspector-head';
  const title = document.createElement('strong');
  title.id = 'rqContextInspectorTitle';
  title.textContent = text('Inspector contextual', 'Context inspector');
  const reset = createButton(text('Limpiar', 'Clear'), 'clear');
  reset.disabled = !selection;
  heading.append(title, reset);

  const body = document.createElement('div');
  body.className = 'rq-context-inspector-body';
  if (!selection) {
    body.append(
      Object.assign(document.createElement('strong'), {
        textContent: text('Selecciona un elemento para empezar', 'Select an item to get started'),
      }),
      Object.assign(document.createElement('p'), {
        textContent: text(
          'Elige una línea, propuesta, cue o audio. El contexto se conserva al cambiar de espacio.',
          'Choose a script line, proposal, cue, or audio. Context is retained when you change workspaces.',
        ),
      }),
    );
  } else {
    const identity = document.createElement('strong');
    identity.textContent = selection.title;
    const source = document.createElement('p');
    source.className = 'rq-context-inspector-source';
    source.textContent = selection.source;
    const status = document.createElement('span');
    status.className = 'rq-context-inspector-status';
    status.textContent = selection.status;
    body.append(identity, status, source);
    const actions = document.createElement('div');
    actions.className = 'rq-context-inspector-actions';
    actions.append(createButton(text('Fijar contexto de tarea', 'Pin task context'), 'pin'));
    if (selection.kind === 'cue') {
      actions.append(
        createButton(text('Editar conversando', 'Edit with AI'), 'edit-cue', 'btn accent small'),
        createButton(text('Preparar sonido para este cue', 'Prepare sound for this cue'), 'sound'),
      );
    } else if (selection.kind === 'script-line' || selection.kind === 'script-selection') {
      actions.append(
        createButton(text('Crear cue desde selección', 'Create cue from selection'), 'create-cue', 'btn accent small'),
        createButton(text('Preparar sonido desde el guion', 'Prepare sound from script'), 'sound'),
      );
    } else if (selection.kind === 'proposal') {
      actions.append(createButton(text('Abrir revisión', 'Open review'), 'open-review'));
    } else if (selection.kind === 'proposal-batch') {
      const approve = createButton(
        text(`Aprobar ${selection.pendingIds.length} seleccionadas`, `Approve ${selection.pendingIds.length} selected`),
        'approve-batch',
        'btn accent small',
      );
      const reject = createButton(
        text(`Rechazar ${selection.pendingIds.length} seleccionadas`, `Reject ${selection.pendingIds.length} selected`),
        'reject-batch',
      );
      approve.disabled = reject.disabled = selection.pendingIds.length === 0;
      actions.append(approve, reject);
    } else if (selection.kind === 'audio') {
      actions.append(createButton(text('Abrir en biblioteca', 'Open in library'), 'open-audio'));
    }
    body.append(actions);
  }

  const task = document.createElement('div');
  task.className = 'rq-context-task';
  const taskTitle = document.createElement('strong');
  taskTitle.textContent = text('Tarea fijada', 'Pinned task');
  task.append(taskTitle);
  if (taskContext) {
    const taskInfo = document.createElement('p');
    taskInfo.textContent = `${taskContext.title} · ${taskContext.source}`;
    const taskActions = document.createElement('div');
    taskActions.className = 'rq-context-inspector-actions';
    taskActions.append(
      createButton(text('Abrir sonido con este contexto', 'Open sound with this context'), 'open-task-sound', 'btn accent small'),
      createButton(text('Desfijar', 'Unpin'), 'unpin'),
    );
    task.append(taskInfo, taskActions);
  } else {
    const noTask = document.createElement('p');
    noTask.textContent = text(
      'Fijar el contexto mantiene el destino aunque cambies la selección.',
      'Pinning keeps the task target stable when you change selection.',
    );
    task.append(noTask);
  }
  if (batchUndoAvailable) {
    task.append(createButton(
      text('Deshacer último lote', 'Undo last batch'),
      'undo-batch',
      'btn subtle small',
    ));
  }
  panel.replaceChildren(heading, body, task);
}

function pinSelection() {
  const state = readState();
  const description = state && describeSelection(state);
  if (!description || !selected) return;
  const projectLines = parseScript(state.project.scriptText);
  const cueLines = description.cue
    ? description.cue.sourceLineIds
      .map(id => getScriptLine(projectLines, id))
      .filter(Boolean)
    : [];
  const sourceLines = description.lines ?? cueLines;
  taskContext = {
    ...selected,
    title: description.title,
    source: description.source,
    brief: description.cue?.actions.find(action => action.type === 'PLAN_AUDIO')?.prompt ??
      description.cue?.label ?? '',
    cueId: description.cue?.id ?? null,
    cueNumber: description.cue?.number ?? null,
    cueLabel: description.cue?.label ?? null,
    lineIds: sourceLines.map(line => line.id),
    sourceLines: sourceLines.map(line => ({ id: line.id, text: line.text })),
    lineText: sourceLines.map(line => `${line.id} · ${line.text}`).join('\n'),
    sourceText: sourceLines.map(line => line.text).join('\n'),
    lineId: sourceLines[0]?.id ?? null,
  };
  document.dispatchEvent(new CustomEvent('runq:context-task-pinned', { detail: { taskContext } }));
  render();
}

function openSoundForTask() {
  const state = readState();
  if (!taskContext || !state?.project ||
      taskContext.projectId !== state.project.id ||
      taskContext.generation !== state.generation) {
    taskContext = null;
    render();
    return;
  }
  document.dispatchEvent(new CustomEvent('runq:context-task-open-sound', {
    detail: { taskContext: structuredClone(taskContext) },
  }));
  document.querySelector('[data-workspace-nav="audio"]')?.click();
  document.dispatchEvent(new CustomEvent('runq:sound-mode', { detail: { mode: 'generate' } }));
}

function openSoundForCue(cueId) {
  const state = readState();
  if (!state?.project?.cues.some(cue => cue.id === cueId)) return;
  setSelection('cue', [cueId]);
  pinSelection();
  openSoundForTask();
}

function decideBatch(decision) {
  const state = readState();
  const description = state && describeSelection(state);
  if (!description || description.kind !== 'proposal-batch' || !description.pendingIds.length) return;
  const approved = decision === 'APPROVE';
  const confirmation = text(
    `${approved ? 'Aprobar' : 'Rechazar'} exactamente ${description.pendingIds.length} propuestas seleccionadas?`,
    `${approved ? 'Approve' : 'Reject'} exactly ${description.pendingIds.length} selected proposals?`,
  );
  if (!window.confirm(confirmation)) return;
  let result = null;
  document.dispatchEvent(new CustomEvent('runq:proposal-batch-decision', {
    detail: {
      proposalIds: description.pendingIds,
      decision,
      respond: value => { result = value; },
    },
  }));
  if (result?.ok) {
    batchUndoAvailable = true;
    selectedProposalIds.clear();
    selected = null;
    render();
    return;
  }
  const status = $('statusMessage');
  if (status) status.textContent = text(
    `No se pudo aplicar el lote: ${result?.error ?? 'error desconocido'}`,
    `Batch was not applied: ${result?.error ?? 'unknown error'}`,
  );
}

function activate(action) {
  if (action === 'clear') {
    selected = null;
    selectedProposalIds.clear();
  } else if (action === 'pin') pinSelection();
  else if (action === 'unpin') taskContext = null;
  else if (action === 'open-task-sound') openSoundForTask();
  else if (action === 'approve-batch') decideBatch('APPROVE');
  else if (action === 'reject-batch') decideBatch('REJECT');
  else if (action === 'undo-batch') {
    let result = null;
    document.dispatchEvent(new CustomEvent('runq:proposal-batch-undo', {
      detail: { respond: value => { result = value; } },
    }));
    if (result?.ok) batchUndoAvailable = false;
    else {
      const status = $('statusMessage');
      if (status) status.textContent = text(
        'No se puede deshacer: el espectáculo cambió desde el lote.',
        'Cannot undo: the show changed after the batch.',
      );
    }
  }
  else if (action === 'create-cue' && selected) {
    document.dispatchEvent(new CustomEvent('runq:create-cue-from-script-lines', {
      detail: { lineIds: selected.ids, source: 'context-inspector' },
    }));
  } else if (action === 'edit-cue' && selected) {
    const cueId = selected.ids[0];
    document.querySelector('[data-workspace-nav="cues"]')?.click();
    queueMicrotask(() => document.dispatchEvent(new CustomEvent('runq:cue-chat-open', {
      detail: { cueId },
    })));
  } else if (action === 'sound') {
    pinSelection();
    openSoundForTask();
  } else if (action === 'open-review' || action === 'open-audio') {
    const workspace = action === 'open-review' ? 'ai' : 'audio';
    document.querySelector(`[data-workspace-nav="${workspace}"]`)?.click();
  } else return;
  render();
}

function mount() {
  const inspector = $('cueInspector');
  if (!inspector) return;
  new MutationObserver(ensurePanel).observe(inspector, { childList: true });
  ensurePanel();
  document.addEventListener('click', event => {
    if (event.target.closest('[data-rq-context-action]')) {
      activate(event.target.closest('[data-rq-context-action]').dataset.rqContextAction);
      return;
    }
    const cue = event.target.closest('[data-cue-select]');
    if (cue) {
      setSelection('cue', [cue.dataset.cueSelect]);
      return;
    }
    const proposal = event.target.closest('[data-proposal-id]');
    if (proposal && !event.target.closest('[data-proposal-select],button')) {
      if (!selectedProposalIds.size) setSelection('proposal', [proposal.dataset.proposalId]);
      return;
    }
    const audio = event.target.closest('[data-asset-id]');
    if (audio && !event.target.closest('button,input')) {
      setSelection('audio', [audio.dataset.assetId]);
      return;
    }
    const line = event.target.closest('[data-script-line-id]');
    if (line) {
      queueMicrotask(() => {
        const ids = [...document.querySelectorAll('[data-script-line-select]:checked')]
          .map(input => input.dataset.scriptLineSelect);
        setSelection(ids.length > 1 ? 'script-selection' : 'script-line',
          ids.length ? ids : [line.dataset.scriptLineId]);
      });
    }
  }, true);
  document.addEventListener('change', event => {
    const checkbox = event.target.closest('[data-proposal-select]');
    if (!checkbox) return;
    if (checkbox.checked) selectedProposalIds.add(checkbox.dataset.proposalSelect);
    else selectedProposalIds.delete(checkbox.dataset.proposalSelect);
    const ids = [...selectedProposalIds];
    setSelection(ids.length > 1 ? 'proposal-batch' : 'proposal', ids);
  });
  document.addEventListener('runq:show-state-changed', render);
  document.addEventListener('runq:proposal-batch-approve', event => {
    const state = readState();
    const requestedIds = event.detail?.proposalIds;
    if (!state?.project || !Array.isArray(requestedIds)) return;
    const pendingIds = new Set(state.project.proposals
      .filter(proposal => proposal.status === 'PENDING').map(proposal => proposal.id));
    const ids = [...new Set(requestedIds.filter(id =>
      typeof id === 'string' && pendingIds.has(id)))];
    if (ids.length < 2) return;
    selectedProposalIds.clear();
    for (const id of ids) selectedProposalIds.add(id);
    setSelection('proposal-batch', ids);
    decideBatch('APPROVE');
  });
  document.addEventListener('runq:context-open-cue-sound', event => {
    openSoundForCue(event.detail?.cueId);
  });
  $('uiLocaleSelect')?.addEventListener('change', render);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount, { once: true });
} else mount();
