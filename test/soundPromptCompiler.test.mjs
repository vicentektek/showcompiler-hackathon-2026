import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileSoundProposals,
  normalizeCompileMode,
  buildShowSoundCandidates,
  recompileProposal,
  applyProposalEdits,
  buildPromptFromFields,
  prepareCueSoundDraft,
  approvedDetailCoverage,
  SoundPromptCompilerError,
  COMPILER_CONTRACT_VERSION,
  COMPILE_MODES,
  PROMPT_CATEGORIES,
  INTENSITY_LEVELS,
  ACOUSTIC_SPACES,
  GENERATION_MODELS,
  MAX_PROMPT_CHARS,
  MAX_SEQUENCE_BEATS,
  MAX_SCAN_CANDIDATES,
} from '../src/core/soundPromptCompiler.mjs';

const SFX_MODEL = GENERATION_MODELS.SFX;
const MUSIC_MODEL = GENERATION_MODELS.MUSIC;
const SFX_TAIL = 'Dry theatrical sound effect, no music, no voices, no background ambience.';

function compile(fragment, overrides = {}) {
  return compileSoundProposals({
    fragment,
    projectId: 'test-show',
    sourceLineId: 'L128',
    mode: 'STRICT',
    ...overrides,
  });
}

function contractFields(proposal) {
  for (const key of [
    'contractVersion', 'id', 'projectId', 'scriptReference', 'sourceLineId',
    'fragmentKind', 'mode', 'originalFragment', 'fragmentEvidence', 'category',
    'soundSource', 'action', 'material', 'intensity', 'acousticSpace',
    'offstage', 'sequence', 'suggestedDurationSeconds', 'loop',
    'explicitElements', 'inferences', 'optionalDecisions', 'uncertainties',
    'confidence', 'confidenceLevel', 'confidenceReasons', 'prompt',
    'promptEdited', 'model', 'fieldProvenance',
  ]) {
    assert.ok(key in proposal, `proposal must expose ${key}`);
  }
  assert.equal(proposal.contractVersion, COMPILER_CONTRACT_VERSION);
  assert.ok(proposal.prompt.length <= MAX_PROMPT_CHARS);
  assert.ok(PROMPT_CATEGORIES.includes(proposal.category));
  assert.ok(INTENSITY_LEVELS.includes(proposal.intensity));
  assert.ok(ACOUSTIC_SPACES.includes(proposal.acousticSpace.id));
  assert.ok(proposal.explicitElements.length >= 1, 'explicit evidence must exist');
  assert.equal(proposal.scriptReference, 'L128');
  return proposal;
}

test('compiler exposes the documented constants', () => {
  assert.equal(COMPILER_CONTRACT_VERSION, 1);
  assert.deepEqual(COMPILE_MODES, ['STRICT', 'CREATIVE']);
  assert.deepEqual([...PROMPT_CATEGORIES].sort(), ['ENVIRONMENT', 'MUSIC', 'SFX']);
  assert.equal(MAX_PROMPT_CHARS, 1000);
  assert.equal(MAX_SEQUENCE_BEATS, 4);
  assert.equal(MAX_SCAN_CANDIDATES, 250);
  assert.equal(SFX_MODEL, 'stabilityai/stable-audio-3-small-sfx');
  assert.ok(MUSIC_MODEL.length > 0);
});

test('explicit single SFX: strong portazo', () => {
  const proposals = compile('(Portazo fuerte)');
  assert.equal(proposals.length, 1);
  const [proposal] = proposals.map(contractFields);
  assert.equal(proposal.category, 'SFX');
  assert.equal(proposal.soundSource, 'a wooden door');
  assert.equal(proposal.intensity, 'HIGH');
  assert.ok(proposal.prompt.includes('slams shut'));
  assert.ok(proposal.confidence >= 0.85);
  assert.ok(proposal.prompt.includes(SFX_TAIL));
  assert.equal(proposal.sequence, null);
  assert.equal(proposal.model, SFX_MODEL);
  assert.equal(proposal.id, 'SPC-test-show-L128-1');
  assert.equal(proposal.promptEdited, false);
});

