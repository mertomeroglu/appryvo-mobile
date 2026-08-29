import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowLeft, Camera, Flag, Gift as GiftIcon, Languages, Mic, MoreVertical, Phone, Send, Unlink, UserMinus, Video, X } from 'lucide-react';
import {
  QUERY_KEYS,
  useMessagesQuery,
  useMatchesQuery,
  useEditMessageMutation,
  useDeleteMessageMutation,
  useMarkViewOnceMutation,
  useUnmatchMutation,
  fetchOlderMessages,
} from '../../hooks/useQueries';
import { socketService } from '../../services/socket/socketService';
import { apiClient } from '../../services/api/apiClient';
import { getPhotoUrl, mediaService } from '../../services/media/mediaService';
import { callService } from '../../services/call/callService';
import { useAuthStore } from '../../stores/useAuthStore';
import { toast } from '../../stores/useToastStore';
import { nativeHaptics } from '../../native/haptics';
import { ProfileAvatarFrame } from '../../components/ui/FramedAvatar';
import { IconButton } from '../../components/ui/IconButton';
import { ActionSheet, type ActionSheetAction } from '../../components/ui/ActionSheet';
import { Modal } from '../../components/ui/Modal';
import { AppButton } from '../../components/ui/AppButton';
import { MessageBubble, type ChatMessage, type MessageTranslation } from './MessageBubble';
import { SafetyReportModal } from '../../components/SafetyReportModal';
import { ChatTranslationSettingsModal } from '../../components/ChatTranslationSettingsModal';
import { GiftShopSheet } from '../gifts/GiftShopSheet';
import { GiftCelebrationOverlay } from '../gifts/GiftCelebrationOverlay';
import type { GiftSnapshot } from '../gifts/types';
import { formatMessageDay, formatMessageTime } from '../../lib/formatMessageTime';
import { useAppTranslation } from '../../i18n/appLocale';

function isSameMessageGroup(first?: ChatMessage, second?: ChatMessage) {
  if (!first || !second || first.senderId !== second.senderId) return false;
  const firstTime = new Date(first.createdAt).getTime();
  const secondTime = new Date(second.createdAt).getTime();
  return Number.isFinite(firstTime) && Number.isFinite(secondTime) && Math.abs(secondTime - firstTime) <= 5 * 60 * 1000;
}

