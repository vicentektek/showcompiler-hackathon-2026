import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  UI_CATALOGS, DEFAULT_LOCALE, UI_LOCALE_KEY,
  readPreferredUiLocale, savePreferredUiLocale,
  normalizeUiLocale, translate, translateDocument, resolveErrorKey,
} from '../src/ui/i18n.mjs';
import { normalizeScriptLanguageHint } from '../src/core/scriptLanguage.mjs';
import { createNewShow } from '../src/core/workspace.mjs';
import { serializeShowProject, deserializeShowProject } from '../src/core/projectPersistence.mjs';

test('defaults to English irrespective of browser language', () => {
  assert.equal(DEFAULT_LOCALE, 'en');
  assert.equal(normalizeUiLocale(undefined), 'en');
  assert.equal(normalizeUiLocale('fr'), 'en');
  assert.equal(readPreferredUiLocale(null), 'en');
  assert.equal(readPreferredUiLocale({ getItem: () => null }), 'en');
});

test('Spanish language preference persists independently of show data', () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  assert.equal(savePreferredUiLocale(storage, 'es'), 'es');
  assert.equal(values.get(UI_LOCALE_KEY), 'es');
  assert.equal(readPreferredUiLocale(storage), 'es');
  assert.equal(savePreferredUiLocale(storage, 'unexpected'), 'en');
  assert.equal(readPreferredUiLocale(storage), 'en');
});

test('storage disabled never prevents UI localisation', () => {
  const storage = { getItem: () => { throw Error('Storage disabled'); },
    setItem: () => { throw Error('Storage disabled'); } };
  assert.equal(readPreferredUiLocale(storage), 'en');
  assert.equal(savePreferredUiLocale(storage, 'es'), 'es');
});

test('every EN/ES translation key exists and placeholders match exactly', () => {
  const english = Object.keys(UI_CATALOGS.en).sort();
  const spanish = Object.keys(UI_CATALOGS.es).sort();
  assert.ok(english.length >= 125);
  assert.deepEqual(english, spanish);
  const variables = value => [...value.matchAll(/\{([a-z][a-zA-Z0-9]*)\}/g)].map(x => x[1]).sort();
  for (const key of english) {
    assert.equal(typeof UI_CATALOGS.en[key], 'string');
    assert.equal(typeof UI_CATALOGS.es[key], 'string');
    assert.deepEqual(variables(UI_CATALOGS.en[key]), variables(UI_CATALOGS.es[key]), key);
  }
});

test('HTML static localisation keys are defined in both catalogs', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<html lang="en">/);
  assert.match(html, /id="uiLocaleSelect"/);
  assert.match(html, /id="scriptLanguageSelect"/);
  const keys = [...html.matchAll(/\bdata-i18n(?:-(?:placeholder|aria))?="([^"]+)"/g)]
    .map(match => match[1]);
  assert.ok(keys.length >= 45);
  for (const key of keys) assert.ok(Object.hasOwn(UI_CATALOGS.en, key), key);
});

test('UI switch updates DOM language and text without executing HTML', () => {
  const textElement = { dataset: { i18n: 'top.panic' }, textContent: 'STOP ALL' };
  const placeholderElement = {
    dataset: { i18nPlaceholder: 'script.assetPlaceholder' },
    setAttribute(name, value) { this[name] = value; },
  };
  const ariaElement = {
    dataset: { i18nAria: 'top.panicAria' },
    setAttribute(name, value) { this[name] = value; },
  };
  const doc = {
    documentElement: { lang: 'en' },
    querySelectorAll: selector => ({
      '[data-i18n]': [textElement],
      '[data-i18n-placeholder]': [placeholderElement],
      '[data-i18n-aria]': [ariaElement],
    }[selector] ?? []),
  };
  translateDocument(doc, 'es');
  assert.equal(doc.documentElement.lang, 'es');
  assert.equal(textElement.textContent, 'PARAR TODO');
  assert.equal(placeholderElement.placeholder, 'Ej.: apertura.wav');
  assert.equal(ariaElement['aria-label'], 'Parar inmediatamente todo el audio');
  translateDocument(doc, 'en');
  assert.equal(doc.documentElement.lang, 'en');
  assert.equal(textElement.textContent, 'STOP ALL');
});

test('parameters are interpolated safely and missing keys throw', () => {
  assert.match(translate('en', 'status.proposalApproved', { id: 'proposal-1' }), /proposal-1/);
  assert.match(translate('es', 'status.proposalApproved', { id: 'proposal-1' }), /aprobada/);
  assert.equal(translate('en', 'status.scriptEmpty'), 'No script loaded yet.');
  assert.throws(() => translate('en', '__proto__'), RangeError);
  assert.throws(() => translate('en', 'unknown.translation'), RangeError);
});

test('cue row action labels exist in both supported locales', () => {
  assert.equal(translate('en', 'status.play'), 'PLAY');
  assert.equal(translate('en', 'status.unresolved'), 'UNRESOLVED AUDIO');
  assert.equal(translate('es', 'status.play'), 'REPRODUCIR');
  assert.equal(translate('es', 'status.unresolved'), 'AUDIO SIN RESOLVER');
});

test('unknown errors have localised safe fallback', () => {
  assert.equal(resolveErrorKey(new Error('Invalid show project: malformed')), 'errors.metaInvalidProject');
  assert.equal(resolveErrorKey({ uiKey: 'errors.onlyTxt' }), 'errors.onlyTxt');
  assert.equal(resolveErrorKey(new Error('Unknown private text')), 'errors.generic');
});

test('script language is independent of UI and validated as a hint', () => {
  assert.equal(normalizeScriptLanguageHint('auto'), 'auto');
  assert.equal(normalizeScriptLanguageHint(), 'auto');
  assert.equal(normalizeScriptLanguageHint('es'), 'es');
  assert.equal(normalizeScriptLanguageHint('ja'), 'ja');
  assert.equal(normalizeScriptLanguageHint('zh-Hans'), 'zh-Hans');
  assert.equal(normalizeScriptLanguageHint('pt-BR'), 'pt-BR');
  assert.throws(() => normalizeScriptLanguageHint('Please ignore previous instructions'), TypeError);
  assert.throws(() => normalizeScriptLanguageHint('<script>'), TypeError);
  assert.throws(() => normalizeScriptLanguageHint('en\nother'), TypeError);
  assert.throws(() => normalizeScriptLanguageHint(123), TypeError);
});

test('project JSON roundtrip retains original accented script regardless of UI language', () => {
  const script = 'ESCENA 1\nÁNGELA: ¿Dónde está el sonido?\nRÉGIS: Voilà!';
  const project = createNewShow({ name: 'Prueba / Demo', scriptText: script });
  translate('en', 'script.heading');
  translate('es', 'script.heading');
  assert.deepEqual(deserializeShowProject(serializeShowProject(project)), project);
  assert.equal(project.scriptText, script);
  assert.equal(project.schemaVersion, 1);
  assert.equal(Object.hasOwn(project, 'uiLocale'), false);
  assert.equal(Object.hasOwn(project, 'scriptLanguage'), false);
});
