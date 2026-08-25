import { create } from 'zustand';

export type CallStatus = 'RINGING' | 'ACTIVE' | 'RECONNECTING' | 'FAILED' | 'ENDED';
export type CallError = 'PERMISSION_DENIED' | 'DEVICE_UNAVAILABLE' | 'CONNECTION_FAILED' | null;

export interface CallSession {
  callId: string;
  matchId: string;
  targetUserId: string;
  targetUserName?: string;
  type: 'voice' | 'video';
  status: CallStatus;
  direction: 'incoming' | 'outgoing';
  offer?: any;
  /** Set the instant status first reaches ACTIVE; drives the on-screen call duration timer. */
  startedAt?: number;
  error?: CallError;
}

interface CallStoreState {
  activeCall: CallSession | null;
  startCall: (session: CallSession) => void;
  setCallStatus: (status: CallStatus) => void;
  setCallError: (error: CallError) => void;
  setCallType: (type: 'voice' | 'video') => void;
  endCall: () => void;
}

export const useCallStore = create<CallStoreState>((set) => ({
  activeCall: null,
  startCall: (session: CallSession) => set({ activeCall: session }),
  setCallStatus: (status) =>
    set((state) => {
      if (!state.activeCall) return state;
      const startedAt = status === 'ACTIVE' ? state.activeCall.startedAt || Date.now() : state.activeCall.startedAt;
      return { activeCall: { ...state.activeCall, status, startedAt } };
    }),
  setCallError: (error) =>
    set((state) => ({
      activeCall: state.activeCall ? { ...state.activeCall, error } : null,
    })),
  // Flips a voice call to video after a successful mid-call upgrade (see callService's
  // requestVideoUpgrade/handleIncomingRenegotiateOffer) -- never used for the initial call type,
  // which is fixed at startCall/the incoming call:incoming payload.
  setCallType: (type) =>
    set((state) => ({
      activeCall: state.activeCall ? { ...state.activeCall, type } : null,
    })),
  endCall: () => set({ activeCall: null }),
}));
