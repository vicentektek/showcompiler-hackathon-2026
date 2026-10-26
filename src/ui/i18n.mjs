/**
 * Offline-capable UI localisation. English is the stable default.
 * UI locale is a device preference, never part of a show document.
 */
import en from './locales/en.json' with { type: 'json' };
import es from './locales/es.json' with { type: 'json' };

export const DEFAULT_LOCALE = 'en';
export const UI_LOCALE_KEY = 'showcompiler.ui.locale.v1';
export const SUPPORTED_UI_LOCALES = Object.freeze(['en', 'es']);
export const UI_CATALOGS = Object.freeze({
  en: Object.freeze(en),
  es: Object.freeze(es),
});

export function normalizeUiLocale(value) {
  return value === 'es' ? 'es' : DEFAULT_LOCALE;
}

export function readPreferredUiLocale(storage) {
  try {
    return normalizeUiLocale(storage?.getItem(UI_LOCALE_KEY));
  } catch {
    return DEFAULT_LOCALE; // Disabled/private storage never prevents app startup.
  }
}

export function savePreferredUiLocale(storage, value) {
  const locale = normalizeUiLocale(value);
  try { storage?.setItem(UI_LOCALE_KEY, locale); }
  catch { /* Storage can be disabled. The in-memory choice still works. */ }
  return locale;
}

export function translate(locale, key, values = {}) {
  if (typeof key !== 'string' || !Object.hasOwn(UI_CATALOGS.en, key)) {
    throw new RangeError('Unknown translation key: ' + String(key));
  }
  const language = normalizeUiLocale(locale);
  const template = UI_CATALOGS[language][key] ?? UI_CATALOGS.en[key];
  return template.replace(/\{([a-z][a-zA-Z0-9]*)\}/g, (_, token) => {
    const value = Object.hasOwn(values, token) ? values[token] : '';
    return String(value); // Callers use textContent or native dialogs; never innerHTML.
  });
}

export function translateDocument(document, locale) {
  const active = normalizeUiLocale(locale);
  document.documentElement.lang = active;
  for (const element of document.querySelectorAll('[data-i18n]')) {
    element.textContent = translate(active, element.dataset.i18n);
  }
  for (const element of document.querySelectorAll('[data-i18n-placeholder]')) {
    element.setAttribute('placeholder', translate(active, element.dataset.i18nPlaceholder));
  }
  for (const element of document.querySelectorAll('[data-i18n-aria]')) {
    element.setAttribute('aria-label', translate(active, element.dataset.i18nAria));
  }
}

const COMMON_ERRORS = Object.freeze([
  [/^Invalid show project:/i, 'errors.metaInvalidProject'],
  [/^Cue not found/i, 'errors.cueMissing'],
  [/^Invalid script language/i, 'errors.languageHint'],
  [/^Meta suggestion/i, 'errors.metaResponse'],
  [/^Meta returned/i, 'errors.metaResponse'],
  [/^Meta API/i, 'errors.metaService'],
  [/^Meta Model API/i, 'errors.metaService'],
  [/^No such/i, 'errors.generic'],
  [/^Cannot replace script/i, 'errors.generic'],
  [/^Proposal /i, 'errors.generic'],
]);

export function translateError(locale, error) {
  const message = error instanceof Error ? error.message : '';
  const matched = COMMON_ERRORS.find(([pattern]) => pattern.test(message));
  return translate(locale, matched?.[1] ?? 'errors.generic');
}
