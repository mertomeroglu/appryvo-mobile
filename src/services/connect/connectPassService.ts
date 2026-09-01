import { apiClient } from '../api/apiClient';

export type ConnectRequestStatus = 'PENDING'|'ACCEPTED'|'DECLINED'|'EXPIRED';
export type ConnectSourceType = 'MAP'|'ROOM';
export interface ConnectStatus { state:'SELF'|'MATCHED'|'PENDING_SENT'|'PENDING_RECEIVED'|'NONE'; matchId?:string; requestId?:string }
export interface ConnectConfig { connectPassCoinCost:number; connectPassDailyLimit:number; highlightedMessageCoinCost:number; connectRequestExpiryDays:number }
export interface ConnectRequest {
  id:string; senderId:string; recipientId:string; introMessage:string; sourceType:ConnectSourceType; sourceRoomId?:string|null;
  status:ConnectRequestStatus; coinCost:number; matchId?:string|null; expiresAt:string; respondedAt?:string|null; createdAt:string;
  sender?: { id:string; name:string; city?:string|null; photoUrl?:string|null };
}

const data = <T>(response:any):T => response?.data as T;

// One idempotency key per attempt -- generated client-side and reused only on an actual retry of
// the SAME attempt (e.g. a caller wraps this in its own retry loop), so a double-tap/duplicate
// submit from the UI is exactly the "double debit" case the server-side unique constraint +
// replay lookup makes safe, never a silent second charge.
function newIdempotencyKey(): string {
  return `connect-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const connectPassService = {
  getConfig: async () => data<ConnectConfig>(await apiClient.get('/api/connect-passes/config')),
  status: async (userId: string) => data<ConnectStatus>(await apiClient.get(`/api/connect-passes/status/${userId}`)),
  send: async (body: { recipientId: string; introMessage: string; sourceType: ConnectSourceType; sourceRoomId?: string }) =>
    data<{ request: ConnectRequest; balance: number; replayed: boolean }>(
      await apiClient.post('/api/connect-passes', { ...body, idempotencyKey: newIdempotencyKey() })
    ),
  inbox: async () => data<ConnectRequest[]>(await apiClient.get('/api/connect-passes/inbox')),
  accept: async (id: string) => data<{ matchId: string }>(await apiClient.post(`/api/connect-passes/${id}/accept`)),
  decline: async (id: string) => apiClient.post(`/api/connect-passes/${id}/decline`),
};
