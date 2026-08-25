import React, { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { ScreenHeader } from './ui/ScreenHeader';
import { IconButton } from './ui/IconButton';
import { AppButton } from './ui/AppButton';
import { FilterChip } from './ui/Chip';
import { toast } from '../stores/useToastStore';
import { ALL_INTERESTS, INTEREST_CATEGORIES, INTEREST_MAX, INTEREST_MIN } from '../lib/interests';
import { useAppTranslation } from '../i18n/appLocale';

interface InterestsEditorScreenProps {
  initialSelected: string[];
  onCancel: () => void;
  onSave: (selected: string[]) => void;
}

/**
 * Dedicated full-height interest picker, opened from EditProfileModal's compact interests
 * summary row instead of rendering the entire category catalog inline in the long edit-profile
 * form. Stages selections locally -- nothing is written back to the parent (and nothing hits
 * the server) until Save, matching EditProfileModal's own explicit-Save architecture.
 */
export const InterestsEditorScreen: React.FC<InterestsEditorScreenProps> = ({
  initialSelected,
  onCancel,
  onSave,
}) => {
  const { t } = useAppTranslation();
  const [interests, setInterests] = useState<string[]>(initialSelected);

  // Re-seed the draft if the editor is reopened after a Cancel with a stale prior draft.
  useEffect(() => {
    setInterests(initialSelected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const legacyInterests = interests.filter((item) => !ALL_INTERESTS.includes(item));

  const toggleInterest = (item: string) => {
    setInterests((current) => {
      if (current.includes(item)) return current.filter((interest) => interest !== item);
      if (current.length >= INTEREST_MAX) {
        toast.show(t('interestsMaxToastTemplate').replace('{max}', String(INTEREST_MAX)), 'neutral');
        return current;
      }
      return [...current, item];
    });
  };

  const canSave = interests.length >= INTEREST_MIN && interests.length <= INTEREST_MAX;

  return (
    <div className="fixed inset-0 z-modal bg-app flex flex-col text-app select-none">
      <ScreenHeader
        leading={
          <IconButton aria-label={t('backButtonLabel')} variant="surface" size="md" onClick={onCancel}>
            <ArrowLeft className="w-5 h-5" />
          </IconButton>
        }
        title={t('interestsSectionLabel')}
      />

      <div className="px-5 pt-4 pb-2 shrink-0">
        <p className="text-micro normal-case font-semibold text-app-muted">
          {t('interestsCountSelectedTemplate').replace('{min}', String(INTEREST_MIN)).replace('{max}', String(INTEREST_MAX)).replace('{count}', String(interests.length))}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-5 pb-4 space-y-4">
        {legacyInterests.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-caption font-bold normal-case text-app-muted">{t('currentSelectionsLabel')}</p>
            <div className="flex flex-wrap gap-2">
              {legacyInterests.map((item) => (
                <FilterChip key={item} type="button" selected onClick={() => toggleInterest(item)}>
                  {item}
                </FilterChip>
              ))}
            </div>
          </div>
        )}
        {INTEREST_CATEGORIES.map((category) => (
          <div key={category.id} className="space-y-1.5">
            <p className="text-caption font-bold normal-case text-app-muted">{category.title}</p>
            <div className="flex flex-wrap gap-2">
              {category.interests.map((item) => {
                const selected = interests.includes(item);
                return (
                  <FilterChip
                    key={item}
                    type="button"
                    selected={selected}
                    disabled={!selected && interests.length >= INTEREST_MAX}
                    onClick={() => toggleInterest(item)}
                  >
                    {item}
                  </FilterChip>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="shrink-0 p-5 pb-[calc(var(--safe-bottom)+20px)] border-t border-app bg-surface flex gap-3">
        <AppButton variant="secondary" size="lg" className="flex-1" onClick={onCancel}>
          {t('cancel')}
        </AppButton>
        <AppButton
          variant="primary"
          size="lg"
          className="flex-1"
          disabled={!canSave}
          onClick={() => onSave(interests)}
        >
          {t('save')}
        </AppButton>
      </div>
    </div>
  );
};
