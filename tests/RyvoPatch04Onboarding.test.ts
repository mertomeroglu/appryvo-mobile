import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/features/auth/RegistrationWizard.tsx'), 'utf8');

describe('RYVO PATCH 04 — onboarding email/username validation and interests CTA', () => {
  it('issue 1 -- a duplicate email is checked server-side at the email step, not only at final submit', () => {
    const effectStart = source.indexOf('const trimmed = email.trim();');
    const effectBody = source.slice(effectStart, source.indexOf("// --- Username: auto-suggest"));
    expect(effectBody).toContain('/api/auth/email/check?email=');
    expect(effectBody).toContain("setEmailStatus('taken')");
    expect(effectBody).toContain("setEmailStatus('available')");

    // The basic step's Continue button must actually gate on the confirmed-available result,
    // not just on the email's format being syntactically valid.
    expect(source).toMatch(/canSubmitBasic = name\.trim\(\)\.length > 0 && isEmailFormatValid && isPasswordValid && emailStatus === 'available'/);

    // The final POST /register submission's duplicate-email handling (regex-matched error ->
    // route back to the basic step) must still exist as the authoritative safety net.
    expect(source).toContain('/e-posta adresi zaten kullanımda/i');
    expect(source).toContain('setStepIndex(BASIC_STEP_INDEX)');
  });

  it('issue 2 -- username must be at least 5 characters on the client, matching the server', () => {
    expect(source).toContain("canSubmitUsername = username.length >= 5 && usernameStatus === 'available'");
    expect(source).not.toMatch(/canSubmitUsername = username\.length >= 3/);
  });

  it('issue 3 -- the interests step\'s Continue button is pinned outside the scrollable chip list, not at the end of long content', () => {
    const stepStart = source.indexOf("step.id === 'interests'");
    const stepBody = source.slice(stepStart, source.indexOf("step.id === 'photos'"));

    // Header and button live outside the scroll container (shrink-0); only the category/chip
    // list scrolls internally (flex-1 min-h-0 overflow-y-auto) -- the same idiom the wrapping
    // per-step container above already uses for exactly this reason.
    const headerIdx = stepBody.indexOf("shrink-0");
    const scrollIdx = stepBody.indexOf('flex-1 min-h-0 overflow-y-auto');
    const buttonIdx = stepBody.lastIndexOf('shrink-0');
    expect(headerIdx).toBeGreaterThan(-1);
    expect(scrollIdx).toBeGreaterThan(headerIdx);
    expect(buttonIdx).toBeGreaterThan(scrollIdx);
    expect(stepBody).toContain('disabled={interests.length < INTEREST_MIN}');
  });
});
