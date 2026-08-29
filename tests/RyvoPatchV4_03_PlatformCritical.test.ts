import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..');
const source = (relativePath: string) => fs.readFileSync(path.join(root, 'src', relativePath), 'utf8');

describe('RYVO PATCH V4 / PROMPT 03: critical platform fixes', () => {
  // -----------------------------------------------------------------------------------------
  // B) System notifications wrong language -- the actual root cause was client-side: a second
  // language-picker call site never synced to the backend.
  // -----------------------------------------------------------------------------------------
  it('B -- setLocale itself syncs the chosen language to the backend (single source of truth)', () => {
    const appLocale = source('i18n/appLocale.ts');
    const setLocaleStart = appLocale.indexOf('setLocale: (locale) => {');
    const setLocaleEnd = appLocale.indexOf('\n}));', setLocaleStart);
    const setLocaleBody = appLocale.slice(setLocaleStart, setLocaleEnd);
    expect(setLocaleBody).toContain("apiClient.put('/api/profile', { targetLang: locale })");
    expect(setLocaleBody).toContain('isAuthenticated');
    // Dynamic imports, not static ones, to avoid a real circular import (apiClient.ts and
    // authService.ts both already import THIS module for translateSync).
    expect(setLocaleBody).toContain("import('../services/api/apiClient')");
    expect(setLocaleBody).toContain("import('../stores/useAuthStore')");
  });

  it('B -- AppLanguagePicker no longer has its own duplicate sync (single source of truth)', () => {
    const picker = source('components/AppLanguagePicker.tsx');
    expect(picker).not.toContain('apiClient');
    expect(picker).not.toContain('useAuthStore');
    expect(picker).toContain('setLocale(nextLocale)');
  });

  it('B -- SettingsScreen\'s language picker (the one that was actually broken) goes through the same setLocale', () => {
    const settings = source('features/profile/SettingsScreen.tsx');
    expect(settings).toContain('setLocale(code)');
  });

  it('B -- new lifecycle-notification i18n message keys are not needed client-side (server-rendered), but the app-language allowlist stays the single source of truth used by both sides', () => {
    const appLocale = source('i18n/appLocale.ts');
    // The 9 locale codes this file exports must match the set the server's
    // notification_locale_service.js hard-codes as SUPPORTED_NOTIFICATION_LOCALES.
    const optionsMatch = appLocale.match(/export const APP_LOCALE_OPTIONS = \[([\s\S]*?)\] as const;/);
    expect(optionsMatch).toBeTruthy();
    const codes = [...(optionsMatch?.[1].matchAll(/code: '(\w+)'/g) ?? [])].map((m) => m[1]);
    expect(codes.sort()).toEqual(['ar', 'en', 'es', 'fr', 'hi', 'pt', 'ru', 'tr', 'zh']);
  });

  // -----------------------------------------------------------------------------------------
  // D) Comment/confession reply UI -- the backend already supported parentId; no mobile UI ever
  // produced one.
  // -----------------------------------------------------------------------------------------
  it('D -- useAddCommentMutation now threads parentId through to the server', () => {
    const queries = source('hooks/useQueries.ts');
    const fnStart = queries.indexOf('export function useAddCommentMutation');
    const fnEnd = queries.indexOf('\n}', queries.indexOf('mutationFn:', fnStart));
    const fnBody = queries.slice(fnStart, fnEnd);
    expect(fnBody).toContain('parentId');
    expect(fnBody).toContain('{ text, parentId }');
  });

  it('D -- CommentsSheet has a real Reply affordance with a "replying to X" indicator and parentId wiring', () => {
    const sheet = source('features/social/CommentsSheet.tsx');
    expect(sheet).toContain('replyTarget');
    expect(sheet).toContain("t('commentReplyAction')");
    expect(sheet).toContain("t('commentReplyingToTemplate')");
    expect(sheet).toContain('parentId: replyTarget?.id');
    // Sending clears the reply target so it can't leak into the next unrelated comment.
    const handleSendStart = sheet.indexOf('const handleSend = () =>');
    const handleSendEnd = sheet.indexOf('};', handleSendStart);
    expect(sheet.slice(handleSendStart, handleSendEnd)).toContain('setReplyTarget(null)');
  });

  // -----------------------------------------------------------------------------------------
  // E) Support: category codes localized client-side instead of rendering server Turkish text.
  // -----------------------------------------------------------------------------------------
  it('E -- SupportScreen maps stable category codes to localized labels, sends codes not text', () => {
    const screen = source('features/support/SupportScreen.tsx');
    expect(screen).toContain('SUPPORT_CATEGORY_LABEL_KEYS');
    expect(screen).toContain("category: category || 'OTHER'");
    expect(screen).not.toContain("category || 'Diğer'");
    expect(screen).toContain('t(SUPPORT_CATEGORY_LABEL_KEYS[c] || \'supportCategoryOther\')');
  });

  // -----------------------------------------------------------------------------------------
  // F) Calls: permission-denied Open Settings CTA, TURN diagnostic visibility.
  // -----------------------------------------------------------------------------------------
  it('F -- a PERMISSION_DENIED call failure offers an Open Settings CTA, mirroring the existing location-permission pattern', () => {
    const overlay = source('components/CallOverlay.tsx');
    expect(overlay).toContain("import { nativeAppSettings } from '../native/nativeSettings'");
    const isFailedBranchStart = overlay.indexOf('{isFailed ? (');
    const isFailedBranchEnd = overlay.indexOf(') : isRinging ? (', isFailedBranchStart);
    const branch = overlay.slice(isFailedBranchStart, isFailedBranchEnd);
    expect(branch).toContain("activeCall.error === 'PERMISSION_DENIED'");
    expect(branch).toContain('nativeAppSettings.open()');
    expect(branch).toContain("t('callOpenSettingsAction')");
  });

  it('F -- a missing TURN config is now logged client-side instead of silently ignored', () => {
    const webrtc = source('services/call/webrtcService.ts');
    const fnStart = webrtc.indexOf('private async getIceServers');
    const fnEnd = webrtc.indexOf('\n  }', webrtc.indexOf('catch {', fnStart));
    const fnBody = webrtc.slice(fnStart, fnEnd);
    expect(fnBody).toContain("res?.data?.hasTurn === false");
    expect(fnBody).toContain('console.warn');
  });
});