export const ChatScreen: React.FC = () => {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useAppTranslation();
  const currentUserId = useAuthStore((s) => s.user?.id);

  const [text, setText] = useState('');
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const [isPartnerOnline, setIsPartnerOnline] = useState(false);
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [reactionsMap, setReactionsMap] = useState<Record<string, { userId: string; reaction: string }[]>>({});
  const [revealedViewOnce, setRevealedViewOnce] = useState<Set<string>>(new Set());
  const [olderMessages, setOlderMessages] = useState<ChatMessage[]>([]);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [newMessagesBelow, setNewMessagesBelow] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [safetyAction, setSafetyAction] = useState<'report' | 'block' | null>(null);
  const [isConversationActionsOpen, setIsConversationActionsOpen] = useState(false);
  const [isUnmatchConfirmOpen, setIsUnmatchConfirmOpen] = useState(false);
  const [isGiftShopOpen, setIsGiftShopOpen] = useState(false);
  const [freshGiftIds, setFreshGiftIds] = useState<Set<string>>(new Set());
  const [giftCelebration, setGiftCelebration] = useState<GiftSnapshot | null>(null);

  const [translationsMap, setTranslationsMap] = useState<Record<string, MessageTranslation>>({});
  const [translatingIds, setTranslatingIds] = useState<Set<string>>(new Set());
  const [autoTranslateEnabled, setAutoTranslateEnabled] = useState(true);
  const [translationLanguage, setTranslationLanguage] = useState('tr');
  const [isTranslationSettingsOpen, setIsTranslationSettingsOpen] = useState(false);
  const requestedTranslationIdsRef = useRef<Set<string>>(new Set());

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingMountedRef = useRef(true);
  const chunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isNearBottomRef = useRef(true);
  const initiallyScrolledMatchRef = useRef<string | null>(null);

  const { data: messagesData, refetch } = useMessagesQuery(matchId || '');
  const { data: matches } = useMatchesQuery();
  const editMutation = useEditMessageMutation(matchId || '');
  const deleteMutation = useDeleteMessageMutation(matchId || '');
  const viewOnceMutation = useMarkViewOnceMutation(matchId || '');
  const unmatchMutation = useUnmatchMutation();

  const currentMatch = useMemo(() => (matches || []).find((m: any) => m.id === matchId), [matches, matchId]);
  const partner = currentMatch?.user || currentMatch;
  const partnerId = partner?.id;
  const partnerLastSeen = partner?.lastActiveAt || partner?.last_active_at;
  const partnerStatusText = isPartnerTyping
    ? t('chatTypingStatus')
    : isPartnerOnline
      ? t('chatOnlineStatus')
      : partnerLastSeen
        ? t('chatLastSeenTemplate').replace('{time}', formatMessageTime(partnerLastSeen))
        : t('chatOfflineStatus');

  const allMessages = useMemo<ChatMessage[]>(() => {
    const base = Array.isArray(messagesData?.messages) ? messagesData.messages : [];
    const merged = [...olderMessages, ...base];
    const seen = new Set<string>();
    const deduped = merged.filter((m) => {
      if (!m?.id || seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
    return deduped
      .map((m) => ({
        ...m,
        ...(reactionsMap[m.id] ? { reactions: reactionsMap[m.id] } : null),
        translation: translationsMap[m.id] || null,
      }))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [messagesData, olderMessages, reactionsMap, translationsMap]);

  useEffect(() => {
    setOlderCursor(messagesData?.olderCursor || null);
    setHasMoreOlder(messagesData?.hasMore === true);
  }, [messagesData?.olderCursor, messagesData?.hasMore]);

  useEffect(() => {
    setOlderMessages([]);
    setNewMessagesBelow(0);
  }, [matchId]);

  const messagesById = useMemo(() => {
    const map = new Map<string, ChatMessage>();
    allMessages.forEach((m) => map.set(m.id, m));
    return map;
  }, [allMessages]);

  const scrollToBottom = (behavior: 'auto' | 'smooth' = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
    setNewMessagesBelow(0);
  };

  useEffect(() => {
    if (!matchId || !messagesData || initiallyScrolledMatchRef.current === matchId) return;
    initiallyScrolledMatchRef.current = matchId;
    window.requestAnimationFrame(() => scrollToBottom('auto'));
  }, [matchId, messagesData]);

  useEffect(() => {
    if (!matchId) return;

    socketService.joinConversation(matchId);
    socketService.markMessagesRead(matchId);

    // socketService restores the room on every physical reconnect. Re-assert the read state here
    // as well because messages may have arrived while the transport was unavailable.
    const unsubReconnect = socketService.on('connect', () => {
      socketService.markMessagesRead(matchId);
    });

    const unsubMsg = socketService.on('message:received', (data) => {
      if (data.matchId !== matchId) return;
      if (String(data.messageType || '').toUpperCase() === 'GIFT' && data.giftSnapshot) {
        setFreshGiftIds((current) => new Set(current).add(data.id));
        if (data.senderId !== currentUserId && data.giftSnapshot.tier !== 'STANDARD') {
          setGiftCelebration(data.giftSnapshot);
        }
        window.setTimeout(() => {
          setFreshGiftIds((current) => {
            const next = new Set(current);
            next.delete(data.id);
            return next;
          });
        }, 2200);
      }
      queryClient.setQueryData<any>(QUERY_KEYS.messages(matchId), (current: any) => {
        if (!current || !Array.isArray(current.messages)) return current;
        if (current.messages.some((message: ChatMessage) => message.id === data.id)) return current;
        return { ...current, messages: [...current.messages, data] };
      });
      socketService.markMessagesRead(matchId);
      if (isNearBottomRef.current || data.senderId === currentUserId) {
        window.setTimeout(() => scrollToBottom(), 80);
      } else {
        setNewMessagesBelow((count) => count + 1);
      }
    });

    const unsubTypingStart = socketService.on('typing:start', (data) => {
      if (data.matchId === matchId && data.userId !== currentUserId) setIsPartnerTyping(true);
    });
    const unsubTypingStop = socketService.on('typing:stop', (data) => {
      if (data.matchId === matchId && data.userId !== currentUserId) setIsPartnerTyping(false);
    });

    const unsubRead = socketService.on('message:read', (data) => {
      if (data.matchId !== matchId || data.readBy === currentUserId) return;
      // Real per-message state, not a last-message-only guess: mark every one of MY messages the
      // partner has now read (server bulk-marks everything up to this point, mirrored here).
      // deliveredAt is backfilled too since a read message was necessarily delivered first.
      queryClient.setQueryData<any>(QUERY_KEYS.messages(matchId), (current: any) => {
        if (!current || !Array.isArray(current.messages)) return current;
        return {
          ...current,
          messages: current.messages.map((message: ChatMessage) => (
            message.senderId === currentUserId && !message.isRead
              ? { ...message, isRead: true, readAt: data.readAt, deliveredAt: message.deliveredAt || data.readAt }
              : message
          )),
        };
      });
    });

    const unsubDelivered = socketService.on('message:delivered', (data: { matchId?: string; messageIds?: string[] }) => {
      if (data.matchId !== matchId || !Array.isArray(data.messageIds) || data.messageIds.length === 0) return;
      const deliveredIds = new Set(data.messageIds);
      queryClient.setQueryData<any>(QUERY_KEYS.messages(matchId), (current: any) => {
        if (!current || !Array.isArray(current.messages)) return current;
        return {
          ...current,
          messages: current.messages.map((message: ChatMessage) => (
            deliveredIds.has(message.id) && !message.deliveredAt
              ? { ...message, deliveredAt: new Date().toISOString() }
              : message
          )),
        };
      });
    });

    const unsubEdit = socketService.on('message:edit', (data) => {
      if (data.matchId !== matchId || !data.messageId) return;
      queryClient.setQueryData<any>(QUERY_KEYS.messages(matchId), (current: any) => {
        if (!current || !Array.isArray(current.messages)) return current;
        return {
          ...current,
          messages: current.messages.map((message: ChatMessage) => (
            message.id === data.messageId
              ? { ...message, text: data.text, isEdited: true, editedAt: data.editedAt }
              : message
          )),
        };
      });
      setTranslationsMap((current) => {
        if (!current[data.messageId]) return current;
        const next = { ...current };
        delete next[data.messageId];
        return next;
      });
      requestedTranslationIdsRef.current.delete(data.messageId);
    });

    const unsubDelete = socketService.on('message:delete', (data) => {
      if (data.matchId !== matchId || !data.messageId) return;
      queryClient.setQueryData<any>(QUERY_KEYS.messages(matchId), (current: any) => {
        if (!current || !Array.isArray(current.messages)) return current;
        return {
          ...current,
          messages: current.messages.map((message: ChatMessage) => (
            message.id === data.messageId
              ? { ...message, text: data.text || t('chatMessageDeletedFallback'), mediaUrl: null, isDeleted: true }
              : message
          )),
        };
      });
      setTranslationsMap((current) => {
        if (!current[data.messageId]) return current;
        const next = { ...current };
        delete next[data.messageId];
        return next;
      });
      setReactionsMap((current) => {
        if (!current[data.messageId]) return current;
        const next = { ...current };
        delete next[data.messageId];
        return next;
      });
    });

    const unsubReaction = socketService.on('message:reaction', (data) => {
      if (data.matchId !== matchId) return;
      setReactionsMap((prev) => ({ ...prev, [data.messageId]: data.reactions || [] }));
    });

    // Realtime translation: patch just this one message, never a refetch/full reload.
    const unsubTranslated = socketService.on('message:translated', (data) => {
      if (data.matchId !== matchId) return;
      setTranslationsMap((prev) => ({
        ...prev,
        [data.messageId]: {
          translatedText: data.translatedText,
          detectedLanguage: data.detectedLanguage,
          targetLanguage: data.targetLanguage,
        },
      }));
    });

    return () => {
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
      socketService.leaveConversation(matchId);
      unsubReconnect();
      unsubMsg();
      unsubTypingStart();
      unsubTypingStop();
      unsubRead();
      unsubDelivered();
      unsubEdit();
      unsubDelete();
      unsubReaction();
      unsubTranslated();
    };
  }, [matchId, currentUserId, queryClient]);

  // Conversation-level translation settings: fetched once per conversation, drives both the
  // settings modal's initial state and (indirectly, via the cache below) what's already showing.
  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;
    apiClient
      .get(`/api/chat/conversations/${matchId}/translation-settings`)
      .then((res) => {
        if (cancelled) return;
        const data = res?.data;
        if (!data) return;
        setAutoTranslateEnabled(data.autoTranslateEnabled ?? true);
        setTranslationLanguage(data.resolvedTranslationLanguage || 'tr');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  // History load: render originals immediately (already happens via allMessages above), then
  // fetch only the translations that are already cached server-side for whatever's currently
  // loaded, and only for message IDs we haven't already asked about this session.
  useEffect(() => {
    if (!matchId || allMessages.length === 0) return;
    const missingIds = allMessages
      .filter((m) => m.text && !translationsMap[m.id] && !requestedTranslationIdsRef.current.has(m.id))
      .map((m) => m.id);
    if (missingIds.length === 0) return;

    missingIds.forEach((id) => requestedTranslationIdsRef.current.add(id));
    apiClient
      .get(`/api/chat/translations?matchId=${matchId}&messageIds=${missingIds.join(',')}`)
      .then((res) => {
        const data = res?.data;
        if (!data || typeof data !== 'object') return;
        setTranslationsMap((prev) => ({ ...prev, ...data }));
      })
      .catch(() => {});
  }, [matchId, allMessages, translationsMap]);

  useEffect(() => {
    if (!partnerId) return;
    socketService.queryPresence(partnerId);
    const unsub = socketService.on('user:presence', (data) => {
      if (data.targetUserId === partnerId) setIsPartnerOnline(data.isOnline);
    });
    return unsub;
  }, [partnerId]);

  const handleLoadOlder = async () => {
    const el = scrollContainerRef.current;
    if (!el || isLoadingOlder || !hasMoreOlder || !matchId) return;
    if (el.scrollTop > 80) return;

    if (!olderCursor) return;

    setIsLoadingOlder(true);
    const prevHeight = el.scrollHeight;
    try {
      const page = await fetchOlderMessages(matchId, olderCursor, 50);
      setOlderCursor(page.olderCursor);
      setHasMoreOlder(page.hasMore);
      if (page.messages.length > 0) {
        setOlderMessages((prev) => [...page.messages, ...prev]);
        requestAnimationFrame(() => {
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight - prevHeight;
          }
        });
      }
    } catch {
      // Non-fatal: pagination simply stops offering more.
    } finally {
      setIsLoadingOlder(false);
    }
  };

  const handleScroll = () => {
    const element = scrollContainerRef.current;
    if (!element) return;
    isNearBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 96;
    if (isNearBottomRef.current && newMessagesBelow > 0) setNewMessagesBelow(0);
    void handleLoadOlder();
  };

  const handleSend = () => {
    if (!matchId) return;

    if (editingMessage) {
      if (!text.trim()) return;
      editMutation.mutate(
        { messageId: editingMessage.id, text: text.trim() },
        {
          onSuccess: () => refetch(),
          onError: () => toast.error(t('chatEditMessageFailedToast')),
        }
      );
      setEditingMessage(null);
      setText('');
      return;
    }

    if (!text.trim()) return;
    nativeHaptics.impact();
    const outgoingText = text.trim();
    const outgoingReplyId = replyTarget?.id;
    const clientMessageId = `mobile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    socketService.sendMessage(
      {
        matchId,
        text: outgoingText,
        replyToMessageId: outgoingReplyId,
        clientMessageId,
      },
      (result) => {
        if (result?.status === 'success') {
          void refetch();
          return;
        }
        setText(outgoingText);
        toast.error(result?.message || t('chatSendMessageFailedToast'));
      }
    );
    setText('');
    if (composerRef.current) composerRef.current.style.height = 'auto';
    setReplyTarget(null);
    socketService.stopTyping(matchId);
    window.setTimeout(() => scrollToBottom(), 80);
  };

  const handleTextChange = (value: string) => {
    setText(value);
    if (!matchId) return;
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    if (!value.trim()) {
      socketService.stopTyping(matchId);
      return;
    }
    socketService.startTyping(matchId);
    typingTimerRef.current = window.setTimeout(() => socketService.stopTyping(matchId), 1200);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !matchId) return;

    const messageType = file.type.startsWith('video/') ? 'VIDEO' : 'IMAGE';
    try {
      const uploadRes = await mediaService.uploadMedia(file, 'chat');
      if (uploadRes?.data?.url) {
        socketService.sendMessage({
          matchId,
          mediaUrl: uploadRes.data.url,
          messageType,
          replyToMessageId: replyTarget?.id,
        });
        setReplyTarget(null);
        refetch();
        window.setTimeout(() => scrollToBottom(), 100);
      }
    } catch (err) {
      console.error('[CHAT MEDIA UPLOAD ERROR]', err);
      toast.error(t('chatMediaUploadFailedToast'));
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!recordingMountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    } catch {
      toast.error(t('chatMicPermissionDeniedToast'));
    }
  };

  const stopRecording = (send: boolean) => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    const duration = recordSeconds;

    recorder.onstop = async () => {
      recorder.stream.getTracks().forEach((t) => t.stop());
      setIsRecording(false);
      if (!send || chunksRef.current.length === 0 || !matchId) return;

      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      try {
        const res = await mediaService.uploadMedia(blob, 'chat');
        if (res?.data?.url) {
          socketService.sendMessage({
            matchId,
            mediaUrl: res.data.url,
            messageType: 'AUDIO',
            durationSeconds: duration,
            replyToMessageId: replyTarget?.id,
          });
          setReplyTarget(null);
          refetch();
          window.setTimeout(() => scrollToBottom(), 100);
        }
      } catch {
        toast.error(t('chatVoiceMessageFailedToast'));
      }
    };
    recorder.stop();
  };

  useEffect(() => () => {
    recordingMountedRef.current = false;
    if (recordTimerRef.current) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    const recorder = mediaRecorderRef.current;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      if (recorder.state !== 'inactive') recorder.stop();
      recorder.stream.getTracks().forEach((track) => track.stop());
      mediaRecorderRef.current = null;
    }
    chunksRef.current = [];
  }, []);

  const handleRevealViewOnce = (message: ChatMessage) => {
    setRevealedViewOnce((prev) => new Set(prev).add(message.id));
    viewOnceMutation.mutate(message.id);
  };

  const handleReact = (message: ChatMessage, reaction: string) => {
    if (!matchId) return;
    socketService.reactToMessage(matchId, message.id, reaction);
  };

  const handleManualTranslate = async (message: ChatMessage) => {
    setTranslatingIds((prev) => new Set(prev).add(message.id));
    try {
      const res: any = await apiClient.post('/api/chat/translate', { messageId: message.id });
      const data = res?.data;
      if (data?.translatedText) {
        setTranslationsMap((prev) => ({
          ...prev,
          [message.id]: {
            translatedText: data.translatedText,
            detectedLanguage: data.detectedLanguage,
            targetLanguage: data.targetLanguage,
          },
        }));
      } else {
        toast.show(t('chatTranslationUnavailableToast'), 'neutral');
      }
    } catch {
      toast.show(t('chatTranslationUnavailableToast'), 'neutral');
    } finally {
      setTranslatingIds((prev) => {
        const next = new Set(prev);
        next.delete(message.id);
        return next;
      });
    }
  };

  const handleDelete = (message: ChatMessage) => {
    deleteMutation.mutate(message.id, {
      onSuccess: () => refetch(),
      onError: () => toast.error(t('chatDeleteMessageFailedToast')),
    });
  };

  const handleVoiceCall = () => {
    if (matchId && partnerId) callService.startOutgoingCall({ matchId, calleeUid: partnerId, calleeName: partner?.name, type: 'voice' });
  };
  const handleVideoCall = () => {
    if (matchId && partnerId) callService.startOutgoingCall({ matchId, calleeUid: partnerId, calleeName: partner?.name, type: 'video' });
  };

  const handleUnmatch = () => {
    if (!matchId || unmatchMutation.isPending) return;
    unmatchMutation.mutate(matchId, {
      onSuccess: () => {
        socketService.leaveConversation(matchId);
        setIsUnmatchConfirmOpen(false);
        toast.show(t('chatUnmatchSuccessToast'), 'neutral');
        navigate('/messages', { replace: true });
      },
      onError: (error: any) => toast.error(error?.message || t('chatUnmatchFailedToast')),
    });
  };

  const conversationActions: ActionSheetAction[] = [
    {
      label: t('chatUnmatchActionLabel'),
      icon: <Unlink className="h-5 w-5" />,
      destructive: true,
      onSelect: () => setIsUnmatchConfirmOpen(true),
    },
    {
      label: t('reportUser'),
      icon: <Flag className="h-5 w-5" />,
      onSelect: () => setSafetyAction('report'),
    },
    {
      label: t('blockUser'),
      icon: <UserMinus className="h-5 w-5" />,
      destructive: true,
      onSelect: () => setSafetyAction('block'),
    },
  ];

  return (
    <div className="relative flex flex-col h-full w-full bg-app text-app select-none overflow-hidden">
      <GiftCelebrationOverlay gift={giftCelebration} senderName={partner?.name} onDone={() => setGiftCelebration(null)} />
      {/* Top Header */}
      <header className="z-sticky flex min-h-16 shrink-0 items-center justify-between border-b border-app bg-surface-95 px-3 pb-2 pt-[calc(var(--safe-top)+8px)] backdrop-blur-xl">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <IconButton aria-label={t('backButtonLabel')} variant="ghost" size="sm" onClick={() => navigate('/messages')}>
            <ArrowLeft className="w-5 h-5" />
          </IconButton>

          <button
            type="button"
            aria-label={t('chatOpenProfileAriaLabelTemplate').replace('{name}', partner?.name || t('chatMatchFallbackLabel'))}
            onClick={() => partnerId && navigate(`/discover/${partnerId}`)}
            className="flex min-w-0 items-center gap-2.5 rounded-xl pe-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ProfileAvatarFrame
              photoUrl={getPhotoUrl(partner?.photos?.[0]) || partner?.photoUrl}
              name={partner?.name}
              activeFrameId={partner?.activeFrameId}
              size="sm"
              online={isPartnerOnline}
              countryCode={partner?.countryCode}
              showCountryFlag
            />
            <div className="min-w-0">
              <h3 className="text-caption font-black text-app truncate">{partner?.name || t('chatFallbackTitle')}</h3>
              <p className="text-micro text-app-muted normal-case">
                {partnerStatusText}
              </p>
            </div>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <IconButton
            aria-label={t('chatTranslationSettingsAriaLabel')}
            variant="surface"
            size="sm"
            onClick={() => setIsTranslationSettingsOpen(true)}
          >
            <Languages className="w-4 h-4" />
          </IconButton>
          <IconButton aria-label={t('chatVoiceCallAriaLabel')} variant="surface" size="sm" onClick={handleVoiceCall}>
            <Phone className="w-4 h-4" />
          </IconButton>
          <IconButton aria-label={t('chatVideoCallAriaLabel')} variant="surface" size="sm" onClick={handleVideoCall}>
            <Video className="w-4 h-4" />
          </IconButton>
          <IconButton aria-label={t('chatOptionsLabel')} variant="surface" size="sm" onClick={() => setIsConversationActionsOpen(true)}>
            <MoreVertical className="w-4 h-4" />
          </IconButton>
        </div>
      </header>

      {/* Messages Scroll Body */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        role="log"
        aria-label={t('chatHistoryAriaLabel')}
        aria-live="polite"
        aria-relevant="additions"
        className="relative flex-1 overflow-y-auto bg-app px-3 py-3 no-scrollbar"
      >
        {isLoadingOlder && (
          <div className="text-center text-micro text-app-muted normal-case py-2">{t('chatLoadingOlderMessages')}</div>
        )}
        {allMessages.length === 0 && (
          <div className="mx-auto flex max-w-[18rem] flex-col items-center px-4 py-12 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-pink-500/10 text-pink-500"><Send className="h-6 w-6" /></span>
            <p className="mt-4 text-caption font-black text-app">{t('chatEmptyStateTitle')}</p>
            <p className="mt-1 text-micro normal-case leading-relaxed text-app-muted">{t('chatEmptyStateSubtitle')}</p>
          </div>
        )}
        <div>
          {allMessages.map((msg, index) => {
            const previous = allMessages[index - 1];
            const next = allMessages[index + 1];
            const showDay = !previous || new Date(previous.createdAt).toDateString() !== new Date(msg.createdAt).toDateString();
            const isFirstInGroup = showDay || !isSameMessageGroup(previous, msg);
            const isLastInGroup = !isSameMessageGroup(msg, next);
            return (
              <React.Fragment key={msg.id}>
                {showDay && (
                  <div className="flex justify-center py-3">
                    <time className="rounded-full bg-app-secondary px-3 py-1 text-micro font-bold normal-case text-app-muted">
                      {formatMessageDay(msg.createdAt)}
                    </time>
                  </div>
                )}
                <MessageBubble
                  message={msg}
                  isMe={msg.senderId === currentUserId}
                  replySource={msg.replyToMessageId ? messagesById.get(msg.replyToMessageId) : undefined}
                  viewOnceRevealed={revealedViewOnce.has(msg.id)}
                  isTranslating={translatingIds.has(msg.id)}
                  onRevealViewOnce={handleRevealViewOnce}
                  onReply={setReplyTarget}
                  onEdit={(message) => {
                    setEditingMessage(message);
                    setText(message.text || '');
                  }}
                  onDelete={handleDelete}
                  onReact={handleReact}
                  onReport={() => setSafetyAction('report')}
                  onTranslate={handleManualTranslate}
                  animateGift={freshGiftIds.has(msg.id)}
                  giftSenderName={partner?.name}
                  isFirstInGroup={isFirstInGroup}
                  isLastInGroup={isLastInGroup}
                />
              </React.Fragment>
            );
          })}
        </div>
        <div ref={messagesEndRef} />
      </div>

      {newMessagesBelow > 0 && (
        <button
          type="button"
          onClick={() => scrollToBottom()}
          className="absolute bottom-24 right-4 z-sticky flex items-center gap-1.5 rounded-full bg-pink-500 px-3 py-2 text-micro font-extrabold normal-case text-white shadow-elevated"
        >
          <ArrowDown className="h-4 w-4" />
          {t('chatNewMessagesCountTemplate').replace('{count}', String(newMessagesBelow))}
        </button>
      )}

      {/* Reply / Edit context bar */}
      {(replyTarget || editingMessage) && (
        <div className="px-4 py-2 border-t border-app bg-surface-elevated flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-micro font-bold text-pink-500">{editingMessage ? t('chatEditingLabel') : t('chatReplyingLabel')}</p>
            <p className="text-caption text-app-muted truncate normal-case">
              {(editingMessage || replyTarget)?.text || t('chatMediaMessageFallback')}
            </p>
          </div>
          <IconButton
            aria-label={t('cancel')}
            variant="ghost"
            size="sm"
            onClick={() => {
              setReplyTarget(null);
              setEditingMessage(null);
              setText('');
            }}
          >
            <X className="w-4 h-4" />
          </IconButton>
        </div>
      )}

      {/* Recording bar */}
      {isRecording ? (
        <div className="px-4 pt-3 pb-[calc(var(--safe-bottom)+12px)] border-t border-app bg-surface flex items-center gap-3">
          <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--color-error)]" />
          <span className="flex-1 text-body font-semibold text-app tabular-nums">
            {t('chatRecordingTemplate').replace('{seconds}', String(recordSeconds))}
          </span>
          <IconButton aria-label={t('cancel')} variant="surface" size="md" onClick={() => stopRecording(false)}>
            <X className="w-5 h-5" />
          </IconButton>
          <IconButton aria-label={t('sendAriaLabel')} variant="gradient" size="md" onClick={() => stopRecording(true)}>
            <Send className="w-5 h-5" />
          </IconButton>
        </div>
      ) : (
        /* Input Controls Bar */
        <div className="flex items-end gap-1.5 border-t border-app bg-surface-95 px-2.5 pt-2.5 pb-[calc(var(--safe-bottom)+10px)] backdrop-blur-xl">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <IconButton aria-label={t('chatAddMediaAriaLabel')} variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Camera className="w-6 h-6" />
          </IconButton>

          <textarea
            ref={composerRef}
            rows={1}
            aria-label={t('chatMessagePlaceholder')}
            placeholder={t('chatMessagePlaceholder')}
            value={text}
            onChange={(event) => handleTextChange(event.target.value)}
            onInput={(event) => {
              const element = event.currentTarget;
              element.style.height = 'auto';
              element.style.height = `${Math.min(element.scrollHeight, 112)}px`;
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                handleSend();
              }
            }}
            onBlur={() => matchId && socketService.stopTyping(matchId)}
            onFocus={() => window.setTimeout(() => scrollToBottom(), 120)}
            className="max-h-28 min-h-11 flex-1 resize-none overflow-y-auto rounded-3xl border border-app bg-input-app px-4 py-2.5 text-body font-semibold leading-6 text-app placeholder:text-app-muted focus:border-pink-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500/40"
          />

          <IconButton aria-label={t('chatSendGiftAriaLabel')} variant="ghost" size="sm" onClick={() => setIsGiftShopOpen(true)}>
            <GiftIcon className="h-5 w-5 text-pink-500" />
          </IconButton>

          {text.trim() ? (
            <IconButton aria-label={t('sendAriaLabel')} variant="gradient" size="md" onClick={handleSend}>
              <Send className="w-5 h-5 fill-current" />
            </IconButton>
          ) : (
            <IconButton aria-label={t('chatRecordVoiceAriaLabel')} variant="gradient" size="md" onClick={startRecording}>
              <Mic className="w-5 h-5" />
            </IconButton>
          )}
        </div>
      )}

      <SafetyReportModal
        isOpen={safetyAction !== null}
        onClose={() => setSafetyAction(null)}
        targetUserId={partnerId}
        targetUserName={partner?.name}
        type={safetyAction || 'report'}
        onSuccess={() => {
          if (safetyAction !== 'block') return;
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.matches });
          navigate('/messages', { replace: true });
        }}
      />

      <ActionSheet
        isOpen={isConversationActionsOpen}
        onClose={() => setIsConversationActionsOpen(false)}
        title={partner?.name ? t('chatOptionsTitleTemplate').replace('{name}', partner.name) : t('chatOptionsLabel')}
        actions={conversationActions}
      />

      <Modal isOpen={isUnmatchConfirmOpen} onClose={() => !unmatchMutation.isPending && setIsUnmatchConfirmOpen(false)}>
        <div className="space-y-4">
          <div className="flex items-center gap-3 pe-8">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-red-500/10 text-red-500">
              <Unlink className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-heading text-app">{t('chatUnmatchActionLabel')}</h3>
              <p className="mt-1 text-caption normal-case text-app-muted">{t('chatUnmatchWarningTemplate').replace('{name}', partner?.name || t('chatUnmatchFallbackName'))}</p>
            </div>
          </div>
          <p className="text-caption normal-case leading-relaxed text-app-muted">
            {t('chatUnmatchDescription')}
          </p>
          <div className="flex gap-2 pt-1">
            <AppButton type="button" variant="secondary" size="md" className="flex-1" disabled={unmatchMutation.isPending} onClick={() => setIsUnmatchConfirmOpen(false)}>
              {t('discardAriaLabel')}
            </AppButton>
            <AppButton type="button" variant="danger" size="md" className="flex-1" loading={unmatchMutation.isPending} onClick={handleUnmatch}>
              {t('chatUnmatchActionLabel')}
            </AppButton>
          </div>
        </div>
      </Modal>

      {matchId && (
        <ChatTranslationSettingsModal
          isOpen={isTranslationSettingsOpen}
          onClose={() => setIsTranslationSettingsOpen(false)}
          matchId={matchId}
          autoTranslateEnabled={autoTranslateEnabled}
          translationLanguage={translationLanguage}
          onSettingsChanged={(next) => {
            setAutoTranslateEnabled(next.autoTranslateEnabled);
            if (next.translationLanguage !== translationLanguage) {
              // Target language changed -- previously cached translations were for the old
              // language, so drop them and let the "missing translations" effect re-fetch
              // (server-cached per messageId+language, so this is cheap, not a re-translate).
              setTranslationsMap({});
              requestedTranslationIdsRef.current = new Set();
            }
            setTranslationLanguage(next.translationLanguage);
          }}
        />
      )}

      {matchId && (
        <GiftShopSheet
          isOpen={isGiftShopOpen}
          onClose={() => setIsGiftShopOpen(false)}
          matchId={matchId}
          recipientName={partner?.name}
          onGiftSent={(result) => {
            if (result.message?.id) {
              setFreshGiftIds((current) => new Set(current).add(result.message!.id));
              window.setTimeout(() => {
                setFreshGiftIds((current) => {
                  const next = new Set(current);
                  next.delete(result.message!.id);
                  return next;
                });
              }, 2200);
            }
            void refetch();
            window.setTimeout(() => scrollToBottom(), 100);
          }}
        />
      )}
    </div>
  );
};
