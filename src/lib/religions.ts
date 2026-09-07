import type { AppMessageKey } from '../i18n/appLocale';

/**
 * Mirrors RELIGION_OPTIONS in the API (server/api/src/profile_options.js) and the CHECK
 * constraint in migration 068. Sending anything outside this list is dropped server-side, so the
 * three lists must be changed together.
 */
export const RELIGION_OPTIONS = [
  'ISLAM',
  'CHRISTIANITY',
  'JUDAISM',
  'HINDUISM',
  'BUDDHISM',
  'SPIRITUAL',
  'ATHEIST',
  'AGNOSTIC',
  'OTHER',
  'PREFER_NOT_TO_SAY',
] as const;

export type Religion = (typeof RELIGION_OPTIONS)[number];

export const RELIGION_LABEL_KEY: Record<Religion, AppMessageKey> = {
  ISLAM: 'religionIslam',
  CHRISTIANITY: 'religionChristianity',
  JUDAISM: 'religionJudaism',
  HINDUISM: 'religionHinduism',
  BUDDHISM: 'religionBuddhism',
  SPIRITUAL: 'religionSpiritual',
  ATHEIST: 'religionAtheist',
  AGNOSTIC: 'religionAgnostic',
  OTHER: 'religionOther',
  PREFER_NOT_TO_SAY: 'religionPreferNotToSay',
};
