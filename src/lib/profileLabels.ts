import type { AppLocale } from '../i18n/appLocale';
import { PRODUCT_DEFAULT_LOCALE } from '../i18n/appLocale';

// Canonical label maps for enum fields shared by profile-facing screens (SwipeCard,
// FullProfileScreen, RegistrationWizard, EditProfileModal). Object KEYS must match the backend's
// validated enum values exactly (see PUT /api/profile in server/api/src/user_controller.js) --
// a mismatched key here silently drops the field server-side instead of rendering a label. The
// display TEXT is locale-aware (see the `_BY_LOCALE` maps below); every getter takes an explicit
// `locale` so a French-app-locale user never sees these specific fields fall back to Turkish
// (the emoji prefixes are language-neutral and stay identical across locales).

// Mirrors the server's own bound (MIN_USER_AGE/MAX_USER_AGE in user_controller.js, 18-99) --
// values written before that bound existed (e.g. the reported 570 case) can still be sitting in
// the database pending an admin cleanup, so every place that renders a user's age treats an
// out-of-range value the same as a missing one instead of displaying it.
export function formatDisplayAge(age: unknown): number | undefined {
  const n = typeof age === 'number' ? age : Number(age);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 18 || n > 99) return undefined;
  return n;
}

export function localeLookup<T extends Record<string, string>>(
  byLocale: Record<AppLocale, T>,
  locale: AppLocale | undefined,
  key?: string | null
): string | undefined {
  if (!key) return undefined;
  const table = byLocale[locale || PRODUCT_DEFAULT_LOCALE] || byLocale[PRODUCT_DEFAULT_LOCALE];
  return table[key];
}

// Exactly 5 selectable goals -- this is the canonical set offered anywhere a user picks one
// (registration, edit profile). Keys must match the backend's `validGoals` allowlist in
// auth_controller.js / user_controller.js.
const RELATIONSHIP_GOAL_LABELS_BY_LOCALE: Record<AppLocale, Record<string, string>> = {
  tr: { LONG_TERM: '💍 Ciddi İlişki', SHORT_TERM: '☕ Eğlenceli Tanışmalar', FRIENDSHIP: '👋 Yeni Arkadaşlıklar', OPEN_TO_EXPLORING: '🌙 Henüz Emin Değilim', NOT_SURE: '🤔 Kararsız' },
  en: { LONG_TERM: '💍 Serious Relationship', SHORT_TERM: '☕ Casual Dating', FRIENDSHIP: '👋 New Friendships', OPEN_TO_EXPLORING: '🌙 Still Figuring It Out', NOT_SURE: '🤔 Not Sure' },
  es: { LONG_TERM: '💍 Relación Seria', SHORT_TERM: '☕ Citas Casuales', FRIENDSHIP: '👋 Nuevas Amistades', OPEN_TO_EXPLORING: '🌙 Aún Decidiendo', NOT_SURE: '🤔 No Estoy Seguro' },
  fr: { LONG_TERM: '💍 Relation Sérieuse', SHORT_TERM: '☕ Rencontres Décontractées', FRIENDSHIP: '👋 Nouvelles Amitiés', OPEN_TO_EXPLORING: '🌙 Encore Indécis(e)', NOT_SURE: '🤔 Pas Sûr(e)' },
  pt: { LONG_TERM: '💍 Relacionamento Sério', SHORT_TERM: '☕ Encontros Casuais', FRIENDSHIP: '👋 Novas Amizades', OPEN_TO_EXPLORING: '🌙 Ainda Decidindo', NOT_SURE: '🤔 Não Tenho Certeza' },
  ru: { LONG_TERM: '💍 Серьёзные Отношения', SHORT_TERM: '☕ Лёгкие Знакомства', FRIENDSHIP: '👋 Новая Дружба', OPEN_TO_EXPLORING: '🌙 Пока Не Определился', NOT_SURE: '🤔 Не Уверен' },
  ar: { LONG_TERM: '💍 علاقة جادة', SHORT_TERM: '☕ تعارف غير رسمي', FRIENDSHIP: '👋 صداقات جديدة', OPEN_TO_EXPLORING: '🌙 لم أقرر بعد', NOT_SURE: '🤔 غير متأكد' },
  hi: { LONG_TERM: '💍 गंभीर रिश्ता', SHORT_TERM: '☕ आकस्मिक मुलाकातें', FRIENDSHIP: '👋 नई दोस्ती', OPEN_TO_EXPLORING: '🌙 अभी तय नहीं किया', NOT_SURE: '🤔 अनिश्चित' },
  zh: { LONG_TERM: '💍 认真交往', SHORT_TERM: '☕ 轻松约会', FRIENDSHIP: '👋 结交新朋友', OPEN_TO_EXPLORING: '🌙 还在考虑', NOT_SURE: '🤔 不确定' },
};

