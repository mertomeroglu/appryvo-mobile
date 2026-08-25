import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.resolve('src/features/discovery/DiscoverScreen.tsx'), 'utf8');

describe('Super Like zero-quota UX', () => {
  it('uses a clear quota sheet instead of a generic error or silent redirect', () => {
    expect(source).toContain("err?.code === 'SUPERLIKE_QUOTA_EXHAUSTED'");
    expect(source).toContain('setIsSuperLikeQuotaOpen(true)');
    expect(source).toContain('Super Like Hakkın Bitti');
    expect(source).toContain("Plus ve Gold'u İncele");
  });

  it('does not advertise a rewarded-ad route that the product does not support for Super Likes', () => {
    // Scoped to just the Super Like sheet's own markup (not end-of-file) so an unrelated later
    // sheet -- e.g. RewardedAdSheet, which legitimately offers ads for the separate daily-Like
    // quota -- can't make this assertion fail by simply appearing later in the same file.
    const start = source.indexOf('<BottomSheet isOpen={isSuperLikeQuotaOpen}');
    const end = source.indexOf('</BottomSheet>', start);
    const sheet = source.slice(start, end);
    expect(sheet).not.toMatch(/ödüllü reklam|rewarded/i);
  });
});