test('explicit single SFX: door closes with golpe', () => {
  const [proposal] = compile('(La puerta se cierra de golpe)').map(contractFields);
  assert.equal(proposal.action, 'closes once, briefly and evenly');
});

test('cue sound drafts include the cue reference and infer English prompt duration from the original direction', () => {
  const draft = prepareCueSoundDraft({
    cue: {
      id: 'cue-7', number: '007', label: 'Puerta',
      sourceLineIds: ['L1'],
      actions: [{ type: 'PLAN_AUDIO', prompt: 'La puerta se abre lentamente y chirría.' }],
    },
    scriptText: '(La puerta se abre lentamente y chirría)',
  });
  assert.equal(draft.kind, 'SFX');
  assert.equal(draft.durationSeconds, 5);
  assert.equal(draft.sourceLineId, 'L1');
  assert.equal(draft.interpretation, 'SCRIPT_COMPILER');
  assert.match(draft.prompt, /^Cue 007, script reference L1\./);
  assert.match(draft.prompt, /wooden door/i);
  assert.match(draft.prompt, /approximately 5 seconds/i);
  assert.doesNotMatch(draft.prompt, /puerta|chirría/i);
  assert.equal(draft.requiresTranslation,false);
});

test('cue sound drafts choose ambience type and duration from a sustained script direction', () => {
  const draft = prepareCueSoundDraft({
    cue: {
      id: 'cue-8', number: '008', label: 'Lluvia',
      sourceLineIds: ['L1'],
      actions: [{ type: 'PLAN_AUDIO', prompt: 'Lluvia constante y viento en el patio.' }],
    },
    scriptText: '(Lluvia constante y viento en el patio)',
  });
  assert.equal(draft.kind, 'ENVIRONMENT');
  assert.equal(draft.durationSeconds, 12);
  assert.match(draft.prompt, /^Cue 008, script reference L1\./);
  assert.match(draft.prompt, /atmospheric bed for approximately 12 seconds/i);
  assert.doesNotMatch(draft.prompt, /Lluvia|viento/i);
  assert.equal(draft.requiresTranslation,false);
});

test('cue sound drafts ignore the generic pending-audio placeholder and use its real source line', () => {
  const draft = prepareCueSoundDraft({
    cue: {
      id: 'cue-9', number: '009', label: 'Theatre atmosphere',
      sourceLineIds: ['L2'],
      actions: [{ type: 'PLAN_AUDIO', prompt: 'Operator sound selection pending' }],
    },
    sourceLines: [{ id: 'L2', text: '(The theatre is dark. A low atmospheric hum rises.)' }],
  });
  assert.equal(draft.sourceLineId, 'L2');
  assert.equal(draft.kind, 'ENVIRONMENT');
  assert.equal(draft.durationSeconds, 12);
  assert.match(draft.prompt, /low atmospheric hum rises/i);
  assert.doesNotMatch(draft.prompt, /selection pending/i);
  assert.equal(draft.requiresTranslation,false);
});

test('cue sound drafts keep an approved idea instead of substituting a different sound from the script line', () => {
  const draft = prepareCueSoundDraft({
    cue: {
      id: 'cue-11', number: '011', label: 'Wind',
      sourceLineIds: ['L1'],
      actions: [{ type: 'PLAN_AUDIO', prompt: 'strong wind between the lighthouse rocks' }],
    },
    scriptText: '(Suena la campana del faro tres veces.)',
  });
  assert.equal(draft.sourceLineId, 'L1');
  assert.equal(draft.interpretation, 'CUE_BRIEF');
  assert.match(draft.prompt, /strong wind between the lighthouse rocks/);
  assert.doesNotMatch(draft.prompt, /bell/i);
  assert.equal(draft.kind, 'ENVIRONMENT');
  assert.equal(draft.requiresTranslation, false);
});

