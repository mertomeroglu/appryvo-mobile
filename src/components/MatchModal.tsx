import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Heart, MessageCircle, X } from 'lucide-react';
import { useAuthStore } from '../stores/useAuthStore';
import { AppButton } from './ui/AppButton';
import { IconButton } from './ui/IconButton';
import { DURATION, EASE, SPRING } from '../motion/tokens';
import { ProfileAvatarFrame } from './ui/FramedAvatar';

interface MatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  matchedUser?: { name?: string; photos?: any[]; photoUrl?: string; activeFrameId?: string } | null;
  matchId?: string;
}

function primaryPhoto(user?: { photos?: any[]; photoUrl?: string } | null): string | undefined {
  if (Array.isArray(user?.photos) && user!.photos!.length > 0) {
    const first = user!.photos![0];
    return typeof first === 'object' ? first?.url : first;
  }
  return user?.photoUrl;
}

export const MatchModal: React.FC<MatchModalProps> = ({ isOpen, onClose, matchedUser, matchId }) => {
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const reduceMotion = useReducedMotion();
  const matchedUserName = matchedUser?.name || 'Üye';
  const avatarSlideDistance = reduceMotion ? 0 : 70;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-modal flex items-center justify-center p-6 bg-black/90 backdrop-blur-md overflow-hidden">
          {/* Ambient backdrop glow — settles in first, behind everything */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION.emphasis, ease: EASE.decelerate }}
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(circle at 50% 42%, rgba(255,77,141,0.22) 0%, rgba(139,92,246,0.16) 35%, transparent 70%)',
            }}
          />

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION.standard, ease: EASE.standard }}
            className="w-full max-w-sm flex flex-col items-center text-center relative"
          >
            <IconButton
              aria-label="Kapat"
              variant="ghost"
              size="sm"
              className="absolute -top-2 -right-2 text-white"
              onClick={onClose}
            >
              <X className="w-5 h-5" />
            </IconButton>

            {/* Two avatars arrive first, heart badge blooms between them once they land */}
            <div className="relative flex items-center justify-center mb-8 mt-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, scale: [0.7, 1.25, 1] }}
                transition={{ delay: 0.42, duration: DURATION.emphasis, ease: EASE.decelerate }}
                className="absolute inset-0 -m-6 rounded-full blur-2xl"
                style={{ background: 'radial-gradient(circle, rgba(255,77,141,0.5) 0%, rgba(139,92,246,0.35) 55%, transparent 75%)' }}
              />

              <div className="flex items-center -space-x-5">
                <motion.div
                  initial={{ x: -avatarSlideDistance, opacity: 0, scale: 0.85 }}
                  animate={{ x: 0, opacity: 1, scale: 1 }}
                  transition={{ delay: 0.05, ...SPRING.soft }}
                  className="relative z-10"
                >
                  <ProfileAvatarFrame
                    photoUrl={primaryPhoto(currentUser)}
                    name={currentUser?.name || 'Sen'}
                    activeFrameId={currentUser?.activeFrameId}
                    size="xl"
                    eager
                  />
                </motion.div>
                <motion.div
                  initial={{ x: avatarSlideDistance, opacity: 0, scale: 0.85 }}
                  animate={{ x: 0, opacity: 1, scale: 1 }}
                  transition={{ delay: 0.05, ...SPRING.soft }}
                  className="relative z-10"
                >
                  <ProfileAvatarFrame
                    photoUrl={primaryPhoto(matchedUser)}
                    name={matchedUserName}
                    activeFrameId={matchedUser?.activeFrameId}
                    size="xl"
                    eager
                  />
                </motion.div>
              </div>

              {/* Heart badge — pulses once it appears, sitting right on the seam */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: [0, 1.2, 1] }}
                transition={{ delay: 0.4, duration: DURATION.emphasis }}
                className="absolute z-20 w-12 h-12 rounded-full bg-brand-gradient flex items-center justify-center text-white shadow-elevated shadow-pink-500/50 border-[3px] border-app"
              >
                <motion.span
                  animate={reduceMotion ? undefined : { scale: [1, 1.15, 1] }}
                  transition={{ delay: 0.9, duration: 0.5, repeat: 1 }}
                >
                  <Heart className="w-6 h-6 fill-current" />
                </motion.span>
              </motion.div>
            </div>

            <motion.h2
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55, duration: DURATION.standard }}
              className="text-title text-brand-gradient mb-2"
            >
              Yeni Eşleşme
            </motion.h2>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6, duration: DURATION.standard }}
              className="text-body text-white/80 mb-8"
            >
              Sen ve <span className="font-bold text-white">{matchedUserName}</span> birbirinizi beğendiniz!
            </motion.p>

            {/* CTA */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7, duration: DURATION.standard }}
              className="w-full space-y-3"
            >
              <AppButton
                variant="primary"
                size="lg"
                fullWidth
                leftIcon={<MessageCircle className="w-5 h-5" />}
                onClick={() => {
                  onClose();
                  if (matchId) navigate(`/chat/${matchId}`);
                }}
              >
                Mesaj Yaz
              </AppButton>
              <AppButton variant="secondary" size="lg" fullWidth onClick={onClose}>
                Keşfe Devam Et
              </AppButton>
            </motion.div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
