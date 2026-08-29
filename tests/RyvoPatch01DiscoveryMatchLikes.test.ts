import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..');
const source = (relativePath: string) => fs.readFileSync(path.join(root, 'src', relativePath), 'utf8');

describe('RYVO PATCH 01: discovery/match/like/notification/UI contracts', () => {
  it('issue 1 -- liking someone drops them from "Seni Beğenenler" instantly, not just via socket', () => {
    const hooks = source('hooks/useQueries.ts');
    const likeMutationStart = hooks.indexOf('export function useLikeMutation');
    const likeMutationBody = hooks.slice(likeMutationStart, hooks.indexOf('export function usePassMutation'));

    expect(likeMutationBody).toContain('queryClient.invalidateQueries({ queryKey: QUERY_KEYS.matches })');
    expect(likeMutationBody).toContain('queryClient.invalidateQueries({ queryKey: QUERY_KEYS.inboundLikes })');
  });

  it('issue 2 -- an already-matched profile shows a Message CTA instead of Pass/Like/Super Like', () => {
    const screen = source('features/discovery/FullProfileScreen.tsx');

    expect(screen).toContain('useMatchesQuery');
    expect(screen).toContain("matches.find((match: any) => match.user?.id === userId)");
    expect(screen).toContain('existingMatch ? (');
    expect(screen).toContain("navigate(`/chat/${existingMatch.id}`)");
    // The Pass/Super Like/Like row must only render in the *other* branch, not unconditionally.
    const matchedBranch = screen.slice(screen.indexOf('existingMatch ? ('), screen.indexOf(') : ('));
    const unmatchedBranch = screen.slice(screen.indexOf(') : ('), screen.indexOf('{/* Actions */}', screen.indexOf('existingMatch')) + 2000);
    expect(matchedBranch).not.toContain('handleLike');
    expect(unmatchedBranch).toContain('handlePass');
    expect(unmatchedBranch).toContain('handleLike(true)');
    expect(unmatchedBranch).toContain('handleLike(false)');
  });

  it('issue 4 -- the Ryvo Gold banner cannot crush its button on narrow screens', () => {
    const screen = source('features/likes/LikesScreen.tsx');
    const bannerStart = screen.indexOf('Non-Premium Banner CTA');
    const banner = screen.slice(bannerStart, screen.indexOf('Loading skeleton grid'));

    // The text block must be allowed to shrink/wrap instead of pushing the button off-layout,
    // and the button must never be crushed by it.
    expect(banner).toContain('min-w-0 flex-1');
    expect(banner).toContain('shrink-0');
    // The description previously (mis)used text-micro (11px/14px, tight tracking -- meant for
    // short uppercase badge labels), not a two-line sentence.
    expect(banner).not.toContain('text-micro text-white/80');
    expect(banner).toContain('text-caption text-white/80');
    expect(banner).toContain('leading-relaxed');
  });

  it('issue 5 -- Discover action buttons clear the floating bottom nav including safe-area', () => {
    const screen = source('features/discovery/DiscoverScreen.tsx');
    const actionBarDiv = screen.slice(
      screen.indexOf('className="flex items-center justify-around max-w-sm mx-auto w-full'),
      screen.indexOf('z-sticky">') + 10
    );

    // A bare fixed mb-20 (no safe-area term) is exactly the bug: it ignores
    // env(safe-area-inset-bottom), which the floating nav itself already accounts for.
    expect(actionBarDiv).not.toMatch(/\bmb-20\b/);
    expect(actionBarDiv).toContain('var(--safe-bottom)');
  });

  it('issue 6 -- the match modal renders real photos for every photo shape the API sends, including /api/me\'s', () => {
    const modal = source('components/MatchModal.tsx');

    // getPhotoUrl (mediaService) is the one helper documented to handle all three photo shapes:
    // a plain string, { url }, and /api/me's { original, thumbnail, medium, large } (no .url).
    // The old inline `first?.url` reimplementation only handled the first two, so the current
    // user's own avatar (sourced from /api/me via useAuthStore) silently rendered as initials.
    expect(modal).toContain("import { getPhotoUrl } from '../services/media/mediaService'");
    expect(modal).toContain('getPhotoUrl(user.photos[0])');
    expect(modal).not.toContain("typeof first === 'object' ? first?.url : first");
  });

  it('issue 7 -- the swiped/matched dedup set survives a Discover remount, not just a re-render', () => {
    const screen = source('features/discovery/DiscoverScreen.tsx');

    // /discover and /discover/:userId are sibling routes (routes/index.tsx), so viewing a full
    // profile or a match's chat and navigating back unmounts and remounts DiscoverScreen. A
    // useRef-held Set resets to empty on that remount; a module-level Set does not, so it must
    // be declared outside the component, not via useRef inside it.
    const componentStart = screen.indexOf('export const DiscoverScreen');
    const moduleLevelDecl = screen.slice(0, componentStart);
    expect(moduleLevelDecl).toMatch(/^const consumedProfileIds = new Set<string>\(\);$/m);
    expect(screen).not.toContain('consumedProfileIdsRef');
    expect(screen).not.toContain('useRef(new Set<string>())');
    // Still cleared on an explicit rescan and on a location-driven feed refresh.
    expect(screen).toContain('consumedProfileIds.clear()');
  });
});
