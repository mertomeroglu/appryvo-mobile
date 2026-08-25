import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, UserX } from 'lucide-react';
import { useBlockedUsersQuery, useUnblockMutation } from '../../hooks/useQueries';
import { normalizeMediaUrl } from '../../services/media/mediaService';
import { LoadingState } from '../../components/ui/LoadingState';
import { EmptyState } from '../../components/ui/EmptyState';
import { IconButton } from '../../components/ui/IconButton';
import { Avatar } from '../../components/ui/Avatar';
import { AppButton } from '../../components/ui/AppButton';
import { toast } from '../../stores/useToastStore';

export const BlockedUsersScreen: React.FC = () => {
  const navigate = useNavigate();
  const { data: blocked, isLoading } = useBlockedUsersQuery();
  const unblockMutation = useUnblockMutation();

  const blockedList = blocked || [];

  const handleUnblock = (userId: string, name?: string) => {
    unblockMutation.mutate(userId, {
      onSuccess: () => toast.success(`${name || 'Kullanıcı'} engeli kaldırıldı.`),
      onError: () => toast.error('Engel kaldırılamadı.'),
    });
  };

  return (
    <div className="flex flex-col h-full w-full bg-app text-app select-none">
      <header className="pt-safe px-4 h-16 flex items-center gap-3 border-b border-app bg-surface-80 backdrop-blur-md z-sticky">
        <IconButton aria-label="Geri" variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </IconButton>
        <h2 className="text-heading text-app">Engellenen Kullanıcılar</h2>
      </header>

      <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
        {isLoading ? (
          <LoadingState fullScreen={false} message="Yükleniyor..." />
        ) : blockedList.length === 0 ? (
          <div className="my-auto py-16">
            <EmptyState
              icon={<UserX className="w-7 h-7" />}
              title="Engellenen Kimse Yok"
              subtitle="Engellediğin kullanıcılar burada listelenir."
            />
          </div>
        ) : (
          <div className="space-y-2.5">
            {blockedList.map((item: any) => {
              const u = item.user || item;
              return (
                <div
                  key={u.id}
                  className="w-full p-3.5 rounded-2xl bg-surface border border-app flex items-center gap-3 shadow-soft"
                >
                  <Avatar
                    src={u.photoUrl || u.photos?.[0]?.url ? normalizeMediaUrl(u.photoUrl || u.photos?.[0]?.url) : undefined}
                    name={u.name}
                    size="md"
                  />
                  <div className="flex-1 min-w-0">
                    <h4 className="text-body font-bold text-app truncate">{u.name || 'Kullanıcı'}</h4>
                  </div>
                  <AppButton
                    variant="secondary"
                    size="sm"
                    loading={unblockMutation.isPending}
                    onClick={() => handleUnblock(u.id, u.name)}
                  >
                    Kaldır
                  </AppButton>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
