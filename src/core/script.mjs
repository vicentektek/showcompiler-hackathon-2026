/**
 * Original hackathon implementation, 2026-10-26.
 * Pure script parsing utilities: no network, AI, storage or side effects.
 */
export function parseScript(input) {
  if (typeof input !== 'string') {
    throw new TypeError('Script must be a string');
  }
  const normalized = input.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
  const lines = normalized.split('\n');
  return lines.map((text, index) => ({
    id: `L${index + 1}`,
    lineNumber: index + 1,
    text,
  }));
}

export function getScriptLine(lines, lineId) {
  if (!Array.isArray(lines) || typeof lineId !== 'string') return null;
  return lines.find((line) => line.id === lineId) ?? null;
}

export function searchScript(lines, query) {
  if (!Array.isArray(lines) || typeof query !== 'string') {
    throw new TypeError('Expected lines array and query string');
  }
  const term = query.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
  if (!term) return [];
  return lines.filter((line) =>
    line.text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().includes(term)
  );
}
