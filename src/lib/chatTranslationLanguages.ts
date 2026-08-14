// Chat translation target languages -- deliberately a separate, small, ISO-code-keyed list from
// lib/languages.ts (which drives the multi-select "spoken languages" profile field and stores
// uppercase Turkish display names, not ISO codes). Translation targets must be actual codes the
// backend's LibreTranslate instance understands, and picking a language to translate INTO is a
// single-select choice, not a "languages I speak" multi-select.
export interface ChatTranslationLanguage {
  code: string;
  label: string;
}

export const CHAT_TRANSLATION_LANGUAGES: ChatTranslationLanguage[] = [
  { code: 'tr', label: 'Türkçe' },
  { code: 'en', label: 'İngilizce' },
  { code: 'de', label: 'Almanca' },
  { code: 'fr', label: 'Fransızca' },
  { code: 'it', label: 'İtalyanca' },
  { code: 'pt', label: 'Portekizce' },
  { code: 'ru', label: 'Rusça' },
  { code: 'es', label: 'İspanyolca' },
];

export function chatLanguageLabel(code: string | null | undefined): string {
  if (!code) return '';
  return CHAT_TRANSLATION_LANGUAGES.find((l) => l.code === code)?.label || code.toUpperCase();
}
