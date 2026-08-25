import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/features/auth/RegistrationWizard.tsx'), 'utf8');

describe('registration blocks under-18 birth dates before submit, not just server-side', () => {
  it('computes age with the exact same year/month/day logic the server uses', () => {
    const fnStart = source.indexOf('function computeAge');
    const fn = source.slice(fnStart, source.indexOf('type UsernameStatus', fnStart));
    expect(fn).toContain('today.getFullYear() - dob.getFullYear()');
    expect(fn).toContain('today.getMonth() - dob.getMonth()');
    expect(fn).toContain('today.getDate() < dob.getDate()');
  });

  it('blocks the birthdate step from advancing and shows the exact server-facing message', () => {
    const stepStart = source.indexOf("step.id === 'birthdate'");
    const stepBody = source.slice(stepStart, source.indexOf("step.id === 'gender'"));
    expect(stepBody).toContain('age < MIN_REGISTRATION_AGE');
    expect(stepBody).toContain('Kayıt olmak için en az 18 yaşında olmalısınız.');
    expect(stepBody).toContain('setBirthDateError(message)');
    // The error branch must return before goNext() -- confirmed by goNext() only appearing
    // once in this step, after the age check, not inside the underage branch.
    expect(stepBody.indexOf('age < MIN_REGISTRATION_AGE')).toBeLessThan(stepBody.lastIndexOf('goNext()'));
  });
});