// 'CASUAL' was retired from selection (see auth_controller.js) but existing profiles that
// already have it stored must still render a sensible label instead of nothing.
const LEGACY_RELATIONSHIP_GOAL_LABELS_BY_LOCALE: Record<AppLocale, Record<string, string>> = {
  tr: { CASUAL: '🎉 Sıradan Takılma' }, en: { CASUAL: '🎉 Just Hanging Out' }, es: { CASUAL: '🎉 Solo Pasarla Bien' },
  fr: { CASUAL: "🎉 Juste Passer du Temps" }, pt: { CASUAL: '🎉 Só Curtir' }, ru: { CASUAL: '🎉 Просто Общение' },
  ar: { CASUAL: '🎉 مجرد قضاء وقت ممتع' }, hi: { CASUAL: '🎉 बस साथ समय बिताना' }, zh: { CASUAL: '🎉 随意玩玩' },
};

/** Back-compat: many call sites read this directly for the current (Turkish) label text. */
export const RELATIONSHIP_GOAL_LABELS = RELATIONSHIP_GOAL_LABELS_BY_LOCALE.tr;

export const getRelationshipGoalLabel = (value?: string | null, locale?: AppLocale): string | undefined =>
  localeLookup(RELATIONSHIP_GOAL_LABELS_BY_LOCALE, locale, value) || localeLookup(LEGACY_RELATIONSHIP_GOAL_LABELS_BY_LOCALE, locale, value);

export const getRelationshipGoalLabels = (value?: string | string[] | null, locale?: AppLocale): string[] => {
  const goals = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(goals)]
    .map((goal) => getRelationshipGoalLabel(goal, locale))
    .filter((label): label is string => Boolean(label))
    .slice(0, 2);
};

const SMOKING_LABELS_BY_LOCALE: Record<AppLocale, Record<string, string>> = {
  tr: { NEVER: 'Hiç İçmiyor', SOMETIMES: 'Ara Sıra', SOCIALLY: 'Sosyal Ortamda', REGULARLY: 'Düzenli İçiyor' },
  en: { NEVER: 'Never Smokes', SOMETIMES: 'Sometimes', SOCIALLY: 'Socially', REGULARLY: 'Regularly Smokes' },
  es: { NEVER: 'No Fuma', SOMETIMES: 'A Veces', SOCIALLY: 'Socialmente', REGULARLY: 'Fuma Regularmente' },
  fr: { NEVER: 'Ne Fume Pas', SOMETIMES: 'Parfois', SOCIALLY: 'En Société', REGULARLY: 'Fume Régulièrement' },
  pt: { NEVER: 'Não Fuma', SOMETIMES: 'Às Vezes', SOCIALLY: 'Socialmente', REGULARLY: 'Fuma Regularmente' },
  ru: { NEVER: 'Не Курит', SOMETIMES: 'Иногда', SOCIALLY: 'В Компании', REGULARLY: 'Курит Регулярно' },
  ar: { NEVER: 'لا يدخن', SOMETIMES: 'أحياناً', SOCIALLY: 'في المناسبات الاجتماعية', REGULARLY: 'يدخن بانتظام' },
  hi: { NEVER: 'धूम्रपान नहीं करते', SOMETIMES: 'कभी-कभी', SOCIALLY: 'सामाजिक अवसरों पर', REGULARLY: 'नियमित धूम्रपान करते हैं' },
  zh: { NEVER: '不吸烟', SOMETIMES: '偶尔', SOCIALLY: '社交场合', REGULARLY: '经常吸烟' },
};
export const SMOKING_LABELS = SMOKING_LABELS_BY_LOCALE.tr;
export const getSmokingLabel = (value?: string | null, locale?: AppLocale) => localeLookup(SMOKING_LABELS_BY_LOCALE, locale, value);

