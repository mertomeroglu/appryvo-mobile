// Single source of truth for the registration wizard's step order and progress indicator.
// ALL of these run before the account is actually created — see RegistrationWizard.tsx.
// Location is intentionally requested later, when the user first opens Discover.
export type RegistrationStepId =
  | 'basic'
  | 'username'
  | 'birthdate'
  | 'gender'
  | 'interestedIn'
  | 'relationshipGoal'
  | 'interests'
  | 'photos';

export interface RegistrationStepConfig {
  id: RegistrationStepId;
  label: string;
}

export const REGISTRATION_STEPS: RegistrationStepConfig[] = [
  { id: 'basic', label: 'Hesap' },
  { id: 'username', label: 'Kullanıcı Adı' },
  { id: 'birthdate', label: 'Doğum Tarihi' },
  { id: 'gender', label: 'Cinsiyet' },
  { id: 'interestedIn', label: 'Tercih' },
  { id: 'relationshipGoal', label: 'Hedef' },
  { id: 'interests', label: 'İlgi Alanları' },
  { id: 'photos', label: 'Fotoğraflar' },
];

export const REGISTRATION_STEP_COUNT = REGISTRATION_STEPS.length;
