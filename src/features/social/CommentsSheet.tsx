import React, { useState } from 'react';
import { Heart, Reply, Send, Trash2, X } from 'lucide-react';
import {
  useConfessionCommentsQuery,
  useAddCommentMutation,
  useDeleteCommentMutation,
  useLikeCommentMutation,
} from '../../hooks/useQueries';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { IconButton } from '../../components/ui/IconButton';
import { Skeleton } from '../../components/ui/Skeleton';
import { toast } from '../../stores/useToastStore';
import { useAppTranslation } from '../../i18n/appLocale';

interface CommentsSheetProps {
  confessionId: string | null;
  onClose: () => void;
}

interface ConfessionComment {
  id: string;
  text: string;
  anonymousBadge?: string;
  likesCount?: number;
  isLikedByMe?: boolean;
  isMyComment?: boolean;
  isDeleted?: boolean;
  replies?: ConfessionComment[];
}

export const CommentsSheet: React.FC<CommentsSheetProps> = ({ confessionId, onClose }) => {
  const { t } = useAppTranslation();
  const [text, setText] = useState('');
  // The server (social_controller.js) already accepts { text, parentId } and notifies the
  // specific parent comment's author, re-pointing a reply-to-a-reply at its top-level parent
  // itself (max depth 1) -- so this UI can offer "Reply" on any comment, including a reply,
  // without needing to track/enforce depth itself.
  const [replyTarget, setReplyTarget] = useState<{ id: string; name: string } | null>(null);

  const { data: comments, isLoading } = useConfessionCommentsQuery(confessionId);
  const addComment = useAddCommentMutation(confessionId);
  const deleteComment = useDeleteCommentMutation(confessionId);
  const likeComment = useLikeCommentMutation(confessionId);

  const commentList: ConfessionComment[] = Array.isArray(comments) ? comments : [];

  const handleSend = () => {
    if (!text.trim()) return;
    addComment.mutate(
      { text: text.trim(), parentId: replyTarget?.id },
      {
        onSuccess: () => {
          setText('');
          setReplyTarget(null);
        },
        onError: () => toast.error(t('commentSendFailedToast')),
      }
    );
  };

  const startReply = (comment: ConfessionComment) => {
    setReplyTarget({ id: comment.id, name: comment.anonymousBadge || t('commentAnonymousMemberLabel') });
  };

  const renderComment = (comment: ConfessionComment, isReply = false): React.ReactNode => (
    <div key={comment.id} className={isReply ? 'ms-5 border-s border-app ps-3' : ''}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-micro font-bold text-pink-500">{comment.anonymousBadge || t('commentAnonymousMemberLabel')}</p>
          <p className="text-body leading-relaxed text-app">{comment.text}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!comment.isDeleted && (
            <button
              type="button"
              aria-label={comment.isLikedByMe ? t('commentUnlikeAriaLabel') : t('commentLikeAriaLabel')}
              aria-pressed={comment.isLikedByMe}
              onClick={() => likeComment.mutate(comment.id)}
              className="flex items-center gap-1 text-app-muted hover:text-pink-500"
            >
              <Heart className={`h-3.5 w-3.5 ${comment.isLikedByMe ? 'fill-pink-500 text-pink-500' : ''}`} />
              <span className="text-micro">{comment.likesCount || 0}</span>
            </button>
          )}
          {!comment.isDeleted && (
            <button
              type="button"
              aria-label={t('commentReplyAction')}
              onClick={() => startReply(comment)}
              className="flex items-center gap-1 text-app-muted hover:text-pink-500"
            >
              <Reply className="h-3.5 w-3.5" />
            </button>
          )}
          {comment.isMyComment && !comment.isDeleted && (
            <IconButton aria-label={t('commentDeleteAriaLabel')} variant="ghost" size="sm" onClick={() => deleteComment.mutate(comment.id)}>
              <Trash2 className="h-3.5 w-3.5 text-app-muted" />
            </IconButton>
          )}
        </div>
      </div>
      {!!comment.replies?.length && <div className="mt-3 space-y-3">{comment.replies.map((reply) => renderComment(reply, true))}</div>}
    </div>
  );

  return (
    <BottomSheet isOpen={!!confessionId} onClose={onClose}>
      <div className="flex flex-col max-h-[70vh]">
        <h3 className="text-heading text-app px-5 pb-3 border-b border-app">{t('commentsTitle')}</h3>

        <div className="flex-1 overflow-y-auto no-scrollbar px-5 py-3 space-y-3">
          {isLoading ? (
            <>
              <Skeleton variant="text" className="h-10" />
              <Skeleton variant="text" className="h-10" />
            </>
          ) : commentList.length === 0 ? (
            <p className="text-caption text-app-muted text-center py-6 normal-case">
              {t('commentsEmptyMessage')}
            </p>
          ) : (
            commentList.map((comment) => renderComment(comment))
          )}
        </div>

        {replyTarget && (
          <div className="px-5 pt-2 flex items-center justify-between gap-2 border-t border-app">
            <p className="text-micro normal-case text-app-muted truncate">
              {t('commentReplyingToTemplate').replace('{name}', replyTarget.name)}
            </p>
            <IconButton
              aria-label={t('commentCancelReplyAriaLabel')}
              variant="ghost"
              size="sm"
              onClick={() => setReplyTarget(null)}
            >
              <X className="h-3.5 w-3.5 text-app-muted" />
            </IconButton>
          </div>
        )}
        <div className={`px-5 py-3 flex items-center gap-2 ${replyTarget ? '' : 'border-t border-app'}`}>
          <input
            type="text"
            maxLength={500}
            aria-label={t('commentInputAriaLabel')}
            placeholder={t('commentInputPlaceholder')}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            className="h-11 flex-1 rounded-full border border-app bg-input-app px-4 text-body font-semibold text-app placeholder:text-app-muted focus:border-pink-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
          <IconButton
            aria-label={t('sendAriaLabel')}
            variant="gradient"
            size="md"
            disabled={addComment.isPending}
            onClick={handleSend}
          >
            <Send className="w-4 h-4" />
          </IconButton>
        </div>
      </div>
    </BottomSheet>
  );
};
