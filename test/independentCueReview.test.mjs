import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewExplicitAudioDirections } from '../src/core/independentCueReview.mjs';

function scope(texts) {
  return { windows: [{ id: 'S1-W1', coreLines: texts.map((text, index) => ({
    id: 'L' + (index + 1), text,
  })) }] };
}
test('flags only unaddressed explicit sound directions for human review', () => {
  const source = scope([
    'ESCENA 1', 'ACTOR: Escucha, el sonido del tren.', 'FX: campanada lejana',
    '(SONIDO: lluvia fuerte)', 'LX: fade to black', '[MUSIC: salida]', 'Una puerta se cierra.',
  ]);
  const result = reviewExplicitAudioDirections(source, [{ sourceLineId:'L3', transport:'PLAY' }]);
  assert.deepEqual(result, { reviewFlags:['L4','L6'], totalUnreviewed:2 });
});
test('STOP/SILENCE observations count as addressed; never demand PLAY', () => {
  assert.deepEqual(reviewExplicitAudioDirections(scope(['AUDIO: fade out']), [
    { sourceLineId:'L1', transport:'STOP' },
  ]), { reviewFlags:[], totalUnreviewed:0 });
});
test('empty result returns explicit review hints rather than inventing cues', () => {
  assert.deepEqual(reviewExplicitAudioDirections(scope(['(FX: golpe)', 'DIALOGUE: hello']), []),
    { reviewFlags:['L1'], totalUnreviewed:1 });
});
test('review bounds flags without hiding the total', () => {
  const texts = Array.from({length:30},(_,i)=>'SFX: sound '+i);
  const result = reviewExplicitAudioDirections(scope(texts), []);
  assert.equal(result.totalUnreviewed,30);
  assert.equal(result.reviewFlags.length,16);
});
test('rejects out-of-scope items and invalid snapshots', () => {
  assert.throws(()=>reviewExplicitAudioDirections(scope(['FX: bell']), [{sourceLineId:'L2'}]), TypeError);
  assert.throws(()=>reviewExplicitAudioDirections(null,[]), TypeError);
});
