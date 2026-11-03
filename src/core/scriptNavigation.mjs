/**
 * Text-only script navigation. Stable L# references, Unicode-aware search,
 * and bounded visible windows keep long scripts usable without DOM flooding.
 */
export function foldScriptSearch(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
}
export function findScriptMatches(lines, query, limit = 5000) {
  if (!Array.isArray(lines) || !Number.isInteger(limit) || limit < 1 || limit > 5000) {
    throw new TypeError('Invalid search scope');
  }
  const term = foldScriptSearch(query).trim();
  if (!term) return [];
  const matches = [];
  for (const line of lines) {
    if (foldScriptSearch(line.text).includes(term)) {
      matches.push(line.id);
      if (matches.length >= limit) break;
    }
  }
  return matches;
}
export function scriptWindow(lines, focusId, maxLines = 300) {
  if (!Array.isArray(lines) || !Number.isInteger(maxLines) || maxLines < 1 || maxLines > 300) {
    throw new TypeError('Invalid preview window');
  }
  const at = lines.findIndex(line => line.id === focusId);
  const start = at < 0 ? 0 : Math.min(Math.max(0, at - Math.floor(maxLines / 3)), Math.max(0, lines.length - maxLines));
  return { start, visible: lines.slice(start, start + maxLines) };
}
