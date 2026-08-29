// Canonical world-language list for the "languages I speak" profile field
// (users.languages, JSONB, free-form strings — see server/api/src/user_controller.js).
// No ISO/i18n package exists in this project and the backend does zero validation against a
// fixed list, so `name` (the Turkish display label, matching the app's existing convention) is
// what gets sent over the wire. Older profiles may still contain uppercase values, so every
// read/write passes through the canonical display formatter below.
// `code`/`englishName` exist purely for local search and as a stable React key.
export interface LanguageOption {
  code: string; // ISO 639-1
  name: string; // Turkish source label; formatLanguageName returns the canonical wire/display value
  englishName: string;
  flag: string;
}

// The app's own established default/primary languages (the original LANGUAGE_PRESETS list) —
// always pinned first, above search results.
export const PRIMARY_LANGUAGE_CODES = ['tr', 'en', 'de', 'fr', 'es', 'ar', 'ru'];

export const WORLD_LANGUAGES: LanguageOption[] = [
  { code: 'tr', name: 'TÜRKÇE', englishName: 'Turkish', flag: '🇹🇷' },
  { code: 'en', name: 'İNGİLİZCE', englishName: 'English', flag: '🇬🇧' },
  { code: 'de', name: 'ALMANCA', englishName: 'German', flag: '🇩🇪' },
  { code: 'fr', name: 'FRANSIZCA', englishName: 'French', flag: '🇫🇷' },
  { code: 'es', name: 'İSPANYOLCA', englishName: 'Spanish', flag: '🇪🇸' },
  { code: 'ar', name: 'ARAPÇA', englishName: 'Arabic', flag: '🇸🇦' },
  { code: 'ru', name: 'RUSÇA', englishName: 'Russian', flag: '🇷🇺' },
  { code: 'it', name: 'İTALYANCA', englishName: 'Italian', flag: '🇮🇹' },
  { code: 'pt', name: 'PORTEKİZCE', englishName: 'Portuguese', flag: '🇵🇹' },
  { code: 'nl', name: 'FLEMENKÇE', englishName: 'Dutch', flag: '🇳🇱' },
  { code: 'el', name: 'YUNANCA', englishName: 'Greek', flag: '🇬🇷' },
  { code: 'pl', name: 'LEHÇE', englishName: 'Polish', flag: '🇵🇱' },
  { code: 'sv', name: 'İSVEÇÇE', englishName: 'Swedish', flag: '🇸🇪' },
  { code: 'no', name: 'NORVEÇÇE', englishName: 'Norwegian', flag: '🇳🇴' },
  { code: 'da', name: 'DANCA', englishName: 'Danish', flag: '🇩🇰' },
  { code: 'fi', name: 'FİNCE', englishName: 'Finnish', flag: '🇫🇮' },
  { code: 'ro', name: 'RUMENCE', englishName: 'Romanian', flag: '🇷🇴' },
  { code: 'hu', name: 'MACARCA', englishName: 'Hungarian', flag: '🇭🇺' },
  { code: 'cs', name: 'ÇEKÇE', englishName: 'Czech', flag: '🇨🇿' },
  { code: 'sk', name: 'SLOVAKÇA', englishName: 'Slovak', flag: '🇸🇰' },
  { code: 'bg', name: 'BULGARCA', englishName: 'Bulgarian', flag: '🇧🇬' },
  { code: 'uk', name: 'UKRAYNACA', englishName: 'Ukrainian', flag: '🇺🇦' },
  { code: 'sr', name: 'SIRPÇA', englishName: 'Serbian', flag: '🇷🇸' },
  { code: 'hr', name: 'HIRVATÇA', englishName: 'Croatian', flag: '🇭🇷' },
  { code: 'sq', name: 'ARNAVUTÇA', englishName: 'Albanian', flag: '🇦🇱' },
  { code: 'bs', name: 'BOŞNAKÇA', englishName: 'Bosnian', flag: '🇧🇦' },
  { code: 'az', name: 'AZERBAYCANCA', englishName: 'Azerbaijani', flag: '🇦🇿' },
  { code: 'ka', name: 'GÜRCÜCE', englishName: 'Georgian', flag: '🇬🇪' },
  { code: 'hy', name: 'ERMENİCE', englishName: 'Armenian', flag: '🇦🇲' },
  { code: 'fa', name: 'FARSÇA', englishName: 'Persian', flag: '🇮🇷' },
  { code: 'ur', name: 'URDUCA', englishName: 'Urdu', flag: '🇵🇰' },
  { code: 'he', name: 'İBRANİCE', englishName: 'Hebrew', flag: '🇮🇱' },
  { code: 'hi', name: 'HİNTÇE', englishName: 'Hindi', flag: '🇮🇳' },
  { code: 'bn', name: 'BENGALCE', englishName: 'Bengali', flag: '🇧🇩' },
  { code: 'zh', name: 'ÇİNCE', englishName: 'Chinese', flag: '🇨🇳' },
  { code: 'ja', name: 'JAPONCA', englishName: 'Japanese', flag: '🇯🇵' },
  { code: 'ko', name: 'KORECE', englishName: 'Korean', flag: '🇰🇷' },
  { code: 'vi', name: 'VİETNAMCA', englishName: 'Vietnamese', flag: '🇻🇳' },
  { code: 'th', name: 'TAYCA', englishName: 'Thai', flag: '🇹🇭' },
  { code: 'id', name: 'ENDONEZCE', englishName: 'Indonesian', flag: '🇮🇩' },
  { code: 'ms', name: 'MALAYCA', englishName: 'Malay', flag: '🇲🇾' },
  { code: 'tl', name: 'FİLİPİNCE', englishName: 'Filipino', flag: '🇵🇭' },
  { code: 'sw', name: 'SVAHİLİCE', englishName: 'Swahili', flag: '🇰🇪' },
  { code: 'am', name: 'AMHARCA', englishName: 'Amharic', flag: '🇪🇹' },
  { code: 'ha', name: 'HAVSACA', englishName: 'Hausa', flag: '🇳🇬' },
  { code: 'yo', name: 'YORUBACA', englishName: 'Yoruba', flag: '🇳🇬' },
  { code: 'zu', name: 'ZULUCA', englishName: 'Zulu', flag: '🇿🇦' },
  { code: 'af', name: 'AFRİKAANSÇA', englishName: 'Afrikaans', flag: '🇿🇦' },
  { code: 'kk', name: 'KAZAKÇA', englishName: 'Kazakh', flag: '🇰🇿' },
  { code: 'uz', name: 'ÖZBEKÇE', englishName: 'Uzbek', flag: '🇺🇿' },
  { code: 'tk', name: 'TÜRKMENCE', englishName: 'Turkmen', flag: '🇹🇲' },
  { code: 'tt', name: 'TATARCA', englishName: 'Tatar', flag: '🇷🇺' },
  { code: 'ky', name: 'KIRGIZCA', englishName: 'Kyrgyz', flag: '🇰🇬' },
  { code: 'mn', name: 'MOĞOLCA', englishName: 'Mongolian', flag: '🇲🇳' },
  { code: 'ku', name: 'KÜRTÇE', englishName: 'Kurdish', flag: '🏳️' },
  { code: 'is', name: 'İZLANDACA', englishName: 'Icelandic', flag: '🇮🇸' },
  { code: 'ga', name: 'İRLANDACA', englishName: 'Irish', flag: '🇮🇪' },
  { code: 'ca', name: 'KATALANCA', englishName: 'Catalan', flag: '🏳️' },
  { code: 'eu', name: 'BASKÇA', englishName: 'Basque', flag: '🏳️' },
  { code: 'gl', name: 'GALİÇYACA', englishName: 'Galician', flag: '🏳️' },
  { code: 'mt', name: 'MALTACA', englishName: 'Maltese', flag: '🇲🇹' },
  { code: 'lv', name: 'LETONCA', englishName: 'Latvian', flag: '🇱🇻' },
  { code: 'lt', name: 'LİTVANCA', englishName: 'Lithuanian', flag: '🇱🇹' },
  { code: 'et', name: 'ESTONCA', englishName: 'Estonian', flag: '🇪🇪' },
  { code: 'sl', name: 'SLOVENCE', englishName: 'Slovenian', flag: '🇸🇮' },
  { code: 'mk', name: 'MAKEDONCA', englishName: 'Macedonian', flag: '🇲🇰' },
  { code: 'be', name: 'BELARUSÇA', englishName: 'Belarusian', flag: '🇧🇾' },
  { code: 'ta', name: 'TAMİLCE', englishName: 'Tamil', flag: '🇮🇳' },
  { code: 'te', name: 'TELUGUCA', englishName: 'Telugu', flag: '🇮🇳' },
  { code: 'mr', name: 'MARATHİCE', englishName: 'Marathi', flag: '🇮🇳' },
  { code: 'gu', name: 'GUCARATÇA', englishName: 'Gujarati', flag: '🇮🇳' },
  { code: 'pa', name: 'PENCAPÇA', englishName: 'Punjabi', flag: '🇮🇳' },
  { code: 'ne', name: 'NEPALCE', englishName: 'Nepali', flag: '🇳🇵' },
  { code: 'si', name: 'SİNHALACA', englishName: 'Sinhala', flag: '🇱🇰' },
  { code: 'my', name: 'BİRMANYACA', englishName: 'Burmese', flag: '🇲🇲' },
  { code: 'km', name: 'KMERCE', englishName: 'Khmer', flag: '🇰🇭' },
  { code: 'lo', name: 'LAOCA', englishName: 'Lao', flag: '🇱🇦' },
];

