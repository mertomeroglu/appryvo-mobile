import React, { useEffect, useState } from 'react';
import { Check, Globe2 } from 'lucide-react';
import {
  APP_LOCALE_OPTIONS,
  useAppLocaleStore,
  useAppTranslation,
  type AppLocale,
} from '../i18n/appLocale';
import { Modal } from './ui/Modal';

interface AppLanguagePickerProps {
  showTrigger?: boolean;
}

export const AppLanguagePicker: React.FC<AppLanguagePickerProps> = ({ showTrigger = true }) => {
  const { t } = useAppTranslation();
  const locale = useAppLocaleStore((state) => state.locale);
  const needsLanguageSelection = useAppLocaleStore((state) => state.needsLanguageSelection);
  const setLocale = useAppLocaleStore((state) => state.setLocale);
  const [isOpen, setIsOpen] = useState(needsLanguageSelection);

  useEffect(() => {
    if (needsLanguageSelection) setIsOpen(true);
  }, [needsLanguageSelection]);

  const selectLocale = (nextLocale: AppLocale) => {
    setLocale(nextLocale);
    setIsOpen(false);
  };

  return (
    <>
      {showTrigger && (
        <button
          type="button"
          aria-label="Choose app language"
          onClick={() => setIsOpen(true)}
          className="absolute right-5 top-[calc(var(--safe-top)+1rem)] z-20 flex h-10 items-center gap-2 rounded-full border border-app bg-surface/90 px-3 text-caption font-extrabold uppercase text-app shadow-soft backdrop-blur-md active:scale-95"
        >
          <Globe2 className="h-4 w-4 text-pink-500" />
          <span>{locale}</span>
        </button>
      )}

      <Modal
        isOpen={isOpen}
        onClose={() => {
          if (!needsLanguageSelection) setIsOpen(false);
        }}
        showCloseButton={!needsLanguageSelection}
        className="max-h-[82vh] overflow-hidden p-0"
      >
        <div className="border-b border-app px-5 pb-4 pt-5 pe-12">
          <h2 className="text-heading text-app">{t('chooseLanguage')}</h2>
          {needsLanguageSelection && (
            <p className="mt-1 text-caption normal-case leading-relaxed text-app-muted">
              {t('deviceLanguageUnsupported')}
            </p>
          )}
        </div>

        <div className="max-h-[60vh] space-y-2 overflow-y-auto p-4 no-scrollbar" role="listbox" aria-label="App languages">
          {APP_LOCALE_OPTIONS.map((option) => {
            const selected = option.code === locale;
            return (
              <button
                key={option.code}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => selectLocale(option.code)}
                className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left active:scale-[0.99] ${
                  selected
                    ? 'border-pink-500 bg-pink-500/10 text-pink-500'
                    : 'border-app bg-surface text-app'
                }`}
              >
                <span className="min-w-0">
                  <span className="block break-words text-body font-bold">{option.nativeName}</span>
                  <span className="block break-words text-micro font-medium normal-case text-app-muted">
                    {option.displayName}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-micro font-extrabold uppercase text-app-muted">{option.code}</span>
                  {selected && <Check className="h-4 w-4" />}
                </span>
              </button>
            );
          })}
        </div>
      </Modal>
    </>
  );
};
