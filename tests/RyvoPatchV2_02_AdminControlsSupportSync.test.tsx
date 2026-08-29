import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('RYVO PATCH V2 02/05 issue 1 -- entitlement resets refresh mobile state', () => {
  it('RealtimeSync invalidates the entitlements query whenever profile state is reconciled', () => {
    // An admin resetting Like/Super Like quota only changes the server; the mobile app must
    // actually refresh QUERY_KEYS.entitlements (a separate 2-minute-staleTime cache from
    // QUERY_KEYS.me) for the corrected right to become visible without an app restart.
    const source = readSource('src/components/RealtimeSync.tsx');
    const fnStart = source.indexOf('const reconcileProfile = async () => {');
    const fnBody = source.slice(fnStart, source.indexOf('};', fnStart));
    expect(fnBody).toMatch(/queryClient\.invalidateQueries\(\{ queryKey: QUERY_KEYS\.entitlements \}\)/);
  });
});

describe('RYVO PATCH V2 02/05 issue 3 -- support ticket submission no longer depends on token freshness', () => {
  it('SupportScreen sends the authenticated user\'s name/email directly in the ticket payload', () => {
    const source = readSource('src/features/support/SupportScreen.tsx');
    expect(source).toMatch(/useAuthStore/);
    const submitStart = source.indexOf('createTicket.mutateAsync({');
    const submitBody = source.slice(submitStart, source.indexOf('});', submitStart));
    expect(submitBody).toMatch(/name:\s*currentUser\?\.name/);
    expect(submitBody).toMatch(/email:\s*currentUser\?\.email/);
  });

  it('useCreateSupportTicketMutation accepts optional name/email fields in its payload type', () => {
    const source = readSource('src/hooks/useQueries.ts');
    const fnStart = source.indexOf('export function useCreateSupportTicketMutation()');
    const fnBody = source.slice(fnStart, source.indexOf('export function', fnStart + 1));
    expect(fnBody).toMatch(/name\?:\s*string/);
    expect(fnBody).toMatch(/email\?:\s*string/);
  });
});
