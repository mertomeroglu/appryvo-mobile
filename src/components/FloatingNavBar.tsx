import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Flame, Globe, Heart, MessageCircle, User } from 'lucide-react';
import { useUiStore } from '../stores/useUiStore';
import { useLikesUnreadCountQuery } from '../hooks/useQueries';
import { SPRING, PRESS_SCALE } from '../motion/tokens';

export const FloatingNavBar: React.FC = () => {
  const location = useLocation();
  const unreadCount = useUiStore((s) => s.unreadCount);
  const { data: unreadLikesCount } = useLikesUnreadCountQuery();

  // Hide nav bar on specific child/fullscreen views
  const isHidden = [
    '/auth',
    '/premium',
    '/boost',
    '/chat/',
    '/discover/',
    '/settings',
    '/verification',
    '/profile/preview',
    '/notifications',
  ].some((p) => location.pathname.startsWith(p));

  if (isHidden) return null;

  const navItems = [
    { path: '/discover', label: 'Keşfet', icon: Flame },
    { path: '/map', label: 'Harita', icon: Globe },
    { path: '/likes', label: 'Beğeniler', icon: Heart, badge: unreadLikesCount },
    { path: '/messages', label: 'Mesajlar', icon: MessageCircle, badge: unreadCount },
    { path: '/profile', label: 'Profil', icon: User },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-navigation pb-safe pointer-events-none flex justify-center">
      <nav className="pointer-events-auto mb-4 mx-4 w-full max-w-md bg-surface/90 backdrop-blur-xl border border-app rounded-[24px] px-2 py-1.5 flex items-center justify-around shadow-elevated">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname.startsWith(item.path);
          return (
            <motion.div key={item.path} whileTap={{ scale: PRESS_SCALE }} transition={SPRING.snappy}>
              <NavLink
                to={item.path}
                className="relative flex flex-col items-center justify-center w-12 h-12 rounded-[18px]"
              >
                {isActive && (
                  <motion.div
                    layoutId="nav-active-pill"
                    transition={SPRING.snappy}
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
                    <span className="absolute -top-2.5 -right-3 bg-pink-500 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-full border-2 border-surface min-w-[18px] text-center leading-none">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </div>
              </NavLink>
            </motion.div>
          );
        })}
      </nav>
    </div>
  );
};
