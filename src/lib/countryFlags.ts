// Normalizes whatever loose country/nationality string the backend or older data might hold
// (ISO alpha-2, ISO alpha-3, English name, Turkish name) into a real ISO 3166-1 alpha-2 code
// for CountryFlagBadge to render as a vendored circular SVG. Never infers a country from UI
// language -- only from actual stored data.

const ALIASES: Record<string, string> = {
  TR: 'TR', TUR: 'TR', TURKEY: 'TR', TÜRKİYE: 'TR', TURKIYE: 'TR', TÜRKIYE: 'TR',
  US: 'US', USA: 'US', UNITEDSTATES: 'US', AMERIKA: 'US',
  GB: 'GB', UK: 'GB', UNITEDKINGDOM: 'GB', INGILTERE: 'GB', İNGİLTERE: 'GB',
  DE: 'DE', GER: 'DE', GERMANY: 'DE', ALMANYA: 'DE',
  FR: 'FR', FRA: 'FR', FRANCE: 'FR', FRANSA: 'FR',
  IT: 'IT', ITA: 'IT', ITALY: 'IT', ITALYA: 'IT', İTALYA: 'IT',
  ES: 'ES', ESP: 'ES', SPAIN: 'ES', ISPANYA: 'ES', İSPANYA: 'ES',
  RU: 'RU', RUS: 'RU', RUSSIA: 'RU', RUSYA: 'RU',
  NL: 'NL', NLD: 'NL', NETHERLANDS: 'NL', HOLLANDA: 'NL',
  AZ: 'AZ', AZE: 'AZ', AZERBAIJAN: 'AZ', AZERBAYCAN: 'AZ',
  KZ: 'KZ', KAZ: 'KZ', KAZAKHSTAN: 'KZ', KAZAKISTAN: 'KZ',
  PT: 'PT', POR: 'PT', PORTUGAL: 'PT', PORTEKIZ: 'PT',
  GR: 'GR', GRC: 'GR', GREECE: 'GR', YUNANISTAN: 'GR',
  BG: 'BG', BGR: 'BG', BULGARIA: 'BG', BULGARISTAN: 'BG',
  AT: 'AT', AUT: 'AT', AUSTRIA: 'AT', AVUSTURYA: 'AT',
  CH: 'CH', CHE: 'CH', SWITZERLAND: 'CH', ISVICRE: 'CH',
  SE: 'SE', SWE: 'SE', SWEDEN: 'SE', ISVEC: 'SE',
  PL: 'PL', POL: 'PL', POLAND: 'PL', POLONYA: 'PL',
  AE: 'AE', ARE: 'AE', UAE: 'AE',
  SA: 'SA', SAU: 'SA', SAUDIARABIA: 'SA',
  CA: 'CA', CAN: 'CA', CANADA: 'CA',
  AU: 'AU', AUS: 'AU', AUSTRALIA: 'AU',
  JP: 'JP', JPN: 'JP', JAPAN: 'JP', JAPONYA: 'JP',
  KR: 'KR', KOR: 'KR', SOUTHKOREA: 'KR',
  CN: 'CN', CHN: 'CN', CHINA: 'CN', CIN: 'CN',
  IN: 'IN', IND: 'IN', INDIA: 'IN', HINDISTAN: 'IN',
  BR: 'BR', BRA: 'BR', BRAZIL: 'BR', BREZILYA: 'BR',
};

function normalizeKey(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[İI]/g, 'I')
    // Fold Ü/Ö/Ç/Ş/Ğ (and other diacritics) to their base Latin letter before the final strip --
    // otherwise a real Turkish name like "Türkiye" loses the Ü entirely instead of becoming "TURKIYE".
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z]/g, '');
}

export function normalizeCountryCode(input?: string | null): string | null {
  if (!input) return null;
  const key = normalizeKey(input);
  if (!key) return null;
  if (ALIASES[key]) return ALIASES[key];
  // Already a bare ISO alpha-2 code we don't have an explicit alias for.
  if (key.length === 2) return key;
  return null;
}

export const COMMON_COUNTRIES: { code: string; name: string }[] = [
  { code: 'TR', name: 'Türkiye' },
  { code: 'US', name: 'Amerika Birleşik Devletleri' },
  { code: 'GB', name: 'Birleşik Krallık' },
  { code: 'DE', name: 'Almanya' },
  { code: 'FR', name: 'Fransa' },
  { code: 'IT', name: 'İtalya' },
  { code: 'ES', name: 'İspanya' },
  { code: 'NL', name: 'Hollanda' },
  { code: 'RU', name: 'Rusya' },
  { code: 'AZ', name: 'Azerbaycan' },
  { code: 'KZ', name: 'Kazakistan' },
  { code: 'PT', name: 'Portekiz' },
  { code: 'GR', name: 'Yunanistan' },
  { code: 'BG', name: 'Bulgaristan' },
  { code: 'AT', name: 'Avusturya' },
  { code: 'CH', name: 'İsviçre' },
  { code: 'SE', name: 'İsveç' },
  { code: 'PL', name: 'Polonya' },
  { code: 'AE', name: 'Birleşik Arap Emirlikleri' },
  { code: 'SA', name: 'Suudi Arabistan' },
  { code: 'CA', name: 'Kanada' },
  { code: 'AU', name: 'Avustralya' },
  { code: 'JP', name: 'Japonya' },
  { code: 'KR', name: 'Güney Kore' },
  { code: 'CN', name: 'Çin' },
  { code: 'IN', name: 'Hindistan' },
  { code: 'BR', name: 'Brezilya' },
];
