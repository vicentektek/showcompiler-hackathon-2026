/**
 * Deterministic scene/window planning for model analysis.
 *
 * Every parsed source line belongs to exactly one window as a core line.
 * Context lines are read-only copies and never change the authoritative source.
 */
import { parseScript } from './script.mjs';

export const DEFAULT_MAX_CORE_LINES = 60;
export const DEFAULT_CONTEXT_LINES = 3;

const MAX_ALLOWED_CORE_LINES = 120;
const MAX_ALLOWED_CONTEXT_LINES = 10;
const HEADING_WORDS = new Set([
  'SCENE', 'ESCENA', 'SZENE', 'CENA',
  'ACT', 'ACTO', 'ACTE', 'AKT', 'ATO',
  'TABLEAU', 'CUADRO',
]);
const HEADING_NUMBERS = new Set([
  'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE',
  'FIRST', 'SECOND', 'THIRD', 'FOURTH', 'FIFTH',
  'PRIMERA', 'PRIMERO', 'SEGUNDA', 'SEGUNDO', 'TERCERA', 'TERCERO',
  'UNE', 'UN', 'DEUX', 'TROIS', 'QUATRE', 'CINQ',
  'EINS', 'ZWEI', 'DREI', 'VIER', 'FUNF',
  'UM', 'UMA', 'DOIS', 'DUAS', 'TRES', 'QUATRO', 'CINCO',
]);

function normalizedHeadingText(text) {
  return text.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

/** Conservatively recognize common theatre headings and INT./EXT. slug lines. */
export function isSceneHeading(text) {
  if (typeof text !== 'string') return false;
  const value = normalizedHeadingText(text);
  if (!value || value.length > 120) return false;
  if (/^(?:INT|EXT)\.(?:\/(?:INT|EXT)\.)?(?:\s|$)/.test(value)) return true;

  const match = /^([A-Z]+)(?:\s+([^\s:.-]+))?(?:\s*[:.\-\u2013\u2014].*)?$/.exec(value);
  if (!match || !HEADING_WORDS.has(match[1])) return false;
  if (match[2] === undefined) return true;
  return /^\d+$/.test(match[2]) || /^[IVXLCDM]+$/.test(match[2]) || HEADING_NUMBERS.has(match[2]);
}

function copyLine(line) {
  return { id: line.id, lineNumber: line.lineNumber, text: line.text };
}

function validateOptions(options) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('Scene analysis options must be an object');
  }
  const maxCoreLines = options.maxCoreLines ?? DEFAULT_MAX_CORE_LINES;
  const contextLines = options.contextLines ?? DEFAULT_CONTEXT_LINES;
  if (!Number.isSafeInteger(maxCoreLines) || maxCoreLines < 1 || maxCoreLines > MAX_ALLOWED_CORE_LINES) {
    throw new RangeError(`maxCoreLines must be an integer from 1 to ${MAX_ALLOWED_CORE_LINES}`);
  }
  if (!Number.isSafeInteger(contextLines) || contextLines < 0 || contextLines > MAX_ALLOWED_CONTEXT_LINES) {
    throw new RangeError(`contextLines must be an integer from 0 to ${MAX_ALLOWED_CONTEXT_LINES}`);
  }
  return { maxCoreLines, contextLines };
}

/**
 * Plan scene-aware, bounded analysis windows without changing the source text.
 * The returned DTO is transient analysis metadata, not project persistence data.
 */
export function planScriptAnalysis(scriptText, options = {}) {
  if (typeof scriptText !== 'string') throw new TypeError('Scene analysis needs script text');
  const { maxCoreLines, contextLines } = validateOptions(options);
  const lines = parseScript(scriptText);

  const sceneStarts = [0];
  let hasFirstHeading = isSceneHeading(lines[0]?.text ?? '');
  for (let index = 1; index < lines.length; index += 1) {
    if (!isSceneHeading(lines[index].text)) continue;
    if (!hasFirstHeading) {
      // Titles, character lists and scenic setup are context for the FIRST
      // theatrical scene, not a billable "scene zero" with no real cues.
      hasFirstHeading = true;
      continue;
    }
    sceneStarts.push(index);
  }

  const scenes = [];
  const windows = [];
  const coveredLineIds = [];
  for (let sceneIndex = 0; sceneIndex < sceneStarts.length; sceneIndex += 1) {
    const sceneStart = sceneStarts[sceneIndex];
    const sceneEnd = (sceneStarts[sceneIndex + 1] ?? lines.length) - 1;
    const sceneId = `S${sceneIndex + 1}`;
    const heading = lines.slice(sceneStart, sceneEnd + 1)
      .find(line => isSceneHeading(line.text)) ?? null;
    const windowIds = [];
    let sceneWindowIndex = 0;

    for (let coreStart = sceneStart; coreStart <= sceneEnd; coreStart += maxCoreLines) {
      const coreEnd = Math.min(sceneEnd, coreStart + maxCoreLines - 1);
      const windowId = `${sceneId}-W${sceneWindowIndex + 1}`;
      const coreLines = lines.slice(coreStart, coreEnd + 1).map(copyLine);
      const contextBefore = lines.slice(Math.max(0, coreStart - contextLines), coreStart).map(copyLine);
      const contextAfter = lines.slice(coreEnd + 1, Math.min(lines.length, coreEnd + 1 + contextLines)).map(copyLine);
      coveredLineIds.push(...coreLines.map(line => line.id));
      windowIds.push(windowId);
      windows.push({
        id: windowId,
        sceneId,
        headingLineId: heading?.id ?? null,
        startLineId: coreLines[0].id,
        endLineId: coreLines.at(-1).id,
        coreLines,
        contextBefore,
        contextAfter,
      });
      sceneWindowIndex += 1;
    }

    scenes.push({
      id: sceneId,
      headingLineId: heading?.id ?? null,
      headingText: heading?.text ?? null,
      startLineId: lines[sceneStart].id,
      endLineId: lines[sceneEnd].id,
      windowIds,
    });
  }

  const uniqueCovered = new Set(coveredLineIds);
  const allLineIds = lines.map(line => line.id);
  const uncoveredLineIds = allLineIds.filter(id => !uniqueCovered.has(id));
  const coveredLines = coveredLineIds.length;
  return {
    scenes,
    windows,
    coverage: {
      totalLines: lines.length,
      coveredLines,
      coveredLineIds: [...coveredLineIds],
      uncoveredLineIds,
      coveragePercent: lines.length === 0 ? 100 : coveredLines / lines.length * 100,
      sceneCount: scenes.length,
      windowCount: windows.length,
    },
  };
}
