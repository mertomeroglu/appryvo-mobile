// Canonical world-language list for the "languages I speak" profile field
// (users.languages, JSONB, free-form strings — see server/api/src/user_controller.js).
// No ISO/i18n package exists in this project and the backend does zero validation against a
// fixed list, so `name` (the Turkish display label, matching the app's existing convention) is
// what actually gets sent over the wire — kept as plain uppercase strings for backward
// compatibility with profiles that already have values from the old 7-item preset list.
// `code`/`englishName` exist purely for local search and as a stable React key.
export interface LanguageOption {
  code: string; // ISO 639-1
  name: string; // Turkish display name, uppercase (the wire value)
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

export const searchLanguages = (query: string): LanguageOption[] => {
  const q = query.trim().toLocaleLowerCase('tr');
  if (!q) return WORLD_LANGUAGES;
  return WORLD_LANGUAGES.filter(
    (lang) =>
      lang.name.toLocaleLowerCase('tr').includes(q) ||
      lang.englishName.toLowerCase().includes(q.toLowerCase()) ||
      lang.code.toLowerCase() === q.toLowerCase()
  );
};

export const LANGUAGE_SELECTION_MAX = 10;
