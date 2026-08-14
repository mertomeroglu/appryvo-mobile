import React from 'react';
import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
import { cn } from '../../lib/utils';
import { DURATION, SPRING } from '../../motion/tokens';

export interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  showHandle?: boolean;
}

const DISMISS_VELOCITY = 500;
const DISMISS_OFFSET = 120;

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  children,
  className,
  showHandle = true,
}) => {
  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > DISMISS_OFFSET || info.velocity.y > DISMISS_VELOCITY) {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-sheet flex items-end justify-center">
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION.micro }}
            onClick={onClose}
          />
          <motion.div
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={handleDragEnd}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={SPRING.soft}
            className={cn(
              'relative w-full max-w-md bg-surface border-t border-x border-app rounded-t-[30px] pb-safe shadow-floating touch-none',
              className
            )}
          >
            {showHandle && (
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1.5 rounded-full bg-app-secondary" />
              </div>
            )}
            <div className="touch-auto">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
