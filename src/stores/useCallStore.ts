import { create } from 'zustand';

export interface CallSession {
  callId: string;
  matchId: string;
  targetUserId: string;
  targetUserName?: string;
  type: 'voice' | 'video';
  status: 'RINGING' | 'ACTIVE' | 'ENDED';
  direction: 'incoming' | 'outgoing';
  offer?: any;
}

interface CallStoreState {
  activeCall: CallSession | null;
  startCall: (session: CallSession) => void;
  setCallStatus: (status: 'RINGING' | 'ACTIVE' | 'ENDED') => void;
  endCall: () => void;
}

export const useCallStore = create<CallStoreState>((set) => ({
  activeCall: null,
  startCall: (session: CallSession) => set({ activeCall: session }),
  setCallStatus: (status) =>
    set((state) => ({
      activeCall: state.activeCall ? { ...state.activeCall, status } : null,
    })),
  endCall: () => set({ activeCall: null }),
}));
