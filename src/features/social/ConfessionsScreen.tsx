import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Crown, Flag, Heart, MessageCircle, MessageSquare, MoreVertical, Plus, Share2, ShieldCheck, Trash2 } from 'lucide-react';
import { nativeShare } from '../../native/share';
import {
  type ConfessionItem,
  useConfessionsQuery,
  useCreateConfessionMutation,
  useDeleteConfessionMutation,
  useLikeConfessionMutation,
  useReportConfessionMutation,
} from '../../hooks/useQueries';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Skeleton } from '../../components/ui/Skeleton';
import { Modal } from '../../components/ui/Modal';
import { ActionSheet, type ActionSheetAction } from '../../components/ui/ActionSheet';
import { AppButton } from '../../components/ui/AppButton';
import { toast } from '../../stores/useToastStore';
import { staggerContainer, staggerItem } from '../../motion/variants';
import { CommentsSheet } from './CommentsSheet';
import { useAppLocaleStore, useAppTranslation } from '../../i18n/appLocale';

export const ConfessionsScreen: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const navigate = useNavigate();
  const { t } = useAppTranslation();
  const locale = useAppLocaleStore((state) => state.locale);
  const REPORT_REASONS = [
    { value: 'SPAM', label: t('reportReasonSpam') },
    { value: 'HARASSMENT', label: t('reportReasonHarassment') },
    { value: 'OTHER', label: t('reportReasonOther') },
  ];
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [text, setText] = useState('');
  const [activeCommentsId, setActiveCommentsId] = useState<string | null>(null);
  const [menuTarget, setMenuTarget] = useState<ConfessionItem | null>(null);
  const createInFlightRef = useRef(false);

  const { data: confessions, refetch, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useConfessionsQuery(10);
  const createConfession = useCreateConfessionMutation();
  const likeConfession = useLikeConfessionMutation();
  const deleteConfession = useDeleteConfessionMutation();
  const reportConfession = useReportConfessionMutation();

  const handleCreateConfession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (createInFlightRef.current) return;

    const cleanText = text.trim();
    if (!cleanText) {
      toast.error(t('confessionTextRequiredToast'));
      return;
    }

    createInFlightRef.current = true;
    try {
      const response = await createConfession.mutateAsync(cleanText);
      setText('');
      setShowCreateModal(false);
      toast.success(response?.data?.moderationStatus === 'REVIEW_REQUIRED' ? t('confessionUnderReviewToast') : t('confessionPublishedToast'));
    } catch (error: any) {
      toast.error(error?.message || t('confessionPublishFailedToast'));
    } finally {
      createInFlightRef.current = false;
    }
  };

  const handleLike = (id: string) => likeConfession.mutate(id, {
    onError: () => toast.error(t('actionFailedToast')),
  });

  const confessionsList = confessions?.pages.flatMap((page) => page.items) || [];
  const quotaExceeded = confessions?.pages.some((page) => page.isQuotaExceeded) === true;

  // Sharing a confession's text is always safe: the payload below is built from `text` alone --
  // never item.userId or any author-identifying field -- so anonymity holds regardless of who
  // is sharing or which app the recipient opens it in.
  const shareAction: ActionSheetAction[] = menuTarget
    ? [
        {
          label: t('shareLabel'),
          icon: <Share2 className="w-4 h-4" />,
          onSelect: () => {
            const target = menuTarget;
            void nativeShare.share({
              text: t('confessionShareQuoteTemplate').replace('{text}', target.text),
              url: 'https://appryvo.online/messages?tab=confessions',
              dialogTitle: t('confessionShareDialogTitle'),
            }).catch(() => {});
          },
        },
      ]
    : [];

  const menuActions: ActionSheetAction[] = menuTarget
    ? [
        ...shareAction,
        ...(menuTarget.isMyPost
          ? [
              {
                label: t('deleteLabel'),
                icon: <Trash2 className="w-4 h-4" />,
                destructive: true,
                onSelect: () => {
                  deleteConfession.mutate(menuTarget.id, {
                    onSuccess: () => toast.success(t('confessionDeletedToast')),
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
                reportConfession.mutate(
                  { id: menuTarget.id, reason: r.value },
                  {
                    onSuccess: () => toast.success(t('reportReceivedToast')),
                    onError: () => toast.error(t('reportFailedToast')),
                  }
                );
              },
            }))),
      ]
    : [];

  return (
    <div className={`flex w-full flex-col bg-app text-app select-none ${embedded ? 'pb-4' : 'h-full overflow-y-auto p-4 pb-24 no-scrollbar'}`}>
      <header className={`flex items-start justify-between gap-3 ${embedded ? 'my-4' : 'pt-safe my-2'}`}>
        <div>
          <h2 className="text-title text-app">{t('confessionsTitle')}</h2>
          <p className="text-caption text-app-muted mt-0.5 normal-case">{t('confessionsSubtitle')}</p>
        </div>

        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand-gradient px-3.5 py-2.5 text-caption font-black text-white shadow-elevated transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Plus className="w-4 h-4" /> {t('confessionShareCta')}
        </button>
      </header>

      {/* Feed List */}
      <div className="space-y-3 my-4">
        {isLoading ? (
          <>
            <Skeleton variant="card" />
            <Skeleton variant="card" />
            <Skeleton variant="card" />
          </>
        ) : isError ? (
          <ErrorState title={t('confessionsLoadErrorTitle')} message={t('confessionsLoadErrorMessage')} onRetry={() => void refetch()} />
        ) : quotaExceeded && confessionsList.length === 0 ? (
          <div className="my-auto py-12">
            <EmptyState
              icon={<Crown className="h-8 w-8" />}
              title={t('dailyLimitReachedTitle')}
              subtitle={t('dailyLimitReachedSubtitle')}
              actionLabel={t('explorePremiumCta')}
              onAction={() => navigate('/premium')}
            />
          </div>
        ) : confessionsList.length === 0 ? (
          <div className="my-auto py-12">
            <EmptyState
              icon={<MessageCircle className="h-8 w-8" />}
              title={t('noConfessionsTitle')}
              subtitle={t('noConfessionsSubtitle')}
              actionLabel={t('confessionShareCta')}
              onAction={() => setShowCreateModal(true)}
            />
          </div>
        ) : (
          <motion.div variants={staggerContainer()} initial="initial" animate="animate" className="space-y-3">
            {confessionsList.map((item) => (
              <motion.article
                key={item.id}
                variants={staggerItem}
                className="space-y-3 border-b border-app px-1 py-4 last:border-b-0"
              >
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-caption font-extrabold text-pink-500"><ShieldCheck className="h-4 w-4" /> {t('anonymousLabel')}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-micro text-app-muted normal-case">
                      {item.createdAt ? new Date(item.createdAt).toLocaleDateString(locale) : ''}
                    </span>
                    <button
                      onClick={() => setMenuTarget(item)}
                      className="rounded-full p-1.5 text-app-muted hover:text-app focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      aria-label={t('confessionOptionsAriaLabel')}
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <p className="text-body text-app font-medium leading-relaxed">{item.text}</p>

                <div className="flex items-center gap-5 pt-2 border-t border-app text-caption text-app-muted">
                  <button type="button" aria-label={item.isLikedByMe ? t('unlikeConfessionAriaLabel') : t('likeConfessionAriaLabel')} aria-pressed={item.isLikedByMe} onClick={() => handleLike(item.id)} disabled={likeConfession.isPending} className="flex items-center gap-1.5 hover:text-pink-500 disabled:opacity-60">
                    <Heart className={`w-4 h-4 ${item.isLikedByMe ? 'fill-pink-500 text-pink-500' : ''}`} />
                    <span>{item.likesCount || 0}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveCommentsId(item.id)}
                    className="flex items-center gap-1.5 hover:text-app"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>{t('commentsCountTemplate').replace('{count}', String(item.commentsCount || 0))}</span>
                  </button>

                  {!item.isMyPost && <button type="button" onClick={() => setMenuTarget(item)} className="ms-auto flex items-center gap-1.5 hover:text-[var(--color-error)]"><Flag className="h-4 w-4" /><span>{t('reportLabel')}</span></button>}
                </div>
              </motion.article>
            ))}
          </motion.div>
        )}
        {quotaExceeded && confessionsList.length > 0 && (
          <div className="rounded-2xl border border-[#F5B942]/35 bg-[#F5B942]/10 p-4 text-center">
            <Crown className="mx-auto h-5 w-5 text-[#B57A08]" />
            <p className="mt-2 text-caption font-bold text-app">{t('dailyLimitBannerMessage')}</p>
            <button type="button" onClick={() => navigate('/premium')} className="mt-1 text-caption font-extrabold text-[#B57A08] underline">{t('explorePremiumCta')}</button>
          </div>
        )}
        {hasNextPage && <AppButton type="button" variant="secondary" size="md" fullWidth loading={isFetchingNextPage} onClick={() => void fetchNextPage()}>{t('loadMoreLabel')}</AppButton>}
      </div>

      {/* Create Modal */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)}>
        <form onSubmit={handleCreateConfession} className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-heading text-app">{t('confessionShareCta')}</h3>
          </div>

          <textarea
            rows={4}
            maxLength={1000}
            aria-label={t('confessionTextAriaLabel')}
            placeholder={t('confessionTextPlaceholder')}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full rounded-2xl border border-app bg-input-app p-3 text-body font-semibold text-app focus:border-pink-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />

          <p className="text-end text-micro normal-case text-app-muted" aria-live="polite">{text.length}/1000</p>

          <p className="rounded-2xl border border-app bg-app-secondary p-3 text-caption normal-case leading-relaxed text-app-muted">{t('confessionDisclaimerMessage')}</p>

          <div className="flex gap-2 pt-2">
            <AppButton type="button" variant="secondary" size="md" className="flex-1" onClick={() => setShowCreateModal(false)}>
              {t('cancel')}
            </AppButton>
            <AppButton type="submit" variant="primary" size="md" className="flex-1" loading={createConfession.isPending} disabled={createConfession.isPending}>
              {t('shareLabel')}
            </AppButton>
          </div>
        </form>
      </Modal>

      <CommentsSheet confessionId={activeCommentsId} onClose={() => setActiveCommentsId(null)} />

      <ActionSheet title={t('confessionOptionsAriaLabel')} isOpen={!!menuTarget} onClose={() => setMenuTarget(null)} actions={menuActions} />
    </div>
  );
};
