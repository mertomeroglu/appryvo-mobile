let profileRoutePromise: ReturnType<typeof importOwnProfileScreen> | null = null;
let editProfilePromise: ReturnType<typeof importEditProfileModal> | null = null;

function importOwnProfileScreen() {
  return import('../features/profile/OwnProfileScreen');
}

function importEditProfileModal() {
  return import('../components/EditProfileModal');
}

export function loadOwnProfileScreen() {
  profileRoutePromise ||= importOwnProfileScreen();
  return profileRoutePromise;
}

export function preloadEditProfileModal() {
  editProfilePromise ||= importEditProfileModal();
  return editProfilePromise;
}

/** Warms the management screen first, then its heavier edit/crop flow while the app is idle. */
export async function preloadProfileExperience() {
  await loadOwnProfileScreen();
  void preloadEditProfileModal();
}
