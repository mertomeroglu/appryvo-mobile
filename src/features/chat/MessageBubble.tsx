import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Check,
  CheckCheck,
  Copy,
  Eye,
  Flag,
  Heart,
  Languages,
  Laugh,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Reply,
  ThumbsUp,
  Trash2,
} from 'lucide-react';
import { mediaService, normalizeMediaUrl } from '../../services/media/mediaService';
import { ActionSheet, type ActionSheetAction } from '../../components/ui/ActionSheet';
import { toast } from '../../stores/useToastStore';
import { DURATION, EASE } from '../../motion/tokens';
import { GiftMessageCard } from '../gifts/GiftMessageCard';
import type { GiftSnapshot } from '../gifts/types';
import { useAppTranslation } from '../../i18n/appLocale';

export interface MessageTranslation {
  translatedText: string;
  detectedLanguage: string | null;
  targetLanguage: string;
}

export interface ChatMessage {
  id: string;
  matchId: string;
  senderId: string;
  text?: string;
  title?: string;
  mediaUrl?: string;
  messageType?: string;
  isViewOnce?: boolean;
  durationSeconds?: number;
  thumbnailUrl?: string;
  replyToMessageId?: string;
  reactions?: { userId: string; reaction: string }[];
  editedAt?: string;
  createdAt: string;
  translation?: MessageTranslation | null;
  giftSendId?: string | null;
  giftSnapshot?: GiftSnapshot | null;
}

interface MessageBubbleProps {
  message: ChatMessage;
  isMe: boolean;
  isLastMineRead?: boolean;
  replySource?: ChatMessage;
  viewOnceRevealed?: boolean;
  isTranslating?: boolean;
  onRevealViewOnce?: (message: ChatMessage) => void;
  onReply?: (message: ChatMessage) => void;
  onEdit?: (message: ChatMessage) => void;
  onDelete?: (message: ChatMessage) => void;
  onReact?: (message: ChatMessage, reaction: string) => void;
  onReport?: (message: ChatMessage) => void;
  onTranslate?: (message: ChatMessage) => void;
  animateGift?: boolean;
  giftSenderName?: string;
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
  readOnly?: boolean;
  senderAvatar?: React.ReactNode;
}