test('cue sound drafts reuse the script compiler when an uncompiled idea names the same sound source', () => {
  for (const idea of ['three clear lighthouse bell strikes', 'Bells tolling at the lighthouse']) {
    const draft = prepareCueSoundDraft({
      cue: {
        id: 'cue-12', number: '012', label: 'Faro',
        sourceLineIds: ['L1'],
        actions: [{ type: 'PLAN_AUDIO', prompt: idea }],
      },
      scriptText: '(Suena la campana del faro tres veces.)',
    });
    assert.equal(draft.interpretation, 'SCRIPT_COMPILER', idea);
    assert.match(draft.prompt, /bell/i, idea);
    assert.match(draft.prompt, /three times/i, idea);
  }
});

test('cue sound drafts still compile the script line when the brief is only the cue label', () => {
  const draft = prepareCueSoundDraft({
    cue: {
      id: 'cue-13', number: '013', label: 'Lighthouse',
      sourceLineIds: ['L1'],
      actions: [{ type: 'PLAN_AUDIO', prompt: 'Lighthouse' }],
    },
    scriptText: '(Suena la campana del faro tres veces.)',
  });
  assert.equal(draft.interpretation, 'SCRIPT_COMPILER');
  assert.match(draft.prompt, /bell/i);
});

test('cue sound drafts do not claim untranslated Spanish cue ideas are English', () => {
  const draft = prepareCueSoundDraft({
    cue: {
      id: 'cue-10', number: '010', label: 'Biblioteca misteriosa',
      sourceLineIds: [],
      actions: [{ type: 'PLAN_AUDIO', prompt: 'Biblioteca misteriosa y silenciosa' }],
    },
  });
  assert.equal(draft.requiresTranslation,true);
  assert.match(draft.prompt,/Biblioteca misteriosa y silenciosa/);
});

test('creak door with slow open moves to low intensity', () => {
  const [proposal] = compile('(La puerta chirría al abrirse despacio)').map(contractFields);
  assert.equal(proposal.action, 'creaks or scrapes while it moves');
  assert.equal(proposal.intensity, 'LOW');
  assert.ok(proposal.explicitElements.some(text => text.includes('«chirría»')));
});

test('phone ringing with exact count surfaces repeat note', () => {
  const [proposal] = compile('(Se toca un timbre eléctrico tres veces)').map(contractFields);
  assert.equal(proposal.soundSource, 'a telephone bell');
  assert.ok(proposal.prompt.includes('The script repeats the event three times.'));
});

test('indoor space and phone detected together', () => {
  const [proposal] = compile('(Dentro del apartamento suena el teléfono)').map(contractFields);
  assert.equal(proposal.acousticSpace.id, 'INDOOR');
  assert.equal(proposal.action, 'rings out');
  assert.ok(proposal.explicitElements.some(text => text.includes('«dentro»')));
});

test('glass break keeps corridor space and material evidence', () => {
  const [proposal] = compile('(Se rompe una copa de cristal en el suelo del pasillo)').map(contractFields);
  assert.equal(proposal.soundSource, 'a crystal drinking glass');
  assert.equal(proposal.acousticSpace.id, 'CORRIDOR');
  assert.equal(proposal.material, 'crystal');
  assert.ok(proposal.explicitElements.some(text => text.includes('de cristal')));
});

test('glassware without impact stays silent (no invented cues)', () => {
  assert.deepEqual(compile('(Una copa de cristal se posa en la mesa)'), []);
});

test('window needs the documented open/close/creak action', () => {
  const [open] = compile('(La ventana se abre con un chirrido prolongado)').map(contractFields);
  assert.equal(open.soundSource, 'a window');
  assert.equal(open.action, 'swings open once');
  assert.deepEqual(compile('(La ventana está en el salón)'), []);
});

test('mirror only compiles with an explicit break', () => {
  const [broken] = compile('(El espejo del vestidor se rompe en mil pedazos)').map(contractFields);
  assert.equal(broken.soundSource, 'a mirror');
  assert.deepEqual(compile('(El espejo del vestidor cuelga en la pared)'), []);
});

