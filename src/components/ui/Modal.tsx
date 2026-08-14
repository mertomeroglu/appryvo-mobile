import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { DURATION, SPRING } from '../../motion/tokens';
import { IconButton } from './IconButton';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  showCloseButton?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  children,
  className,
  showCloseButton = true,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-modal flex items-center justify-center p-4">
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION.micro }}
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94 }}
            transition={SPRING.soft}
            className={cn(
              'relative w-full max-w-sm bg-surface border border-app rounded-[24px] shadow-floating p-5',
              className
            )}
          >
            {showCloseButton && (
              <IconButton
                aria-label="Kapat"
                variant="ghost"
                size="sm"
                className="absolute top-3 right-3"
                onClick={onClose}
              >
                <X className="w-5 h-5" />
              </IconButton>
            )}
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