const DRINKING_LABELS_BY_LOCALE: Record<AppLocale, Record<string, string>> = {
  tr: { NEVER: 'Hiç İçmiyor', SOMETIMES: 'Ara Sıra', SOCIALLY: 'Sosyal Ortamda', REGULARLY: 'Düzenli İçiyor' },
  en: { NEVER: 'Never Drinks', SOMETIMES: 'Sometimes', SOCIALLY: 'Socially', REGULARLY: 'Regularly Drinks' },
  es: { NEVER: 'No Bebe', SOMETIMES: 'A Veces', SOCIALLY: 'Socialmente', REGULARLY: 'Bebe Regularmente' },
  fr: { NEVER: 'Ne Boit Pas', SOMETIMES: 'Parfois', SOCIALLY: 'En Société', REGULARLY: 'Boit Régulièrement' },
  pt: { NEVER: 'Não Bebe', SOMETIMES: 'Às Vezes', SOCIALLY: 'Socialmente', REGULARLY: 'Bebe Regularmente' },
  ru: { NEVER: 'Не Пьёт', SOMETIMES: 'Иногда', SOCIALLY: 'В Компании', REGULARLY: 'Пьёт Регулярно' },
  ar: { NEVER: 'لا يشرب الكحول', SOMETIMES: 'أحياناً', SOCIALLY: 'في المناسبات الاجتماعية', REGULARLY: 'يشرب بانتظام' },
  hi: { NEVER: 'शराब नहीं पीते', SOMETIMES: 'कभी-कभी', SOCIALLY: 'सामाजिक अवसरों पर', REGULARLY: 'नियमित रूप से पीते हैं' },
  zh: { NEVER: '不饮酒', SOMETIMES: '偶尔', SOCIALLY: '社交场合', REGULARLY: '经常饮酒' },
};
export const DRINKING_LABELS = DRINKING_LABELS_BY_LOCALE.tr;
export const getDrinkingLabel = (value?: string | null, locale?: AppLocale) => localeLookup(DRINKING_LABELS_BY_LOCALE, locale, value);

const CHILDREN_STATUS_LABELS_BY_LOCALE: Record<AppLocale, Record<string, string>> = {
  tr: { NO_CHILDREN: 'Çocuğu Yok', HAS_CHILDREN: 'Çocuğu Var' },
  en: { NO_CHILDREN: 'No Children', HAS_CHILDREN: 'Has Children' },
  es: { NO_CHILDREN: 'Sin Hijos', HAS_CHILDREN: 'Tiene Hijos' },
  fr: { NO_CHILDREN: 'Sans Enfants', HAS_CHILDREN: 'A des Enfants' },
  pt: { NO_CHILDREN: 'Sem Filhos', HAS_CHILDREN: 'Tem Filhos' },
  ru: { NO_CHILDREN: 'Нет Детей', HAS_CHILDREN: 'Есть Дети' },
  ar: { NO_CHILDREN: 'بدون أطفال', HAS_CHILDREN: 'لديه أطفال' },
  hi: { NO_CHILDREN: 'कोई संतान नहीं', HAS_CHILDREN: 'संतान है' },
  zh: { NO_CHILDREN: '没有孩子', HAS_CHILDREN: '有孩子' },
};
export const CHILDREN_STATUS_LABELS = CHILDREN_STATUS_LABELS_BY_LOCALE.tr;
export const getChildrenStatusLabel = (value?: string | null, locale?: AppLocale) => localeLookup(CHILDREN_STATUS_LABELS_BY_LOCALE, locale, value);

