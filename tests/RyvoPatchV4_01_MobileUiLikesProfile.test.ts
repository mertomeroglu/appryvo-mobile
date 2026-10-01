import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatDisplayAge } from '../src/lib/profileLabels';

const root = path.resolve(__dirname, '..');
const source = (relativePath: string) => fs.readFileSync(path.join(root, 'src', relativePath), 'utf8');

describe('RYVO PATCH V4 / PROMPT 01: mobile UI/UX core fixes', () => {
  // -----------------------------------------------------------------------------------------
  // D) numeric limits -- formatDisplayAge is a pure function, executed directly (not grepped).
  // -----------------------------------------------------------------------------------------
  it('D -- formatDisplayAge rejects out-of-range ages and accepts the valid range', () => {
    expect(formatDisplayAge(17)).toBeUndefined();
    expect(formatDisplayAge(18)).toBe(18);
    expect(formatDisplayAge(99)).toBe(99);
    expect(formatDisplayAge(100)).toBeUndefined();
    expect(formatDisplayAge(570)).toBeUndefined(); // the reported bug value
    expect(formatDisplayAge(-5)).toBeUndefined();
    expect(formatDisplayAge(17.5)).toBeUndefined();
    expect(formatDisplayAge(undefined)).toBeUndefined();
    expect(formatDisplayAge(null)).toBeUndefined();
    expect(formatDisplayAge('42')).toBe(42);
  });

  it('D -- every screen rendering a user\'s age guards it through formatDisplayAge, not a raw truthy check', () => {
    const sites: Array<[string, string]> = [
      ['features/discovery/FullProfileScreen.tsx', 'user.age'],
      ['features/profile/ConnectionsListScreen.tsx', 'item.age'],
      ['features/profile/OwnProfileScreen.tsx', 'user?.age'],
      ['features/profile/ProfilePreviewScreen.tsx', 'user?.age'],
    ];
    for (const [file, expr] of sites) {
      const src = source(file);
      expect(src, `${file} must import formatDisplayAge`).toContain('formatDisplayAge');
      // A raw `{expr} &&` / `{expr} ?` truthy check (no formatDisplayAge wrapper) would still
      // render a corrupted stored value like 570 as-is -- every site must route the raw field
      // through the bounds-checked helper before it ever reaches JSX.
      expect(src, `${file} must not render the raw ${expr} without formatDisplayAge`).not.toMatch(
        new RegExp(`\\{${expr.replace(/[.?]/g, '\\$&')}[&?][^}]*<span`)
      );
    }
  });

  it('D -- RegistrationWizard enforces both a minimum and a maximum age, client-side', () => {
    const wizard = source('features/auth/RegistrationWizard.tsx');
    expect(wizard).toContain('const MIN_REGISTRATION_AGE = 18;');
    expect(wizard).toContain('const MAX_REGISTRATION_AGE = 99;');
    expect(wizard).toMatch(/age === null \|\| age < MIN_REGISTRATION_AGE \|\| age > MAX_REGISTRATION_AGE/);
    expect(wizard).toContain('min={minBirthDate}');
    expect(wizard).toContain('max={maxBirthDate}');
  });

  it('A -- server bakes the blur into the derivative\'s pixels instead of relying on a client-removable CSS filter', () => {
    const mediaController = fs.readFileSync(path.join(root, '..', 'web', 'server', 'api', 'src', 'media_controller.js'), 'utf8');
    expect(mediaController).toMatch(/key: 'blur'.*blurSigma: \d+/);
    expect(mediaController).toContain('pipeline = pipeline.blur(variant.blurSigma)');
  });

  // -----------------------------------------------------------------------------------------
  // B) Discover action row vs. floating bottom nav collision.
  // -----------------------------------------------------------------------------------------
  it('B -- the nav footprint is a single named constant, not independently-guessed magic numbers', () => {
    const globals = source('styles/globals.css');
    expect(globals).toContain('--nav-footprint:');

    const nav = source('components/FloatingNavBar.tsx');
    expect(nav).toContain('--nav-footprint');

  });

  // -----------------------------------------------------------------------------------------
  // E) Profile edit sticky/floating Save on dirty.
  // -----------------------------------------------------------------------------------------
  it('E -- a header Save action appears once any field is dirty, independent of scroll position', () => {
    const modal = source('components/EditProfileModal.tsx');
    expect(modal).toContain('const isDirty = useMemo(');
    expect(modal).toContain('{isDirty && (');
    expect(modal).toContain("formRef.current?.requestSubmit()");
    // Photo add/remove/reorder is part of the tracked dirty state, not just text fields.
    expect(modal).toContain('currentPhotoKeys');
    expect(modal).toContain('initialSnapshotRef');
  });

  it('E -- saving is a no-op when nothing changed (no unnecessary network request)', () => {
    const modal = source('components/EditProfileModal.tsx');
    expect(modal).toMatch(/if \(!isDirty\) return;/);
  });

  it('E -- a save error surfaces immediately (toast) instead of only appearing at the bottom of a long scrolled form', () => {
    const modal = source('components/EditProfileModal.tsx');
    const catchBlock = modal.slice(modal.indexOf('} catch (err: any) {'), modal.indexOf('} finally {'));
    expect(catchBlock).toContain('setErrorMsg(message)');
    expect(catchBlock).toContain('toast.error(message)');
  });
});
