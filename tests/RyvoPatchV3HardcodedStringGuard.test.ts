import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// RYVO PATCH V3: a full sweep converted ~40 files' hardcoded Turkish UI strings to i18n keys
// (appLocale.ts). This guard exists so the next screen added to the app doesn't quietly regress
// back to a hardcoded literal -- it re-runs the same detection heuristic used for the sweep and
// fails if a NEW offender shows up outside the deliberately-excluded set below.
const SRC_ROOT = join(__dirname, '../src');

// Already fully locale-aware data catalogs (per-locale Record<AppLocale, ...> maps) -- the
// Turkish text this scan would find inside them is the expected `tr` branch of that map, not a
// bug. Also excludes appLocale.ts itself (the translation dictionary IS Turkish text by design).
const EXCLUDED_FILES = new Set([
  'i18n/appLocale.ts',
  // Community Rooms owns a scoped, fully locale-aware Record<AppLocale, ...> dictionary so the
  // nine-locale feature can ship independently without inflating appLocale's already-large map.
  'features/rooms/roomsLocale.ts',
  // Connect Pass owns the same kind of scoped, fully locale-aware Record<AppLocale, ...>
  // dictionary as roomsLocale.ts, for the same reason (ship independently of appLocale.ts).
  'features/connect/connectLocale.ts',
  'lib/profileLabels.ts',
  'lib/languages.ts',
  'lib/interests.ts',
  'lib/interestLabels.ts',
  'lib/trustLabels.ts',
  'lib/countryFlags.ts',
  'lib/legalContent.ts',
  'lib/chatTranslationLanguages.ts',
]);

// Specific known, deliberate exceptions left in place by the sweep (see its own in-code
// comments for why). Keyed as `relativeFilePath::literal` so an unrelated new hardcoded string
// in the same file still fails the guard.
// (RYVO PATCH V4 03: the one entry that used to live here -- SupportScreen.tsx's category
// fallback -- was fixed at the root: GET /api/support/categories now returns stable codes
// (support_controller.js), and the client maps them through supportCategory* i18n keys instead
// of rendering server text as-is. No exceptions needed currently.)
const KNOWN_EXCEPTIONS = new Set<string>([]);

const TURKISH_CHAR_LITERAL = /(?<=["'`>])[^"'`<>{}]*[çğıöşüÇĞİÖŞÜ][^"'`<>{}]*(?=["'`<])/gu;

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
    .replace(/(^|[^:])\/\/.*$/gm, '$1'); // line comments (best-effort: avoids stripping URLs with `://`)
}

function listSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      listSourceFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe('hardcoded Turkish string guard', () => {
  it('finds no new hardcoded Turkish UI literals outside the documented exceptions', () => {
    const offenders: string[] = [];

    for (const file of listSourceFiles(SRC_ROOT)) {
      const relPath = relative(SRC_ROOT, file).replace(/\\/g, '/');
      if (EXCLUDED_FILES.has(relPath)) continue;

      const raw = readFileSync(file, 'utf8');
      const code = stripComments(raw);
      const matches = code.match(TURKISH_CHAR_LITERAL) || [];

      for (const match of matches) {
        const literal = match.trim();
        if (!literal) continue;
        const key = `${relPath}::${literal}`;
        if (KNOWN_EXCEPTIONS.has(key)) continue;
        offenders.push(key);
      }
    }

    expect(offenders).toEqual([]);
  });
});
