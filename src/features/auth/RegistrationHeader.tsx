import React from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { IconButton } from '../../components/ui/IconButton';
import { AppLogo } from '../../components/ui/AppLogo';
import { REGISTRATION_STEP_COUNT } from './registrationSteps';

interface RegistrationHeaderProps {
  stepIndex: number; // 0-based
  onBack: () => void;
  /** First step's back button exits the whole flow instead of going to a previous step. */
  isFirstStep?: boolean;
}

/**
 * Shared header for every registration step: back button + compact brand mark + step count on
 * one row, progress segments on the row below -- so the circular back button never overlaps the
 * progress line (a past layout bug this replaces). Reused unchanged across all steps so the
 * chrome never seems to "reset" between them.
 */
export const RegistrationHeader: React.FC<RegistrationHeaderProps> = ({ stepIndex, onBack, isFirstStep }) => {
  return (
    <div className="pt-safe px-5 z-sticky">
      <div className="h-14 flex items-center justify-between">
        <IconButton
          aria-label={isFirstStep ? 'Kayıttan çık' : 'Geri'}
          variant="surface"
          size="md"
          onClick={onBack}
        >
          {isFirstStep ? <X className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
        </IconButton>

        <div className="flex items-center gap-2">
          <AppLogo variant="icon" size="md" />
          <span className="text-caption font-bold text-app-muted normal-case">
            {stepIndex + 1} / {REGISTRATION_STEP_COUNT}
          </span>
        </div>

        <div className="w-11" aria-hidden="true" />
      </div>

      <div className="flex gap-1.5 pb-3">
        {Array.from({ length: REGISTRATION_STEP_COUNT }, (_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i <= stepIndex ? 'bg-brand-gradient' : 'bg-surface border border-app'
            }`}
          />
        ))}
      </div>
    </div>
  );
};
