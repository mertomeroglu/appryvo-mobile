// Canonical label maps for enum fields shared by profile-facing screens (SwipeCard,
// FullProfileScreen, RegistrationWizard, EditProfileModal). Keys must match the backend's
// validated enum values exactly (see PUT /api/profile in server/api/src/user_controller.js) —
// a mismatched key here silently drops the field server-side instead of rendering a label.

// Exactly 5 selectable goals -- this is the canonical set offered anywhere a user picks one
// (registration, edit profile). Keys must match the backend's `validGoals` allowlist in
// auth_controller.js / user_controller.js.
export const RELATIONSHIP_GOAL_LABELS: Record<string, string> = {
  LONG_TERM: '💍 Ciddi İlişki',
  SHORT_TERM: '☕ Eğlenceli Tanışmalar',
  FRIENDSHIP: '👋 Yeni Arkadaşlıklar',
  OPEN_TO_EXPLORING: '🌙 Henüz Emin Değilim',
  NOT_SURE: '🤔 Kararsız',
};

// 'CASUAL' was retired from selection (see auth_controller.js) but existing profiles that
// already have it stored must still render a sensible label instead of nothing.
const LEGACY_RELATIONSHIP_GOAL_LABELS: Record<string, string> = {
  CASUAL: '🎉 Sıradan Takılma',
};

export const getRelationshipGoalLabel = (value?: string | null): string | undefined =>
  value ? RELATIONSHIP_GOAL_LABELS[value] || LEGACY_RELATIONSHIP_GOAL_LABELS[value] : undefined;

export const SMOKING_LABELS: Record<string, string> = {
  NEVER: 'Hiç İçmiyor',
  SOMETIMES: 'Ara Sıra',
  SOCIALLY: 'Sosyal Ortamda',
  REGULARLY: 'Düzenli İçiyor',
};

export const DRINKING_LABELS: Record<string, string> = {
  NEVER: 'Hiç İçmiyor',
  SOMETIMES: 'Ara Sıra',
  SOCIALLY: 'Sosyal Ortamda',
  REGULARLY: 'Düzenli İçiyor',
};

export const CHILDREN_STATUS_LABELS: Record<string, string> = {
  NO_CHILDREN: 'Çocuğu Yok',
  HAS_CHILDREN: 'Çocuğu Var',
};

export const FAMILY_PLANS_LABELS: Record<string, string> = {
  WANTS_CHILDREN: 'Çocuk İstiyor',
  DOES_NOT_WANT_CHILDREN: 'Çocuk İstemiyor',
  OPEN_TO_CHILDREN: 'Kararsız / Açık',
  NOT_SURE: 'Henüz Emin Değil',
};

export const ZODIAC_LABELS: Record<string, string> = {
  ARIES: '♈ Koç',
  TAURUS: '♉ Boğa',
  GEMINI: '♊ İkizler',
  CANCER: '♋ Yengeç',
  LEO: '♌ Aslan',
  VIRGO: '♍ Başak',
  LIBRA: '♎ Terazi',
  SCORPIO: '♏ Akrep',
  SAGITTARIUS: '♐ Yay',
  CAPRICORN: '♑ Oğlak',
  AQUARIUS: '♒ Kova',
  PISCES: '♓ Balık',
};

export const LANGUAGE_PRESETS = ['TÜRKÇE', 'İNGİLİZCE', 'ALMANCA', 'FRANSIZCA', 'İSPANYOLCA', 'ARAPÇA', 'RUSÇA'];
