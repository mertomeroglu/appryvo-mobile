import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Apple 4.3(b) remediation: the app was previously rejected for reading as an undifferentiated
// swipe-card clone. These are cheap, durable regression guards for the three product-hierarchy
// facts the remediation depends on -- they should fail loudly if a future change silently
// reverts World/Map to a secondary tab, makes Discover the landing screen again, or moves
// Confessions out of its existing location inside Messages.

const routesSrc = readFileSync(join(__dirname, '../src/routes/index.tsx'), 'utf8');
const navBarSrc = readFileSync(join(__dirname, '../src/components/FloatingNavBar.tsx'), 'utf8');

describe('Apple 4.3(b) product hierarchy', () => {
  it('the authenticated index route lands on World/Social Discovery (/map), not Discover (swipe)', () => {
    expect(routesSrc).toMatch(/index:\s*true,\s*element:\s*<Navigate to="\/map" replace \/>/);
    expect(routesSrc).not.toMatch(/index:\s*true,\s*element:\s*<Navigate to="\/discover" replace \/>/);
  });

  it('World/Map is the first (primary) bottom-nav tab, ahead of Discover', () => {
    const mapIndex = navBarSrc.indexOf("path: '/map'");
    const discoverIndex = navBarSrc.indexOf("path: '/discover'");
    expect(mapIndex).toBeGreaterThan(-1);
    expect(discoverIndex).toBeGreaterThan(-1);
    expect(mapIndex).toBeLessThan(discoverIndex);
  });

  it('Discover (swipe) still exists as a reachable secondary route, never removed', () => {
    expect(routesSrc).toMatch(/path:\s*'discover'/);
  });

  it('Confessions keeps its existing location: a redirect shim into Messages, not a standalone screen/tab', () => {
    expect(routesSrc).toMatch(/path:\s*'confessions',\s*element:\s*<Navigate to="\/messages\?tab=confessions" replace \/>/);
    expect(navBarSrc).not.toMatch(/confessions/i);
  });
});
