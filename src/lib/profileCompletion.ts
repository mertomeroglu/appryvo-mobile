// Client-computed profile completion — derived from the fields that actually exist on the
// user record, not a stored/fake number. Only counts fields a user can fill in from the
// Profile screen after registration (registration itself already guarantees name, birth date,
// gender, relationship goal, interests, and at least two photos).
interface CompletionUser {
  photos?: any[];
  bio?: string | null;
  interests?: string[];
  languages?: string[];
  smokingStatus?: string | null;
  drinkingStatus?: string | null;
}

export type CompletionFieldKey =
  | 'photos'
  | 'bio'
  | 'interests'
  | 'languages'
  | 'smokingStatus'
  | 'drinkingStatus';

export interface CompletionField {
  key: CompletionFieldKey;
  weight: number;
  isComplete: (user: CompletionUser) => boolean;
  cta: string;
}

const FIELDS: CompletionField[] = [
  {
    key: 'photos',
    weight: 30,
    isComplete: (u) => (u.photos || []).filter((photo) => {
      if (typeof photo === 'string') return photo.trim().length > 0;
      if (!photo || typeof photo !== 'object') return false;
      return ['url', 'original', 'large', 'medium', 'thumbnail'].some(
        (key) => typeof photo[key] === 'string' && photo[key].trim().length > 0
      );
    }).length >= 2,
    cta: 'Fotoğraf ekle',
  },
  { key: 'bio', weight: 20, isComplete: (u) => !!u.bio?.trim(), cta: 'Bio ekle' },
  { key: 'interests', weight: 15, isComplete: (u) => (u.interests?.length || 0) >= 3, cta: 'İlgi alanı ekle' },
  { key: 'languages', weight: 15, isComplete: (u) => (u.languages?.length || 0) >= 1, cta: 'Dil ekle' },
  {
    key: 'smokingStatus',
    weight: 10,
    isComplete: (u) => !!u.smokingStatus,
    cta: 'Sigara tercihi',
  },
  {
    key: 'drinkingStatus',
    weight: 10,
    isComplete: (u) => !!u.drinkingStatus,
    cta: 'Alkol tercihi',
  },
];

export interface ProfileCompletion {
  percent: number;
  missing: CompletionField[];
}

export function computeProfileCompletion(user: CompletionUser | null | undefined): ProfileCompletion {
  if (!user) return { percent: 0, missing: FIELDS };
  let earned = 0;
  const missing: CompletionField[] = [];
  for (const field of FIELDS) {
    if (field.isComplete(user)) {
      earned += field.weight;
    } else {
      missing.push(field);
    }
  }
  return { percent: Math.round(earned), missing };
}
