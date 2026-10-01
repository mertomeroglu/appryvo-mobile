import React from 'react';
import { useAppLocaleStore, type AppLocale } from '../i18n/appLocale';

const LABELS: Record<AppLocale, { demo: string; official: string; conversation: string }> = {
  tr: { demo: 'Demo Hesap', official: 'Ryvo Resmî', conversation: 'Demo sohbeti' },
  en: { demo: 'Demo Account', official: 'Ryvo Official', conversation: 'Demo conversation' },
  es: { demo: 'Cuenta demo', official: 'Ryvo Oficial', conversation: 'Conversación demo' },
  fr: { demo: 'Compte démo', official: 'Ryvo Officiel', conversation: 'Conversation démo' },
  pt: { demo: 'Conta demo', official: 'Ryvo Oficial', conversation: 'Conversa demo' },
  ru: { demo: 'Демо-аккаунт', official: 'Ryvo Официальный', conversation: 'Демо-чат' },
  ar: { demo: 'حساب تجريبي', official: 'Ryvo الرسمي', conversation: 'محادثة تجريبية' },
  hi: { demo: 'डेमो खाता', official: 'Ryvo आधिकारिक', conversation: 'डेमो बातचीत' },
  zh: { demo: '演示账号', official: 'Ryvo 官方', conversation: '演示对话' },
};

export const SyntheticContentBadge: React.FC<{
  kind?: 'demo' | 'official' | 'conversation';
  className?: string;
}> = ({ kind = 'demo', className = '' }) => {
  const locale = useAppLocaleStore((state) => state.locale);
  return (
    <span className={`inline-flex shrink-0 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-black leading-tight text-amber-600 dark:text-amber-400 ${className}`}>
      {LABELS[locale][kind]}
    </span>
  );
};

