import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, LifeBuoy, Send } from 'lucide-react';
import { useSupportCategoriesQuery, useCreateSupportTicketMutation } from '../../hooks/useQueries';
import { IconButton } from '../../components/ui/IconButton';
import { AppButton } from '../../components/ui/AppButton';
import { toast } from '../../stores/useToastStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { useAppTranslation, type AppMessageKey } from '../../i18n/appLocale';

// GET /api/support/categories now returns stable codes (support_controller.js), not display
// text -- this used to be a hardcoded Turkish string sent to every client regardless of locale.
const SUPPORT_CATEGORY_LABEL_KEYS: Record<string, AppMessageKey> = {
  LOGIN_ISSUE: 'supportCategoryLoginIssue',
  REGISTRATION_ISSUE: 'supportCategoryRegistrationIssue',
  ACCOUNT: 'supportCategoryAccount',
  PAYMENT: 'supportCategoryPayment',
  TECHNICAL_ISSUE: 'supportCategoryTechnicalIssue',
  OTHER: 'supportCategoryOther',
};

const inputClass =
  'w-full bg-input-app border border-app rounded-2xl px-4 py-3.5 text-body font-semibold text-app placeholder:text-app-muted focus:outline-none focus:border-pink-500 transition-colors';

export const SupportScreen: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useAppTranslation();
  const currentUser = useAuthStore((s) => s.user);
  const { data: categories } = useSupportCategoriesQuery();
  const createTicket = useCreateSupportTicketMutation();

  const [category, setCategory] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const categoryOptions: string[] = Array.isArray(categories) ? categories : [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    try {
      await createTicket.mutateAsync({
        category: category || 'OTHER',
        subject: subject.trim(),
        message: message.trim(),
        name: currentUser?.name,
        email: currentUser?.email,
      });
      setSubmitted(true);
    } catch {
      toast.error(t('supportTicketFailedToast'));
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-app text-app select-none overflow-hidden">
      <header className="pt-safe px-4 h-16 flex items-center gap-3 border-b border-app bg-surface-80 backdrop-blur-md z-sticky shrink-0">
        <IconButton aria-label={t('backButtonLabel')} variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </IconButton>
        <h2 className="text-heading text-app">{t('support')}</h2>
      </header>

      <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
        {submitted ? (
          <div className="flex flex-col items-center text-center py-16 px-4">
            <div className="w-16 h-16 rounded-full bg-brand-gradient flex items-center justify-center text-white shadow-elevated mb-5">
              <LifeBuoy className="w-8 h-8" />
            </div>
            <h3 className="text-heading text-app mb-2">{t('supportTicketSubmittedTitle')}</h3>
            <p className="text-caption text-app-muted normal-case max-w-xs mb-8 leading-relaxed">
              {t('supportTicketSubmittedSubtitle')}
            </p>
            <AppButton variant="secondary" size="md" onClick={() => navigate(-1)}>
              {t('goBackButtonLabel')}
            </AppButton>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {categoryOptions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {categoryOptions.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={`px-3.5 py-2 rounded-full text-caption font-bold border transition-colors ${
                      category === c
                        ? 'bg-brand-gradient text-white border-transparent'
                        : 'bg-surface text-app-muted border-app'
                    }`}
                  >
                    {t(SUPPORT_CATEGORY_LABEL_KEYS[c] || 'supportCategoryOther')}
                  </button>
                ))}
              </div>
            )}

            <input
              type="text"
              required
              placeholder={t('subjectPlaceholder')}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className={inputClass}
            />

            <textarea
              required
              placeholder={t('describeProblemPlaceholder')}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              className={`${inputClass} resize-none`}
            />

            <AppButton
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              loading={createTicket.isPending}
              rightIcon={<Send className="w-4.5 h-4.5" />}
            >
              {t('sendButtonLabel')}
            </AppButton>
          </form>
        )}
      </div>
    </div>
  );
};
