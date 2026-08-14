import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, XCircle, Info } from 'lucide-react';
import { cn } from '../../lib/utils';
import { SPRING } from '../../motion/tokens';
import { useToastStore, type ToastTone } from '../../stores/useToastStore';

const ICONS: Record<ToastTone, React.ReactNode> = {
  neutral: <Info className="w-4 h-4 text-app-muted" />,
  success: <CheckCircle2 className="w-4 h-4 text-[#32D583]" />,
  error: <XCircle className="w-4 h-4 text-[#FF4B55]" />,
};

export const ToastHost: React.FC = () => {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="fixed top-0 left-0 right-0 z-toast pt-safe px-4 pointer-events-none flex flex-col items-center gap-2 mt-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.96 }}
            transition={SPRING.snappy}
            onClick={() => dismiss(t.id)}
            className={cn(
              'pointer-events-auto flex items-center gap-2 max-w-sm px-4 py-2.5 rounded-full bg-surface-elevated border border-app shadow-elevated text-caption font-semibold text-app'
            )}
          >
            {ICONS[t.tone]}
            {t.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
