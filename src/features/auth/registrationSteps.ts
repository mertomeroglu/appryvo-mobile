// Single source of truth for the registration wizard's step order and progress indicator.
// ALL of these run before the account is actually created — see RegistrationWizard.tsx.
// There is no review step: the last step (location) creates the account directly.
export type RegistrationStepId =
  | 'basic'
  | 'username'
  | 'birthdate'
  | 'gender'
  | 'interestedIn'
  | 'relationshipGoal'
  | 'interests'
  | 'photos'
  | 'location';

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
  { id: 'location', label: 'Konum' },
];

export const REGISTRATION_STEP_COUNT = REGISTRATION_STEPS.length;
