import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Flame, Globe2, Heart, MessageCircle, User } from 'lucide-react';
import { useUiStore } from '../stores/useUiStore';
import { useLikesUnreadCountQuery } from '../hooks/useQueries';
import { useAppTranslation } from '../i18n/appLocale';
import { preloadProfileExperience } from '../routes/routePreload';
import { markProfileNavigationStart } from '../services/performance/profilePerformance';

export const FloatingNavBar: React.FC = () => {
  const location = useLocation();
  const unreadCount = useUiStore((s) => s.unreadCount);
  const { data: unreadLikesCount } = useLikesUnreadCountQuery();
  const { t } = useAppTranslation();

  // Hide nav bar on specific child/fullscreen views
  const isHidden = [
    '/auth',
    '/premium',
    '/boost',
    '/chat/',
    '/messages/ryvo',
    '/discover/',
    '/settings',
    '/verification',
    '/profile/preview',
    '/notifications',
  ].some((p) => location.pathname.startsWith(p));

  if (isHidden) return null;

  const navItems = [
    { path: '/discover', label: t('discover'), icon: Flame },
    { path: '/likes', label: t('likes'), icon: Heart, badge: unreadLikesCount },
    { path: '/map', label: t('map'), icon: Globe2 },
    {
      // Messages count only, never folded together with the unrelated generic in-app
      // notifications count (admin campaigns, lifecycle events, etc.) -- that count belongs on
      // its own bell icon, not here. Mixing them previously showed a phantom "6" on Messages for
      // an account with zero unread chats but 6 unrelated notifications.
      path: '/messages',
      label: t('messages'),
      icon: MessageCircle,
      badge: unreadCount,
    },
    { path: '/profile', label: t('profile'), icon: User },
  ];

  // Height + bottom margin here define --nav-footprint (globals.css) -- any screen that floats
  // content above this nav (e.g. DiscoverScreen's swipe action row) relies on that constant to
  // avoid this z-navigation-layer nav visually covering its buttons. Update both if this changes.
  return (
    <div className="fixed bottom-0 start-0 end-0 z-navigation pb-safe pointer-events-none flex justify-center">
      <nav className="pointer-events-auto mb-4 mx-4 w-full max-w-md bg-surface-95 backdrop-blur-xl border border-app rounded-[24px] px-2 py-1.5 flex items-center justify-around shadow-[0_8px_28px_-4px_rgba(0,0,0,0.35)] contain-layout">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname.startsWith(item.path);
          return (
              <NavLink
                key={item.path}
                to={item.path}
                aria-label={item.label}
                title={item.label}
                onPointerDown={item.path === '/profile' ? () => {
                  markProfileNavigationStart();
                  void preloadProfileExperience();
                } : undefined}
                onFocus={item.path === '/profile' ? () => void preloadProfileExperience() : undefined}
                className="relative flex flex-col items-center justify-center w-12 h-12 rounded-[18px] touch-manipulation transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                {isActive && (
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-brand-gradient rounded-[18px] shadow-md shadow-pink-500/20"
                  />
                )}
                <div
                  className={`relative z-10 flex items-center justify-center ${
                    isActive ? 'text-white' : 'text-app-muted'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5]' : 'stroke-[2]'}`} />
                  {typeof item.badge === 'number' && item.badge > 0 && (
                    <span className="absolute -top-2.5 -end-3 bg-pink-500 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-full border-2 border-surface min-w-[18px] text-center leading-none">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </div>
              </NavLink>
          );
        })}
      </nav>
    </div>
  );
};
