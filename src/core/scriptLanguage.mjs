/**
 * The source language of a script is independent from the UI locale.
 * 'auto' asks the model to infer the language from the unchanged source text.
 * BCP 47-style language tags are hints, not claims of universal model support.
 */
export const DEFAULT_SCRIPT_LANGUAGE = 'auto';

export function normalizeScriptLanguageHint(value = 'auto') {
  if (value === null || value === undefined || value === '') return 'auto';
  if (typeof value !== 'string') throw new TypeError('Invalid script language code');
  const hint = value.trim();
  if (hint.toLowerCase() === 'auto') return 'auto';
  if (hint.length > 35 || !/^[A-Za-z]{2,3}(?:-(?:[A-Za-z]{2,8}|[0-9]{3}))*$/.test(hint)) {
    throw new TypeError('Invalid script language code');
  }
  // Canonicalize only where Intl.Locale understands the tag. Do not infer content.
  try { return new Intl.Locale(hint).toString(); }
  catch { throw new TypeError('Invalid script language code'); }
}