export const searchLanguages = (query: string, appLocale?: string): LanguageOption[] => {
  const q = query.trim().toLocaleLowerCase('tr');
  if (!q) return WORLD_LANGUAGES;
  const qLower = q.toLowerCase();
  return WORLD_LANGUAGES.filter(
    (lang) =>
      lang.name.toLocaleLowerCase('tr').includes(q) ||
      lang.englishName.toLowerCase().includes(qLower) ||
      lang.code.toLowerCase() === qLower ||
      (appLocale ? getLocalizedLanguageName(lang, appLocale).toLowerCase().includes(qLower) : false)
  );
};

export const formatLanguageName = (value: string): string => {
  const normalized = String(value || '').trim().toLocaleLowerCase('tr-TR');
  if (!normalized) return '';
  return normalized.charAt(0).toLocaleUpperCase('tr-TR') + normalized.slice(1);
};

export const languageNameEquals = (left: string, right: string): boolean =>
  formatLanguageName(left) === formatLanguageName(right);

// Display-only localization: the wire/stored value (formatLanguageName's Turkish-cased output)
// never changes -- this only affects what a non-Turkish user SEES in the picker, via the
// standard Intl.DisplayNames API (supported on both the Android WebView and iOS 14.5+, well
// under this app's iOS 15 floor). Falls back to the always-present English name, then to the
// Turkish source label, if the runtime can't resolve a name for a given locale/code pair.
export const getLocalizedLanguageName = (lang: LanguageOption, appLocale: string): string => {
  try {
    const displayNames = new Intl.DisplayNames([appLocale], { type: 'language' });
    const resolved = displayNames.of(lang.code);
    if (resolved && resolved.toLowerCase() !== lang.code.toLowerCase()) return resolved;
  } catch {
    // Intl.DisplayNames unsupported or locale/code not resolvable -- fall through.
  }
  return lang.englishName || formatLanguageName(lang.name);
};

