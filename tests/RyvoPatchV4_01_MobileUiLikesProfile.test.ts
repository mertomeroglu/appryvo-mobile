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
      ['features/discovery/SwipeCard.tsx', 'profile.age'],
      ['features/discovery/FullProfileScreen.tsx', 'user.age'],
      ['features/map/SocialMapScreen.tsx', 'selectedUserDetail?.age'],
      ['features/likes/LikesScreen.tsx', 'user.age'],
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

  // -----------------------------------------------------------------------------------------
  // A) inbound likes -- real blurred photo (server-provided) + initials/gradient fallback,
  //    never a flat black/gray rectangle or a raw-field access bug.
  // -----------------------------------------------------------------------------------------
  it('A -- LikesScreen reads the photo from the field the server actually sends, not a nonexistent shape', () => {
    const screen = source('features/likes/LikesScreen.tsx');
    // The old bug: `user.photoUrl || user.photos?.[0]?.url` -- the inbound-likes endpoint never
    // sends `photoUrl`, and `photos[0]` is a plain string there, so `.url` on a string is always
    // undefined. Every card silently fell through to the generic default-avatar placeholder.
    expect(screen).not.toContain('user.photoUrl || user.photos?.[0]?.url');
    expect(screen).toContain('getPhotoUrl(user.photos?.[0])');
  });

  it('A -- a failed/missing like-card photo renders initials on a gradient, never a bare black rectangle', () => {
    const screen = source('features/likes/LikesScreen.tsx');
    expect(screen).toContain('const LikeCardImage');
    expect(screen).toContain('onError={() => setFailed(true)}');
    expect(screen).toContain('bg-brand-gradient');
    expect(screen).toContain('initialsFrom(name)');
    // One-shot: reset only on src change, never re-triggering the same failed src in a loop.
    expect(screen).toContain('useEffect(() => setFailed(false), [src]);');
  });

  it('A -- locked (non-premium) cards still get a real blurred photo, and canReveal still gates the full name/photo', () => {
    const screen = source('features/likes/LikesScreen.tsx');
    expect(screen).toContain("const isBlurred = item.canReveal === false;");
    expect(screen).toContain("blurred ? 'scale-105 saturate-75 brightness-90' : ''");
    expect(screen).toContain("navigate('/premium')");
  });

  it('A -- RYVO PATCH V5 01: a locked card never falls through to the original unblurred photoUrl when photos[0] is missing', () => {
    const screen = source('features/likes/LikesScreen.tsx');
    // Old fallback chain: getPhotoUrl(photos?.[0]) || photoBlurUrl || photoUrl -- if photos[0] was
    // absent, a locked card could still land on the real, unblurred photoUrl. isBlurred must now
    // be computed before the photo pick, and the locked branch may only ever fall back to
    // photoBlurUrl, never photoUrl.
    const isBlurredIndex = screen.indexOf('const isBlurred = item.canReveal === false;');
    const primaryPhotoIndex = screen.indexOf('const primaryPhoto = getPhotoUrl(user.photos?.[0]);');
    expect(isBlurredIndex).toBeGreaterThan(-1);
    expect(primaryPhotoIndex).toBeGreaterThan(isBlurredIndex);
    expect(screen).toContain('isBlurred ? primaryPhoto || user.photoBlurUrl : primaryPhoto || user.photoUrl');
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

    const discover = source('features/discovery/DiscoverScreen.tsx');
    // The swipe action row is gone (question flow), but the column that now holds the question
    // actions must still clear the floating nav through the same shared constant.
    expect(discover).toContain('pb-[calc(var(--safe-bottom)+var(--nav-footprint)+16px)]');
    // The old hard-coded guesses must stay gone.
    expect(discover).not.toContain('mb-[calc(var(--safe-bottom)+6rem)]');
    expect(discover).not.toMatch(/\bmb-20\b/);
  });

  it('B -- the profile card container cannot overflow its flex-1 slot on short viewports', () => {
    const discover = source('features/discovery/DiscoverScreen.tsx');
    // min-h-0 is required so an oversized child (long bio, many shared interests) can't force
    // this flex item taller than the space actually left after the header + action buttons,
    // which used to push the actions (and the nav-collision buffer) past where they fit.
    expect(discover).toContain('flex-1 min-h-0 w-full max-w-md mx-auto flex flex-col');
    // The card itself scrolls internally instead of growing the column.
    expect(discover).toContain('min-h-0 flex-1 overflow-y-auto');
    // Viewport-relative dvh guessing stays replaced by the flex layout's own resolved size (the
    // JSX itself, not just an explanatory comment referencing the old value, must be free of it).
    const jsxOnly = discover.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\/.*$/gm, '');
    expect(jsxOnly).not.toContain('h-[65dvh]');
  });

  // -----------------------------------------------------------------------------------------
  // C) SocialMapScreen flicker -- marker rebuild content-diffed, loading pill gated on first
  //    load only (not every 15s background poll).
  // -----------------------------------------------------------------------------------------
  it('C -- map markers are only rebuilt when the user set/positions actually change, not on every poll', () => {
    const map = source('features/map/SocialMapScreen.tsx');
    expect(map).toContain('mapUsersSignatureRef');
    expect(map).toContain("mapUsers.map((u) => `${u.id}:${u.displayLat}:${u.displayLng}`).join('|')");
    expect(map).toMatch(/if \(signature === mapUsersSignatureRef\.current.*return;/s);
  });

  it('C -- the "loading nearby" pill and "no one nearby" empty state don\'t blink on every background poll', () => {
    const map = source('features/map/SocialMapScreen.tsx');
    expect(map).toContain('isLoading: isMapUsersLoading');
    expect(map).toContain('{isMapUsersLoading && bbox && (');
    expect(map).not.toContain('{isFetching && bbox && (');
    const isEmptyViewportDecl = map.slice(map.indexOf('const isEmptyViewport'), map.indexOf('const isEmptyViewport') + 300);
    expect(isEmptyViewportDecl).toContain('!isMapUsersLoading');
    expect(isEmptyViewportDecl).not.toContain('!isFetching');
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
