import type { AppLocale } from '../i18n/appLocale';
import { localeLookup } from './profileLabels';

// Trust Profile / Meeting Feedback category labels -- keys must match the field names returned
// by GET /api/trust/profile/:userId's `averages` object (see trust_controller.js SCORE_FIELDS).
// Same convention as RELATIONSHIP_GOAL/ZODIAC labels in profileLabels.ts: stable keys, locale-
// aware display text, never a raw stored string.
export const TRUST_CATEGORY_KEYS = [
  'communication',
  'profileMatch',
  'reliability',
  'comfort',
  'intent',
  'listening',
  'respect',
] as const;

export type TrustCategoryKey = (typeof TRUST_CATEGORY_KEYS)[number];

const TRUST_CATEGORY_LABELS_BY_LOCALE: Record<AppLocale, Record<TrustCategoryKey, string>> = {
  tr: {
    communication: 'İletişim ve Kibarlık', profileMatch: 'Profil Uyumu', reliability: 'Zamanlama ve Güvenilirlik',
    comfort: 'Güven ve Rahatlık', intent: 'Niyet ve Samimiyet', listening: 'Dinleme ve İlgi', respect: 'Saygı ve Sınırlar',
  },
  en: {
    communication: 'Communication & Politeness', profileMatch: 'Profile Match', reliability: 'Timeliness & Reliability',
    comfort: 'Trust & Comfort', intent: 'Intent & Sincerity', listening: 'Listening & Attentiveness', respect: 'Respect & Boundaries',
  },
  es: {
    communication: 'Comunicación y Cortesía', profileMatch: 'Coincidencia de Perfil', reliability: 'Puntualidad y Fiabilidad',
    comfort: 'Confianza y Comodidad', intent: 'Intención y Sinceridad', listening: 'Escucha y Atención', respect: 'Respeto y Límites',
  },
  fr: {
    communication: 'Communication et Politesse', profileMatch: 'Fidélité au Profil', reliability: 'Ponctualité et Fiabilité',
    comfort: 'Confiance et Confort', intent: 'Intention et Sincérité', listening: 'Écoute et Attention', respect: 'Respect et Limites',
  },
  pt: {
    communication: 'Comunicação e Cortesia', profileMatch: 'Correspondência do Perfil', reliability: 'Pontualidade e Confiabilidade',
    comfort: 'Confiança e Conforto', intent: 'Intenção e Sinceridade', listening: 'Escuta e Atenção', respect: 'Respeito e Limites',
  },
  ru: {
    communication: 'Общение и Вежливость', profileMatch: 'Соответствие Профилю', reliability: 'Пунктуальность и Надёжность',
    comfort: 'Доверие и Комфорт', intent: 'Намерения и Искренность', listening: 'Внимание и Умение Слушать', respect: 'Уважение и Границы',
  },
  ar: {
    communication: 'التواصل واللباقة', profileMatch: 'مطابقة الملف الشخصي', reliability: 'الالتزام بالمواعيد والموثوقية',
    comfort: 'الثقة والراحة', intent: 'النية والصدق', listening: 'الإصغاء والاهتمام', respect: 'الاحترام والحدود',
  },
  hi: {
    communication: 'संवाद और शिष्टाचार', profileMatch: 'प्रोफ़ाइल मिलान', reliability: 'समयबद्धता और भरोसेमंदी',
    comfort: 'भरोसा और सहजता', intent: 'इरादा और ईमानदारी', listening: 'सुनना और ध्यान देना', respect: 'सम्मान और सीमाएं',
  },
  zh: {
    communication: '沟通与礼貌', profileMatch: '资料相符度', reliability: '守时与可靠性',
    comfort: '信任与自在感', intent: '意图与真诚', listening: '倾听与关注', respect: '尊重与界限',
  },
};

export const getTrustCategoryLabel = (key: TrustCategoryKey, locale?: AppLocale): string =>
  localeLookup(TRUST_CATEGORY_LABELS_BY_LOCALE, locale, key) || key;