function VoicePlayer({ url, durationSeconds, isMe }: { url: string; durationSeconds?: number; isMe: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const toggle = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  return (
    <div className="flex min-w-[168px] items-center gap-2.5 py-0.5">
      <button
        type="button"
        onClick={toggle}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${isMe ? 'bg-white/20' : 'bg-pink-500/10 text-pink-500'}`}
        aria-label={isPlaying ? 'Sesli mesajı duraklat' : 'Sesli mesajı oynat'}
      >
        {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
      </button>
      <div className={`h-1.5 flex-1 overflow-hidden rounded-full ${isMe ? 'bg-white/25' : 'bg-app-secondary'}`}>
        <div className={`h-full rounded-full ${isMe ? 'bg-white' : 'bg-pink-500'}`} style={{ width: `${progress * 100}%` }} />
      </div>
      <span className="text-micro opacity-80 tabular-nums">
        {durationSeconds ? `${Math.round(durationSeconds)}s` : ''}
      </span>
      <audio
        ref={audioRef}
        src={normalizeMediaUrl(url)}
        onEnded={() => {
          setIsPlaying(false);
          setProgress(0);
        }}
        onTimeUpdate={(e) => {
          const a = e.currentTarget;
          if (a.duration) setProgress(a.currentTime / a.duration);
        }}
        className="hidden"
      />
    </div>
  );
}

function useAuthorizedMediaUrl(url?: string): string | undefined {
  const normalized = url ? normalizeMediaUrl(url) : undefined;
  const isPrivate = Boolean(normalized?.includes('/api/media/private/'));
  const [resolvedUrl, setResolvedUrl] = useState<string | undefined>(isPrivate ? undefined : normalized);

  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    setResolvedUrl(isPrivate ? undefined : normalized);
    if (!normalized || !isPrivate) return () => { active = false; };

    mediaService.getAuthenticatedObjectUrl(normalized)
      .then((value) => {
        objectUrl = value;
        if (active) setResolvedUrl(value);
        else URL.revokeObjectURL(value);
      })
      .catch(() => {
        if (active) setResolvedUrl(undefined);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [normalized, isPrivate]);

  return resolvedUrl;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isMe,
  isLastMineRead,
  replySource,
  viewOnceRevealed,
  isTranslating,
  onRevealViewOnce,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onReport,
  onTranslate,
  animateGift = false,
  giftSenderName,
  isFirstInGroup = true,
  isLastInGroup = true,
  readOnly = false,
  senderAvatar,
}) => {
  const { t, locale } = useAppTranslation();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  // Local to this bubble on purpose -- "show original" is a per-message glance, not app state
  // worth persisting or lifting; it resets naturally if the message scrolls out and back in.
  const [showOriginal, setShowOriginal] = useState(false);
  const resolvedMediaUrl = useAuthorizedMediaUrl(message.mediaUrl);
  const reactionCounts = (message.reactions || []).reduce<Record<string, number>>((acc, r) => {
    acc[r.reaction] = (acc[r.reaction] || 0) + 1;
    return acc;
  }, {});

  // Translation only ever applies to the other person's messages -- our own bubble always shows
  // what we actually typed, per product spec.
  const hasTranslation = !isMe && !!message.translation;
  const displayText = hasTranslation && !showOriginal ? message.translation!.translatedText : message.text;

  const actions: ActionSheetAction[] = readOnly ? [] : [
    { label: 'Yanıtla', icon: <Reply className="w-4 h-4" />, onSelect: () => onReply?.(message) },
    { label: 'Beğen ❤️', icon: <Heart className="w-4 h-4" />, onSelect: () => onReact?.(message, '❤️') },
    { label: 'Güldür 😂', icon: <Laugh className="w-4 h-4" />, onSelect: () => onReact?.(message, '😂') },
    { label: 'Onayla 👍', icon: <ThumbsUp className="w-4 h-4" />, onSelect: () => onReact?.(message, '👍') },
  ];
  if (!readOnly && message.text) {
    actions.push({
      label: 'Kopyala',
      icon: <Copy className="w-4 h-4" />,
      onSelect: () => {
        navigator.clipboard?.writeText(message.text || '');
        toast.success('Kopyalandı');
      },
    });
  }
  if (!readOnly && isMe && message.text) {
    actions.push({ label: 'Düzenle', icon: <Pencil className="w-4 h-4" />, onSelect: () => onEdit?.(message) });
  }
  if (!readOnly && isMe) {
    actions.push({
      label: 'Sil',
      icon: <Trash2 className="w-4 h-4" />,
      destructive: true,
      onSelect: () => onDelete?.(message),
    });
  } else if (!readOnly) {
    if (message.text && !message.translation && !isTranslating) {
      actions.push({
        label: 'Çevir',
        icon: <Languages className="w-4 h-4" />,
        onSelect: () => onTranslate?.(message),
      });
    }
    actions.push({
      label: 'Bildir',
      icon: <Flag className="w-4 h-4" />,
      destructive: true,
      onSelect: () => onReport?.(message),
    });
  }

  const showViewOnceLock = message.isViewOnce && !isMe && !viewOnceRevealed;

  if (String(message.messageType || '').toUpperCase() === 'GIFT' && message.giftSnapshot) {
    return (
      <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
        <GiftMessageCard gift={message.giftSnapshot} isMe={isMe} senderName={giftSenderName} animate={animateGift} />
      </div>
    );
  }

  return (
    <div className={`group flex ${isFirstInGroup ? 'mt-2.5' : 'mt-0.5'} ${isMe ? 'justify-end' : 'justify-start'}`}>
      <div className={`relative flex max-w-[86%] items-end gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
        {!isMe && senderAvatar && (
          <div className="flex h-7 w-7 shrink-0 items-end">{isLastInGroup ? senderAvatar : null}</div>
        )}
        {actions.length > 0 && isLastInGroup && (
          <button
            type="button"
            onClick={() => setIsSheetOpen(true)}
            className={`absolute bottom-0 z-10 grid h-8 w-8 place-items-center rounded-full text-app-muted opacity-70 transition-colors active:bg-app-secondary md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${isMe ? '-left-9' : '-right-9'}`}
            aria-label="Mesaj seçenekleri"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        )}

        <div className="flex min-w-0 flex-col gap-1" style={{ alignItems: isMe ? 'flex-end' : 'flex-start' }}>
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION.micro, ease: EASE.standard }}
            onContextMenu={(event) => {
              if (actions.length === 0) return;
              event.preventDefault();
              setIsSheetOpen(true);
            }}
            className={`min-w-0 px-3 py-2 text-body ${
              isMe
                ? `bg-brand-gradient font-medium text-white ${isLastInGroup ? 'rounded-[18px] rounded-br-[5px]' : 'rounded-[18px] rounded-br-xl'}`
                : `bg-surface-elevated font-medium text-app shadow-soft ${isLastInGroup ? 'rounded-[18px] rounded-bl-[5px]' : 'rounded-[18px] rounded-bl-xl'}`
            }`}
          >
            {message.title && <p className={`mb-1 text-micro font-extrabold normal-case ${isMe ? 'text-white/85' : 'text-pink-500'}`}>{message.title}</p>}
            {replySource && (
              <div className={`mb-1.5 flex max-w-full items-stretch overflow-hidden rounded-xl ${isMe ? 'bg-white/[0.12]' : 'bg-app'}`}>
                <span className={`w-0.5 shrink-0 ${isMe ? 'bg-white/70' : 'bg-pink-500'}`} />
                <p className={`truncate px-2.5 py-1.5 text-micro normal-case ${isMe ? 'text-white/85' : 'text-app-muted'}`}>
                  {replySource.text || (replySource.messageType ? `${replySource.messageType} mesajı` : 'Mesaj')}
                </p>
              </div>
            )}
            {showViewOnceLock ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRevealViewOnce?.(message);
                }}
                className="flex items-center gap-2 py-1"
              >
                <Eye className="w-4 h-4" />
                <span>Tek seferlik fotoğrafı görüntüle</span>
              </button>
            ) : (
              <>
                {resolvedMediaUrl && message.messageType === 'VIDEO' && (
                  <video
                    src={resolvedMediaUrl}
                    controls
                    className="mb-1.5 max-h-60 w-full rounded-[14px]"
                  />
                )}
                {resolvedMediaUrl && message.messageType === 'AUDIO' && (
                  <VoicePlayer url={resolvedMediaUrl} durationSeconds={message.durationSeconds} isMe={isMe} />
                )}
                {resolvedMediaUrl &&
                  (message.messageType === 'IMAGE' || message.messageType === 'GIF' || !message.messageType) && (
                    <img
                      src={resolvedMediaUrl}
                      alt="Medya"
                      loading="lazy"
                      decoding="async"
                      className="mb-1.5 max-h-60 w-full rounded-[14px] object-cover"
                    />
                  )}
                {displayText && <p className="whitespace-pre-wrap leading-[1.42]">{displayText}</p>}
                {!message.translation && isTranslating && (
                  <p className="text-micro italic opacity-70 mt-0.5">Çevriliyor...</p>
                )}
                {hasTranslation && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowOriginal((v) => !v);
                    }}
                    className="text-micro underline mt-0.5 text-app-muted"
                  >
                    {showOriginal ? 'Çeviriyi göster' : 'Çevrildi · Orijinali göster'}
                  </button>
                )}
              </>
            )}

            <div
              className={`mt-1 flex items-center gap-1 text-[10px] leading-none tabular-nums ${
                isMe ? 'text-white/70 justify-end' : 'text-app-muted'
              }`}
            >
              {message.editedAt && <span className="italic">{t('editedLabel')}</span>}
              <span>
                {message.createdAt
                  ? new Date(message.createdAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
                  : ''}
              </span>
              {isMe && (isLastMineRead ? <CheckCheck className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />)}
            </div>
          </motion.div>

          {Object.keys(reactionCounts).length > 0 && (
            <div className="-mt-1 flex gap-1 px-1">
              {Object.entries(reactionCounts).map(([reaction, count]) => (
                <span
                  key={reaction}
                  className="rounded-full border border-app bg-surface px-2 py-0.5 text-micro shadow-soft"
                >
                  {reaction} {count > 1 ? count : ''}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {actions.length > 0 && <ActionSheet isOpen={isSheetOpen} onClose={() => setIsSheetOpen(false)} title="Mesaj işlemleri" actions={actions} />}
    </div>
  );
};
