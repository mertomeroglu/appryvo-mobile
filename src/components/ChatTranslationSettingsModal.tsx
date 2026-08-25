import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Languages } from 'lucide-react';
import { Modal } from './ui/Modal';
import { apiClient } from '../services/api/apiClient';
import { toast } from '../stores/useToastStore';
import { SPRING } from '../motion/tokens';
import { CHAT_TRANSLATION_LANGUAGES } from '../lib/chatTranslationLanguages';

interface ChatTranslationSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  matchId: string;
  autoTranslateEnabled: boolean;
  translationLanguage: string;
  onSettingsChanged: (next: { autoTranslateEnabled: boolean; translationLanguage: string }) => void;
}

export const ChatTranslationSettingsModal: React.FC<ChatTranslationSettingsModalProps> = ({
  isOpen,
  onClose,
  matchId,
  autoTranslateEnabled,
  translationLanguage,
  onSettingsChanged,
}) => {
  const [isSaving, setIsSaving] = useState(false);

  const save = async (patch: { autoTranslateEnabled?: boolean; translationLanguage?: string }) => {
    setIsSaving(true);
    const next = {
      autoTranslateEnabled: patch.autoTranslateEnabled ?? autoTranslateEnabled,
      translationLanguage: patch.translationLanguage ?? translationLanguage,
    };
    try {
      await apiClient.put(`/api/chat/conversations/${matchId}/translation-settings`, {
        autoTranslateEnabled: patch.autoTranslateEnabled,
        translationLanguage: patch.translationLanguage,
      });
      onSettingsChanged(next);
    } catch {
      toast.error('Ayarlar kaydedilemedi.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="space-y-5">
        <div className="flex items-center gap-2.5">
          <span className="text-pink-500">
            <Languages className="w-5 h-5" />
          </span>
          <h3 className="text-heading text-app">Çeviri Ayarları</h3>
        </div>

        <div className="w-full p-3.5 rounded-2xl bg-surface-elevated border border-app flex items-center justify-between">
          <div className="min-w-0 pe-3">
            <p className="text-body font-bold text-app">Otomatik Çeviri</p>
            <p className="text-micro text-app-muted normal-case mt-0.5">
              Gelen mesajlar otomatik olarak seçtiğin dile çevrilir.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={autoTranslateEnabled}
            aria-label="Otomatik Çeviri"
            disabled={isSaving}
            onClick={() => save({ autoTranslateEnabled: !autoTranslateEnabled })}
            className={`relative w-12 h-7 rounded-full shrink-0 transition-colors disabled:opacity-50 ${
              autoTranslateEnabled ? 'bg-brand-gradient' : 'bg-app-secondary'
            }`}
          >
            <motion.span
              animate={{ x: autoTranslateEnabled ? 20 : 0 }}
              transition={SPRING.snappy}
              className="absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow-md"
            />
          </button>
        </div>

        <div>
          <p className="text-caption font-bold text-app-muted normal-case mb-2">Çeviri Dili</p>
          <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto no-scrollbar">
            {CHAT_TRANSLATION_LANGUAGES.map((lang) => {
              const selected = lang.code === translationLanguage;
              return (
                <button
                  key={lang.code}
                  disabled={isSaving}
                  onClick={() => save({ translationLanguage: lang.code })}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-body font-semibold text-start disabled:opacity-50 ${
                    selected
                      ? 'border-pink-500 bg-pink-500/10 text-pink-500'
                      : 'border-app bg-surface text-app'
                  }`}
                >
                  <span className="truncate">{lang.label}</span>
                  {selected && <Check className="w-4 h-4 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
};
