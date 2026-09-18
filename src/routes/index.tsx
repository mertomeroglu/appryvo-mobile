import React, { lazy, Suspense, useEffect } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { AppShell } from '../app/AppShell';
import { SessionGate } from '../app/SessionGate';
import { RouteErrorScreen } from '../app/RouteErrorScreen';
import { loadOwnProfileScreen } from './routePreload';
import { measureProfileMilestone } from '../services/performance/profilePerformance';
import { translateSync } from '../i18n/appLocale';

// Critical routes loaded directly -- World/Social Discovery is the default authenticated
// landing experience (Apple 4.3(b) remediation: reviewers must not land on a swipe deck).
import { AuthScreen } from '../features/auth/AuthScreen';
import { SocialMapScreen } from '../features/map/SocialMapScreen';

// Heavy feature routes lazy loaded
const FullProfileScreen = lazy(() => import('../features/discovery/FullProfileScreen').then((m) => ({ default: m.FullProfileScreen })));
const DiscoverScreen = lazy(() => import('../features/discovery/DiscoverScreen').then((m) => ({ default: m.DiscoverScreen })));
const QuestionInboxScreen = lazy(() => import('../features/questions/QuestionInboxScreen').then((m) => ({ default: m.QuestionInboxScreen })));
const ProfileQuestionsScreen = lazy(() => import('../features/questions/ProfileQuestionsScreen').then((m) => ({ default: m.ProfileQuestionsScreen })));
const NotificationsScreen = lazy(() => import('../features/notifications/NotificationsScreen').then((m) => ({ default: m.NotificationsScreen })));
const MessagesScreen = lazy(() => import('../features/chat/MessagesScreen').then((m) => ({ default: m.MessagesScreen })));
const CallHistoryScreen = lazy(() => import('../features/calls/CallHistoryScreen').then((m) => ({ default: m.CallHistoryScreen })));
const OfficialRyvoThread = lazy(() => import('../features/chat/OfficialRyvoThread').then((m) => ({ default: m.OfficialRyvoThread })));
const ChatScreen = lazy(() => import('../features/chat/ChatScreen').then((m) => ({ default: m.ChatScreen })));
const OwnProfileScreen = lazy(() => loadOwnProfileScreen().then((m) => ({ default: m.OwnProfileScreen })));
const SettingsScreen = lazy(() => import('../features/profile/SettingsScreen').then((m) => ({ default: m.SettingsScreen })));
const BlockedUsersScreen = lazy(() => import('../features/profile/BlockedUsersScreen').then((m) => ({ default: m.BlockedUsersScreen })));
const VerificationScreen = lazy(() => import('../features/profile/VerificationScreen').then((m) => ({ default: m.VerificationScreen })));
const ProfilePreviewScreen = lazy(() => import('../features/profile/ProfilePreviewScreen').then((m) => ({ default: m.ProfilePreviewScreen })));
const ConnectionsListScreen = lazy(() => import('../features/profile/ConnectionsListScreen').then((m) => ({ default: m.ConnectionsListScreen })));
const PremiumScreen = lazy(() => import('../features/premium/PremiumScreen').then((m) => ({ default: m.PremiumScreen })));
const BoostScreen = lazy(() => import('../features/boost/BoostScreen').then((m) => ({ default: m.BoostScreen })));
const ProfileFramesScreen = lazy(() => import('../features/frames/ProfileFramesScreen').then((m) => ({ default: m.ProfileFramesScreen })));
const PassportScreen = lazy(() => import('../features/passport/PassportScreen').then((m) => ({ default: m.PassportScreen })));
const SupportScreen = lazy(() => import('../features/support/SupportScreen').then((m) => ({ default: m.SupportScreen })));
const RoomDirectoryScreen = lazy(() => import('../features/rooms/RoomDirectoryScreen').then((m) => ({ default: m.RoomDirectoryScreen })));
const CreateRoomScreen = lazy(() => import('../features/rooms/CreateRoomScreen').then((m) => ({ default: m.CreateRoomScreen })));
const RoomScreen = lazy(() => import('../features/rooms/RoomScreen').then((m) => ({ default: m.RoomScreen })));
const ReportRoomScreen = lazy(() => import('../features/rooms/ReportRoomScreen').then((m) => ({ default: m.ReportRoomScreen })));
const ConnectRequestInboxScreen = lazy(() => import('../features/connect/ConnectRequestInboxScreen').then((m) => ({ default: m.ConnectRequestInboxScreen })));

