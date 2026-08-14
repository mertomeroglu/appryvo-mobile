import React, { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { AppShell } from '../app/AppShell';
import { SessionGate } from '../app/SessionGate';

// Critical routes loaded directly
import { AuthScreen } from '../features/auth/AuthScreen';
import { DiscoverScreen } from '../features/discovery/DiscoverScreen';

// Heavy feature routes lazy loaded
const FullProfileScreen = lazy(() => import('../features/discovery/FullProfileScreen').then((m) => ({ default: m.FullProfileScreen })));
const SocialMapScreen = lazy(() => import('../features/map/SocialMapScreen').then((m) => ({ default: m.SocialMapScreen })));
const LikesScreen = lazy(() => import('../features/likes/LikesScreen').then((m) => ({ default: m.LikesScreen })));
const NotificationsScreen = lazy(() => import('../features/notifications/NotificationsScreen').then((m) => ({ default: m.NotificationsScreen })));
const MessagesScreen = lazy(() => import('../features/chat/MessagesScreen').then((m) => ({ default: m.MessagesScreen })));
const ChatScreen = lazy(() => import('../features/chat/ChatScreen').then((m) => ({ default: m.ChatScreen })));
const OwnProfileScreen = lazy(() => import('../features/profile/OwnProfileScreen').then((m) => ({ default: m.OwnProfileScreen })));
const SettingsScreen = lazy(() => import('../features/profile/SettingsScreen').then((m) => ({ default: m.SettingsScreen })));
const BlockedUsersScreen = lazy(() => import('../features/profile/BlockedUsersScreen').then((m) => ({ default: m.BlockedUsersScreen })));
const VerificationScreen = lazy(() => import('../features/profile/VerificationScreen').then((m) => ({ default: m.VerificationScreen })));
const ProfilePreviewScreen = lazy(() => import('../features/profile/ProfilePreviewScreen').then((m) => ({ default: m.ProfilePreviewScreen })));
const ConfessionsScreen = lazy(() => import('../features/social/ConfessionsScreen').then((m) => ({ default: m.ConfessionsScreen })));
const PremiumScreen = lazy(() => import('../features/premium/PremiumScreen').then((m) => ({ default: m.PremiumScreen })));
const BoostScreen = lazy(() => import('../features/boost/BoostScreen').then((m) => ({ default: m.BoostScreen })));
const ProfileFramesScreen = lazy(() => import('../features/frames/ProfileFramesScreen').then((m) => ({ default: m.ProfileFramesScreen })));
const PassportScreen = lazy(() => import('../features/passport/PassportScreen').then((m) => ({ default: m.PassportScreen })));
const SupportScreen = lazy(() => import('../features/support/SupportScreen').then((m) => ({ default: m.SupportScreen })));

const SuspenseFallback = (
  <div className="flex items-center justify-center h-full w-full bg-app" />
);

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      {
        // SessionGate enforces: no session -> /auth, authenticated -> app. All onboarding
        // (relationship goal, interests, lifestyle, photos, location) happens inside the
        // registration wizard itself, before the account is created — see
        // src/features/auth/RegistrationWizard.tsx. See src/app/SessionGate.tsx.
        element: <SessionGate />,
        children: [
          { index: true, element: <Navigate to="/discover" replace /> },
          { path: 'auth', element: <AuthScreen /> },
          { path: 'discover', element: <DiscoverScreen /> },
          {
            path: 'discover/:userId',
            element: (
              <Suspense fallback={SuspenseFallback}>
                <FullProfileScreen />
              </Suspense>
            ),
          },
          {
            path: 'map',
            element: (
              <Suspense fallback={SuspenseFallback}>
                <SocialMapScreen />
              </Suspense>
            ),
          },
          {
            path: 'likes',
            element: (
              <Suspense fallback={SuspenseFallback}>
                <LikesScreen />
              </Suspense>
            ),
          },
          {
            path: 'notifications',
            element: (
              <Suspense fallback={SuspenseFallback}>
                <NotificationsScreen />
              </Suspense>
            ),
          },
          {
            path: 'messages',
            element: (
              <Suspense fallback={SuspenseFallback}>
                <MessagesScreen />
              </Suspense>
            ),
          },
          {
            path: 'chat/:matchId',
            element: (
              <Suspense fallback={SuspenseFallback}>
                <ChatScreen />
              </Suspense>
            ),
          },
          {
            path: 'profile',
            element: (
              <Suspense fallback={SuspenseFallback}>
                <OwnProfileScreen />
              </Suspense>
            ),
          },
          {
            path: 'profile/preview',
            element: (
              <Suspense fallback={SuspenseFallback}>
                <ProfilePreviewScreen />
              </Suspense>
            ),
          },
          {
            path: 'settings',
            element: (
              <Suspense fallback={SuspenseFallback}>
                <SettingsScreen />
              </Suspense>
            ),
          },
          {
            path: 'settings/blocked',
            element: (
              <Suspense fallback={SuspenseFallback}>
                <BlockedUsersScreen />
              </Suspense>
            ),
          },
          {
            path: 'verification',
            element: (
              <Suspense fallback={SuspenseFallback}>
                <VerificationScreen />
              </Suspense>
            ),
          },
          {
            path: 'confessions',
            element: (
              <Suspense fallback={SuspenseFallback}>
                <ConfessionsScreen />
              </Suspense>
            ),
          },
          {
            path: 'premium',
            element: (
              <Suspense fallback={SuspenseFallback}>
                <PremiumScreen />
              </Suspense>
            ),
          },
          {
            path: 'boost',
            element: (
              <Suspense fallback={SuspenseFallback}>
                <BoostScreen />
              </Suspense>
            ),
          },
          {
            path: 'frames',
            element: (
              <Suspense fallback={SuspenseFallback}>
                <ProfileFramesScreen />
              </Suspense>
            ),
          },
          {
            path: 'passport',
            element: (
              <Suspense fallback={SuspenseFallback}>
                <PassportScreen />
              </Suspense>
            ),
          },
          {
            path: 'support',
            element: (
              <Suspense fallback={SuspenseFallback}>
                <SupportScreen />
              </Suspense>
            ),
          },
        ],
      },
    ],
  },
]);

export const AppRouter: React.FC = () => <RouterProvider router={router} />;
