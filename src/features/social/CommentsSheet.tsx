import React, { useState } from 'react';
import { Heart, Send, Trash2 } from 'lucide-react';
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
  const [text, setText] = useState('');

  const { data: comments, isLoading } = useConfessionCommentsQuery(confessionId);
  const addComment = useAddCommentMutation(confessionId);
  const deleteComment = useDeleteCommentMutation(confessionId);
  const likeComment = useLikeCommentMutation(confessionId);

  const commentList: ConfessionComment[] = Array.isArray(comments) ? comments : [];

  const handleSend = () => {
    if (!text.trim()) return;
    addComment.mutate(text.trim(), {
      onSuccess: () => setText(''),
      onError: () => toast.error('Yorum gönderilemedi.'),
    });
  };

  const renderComment = (comment: ConfessionComment, isReply = false): React.ReactNode => (
    <div key={comment.id} className={isReply ? 'ms-5 border-s border-app ps-3' : ''}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-micro font-bold text-pink-500">{comment.anonymousBadge || 'Anonim Üye'}</p>
          <p className="text-body leading-relaxed text-app">{comment.text}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!comment.isDeleted && (
            <button
              type="button"
              aria-label={comment.isLikedByMe ? 'Yorum beğenisini kaldır' : 'Yorumu beğen'}
              aria-pressed={comment.isLikedByMe}
              onClick={() => likeComment.mutate(comment.id)}
              className="flex items-center gap-1 text-app-muted hover:text-pink-500"
            >
              <Heart className={`h-3.5 w-3.5 ${comment.isLikedByMe ? 'fill-pink-500 text-pink-500' : ''}`} />
              <span className="text-micro">{comment.likesCount || 0}</span>
            </button>
          )}
          {comment.isMyComment && !comment.isDeleted && (
            <IconButton aria-label="Yorumu sil" variant="ghost" size="sm" onClick={() => deleteComment.mutate(comment.id)}>
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
        <h3 className="text-heading text-app px-5 pb-3 border-b border-app">Yorumlar</h3>

        <div className="flex-1 overflow-y-auto no-scrollbar px-5 py-3 space-y-3">
          {isLoading ? (
            <>
              <Skeleton variant="text" className="h-10" />
              <Skeleton variant="text" className="h-10" />
            </>
          ) : commentList.length === 0 ? (
            <p className="text-caption text-app-muted text-center py-6 normal-case">
              Henüz yorum yok. İlk yorumu sen yaz!
            </p>
          ) : (
            commentList.map((comment) => renderComment(comment))
          )}
        </div>

        <div className="px-5 py-3 border-t border-app flex items-center gap-2">
          <input
            type="text"
            maxLength={500}
            aria-label="Anonim yorum"
            placeholder="Yorum yaz..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            className="h-11 flex-1 rounded-full border border-app bg-input-app px-4 text-body font-semibold text-app placeholder:text-app-muted focus:border-pink-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
          <IconButton
            aria-label="Gönder"
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
