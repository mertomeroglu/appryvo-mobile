import React, { useState } from 'react';
import { Heart, Send, Trash2 } from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
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

export const CommentsSheet: React.FC<CommentsSheetProps> = ({ confessionId, onClose }) => {
  const [text, setText] = useState('');
  const currentUserId = useAuthStore((s) => s.user?.id);

  const { data: comments, isLoading } = useConfessionCommentsQuery(confessionId);
  const addComment = useAddCommentMutation(confessionId);
  const deleteComment = useDeleteCommentMutation(confessionId);
  const likeComment = useLikeCommentMutation(confessionId);

  const commentList = Array.isArray(comments) ? comments : [];

  const handleSend = () => {
    if (!text.trim()) return;
    addComment.mutate(text.trim(), {
      onSuccess: () => setText(''),
      onError: () => toast.error('Yorum gönderilemedi.'),
    });
  };

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
            commentList.map((c: any) => {
              const isMine = c.isMine || c.userId === currentUserId || c.user?.id === currentUserId;
              return (
                <div key={c.id} className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-micro font-bold text-pink-500">
                      {c.isAnonymous ? '🎭 Anonim' : c.user?.name || 'Üye'}
                    </p>
                    <p className="text-body text-app leading-relaxed">{c.text}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => likeComment.mutate(c.id)}
                      className="flex items-center gap-1 text-app-muted hover:text-pink-500"
                    >
                      <Heart className={`w-3.5 h-3.5 ${c.isLikedByMe ? 'fill-pink-500 text-pink-500' : ''}`} />
                      <span className="text-micro">{c.likesCount || 0}</span>
                    </button>
                    {isMine && (
                      <IconButton
                        aria-label="Yorumu sil"
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteComment.mutate(c.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-app-muted" />
                      </IconButton>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="px-5 py-3 border-t border-app flex items-center gap-2">
          <input
            type="text"
            placeholder="Yorum yaz..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            className="flex-1 h-11 bg-input-app border border-app rounded-full px-4 text-body font-semibold text-app placeholder:text-app-muted focus:outline-none focus:border-pink-500"
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
