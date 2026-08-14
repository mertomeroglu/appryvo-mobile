import React, { useRef, useState } from 'react';
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
  MoreVertical,
  Pause,
  Pencil,
  Play,
  Reply,
  ThumbsUp,
  Trash2,
} from 'lucide-react';
import { normalizeMediaUrl } from '../../services/media/mediaService';
import { ActionSheet, type ActionSheetAction } from '../../components/ui/ActionSheet';
import { toast } from '../../stores/useToastStore';
import { DURATION, EASE } from '../../motion/tokens';

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
}

interface MessageBubbleProps {
  message: ChatMessage;
  isMe: boolean;
  isLastMineRead: boolean;
  replySource?: ChatMessage;
  viewOnceRevealed: boolean;
  isTranslating?: boolean;
  onRevealViewOnce: (message: ChatMessage) => void;
  onReply: (message: ChatMessage) => void;
  onEdit: (message: ChatMessage) => void;
  onDelete: (message: ChatMessage) => void;
  onReact: (message: ChatMessage, reaction: string) => void;
  onReport: (message: ChatMessage) => void;
  onTranslate: (message: ChatMessage) => void;
}

function VoicePlayer({ url, durationSeconds }: { url: string; durationSeconds?: number }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const toggle = () => {
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
    <div className="flex items-center gap-2.5 min-w-[160px]">
      <button
        onClick={toggle}
        className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0"
      >
        {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
      </button>
      <div className="flex-1 h-1.5 rounded-full bg-white/25 overflow-hidden">
        <div className="h-full bg-white rounded-full" style={{ width: `${progress * 100}%` }} />
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
}) => {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  // Local to this bubble on purpose -- "show original" is a per-message glance, not app state
  // worth persisting or lifting; it resets naturally if the message scrolls out and back in.
  const [showOriginal, setShowOriginal] = useState(false);
  const reactionCounts = (message.reactions || []).reduce<Record<string, number>>((acc, r) => {
    acc[r.reaction] = (acc[r.reaction] || 0) + 1;
    return acc;
  }, {});

  // Translation only ever applies to the other person's messages -- our own bubble always shows
  // what we actually typed, per product spec.
  const hasTranslation = !isMe && !!message.translation;
  const displayText = hasTranslation && !showOriginal ? message.translation!.translatedText : message.text;

  const actions: ActionSheetAction[] = [
    { label: 'Yanıtla', icon: <Reply className="w-4 h-4" />, onSelect: () => onReply(message) },
    { label: 'Beğen ❤️', icon: <Heart className="w-4 h-4" />, onSelect: () => onReact(message, '❤️') },
    { label: 'Güldür 😂', icon: <Laugh className="w-4 h-4" />, onSelect: () => onReact(message, '😂') },
    { label: 'Onayla 👍', icon: <ThumbsUp className="w-4 h-4" />, onSelect: () => onReact(message, '👍') },
  ];
  if (message.text) {
    actions.push({
      label: 'Kopyala',
      icon: <Copy className="w-4 h-4" />,
      onSelect: () => {
        navigator.clipboard?.writeText(message.text || '');
        toast.success('Kopyalandı');
      },
    });
  }
  if (isMe && message.text) {
    actions.push({ label: 'Düzenle', icon: <Pencil className="w-4 h-4" />, onSelect: () => onEdit(message) });
  }
  if (isMe) {
    actions.push({
      label: 'Sil',
      icon: <Trash2 className="w-4 h-4" />,
      destructive: true,
      onSelect: () => onDelete(message),
    });
  } else {
    if (message.text && !message.translation && !isTranslating) {
      actions.push({
        label: 'Çevir',
        icon: <Languages className="w-4 h-4" />,
        onSelect: () => onTranslate(message),
      });
    }
    actions.push({
      label: 'Bildir',
      icon: <Flag className="w-4 h-4" />,
      destructive: true,
      onSelect: () => onReport(message),
    });
  }

  const showViewOnceLock = message.isViewOnce && !isMe && !viewOnceRevealed;

  return (
    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} group`}>
      <div className={`flex items-end gap-1 max-w-[80%] ${isMe ? 'flex-row-reverse' : ''}`}>
        <button
          onClick={() => setIsSheetOpen(true)}
          className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 text-app-muted transition-opacity"
          aria-label="Mesaj seçenekleri"
        >
          <MoreVertical className="w-3.5 h-3.5" />
        </button>

        <div className="flex flex-col gap-1" style={{ alignItems: isMe ? 'flex-end' : 'flex-start' }}>
          {replySource && (
            <div
              className={`px-3 py-1.5 rounded-xl text-micro border-l-2 ${
                isMe ? 'bg-white/10 border-white/40 text-white/80' : 'bg-app-secondary border-pink-500 text-app-muted'
              } max-w-full truncate`}
            >
              {replySource.text || (replySource.messageType ? `${replySource.messageType} mesajı` : 'Mesaj')}
            </div>
          )}

          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION.micro, ease: EASE.standard }}
            onClick={() => setIsSheetOpen(true)}
            className={`px-4 py-2.5 rounded-2xl text-body shadow-soft cursor-pointer ${
              isMe
                ? 'bg-brand-gradient text-white rounded-br-none font-medium'
                : 'bg-surface border border-app text-app rounded-bl-none font-medium'
            }`}
          >
            {showViewOnceLock ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRevealViewOnce(message);
                }}
                className="flex items-center gap-2 py-1"
              >
                <Eye className="w-4 h-4" />
                <span>Tek seferlik fotoğrafı görüntüle</span>
              </button>
            ) : (
              <>
                {message.mediaUrl && message.messageType === 'VIDEO' && (
                  <video
                    src={normalizeMediaUrl(message.mediaUrl)}
                    controls
                    className="w-full max-h-60 rounded-xl mb-1.5"
                  />
                )}
                {message.mediaUrl && message.messageType === 'AUDIO' && (
                  <VoicePlayer url={message.mediaUrl} durationSeconds={message.durationSeconds} />
                )}
                {message.mediaUrl &&
                  (message.messageType === 'IMAGE' || message.messageType === 'GIF' || !message.messageType) && (
                    <img
                      src={normalizeMediaUrl(message.mediaUrl)}
                      alt="Medya"
                      loading="lazy"
                      decoding="async"
                      className="w-full max-h-60 object-cover rounded-xl mb-1.5"
                    />
                  )}
                {displayText && <p className="leading-relaxed whitespace-pre-wrap">{displayText}</p>}
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
              className={`flex items-center gap-1 text-[10px] mt-1 ${
                isMe ? 'text-white/70 justify-end' : 'text-app-muted'
              }`}
            >
              {message.editedAt && <span className="italic">düzenlendi</span>}
              <span>
                {message.createdAt
                  ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : ''}
              </span>
              {isMe && (isLastMineRead ? <CheckCheck className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />)}
            </div>
          </motion.div>

          {Object.keys(reactionCounts).length > 0 && (
            <div className="flex gap-1">
              {Object.entries(reactionCounts).map(([reaction, count]) => (
                <span
                  key={reaction}
                  className="text-micro px-2 py-0.5 rounded-full bg-surface border border-app shadow-soft"
                >
                  {reaction} {count > 1 ? count : ''}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <ActionSheet isOpen={isSheetOpen} onClose={() => setIsSheetOpen(false)} actions={actions} />
    </div>
  );
};
