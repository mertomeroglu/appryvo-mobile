export const AGE_VERIFICATION_REQUIRED_EVENT = 'ryvo:age-verification-required';

/** The server answered AGE_VERIFICATION_REQUIRED: this account has no birth date on file. */
export function notifyAgeVerificationRequired() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(AGE_VERIFICATION_REQUIRED_EVENT));
}
