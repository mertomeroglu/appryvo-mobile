import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, type PanInfo } from 'framer-motion';
import { Eye, Flag, Megaphone, MoreVertical, Send, Trash2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  useDeleteStoryMutation,
  useMarkStoryViewedMutation,
  useMatchesQuery,
  useReportStoryMutation,
  useStorySpotlightConfigQuery,
  useStorySpotlightMutation,
  useStoryViewersQuery,
  type StoryItem,
} from '../hooks/useQueries';
import { normalizeMediaUrl } from '../services/media/mediaService';
import { socketService } from '../services/socket/socketService';
import { nativeApp } from '../native/app';
import { toast } from '../stores/useToastStore';
import { Avatar } from './ui/Avatar';
import { IconButton } from './ui/IconButton';
import { ActionSheet, type ActionSheetAction } from './ui/ActionSheet';
import { useAppTranslation } from '../i18n/appLocale';

const STORY_DURATION_MS = 5000;

interface StoryViewerProps {
  stories: StoryItem[];
  startIndex: number;
  selfId?: string;
  onClose: () => void;
}

export const StoryViewer: React.FC<StoryViewerProps> = ({ stories, startIndex, selfId, onClose }) => {
  const { t } = useAppTranslation();
  const REPORT_REASONS = [
    { value: 'SPAM', label: t('reportReasonSpam') },
    { value: 'HARASSMENT', label: t('reportReasonHarassment') },
    { value: 'OTHER', label: t('reportReasonOther') },
  ];
  const navigate = useNavigate();
  const [index, setIndex] = useState(startIndex);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [viewersOpen, setViewersOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replySending, setReplySending] = useState(false);
  const rafRef = useRef<number>();
  const lastTickRef = useRef(performance.now());

  const story = stories[index];
  const isOwn = !!selfId && story?.userId === selfId;
  const markViewed = useMarkStoryViewedMutation();
  const deleteStory = useDeleteStoryMutation();
  const reportStory = useReportStoryMutation();
  const { data: spotlightConfig } = useStorySpotlightConfigQuery();
  const spotlightMutation = useStorySpotlightMutation();
  const { data: viewers } = useStoryViewersQuery(viewersOpen && isOwn ? story?.id || null : null);
  const { data: matches } = useMatchesQuery();
  const existingMatch = useMemo(
    () => (Array.isArray(matches) ? matches.find((m: any) => (m.user || m)?.id === story?.userId) : null),
    [matches, story?.userId]
  );

  // Mark seen once per story shown, matches server-side idempotency (retrying this is harmless).
  useEffect(() => {
    if (story?.id && !isOwn) markViewed.mutate(story.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id, isOwn]);

  // Android hardware back closes the viewer instead of leaving Messages.
  useEffect(() => {
    const listenerPromise = nativeApp.addBackButtonListener(() => onClose());
    return () => { void listenerPromise.then((l) => l.remove()); };
  }, [onClose]);

  // Preload next story's media.
  useEffect(() => {
    const next = stories[index + 1];
    if (next?.mediaUrl) {
      const img = new Image();
      img.src = normalizeMediaUrl(next.mediaUrl);
    }
  }, [index, stories]);

  useEffect(() => {
    setElapsed(0);
    lastTickRef.current = performance.now();
  }, [index]);

  useEffect(() => {
    const tick = (now: number) => {
      if (!paused && !menuOpen && !viewersOpen) {
        setElapsed((prev) => {
          const next = prev + (now - lastTickRef.current);
          if (next >= STORY_DURATION_MS) {
            if (index >= stories.length - 1) onClose();
            else setIndex((i) => i + 1);
            return 0;
          }
          return next;
        });
      }
      lastTickRef.current = now;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, menuOpen, viewersOpen, index, stories.length]);

  if (!story) return null;

  const goPrev = () => setIndex((i) => Math.max(i - 1, 0));
  const goNext = () => (index >= stories.length - 1 ? onClose() : setIndex((i) => i + 1));

  const handleDragEnd = (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.y > 100 || info.velocity.y > 600) onClose();
  };

  const sendReply = async () => {
    const text = replyText.trim();
    if (!text || !existingMatch || replySending) return;
    setReplySending(true);
    socketService.sendMessage(
      { matchId: existingMatch.id, text, replyToStoryId: story.id, clientMessageId: `story-reply-${Date.now()}` },
      (res) => {
        setReplySending(false);
        if (res?.status === 'error') {
          toast.error(res?.message || t('storyReplyFailedToast'));
        } else {
          setReplyText('');
          toast.success(t('storyReplySentToast'));
        }
      }
    );
  };

  const menuActions: ActionSheetAction[] = isOwn
    ? [
        {
          label: story.isPromoted ? t('storySpotlightActiveLabel') : t('storySpotlightPromoteLabel'),
          icon: <Megaphone className="w-4 h-4" />,
          onSelect: () => {
            if (story.isPromoted) {
              toast.show(t('storyAlreadySpotlightedToast'), 'neutral');
              return;
            }
            if (!spotlightConfig?.available) {
              toast.show(t('storySpotlightUnavailableToast'), 'neutral');
              return;
            }
            spotlightMutation.mutate(
              { storyId: story.id, idempotencyKey: `spotlight-${story.id}` },
              {
                onSuccess: () => toast.success(t('storySpotlightSuccessTemplate').replace('{cost}', String(spotlightConfig.costCoins))),
                onError: (err: any) => {
                  if (err?.code === 'INSUFFICIENT_COINS') {
                    toast.error(t('insufficientCoinsMessage'));
                  } else {
                    toast.error(err?.message || t('storySpotlightFailedToast'));
                  }
                },
              }
            );
          },
        },
        {
          label: t('deleteLabel'),
          icon: <Trash2 className="w-4 h-4" />,
          destructive: true,
          onSelect: () => {
            deleteStory.mutate(story.id, {
              onSuccess: () => {
                toast.success(t('storyDeletedToast'));
                if (stories.length <= 1) onClose();
                else setIndex((i) => Math.min(i, stories.length - 2));
              },
              onError: () => toast.error(t('deleteFailedToast')),
            });
          },
        },
      ]
    : REPORT_REASONS.map((r) => ({
        label: t('reportWithReasonTemplate').replace('{reason}', r.label),
        icon: <Flag className="w-4 h-4" />,
        destructive: true,
        onSelect: () => {
          reportStory.mutate(
            { storyId: story.id, reason: r.value },
            { onSuccess: () => toast.success(t('storyReportedToast')), onError: () => toast.error(t('reportFailedToast')) }
          );
        },
      }));

  return (
    <motion.div
      className="fixed inset-0 z-modal bg-black flex flex-col select-none touch-none"
      drag="y"
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={0.5}
      onDragEnd={handleDragEnd}
    >
      <img
        key={story.id}
        src={normalizeMediaUrl(story.mediaUrl)}
        alt={story.userName}
        decoding="async"
        className="absolute inset-0 w-full h-full object-contain"
      />

      {/* Tap zones: left 35% previous, right 65% next -- large enough not to require precision,
          hold anywhere pauses the auto-advance timer. */}
      <div className="absolute inset-x-0 top-0 bottom-24 flex z-10">
        <button
          aria-label={t('prevStoryAriaLabel')}
          className="w-[35%] h-full"
          onPointerDown={() => setPaused(true)}
          onPointerUp={() => setPaused(false)}
          onPointerCancel={() => setPaused(false)}
          onClick={goPrev}
        />
        <button
          aria-label={t('nextStoryAriaLabel')}
          className="w-[65%] h-full"
          onPointerDown={() => setPaused(true)}
          onPointerUp={() => setPaused(false)}
          onPointerCancel={() => setPaused(false)}
          onClick={goNext}
        />
      </div>

      <div className="absolute inset-x-0 top-0 pt-safe px-4 pb-12 bg-gradient-to-b from-black/80 to-transparent z-20">
        <div className="flex gap-1 mb-3">
          {stories.map((s, i) => (
            <span key={s.id} className="h-1 flex-1 rounded-full bg-white/30 overflow-hidden">
              <span
                className="block h-full bg-white"
                style={{
                  width: i < index ? '100%' : i > index ? '0%' : `${Math.min(100, (elapsed / STORY_DURATION_MS) * 100)}%`,
                  transition: i === index ? 'none' : undefined,
                }}
              />
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Avatar src={story.userPhoto ? normalizeMediaUrl(story.userPhoto) : undefined} name={story.userName} size="sm" />
          <span className="text-caption font-black text-white">{isOwn ? t('myStoryLabel') : story.userName}</span>
          {story.isPromoted && (
            <span className="rounded-full bg-amber-400/90 px-2 py-0.5 text-[10px] font-extrabold uppercase text-black">{t('sponsoredLabel')}</span>
          )}
          <div className="ms-auto flex items-center gap-1">
            {isOwn && (
              <button
                type="button"
                aria-label={t('viewCountAriaLabel')}
                onClick={() => setViewersOpen(true)}
                className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-caption font-bold text-white"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
            )}
            <IconButton aria-label={t('optionsAriaLabel')} variant="overlay" size="sm" onClick={() => setMenuOpen(true)}>
              <MoreVertical className="w-4 h-4" />
            </IconButton>
            <IconButton aria-label={t('closeStoryAriaLabel')} variant="overlay" size="sm" onClick={onClose}>
              <X className="w-5 h-5" />
            </IconButton>
          </div>
        </div>
      </div>

      {story.caption && (
        <p className="absolute inset-x-6 bottom-28 text-body text-white text-center normal-case drop-shadow-lg z-20">
          {story.caption}
        </p>
      )}

      {!isOwn && (
        <div className="absolute inset-x-0 bottom-0 pb-safe px-4 pb-4 z-20">
          {existingMatch ? (
            <form
              onSubmit={(e) => { e.preventDefault(); void sendReply(); }}
              className="flex items-center gap-2 rounded-full bg-white/10 border border-white/20 backdrop-blur-md px-2 py-1.5"
            >
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value.slice(0, 300))}
                onFocus={() => setPaused(true)}
                onBlur={() => setPaused(false)}
                placeholder={t('storyReply')}
                className="flex-1 bg-transparent px-3 py-2 text-body text-white placeholder:text-white/60 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!replyText.trim() || replySending}
                aria-label={t('sendAriaLabel')}
                className="relative w-9 h-9 shrink-0 rounded-full bg-brand-gradient text-white flex items-center justify-center disabled:opacity-40 before:absolute before:-inset-1 before:content-['']"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => { onClose(); navigate(`/discover/${story.userId}`); }}
              className="w-full rounded-full bg-white/10 border border-white/20 backdrop-blur-md px-4 py-3 text-caption font-bold text-white/80 text-center"
            >
              {t('mustMatchToReplyMessage')}
            </button>
          )}
        </div>
      )}

      <ActionSheet title={t('storyOptionsTitle')} isOpen={menuOpen} onClose={() => setMenuOpen(false)} actions={menuActions} />

      {viewersOpen && (
        <div className="fixed inset-0 z-modal bg-black/60 flex items-end" onClick={() => setViewersOpen(false)}>
          <div
            className="w-full max-h-[60vh] overflow-y-auto no-scrollbar bg-app rounded-t-3xl p-4 pb-safe"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-app-secondary" />
            <h4 className="text-heading text-app mb-3">{t('viewCountHeadingTemplate').replace('{count}', String(Array.isArray(viewers) ? viewers.length : 0))}</h4>
            {Array.isArray(viewers) && viewers.length > 0 ? (
              <div className="space-y-3">
                {viewers.map((v: any) => (
                  <div key={v.userId} className="flex items-center gap-3">
                    <Avatar src={v.photoUrl ? normalizeMediaUrl(v.photoUrl) : undefined} name={v.name} size="sm" />
                    <span className="text-body font-semibold text-app">{v.name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-caption text-app-muted normal-case">{t('noViewersYetMessage')}</p>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
};
