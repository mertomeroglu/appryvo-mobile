import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SUPPORTED_APP_LOCALES } from '../src/i18n/appLocale';
import { SOCIAL_TRANSLATIONS } from '../src/features/social/socialLocale';
import { QUESTION_TRANSLATIONS } from '../src/features/questions/questionLocale';
import { REGISTRATION_STEPS } from '../src/features/auth/registrationSteps';
import { PLUS_PLAN_FEATURES, SELLABLE_TIER } from '../src/features/premium/subscriptionProducts';
import { resolvePushDestination } from '../src/services/push/pushRouting';

// Ryvo is a social/community-first app: a content Home feed, profile questions, community rooms,
// messages after an accepted connection, and a profile. These guards fail if any part of the
// retired swipe-dating loop (swipe deck, Super Like, Boost, Passport, age/distance filters,
// people map, dating "match" modal) comes back into the shipped client.

const SRC = join(__dirname, '../src');
const src = (path: string) => readFileSync(join(SRC, path), 'utf8');
const stripComments = (code: string) => code
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

function listCode(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listCode(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

// Translation dictionaries may still hold retired copy for older keys; they are data, not UI.
const DICTIONARIES = /(i18n\/appLocale|Locale)\.ts$/;
const codeFiles = listCode(SRC)
  .map((file) => relative(SRC, file).replace(/\\/g, '/'))
  .filter((file) => !DICTIONARIES.test(file));

describe('retired dating surfaces are gone from the client', () => {
  it.each([
    'features/discovery/SwipeCard.tsx',
    'features/discovery/DiscoverScreen.tsx',
    'features/likes/LikesScreen.tsx',
    'features/boost/BoostScreen.tsx',
    'features/passport/PassportScreen.tsx',
    'components/FilterBottomSheet.tsx',
    'components/MatchModal.tsx',
    'services/discovery/discoveryActionQueue.ts',
  ])('%s does not exist', (file) => {
    expect(existsSync(join(SRC, file))).toBe(false);
  });

  it('no code references a swipe card, match modal, filter sheet, Boost or Passport screen', () => {
    const offenders = codeFiles.filter((file) =>
      /SwipeCard|MatchModal|FilterBottomSheet|BoostScreen|PassportScreen|DiscoverScreen|LikesScreen/.test(stripComments(src(file))));
    expect(offenders).toEqual([]);
  });

  it('no code calls Super Like, Boost, Passport, rewind or people-map endpoints', () => {
    const endpoint = /\/api\/(discovery\/(superlike|map|feed|like|pass|rewind)|likes\/(superlike|inbound)|boost|passport)/;
    const offenders = codeFiles.filter((file) => endpoint.test(stripComments(src(file))));
    expect(offenders).toEqual([]);
  });

  it('the client cannot start a Boost or Super Like store purchase', () => {
    const offenders = codeFiles.filter((file) => /ryvo_boost_single|ryvo_superlike_pack|purchaseBoost/.test(stripComments(src(file))));
    expect(offenders).toEqual([]);
  });

  it('Super Like only survives as a legacy status mapped to a neutral label', () => {
    const allowed = new Set([
      'hooks/useQuestionQueries.ts', // SUPERLIKE_PENDING status union for pre-retirement rows
      'features/questions/QuestionInboxScreen.tsx', // -> statusAwaiting
      'features/discovery/FullProfileScreen.tsx', // -> statusAwaiting
      'hooks/useQueries.ts', // rewarded-ad session rewardType union kept for installed clients
      'components/RewardedAdSheet.tsx', // unused, not routed anywhere
    ]);
    const offenders = codeFiles.filter((file) => !allowed.has(file) && /super\s*like/i.test(stripComments(src(file))));
    expect(offenders).toEqual([]);
    expect(stripComments(src('features/questions/QuestionInboxScreen.tsx'))).toContain("SUPERLIKE_PENDING: 'statusAwaiting'");
  });

  it('no age slider or distance radius anywhere in the UI', () => {
    expect(existsSync(join(SRC, 'components/ui/DualRangeSlider.tsx'))).toBe(false);
    // The only range inputs left: a room's participant cap and the photo-crop zoom.
    const legitimateRanges = new Set(['features/rooms/CreateRoomScreen.tsx', 'components/ui/PhotoCropScreen.tsx']);
    const offenders = codeFiles.filter((file) => {
      const code = stripComments(src(file));
      return (!legitimateRanges.has(file) && /type="range"/.test(code)) || /ageRange|minAge:|maxAge:|maxDistance|distanceKm/.test(code);
    });
    expect(offenders).toEqual([]);
  });
});

describe('routes and navigation', () => {
  const routes = src('routes/index.tsx');
  const nav = src('components/FloatingNavBar.tsx');

  it('lands on Home and redirects every retired route instead of rendering it', () => {
    expect(routes).toContain('index: true, element: <Navigate to="/home" replace />');
    expect(routes).toContain("path: 'discover', element: <Navigate to=\"/home\" replace />");
    expect(routes).toContain("path: 'boost', element: <Navigate to=\"/profile\" replace />");
    expect(routes).toContain("path: 'passport', element: <Navigate to=\"/profile\" replace />");
    expect(routes).toContain("path: 'likes', element: <Navigate to=\"/inbox/questions\" replace />");
  });

  it('has exactly five tabs: Home, Questions, Rooms, Messages, Profile', () => {
    const tabs = [...nav.matchAll(/path: '([^']+)'/g)].map((m) => m[1]);
    expect(tabs).toEqual(['/home', '/inbox/questions', '/map', '/messages', '/profile']);
  });

  it('push notifications for retired features never open a retired screen', () => {
    expect(resolvePushDestination({ eventType: 'BOOST_ENDING' })).toBe('/profile');
    expect(resolvePushDestination({ eventType: 'BOOST' })).toBe('/profile');
  });
});

describe('Home feed is content-first', () => {
  const home = stripComments(src('features/home/HomeFeedScreen.tsx'));

  it('shows questions, live rooms and confessions -- not a deck of people', () => {
    expect(home).toContain('data-testid="home-question-card"');
    expect(home).toContain('data-testid="home-rooms-strip"');
    expect(home).toContain('data-testid="home-confessions-card"');
    expect(home).not.toMatch(/swipe|drag=|onDragEnd/i);
  });

  it('never shows distance, age, a compatibility score, or asks for location', () => {
    expect(home).not.toMatch(/distance|\.age\b|compatib|Geolocation|getCurrentPosition/i);
  });
});

describe('rooms-only map', () => {
  const map = stripComments(src('features/map/SocialMapScreen.tsx'));

  it('renders rooms and never people, gender filters or a visibility check-in', () => {
    expect(map).toContain('communityRoomsService');
    expect(map).not.toMatch(/gender|'people'|mapVisible|checkInToMap|useDiscoveryMapQuery/i);
  });
});

describe('connections, not matches', () => {
  it('an accepted answer opens the neutral connection sheet', () => {
    const inbox = stripComments(src('features/questions/QuestionInboxScreen.tsx'));
    expect(inbox).toContain('<ConnectionMadeSheet');
    const sheet = stripComments(src('features/social/ConnectionMadeSheet.tsx'));
    expect(sheet).not.toMatch(/heart|confetti|match/i);
  });

  it('question cards never show a percentage or age', () => {
    const inbox = stripComments(src('features/questions/QuestionInboxScreen.tsx'));
    expect(inbox).not.toMatch(/compatib|%\}|\.age\b/);
  });
});

describe('onboarding: gender, "looking for" and relationship goal are optional', () => {
  const wizard = stripComments(src('features/auth/RegistrationWizard.tsx'));

  it('has no "who are you looking for" or relationship-goal step', () => {
    const ids = REGISTRATION_STEPS.map((step) => step.id as string);
    expect(ids).not.toContain('interestedIn');
    expect(ids).not.toContain('relationshipGoal');
    expect(wizard).not.toMatch(/targetGender|relationshipGoal/);
  });

  it('never pre-selects a gender and lets the user skip it', () => {
    expect(wizard).toContain('useState<string | null>(null)');
    expect(wizard).toContain('data-testid="gender-skip"');
    expect(wizard).toContain('gender: gender ?? undefined');
  });

  it('editing the profile never requires a relationship goal, and completion never asks for one', () => {
    expect(stripComments(src('components/EditProfileModal.tsx'))).not.toContain('relationshipGoals.length < 1');
    expect(stripComments(src('lib/profileCompletion.ts'))).not.toMatch(/relationshipGoal|gender/i);
  });
});

describe('Premium sells Ryvo Plus with real benefits only', () => {
  const premium = stripComments(src('features/premium/PremiumScreen.tsx'));

  it('offers a single plan and keeps a notice for existing Gold members', () => {
    expect(SELLABLE_TIER).toBe('PLUS');
    expect(premium).not.toContain('setSelectedTier');
    expect(premium).toContain('data-testid="gold-legacy-notice"');
    expect(PLUS_PLAN_FEATURES.join(' ')).not.toMatch(/superlike|boost|passport|likes|rewind|incognito/i);
  });
});

describe('locale parity for the social shell', () => {
  it.each([
    ['socialLocale', SOCIAL_TRANSLATIONS as Record<string, Record<string, string>>],
    ['questionLocale', QUESTION_TRANSLATIONS as Record<string, Record<string, string>>],
  ])('%s has every key, non-empty, in all nine locales', (_name, dict) => {
    const reference = Object.keys(dict.tr).sort();
    for (const locale of SUPPORTED_APP_LOCALES) {
      expect(Object.keys(dict[locale]).sort(), locale).toEqual(reference);
      for (const key of reference) expect(dict[locale][key].trim().length, `${locale}.${key}`).toBeGreaterThan(0);
    }
  });

  it('the social shell copy uses no dating vocabulary in English', () => {
    const en = Object.values(SOCIAL_TRANSLATIONS.en).join(' ');
    expect(en).not.toMatch(/\b(match|swipe|super like|boost|passport|date|dating)\b/i);
  });
});