test('offstage sounds keep distance and operator caveats', () => {
  const [proposal] = compile('(Dos disparos secos desde fuera de escena)').map(contractFields);
  assert.equal(proposal.soundSource, 'a gunshot');
  assert.equal(proposal.offstage, true);
  assert.ok(proposal.offstageEvidence?.length, 'offstage evidence recorded');
  assert.ok(proposal.prompt.includes('offstage'));
  assert.ok(proposal.prompt.includes('never a foreground event'));
  assert.ok(proposal.uncertainties.some(item => item.includes('fuera de escena')));
});

test('distant sounds surface the far-distance phrase', () => {
  const [proposal] = compile('(Trueno a lo lejos)').map(contractFields);
  assert.equal(proposal.soundSource, 'a thunderclap');
  assert.ok(proposal.prompt.includes('It reaches the room from a distant position'));
});

test('continuous ambience loops and keeps long duration', () => {
  const [proposal] = compile('(Lluvia constante sobre los cristales)').map(contractFields);
  assert.equal(proposal.category, 'ENVIRONMENT');
  assert.equal(proposal.loop, true);
  assert.equal(proposal.suggestedDurationSeconds, 12);
  assert.ok(proposal.prompt.includes('windowpanes'), 'explicit rain-on-glass detail');
});

test('layered ambience: rain wind winds up as one bed', () => {
  const [proposal] = compile('(La lluvia cae con fuerza, y el viento sopla desde el este)').map(contractFields);
  assert.equal(proposal.intensity, 'HIGH');
  assert.ok(proposal.prompt.includes('layered with Steady wind'));
  assert.ok(proposal.explicitElements.some(text => text.includes('viento')));
  assert.equal(proposal.loop, true);
});

test('water ambience pairs sequence with train pass', () => {
  const proposals = compile('(El grifo del baño sigue corriendo mientras el tren pasa)');
  assert.equal(proposals.length, 2);
  const [water, train] = proposals.map(contractFields);
  assert.equal(water.soundSource, 'running water');
  assert.equal(water.loop, true);
  assert.equal(train.soundSource, 'a railway train');
  assert.equal(train.sequence.position, 2);
  assert.equal(train.sequence.total, 2);
  assert.equal(train.sequence.relation, 'STARTS_WITH_PREVIOUS');
  assert.ok(train.sequence.anchorEvidence.includes('mientras'));
});

test('engine start offstage keeps offstage position', () => {
  const [proposal] = compile('(Un motor arranca fuera de escena y luego se aleja)').map(contractFields);
  assert.equal(proposal.soundSource, 'a vehicle engine');
  assert.equal(proposal.offstage, true);
});

test('distant train pass', () => {
  const [proposal] = compile('(El tren cruza el puente a lo lejos)').map(contractFields);
  assert.equal(proposal.soundSource, 'a railway train');
  assert.ok(proposal.prompt.includes('distant position'));
});

test('applause murmur laughter offstage compiles to applauso bed', () => {
  const [proposal] = compile('(Aplausos, murmullos y risas desde bambalinas)').map(contractFields);
  assert.equal(proposal.soundSource, 'applause');
  assert.equal(proposal.offstage, true);
  assert.equal(proposal.loop, true);
  assert.ok(proposal.prompt.includes('ambient audience texture') || proposal.prompt.includes('applause'));
});

test('multi-clause direction splits beats in order with relations', () => {
  const proposals = compile(
    '(Un portazo profundo: luego, unos pasos que se acercan, mientras un silbido se escucha a lo lejos)');
  assert.equal(proposals.length, 3);
  assert.equal(proposals[0].soundSource, 'a wooden door');
  assert.equal(proposals[1].soundSource, 'footsteps');
  assert.equal(proposals[2].soundSource, 'an unspecified percussive stage event');
  assert.equal(proposals[0].sequence.relation, 'FIRST_IN_SEQUENCE');
  assert.equal(proposals[1].sequence.relation, 'SHORT_MOMENT_LATER');
  assert.equal(proposals[1].sequence.anchorEvidence.includes('luego'), true);
  assert.equal(proposals[2].sequence.relation, 'STARTS_WITH_PREVIOUS');
  assert.equal(proposals[2].sequence.anchorEvidence.includes('mientras'), true);
  for (const proposal of proposals) {
    assert.match(proposal.id, /^SPC-test-show-L128-[123]$/);
  }
});

