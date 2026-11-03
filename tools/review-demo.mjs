#!/usr/bin/env node
/** Interactive, terminal-only proof of the review gate. Uses a MOCK suggestion. */
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { parseScript } from '../src/core/script.mjs';
import { validateCueProposals } from '../src/core/proposals.mjs';
import { reviewCueProposal } from '../src/core/review.mjs';

const script = readFileSync(new URL('../examples/escena-prueba.txt', import.meta.url), 'utf8');
const scriptLines = parseScript(script);
const assetIds = ['mock-intro.wav']; // Illustrative ID only; no audio file or playback.
const mockSuggestions = [{
  id: 'mock-proposal-1',
  label: 'Ambiente de apertura',
  sourceLineIds: ['L2'],
  actions: [{ type: 'PLAY', assetId: 'mock-intro.wav' }],
}];
const validated = validateCueProposals(mockSuggestions, scriptLines, assetIds);
if (!validated.valid) {
  console.error('Validación fallida:', validated.errors);
  process.exitCode = 1;
} else {
  console.log('DEMOSTRACIÓN LOCAL — SIN IA REAL NI REPRODUCCIÓN DE AUDIO');
  console.log('Referencia: ' + validated.proposals[0].sourceLineIds.join(', ') + ' — ' + scriptLines[1].text);
  console.log('Propuesta simulada: ' + validated.proposals[0].label);
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await prompt.question('Escribe APROBAR para crear un borrador; cualquier otra respuesta rechaza: ')).trim();
    const approved = answer.toUpperCase() === 'APROBAR';
    const result = reviewCueProposal({
      proposal: validated.proposals[0],
      decision: approved ? 'APPROVE' : 'REJECT',
      scriptLines, assetIds, existingCues: [], cueId: 'cue-demo-1',
      operatorConfirmed: approved, // Derived only from terminal operator input.
    });
    if (!result.ok) {
      console.error('Revisión fallida:', result.error);
      process.exitCode = 1;
    } else {
      console.log(JSON.stringify({ decision: result.reviewedProposal.status, cue: result.cue }, null, 2));
      console.log('No se ha ejecutado ninguna orden de audio.');
    }
  } finally {
    prompt.close();
  }
}
