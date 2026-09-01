import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Capacitor } from '@capacitor/core';
import type { NotificationTapEvent, NotificationReceivedPayload } from '../native/push';
import { socketService } from '../services/socket/socketService';
import { useAuthStore } from '../stores/useAuthStore';
import { useAppLifecycleStore } from '../stores/useAppLifecycleStore';
import { useUiStore } from '../stores/useUiStore';
import { toast } from '../stores/useToastStore';
import { apiClient } from '../services/api/apiClient';
import { nativePush } from '../native/push';
import { QUERY_KEYS } from '../hooks/useQueries';
import { useCallStore } from '../stores/useCallStore';
import { nativeHaptics } from '../native/haptics';
import { nativeCallAudio } from '../native/callAudio';
import { webrtcService } from '../services/call/webrtcService';
import { callService } from '../services/call/callService';
import { pushRegistrationService } from '../services/push/pushRegistrationService';
import { resolvePushDestination, shouldSuppressForegroundPush, resolveDeepLinkDestination } from '../services/push/pushRouting';
import { nativeDeepLinks } from '../native/deepLinks';
import { crashReporting } from '../native/crashReporting';
import { translateSync } from '../i18n/appLocale';

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
  const authenticatedUserId = useAuthStore((s) => s.user?.id || null);
  const isForeground = useAppLifecycleStore((s) => s.isForeground);
  const wasForegroundRef = useRef(isForeground);
  const hasConnectedBeforeRef = useRef(false);
  const seenOfficialDeliveryIdsRef = useRef(new Set<string>());

  const reconcileProfile = async () => {
    const freshUser = await useAuthStore.getState().fetchMe().catch(() => null);
    if (freshUser) {
      queryClient.setQueryData(QUERY_KEYS.me, freshUser);
      logLive('query-invalidated', QUERY_KEYS.me.join('.'));
    }
    // QUERY_KEYS.entitlements is a separate cached query (used by e.g. the Super Like button)
    // with its own 2-minute staleTime -- an admin entitlement reset (or any other server-side
    // change to boost/superlike/premium state) emits the same generic user:updated event this
    // function already reconciles /api/me from, but /api/me and /api/entitlements are two
    // different endpoints/caches. Without this, the entitlements UI could keep showing a stale
    // count for up to 2 minutes (or indefinitely, since refetchOnWindowFocus is disabled) after
    // a real server-side change.
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.entitlements });
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
        reconcileProfile();
      } else {
        hasConnectedBeforeRef.current = true;
        logLive('socket-connected');
      }
      apiClient
        .get('/api/matches/unread-count')
        .then((res) => useUiStore.getState().setUnreadCount(res?.data?.unreadCount ?? 0))
        .catch(() => {});
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.matches });
    });
    const offDisconnect = socketService.on('disconnect', (reason: string) => {
      logLive('socket-disconnected', reason);
      // The disconnected device cannot receive the server's call:ended event for whatever call
      // it was in. Release its own camera/microphone immediately; the server notifies and
      // cleans up the remote participant independently.
      if (useCallStore.getState().activeCall) {
        webrtcService.hangup();
        void nativeCallAudio.resetAudioMode();
        useCallStore.getState().endCall();
      }
    });

    const offUserUpdated = socketService.on('user:updated', (payload: unknown) => {
      logLive('event-received user:updated', payload);
      reconcileProfile();
    });

    const offNotification = socketService.on('notification:new', (payload: any) => {
      logLive('event-received notification:new', payload);
      const deliveryId = String(payload?.id || '');
      if (!deliveryId || !seenOfficialDeliveryIdsRef.current.has(deliveryId)) {
        if (deliveryId) seenOfficialDeliveryIdsRef.current.add(deliveryId);
        toast.show(payload?.title || payload?.body || translateSync('realtimeNewNotificationFallback'), 'neutral');
      }
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notifications });
    });

    const offAccountStatus = socketService.on('account:status', (payload: { status?: string }) => {
      const status = payload?.status?.toUpperCase();
      if (status !== 'SUSPENDED' && status !== 'BANNED') return;
      toast.error(status === 'SUSPENDED' ? translateSync('realtimeAccountSuspendedError') : translateSync('realtimeAccountDisabledError'));
      void useAuthStore.getState().logout().finally(() => navigate('/auth', { replace: true }));
    });

    // Aggregate unread message count, pushed on every new message and every read-receipt --
    // drives the Messages tab's nav-bar badge without the client having to poll.
    const offUnreadCount = socketService.on('unread:count', (payload: { totalUnread?: number }) => {
      useUiStore.getState().setUnreadCount(payload?.totalUnread ?? 0);
    });

    // Real chat delivery receipts (WhatsApp-style single/double/blue ticks) require the
    // recipient's device to ack the instant it learns a message exists, regardless of whether
    // that specific chat screen is open -- ChatScreen's own message listener only fires while
    // its socket is joined to that exact match's room. This lightweight ping (matchId + id only,
    // no message content) always reaches every connected device via the always-joined
    // user:${userId} room; acking it here is what turns "sent" into a real "delivered" tick
    // instead of the message ever silently stopping at single-tick until the recipient happens
    // to open that specific conversation.
    const offMessageNew = socketService.on('message:new', (payload: { matchId?: string; id?: string; senderId?: string }) => {
      if (!payload?.matchId || !payload?.id || payload.senderId === authenticatedUserId) return;
      socketService.acknowledgeDelivered(payload.matchId, [payload.id]);
    });

    // A socket can miss message:new while the app is offline. The server replays persisted,
    // still-undelivered ids on every physical reconnect; ACK in conversation-sized batches.
    const offPendingDelivery = socketService.on('messages:pending-delivery', (payload: {
      conversations?: { matchId?: string; messageIds?: string[] }[];
    }) => {
      for (const conversation of payload?.conversations || []) {
        if (!conversation?.matchId || !Array.isArray(conversation.messageIds) || conversation.messageIds.length === 0) continue;
        socketService.acknowledgeDelivered(conversation.matchId, conversation.messageIds);
      }
    });

    // Match creation used to rely on the liker screen's local mutation invalidation. That left
    // the other person with a stale Messages list until a resume/manual refresh. The server now
    // emits match:new to both user rooms; keep the root cache current even when Messages is not
    // mounted yet.
    const offNewMatch = socketService.on('match:new', () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.matches });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.inboundLikes });
    });

    const offMatchUpdated = socketService.on('match:updated', (payload: {
      matchId?: string;
      lastMessage?: string;
      lastMessageTime?: string;
      unreadCount?: number;
    }) => {
      if (!payload?.matchId) return;
      let found = false;
      queryClient.setQueryData<any[]>(QUERY_KEYS.matches, (current) => {
        if (!Array.isArray(current)) return current;
        const next = current.map((match) => {
          if (match.id !== payload.matchId) return match;
          found = true;
          return {
            ...match,
            ...(payload.lastMessage !== undefined ? { lastMessage: payload.lastMessage, last_message: payload.lastMessage } : {}),
            ...(payload.lastMessageTime !== undefined ? { lastMessageTime: payload.lastMessageTime, last_message_time: payload.lastMessageTime } : {}),
            ...(payload.unreadCount !== undefined ? { unreadCount: payload.unreadCount, unread_count: payload.unreadCount } : {}),
          };
        });
        return next.sort((a, b) => {
          const aTime = new Date(a.lastMessageTime || a.created_at || 0).getTime();
          const bTime = new Date(b.lastMessageTime || b.created_at || 0).getTime();
          return bTime - aTime;
        });
      });
      if (!found) queryClient.invalidateQueries({ queryKey: QUERY_KEYS.matches });
    });

    const offMatchRemoved = socketService.on('match:removed', (payload: { matchId?: string }) => {
      if (!payload?.matchId) return;
      queryClient.setQueryData<any[]>(QUERY_KEYS.matches, (current) => (
        Array.isArray(current) ? current.filter((match) => (match.id || match.match_id) !== payload.matchId) : current
      ));
      queryClient.removeQueries({ queryKey: QUERY_KEYS.messages(payload.matchId) });
      queryClient.invalidateQueries({ queryKey: ['matches', 'unread-count'] });
      if (window.location.pathname === `/chat/${payload.matchId}`) {
        toast.show(translateSync('realtimeMatchRemovedToast'), 'neutral');
        navigate('/messages', { replace: true });
      }
    });

    const offIncomingCall = socketService.on('call:incoming', (data: any) => {
      nativeHaptics.impact();
      useCallStore.getState().startCall({
        callId: data.callId,
        matchId: data.matchId,
        targetUserId: data.callerUid,
        targetUserName: data.callerName || translateSync('callUnknownCallerFallback'),
        type: data.type || 'voice',
        status: 'RINGING',
        direction: 'incoming',
        offer: data.offer,
      });
    });

    // Call signaling response handlers. Deliberately registered here (RealtimeSync mounts once,
    // eagerly, at app start) rather than inside CallOverlay, which is lazy-loaded and only
    // rendered once activeCall is already non-null -- registering these only once that lazy
    // chunk finishes fetching/mounting left a real window (the entire ringing period on the
    // callee's side, worse again on a cold start) where the peer's SDP/ICE signals had no
    // listener at all and were silently dropped by socket.io, on top of the same-issue queuing
    // fix in webrtcService.addIceCandidate. webrtcService/callService are simple, UI-free
    // modules -- eagerly importing them here does not pull in CallOverlay's own (larger, icon-
    // heavy) bundle, so the original lazy-loading intent for the call UI itself is preserved.
    const offCallAnswered = socketService.on('call:answered', async (data: any) => {
      try {
        await webrtcService.setRemoteAnswer(data.answer);
        useCallStore.getState().setCallStatus('CONNECTING');
      } catch (error) {
        console.error('[CALL] Failed to apply remote answer', error);
        callService.endCall('remote_answer_error');
      }
    });

    const offCallIceCandidate = socketService.on('call:ice-candidate', (data: any) => {
      void webrtcService.addIceCandidate(data.candidate);
    });

    const offCallRenegotiateOffer = socketService.on('call:renegotiate-offer', (data: any) => {
      void callService.handleIncomingRenegotiateOffer(data.offer);
    });

    const offCallRenegotiateAnswer = socketService.on('call:renegotiate-answer', (data: any) => {
      void callService.handleIncomingRenegotiateAnswer(data.answer);
    });

    const offCallEnded = socketService.on('call:ended', () => {
      webrtcService.hangup();
      void nativeCallAudio.resetAudioMode();
      useCallStore.getState().endCall();
    });

    const offCallBusy = socketService.on('call:busy', () => {
      webrtcService.hangup();
      void nativeCallAudio.resetAudioMode();
      useCallStore.getState().endCall();
    });

    return () => {
      offConnect();
      offDisconnect();
      offUserUpdated();
      offNotification();
      offAccountStatus();
      offUnreadCount();
      offMessageNew();
      offPendingDelivery();
      offCallAnswered();
      offCallIceCandidate();
      offCallRenegotiateOffer();
      offCallRenegotiateAnswer();
      offCallEnded();
      offCallBusy();
      offNewMatch();
      offMatchUpdated();
      offMatchRemoved();
      offIncomingCall();
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
      if (authenticatedUserId) {
        pushRegistrationService.ensureCurrentUser(authenticatedUserId)
          .then((synced) => logPush(synced ? 'token-resynced-on-resume' : 'token-sync-current'))
          .catch((error) => console.warn('[RYVO_PUSH] resume token sync failed', error?.message || error));
      }
      logApp('reconciliation-finished');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isForeground, isAuthenticated, authenticatedUserId]);

  // Push notification registration (permission, token, foreground receive, tap navigation).
  useEffect(() => {
    if (!isAuthenticated || !authenticatedUserId) return;

    // A cached native token is re-associated immediately when the account changes. Calling
    // register() below then confirms the current FCM/APNs token and handles token rotation.
    pushRegistrationService.ensureCurrentUser(authenticatedUserId)
      .then((synced) => logPush(synced ? 'cached-token-associated' : 'cached-token-current'))
      .catch((error) => console.warn('[RYVO_PUSH] cached token sync failed', error?.message || error));

    void nativePush.register(
      async (token) => {
        const platform = Capacitor.getPlatform();
        if (platform !== 'android' && platform !== 'ios') return;

        logPush('registration-event', platform);
        try {
          const synced = await pushRegistrationService.registerToken(token, platform, authenticatedUserId);
          logPush(synced ? 'token-associated' : 'token-already-current');
        } catch (error: any) {
          // Do not log the token. Keeping the failure visible is essential; the old silent
          // catch made production registration failures indistinguishable from no event.
          console.warn('[RYVO_PUSH] token association failed', error?.message || error);
        }
      },
      (action: NotificationTapEvent) => {
        const data: any = action?.notification?.data || {};
        const destination = resolvePushDestination(data);
        if (destination) navigate(destination);
      },
      (notification: NotificationReceivedPayload) => {
        logPush('foreground-received');
        const data = (notification.data || {}) as Record<string, unknown>;
        const title = notification.title || data.title;
        const body = notification.body || data.body;
        const deliveryId = String(data.notificationId || data.deliveryId || '');
        const duplicateRealtimeUi = shouldSuppressForegroundPush(data, window.location.pathname);
        if (!duplicateRealtimeUi && (!deliveryId || !seenOfficialDeliveryIdsRef.current.has(deliveryId)) && (title || body)) {
          if (deliveryId) seenOfficialDeliveryIdsRef.current.add(deliveryId);
          toast.show([title, body].filter(Boolean).join(': '), 'neutral');
        }
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notifications });
        // Whatever triggered this push likely also touched our own state (verification,
        // moderator message, etc.) -- reconcile rather than waiting for the next event/resume.
        reconcileProfile();
      },
      (error) => console.warn('[RYVO_PUSH] native registration failed', error)
    ).catch((error) => console.warn('[RYVO_PUSH] registration setup failed', error?.message || error));

    return () => {
      void nativePush.removeAllListeners();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, authenticatedUserId]);

  // Deep links (custom com.appryvo.ryvo:// scheme and https://appryvo.online/... universal
  // links). Previously dead code -- nativeDeepLinks.addUrlListener was defined but never called
  // anywhere, so a tapped share link or a browser-to-app handoff had no effect once the app
  // launched. Registered once, independent of auth state, so a cold-start launch URL is still
  // caught; an unauthenticated destination simply falls through to whatever route guard is
  // already in place for that path.
  useEffect(() => {
    const listenerPromise = nativeDeepLinks.addUrlListener((event) => {
      const destination = resolveDeepLinkDestination(event.url);
      if (destination) navigate(destination);
    });
    return () => {
      void listenerPromise.then((handle) => handle.remove());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void crashReporting.setUserId(authenticatedUserId);
  }, [authenticatedUserId]);

  return null;
};
