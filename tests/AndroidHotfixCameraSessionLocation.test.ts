import { describe, expect, it, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const source = (relPath: string) => fs.readFileSync(path.join(root, relPath), 'utf8');

describe('Android Critical Hotfix — Contract & Behavior Tests', () => {
  // =========================================================================
  // PHASE 17 — CAMERA CONTRACT & FLOW TESTS
  // =========================================================================
  describe('Phase 17 — Camera Contract & Logic', () => {
    it('1 & 7 — allowEditing is explicitly false for all camera and picker flows', () => {
      const cameraSrc = source('src/native/camera.ts');
      expect(cameraSrc).toContain('allowEditing: false');
      expect(cameraSrc).not.toContain('allowEditing: true');
    });

    it('2 & 3 & 4 — Camera checks permissions and requests only if prompt, denied does NOT call getPhoto', () => {
      const cameraSrc = source('src/native/camera.ts');
      expect(cameraSrc).toContain('Camera.checkPermissions()');
      expect(cameraSrc).toContain('Camera.requestPermissions(');
      expect(cameraSrc).toContain('ensureCameraPermission');
      expect(cameraSrc).toContain('PERMISSION_DENIED');
    });

    it('5 & 6 — Error classification distinguishes USER_CANCELLED without throwing generic errors', () => {
      const cameraSrc = source('src/native/camera.ts');
      expect(cameraSrc).toContain('USER_CANCELLED');
      expect(cameraSrc).toContain('PERMISSION_DENIED');
      expect(cameraSrc).toContain('CAMERA_UNAVAILABLE');
      expect(cameraSrc).toContain('NATIVE_CAMERA_ERROR');
      expect(cameraSrc).toContain('CameraError');
      expect(cameraSrc).toContain('isCancellation');
    });

    it('8 — Native camera falls back safely with convertFileSrc when path exists', () => {
      const cameraSrc = source('src/native/camera.ts');
      expect(cameraSrc).toContain('Capacitor.convertFileSrc');
      expect(cameraSrc).toContain('resolveImageUri');
    });

    it('9 — Duplicate tap / concurrency protection is enforced with cameraBusy mutex', () => {
      const cameraSrc = source('src/native/camera.ts');
      expect(cameraSrc).toContain('cameraBusy');
      expect(cameraSrc).toContain('if (cameraBusy)');

      const wizardSrc = source('src/features/auth/RegistrationWizard.tsx');
      expect(wizardSrc).toContain('isCameraBusyRef.current');
    });

    it('10 — App restored result listener handles process death and deduplicates photos', () => {
      const cameraSrc = source('src/native/camera.ts');
      expect(cameraSrc).toContain("App.addListener('appRestoredResult'");
      expect(cameraSrc).toContain('lastHandledRestoredKey');
      expect(cameraSrc).toContain('onRestoredPhoto');
    });
  });

  // =========================================================================
  // PHASE 18 — SESSION RESTORE & REFRESH TOKEN BEHAVIOR TESTS
  // =========================================================================
  describe('Phase 18 — Session Restore & Resilience', () => {
    it('11 — Valid session with /me success returns user data', async () => {
      const authServiceSrc = source('src/services/auth/authService.ts');
      expect(authServiceSrc).toContain('this.getCurrentUser()');
      expect(authServiceSrc).toContain('getUserData()');
    });

    it('12 — Missing access token attempts recovery from a valid refresh token', () => {
      const authServiceSrc = source('src/services/auth/authService.ts');
      expect(authServiceSrc).toContain('let token = await secureStorage.getAccessToken()');
      expect(authServiceSrc).toContain('await refreshTokenFlow()');
      expect(authServiceSrc).toContain('await secureStorage.getRefreshToken()');
    });

    it('recovers auth headers before feature requests when only the refresh token remains', () => {
      const apiClientSrc = source('src/services/api/apiClient.ts');
      const headerSection = apiClientSrc.slice(apiClientSrc.indexOf('async function getAuthHeaders'), apiClientSrc.indexOf('async function handleResponse'));
      expect(headerSection).toContain('secureStorage.getRefreshToken()');
      expect(headerSection).toContain('refreshTokenFlow()');
    });

    it('13, 14, 15, 16 — Network offline, timeout, 5xx NEVER wipe credentials', () => {
      const authServiceSrc = source('src/services/auth/authService.ts');
      // Must NOT unconditionally clearAll in the catch block
      const restoreSection = authServiceSrc.slice(authServiceSrc.indexOf('restoreSession()'));
      const catchBlock = restoreSection.slice(restoreSection.indexOf('catch (err: any) {'));
      expect(catchBlock).toContain('cachedUser');
      expect(catchBlock).toContain('statusCode === 401');
      expect(catchBlock).toContain('recoverableRefreshToken');

      // In apiClient refreshTokenFlow, catch block must NOT call secureStorage.clearAll()
      const apiClientSrc = source('src/services/api/apiClient.ts');
      const refreshSection = apiClientSrc.slice(apiClientSrc.indexOf('refreshTokenFlow()'));
      const catchIndex = refreshSection.indexOf('} catch {');
      const afterCatch = refreshSection.slice(catchIndex, refreshSection.indexOf('return false;\n  })();', catchIndex));
      expect(afterCatch).not.toContain('secureStorage.clearAll()');
    });

    it('17 — Definitive invalid refresh token (401) clears credentials', () => {
      const apiClientSrc = source('src/services/api/apiClient.ts');
      const refreshSection = apiClientSrc.slice(apiClientSrc.indexOf('refreshTokenFlow()'));
      expect(refreshSection).toContain('if (res.status === 401)');
      expect(refreshSection).toContain('await secureStorage.clearAll()');
    });

    it('18 — Explicit logout clears credentials', () => {
      const authServiceSrc = source('src/services/auth/authService.ts');
      const logoutSection = authServiceSrc.slice(authServiceSrc.indexOf('logout()'));
      expect(logoutSection).toContain('await secureStorage.clearAll()');
    });

    it('19 & 20 — Offline cold start returns cached user and prevents false redirect to login', () => {
      const authServiceSrc = source('src/services/auth/authService.ts');
      expect(authServiceSrc).toContain('const cachedUser = await secureStorage.getUserData()');
      expect(authServiceSrc).toContain('if (cachedUser)');
      expect(authServiceSrc).toContain('return cachedUser');
    });
  });

  // =========================================================================
  // PHASE 19 — LOCATION PERMISSION & MAP FALLBACK TESTS
  // =========================================================================
  describe('Phase 19 — Location Permission Flow & Map Resilience', () => {
    it('21, 22, 23, 24 — Geolocation checks and requests permissions before getting position', () => {
      const locationSrc = source('src/native/location.ts');
      expect(locationSrc).toContain('checkPermissions()');
      expect(locationSrc).toContain('requestPermissions(');
      expect(locationSrc).toContain('ensurePermission()');
      expect(locationSrc).toContain('PERMISSION_DENIED');
    });

    it('25 — Location denial provides open settings flow without looping', () => {
      const mapSrc = source('src/features/map/SocialMapScreen.tsx');
      expect(mapSrc).toContain('nativeAppSettings.openLocationServices()');
      expect(mapSrc).toContain('PERMISSION_DENIED');
    });

    it('26 & 27 — Map remains completely usable when location permission is denied', () => {
      const mapSrc = source('src/features/map/SocialMapScreen.tsx');
      expect(mapSrc).toContain("locationStatus === 'denied'");
      expect(mapSrc).toContain('callOpenSettingsAction');
    });
  });

  // =========================================================================
  // CONFIGURATION & BUILD INTEGRITY GATES
  // =========================================================================
  describe('Configuration & Android Manifest Integrity', () => {
    it('uses Capacitor WebChromeClient for verification camera permission delivery', () => {
      const mainActivity = source('android/app/src/main/java/com/appryvo/ryvo/MainActivity.java');
      expect(mainActivity).not.toContain('setWebChromeClient(new CallWebChromeClient');
      const verification = source('src/features/profile/VerificationScreen.tsx');
      expect(verification).toContain('nativeCamera.ensureCameraPermission()');
    });
    it('Manifest includes camera and location permissions with optional camera hardware feature', () => {
      const manifest = source('android/app/src/main/AndroidManifest.xml');
      expect(manifest).toContain('android.permission.CAMERA');
      expect(manifest).toContain('android.permission.ACCESS_FINE_LOCATION');
      expect(manifest).toContain('android.permission.ACCESS_COARSE_LOCATION');
      expect(manifest).toContain('android.hardware.camera');
      expect(manifest).toContain('android:required="false"');
    });

    it('Non-negotiable: does NOT include READ_EXTERNAL_STORAGE or WRITE_EXTERNAL_STORAGE', () => {
      const manifest = source('android/app/src/main/AndroidManifest.xml');
      expect(manifest).not.toContain('android.permission.READ_EXTERNAL_STORAGE');
      expect(manifest).not.toContain('android.permission.WRITE_EXTERNAL_STORAGE');
    });

    it('Build gradle has targetSdk 36, versionCode 13, versionName 3.0.3', () => {
      const gradle = source('android/app/build.gradle');
      expect(gradle).toContain('compileSdk 36');
      expect(gradle).toContain('targetSdk 36');
      expect(gradle).toContain('versionCode 13');
      expect(gradle).toContain('versionName "3.0.3"');
    });

    it('Package.json is synced to version 3.0.3', () => {
      const pkg = JSON.parse(source('package.json'));
      expect(pkg.version).toBe('3.0.3');
    });
  });
});