const FAMILY_PLANS_LABELS_BY_LOCALE: Record<AppLocale, Record<string, string>> = {
  tr: { WANTS_CHILDREN: 'Çocuk İstiyor', DOES_NOT_WANT_CHILDREN: 'Çocuk İstemiyor', OPEN_TO_CHILDREN: 'Kararsız / Açık', NOT_SURE: 'Henüz Emin Değil' },
  en: { WANTS_CHILDREN: 'Wants Children', DOES_NOT_WANT_CHILDREN: "Doesn't Want Children", OPEN_TO_CHILDREN: 'Open to Children', NOT_SURE: 'Not Sure Yet' },
  es: { WANTS_CHILDREN: 'Quiere Hijos', DOES_NOT_WANT_CHILDREN: 'No Quiere Hijos', OPEN_TO_CHILDREN: 'Abierto/a a Tener Hijos', NOT_SURE: 'Aún No Está Seguro/a' },
  fr: { WANTS_CHILDREN: 'Veut des Enfants', DOES_NOT_WANT_CHILDREN: "Ne Veut Pas d'Enfants", OPEN_TO_CHILDREN: 'Ouvert(e) aux Enfants', NOT_SURE: 'Pas Encore Sûr(e)' },
  pt: { WANTS_CHILDREN: 'Quer Filhos', DOES_NOT_WANT_CHILDREN: 'Não Quer Filhos', OPEN_TO_CHILDREN: 'Aberto(a) a Ter Filhos', NOT_SURE: 'Ainda Não Tem Certeza' },
  ru: { WANTS_CHILDREN: 'Хочет Детей', DOES_NOT_WANT_CHILDREN: 'Не Хочет Детей', OPEN_TO_CHILDREN: 'Открыт к Детям', NOT_SURE: 'Пока Не Уверен' },
  ar: { WANTS_CHILDREN: 'يريد أطفالاً', DOES_NOT_WANT_CHILDREN: 'لا يريد أطفالاً', OPEN_TO_CHILDREN: 'منفتح على فكرة الأطفال', NOT_SURE: 'غير متأكد بعد' },
  hi: { WANTS_CHILDREN: 'संतान चाहते हैं', DOES_NOT_WANT_CHILDREN: 'संतान नहीं चाहते', OPEN_TO_CHILDREN: 'संतान के लिए खुले विचार', NOT_SURE: 'अभी तय नहीं किया' },
  zh: { WANTS_CHILDREN: '想要孩子', DOES_NOT_WANT_CHILDREN: '不想要孩子', OPEN_TO_CHILDREN: '对生孩子持开放态度', NOT_SURE: '还没决定' },
};
export const FAMILY_PLANS_LABELS = FAMILY_PLANS_LABELS_BY_LOCALE.tr;
export const getFamilyPlansLabel = (value?: string | null, locale?: AppLocale) => localeLookup(FAMILY_PLANS_LABELS_BY_LOCALE, locale, value);

