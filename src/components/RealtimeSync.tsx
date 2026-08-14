import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { ActionPerformed, PushNotificationSchema } from '@capacitor/push-notifications';
import { socketService } from '../services/socket/socketService';
import { useAuthStore } from '../stores/useAuthStore';
import { useAppLifecycleStore } from '../stores/useAppLifecycleStore';
import { useUiStore } from '../stores/useUiStore';
import { toast } from '../stores/useToastStore';
import { apiClient } from '../services/api/apiClient';
import { nativePush } from '../native/push';
import { QUERY_KEYS } from '../hooks/useQueries';

const DEBUG = import.meta.env.DEV;
const logLive = (...args: unknown[]) => {
  if (DEBUG) console.log('[RYVO_LIVE]', ...args);
};
const logPush = (...args: unknown[]) => {
  if (DEBUG) console.log('[RYVO_PUSH]', ...args);
};
const logApp = (...args: unknown[]) => {
  if (DEBUG) console.log('[RYVO_APP]', ...args);
};

/**
 * Mounted once at the app root (see AppShell). Owns everything that keeps the running app
 * current without a restart:
 *  - connects the socket as soon as the user is authenticated (previously only happened on a
 *    background->foreground transition, which never fires on a cold start -- the socket could
 *    go an entire session without ever connecting)
 *  - reconciles our own user record (Zustand `useAuthStore.user` + the TanStack `me` query,
 *    patched from the same fetch instead of two independent requests) whenever the server
 *    signals it changed, on every (re)connect, and on app resume
 *  - registers for push notifications (previously dead code -- defined, never called: no
 *    permission prompt, no token ever reached the backend, no foreground-receive handling)
 */
export const RealtimeSync: React.FC = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isForeground = useAppLifecycleStore((s) => s.isForeground);
  const wasForegroundRef = useRef(isForeground);
  const pushRegisteredRef = useRef(false);
  const hasConnectedBeforeRef = useRef(false);

  const reconcileProfile = async () => {
    const freshUser = await useAuthStore.getState().fetchMe().catch(() => null);
    if (freshUser) {
      queryClient.setQueryData(QUERY_KEYS.me, freshUser);
      logLive('query-invalidated', QUERY_KEYS.me.join('.'));
    }
  };

  // Socket connect + realtime event handlers.
  useEffect(() => {
    if (!isAuthenticated) return;

    socketService.connect();

    const offConnect = socketService.on('connect', () => {
      // socket.io's 'connect' fires identically on the very first connect and on every
      // automatic reconnect -- distinguish them here since the test/debug matrix requires
      // separate signals for the two.
      if (hasConnectedBeforeRef.current) {
        logLive('socket-reconnected');
      } else {
        hasConnectedBeforeRef.current = true;
        logLive('socket-connected');
      }
      // Either way our own state may have drifted (missed events) while disconnected.
      reconcileProfile();
      apiClient
        .get('/api/matches/unread-count')
        .then((res) => useUiStore.getState().setUnreadCount(res?.data?.unreadCount ?? 0))
        .catch(() => {});
    });
    const offDisconnect = socketService.on('disconnect', (reason: string) => logLive('socket-disconnected', reason));

    const offUserUpdated = socketService.on('user:updated', (payload: unknown) => {
      logLive('event-received user:updated', payload);
      reconcileProfile();
    });

    const offNotification = socketService.on('notification:new', (payload: any) => {
      logLive('event-received notification:new', payload);
      toast.show(payload?.title || payload?.body || 'Yeni bildirim', 'neutral');
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notifications });
    });

    // Aggregate unread message count, pushed on every new message and every read-receipt --
    // drives the Messages tab's nav-bar badge without the client having to poll.
    const offUnreadCount = socketService.on('unread:count', (payload: { totalUnread?: number }) => {
      useUiStore.getState().setUnreadCount(payload?.totalUnread ?? 0);
    });

    return () => {
      offConnect();
      offDisconnect();
      offUserUpdated();
      offNotification();
      offUnreadCount();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // App-resume reconciliation: background -> foreground brings own-user state, matches, and
  // inbound likes current. Deliberately narrow (not a full app reload) -- sockets can drop
  // while backgrounded, so realtime alone isn't enough to guarantee freshness on return.
  useEffect(() => {
    if (!isAuthenticated) return;
    const wasForeground = wasForegroundRef.current;
    wasForegroundRef.current = isForeground;
    if (!wasForeground && isForeground) {
      logApp('resumed');
      logApp('reconciliation-start');
      reconcileProfile();
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.matches });
      logLive('query-invalidated', QUERY_KEYS.matches.join('.'));
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.inboundLikes });
      logLive('query-invalidated', QUERY_KEYS.inboundLikes.join('.'));
      queryClient.invalidateQueries({ queryKey: ['discovery', 'likes', 'unread-count'] });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notifications });
      logApp('reconciliation-finished');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isForeground, isAuthenticated]);

  // Push notification registration (permission, token, foreground receive, tap navigation).
  useEffect(() => {
    if (!isAuthenticated || pushRegisteredRef.current) return;
    pushRegisteredRef.current = true;

    nativePush.register(
      (token) => {
        logPush('token-registered');
        apiClient.post('/api/devices/push-token', { token, platform: 'android' }).catch(() => {});
      },
      (action: ActionPerformed) => {
        const data: any = action?.notification?.data || {};
        if (data.type === 'chat' && data.matchId) {
          navigate(`/chat/${data.matchId}`);
        } else if (
          data.type === 'moderator_message' ||
          data.type === 'VERIFICATION_APPROVED' ||
          data.type === 'VERIFICATION_REJECTED'
        ) {
          navigate('/profile');
        } else if (data.type === 'incoming_call' || data.type === 'missed_call') {
          navigate('/messages');
        }
      },
      (notification: PushNotificationSchema) => {
        logPush('foreground-received');
        const title = notification.title || (notification.data as any)?.title;
        const body = notification.body || (notification.data as any)?.body;
        if (title || body) toast.show([title, body].filter(Boolean).join(': '), 'neutral');
        // Whatever triggered this push likely also touched our own state (verification,
        // moderator message, etc.) -- reconcile rather than waiting for the next event/resume.
        reconcileProfile();
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  return null;
};
