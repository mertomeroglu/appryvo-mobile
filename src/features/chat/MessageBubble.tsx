import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useTransform, animate, type PanInfo } from 'framer-motion';
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
  X,
  RefreshCw,
} from 'lucide-react';
import { mediaService, normalizeMediaUrl } from '../../services/media/mediaService';
import { ActionSheet, type ActionSheetAction } from '../../components/ui/ActionSheet';
import { toast } from '../../stores/useToastStore';
import { DURATION, EASE, SPRING } from '../../motion/tokens';
import { GiftMessageCard } from '../gifts/GiftMessageCard';
import type { GiftSnapshot } from '../gifts/types';
import { useAppTranslation } from '../../i18n/appLocale';
import { nativeHaptics } from '../../native/haptics';
import { MEETING_REQUEST_LABELS, type AppLocale } from '../../i18n/appLocale';

export const meetingCopy = (locale: AppLocale) => MEETING_REQUEST_LABELS[locale];

export interface MessageTranslation {
  translatedText: string;
  detectedLanguage: string | null;
  targetLanguage: string;
}

export interface StoryReplyPreview {
  id: string;
  mediaUrl: string;
  caption?: string | null;
}

export interface ReplyMessagePreview {
  id: string;
  senderId?: string;
  text?: string | null;
  messageType?: string | null;
  unavailable?: boolean;
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
  replyToMessagePreview?: ReplyMessagePreview | null;
  replyToStoryId?: string | null;
  replyToStoryPreview?: StoryReplyPreview | null;
  reactions?: { userId: string; reaction: string }[];
  editedAt?: string;
  createdAt: string;
  translation?: MessageTranslation | null;
  giftSendId?: string | null;
  giftSnapshot?: GiftSnapshot | null;
  isRead?: boolean;
  deliveredAt?: string | null;
  readAt?: string | null;
  metadata?: { status?: 'PENDING' | 'ACCEPTED' | 'REJECTED' };
}

const DOUBLE_TAP_REACTION = '❤️';
const DOUBLE_TAP_WINDOW_MS = 320;
const REPLY_SWIPE_THRESHOLD = 56;
const REPLY_SWIPE_MAX = 84;

interface MessageBubbleProps {
  message: ChatMessage;
  isMe: boolean;
  replySource?: ChatMessage | ReplyMessagePreview;
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
  onMeetingDecision?: (message: ChatMessage, decision: 'ACCEPTED' | 'REJECTED') => void;
}

