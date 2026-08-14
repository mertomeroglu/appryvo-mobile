import React from 'react';

const ShellContainer: React.FC<{ title: string; route: string }> = ({ title, route }) => (
  <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
    <div className="w-16 h-16 mb-4 rounded-full bg-gradient-to-tr from-pink-500 to-purple-600 flex items-center justify-center text-white font-bold text-xl shadow-lg">
      {title.charAt(0)}
    </div>
    <h2 className="text-2xl font-bold text-white mb-2">{title} Shell</h2>
    <p className="text-gray-400 text-sm font-mono">{route}</p>
    <div className="mt-6 px-4 py-2 bg-gray-800/60 border border-gray-700/50 rounded-lg text-xs text-gray-300">
      Production Client Foundation — Phase 2 Ready
    </div>
  </div>
);

export const AuthShell: React.FC = () => <ShellContainer title="Auth" route="/auth" />;
export const DiscoverShell: React.FC = () => <ShellContainer title="Discover" route="/discover" />;
export const MapShell: React.FC = () => <ShellContainer title="Social Map" route="/map" />;
export const LikesShell: React.FC = () => <ShellContainer title="Likes You" route="/likes" />;
export const MessagesShell: React.FC = () => <ShellContainer title="Messages" route="/messages" />;
export const ChatShell: React.FC = () => <ShellContainer title="Direct Chat" route="/chat/:matchId" />;
export const ProfileShell: React.FC = () => <ShellContainer title="Own Profile" route="/profile" />;
export const UserProfileShell: React.FC = () => <ShellContainer title="User Profile" route="/profile/:userId" />;
export const PremiumShell: React.FC = () => <ShellContainer title="Premium Membership" route="/premium" />;
export const BoostShell: React.FC = () => <ShellContainer title="Profile Boost" route="/boost" />;
export const FramesShell: React.FC = () => <ShellContainer title="Profile Frames" route="/frames" />;
export const PassportShell: React.FC = () => <ShellContainer title="Passport Location" route="/passport" />;
export const ConfessionsShell: React.FC = () => <ShellContainer title="Confessions Social" route="/confessions" />;

export default AuthShell;