// Text only -- the visual glyph for each sign is ZodiacIcon (src/components/ui/ZodiacIcon.tsx),
// a drawn SVG, never a Unicode astrological symbol or emoji.
const ZODIAC_LABELS_BY_LOCALE: Record<AppLocale, Record<string, string>> = {
  tr: { ARIES: 'Koç', TAURUS: 'Boğa', GEMINI: 'İkizler', CANCER: 'Yengeç', LEO: 'Aslan', VIRGO: 'Başak', LIBRA: 'Terazi', SCORPIO: 'Akrep', SAGITTARIUS: 'Yay', CAPRICORN: 'Oğlak', AQUARIUS: 'Kova', PISCES: 'Balık' },
  en: { ARIES: 'Aries', TAURUS: 'Taurus', GEMINI: 'Gemini', CANCER: 'Cancer', LEO: 'Leo', VIRGO: 'Virgo', LIBRA: 'Libra', SCORPIO: 'Scorpio', SAGITTARIUS: 'Sagittarius', CAPRICORN: 'Capricorn', AQUARIUS: 'Aquarius', PISCES: 'Pisces' },
  es: { ARIES: 'Aries', TAURUS: 'Tauro', GEMINI: 'Géminis', CANCER: 'Cáncer', LEO: 'Leo', VIRGO: 'Virgo', LIBRA: 'Libra', SCORPIO: 'Escorpio', SAGITTARIUS: 'Sagitario', CAPRICORN: 'Capricornio', AQUARIUS: 'Acuario', PISCES: 'Piscis' },
  fr: { ARIES: 'Bélier', TAURUS: 'Taureau', GEMINI: 'Gémeaux', CANCER: 'Cancer', LEO: 'Lion', VIRGO: 'Vierge', LIBRA: 'Balance', SCORPIO: 'Scorpion', SAGITTARIUS: 'Sagittaire', CAPRICORN: 'Capricorne', AQUARIUS: 'Verseau', PISCES: 'Poissons' },
  pt: { ARIES: 'Áries', TAURUS: 'Touro', GEMINI: 'Gêmeos', CANCER: 'Câncer', LEO: 'Leão', VIRGO: 'Virgem', LIBRA: 'Libra', SCORPIO: 'Escorpião', SAGITTARIUS: 'Sagitário', CAPRICORN: 'Capricórnio', AQUARIUS: 'Aquário', PISCES: 'Peixes' },
  ru: { ARIES: 'Овен', TAURUS: 'Телец', GEMINI: 'Близнецы', CANCER: 'Рак', LEO: 'Лев', VIRGO: 'Дева', LIBRA: 'Весы', SCORPIO: 'Скорпион', SAGITTARIUS: 'Стрелец', CAPRICORN: 'Козерог', AQUARIUS: 'Водолей', PISCES: 'Рыбы' },
  ar: { ARIES: 'الحمل', TAURUS: 'الثور', GEMINI: 'الجوزاء', CANCER: 'السرطان', LEO: 'الأسد', VIRGO: 'العذراء', LIBRA: 'الميزان', SCORPIO: 'العقرب', SAGITTARIUS: 'القوس', CAPRICORN: 'الجدي', AQUARIUS: 'الدلو', PISCES: 'الحوت' },
  hi: { ARIES: 'मेष', TAURUS: 'वृषभ', GEMINI: 'मिथुन', CANCER: 'कर्क', LEO: 'सिंह', VIRGO: 'कन्या', LIBRA: 'तुला', SCORPIO: 'वृश्चिक', SAGITTARIUS: 'धनु', CAPRICORN: 'मकर', AQUARIUS: 'कुंभ', PISCES: 'मीन' },
  zh: { ARIES: '白羊座', TAURUS: '金牛座', GEMINI: '双子座', CANCER: '巨蟹座', LEO: '狮子座', VIRGO: '处女座', LIBRA: '天秤座', SCORPIO: '天蝎座', SAGITTARIUS: '射手座', CAPRICORN: '摩羯座', AQUARIUS: '水瓶座', PISCES: '双鱼座' },
};
export const ZODIAC_LABELS = ZODIAC_LABELS_BY_LOCALE.tr;
export const getZodiacLabel = (value?: string | null, locale?: AppLocale) => localeLookup(ZODIAC_LABELS_BY_LOCALE, locale, value);

// Data-format presets for the "spoken languages" profile field (stored value, not app UI chrome)
// -- intentionally left Turkish-only in this pass; see lib/languages.ts's normalization contract
// before changing this, since it's a stored-value format, not just display text.
export const LANGUAGE_PRESETS = ['Türkçe', 'İngilizce', 'Almanca', 'Fransızca', 'İspanyolca', 'Arapça', 'Rusça'];
