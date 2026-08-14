import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Flag, Heart, MessageSquare, MoreVertical, Plus, Trash2 } from 'lucide-react';
import { useConfessionsQuery, useDeleteConfessionMutation, useReportConfessionMutation } from '../../hooks/useQueries';
import { useAuthStore } from '../../stores/useAuthStore';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { Modal } from '../../components/ui/Modal';
import { ActionSheet, type ActionSheetAction } from '../../components/ui/ActionSheet';
import { AppButton } from '../../components/ui/AppButton';
import { apiClient } from '../../services/api/apiClient';
import { toast } from '../../stores/useToastStore';
import { staggerContainer, staggerItem } from '../../motion/variants';
import { CommentsSheet } from './CommentsSheet';

const REPORT_REASONS = [
  { value: 'SPAM', label: 'Spam' },
  { value: 'HARASSMENT', label: 'Taciz / Uygunsuz' },
  { value: 'OTHER', label: 'Diğer' },
];

export const ConfessionsScreen: React.FC = () => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [text, setText] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [isPosting, setIsPosting] = useState(false);
  const [activeCommentsId, setActiveCommentsId] = useState<string | null>(null);
  const [menuTarget, setMenuTarget] = useState<any | null>(null);

  const currentUserId = useAuthStore((s) => s.user?.id);
  const { data: confessions, refetch, isLoading } = useConfessionsQuery();
  const deleteConfession = useDeleteConfessionMutation();
  const reportConfession = useReportConfessionMutation();

  const handleCreateConfession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setIsPosting(true);
    try {
      await apiClient.post('/api/social/confessions', { text: text.trim(), isAnonymous });
      setText('');
      setShowCreateModal(false);
      refetch();
    } catch (err: any) {
      toast.error(err.message || 'İtiraf paylaşılamadı.');
    } finally {
      setIsPosting(false);
    }
  };

  const handleLike = async (id: string) => {
    try {
      await apiClient.post(`/api/social/confessions/${id}/like`);
      refetch();
    } catch {
      toast.error('İşlem başarısız.');
    }
  };

  const confessionsList = confessions || [];

  const menuActions: ActionSheetAction[] = menuTarget
    ? (menuTarget.isMine || menuTarget.userId === currentUserId || menuTarget.user?.id === currentUserId)
      ? [
          {
            label: 'Sil',
            icon: <Trash2 className="w-4 h-4" />,
            destructive: true,
            onSelect: () => {
              deleteConfession.mutate(menuTarget.id, {
                onSuccess: () => toast.success('İtiraf silindi.'),
                onError: () => toast.error('Silinemedi.'),
              });
            },
          },
        ]
      : REPORT_REASONS.map((r) => ({
          label: `Bildir: ${r.label}`,
          icon: <Flag className="w-4 h-4" />,
          destructive: true,
          onSelect: () => {
            reportConfession.mutate(
              { id: menuTarget.id, reason: r.value },
              {
                onSuccess: () => toast.success('Bildirimin alındı.'),
                onError: () => toast.error('Bildirilemedi.'),
              }
            );
          },
        }))
    : [];

  return (
    <div className="flex flex-col h-full w-full bg-app text-app p-4 overflow-y-auto no-scrollbar pb-24 select-none">
      {/* Header */}
      <header className="pt-safe flex items-center justify-between my-2">
        <div>
          <h2 className="text-title text-app">İtiraflar</h2>
          <p className="text-caption text-app-muted mt-0.5 normal-case">Anonim paylaşımlar ve içten düşünceler</p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2.5 rounded-full bg-brand-gradient text-white shadow-elevated flex items-center gap-1.5 text-caption font-black active:scale-95 transition-transform"
        >
          <Plus className="w-4 h-4" /> İtiraf Et
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
        ) : confessionsList.length === 0 ? (
          <div className="my-auto py-12">
            <EmptyState
              icon="💭"
              title="Henüz İtiraf Yok"
              subtitle="İlk anonim itirafı paylaşan sen ol!"
              actionLabel="İtiraf Yaz"
              onAction={() => setShowCreateModal(true)}
            />
          </div>
        ) : (
          <motion.div variants={staggerContainer()} initial="initial" animate="animate" className="space-y-3">
            {confessionsList.map((item: any) => (
              <motion.div
                key={item.id}
                variants={staggerItem}
                className="p-4 rounded-2xl bg-surface border border-app shadow-soft space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-caption font-extrabold text-pink-500">
                    {item.isAnonymous ? '🎭 Anonim Üye' : item.user?.name || 'Üye'}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="text-micro text-app-muted normal-case">
                      {item.createdAt ? new Date(item.createdAt).toLocaleDateString('tr-TR') : ''}
                    </span>
                    <button
                      onClick={() => setMenuTarget(item)}
                      className="p-1 text-app-muted hover:text-app"
                      aria-label="Seçenekler"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <p className="text-body text-app font-medium leading-relaxed">{item.text}</p>

                <div className="flex items-center gap-5 pt-2 border-t border-app text-caption text-app-muted">
                  <button onClick={() => handleLike(item.id)} className="flex items-center gap-1.5 hover:text-pink-500">
                    <Heart className={`w-4 h-4 ${item.isLikedByMe ? 'fill-pink-500 text-pink-500' : ''}`} />
                    <span>{item.likesCount || 0}</span>
                  </button>

                  <button
                    onClick={() => setActiveCommentsId(item.id)}
                    className="flex items-center gap-1.5 hover:text-app"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>{item.commentsCount || 0} Yorum</span>
                  </button>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      {/* Create Modal */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)}>
        <form onSubmit={handleCreateConfession} className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-heading text-app">Yeni İtiraf Paylaş</h3>
          </div>

          <textarea
            required
            rows={4}
            placeholder="Düşünceni veya anlatmak istediğini yaz..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full bg-input-app border border-app rounded-2xl p-3 text-body font-semibold text-app focus:outline-none focus:border-pink-500"
          />

          <label className="flex items-center gap-2 text-caption font-semibold text-app-muted normal-case">
            <input
              type="checkbox"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
              className="accent-pink-500 rounded"
            />
            <span>Anonim olarak paylaş (İsmin gizli kalır)</span>
          </label>

          <div className="flex gap-2 pt-2">
            <AppButton type="button" variant="secondary" size="md" className="flex-1" onClick={() => setShowCreateModal(false)}>
              İptal
            </AppButton>
            <AppButton type="submit" variant="primary" size="md" className="flex-1" loading={isPosting}>
              Paylaş
            </AppButton>
          </div>
        </form>
      </Modal>

      <CommentsSheet confessionId={activeCommentsId} onClose={() => setActiveCommentsId(null)} />

      <ActionSheet isOpen={!!menuTarget} onClose={() => setMenuTarget(null)} actions={menuActions} />
    </div>
  );
};