test('knock count on the door keeps human-shout as human caveat', () => {
  const proposals = compile('(Alguien golpea la puerta tres veces y grita algo)');
  assert.equal(proposals.length, 1);
  const [proposal] = proposals.map(contractFields);
  assert.equal(proposal.soundSource, 'a wooden door');
  assert.ok(proposal.prompt.includes('The script repeats the event three times.'));
});

test('furniture fall compiles only with collapse verb', () => {
  const [proposal] = compile('(El crujido de una silla desplomándose en la cocina)').map(contractFields);
  assert.equal(proposal.soundSource, 'a wooden piece of furniture');
  assert.equal(proposal.acousticSpace.id, 'INDOOR');
  assert.deepEqual(compile('(La silla espera junto a la mesa)'), []);
});

test('breath cue understands accented noun', () => {
  const [proposal] = compile('(Una respiración entrecortada sobre el escenario)').map(contractFields);
  assert.equal(proposal.soundSource, 'a human breath or vocal sound');
  assert.ok(proposal.uncertainties.some(item => item.includes('natural')));
});

test('radio song becomes a MUSIC proposal with its model', () => {
  const [proposal] = compile('MÚSICA: una canción de la radio suena en el bar').map(contractFields);
  assert.equal(proposal.category, 'MUSIC');
  assert.equal(proposal.model, MUSIC_MODEL);
  assert.ok(proposal.prompt.includes('radio'));
  assert.ok(proposal.prompt.includes('no sound effects'));
});

test('non-sound stage directions compile to nothing', () => {
  assert.deepEqual(compile('(Pausa)'), []);
  assert.deepEqual(compile('(Ana entra y mira alrededor)'), []);
  assert.deepEqual(compile('(Apagón en el escenario)'), []);
  assert.deepEqual(compile('(Reina el silencio total en la barra)'), []);
});

test('dialogue mention is never accepted as a compile source directly', () => {
  assert.throws(
    () => compileSoundProposals({
      fragment: 'ANA: Oigo pasos en el pasillo', fragmentKind: 'DIALOGUE',
      projectId: 'test-show', sourceLineId: 'L3', mode: 'STRICT',
    }),
    SoundPromptCompilerError,
  );
});

test('inline directional span compiles with corridor context', () => {
  const [proposal] = compile(
    'ANAfirme: (al público) No me niego. (Se escucha un silbido muy tenue en el pasillo) Y sigo.',
    { fragmentKind: 'INLINE_DIRECTION', sourceLineId: 'L41' });
  assert.equal(proposal.fragmentKind, 'INLINE_DIRECTION');
  assert.equal(proposal.scriptReference, 'L41');
  assert.equal(proposal.acousticSpace.id, 'CORRIDOR');
});

test('sequence overflow beyond four beats surfaces uncertainty', () => {
  const proposals = compile(
    '(La puerta se abre, luego la otra puerta se estremece, después cae algo pesado sin nombre, ' +
    'mientras suenan pasos que se alejan, y al mismo tiempo estalla una detonación)');
  assert.equal(proposals.length, MAX_SEQUENCE_BEATS);
  const combined = proposals.map(p => p.uncertainties.join(' ')).join(' ');
  assert.ok(combined.includes('sin propuesta'));
  assert.ok(proposals.every(p => p.sequence.total === MAX_SEQUENCE_BEATS));
  assert.equal(proposals[1].id, 'SPC-test-show-L128-2');
  assert.equal(proposals[3].id, 'SPC-test-show-L128-4');
});

