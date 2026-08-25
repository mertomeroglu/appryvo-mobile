import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';
import { PRESS_SCALE, SPRING } from '../../motion/tokens';
import { BottomSheet } from './BottomSheet';

export interface ActionSheetAction {
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  destructive?: boolean;
}

export interface ActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  actions: ActionSheetAction[];
}

export const ActionSheet: React.FC<ActionSheetProps> = ({ isOpen, onClose, title, actions }) => {
  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <div className="px-4 pb-4">
        {title && (
          <div className="text-center text-caption text-app-muted pb-2 border-b border-app mb-1">
            {title}
          </div>
        )}
        {actions.map((action, i) => (
          <motion.button
            key={i}
            whileTap={{ scale: PRESS_SCALE }}
            transition={SPRING.snappy}
            onClick={() => {
              action.onSelect();
              onClose();
            }}
            className={cn(
              'w-full flex items-center gap-3 px-2 py-3.5 text-body font-semibold text-start border-b border-app last:border-b-0',
              action.destructive ? 'text-[#FF4B55]' : 'text-app'
            )}
          >
            {action.icon}
            {action.label}
          </motion.button>
        ))}
      </div>
    </BottomSheet>
  );
};
