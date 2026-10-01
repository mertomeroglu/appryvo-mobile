import React, { useState } from 'react';
import { Calendar } from 'lucide-react';
import { apiClient, ApiException } from '../../services/api/apiClient';
import { useAuthStore } from '../../stores/useAuthStore';
import { useAppLocaleStore, AGE_VERIFICATION_LABELS } from '../../i18n/appLocale';
import { toast } from '../../stores/useToastStore';
import { AppButton } from '../../components/ui/AppButton';

// Same 18..99 window as the registration wizard; the server's validateAdultBirthDate is the
// authority. No date is pre-filled -- a neutral age gate must not suggest an adult date.
function isoDateYearsAgo(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

/**
 * Full-screen gate for accounts the server reports as AGE_VERIFICATION_REQUIRED (no birth date
 * on file). Nothing else in the app is reachable until an 18+ birth date is saved; a minor's
 * submission suspends the account server-side and signs out here.
 */
export const AgeVerificationScreen: React.FC = () => {
  const locale = useAppLocaleStore((state) => state.locale);
  const labels = AGE_VERIFICATION_LABELS[locale];
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const logout = useAuthStore((s) => s.logout);
  const [birthDate, setBirthDate] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!birthDate || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await apiClient.post('/api/me/age-verification', { birthDate });
      await fetchMe();
    } catch (err) {
      const code = err instanceof ApiException ? err.code : undefined;
      if (code === 'UNDERAGE') {
        toast.error(labels.underage);
        await logout();
        return;
      }
      const message = code === 'BIRTH_DATE_LOCKED'
        ? labels.locked
        : (err instanceof ApiException && err.statusCode === 400 ? err.message : labels.failed);
      setError(message);
      if (code === 'BIRTH_DATE_LOCKED') await fetchMe().catch(() => null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-app flex flex-col justify-center px-6 pt-safe pb-safe">
      <form onSubmit={submit} className="space-y-6 max-w-sm mx-auto w-full">
        <div>
          <h1 className="text-title text-app">{labels.title}</h1>
          <p className="text-caption text-app-muted mt-2 normal-case">{labels.body}</p>
        </div>
        <label className="block">
          <span className="sr-only">{labels.field}</span>
          <div className="relative">
            <Calendar className="absolute start-4 top-4 w-5 h-5 text-app-muted" aria-hidden="true" />
            <input
              type="date"
              name="birthdate"
              required
              autoComplete="bday"
              min={isoDateYearsAgo(99)}
              max={new Date().toISOString().slice(0, 10)}
              value={birthDate}
              onChange={(e) => { setBirthDate(e.target.value); if (error) setError(''); }}
              aria-invalid={!!error}
              aria-label={labels.field}
              className="w-full h-14 bg-input-app border border-app rounded-2xl ps-12 pe-4 text-body font-semibold text-app focus:outline-none focus:border-pink-500 transition-colors"
            />
          </div>
        </label>
        {error && (
          <p role="alert" className="text-caption font-semibold text-[#FF4B55] normal-case">{error}</p>
        )}
        <AppButton type="submit" variant="primary" size="lg" fullWidth disabled={!birthDate || submitting}>
          {labels.submit}
        </AppButton>
        <AppButton type="button" variant="ghost" size="md" fullWidth onClick={() => { void logout(); }}>
          {labels.logout}
        </AppButton>
      </form>
    </div>
  );
};