test('strict and creative modes diverge only through tainted extras', () => {
  const fragment = '(Portazo fuerte)';
  const strict = compile(fragment);
  const creative = compile(fragment, { mode: 'CREATIVE' });
  assert.equal(strict[0].soundSource, 'a wooden door');
  assert.equal(strict[0].mode, 'STRICT');
  assert.equal(creative[0].mode, 'CREATIVE');
  assert.ok(creative[0].inferences.some(item => item.includes('creativo')));
  assert.ok(creative[0].prompt.includes('inferred; verify on audition'));
  // Strict never carries creative enrichment.
  assert.equal(strict[0].prompt.includes('inferred; verify'), false);
  // Shared fields are equal across modes.
  for (const key of ['soundSource', 'action', 'intensity', 'acousticSpace', 'offstage']) {
    assert.deepEqual(strict.map(p => p[key]), creative.map(p => p[key]));
  }
});

test('compiling twice builds deterministic identical proposals', () => {
  const fragment = '(La puerta chirría al abrirse despacio)';
  const first = compile(fragment);
  const second = compile(fragment);
  assert.deepEqual(JSON.stringify(first), JSON.stringify(second));
});

test('normalizeCompileMode validates input', () => {
  assert.equal(normalizeCompileMode('STRICT'), 'STRICT');
  assert.equal(normalizeCompileMode('CREATIVE'), 'CREATIVE');
  assert.throws(() => normalizeCompileMode('AUTO'), SoundPromptCompilerError);
  assert.throws(() => normalizeCompileMode(null), SoundPromptCompilerError);
});

test('compile rejects missing or oversized fragments', () => {
  assert.throws(() => compileSoundProposals({ fragment: '  ' }), SoundPromptCompilerError);
  assert.throws(
    () => compileSoundProposals({ fragment: 'x'.repeat(801) }),
    SoundPromptCompilerError,
  );
  assert.throws(
    () => compileSoundProposals({ fragment: '(Portazo)', sourceLineId: 'Q3' }),
    SoundPromptCompilerError,
  );
});

test('recompileProposal switches mode while preserving identifiers', () => {
  const [original] = compile('(Una respiración entrecortada sobre el escenario)');
  const creative = recompileProposal(original, { mode: 'CREATIVE' });
  assert.equal(creative.id, original.id);
  assert.equal(creative.mode, 'CREATIVE');
  assert.ok(creative.inferences.length >= original.inferences.length);
  const strictAgain = recompileProposal(creative, { mode: 'STRICT' });
  assert.equal(strictAgain.mode, 'STRICT');
  assert.equal(strictAgain.soundSource, original.soundSource);
  assert.equal(strictAgain.prompt, original.prompt);
});

test('recompileProposal restores the compiled proposal after operator edits', () => {
  const [original] = compile('(Portazo fuerte)');
  const edited = applyProposalEdits(original, {
    intensity: 'LOW', soundSource: 'a heavy door', suggestedDurationSeconds: 8,
  });
  assert.equal(edited.fieldProvenance.intensity, 'OPERATOR');
  assert.equal(edited.fieldProvenance.soundSource, 'OPERATOR');
  assert.equal(edited.suggestedDurationSeconds, 8);
  assert.equal(edited.prompt, buildPromptFromFields(edited));
  const restored = recompileProposal(edited, { mode: 'STRICT' });
  assert.equal(restored.intensity, 'HIGH');
  assert.equal(restored.soundSource, 'a wooden door');
  assert.equal(restored.prompt, original.prompt);
  // Id lineage is preserved across recompile.
  assert.equal(restored.id, original.id);
});

