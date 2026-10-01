import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Apple 4.3(b) remediation: the app was previously rejected for reading as an undifferentiated
// swipe-card clone. These are cheap, durable regression guards for the product hierarchy the
// remediation depends on -- they should fail loudly if a future change brings back the swipe
// deck as a destination, stops landing on the Home feed, or moves Confessions out of Messages.

const routesSrc = readFileSync(join(__dirname, '../src/routes/index.tsx'), 'utf8');
const navBarSrc = readFileSync(join(__dirname, '../src/components/FloatingNavBar.tsx'), 'utf8');

describe('Apple 4.3(b) product hierarchy', () => {
  it('the authenticated index route lands on the content-first Home feed', () => {
    expect(routesSrc).toMatch(/index:\s*true,\s*element:\s*<Navigate to="\/home" replace \/>/);
    expect(routesSrc).not.toMatch(/index:\s*true,\s*element:\s*<Navigate to="\/discover" replace \/>/);
  });

  it('bottom navigation is Home, Questions, Rooms, Messages, Profile -- in that order', () => {
    const order = ["path: '/home'", "path: '/inbox/questions'", "path: '/map'", "path: '/messages'", "path: '/profile'"]
      .map((token) => navBarSrc.indexOf(token));
    for (const index of order) expect(index).toBeGreaterThan(-1);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(navBarSrc).not.toContain("path: '/discover'");
  });

  it('the swipe deck route is gone: /discover only redirects to Home (profile deep links stay)', () => {
    expect(routesSrc).toMatch(/path:\s*'discover',\s*element:\s*<Navigate to="\/home" replace \/>/);
    expect(routesSrc).toMatch(/path:\s*'discover\/:userId'/);
  });

  it('Confessions keeps its existing location: a redirect shim into Messages, not a standalone screen/tab', () => {
    expect(routesSrc).toMatch(/path:\s*'confessions',\s*element:\s*<Navigate to="\/messages\?tab=confessions" replace \/>/);
    expect(navBarSrc).not.toMatch(/confessions/i);
  });
});
