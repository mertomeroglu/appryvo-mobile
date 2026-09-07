import React, { useEffect, useState } from 'react';
import { MailCheck, ShieldCheck } from 'lucide-react';
import { Modal } from './ui/Modal';
import { AppButton } from './ui/AppButton';
import { useRequestEmailOtpMutation, useVerifyEmailOtpMutation } from '../hooks/useQueries';
import { toast } from '../stores/useToastStore';
import { useAppTranslation } from '../i18n/appLocale';

interface EmailOtpModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Shown so the person can confirm the code is going where they expect. */
  email?: string | null;
  alreadyVerified?: boolean;
}

const CODE_LENGTH = 6;

/**
 * Optional email verification. Deliberately built from the same Modal/AppButton/toast pieces every
 * other flow uses rather than a bespoke OTP screen -- this is one more row in Settings, not a
 * gate, and it should not read as a different product.
 */
export const EmailOtpModal: React.FC<EmailOtpModalProps> = ({ isOpen, onClose, email, alreadyVerified }) => {
  const { t } = useAppTranslation();
  const requestMutation = useRequestEmailOtpMutation();
  const verifyMutation = useVerifyEmailOtpMutation();
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');

  // Reopening after a previous attempt should start clean rather than showing a stale code entry.
  useEffect(() => {
    if (!isOpen) { setCodeSent(false); setCode(''); }
  }, [isOpen]);

  const sendCode = () => {
    requestMutation.mutate(undefined, {
      onSuccess: () => { setCodeSent(true); toast.success(t('emailOtpSentMessage')); },
      onError: (error: any) => toast.error(error?.message || t('errorOccurred')),
    });
  };

  const submitCode = () => {
    if (code.length !== CODE_LENGTH) return;
    verifyMutation.mutate(code, {
      onSuccess: () => { toast.success(t('emailOtpSuccessMessage')); onClose(); },
      onError: (error: any) => {
        // The server distinguishes an expired code from a wrong one; a person who waited too long
        // needs to request a new code, not retype the old one more carefully.
        const expired = error?.code === 'EXPIRED' || error?.code === 'NO_ACTIVE_CODE';
        if (expired) setCodeSent(false);
        toast.error(expired ? t('emailOtpExpiredMessage') : t('emailOtpIncorrectMessage'));
        setCode('');
      },
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="space-y-4 px-1">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-white">
            {alreadyVerified ? <ShieldCheck className="h-5 w-5" /> : <MailCheck className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <h2 className="text-heading text-app">{t('emailOtpTitle')}</h2>
            {email && <p className="truncate text-caption text-app-muted">{email}</p>}
          </div>
        </div>

        {alreadyVerified ? (
          <p className="text-body text-app-muted">{t('emailOtpSuccessMessage')}</p>
        ) : (
          <>
            <p className="text-body text-app-muted">{t('emailOtpIntro')}</p>

            {!codeSent ? (
              <AppButton
                variant="primary"
                size="lg"
                fullWidth
                loading={requestMutation.isPending}
                onClick={sendCode}
              >
                {t('emailOtpSendAction')}
              </AppButton>
            ) : (
              <div className="space-y-3">
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={CODE_LENGTH}
                  placeholder={t('emailOtpCodeHint')}
                  className="h-14 w-full rounded-2xl border border-app bg-surface text-center text-heading tracking-[0.5em] text-app placeholder:tracking-normal placeholder:text-body placeholder:text-app-muted focus:border-pink-500 focus:outline-none"
                />
                <AppButton
                  variant="primary"
                  size="lg"
                  fullWidth
                  disabled={code.length !== CODE_LENGTH}
                  loading={verifyMutation.isPending}
                  onClick={submitCode}
                >
                  {t('emailOtpConfirmAction')}
                </AppButton>
                <button
                  onClick={sendCode}
                  disabled={requestMutation.isPending}
                  className="w-full text-caption font-bold text-pink-500 disabled:opacity-60"
                >
                  {t('emailOtpResendAction')}
                </button>
              </div>
            )}
          </>
        )}

        <p className="text-caption text-app-muted">{t('emailOtpPrivateNote')}</p>
      </div>
    </Modal>
  );
};
