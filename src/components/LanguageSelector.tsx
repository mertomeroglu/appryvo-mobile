import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Search, X, Check } from 'lucide-react';
import {
  PRIMARY_LANGUAGE_CODES,
  WORLD_LANGUAGES,
  searchLanguages,
  LANGUAGE_SELECTION_MAX,
  formatLanguageName,
  languageNameEquals,
  getLocalizedLanguageName,
} from '../lib/languages';
import { SPRING, PRESS_SCALE } from '../motion/tokens';
import { useAppTranslation } from '../i18n/appLocale';

interface LanguageSelectorProps {
  selected: string[];
  onChange: (next: string[]) => void;
}

const primaryLanguages = WORLD_LANGUAGES.filter((l) => PRIMARY_LANGUAGE_CODES.includes(l.code));

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({ selected, onChange }) => {
  const { t, locale } = useAppTranslation();
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    if (!query.trim()) return primaryLanguages;
    return searchLanguages(query, locale).slice(0, 40);
  }, [query, locale]);

  const toggle = (name: string) => {
    const canonicalName = formatLanguageName(name);
    if (selected.some((value) => languageNameEquals(value, canonicalName))) {
      onChange(selected.filter((value) => !languageNameEquals(value, canonicalName)));
    } else {
      if (selected.length >= LANGUAGE_SELECTION_MAX) return;
      onChange([...selected, canonicalName]);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <span className="text-caption font-bold text-app-muted normal-case">{t('spokenLanguagesLabel')}</span>
        <p className="text-micro text-app-muted normal-case mt-0.5">{t('spokenLanguagesHint')}</p>
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((name) => {
            const lang = WORLD_LANGUAGES.find((item) => languageNameEquals(item.name, name));
            return (
              <motion.button
                key={name}
                type="button"
                whileTap={{ scale: PRESS_SCALE }}
                transition={SPRING.snappy}
                onClick={() => toggle(name)}
                className="flex items-center gap-1.5 pl-3 pr-2 py-2 rounded-full text-caption font-bold bg-brand-gradient text-white"
              >
                <span>{lang ? `${lang.flag} ${getLocalizedLanguageName(lang, locale)}` : formatLanguageName(name)}</span>
                <X className="w-3.5 h-3.5" />
              </motion.button>
            );
          })}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-app-muted" />
        <input
          type="text"
          placeholder={t('searchLanguagePlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full h-11 bg-input-app border border-app rounded-2xl pl-10 pr-4 text-caption font-semibold text-app placeholder:text-app-muted focus:outline-none focus:border-pink-500 focus-visible:ring-2 focus-visible:ring-pink-500/40"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {results.map((lang) => {
          const isSelected = selected.some((value) => languageNameEquals(value, lang.name));
          const isMaxed = !isSelected && selected.length >= LANGUAGE_SELECTION_MAX;
          return (
            <motion.button
              key={lang.code}
              type="button"
              whileTap={isMaxed ? undefined : { scale: PRESS_SCALE }}
              transition={SPRING.snappy}
              onClick={() => toggle(lang.name)}
              disabled={isMaxed}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-caption font-bold border transition-colors disabled:opacity-40 ${
                isSelected ? 'bg-brand-gradient text-white border-transparent' : 'bg-surface text-app-muted border-app'
              }`}
            >
              <span>{lang.flag} {getLocalizedLanguageName(lang, locale)}</span>
              {isSelected && <Check className="w-3.5 h-3.5" />}
            </motion.button>
          );
        })}
        {query.trim() && results.length === 0 && (
          <p className="text-caption text-app-muted normal-case py-2">{t('noLanguageMatch')}</p>
        )}
      </div>
    </div>
  );
};