const SuspenseFallback = (
  <div className="flex items-center justify-center h-full w-full bg-app" />
);

const ProfileRouteFallback: React.FC = () => {
  useEffect(() => {
    const frame = requestAnimationFrame(() => measureProfileMilestone('shell-ready'));
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div className="h-full w-full bg-app px-4 text-app" aria-label={translateSync('routeProfileLoadingAriaLabel')}>
      <div className="pt-safe mx-auto mt-4 h-7 w-28 rounded-full bg-app-secondary animate-pulse" />
      <div className="mx-auto mt-6 h-28 w-28 rounded-full bg-app-secondary animate-pulse" />
      <div className="mx-auto mt-5 h-5 w-36 rounded-full bg-app-secondary animate-pulse" />
    </div>
  );
};

const router = createBrowserRouter([
  {
    path: '/',
    errorElement: <RouteErrorScreen />,
    element: <AppShell />,
    children: [
      {
        // SessionGate enforces: no session -> /auth, authenticated -> app. All onboarding
        // Required registration fields and photos are collected inside the registration
        // wizard. Device location is opt-in, requested later on World/Map (check-in) or
        // Discover (global compatibility/activity ranking) — see src/features/auth/RegistrationWizard.tsx and
        // src/app/SessionGate.tsx. World/Map is the default landing route (Apple 4.3(b)).
        element: <SessionGate />,
        children: [
          { index: true, element: <Navigate to="/map" replace /> },
          { path: 'auth', element: <AuthScreen /> },
          {
            path: 'discover',
            element: (
              <Suspense fallback={SuspenseFallback}>
                <DiscoverScreen />
              </Suspense>
            ),
          },
          {
            path: 'discover/:userId',
            element: (
              <Suspense fallback={SuspenseFallback}>
                <FullProfileScreen />
              </Suspense>
            ),
          },
          { path: 'map', element: <SocialMapScreen /> },
          { path: 'rooms/city/:cityId', element: <Suspense fallback={SuspenseFallback}><RoomDirectoryScreen /></Suspense> },
          { path: 'rooms/create', element: <Suspense fallback={SuspenseFallback}><CreateRoomScreen /></Suspense> },
          { path: 'rooms/:roomId/report', element: <Suspense fallback={SuspenseFallback}><ReportRoomScreen /></Suspense> },
          { path: 'rooms/:roomId', element: <Suspense fallback={SuspenseFallback}><RoomScreen /></Suspense> },
          { path: 'connect/inbox', element: <Suspense fallback={SuspenseFallback}><ConnectRequestInboxScreen /></Suspense> },
          {
            path: 'inbox/questions',
            element: (
              <Suspense fallback={SuspenseFallback}>
                <QuestionInboxScreen />
              </Suspense>
            ),
          },
          {
            path: 'profile/questions',
            element: (
              <Suspense fallback={SuspenseFallback}>
                <ProfileQuestionsScreen />
              </Suspense>
            ),
          },
          // "Seni Begenenler" is retired in the question flow; old in-app links, pushes and
          // installed shortcuts land on the question inbox instead of a dead route. The legacy
          // /api/likes/* endpoints stay live for older installed clients.
          { path: 'likes', element: <Navigate to="/inbox/questions" replace /> },
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
            path: 'calls',
            element: <Suspense fallback={SuspenseFallback}><CallHistoryScreen /></Suspense>,
          },
          {
            path: 'messages/ryvo',
            element: (
              <Suspense fallback={SuspenseFallback}>
                <OfficialRyvoThread />
              </Suspense>
            ),
          },
          {
            path: 'profile',
            element: (
              <Suspense fallback={<ProfileRouteFallback />}>
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
            path: 'connections/:userId',
            element: (
              <Suspense fallback={SuspenseFallback}>
                <ConnectionsListScreen />
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
            element: <Navigate to="/messages?tab=confessions" replace />,
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
