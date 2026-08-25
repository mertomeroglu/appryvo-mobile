import React, { useEffect, useState } from 'react';
import { ShieldAlert, Check, LockKeyhole } from 'lucide-react';
import { ApiException, apiClient } from '../services/api/apiClient';
import { useAuthStore } from '../stores/useAuthStore';
import { Modal } from './ui/Modal';
import { AppButton } from './ui/AppButton';

interface SafetyReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUserId?: string;
  targetUserName?: string;
  type?: 'report' | 'block' | 'delete_account';
  /** Called after the action succeeds (e.g. so a caller can navigate away or refetch a list). */
  onSuccess?: () => void;
}

const REPORT_REASONS = [
  { value: 'SPAM', label: 'Spam / Sahte Profil' },
  { value: 'IMPERSONATION', label: 'Bu kişi bana ait fotoğraf kullanıyor' },
  { value: 'HARASSMENT', label: 'Taciz / Uygunsuz Davranış' },
  { value: 'INAPPROPRIATE_CONTENT', label: 'Uygunsuz Fotoğraf / İçerik' },
  { value: 'UNDERAGE', label: 'Yaş Sınırı İhlali' },
  { value: 'OTHER', label: 'Diğer' },
];

export const SafetyReportModal: React.FC<SafetyReportModalProps> = ({
  isOpen,
  onClose,
  targetUserId,
  targetUserName = 'Kullanıcı',
  type = 'report',
  onSuccess,
}) => {
  const [reason, setReason] = useState('SPAM');
  const [details, setDetails] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [password, setPassword] = useState('');
  const user = useAuthStore((state) => state.user);
  const hasPassword = user?.hasPassword !== false;
  const socialProviders = Array.isArray(user?.authProviders) ? user.authProviders : [];

  useEffect(() => {
    if (!isOpen) return;
    setPassword('');
    setErrorMsg('');
    setIsSuccess(false);
  }, [isOpen, type]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setIsLoading(true);

    try {
      if (type === 'report' && targetUserId) {
        await apiClient.post('/api/reports', {
          targetUserId,
          category: reason,
          reason,
          details: details || undefined,
        });
      } else if (type === 'block' && targetUserId) {
        await apiClient.post('/api/blocks', {
          targetUserId,
          reason: details || undefined,
        });
      } else if (type === 'delete_account') {
        if (!hasPassword) {
          setErrorMsg('Bu hesap sosyal giriş kullanıyor. Hesabını silmeden önce giriş sağlayıcınla yeniden doğrulama yapmalısın.');
          setIsLoading(false);
          return;
        }
        await apiClient.delete('/api/account', { password });
      }
      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        onClose();
        onSuccess?.();
      }, 1500);
    } catch (err: any) {
      if (type === 'delete_account') {
        if (err instanceof ApiException && err.statusCode === 429) {
          setErrorMsg('Çok fazla hatalı deneme yaptın. Lütfen daha sonra tekrar dene.');
        } else if (err instanceof ApiException && (err.code === 'ACCOUNT_DELETE_REAUTH_FAILED' || err.statusCode === 401)) {
          setErrorMsg('Şifre yanlış. Hesabında hiçbir değişiklik yapılmadı.');
        } else if (err instanceof ApiException && err.code === 'PASSWORD_REQUIRED') {
          setErrorMsg('Devam etmek için şifreni gir.');
        } else {
          setErrorMsg('Hesap şu anda silinemedi. Lütfen daha sonra tekrar dene.');
        }
      } else {
        setErrorMsg(err.message || 'İşlem gerçekleştirilemedi.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="flex items-center gap-2 text-app font-bold text-heading border-b border-app pb-3 mb-4">
        <ShieldAlert className="w-5 h-5 text-[#FF4B55]" />
        <span>
          {type === 'report' ? 'Kullanıcıyı Bildir' : type === 'block' ? 'Kullanıcıyı Engelle' : 'Hesabı Sil'}
        </span>
      </div>

      {isSuccess ? (
        <div className="py-8 flex flex-col items-center text-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-[#32D583]/15 text-[#32D583] flex items-center justify-center">
            <Check className="w-6 h-6" />
          </div>
          <h4 className="text-body font-bold text-app">İşlem Başarıyla Alındı</h4>
          <p className="text-caption text-app-muted normal-case">
            {type === 'delete_account'
              ? 'Hesabın kalıcı olarak silinecek.'
              : 'Bildiriminiz güvenlik ekibimizce incelenecektir.'}
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {type === 'report' && (
            <>
              <p className="text-caption text-app-muted normal-case">
                <span className="font-bold text-app">{targetUserName}</span> adlı kullanıcıyı bildirme sebebinizi
                seçin:
              </p>

              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full bg-input-app border border-app rounded-xl p-3 text-body text-app focus:outline-none focus:border-pink-500 focus-visible:ring-2 focus-visible:ring-pink-500/40"
              >
                {REPORT_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>

              <textarea
                rows={3}
                placeholder="Ek açıklama (isteğe bağlı)..."
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                className="w-full bg-input-app border border-app rounded-xl p-3 text-caption text-app placeholder:text-app-muted focus:outline-none focus:border-pink-500 focus-visible:ring-2 focus-visible:ring-pink-500/40"
              />
            </>
          )}

          {type === 'block' && (
            <>
              <p className="text-caption text-app-muted normal-case">
                <span className="font-bold text-app">{targetUserName}</span> adlı kullanıcıyı engellemek
                istediğinize emin misiniz? Birbirinizi tekrar göremez ve mesajlaşamazsınız.
              </p>
              <textarea
                rows={2}
                placeholder="Sebep (isteğe bağlı)..."
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                className="w-full bg-input-app border border-app rounded-xl p-3 text-caption text-app placeholder:text-app-muted focus:outline-none focus:border-pink-500 focus-visible:ring-2 focus-visible:ring-pink-500/40"
              />
            </>
          )}

          {type === 'delete_account' && (
            <div className="space-y-3">
              <p className="text-caption text-[#FF4B55] normal-case">
                Dikkat: Hesabınızı sildiğinizde tüm eşleşmeleriniz, mesajlarınız ve profil verileriniz kalıcı olarak
                silinecektir. Bu işlem geri alınamaz.
              </p>
              {hasPassword ? (
                <label className="block space-y-1.5">
                  <span className="text-caption font-bold normal-case text-app">Şifreni doğrula</span>
                  <span className="relative block">
                    <LockKeyhole className="absolute start-3.5 top-3.5 h-4 w-4 text-app-muted" />
                    <input
                      type="password"
                      required
                      autoComplete="current-password"
                      enterKeyHint="done"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Şifreni gir"
                      className="w-full rounded-xl border border-app bg-input-app py-3 ps-10 pe-3 text-body text-app placeholder:text-app-muted focus:border-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
                    />
                  </span>
                </label>
              ) : (
                <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-caption normal-case text-amber-600">
                  {socialProviders.length > 0
                    ? `${socialProviders.join(' / ')} ile yeniden doğrulama gerekiyor.`
                    : 'Sosyal giriş sağlayıcınla yeniden doğrulama gerekiyor.'}
                </p>
              )}
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-caption font-bold text-center">
              {errorMsg}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <AppButton type="button" variant="secondary" size="md" className="flex-1" onClick={onClose}>
              İptal
            </AppButton>
            <AppButton
              type="submit"
              variant="danger"
              size="md"
              className="flex-1"
              loading={isLoading}
              disabled={type === 'delete_account' && (!hasPassword || password.length === 0)}
            >
              {type === 'delete_account' ? 'Hesabımı Kalıcı Olarak Sil' : 'Onayla'}
            </AppButton>
          </div>
        </form>
      )}
    </Modal>
  );
};
