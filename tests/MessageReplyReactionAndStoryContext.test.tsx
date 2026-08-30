import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MessageBubble, type ChatMessage } from '../src/features/chat/MessageBubble';

vi.mock('../src/services/media/mediaService', () => ({
  mediaService: { getAuthenticatedObjectUrl: vi.fn() },
  normalizeMediaUrl: (url?: string) => (url ? `https://cdn.test/${url}` : 'https://cdn.test/default-avatar.png'),
}));

vi.mock('../src/native/haptics', () => ({
  nativeHaptics: { impact: vi.fn() },
}));

function baseMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    matchId: 'match-1',
    senderId: 'partner-1',
    text: 'Merhaba!',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('RYVO PATCH 02 issues 4/5/1 — reply swipe, double-tap reaction, story-reply context', () => {
  it('issue 5: a double-tap (two fast taps) toggles the heart reaction exactly once', () => {
    const onReact = vi.fn();
    render(<MessageBubble message={baseMessage()} isMe={false} onReact={onReact} />);

    const bubble = screen.getByText('Merhaba!').closest('div[class*="rounded-"]') as HTMLElement;
    expect(bubble).toBeTruthy();

    fireEvent.click(bubble);
    fireEvent.click(bubble);

    expect(onReact).toHaveBeenCalledTimes(1);
    expect(onReact).toHaveBeenCalledWith(expect.objectContaining({ id: 'msg-1' }), '❤️');
  });

  it('issue 5: a single tap alone never fires the reaction', () => {
    const onReact = vi.fn();
    render(<MessageBubble message={baseMessage()} isMe={false} onReact={onReact} />);

    const bubble = screen.getByText('Merhaba!').closest('div[class*="rounded-"]') as HTMLElement;
    fireEvent.click(bubble);

    expect(onReact).not.toHaveBeenCalled();
  });

  it('issue 4: the swipe-to-reply affordance only renders when onReply is actually wired up', () => {
    const { container, rerender } = render(<MessageBubble message={baseMessage()} isMe={false} onReply={vi.fn()} />);
    expect(container.querySelector('svg.lucide-reply')).toBeTruthy();

    rerender(<MessageBubble message={baseMessage()} isMe={false} readOnly />);
    expect(container.querySelector('svg.lucide-reply')).toBeFalsy();
  });

  it('issue 1: a story-reply message renders its story preview/context, not a bare text bubble', () => {
    render(
      <MessageBubble
        message={baseMessage({
          text: 'Bayıldım!',
          replyToStoryId: 'story-9',
          replyToStoryPreview: { id: 'story-9', mediaUrl: '/media/public/social/story.jpg', caption: 'Plajda' },
        })}
        isMe={false}
      />
    );

    expect(screen.getByText(/Replied to your story/)).toBeTruthy();
    expect(screen.getByText(/Plajda/)).toBeTruthy();
    expect(screen.getByText('Bayıldım!')).toBeTruthy();
  });

  it('issue 1: a normal reply (no story) never shows story-reply context', () => {
    render(<MessageBubble message={baseMessage()} isMe={false} />);
    expect(screen.queryByText(/Hikayene yanıt verdi/)).toBeFalsy();
  });

  it('persists a normal reply quote from its immutable snapshot when the parent page is not loaded', () => {
    render(
      <MessageBubble
        message={baseMessage({
          id: 'reply-1',
          text: 'Yanıt',
          replyToMessageId: 'old-parent',
          replyToMessagePreview: { id: 'old-parent', senderId: 'partner-1', text: 'Kalıcı alıntı', messageType: 'TEXT' },
        })}
        isMe={false}
      />
    );
    expect(screen.getByText('Kalıcı alıntı')).toBeTruthy();
  });

  it('renders a graceful fallback when a reply parent is deleted or unavailable', () => {
    render(
      <MessageBubble
        message={baseMessage({
          id: 'reply-2',
          replyToMessageId: 'deleted-parent',
          replyToMessagePreview: { id: 'deleted-parent', unavailable: true },
        })}
        isMe={false}
      />
    );
    expect(screen.getByText(/deleted|silindi/i)).toBeTruthy();
  });
});
