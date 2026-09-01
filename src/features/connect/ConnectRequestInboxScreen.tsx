import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { connectPassService, type ConnectRequest } from '../../services/connect/connectPassService';
import { apiClient } from '../../services/api/apiClient';
import { useAppTranslation } from '../../i18n/appLocale';
import { connectText } from './connectLocale';
import { Avatar } from '../../components/ui/Avatar';
import { AppButton } from '../../components/ui/AppButton';
import { EmptyState } from '../../components/ui/EmptyState';

// Phase 13: "Connection Requests" inbox for Connect Pass -- no exact location is ever shown here
// (only city, matching the map/room privacy rules everywhere else). An expired request cannot be
// accepted (the accept endpoint itself enforces this; the UI here just reflects it).
export const ConnectRequestInboxScreen: React.FC = () => {
  const navigate = useNavigate();
  const { locale } = useAppTranslation();
  const [requests, setRequests] = useState<ConnectRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => connectPassService.inbox().then(setRequests).catch(() => setRequests([])).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const accept = async (req: ConnectRequest) => {
    setBusyId(req.id);
    try {
      const { matchId } = await connectPassService.accept(req.id);
      navigate(`/chat/${matchId}`);
    } catch {
      load();
    } finally {
      setBusyId(null);
    }
  };
  const decline = async (req: ConnectRequest) => {
    setBusyId(req.id);
    try {
      await connectPassService.decline(req.id);
      setRequests((prev) => prev.filter((r) => r.id !== req.id));
    } finally {
      setBusyId(null);
    }
  };
  const block = async (req: ConnectRequest) => {
    setBusyId(req.id);
    try {
      await apiClient.post('/api/blocks', { targetUserId: req.senderId });
      setRequests((prev) => prev.filter((r) => r.id !== req.id));
    } finally {
      setBusyId(null);
    }
  };

  const isExpired = (req: ConnectRequest) => new Date(req.expiresAt).getTime() <= Date.now();

  return (
    <div className="flex h-full flex-col bg-app text-app">
      <header className="flex items-center gap-3 border-b border-app bg-surface-95 px-4 pb-3 pt-safe backdrop-blur-xl">
        <button onClick={() => navigate(-1)} className="mt-3 rounded-full p-2"><ArrowLeft /></button>
        <h1 className="mt-3 text-heading">{connectText(locale, 'connectInboxTitle')}</h1>
      </header>
      <main className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? null : requests.length === 0 ? (
          <EmptyState title={connectText(locale, 'noConnectRequests')} />
        ) : requests.filter((r) => r.status === 'PENDING').map((req) => (
          <div key={req.id} className="rounded-2xl border border-app bg-surface p-4">
            <div className="flex items-center gap-3">
              <Avatar src={req.sender?.photoUrl} name={req.sender?.name || 'Member'} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1"><b>{req.sender?.name || 'Member'}</b></div>
                <p className="text-caption text-app-muted">{req.sender?.city || ''} · {req.sourceType === 'MAP' ? connectText(locale, 'viaMap') : connectText(locale, 'viaRoom')}</p>
              </div>
              {isExpired(req) && <ShieldCheck className="h-4 w-4 text-app-muted" />}
            </div>
            <p className="mt-2 text-body text-app">{req.introMessage}</p>
            {isExpired(req) ? (
              <p className="mt-2 text-caption font-bold text-red-500">{connectText(locale, 'requestExpired')}</p>
            ) : (
              <div className="mt-3 flex gap-2">
                <AppButton fullWidth size="sm" variant="primary" loading={busyId === req.id} onClick={() => accept(req)}>{connectText(locale, 'accept')}</AppButton>
                <AppButton fullWidth size="sm" variant="secondary" loading={busyId === req.id} onClick={() => decline(req)}>{connectText(locale, 'decline')}</AppButton>
                <AppButton size="sm" variant="danger" loading={busyId === req.id} onClick={() => block(req)}>{connectText(locale, 'block')}</AppButton>
              </div>
            )}
          </div>
        ))}
      </main>
    </div>
  );
};
export default ConnectRequestInboxScreen;
