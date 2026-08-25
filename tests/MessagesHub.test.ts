import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildOfficialRyvoThread } from '../src/features/chat/officialRyvo';

const source = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), 'src', relativePath), 'utf8');

describe('Messages communication hub', () => {
  it('groups three admin messages into one chronological official thread', () => {
    const thread = buildOfficialRyvoThread([
      { id: '3', type: 'ADMIN_TEST', body: 'third', createdAt: '2026-08-22T22:03:00Z' },
      { id: '1', event_type: 'MODERATOR_MESSAGE', body: 'first', created_at: '2026-08-22T22:01:00Z' },
      { id: '2', type: 'SYSTEM_MESSAGE', body: 'second', createdAt: '2026-08-22T22:02:00Z' },
    ]);
    expect(thread).toHaveLength(3);
    expect(thread.map((message) => message.body)).toEqual(['first', 'second', 'third']);
    expect(source('features/chat/MessagesScreen.tsx').match(/navigate\('\/messages\/ryvo'\)/g)).toHaveLength(1);
  });

  it('deduplicates the same persisted notification delivered by socket, push and reload', () => {
    const persisted = { id: 'same-id', type: 'MODERATOR_MESSAGE', body: 'Safety', createdAt: '2026-08-22T22:01:00Z' };
    expect(buildOfficialRyvoThread([persisted, { ...persisted }, { ...persisted }])).toHaveLength(1);
  });

  it('keeps confessions in the hub with anonymous moderation and cursor loading', () => {
    const messages = source('features/chat/MessagesScreen.tsx');
    const confessions = source('features/social/ConfessionsScreen.tsx');
    const comments = source('features/social/CommentsSheet.tsx');
    const settings = source('features/profile/SettingsScreen.tsx');
    const ownProfile = source('features/profile/OwnProfileScreen.tsx');
    const routes = source('routes/index.tsx');
    const queries = source('hooks/useQueries.ts');
    expect(messages).toContain('Sohbetler');
    expect(messages).toContain('İtiraflar');
    expect(messages).toContain('role="tablist"');
    expect(messages).toContain('aria-selected');
    // Confessions copy is fully localized (t('key')) rather than hardcoded Turkish -- assert the
    // translation-key wiring instead of literal source text.
    expect(confessions).toContain("t('confessionShareCta')");
    expect(confessions).toContain("t('reportLabel')");
    expect(confessions).toContain('fetchNextPage');
    expect(confessions).toContain('maxLength={1000}');
    expect(confessions).not.toContain('item.user?.name');
    expect(comments).toContain("comment.anonymousBadge || 'Anonim Üye'");
    expect(comments).not.toContain('comment.user');
    expect(settings).not.toContain('İtiraf');
    expect(ownProfile).not.toContain('İtiraflar & Sosyal Akış');
    expect(routes).toContain('<Navigate to="/messages?tab=confessions" replace />');
    expect(queries).toContain("params.set('cursor', pageParam)");
    expect(queries).toContain("apiClient.post(`/api/social/confessions/${id}/report`");
    expect(queries).toContain('queryClient.setQueriesData<InfiniteData<ConfessionsPage');
    expect(queries).toContain('items: [created, ...pages[0].items]');
    expect(confessions).toContain('createInFlightRef.current');
    expect(confessions).toContain('createConfession.mutateAsync(cleanText)');
  });

  it('keeps the five-item bottom navigation and chat-only unread badge semantics', () => {
    const nav = source('components/FloatingNavBar.tsx');
    expect(nav.match(/path: '\/(discover|likes|map|messages|profile)'/g)).toHaveLength(5);
    expect(nav).not.toContain("path: '/confessions'");
    // Regression: this previously read `unreadCount + Number(notificationData?.unreadCount || 0)`,
    // folding the generic in-app-notifications count (admin campaigns, lifecycle events, etc.)
    // into the Messages badge -- contradicting this test's own "chat-only" premise and producing
    // a phantom unread count for an account with unrelated unread notifications.
    expect(nav).toContain('badge: unreadCount,');
    expect(nav).not.toMatch(/badge:\s*unreadCount\s*\+/);
    expect(nav).toContain("'/messages/ryvo'");
  });

  it('renders the compact empty chat state and modern messaging surfaces', () => {
    const messages = source('features/chat/MessagesScreen.tsx');
    const bubble = source('features/chat/MessageBubble.tsx');
    const official = source('features/chat/OfficialRyvoThread.tsx');
    expect(messages).toContain('MessageCircle');
    expect(messages).toContain('Henüz Sohbet Yok');
    expect(messages).toContain('Yeni bir eşleşme olduğunda sohbetlerin burada düzenli şekilde görünür.');
    expect(messages).toContain("Keşfet'e Git");
    expect(messages).toContain('aria-label="Sohbet listesi"');
    expect(messages).toContain('Resmi');
    expect(bubble).toContain('isFirstInGroup');
    expect(bubble).toContain('isLastInGroup');
    expect(bubble).toContain("bg-white/[0.12]");
    expect(bubble).toContain('title="Mesaj işlemleri"');
    expect(official).toContain('formatMessageDay');
    expect(official).toContain('MessageBubble');
    expect(official).toContain('readOnly');
    expect(official).toContain('Bu, Ryvo’dan gelen güvenli ve tek yönlü bir konuşmadır.');
  });

  it('uses the 21st conversation foundation without shipping registry demo data', () => {
    const chat = source('features/chat/ChatScreen.tsx');
    const bubble = source('features/chat/MessageBubble.tsx');
    const official = source('features/chat/OfficialRyvoThread.tsx');
    const productionSources = `${chat}\n${bubble}\n${official}`;

    expect(chat).toContain('aria-label="Sohbet geçmişi"');
    expect(chat).toContain('aria-label="Sohbet seçenekleri"');
    expect(chat).toContain("label: 'Kullanıcıyı bildir'");
    expect(chat).toContain("label: 'Kullanıcıyı engelle'");
    expect(chat).toContain("type={safetyAction || 'report'}");
    expect(productionSources).not.toMatch(/DEMO_USER|DEMO_OTHER|DEMO_MESSAGES|Alice|dicebear\.com|hextaui\.com|user-123|user-456/);
    expect(productionSources).not.toContain('h-[75vh]');
    expect(productionSources).not.toContain('max-w-2xl');
  });
});
