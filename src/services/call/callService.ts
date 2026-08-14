import { socketService } from '../socket/socketService';
import { webrtcService } from './webrtcService';
import { useCallStore } from '../../stores/useCallStore';

function generateCallId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `call-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const callService = {
  async startOutgoingCall(params: {
    matchId: string;
    calleeUid: string;
    calleeName?: string;
    type: 'voice' | 'video';
  }) {
    const callId = generateCallId();
    useCallStore.getState().startCall({
      callId,
      matchId: params.matchId,
      targetUserId: params.calleeUid,
      targetUserName: params.calleeName,
      type: params.type,
      status: 'RINGING',
      direction: 'outgoing',
    });

    try {
      const offer = await webrtcService.createOffer(callId, params.type === 'video');
      socketService.startCall({
        callId,
        calleeUid: params.calleeUid,
        matchId: params.matchId,
        type: params.type,
        offer,
      });
    } catch (err) {
      console.error('[CALL START ERROR]', err);
      webrtcService.hangup();
      useCallStore.getState().endCall();
    }
  },

  async acceptIncomingCall() {
    const call = useCallStore.getState().activeCall;
    if (!call || !call.offer) return;

    try {
      const answer = await webrtcService.acceptOffer(call.callId, call.offer, call.type === 'video');
      socketService.answerCall({ callId: call.callId, answer });
      useCallStore.getState().setCallStatus('ACTIVE');
    } catch (err) {
      console.error('[CALL ACCEPT ERROR]', err);
      callService.endCall('error');
    }
  },

  endCall(reason: string = 'ended') {
    const call = useCallStore.getState().activeCall;
    if (call) {
      socketService.endCall({ callId: call.callId, reason });
    }
    webrtcService.hangup();
    useCallStore.getState().endCall();
  },
};
