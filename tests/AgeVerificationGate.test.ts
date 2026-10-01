import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AGE_VERIFICATION_LABELS } from '../src/i18n/appLocale';

const source = (p: string) => readFileSync(resolve(__dirname, '..', 'src', p), 'utf8');

// 18+ gate: accounts without a birth date on file (server: AGE_VERIFICATION_REQUIRED) see only
// the verification screen until an adult birth date is saved.
describe('age verification gate', () => {
  it('SessionGate shows the verification screen instead of the app while the flag is set', () => {
    const gate = source('app/SessionGate.tsx');
    expect(gate).toContain('s.user?.ageVerificationRequired === true');
    expect(gate.indexOf('return <AgeVerificationScreen />')).toBeGreaterThan(-1);
    expect(gate.indexOf('return <AgeVerificationScreen />')).toBeLessThan(gate.indexOf('return <Outlet />'));
    expect(gate).toContain('AGE_VERIFICATION_REQUIRED_EVENT');
  });

  it('API and socket refusals both raise the gate', () => {
    expect(source('services/api/apiClient.ts')).toContain("code === 'AGE_VERIFICATION_REQUIRED' && response.status === 403");
    expect(source('services/socket/socketService.ts')).toContain("data?.code === 'AGE_VERIFICATION_REQUIRED'");
  });

  it('no birth date is pre-filled, in registration or in the gate', () => {
    expect(source('features/auth/RegistrationWizard.tsx')).toContain("const [birthDate, setBirthDate] = useState('');");
    const screen = source('features/auth/AgeVerificationScreen.tsx');
    expect(screen).toContain("const [birthDate, setBirthDate] = useState('');");
    expect(screen).toContain("apiClient.post('/api/me/age-verification'");
    // A minor's submission suspends the account server-side; the client signs out.
    expect(screen).toMatch(/code === 'UNDERAGE'[\s\S]{0,120}await logout\(\)/);
  });

  it('labels exist for every app locale', () => {
    for (const labels of Object.values(AGE_VERIFICATION_LABELS)) {
      for (const value of Object.values(labels)) expect(String(value).trim().length).toBeGreaterThan(0);
    }
    expect(Object.keys(AGE_VERIFICATION_LABELS).sort()).toEqual(['ar', 'en', 'es', 'fr', 'hi', 'pt', 'ru', 'tr', 'zh']);
  });
});
