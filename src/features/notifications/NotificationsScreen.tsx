import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, Heart, MessageCircle, BadgeCheck, Crown, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import { useInAppNotificationsQuery, useMarkNotificationReadMutation } from '../../hooks/useQueries';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { IconButton } from '../../components/ui/IconButton';
import { formatMessageTime } from '../../lib/formatMessageTime';

interface InAppNotification {
  id: string;
  event_type: string;
  title: string;
  body: string;
  cta_url?: string | null;
  is_read: boolean;
  priority: string;
  created_at: string;
}

function iconForEvent(eventType: string) {
  const t = (eventType || '').toUpperCase();
  if (t.includes('MATCH')) return Heart;
  if (t.includes('LIKE')) return Heart;
  if (t.includes('MESSAGE')) return MessageCircle;
  if (t.includes('VERIF')) return BadgeCheck;
  if (t.includes('PREMIUM')) return Crown;
  if (t.includes('BOOST')) return Zap;
  return Bell;
}

export const NotificationsScreen: React.FC = () => {
  const navigate = useNavigate();
  const { data, isLoading } = useInAppNotificationsQuery();
  const markRead = useMarkNotificationReadMutation();

  const notifications: InAppNotification[] = Array.isArray(data?.notifications) ? data.notifications : [];

  const handleOpen = (n: InAppNotification) => {
    if (!n.is_read) markRead.mutate(n.id);
    if (n.cta_url) {
      try {
        const url = new URL(n.cta_url);
        navigate(url.pathname + url.search);
      } catch {
        // cta_url not a full URL (or malformed) — nothing safe to route to
      }
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-app text-app overflow-hidden select-none">
      <header className="pt-safe px-4 h-16 flex items-center gap-3 z-sticky bg-app/80 backdrop-blur-md border-b border-app">
        <IconButton aria-label="Geri" variant="surface" size="md" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </IconButton>
        <h2 className="text-title text-app">Bildirimler</h2>
        {!isLoading && data?.unreadCount > 0 && (
          <span className="ml-auto px-2.5 py-1 rounded-full bg-brand-gradient text-white text-micro font-extrabold">
            {data.unreadCount} yeni
          </span>
        )}
      </header>

      <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-24">
        {isLoading && (
          <div className="flex flex-col gap-2 my-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} variant="card" className="h-[68px] rounded-2xl" />
            ))}
          </div>
        )}

        {!isLoading && notifications.length === 0 && (
          <div className="my-auto py-16">
            <EmptyState icon="🔔" title="Bildirim Yok" subtitle="Yeni etkileşimler burada görünecek." />
          </div>
        )}

        {!isLoading && notifications.length > 0 && (
          <div className="flex flex-col gap-2 my-3">
            {notifications.map((n) => {
              const Icon = iconForEvent(n.event_type);
              return (
                <motion.button
                  key={n.id}
                  onTap={() => handleOpen(n)}
                  whileTap={{ scale: 0.98 }}
                  className={`flex items-start gap-3 p-3.5 rounded-2xl border text-left transition-colors ${
                    n.is_read ? 'bg-surface border-app' : 'bg-surface border-pink-500/30 shadow-soft'
                  }`}
                >
                  <div
                    className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center ${
                      n.is_read ? 'bg-app-secondary text-app-muted' : 'bg-brand-gradient text-white'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-caption font-black text-app truncate">{n.title}</h4>
                      {!n.is_read && <span className="w-2 h-2 rounded-full bg-pink-500 shrink-0" />}
                    </div>
                    <p className="text-caption text-app-muted normal-case line-clamp-2">{n.body}</p>
                    <p className="text-micro text-app-muted normal-case mt-1">
                      {formatMessageTime(n.created_at)}
                    </p>
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
