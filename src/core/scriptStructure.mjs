/**
 * Conservative structural annotations for theatrical scripts and running orders.
 *
 * Pure, read-only metadata: no cues, model requests or audio actions are created.
 * Text, line IDs, spelling and line order always come from the original script.
 */
import { parseScript } from './script.mjs';
import { planScriptAnalysis, isSceneHeading } from './sceneAnalysis.mjs';

const TECHNICAL = /^(SFX|FX|SOUND|SONIDO|AUDIO|MUSIC|MÚSICA|LX|LIGHTING|LUCES|VIDEO|VÍDEO)(?:\s*[#-]?\s*\d{1,3})?\s*:\s*(.*)$/iu;
const SPEAKER = /^([\p{Lu}][\p{Lu}\p{M}\p{N} .'\u2019-]{0,39})\s*:\s*(.*)$/u;
const DIRECTION = /^(?:\([\s\S]*\)|\[[\s\S]*\])$/u;

function annotateLine(line, sceneId) {
  const source = line.text.trim();
  const base = {
    lineId: line.id,
    lineNumber: line.lineNumber,
    text: line.text,
    sceneId,
    role: 'UNMARKED_TEXT',
    speaker: null,
    spokenText: null,
  };
  if (!source) return { ...base, role: 'BLANK' };
  if (isSceneHeading(source)) return { ...base, role: 'SCENE_HEADING' };
  const technical = TECHNICAL.exec(source);
  if (technical) return { ...base, role: 'TECHNICAL_DIRECTION' };
  if (DIRECTION.test(source)) return { ...base, role: 'STAGE_DIRECTION' };
  const dialogue = SPEAKER.exec(source);
  if (dialogue && dialogue[1].trim() === dialogue[1].trim().toLocaleUpperCase()) {
    return {
      ...base,
      role: 'DIALOGUE',
      speaker: dialogue[1].trim(),
      spokenText: dialogue[2],
    };
  }
  // Ambiguous uppercase standalone headings / names remain unmarked.
  // In particular, no acoustic word search ever manufactures a cue.
  return base;
}

/**
 * Return per-line evidence and scene association suitable for model context.
 * The output is ephemeral and never changes persisted show JSON.
 */
export function analyzeScriptStructure(scriptText) {
  const lines = parseScript(scriptText);
  const plan = planScriptAnalysis(scriptText);
  const sceneByLine = new Map();
  for (const scene of plan.scenes) {
    const first = Number(scene.startLineId.slice(1));
    const last = Number(scene.endLineId.slice(1));
    for (let index = first; index <= last; index += 1) {
      sceneByLine.set('L' + index, scene.id);
    }
  }
  const annotated = lines.map(line => annotateLine(line, sceneByLine.get(line.id) ?? null));
  return {
    lines: annotated,
    scenes: plan.scenes.map(scene => ({
      sceneId: scene.id,
      headingLineId: scene.headingLineId,
      headingText: scene.headingText,
      startLineId: scene.startLineId,
      endLineId: scene.endLineId,
    })),
    totalLines: annotated.length,
  };
}
