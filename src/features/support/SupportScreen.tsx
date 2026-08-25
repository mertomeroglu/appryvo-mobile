import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, LifeBuoy, Send } from 'lucide-react';
import { useSupportCategoriesQuery, useCreateSupportTicketMutation } from '../../hooks/useQueries';
import { IconButton } from '../../components/ui/IconButton';
import { AppButton } from '../../components/ui/AppButton';
import { toast } from '../../stores/useToastStore';

const inputClass =
  'w-full bg-input-app border border-app rounded-2xl px-4 py-3.5 text-body font-semibold text-app placeholder:text-app-muted focus:outline-none focus:border-pink-500 transition-colors';

export const SupportScreen: React.FC = () => {
  const navigate = useNavigate();
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
        category: category || 'Diğer',
        subject: subject.trim(),
        message: message.trim(),
      });
      setSubmitted(true);
    } catch {
      toast.error('Destek talebi gönderilemedi. Lütfen tekrar dene.');
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-app text-app select-none overflow-hidden">
      <header className="pt-safe px-4 h-16 flex items-center gap-3 border-b border-app bg-surface-80 backdrop-blur-md z-sticky shrink-0">
        <IconButton aria-label="Geri" variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </IconButton>
        <h2 className="text-heading text-app">Destek</h2>
      </header>

      <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
        {submitted ? (
          <div className="flex flex-col items-center text-center py-16 px-4">
            <div className="w-16 h-16 rounded-full bg-brand-gradient flex items-center justify-center text-white shadow-elevated mb-5">
              <LifeBuoy className="w-8 h-8" />
            </div>
            <h3 className="text-heading text-app mb-2">Talebin İletildi</h3>
            <p className="text-caption text-app-muted normal-case max-w-xs mb-8 leading-relaxed">
              En kısa sürede e-posta adresinden sana dönüş yapacağız.
            </p>
            <AppButton variant="secondary" size="md" onClick={() => navigate(-1)}>
              Geri Dön
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
                    {c}
                  </button>
                ))}
              </div>
            )}

            <input
              type="text"
              required
              placeholder="Konu"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className={inputClass}
            />

            <textarea
              required
              placeholder="Sorununu detaylıca anlat..."
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
              Gönder
            </AppButton>
          </form>
        )}
      </div>
    </div>
  );
};