function VoicePlayer({ url, durationSeconds, isMe }: { url: string; durationSeconds?: number; isMe: boolean }) {
  const { t } = useAppTranslation();
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
        aria-label={isPlaying ? t('bubbleVoicePauseAriaLabel') : t('bubbleVoicePlayAriaLabel')}
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
  onMeetingDecision,
}) => {
  const { t, locale } = useAppTranslation();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  // Local to this bubble on purpose -- "show original" is a per-message glance, not app state
  // worth persisting or lifting; it resets naturally if the message scrolls out and back in.
  const [showOriginal, setShowOriginal] = useState(false);
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const [imageRetryKey, setImageRetryKey] = useState(0);
  const resolvedMediaUrl = useAuthorizedMediaUrl(message.mediaUrl);
  const resolvedStoryPreviewUrl = message.replyToStoryPreview?.mediaUrl
    ? normalizeMediaUrl(message.replyToStoryPreview.mediaUrl)
    : undefined;
  const resolvedReplyPreview = replySource || message.replyToMessagePreview;
  const reactionCounts = (message.reactions || []).reduce<Record<string, number>>((acc, r) => {
    acc[r.reaction] = (acc[r.reaction] || 0) + 1;
    return acc;
  }, {});

  // Swipe-to-reply: drag right only, reveal the Reply affordance behind the bubble, commit past
  // threshold on release. Same physical-drag idiom as SwipeCard (a motion value driving style,
  // an imperative animate() to spring back) -- never a fixed-duration tween for a drag gesture.
  const reduceMotion = useReducedMotion();
  const dragX = useMotionValue(0);
  const replyIconOpacity = useTransform(dragX, [12, REPLY_SWIPE_THRESHOLD], [0, 1]);
  const replyIconScale = useTransform(dragX, [12, REPLY_SWIPE_THRESHOLD], [0.7, 1]);
  const canSwipeReply = !readOnly && Boolean(onReply);
  const handleReplyDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x > REPLY_SWIPE_THRESHOLD) {
      nativeHaptics.impact();
      onReply?.(message);
    }
    animate(dragX, 0, reduceMotion ? { duration: DURATION.micro } : SPRING.snappy);
  };

  // Double-tap-to-react: manual timestamp-based double-tap detection on the bubble's native
  // click (not Framer's onTap/onDoubleClick gesture recognizers, which depend on Pointer Events
  // details that don't fire consistently across every WebView/test environment) toggles the
  // heart reaction -- the server already deletes a reaction when the same one is sent twice (see
  // socket_server.js message:reaction), so "add" and "remove" are the same call from here. A
  // genuine drag (the swipe-to-reply gesture below) never reaches this handler: Framer suppresses
  // the trailing click once real pointer movement has been claimed by the drag gesture.
  const [showLikeBurst, setShowLikeBurst] = useState(false);
  const lastTapRef = useRef(0);
  const canDoubleTapReact = !readOnly && Boolean(onReact);
  const handleBubbleTap = () => {
    if (!canDoubleTapReact) return;
    const now = Date.now();
    if (now - lastTapRef.current < DOUBLE_TAP_WINDOW_MS) {
      lastTapRef.current = 0;
      nativeHaptics.impact();
      onReact?.(message, DOUBLE_TAP_REACTION);
      setShowLikeBurst(true);
      window.setTimeout(() => setShowLikeBurst(false), 650);
    } else {
      lastTapRef.current = now;
    }
  };

  // Translation only ever applies to the other person's messages -- our own bubble always shows
  // what we actually typed, per product spec.
  const hasTranslation = !isMe && !!message.translation;
  const displayText = hasTranslation && !showOriginal ? message.translation!.translatedText : message.text;

  const actions: ActionSheetAction[] = readOnly ? [] : [
    { label: t('chatReplyingLabel'), icon: <Reply className="w-4 h-4" />, onSelect: () => onReply?.(message) },
    { label: t('bubbleReactLikeLabel'), icon: <Heart className="w-4 h-4" />, onSelect: () => onReact?.(message, '❤️') },
    { label: t('bubbleReactLaughLabel'), icon: <Laugh className="w-4 h-4" />, onSelect: () => onReact?.(message, '😂') },
    { label: t('bubbleReactApproveLabel'), icon: <ThumbsUp className="w-4 h-4" />, onSelect: () => onReact?.(message, '👍') },
  ];
  if (!readOnly && message.text) {
    actions.push({
      label: t('bubbleCopyAction'),
      icon: <Copy className="w-4 h-4" />,
      onSelect: () => {
        navigator.clipboard?.writeText(message.text || '');
        toast.success(t('bubbleCopiedToast'));
      },
    });
  }
  if (!readOnly && isMe && message.text) {
    actions.push({ label: t('bubbleEditAction'), icon: <Pencil className="w-4 h-4" />, onSelect: () => onEdit?.(message) });
  }
  if (!readOnly && isMe) {
    actions.push({
      label: t('deleteLabel'),
      icon: <Trash2 className="w-4 h-4" />,
      destructive: true,
      onSelect: () => onDelete?.(message),
    });
  } else if (!readOnly) {
    if (message.text && !message.translation && !isTranslating) {
      actions.push({
        label: t('bubbleTranslateAction'),
        icon: <Languages className="w-4 h-4" />,
        onSelect: () => onTranslate?.(message),
      });
    }
    actions.push({
      label: t('reportLabel'),
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

  if (String(message.messageType || '').toUpperCase() === 'MEETING_REQUEST') {
    const copy = meetingCopy(locale);
    const status = message.metadata?.status || 'PENDING';
    return <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}><div className="my-1 max-w-[86%] rounded-3xl border border-pink-500/25 bg-surface p-4 shadow-soft"><p className="text-body font-extrabold text-app">{copy.title}</p><p className="mt-1 text-caption normal-case text-app-muted">{status === 'ACCEPTED' ? copy.accepted : status === 'REJECTED' ? copy.rejected : copy.pending}</p>{status === 'PENDING' && !isMe && <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => onMeetingDecision?.(message, 'REJECTED')} className="rounded-xl border border-app px-3 py-2 text-caption font-bold text-app">{t('callDeclineAriaLabel')}</button><button type="button" onClick={() => onMeetingDecision?.(message, 'ACCEPTED')} className="rounded-xl bg-brand-gradient px-3 py-2 text-caption font-bold text-white">{t('callAcceptAriaLabel')}</button></div>}</div></div>;
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
            aria-label={t('bubbleMessageOptionsAriaLabel')}
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        )}

        <div className="flex min-w-0 flex-col gap-1" style={{ alignItems: isMe ? 'flex-end' : 'flex-start' }}>
          <div className="relative min-w-0">
            {canSwipeReply && (
              <motion.div
                aria-hidden="true"
                style={{ opacity: replyIconOpacity, scale: replyIconScale }}
                className="pointer-events-none absolute inset-y-0 start-0 -ms-9 flex items-center text-pink-500"
              >
                <Reply className="w-5 h-5" />
              </motion.div>
            )}
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DURATION.micro, ease: EASE.standard }}
              style={{ x: dragX }}
              drag={canSwipeReply ? 'x' : false}
              dragConstraints={{ left: 0, right: REPLY_SWIPE_MAX }}
              dragElastic={0.35}
              dragMomentum={false}
              onDragEnd={canSwipeReply ? handleReplyDragEnd : undefined}
              onClick={handleBubbleTap}
              onContextMenu={(event) => {
                if (actions.length === 0) return;
                event.preventDefault();
                setIsSheetOpen(true);
              }}
              className={`relative min-w-0 px-3 py-2 text-body ${
                isMe
                  ? `bg-brand-gradient font-medium text-white ${isLastInGroup ? 'rounded-[18px] rounded-br-[5px]' : 'rounded-[18px] rounded-br-xl'}`
                  : `bg-surface-elevated font-medium text-app shadow-soft ${isLastInGroup ? 'rounded-[18px] rounded-bl-[5px]' : 'rounded-[18px] rounded-bl-xl'}`
              }`}
            >
              <AnimatePresence>
                {showLikeBurst && (
                  <motion.div
                    aria-hidden="true"
                    initial={{ opacity: 0, scale: 0.4 }}
                    animate={{ opacity: [0, 1, 1, 0], scale: [0.4, 1.25, 1.1, 1] }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.6, ease: EASE.decelerate }}
                    className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
                  >
                    <Heart className="h-10 w-10 fill-[#FF4D8D] text-[#FF4D8D] drop-shadow-lg" />
                  </motion.div>
                )}
              </AnimatePresence>
              {message.replyToStoryPreview && (
                <div className={`mb-1.5 flex items-center gap-2 overflow-hidden rounded-xl p-1.5 ${isMe ? 'bg-white/[0.12]' : 'bg-app'}`}>
                  {resolvedStoryPreviewUrl && (
                    <img
                      src={resolvedStoryPreviewUrl}
                      alt=""
                      className="h-10 w-7 shrink-0 rounded-lg object-cover"
                    />
                  )}
                  <p className={`min-w-0 truncate text-micro normal-case ${isMe ? 'text-white/85' : 'text-app-muted'}`}>
                    {t('bubbleStoryReplyLabel')}{message.replyToStoryPreview.caption ? `: ${message.replyToStoryPreview.caption}` : ''}
                  </p>
                </div>
              )}
              {message.title && <p className={`mb-1 text-micro font-extrabold normal-case ${isMe ? 'text-white/85' : 'text-pink-500'}`}>{message.title}</p>}
              {message.replyToMessageId && (
                <div className={`mb-1.5 flex max-w-full items-stretch overflow-hidden rounded-xl ${isMe ? 'bg-white/[0.12]' : 'bg-app'}`}>
                  <span className={`w-0.5 shrink-0 ${isMe ? 'bg-white/70' : 'bg-pink-500'}`} />
                  <p className={`truncate px-2.5 py-1.5 text-micro normal-case ${isMe ? 'text-white/85' : 'text-app-muted'}`}>
                    {(resolvedReplyPreview && 'unavailable' in resolvedReplyPreview && resolvedReplyPreview.unavailable)
                      ? t('chatMessageDeletedFallback')
                      : resolvedReplyPreview?.text || (resolvedReplyPreview?.messageType
                        ? t('bubbleTypedMessageTemplate').replace('{type}', resolvedReplyPreview.messageType)
                        : t('chatMessageDeletedFallback'))}
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
                <span>{t('bubbleViewOnceRevealAction')}</span>
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
                    <button type="button" className="mb-1.5 block w-full overflow-hidden rounded-[14px] bg-black/10" onClick={(event) => { event.stopPropagation(); setImageViewerOpen(true); }}>
                      {imageLoadFailed ? (
                        <span className="flex min-h-32 items-center justify-center gap-2 text-micro"><RefreshCw className="h-4 w-4" />{t('retryButton')}</span>
                      ) : (
                        <img key={imageRetryKey} src={resolvedMediaUrl} alt={t('bubbleMediaAlt')} loading="lazy" decoding="async" onError={() => setImageLoadFailed(true)} className="max-h-60 w-full object-cover" />
                      )}
                    </button>
                  )}
                {displayText && <p className="whitespace-pre-wrap leading-[1.42]">{displayText}</p>}
                {!message.translation && isTranslating && (
                  <p className="text-micro italic opacity-70 mt-0.5">{t('bubbleTranslatingLabel')}</p>
                )}
                {hasTranslation && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowOriginal((v) => !v);
                    }}
                    className="text-micro underline mt-0.5 text-app-muted"
                  >
                    {showOriginal ? t('bubbleShowTranslationLabel') : t('bubbleShowOriginalLabel')}
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
              {isMe && (
                // Real per-message backend state, not a UI guess: message.isRead/deliveredAt come
                // straight from the messages row (REST fetch) or a realtime message:read/
                // message:delivered patch -- never derived from "is this the last message I sent."
                message.isRead
                  ? <CheckCheck className="w-3.5 h-3.5 text-[#34B7F1]" />
                  : message.deliveredAt
                    ? <CheckCheck className="w-3.5 h-3.5" />
                    : <Check className="w-3.5 h-3.5" />
              )}
            </div>
            </motion.div>
          </div>

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

      <AnimatePresence>
        {imageViewerOpen && resolvedMediaUrl && (
          <motion.div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/95 px-3 pb-[var(--safe-bottom)] pt-[var(--safe-top)]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setImageViewerOpen(false)}>
            <button type="button" aria-label={t('closeAriaLabel')} className="absolute right-4 top-[calc(var(--safe-top)+12px)] z-10 rounded-full bg-white/15 p-2 text-white" onClick={() => setImageViewerOpen(false)}><X className="h-6 w-6" /></button>
            {imageLoadFailed ? (
              <button type="button" className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-white" onClick={(event) => { event.stopPropagation(); setImageLoadFailed(false); setImageRetryKey((value) => value + 1); }}><RefreshCw className="h-5 w-5" />{t('retryButton')}</button>
            ) : (
              <img key={`viewer-${imageRetryKey}`} src={resolvedMediaUrl} alt={t('bubbleMediaAlt')} onError={() => setImageLoadFailed(true)} onClick={(event) => event.stopPropagation()} className="max-h-full max-w-full object-contain" />
            )}
          </motion.div>
        )}
      </AnimatePresence>
      {actions.length > 0 && <ActionSheet isOpen={isSheetOpen} onClose={() => setIsSheetOpen(false)} title={t('bubbleActionsTitle')} actions={actions} />}
    </div>
  );
};
