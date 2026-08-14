import React from 'react';
import { motion } from 'framer-motion';
import { AppButton } from './AppButton';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = '✨',
  title,
  subtitle,
  actionLabel,
  onAction,
  className = '',
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`flex flex-col items-center justify-center p-6 text-center w-full max-w-sm mx-auto ${className}`}
    >
      <div className="w-20 h-20 rounded-3xl flex items-center justify-center bg-surface border border-app shadow-sm text-3xl mb-5 text-brand-pink">
        {icon}
      </div>
      <h3 className="text-heading text-app mb-2">{title}</h3>
      {subtitle && <p className="text-caption text-app-muted normal-case max-w-xs mb-6 leading-relaxed">{subtitle}</p>}
      {actionLabel && onAction && (
        <AppButton variant="primary" size="md" onClick={onAction}>
          {actionLabel}
        </AppButton>
      )}
    </motion.div>
  );
};
