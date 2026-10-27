/**
 * Rights-clear synthetic audio + short theatre script for judges and offline tests.
 * No external assets, paid API, user files, voice clone, or source from older app.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNewShow, addAudioReference, addMockProposal, decideProposal } from '../src/core/workspace.mjs';
import { exportPortableShow } from '../src/core/showArchive.mjs';

export const DEMO_FILE = 'demo/SHOWCOMPILER_SHOW_DEMO.showcompiler.zip';
export const DEMO_SCRIPT = [
  'SCENE 1 — THE LAST CUE',
  '(The theatre is dark. A low atmospheric hum rises.)',
  'NORA: We have ninety seconds to choose the winning project.',
  'ALEX: And we are still debating.',
  '(One bell rings. The clock is running out.)',
  'NORA: What if the tool could read this script and prepare our cues?',
  'ALEX: Then I could focus on the performance, not on dragging files.',
  '(A bright musical transition reveals the final decision.)',
  'NORA: The cue is prepared. The human operator chooses GO.',
  'ALEX: Good. An algorithm must never fire the PA on its own.',
  '(Blackout.)',
].join('\n');

function pcmWav(duration, generator) {
  if (typeof generator !== 'function' || !Number.isFinite(duration) ||
      duration <= 0 || duration > 20) throw new TypeError('Invalid synthetic sound');
  const rate = 44_100;
  const count = Math.round(rate * duration);
  const out = new Uint8Array(44 + count * 2);
  const header = new DataView(out.buffer);
  const str = (offset, text) => {
    for (let index = 0; index < text.length; index++) out[offset + index] = text.charCodeAt(index);
  };
  str(0, 'RIFF');
  header.setUint32(4, out.length - 8, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  header.setUint32(16, 16, true);
  header.setUint16(20, 1, true);  // PCM
  header.setUint16(22, 1, true);  // Mono; browser playback is stereo-compatible.
  header.setUint32(24, rate, true);
  header.setUint32(28, rate * 2, true);
  header.setUint16(32, 2, true);
  header.setUint16(34, 16, true);
  str(36, 'data');
  header.setUint32(40, count * 2, true);
  for (let frame = 0; frame < count; frame++) {
    const time = frame / rate;
    const envelope = Math.min(1, time / 0.025, (duration - time) / 0.2);
    const level = Math.max(0, Math.min(1, envelope));
    const sample = Math.max(-0.85, Math.min(0.85, generator(time) * level));
    header.setInt16(44 + frame * 2, Math.round(sample * 32767), true);
  }
  return out;
}

function atmosphere() {
  let noise = 0x1234abcd;
  return pcmWav(7, t => {
    noise ^= noise << 13;
    noise ^= noise >>> 17;
    noise ^= noise << 5;
    const white = (noise >>> 0) / 0x100000000 * 2 - 1;
    const drone = Math.sin(2 * Math.PI * 110 * t) * 0.07 +
      Math.sin(2 * Math.PI * 165 * t) * 0.025;
    return drone + white * 0.014;
  });
}
function bell() {
  return pcmWav(2.8, t => {
    const decay = Math.exp(-2 * t);
    return decay * (
      0.29 * Math.sin(2 * Math.PI * 740 * t) +
      0.16 * Math.sin(2 * Math.PI * 1480.2 * t) +
      0.07 * Math.sin(2 * Math.PI * 2146 * t)
    );
  });
}
function transition() {
  return pcmWav(5.5, t => {
    const notes = [261.63, 329.63, 392.0, 523.25];
    const pulse = 0.75 + 0.25 * Math.sin(2 * Math.PI * 3 * t);
    return notes.reduce((mix, frequency, index) => {
      const fade = Math.min(1, Math.max(0, (t - index * 0.35) / 0.4));
      return mix + Math.sin(2 * Math.PI * frequency * t) * fade * pulse * 0.065;
    }, 0);
  });
}
function memoryFile(name, samples) {
  return {
    name,
    size: samples.length,
    async arrayBuffer() { return samples.buffer.slice(samples.byteOffset, samples.byteOffset + samples.byteLength); },
  };
}

export async function buildDemoPackage() {
  let show = createNewShow({
    id: 'showcompiler-demo-2026',
    name: 'The Last Cue — Hackathon demonstration',
    scriptText: DEMO_SCRIPT,
  });
  const sounds = [
    ['01_atmosphere.wav', atmosphere(), 'L2', 'Quiet opening atmosphere'],
    ['02_clock_bell.wav', bell(), 'L5', 'One clock bell'],
    ['03_finale.wav', transition(), 'L8', 'Triumphant musical transition'],
  ];
  const originals = new Map();
  for (const [filename, wav, lineId, label] of sounds) {
    show = addAudioReference(show, filename);
    const assetId = show.assets.at(-1).id;
    originals.set(assetId, memoryFile(filename, wav));
    show = addMockProposal(show, { lineId, assetId, label });
    show = decideProposal(show, show.proposals.at(-1).id, 'APPROVE');
  }
  // Honest provenance: every DEMO cue is an authored/manual fixture,
  // never an actual AI result. No cues are played while generating the ZIP.
  return { archive: await exportPortableShow(show, originals), project: show };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = resolve(DEMO_FILE);
  const { archive, project } = await buildDemoPackage();
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, archive);
  console.log('Saved complete, rights-clear local example: ' + output);
  console.log(project.cues.length + ' operator-approved manual example cues and ' +
    project.assets.length + ' original synthetic WAV files. NO Meta AI request or automatic GO.');
}
