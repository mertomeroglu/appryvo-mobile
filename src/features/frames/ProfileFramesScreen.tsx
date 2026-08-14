import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Check, Frame as FrameIcon } from 'lucide-react';
import { useFramesQuery, useMeQuery } from '../../hooks/useQueries';
import { apiClient } from '../../services/api/apiClient';
import { getPhotoUrl } from '../../services/media/mediaService';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { IconButton } from '../../components/ui/IconButton';
import { AppLogo } from '../../components/ui/AppLogo';
import { FramedAvatar } from '../../components/ui/FramedAvatar';
import { Badge } from '../../components/ui/Badge';
import { PRESS_SCALE, SPRING } from '../../motion/tokens';
import { toast } from '../../stores/useToastStore';

export const ProfileFramesScreen: React.FC = () => {
  const navigate = useNavigate();
  const { data: frames, isLoading } = useFramesQuery();
  const { data: me, refetch: refetchMe } = useMeQuery();
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(me?.activeFrameId ?? null);
  const [isSaving, setIsSaving] = useState<string | null>(null);

  const activeFrameId = selectedFrameId ?? me?.activeFrameId ?? null;
  const photoUrl = getPhotoUrl(me?.photos?.[0]) || me?.photoUrl;

  const handleSelectFrame = async (frameId: string) => {
    const previous = activeFrameId;
    setSelectedFrameId(frameId);
    setIsSaving(frameId);
    try {
      // Real, existing profile-update contract — there is no dedicated frame-equip endpoint.
      await apiClient.put('/api/profile', { activeFrameId: frameId });
      await refetchMe();
    } catch {
      setSelectedFrameId(previous);
      toast.error('Çerçeve seçilemedi.');
    } finally {
      setIsSaving(null);
    }
  };

  const frameList: any[] = Array.isArray(frames?.frames) ? frames.frames : [];

  return (
    <div className="flex flex-col h-full w-full bg-app text-app p-4 overflow-y-auto no-scrollbar select-none">
      {/* Top Bar */}
      <header className="pt-safe flex items-center justify-between my-2">
        <IconButton aria-label="Geri" variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </IconButton>
        <div className="flex items-center gap-1.5">
          <AppLogo size="sm" variant="icon" />
          <h3 className="text-heading text-app">Profil Çerçeveleri</h3>
        </div>
        <div className="w-9" />
      </header>

      <p className="text-caption text-app-muted text-center mb-6 normal-case">
        Profilinin çevresinde görünecek özel çerçeveyi seç
      </p>

      {isLoading ? (
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} variant="avatar" className="w-20 h-20 mx-auto" />
          ))}
        </div>
      ) : frameList.length === 0 ? (
        <div className="my-auto py-12">
          <EmptyState
            icon={<FrameIcon className="w-7 h-7" />}
            title="Henüz Çerçeve Yok"
            subtitle="Kazandığın veya satın aldığın çerçeveler burada görünecek."
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {frameList.map((f: any) => {
            const isSelected = activeFrameId === f.id;
            const price = typeof f.price === 'number' && f.price > 0 ? f.price : undefined;
            const isPremiumOnly = price !== undefined;

            return (
              <motion.button
                key={f.id}
                whileTap={{ scale: PRESS_SCALE }}
                transition={SPRING.snappy}
                onClick={() => handleSelectFrame(f.id)}
                disabled={isSaving === f.id}
                className={`p-4 rounded-2xl bg-surface border flex flex-col items-center text-center space-y-3 transition-colors ${
                  isSelected ? 'border-pink-500 bg-pink-500/10 shadow-elevated' : 'border-app shadow-soft'
                }`}
              >
                {/* Same FramedAvatar used everywhere the equipped frame renders, so the
                    preview here matches reality instead of drifting out of sync with it. */}
                <div className="w-20 h-20 flex items-center justify-center">
                  <FramedAvatar photoUrl={photoUrl} name={me?.name} activeFrameId={f.id} size="lg" />
                </div>

                <span className="text-caption font-extrabold text-app">{f.name || 'Çerçeve'}</span>

                <div className="flex items-center gap-1.5 flex-wrap justify-center">
                  {isSelected && (
                    <span className="px-2.5 py-0.5 rounded-full bg-pink-500 text-white text-micro font-black flex items-center gap-1">
                      <Check className="w-3 h-3" /> Seçili
                    </span>
                  )}
                  {isPremiumOnly && price !== undefined && <Badge tone="neutral">₺{price}</Badge>}
                </div>
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
};
