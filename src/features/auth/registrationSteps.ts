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

import type { AppMessageKey } from '../../i18n/appLocale';

export interface RegistrationStepConfig {
  id: RegistrationStepId;
  /** Translation key for this step's display label (see appLocale.ts). Not currently rendered
   * anywhere in the wizard UI -- only `.id` drives step branching today -- but kept translatable
   * for any future step-name display (e.g. a progress list) rather than left as a dead Turkish string. */
  labelKey: AppMessageKey;
}

export const REGISTRATION_STEPS: RegistrationStepConfig[] = [
  { id: 'basic', labelKey: 'regStepBasicLabel' },
  { id: 'username', labelKey: 'regStepUsernameLabel' },
  { id: 'birthdate', labelKey: 'regStepBirthdateLabel' },
  { id: 'gender', labelKey: 'regStepGenderLabel' },
  { id: 'interestedIn', labelKey: 'regStepInterestedInLabel' },
  { id: 'relationshipGoal', labelKey: 'regStepRelationshipGoalLabel' },
  { id: 'interests', labelKey: 'regStepInterestsLabel' },
  { id: 'photos', labelKey: 'regStepPhotosLabel' },
];

export const REGISTRATION_STEP_COUNT = REGISTRATION_STEPS.length;
