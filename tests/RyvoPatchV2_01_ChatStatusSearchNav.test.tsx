import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MessageBubble, type ChatMessage } from '../src/features/chat/MessageBubble';

function baseMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    matchId: 'match-1',
    senderId: 'me',
    text: 'Merhaba!',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function readSource(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('RYVO PATCH V2 01/05 issue 1 — real sent/delivered/read chat ticks, not a UI guess', () => {
  it('a message with neither deliveredAt nor isRead renders a single (sent) tick', () => {
    const { container } = render(<MessageBubble message={baseMessage()} isMe />);
    expect(container.querySelector('svg.lucide-check')).toBeTruthy();
    expect(container.querySelector('svg.lucide-check-check')).toBeFalsy();
  });

  it('a delivered-but-unread message renders a double gray tick, distinct from read', () => {
    const { container } = render(
      <MessageBubble message={baseMessage({ deliveredAt: new Date().toISOString(), isRead: false })} isMe />
    );
    const doubleTick = container.querySelector('svg.lucide-check-check');
    expect(doubleTick).toBeTruthy();
    expect(doubleTick?.getAttribute('class') || '').not.toMatch(/#34B7F1/);
  });

  it('a read message renders a double BLUE tick', () => {
    const { container } = render(
      <MessageBubble
        message={baseMessage({ deliveredAt: new Date().toISOString(), isRead: true, readAt: new Date().toISOString() })}
        isMe
      />
    );
    const doubleTick = container.querySelector('svg.lucide-check-check');
    expect(doubleTick).toBeTruthy();
    expect(doubleTick?.getAttribute('class') || '').toMatch(/text-\[#34B7F1\]/);
  });

  it('an EARLIER message (not the last one sent) still reflects its own real read state -- no more last-message-only guessing', () => {
    // This is the actual root-cause regression: the old implementation only ever computed a tick
    // for whichever message id matched a separately-tracked "last mine" id, so every earlier sent
    // message was frozen at a single tick forever regardless of its real state. Render two
    // messages from me, both fully read, independently -- both must show the blue double tick.
    const { container: first } = render(
      <MessageBubble message={baseMessage({ id: 'earlier', isRead: true, deliveredAt: new Date().toISOString() })} isMe />
    );
    const { container: second } = render(
      <MessageBubble message={baseMessage({ id: 'latest', isRead: true, deliveredAt: new Date().toISOString() })} isMe />
    );
    expect(first.querySelector('svg.lucide-check-check')?.getAttribute('class') || '').toMatch(/text-\[#34B7F1\]/);
    expect(second.querySelector('svg.lucide-check-check')?.getAttribute('class') || '').toMatch(/text-\[#34B7F1\]/);
  });

  it('MessageBubble no longer exposes the old isLastMineRead estimate prop', () => {
    const source = readSource('src/features/chat/MessageBubble.tsx');
    expect(source).not.toMatch(/isLastMineRead/);
    expect(source).toMatch(/message\.isRead/);
    expect(source).toMatch(/message\.deliveredAt/);
  });

  it('ChatScreen patches per-message isRead/deliveredAt from message:read and handles message:delivered', () => {
    const source = readSource('src/features/chat/ChatScreen.tsx');
    expect(source).not.toMatch(/isLastMineRead/);
    expect(source).not.toMatch(/partnerReadAt/);
    expect(source).toMatch(/socketService\.on\('message:read'/);
    expect(source).toMatch(/socketService\.on\('message:delivered'/);
    expect(source).toMatch(/isRead:\s*true,\s*readAt:\s*data\.readAt/);
  });

  it('RealtimeSync acks delivery globally via message:new, independent of which chat screen is open', () => {
    const source = readSource('src/components/RealtimeSync.tsx');
    expect(source).toMatch(/socketService\.on\('message:new'/);
    expect(source).toMatch(/socketService\.acknowledgeDelivered/);
  });

  it('socketService exposes acknowledgeDelivered emitting message:delivered', () => {
    const source = readSource('src/services/socket/socketService.ts');
    expect(source).toMatch(/acknowledgeDelivered\(matchId: string, messageIds: string\[\]\)/);
    expect(source).toMatch(/this\.emit\('message:delivered', \{ matchId, messageIds \}\)/);
  });
});

describe('RYVO PATCH V2 01/05 issue 2 — other user\'s profile back button is reachable on notched iPhones', () => {
  it('FullProfileScreen no longer positions either back button with a bare, non-safe-area top offset', () => {
    const source = readSource('src/features/discovery/FullProfileScreen.tsx');
    // The old bugs: the loading-skeleton button used a nonexistent `top-safe` Tailwind class
    // (never defined anywhere in this codebase's CSS, so it silently did nothing), and the loaded
    // button used a flat `top-4` that ignored env(safe-area-inset-top) entirely -- both left the
    // button under the notch/Dynamic Island hit-testing dead zone on affected iPhones.
    expect(source).not.toMatch(/className="absolute top-safe start-4/);
    expect(source).not.toMatch(/className="absolute top-4 start-4 z-20"/);
    const geriButtonBlocks = source.split("aria-label={t('backButtonLabel')}").length - 1;
    expect(geriButtonBlocks).toBeGreaterThanOrEqual(2);
    // RYVO PATCH V5 01: the previously-duplicated `top-[calc(var(--safe-top)+1rem)]` arbitrary
    // value was consolidated into one reusable `.top-safe-offset` utility (globals.css) so every
    // overlay back button shares the same safe-area clearance from a single definition.
    expect(source.match(/top-safe-offset/g)?.length).toBeGreaterThanOrEqual(2);
    const globalsCss = readSource('src/styles/globals.css');
    expect(globalsCss).toContain('.top-safe-offset');
    expect(globalsCss).toContain('top: calc(var(--safe-top) + 1rem);');
  });
});

describe('RYVO PATCH V2 01/05 issue 3 — Passport search results actually render and are selectable', () => {
  it('the shared geo city service reads the real /api/geo/search-cities field names, not city.name/city.lat/city.lng', () => {
    // RYVO PATCH V5 01: PassportScreen and SocialMapScreen no longer each carry their own
    // copy-pasted DTO mapping -- both now go through this single service, so the field-name
    // guard now lives here instead of duplicated per screen.
    const source = readSource('src/services/geo/cityService.ts');
    // searchCitiesInDb (server/api/src/db.js) returns { city, country, latitude, longitude, ... }.
    // The old code read city.name (always undefined -> blank rows) and guarded selection on
    // `typeof city.lat === 'number'` (also always undefined -> every tap silently no-opped).
    expect(source).not.toMatch(/\.lat\b/);
    expect(source).not.toMatch(/\.lng\b/);
    expect(source).toMatch(/entry\?\.city \|\| entry\?\.name/);
    expect(source).toMatch(/entry\?\.latitude/);
    expect(source).toMatch(/entry\?\.longitude/);
  });

  it('PassportScreen consumes the shared service instead of its own duplicated fetch/DTO logic', () => {
    const source = readSource('src/features/passport/PassportScreen.tsx');
    expect(source).toContain("import { searchCities, type GeoCityResult } from '../../services/geo/cityService';");
    expect(source).not.toMatch(/city\.lat\b/);
    expect(source).not.toMatch(/city\.lng\b/);
    expect(source).not.toContain("apiClient.get(`/api/geo/search-cities");
  });
});
