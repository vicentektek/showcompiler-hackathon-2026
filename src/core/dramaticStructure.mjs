/**
 * Source-preserving structural context for script-based AI analysis.
 *
 * Inspired by TEI performance text distinctions and research on structural
 * classification with contextual labels. These are deterministic, deliberately
 * conservative hints, NOT a trained stage-direction classifier, a cue extractor,
 * a source of operator commands or a persistent project representation.
 */
import { parseScript } from './script.mjs';
import { isSceneHeading } from './sceneAnalysis.mjs';

const TECHNICAL = /^(?:(?:SFX|FX|SOUND|SONIDO|AUDIO|MUSIC|MÚSICA|MUSIQUE|LX|LIGHTING|LUCES|LIGHT|VIDEO|VÍDEO|STAGE|ESCENA\s+TÉCNICA)\s*(?:[#-]?\s*\d{1,3})?\s*:)\s*(.*)$/iu;
const INLINE_SPEAKER = /^([\p{Lu}][\p{Lu}\p{M}\p{N}.'\u2019 -]{0,44})\s*:\s*(.*)$/u;
const STANDALONE_SPEAKER = /^[\p{Lu}][\p{Lu}\p{M}\p{N}.'\u2019 -]{0,39}$/u;
const CAST_ENTRY = /^[\p{Lu}][\p{Lu}\p{M}\p{N} .'’]{0,45}\s*\([^)]{2,80}\)\s*:/u;
const SCENE_WRAPPED = /^[\[(]\s*(?:ESCENA|SCENE|SCÈNE|SZENE|CENA|ACTO|ACT|ACTE|CUADRO|TABLEAU)\s+(?:[0-9IVXLCDM]+|ÚNICA|UNICA|UNIQUE|ONE|TWO|THREE|PRIMERA|SEGUNDA)\s*[\])]$/iu;
const DIRECTION = /^(?:\([\s\S]*\)|\[[\s\S]*\])$/u;
const RUNDOWN = /^(?:(?:BLOQUE|BLOCK|SEGMENT)\s*\d+\b|(?:\d{1,2}:)?\d{2}:\d{2}\b).*?\|/iu;
const STOP_MARKERS = new Set(['FIN', 'END', 'TELÓN', 'TELON', 'CURTAIN', 'BLACKOUT', 'OSCRO', 'OSCURO']);
const RESERVED = new Set([
  'PERSONAJES', 'PERSONAGES', 'CHARACTERS', 'CAST', 'ESCENOGRAFÍA',
  'ESCENOGRAFIA', 'SETTING', 'ACOTACIONES', 'SOUND', 'SONIDO', 'FX',
  'MÚSICA', 'MUSICA', 'MUSIC', 'VIDEO', 'VÍDEO', 'LIGHT', 'LUCES',
  'ACTO', 'ACT', 'ESCENA', 'SCENE', 'TELÓN', 'TELON', 'FIN', 'END',
  'BLACKOUT', 'OSCURO', 'PRÓLOGO', 'PROLOGO', 'EPÍLOGO', 'EPILOGO',
]);
const EMPTY_RESULT = Object.freeze({ speaker: null, spokenText: null });

function isHeader(value) {
  return isSceneHeading(value) || SCENE_WRAPPED.test(value);
}

function speakerName(value) {
  if (!value || !STANDALONE_SPEAKER.test(value) || value.length > 40 ||
      value.split(/\s+/u).length > 4 || /[0-9]/u.test(value)) return null;
  const upper = value.toLocaleUpperCase();
  if (value !== upper || RESERVED.has(upper) || STOP_MARKERS.has(upper) ||
      isHeader(value)) return null;
  return value;
}

function classifiedRole(text, index, firstSceneIndex) {
  const trimmed = text.trim();
  if (!trimmed) return 'BLANK';
  if (isHeader(trimmed)) return 'SCENE_HEADING';
  if (TECHNICAL.test(trimmed)) return 'TECHNICAL_DIRECTION';
  if (RUNDOWN.test(trimmed)) return 'RUNNING_ORDER_ROW';
  if (STOP_MARKERS.has(trimmed.toLocaleUpperCase().replace(/\.$/u, ''))) return 'STAGE_DIRECTION';
  if (DIRECTION.test(trimmed)) return 'STAGE_DIRECTION';
  if (firstSceneIndex > index && CAST_ENTRY.test(trimmed)) return 'CAST_ENTRY';
  return 'UNMARKED_TEXT';
}

/**
 * A line-by-line description which preserves the exact L# source IDs.
 *
 * Speaker labels on their own lines are recognized when surrounded by body
 * dialogue (even when an intermediate parenthesized direction is present).
 * Ambiguous lines remain UNMARKED_TEXT: no cue is ever inferred from keywords.
 */
export function annotateDramaticStructure(scriptText) {
  const lines = parseScript(scriptText);
  const firstSceneIndex = lines.findIndex(line => isHeader(line.text.trim()));
  const lastFirstScene = firstSceneIndex < 0 ? 0 : firstSceneIndex;
  let activeSpeaker = null;
  const annotated = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const raw = line.text.trim();
    let role = classifiedRole(line.text, index, firstSceneIndex);
    let speaker = null;
    let spokenText = null;

    if (role === 'SCENE_HEADING') {
      activeSpeaker = null;
    } else if (role === 'TECHNICAL_DIRECTION' || role === 'RUNNING_ORDER_ROW') {
      // Administrative/technical lines terminate implicit dialogue tracking.
      activeSpeaker = null;
    } else if (role === 'UNMARKED_TEXT') {
      const inline = INLINE_SPEAKER.exec(raw);
      const inlineName = inline?.[1] ? speakerName(inline[1].trim()) : null;
      if (inlineName && inline[2].trim() &&
          (firstSceneIndex < 0 || index >= lastFirstScene)) {
        role = 'DIALOGUE';
        speaker = inlineName;
        spokenText = inline[2];
        activeSpeaker = speaker;
      } else {
        const standalone = speakerName(raw);
        const next = lines.slice(index + 1).find(nextLine => nextLine.text.trim());
        const nextRaw = next?.text?.trim() ?? '';
        const potentialSpeech = Boolean(nextRaw) &&
          !isHeader(nextRaw) && !TECHNICAL.test(nextRaw) &&
          !RUNDOWN.test(nextRaw);
        if (standalone && potentialSpeech &&
            (firstSceneIndex < 0 || index >= lastFirstScene)) {
          role = 'SPEAKER_LABEL';
          speaker = standalone;
          activeSpeaker = standalone;
        } else if (activeSpeaker !== null && (firstSceneIndex < 0 || index >= lastFirstScene)) {
          role = 'DIALOGUE';
          speaker = activeSpeaker;
          spokenText = line.text;
        }
      }
    } else if (role === 'STAGE_DIRECTION' && STOP_MARKERS.has(raw.toLocaleUpperCase().replace(/\.$/u, ''))) {
      activeSpeaker = null;
    }
    // Empty and bracketed directions inside a speech do not erase its speaker.
    annotated.push({
      lineId: line.id,
      lineNumber: line.lineNumber,
      text: line.text,
      role,
      speaker,
      spokenText,
      ...EMPTY_RESULT,
      ...(speaker === null ? {} : { speaker }),
      ...(spokenText === null ? {} : { spokenText }),
    });
  }

  return { totalLines: annotated.length, lines: annotated };
}