test('applyProposalEdits gates and clamps values', () => {
  const [proposal] = compile('(Portazo fuerte)');
  assert.throws(
    () => applyProposalEdits(proposal, { color: 'amber' }),
    SoundPromptCompilerError,
  );
  assert.throws(
    () => applyProposalEdits(proposal, { suggestedDurationSeconds: 99 }),
    SoundPromptCompilerError,
  );
  assert.throws(
    () => applyProposalEdits(proposal, { suggestedDurationSeconds: 0 }),
    SoundPromptCompilerError,
  );
  assert.equal(
    applyProposalEdits(proposal, { suggestedDurationSeconds: 3.7 }).suggestedDurationSeconds, 4);
  assert.equal(applyProposalEdits(proposal, { loop: true }).loop, true);
  assert.equal(applyProposalEdits(proposal, { intensity: 'VERY_HIGH' }).intensity, 'VERY_HIGH');
  assert.throws(
    () => applyProposalEdits(proposal, { intensity: 'ULTRA' }),
    SoundPromptCompilerError,
  );
  assert.throws(
    () => applyProposalEdits(proposal, { category: 'AMBIENT' }),
    SoundPromptCompilerError,
  );
  const musicSwitch = applyProposalEdits(proposal, { category: 'MUSIC' });
  assert.equal(musicSwitch.category, 'MUSIC');
  assert.equal(musicSwitch.model, MUSIC_MODEL);
});

test('hand-written prompts are never regressed by structured edits', () => {
  const [proposal] = compile('(Portazo fuerte)');
  const handwritten = applyProposalEdits(proposal, { prompt: 'A distinctive heavy wooden slam.' });
  assert.equal(handwritten.prompt, 'A distinctive heavy wooden slam.');
  assert.equal(handwritten.promptEdited, true);
  const retuned = applyProposalEdits(handwritten, { intensity: 'LOW' });
  assert.equal(retuned.prompt, 'A distinctive heavy wooden slam.');
});

test('buildPromptFromFields handles article and mass-noun labels', () => {
  const [proposal] = compile('(Portazo fuerte)');
  const relabeled = applyProposalEdits(proposal, { soundSource: 'a wooden door' });
  const prompt = buildPromptFromFields({ ...relabeled, action: 'slams shut' });
  assert.ok(prompt.startsWith('A wooden door slams shut.'), prompt);
  const footfares = buildPromptFromFields({ ...relabeled, soundSource: 'footsteps', action: 'recede' });
  assert.ok(footfares.includes('A sound of footsteps'), footfares);
  const articleFree = buildPromptFromFields({ ...relabeled, soundSource: 'the iron door', action: 'clanks' });
  assert.ok(articleFree.startsWith('An iron door clanks.'), articleFree);
});

test('ambiguous named-less sources stay flagged for the operator', () => {
  const [generic] = compile('(Se oye un portazo lejano de algo sin nombre)').map(contractFields);
  assert.ok(generic.soundSource.length > 0);
  const [unidentified] = compile('(Se cae algo en la trastienda)').map(contractFields);
  assert.equal(unidentified.soundSource, 'an unidentified falling object');
  assert.ok(unidentified.uncertainties.some(item => item.includes('no nombra')));
});

/* ------------------------------------------------------------------ */
/* buildShowSoundCandidates: show-level scanning                        */
/* ------------------------------------------------------------------ */

const SAMPLE_SCRIPT = [
  'ESCENA PRIMERA. EL PORTON',
  '(La puerta se cierra de golpe)',
  'ANA: ¿Escuchaste ese portazo?',
  '(Trueno a lo lejos, mientras la lluvia cae con fuerza)',
  'LUIS: La tormenta me asusta.',
  'LUCES: apagón parcial en el vestidor',
  '(Se rompe una copa de cristal y luego pasos que se acercan, mientras la puerta chirría)',
].join('\n');

test('buildShowSoundCandidates scans stage directions with L# references', () => {
  const scan = buildShowSoundCandidates(SAMPLE_SCRIPT);
  assert.ok(Array.isArray(scan.candidates));
  assert.ok(scan.candidates.length >= 3);
  const byLine = new Map(scan.candidates.map(item => [item.lineId, item]));
  assert.ok(byLine.get('L2'));
  assert.equal(byLine.get('L2').role, 'STAGE_DIRECTION');
  assert.equal(byLine.get('L2').soundSummary, 'a wooden door');
  assert.ok(byLine.get('L4'));
  assert.ok(byLine.get('L7'));
  // Dialogue and non-sound lines are skipped with explicit reasons.
  const reasons = new Map(scan.skipped.map(item => [item.lineId, item.reason]));
  assert.equal(reasons.get('L3'), 'DIALOGUE_MENTION_NOT_STAGE_AUDIO');
  assert.equal(reasons.get('L5'), 'DIALOGUE_MENTION_NOT_STAGE_AUDIO');
  assert.equal(reasons.get('L6'), 'NO_ACOUSTIC_EXPRESSION');
  // Every candidate keeps the original trimmed acotación text.
  assert.equal(byLine.get('L2').text.startsWith('(La puerta'), true);
});

