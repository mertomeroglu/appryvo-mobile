import React, { useState } from 'react';
import { ShieldAlert, Check } from 'lucide-react';
import { apiClient } from '../services/api/apiClient';
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
        await apiClient.delete('/api/account');
      }
      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        onClose();
        onSuccess?.();
      }, 1500);
    } catch (err: any) {
      setErrorMsg(err.message || 'İşlem gerçekleştirilemedi.');
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
                className="w-full bg-input-app border border-app rounded-xl p-3 text-body text-app focus:outline-none focus:border-pink-500"
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
                className="w-full bg-input-app border border-app rounded-xl p-3 text-caption text-app placeholder:text-app-muted focus:outline-none focus:border-pink-500"
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
                className="w-full bg-input-app border border-app rounded-xl p-3 text-caption text-app placeholder:text-app-muted focus:outline-none focus:border-pink-500"
              />
            </>
          )}

          {type === 'delete_account' && (
            <p className="text-caption text-[#FF4B55] normal-case">
              Dikkat: Hesabınızı sildiğinizde tüm eşleşmeleriniz, mesajlarınız ve profil verileriniz kalıcı olarak
              silinecektir. Bu işlem geri alınamaz.
            </p>
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
            >
              Onayla
            </AppButton>
          </div>
        </form>
      )}
    </Modal>
  );
};
