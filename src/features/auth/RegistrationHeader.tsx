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
 * Shared header for every registration step. The single continuous bar communicates progress
 * without making the flow feel like a checklist or exposing a discouraging step count.
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

        <AppLogo variant="icon" size="md" />

        <div className="w-11" aria-hidden="true" />
      </div>

      <div
        className="h-1.5 mb-3 overflow-hidden rounded-full bg-surface border border-app"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={REGISTRATION_STEP_COUNT}
        aria-valuenow={stepIndex + 1}
      >
        <div
          className="h-full rounded-full bg-brand-gradient transition-[width] duration-300 ease-out"
          style={{ width: `${((stepIndex + 1) / REGISTRATION_STEP_COUNT) * 100}%` }}
        />
      </div>
    </div>
  );
};
