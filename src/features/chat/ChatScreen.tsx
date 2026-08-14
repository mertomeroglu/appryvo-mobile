import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Camera, Languages, Mic, Phone, Send, Video, X } from 'lucide-react';
import {
  useMessagesQuery,
  useMatchesQuery,
  useEditMessageMutation,
  useDeleteMessageMutation,
  useMarkViewOnceMutation,
  fetchOlderMessages,
} from '../../hooks/useQueries';
import { socketService } from '../../services/socket/socketService';
import { apiClient } from '../../services/api/apiClient';
import { mediaService, normalizeMediaUrl } from '../../services/media/mediaService';
import { callService } from '../../services/call/callService';
import { useAuthStore } from '../../stores/useAuthStore';
import { toast } from '../../stores/useToastStore';
import { nativeHaptics } from '../../native/haptics';
import { Avatar } from '../../components/ui/Avatar';
import { IconButton } from '../../components/ui/IconButton';
import { MessageBubble, type ChatMessage, type MessageTranslation } from './MessageBubble';
import { SafetyReportModal } from '../../components/SafetyReportModal';
import { ChatTranslationSettingsModal } from '../../components/ChatTranslationSettingsModal';

export const ChatScreen: React.FC = () => {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const currentUserId = useAuthStore((s) => s.user?.id);

  const [text, setText] = useState('');
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const [isPartnerOnline, setIsPartnerOnline] = useState(false);
  const [partnerReadAt, setPartnerReadAt] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [reactionsMap, setReactionsMap] = useState<Record<string, { userId: string; reaction: string }[]>>({});
  const [revealedViewOnce, setRevealedViewOnce] = useState<Set<string>>(new Set());
  const [olderMessages, setOlderMessages] = useState<ChatMessage[]>([]);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [reportTarget, setReportTarget] = useState<ChatMessage | null>(null);

  const [translationsMap, setTranslationsMap] = useState<Record<string, MessageTranslation>>({});
  const [translatingIds, setTranslatingIds] = useState<Set<string>>(new Set());
  const [autoTranslateEnabled, setAutoTranslateEnabled] = useState(true);
  const [translationLanguage, setTranslationLanguage] = useState('tr');
  const [isTranslationSettingsOpen, setIsTranslationSettingsOpen] = useState(false);
  const requestedTranslationIdsRef = useRef<Set<string>>(new Set());

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: messagesData, refetch } = useMessagesQuery(matchId || '');
  const { data: matches } = useMatchesQuery();
  const editMutation = useEditMessageMutation(matchId || '');
  const deleteMutation = useDeleteMessageMutation(matchId || '');
  const viewOnceMutation = useMarkViewOnceMutation(matchId || '');

  const currentMatch = useMemo(() => (matches || []).find((m: any) => m.id === matchId), [matches, matchId]);
  const partner = currentMatch?.user || currentMatch;
  const partnerId = partner?.id;

  const allMessages = useMemo<ChatMessage[]>(() => {
    const base = Array.isArray(messagesData) ? messagesData : [];
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

  const messagesById = useMemo(() => {
    const map = new Map<string, ChatMessage>();
    allMessages.forEach((m) => map.set(m.id, m));
    return map;
  }, [allMessages]);

  const lastMineMessageId = useMemo(() => {
    for (let i = allMessages.length - 1; i >= 0; i -= 1) {
      if (allMessages[i].senderId === currentUserId) return allMessages[i].id;
    }
    return null;
  }, [allMessages, currentUserId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [matchId]);

  useEffect(() => {
    if (!matchId) return;

    socketService.joinConversation(matchId);
    socketService.markMessagesRead(matchId);

    // Room membership lives on the socket.io connection itself, not the logical session --
    // reconnecting after a network drop gets a brand-new underlying connection (confirmed
    // on-device: listeners survive reconnect via socketService's own reattach logic, but this
    // conversation's room join does not), so without re-joining here, message:received/
    // message:translated silently stop arriving for whoever's sitting in an open chat when their
    // connection drops and comes back.
    const unsubReconnect = socketService.on('connect', () => {
      socketService.joinConversation(matchId);
      socketService.markMessagesRead(matchId);
    });

    const unsubMsg = socketService.on('message:received', (data) => {
      if (data.matchId !== matchId) return;
      refetch();
      socketService.markMessagesRead(matchId);
      setTimeout(scrollToBottom, 100);
    });

    const unsubTypingStart = socketService.on('typing:start', (data) => {
      if (data.matchId === matchId && data.userId !== currentUserId) setIsPartnerTyping(true);
    });
    const unsubTypingStop = socketService.on('typing:stop', (data) => {
      if (data.matchId === matchId && data.userId !== currentUserId) setIsPartnerTyping(false);
    });

    const unsubRead = socketService.on('message:read', (data) => {
      if (data.matchId === matchId && data.readBy !== currentUserId) setPartnerReadAt(data.readAt);
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
      socketService.leaveConversation(matchId);
      unsubReconnect();
      unsubMsg();
      unsubTypingStart();
      unsubTypingStop();
      unsubRead();
      unsubReaction();
      unsubTranslated();
    };
  }, [matchId, currentUserId, refetch]);

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

    const oldest = allMessages[0];
    if (!oldest) return;

    setIsLoadingOlder(true);
    const prevHeight = el.scrollHeight;
    try {
      const older = await fetchOlderMessages(matchId, oldest.id, 50);
      if (!Array.isArray(older) || older.length === 0) {
        setHasMoreOlder(false);
      } else {
        setOlderMessages((prev) => [...older, ...prev]);
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

  const handleSend = () => {
    if (!matchId) return;

    if (editingMessage) {
      if (!text.trim()) return;
      editMutation.mutate(
        { messageId: editingMessage.id, text: text.trim() },
        {
          onSuccess: () => refetch(),
          onError: () => toast.error('Mesaj düzenlenemedi.'),
        }
      );
      setEditingMessage(null);
      setText('');
      return;
    }

    if (!text.trim()) return;
    nativeHaptics.impact();
    socketService.sendMessage({
      matchId,
      text: text.trim(),
      replyToMessageId: replyTarget?.id,
    });
    setText('');
    setReplyTarget(null);
    socketService.stopTyping(matchId);
    setTimeout(scrollToBottom, 100);
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
        setTimeout(scrollToBottom, 100);
      }
    } catch (err) {
      console.error('[CHAT MEDIA UPLOAD ERROR]', err);
      toast.error('Medya yüklenemedi.');
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
      toast.error('Mikrofon erişimi reddedildi.');
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
          setTimeout(scrollToBottom, 100);
        }
      } catch {
        toast.error('Sesli mesaj gönderilemedi.');
      }
    };
    recorder.stop();
  };

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
        toast.show('Çeviri şu anda kullanılamıyor.', 'neutral');
      }
    } catch {
      toast.show('Çeviri şu anda kullanılamıyor.', 'neutral');
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
      onError: () => toast.error('Mesaj silinemedi.'),
    });
  };

  const handleVoiceCall = () => {
    if (matchId && partnerId) callService.startOutgoingCall({ matchId, calleeUid: partnerId, calleeName: partner?.name, type: 'voice' });
  };
  const handleVideoCall = () => {
    if (matchId && partnerId) callService.startOutgoingCall({ matchId, calleeUid: partnerId, calleeName: partner?.name, type: 'video' });
  };

  return (
    <div className="flex flex-col h-full w-full bg-app text-app select-none overflow-hidden">
      {/* Top Header */}
      <header className="pt-safe px-4 py-3 border-b border-app bg-surface/90 backdrop-blur-md flex items-center justify-between z-sticky shadow-soft">
        <div className="flex items-center gap-3 min-w-0">
          <IconButton aria-label="Geri" variant="ghost" size="sm" onClick={() => navigate('/messages')}>
            <ArrowLeft className="w-5 h-5" />
          </IconButton>

          <button
            onClick={() => partnerId && navigate(`/discover/${partnerId}`)}
            className="flex items-center gap-2.5 min-w-0 text-left"
          >
            <Avatar
              src={partner?.photoUrl || partner?.photos?.[0]?.url ? normalizeMediaUrl(partner?.photoUrl || partner?.photos?.[0]?.url) : undefined}
              name={partner?.name}
              size="md"
              online={isPartnerOnline}
            />
            <div className="min-w-0">
              <h3 className="text-caption font-black text-app truncate">{partner?.name || 'Sohbet'}</h3>
              <p className="text-micro text-app-muted normal-case">
                {isPartnerTyping ? 'yazıyor...' : isPartnerOnline ? 'çevrimiçi' : 'çevrimdışı'}
              </p>
            </div>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <IconButton
            aria-label="Çeviri Ayarları"
            variant="surface"
            size="sm"
            onClick={() => setIsTranslationSettingsOpen(true)}
          >
            <Languages className="w-4 h-4" />
          </IconButton>
          <IconButton aria-label="Sesli Ara" variant="surface" size="sm" onClick={handleVoiceCall}>
            <Phone className="w-4 h-4" />
          </IconButton>
          <IconButton aria-label="Görüntülü Ara" variant="surface" size="sm" onClick={handleVideoCall}>
            <Video className="w-4 h-4" />
          </IconButton>
        </div>
      </header>

      {/* Messages Scroll Body */}
      <div
        ref={scrollContainerRef}
        onScroll={handleLoadOlder}
        className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar"
      >
        {isLoadingOlder && (
          <div className="text-center text-micro text-app-muted normal-case py-2">Eski mesajlar yükleniyor...</div>
        )}
        {allMessages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isMe={msg.senderId === currentUserId}
            isLastMineRead={
              msg.id === lastMineMessageId &&
              !!partnerReadAt &&
              new Date(msg.createdAt).getTime() <= new Date(partnerReadAt).getTime()
            }
            replySource={msg.replyToMessageId ? messagesById.get(msg.replyToMessageId) : undefined}
            viewOnceRevealed={revealedViewOnce.has(msg.id)}
            isTranslating={translatingIds.has(msg.id)}
            onRevealViewOnce={handleRevealViewOnce}
            onReply={setReplyTarget}
            onEdit={(m) => {
              setEditingMessage(m);
              setText(m.text || '');
            }}
            onDelete={handleDelete}
            onReact={handleReact}
            onReport={setReportTarget}
            onTranslate={handleManualTranslate}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply / Edit context bar */}
      {(replyTarget || editingMessage) && (
        <div className="px-4 py-2 border-t border-app bg-surface-elevated flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-micro font-bold text-pink-500">{editingMessage ? 'Mesajı düzenle' : 'Yanıtla'}</p>
            <p className="text-caption text-app-muted truncate normal-case">
              {(editingMessage || replyTarget)?.text || 'Medya mesajı'}
            </p>
          </div>
          <IconButton
            aria-label="İptal"
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
        <div className="pb-safe px-4 py-3 border-t border-app bg-surface flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-[#FF4B55] animate-pulse" />
          <span className="flex-1 text-body font-semibold text-app tabular-nums">
            Kaydediliyor... {recordSeconds}s
          </span>
          <IconButton aria-label="İptal" variant="surface" size="md" onClick={() => stopRecording(false)}>
            <X className="w-5 h-5" />
          </IconButton>
          <IconButton aria-label="Gönder" variant="gradient" size="md" onClick={() => stopRecording(true)}>
            <Send className="w-5 h-5" />
          </IconButton>
        </div>
      ) : (
        /* Input Controls Bar */
        <div className="pb-safe px-3 py-2.5 border-t border-app bg-surface flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <IconButton aria-label="Medya Ekle" variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Camera className="w-6 h-6" />
          </IconButton>

          <input
            type="text"
            placeholder="Mesaj yazın..."
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (matchId) socketService.startTyping(matchId);
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            className="flex-1 h-11 bg-input-app border border-app rounded-full px-4 text-body font-semibold text-app placeholder:text-app-muted focus:outline-none focus:border-pink-500"
          />

          {text.trim() ? (
            <IconButton aria-label="Gönder" variant="gradient" size="md" onClick={handleSend}>
              <Send className="w-5 h-5 fill-current" />
            </IconButton>
          ) : (
            <IconButton aria-label="Sesli Mesaj Kaydet" variant="gradient" size="md" onClick={startRecording}>
              <Mic className="w-5 h-5" />
            </IconButton>
          )}
        </div>
      )}

      <SafetyReportModal
        isOpen={!!reportTarget}
        onClose={() => setReportTarget(null)}
        targetUserId={partnerId}
        targetUserName={partner?.name}
      />

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
    </div>
  );
};
