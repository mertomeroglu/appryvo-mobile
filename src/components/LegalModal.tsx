import React from 'react';
import { X } from 'lucide-react';
import { BottomSheet } from './ui/BottomSheet';
import { IconButton } from './ui/IconButton';
import type { LegalDocument } from '../lib/legalContent';
import { useAppTranslation } from '../i18n/appLocale';

interface LegalModalProps {
  document: LegalDocument | null;
  onClose: () => void;
}

/** Nearly full-height scrollable legal document viewer. See lib/legalContent.ts for why this
 * renders bundled content instead of an iframe over the live pages. The document content itself
 * (title/sections/body) comes from legalContent.ts, which is not locale-aware -- translating the
 * full Terms of Service / Privacy Policy text into 9 languages is a legal/content task, not a
 * UI-string localization one, and is out of scope here. */
export const LegalModal: React.FC<LegalModalProps> = ({ document, onClose }) => {
  const { t } = useAppTranslation();
  return (
    <BottomSheet isOpen={!!document} onClose={onClose} className="h-[92vh] flex flex-col">
      {document && (
        <div className="flex flex-col h-full min-h-0">
          <div className="flex items-start justify-between gap-4 px-5 pb-4 border-b border-app shrink-0">
            <div className="min-w-0">
              <h2 className="text-heading text-app">{document.title}</h2>
              <p className="text-micro text-app-muted normal-case mt-0.5">{document.updatedLabel}</p>
            </div>
            <IconButton aria-label={t('closeAriaLabel')} variant="surface" size="md" onClick={onClose}>
              <X className="w-5 h-5" />
            </IconButton>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6 pb-safe">
            {document.sections.map((section) => (
              <div key={section.title}>
                <h3 className="text-body font-bold text-app mb-2">{section.title}</h3>
                <p className="text-body text-app-muted leading-relaxed whitespace-pre-line normal-case">
                  {section.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </BottomSheet>
  );
};