test('buildShowSoundCandidates rejects non-string scripts', () => {
  assert.throws(() => buildShowSoundCandidates(42), SoundPromptCompilerError);
});

test('approved cue details survive compilation in English or are flagged for review, never silently dropped', () => {
  const script = 'FARERO: Ya llega la niebla.\n(Suena la campana del faro tres veces)';
  const draftFor = idea => prepareCueSoundDraft({
    cue: { id: 'cue-20', number: 20, label: 'Campana', sourceLineIds: ['L2'], actions: [{ type: 'PLAN_AUDIO', prompt: idea }] },
    scriptText: script,
  });
  const cases = [
    ['tres toques claros de campana de faro', [/three times/, /\bclear\b/, /lighthouse/]],
    ['pasos lentos sobre madera vieja que cruje', [/footsteps/, /\bslow\b/, /\bwood/, /\bold\b/, /creak/]],
    ['un portazo seco y violento', [/door/, /\bdry\b/, /violent/]],
    ['campana de faro lejana con eco metálico', [/distant/, /lighthouse/, /metallic/, /echo/]],
    ['three clear lighthouse bell strikes', [/three times/, /\bclear\b/, /lighthouse/, /\bstrikes?\b/]],
  ];
  for (const [idea, expected] of cases) {
    const draft = draftFor(idea);
    assert.equal(draft.interpretation, 'SCRIPT_COMPILER', idea);
    for (const pattern of expected) assert.match(draft.prompt, pattern, idea);
    assert.doesNotMatch(draft.prompt, /\b(?:campana|faro|madera|seco|lejana|cruje)\b/i, idea);
    assert.deepEqual(draft.untranslatedDetail, [], idea);
  }
  const unknown = draftFor('campana del faro con zumbido de abejorros');
  assert.deepEqual(unknown.untranslatedDetail, ['abejorros']);
  assert.doesNotMatch(unknown.prompt, /abejorros/);
  assert.deepEqual(approvedDetailCoverage('Lighthouse', 'A bell').add, ['lighthouse']);
  // Operational vocabulary, character names and idioms are neither false alarms nor mistranslated.
  const operational = draftFor('reproducir lluvia de fondo grabada, en loop');
  assert.deepEqual(operational.untranslatedDetail, []);
  assert.match(operational.prompt, /background/);
  assert.deepEqual(draftFor('JULIO cierra la puerta con un golpe seco').untranslatedDetail, []);
  assert.doesNotMatch(draftFor('JULIO cierra la puerta con un golpe seco').prompt, /julio/i);
  const gust = draftFor('un golpe de viento procesado');
  assert.match(gust.prompt, /\bgust\b/);
  assert.doesNotMatch(gust.prompt, /knock/i);
  // Idioms and verb morphology resolve to the intended sense instead of a literal noun.
  const slam = draftFor('la puerta de un coche que se cierra de golpe');
  assert.match(slam.prompt, /slammed/);
  assert.doesNotMatch(slam.prompt, /knock/i);
  assert.match(draftFor('pasos lentos y arrastrados en un sótano húmedo').prompt, /dragging/);
  assert.match(draftFor('una botella de vidrio rueda por el suelo').prompt, /rolling/);
  assert.doesNotMatch(draftFor('una botella de vidrio rueda por el suelo').prompt, /wheels/);
  const coverage = approvedDetailCoverage('pasos lentos sobre grava', 'Slow footsteps on gravel.');
  assert.deepEqual(coverage.add, []);
  assert.deepEqual(coverage.untranslated, []);
  assert.deepEqual(coverage.rendered, ['pasos', 'lentos', 'grava']);
});