// Display-time localization for an ALREADY-STORED language value (e.g. a saved profile's
// "languages I speak" chips) -- distinct from getLocalizedLanguageName, which only localizes
// picker search results. The wire/stored value stays the Turkish-cased string from
// formatLanguageName; this resolves it back to a WORLD_LANGUAGES entry (case-insensitive
// Turkish-locale match, since stored names may be any case from older writes) and re-renders
// it in the viewer's app locale. Unknown/legacy values (not in WORLD_LANGUAGES) fall back to
// the formatted raw string, same as before this existed.
export const getLocalizedStoredLanguageName = (value: string, appLocale: string): string => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const upper = raw.toLocaleUpperCase('tr-TR');
  const match = WORLD_LANGUAGES.find(
    (lang) => lang.name.toLocaleUpperCase('tr-TR') === upper || lang.englishName.toLowerCase() === raw.toLowerCase()
  );
  if (!match) return formatLanguageName(raw);
  if (appLocale === 'tr') return formatLanguageName(match.name);
  return getLocalizedLanguageName(match, appLocale);
};

export const normalizeLanguageNames = (values: unknown): string[] => {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value): value is string => typeof value === 'string').map(formatLanguageName).filter(Boolean))]
    .slice(0, LANGUAGE_SELECTION_MAX);
};

export const LANGUAGE_SELECTION_MAX = 10;
