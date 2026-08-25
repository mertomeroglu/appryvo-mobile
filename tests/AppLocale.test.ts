import { beforeEach, describe, expect, it } from 'vitest';
import {
  getMissingAppTranslationKeys,
  matchSupportedLocale,
  resolveInitialLocale,
  SUPPORTED_APP_LOCALES,
  useAppLocaleStore,
} from '../src/i18n/appLocale';

describe('app localization', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppLocaleStore.getState().setLocale('tr');
  });

  it('keeps every declared locale dictionary key-complete', () => {
    expect(getMissingAppTranslationKeys()).toEqual(
      Object.fromEntries(SUPPORTED_APP_LOCALES.map((locale) => [locale, []]))
    );
  });

  it('normalizes supported device locales without treating locale as a country', () => {
    expect(matchSupportedLocale('pt-BR')).toBe('pt');
    expect(matchSupportedLocale('zh_Hant')).toBe('zh');
    expect(matchSupportedLocale('ja-JP')).toBeNull();
  });

  it('prompts for unsupported device languages and uses a safe English fallback', () => {
    expect(resolveInitialLocale(null, 'ja-JP')).toEqual({
      locale: 'en',
      needsLanguageSelection: true,
    });
  });

  it('prefers a persisted choice across restarts', () => {
    expect(resolveInitialLocale('fr', 'ja-JP')).toEqual({
      locale: 'fr',
      needsLanguageSelection: false,
    });
  });

  it('rerenders subscribers and applies RTL only for Arabic', () => {
    let observed = useAppLocaleStore.getState().locale;
    const unsubscribe = useAppLocaleStore.subscribe((state) => {
      observed = state.locale;
    });

    useAppLocaleStore.getState().setLocale('ar');
    expect(observed).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');

    useAppLocaleStore.getState().setLocale('en');
    expect(observed).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
    unsubscribe();
  });
});
