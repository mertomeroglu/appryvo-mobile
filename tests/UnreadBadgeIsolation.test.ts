import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('Messages tab badge stays scoped to real unread messages only', () => {
  it('never folds the generic in-app notifications count into the Messages badge', () => {
    const nav = source('src/components/FloatingNavBar.tsx');
    // Regression: this previously summed unreadCount + notificationData.unreadCount, so an
    // account with 0 unread chats but N unrelated admin/lifecycle notifications showed a
    // phantom N on the Messages tab.
    expect(nav).not.toMatch(/badge:\s*unreadCount\s*\+/);
    expect(nav).toContain('badge: unreadCount,');
    expect(nav).not.toContain('useInAppNotificationsQuery');
  });

  it('resets the unread badge explicitly on logout instead of relying only on next reconnect', () => {
    const authStore = source('src/stores/useAuthStore.ts');
    // There's an earlier `logout: () => Promise<void>` type declaration above the real
    // implementation -- search past it so the slice bounds don't invert.
    const implStart = authStore.indexOf('logout: async () =>');
    const logoutBody = authStore.slice(implStart, authStore.indexOf('restoreSession:', implStart));
    expect(logoutBody).toContain('useUiStore.getState().setUnreadCount(0)');
  });
});
