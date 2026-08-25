import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/native/secureStorage.ts'), 'utf8');

describe('secure storage is Keystore/Keychain-backed, not plaintext @capacitor/preferences', () => {
  it('uses the real secure-storage plugin as the primary read/write path', () => {
    expect(source).toContain("from '@aparajita/capacitor-secure-storage'");
    expect(source).toMatch(/SecureStorage\.setItem\(ACCESS_TOKEN_KEY/);
    expect(source).toMatch(/SecureStorage\.getItem/);
  });

  it('preserves the exact prior public interface so call sites never had to change', () => {
    for (const method of ['getAccessToken', 'setAccessToken', 'getRefreshToken', 'setRefreshToken', 'getUserData', 'setUserData', 'clearAll']) {
      expect(source).toContain(`async ${method}`);
    }
  });

  it('migrates a legacy plaintext value only after verifying the secure copy round-trips', () => {
    const fn = source.slice(source.indexOf('async function migrateLegacyKey'), source.indexOf('async function ensureMigrated'));
    expect(fn).toContain('await SecureStorage.setItem(key, legacy.value)');
    const setIndex = fn.indexOf('SecureStorage.setItem');
    const verifyIndex = fn.indexOf('SecureStorage.getItem');
    const removeIndex = fn.indexOf('Preferences.remove');
    expect(setIndex).toBeGreaterThan(-1);
    expect(verifyIndex).toBeGreaterThan(setIndex);
    expect(removeIndex).toBeGreaterThan(verifyIndex);
  });

  it('fails safe (treats as logged out) instead of falling back to plaintext on a plugin error', () => {
    const fn = source.slice(source.indexOf('async function safeGet'), source.indexOf('export const secureStorage'));
    expect(fn).toMatch(/catch\s*\{\s*return null;\s*\}/);
    expect(source).not.toMatch(/catch[\s\S]{0,80}Preferences\.get/);
  });

  it('never logs a token value', () => {
    expect(source).not.toMatch(/console\.(log|warn|error|info)\([^)]*token/i);
  });

  it('clears both the secure store and any leftover legacy plaintext key on logout', () => {
    const fn = source.slice(source.indexOf('async clearAll'), source.length);
    expect(fn).toContain('SecureStorage.removeItem(ACCESS_TOKEN_KEY)');
    expect(fn).toContain('Preferences.remove({ key: ACCESS_TOKEN_KEY })');
  });
});
