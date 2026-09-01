import { socketService } from '../socket/socketService';
import { webrtcService, MediaAccessError } from './webrtcService';
import { useCallStore, type CallError } from '../../stores/useCallStore';
import { nativeCallAudio } from '../../native/callAudio';
import { toast } from '../../stores/useToastStore';
import { translateSync } from '../../i18n/appLocale';

function generateCallId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `call-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// A transient 'disconnected' state often self-recovers via ICE keepalive without any new
// offer/answer (the signaling server has no renegotiation channel, so that's the only recovery
// path available -- see socket_server.js). Give it a grace window before treating it as failed.
const RECONNECT_GRACE_MS = 8000;
// How long the FAILED/permission-denied state stays on screen before the overlay auto-dismisses.
const FAILURE_DISPLAY_MS = 3000;

let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

// Re-entrancy guard for startOutgoingCall/acceptIncomingCall. Both are async (media acquisition
// + SDP creation take real time) and CallOverlay's buttons have no built-in double-tap
// debounce, so a fast double-tap previously could run either one twice concurrently: two
// independent RTCPeerConnections each calling webrtcService.ensurePeerConnection (which does not
// close whatever this.pc already held, so the first connection/its tracks just leaked), two
// call:start/call:answer emissions racing the server's isUserInActiveCall check, and two
// activeCall sessions momentarily fighting over the same store slot.
let isProcessingCallAction = false;

/** Tears down local WebRTC resources and the remote party's session, but leaves the failure
 *  visible in the store briefly so CallOverlay can render it before the overlay unmounts. */
function failCall(error: CallError, socketReason: string, message: string) {
  clearReconnectTimer();
  const call = useCallStore.getState().activeCall;
  if (call) socketService.endCall({ callId: call.callId, reason: socketReason });
  webrtcService.hangup();
  void nativeCallAudio.resetAudioMode();
  toast.error(message);
  useCallStore.getState().setCallError(error);
  useCallStore.getState().setCallStatus('FAILED');
  window.setTimeout(() => {
    if (useCallStore.getState().activeCall?.status === 'FAILED') useCallStore.getState().endCall();
  }, FAILURE_DISPLAY_MS);
}

webrtcService.onConnectionStateChange = (state) => {
  const call = useCallStore.getState().activeCall;
  if (!call || call.status === 'ENDED' || call.status === 'FAILED') return;

  if (state === 'connected') {
    clearReconnectTimer();
    if (call.status === 'CONNECTING' || call.status === 'RINGING' || call.status === 'RECONNECTING') {
      useCallStore.getState().setCallStatus('ACTIVE');
    }
    return;
  }

  if (state === 'disconnected') {
    if (call.status !== 'ACTIVE' && call.status !== 'RECONNECTING') return;
    useCallStore.getState().setCallStatus('RECONNECTING');
    clearReconnectTimer();
    reconnectTimer = setTimeout(() => {
      if (useCallStore.getState().activeCall?.status === 'RECONNECTING') {
        failCall('CONNECTION_FAILED', 'connection_failed', translateSync('callConnectionLostError'));
      }
    }, RECONNECT_GRACE_MS);
    return;
  }

  if (state === 'failed') {
    failCall('CONNECTION_FAILED', 'connection_failed', translateSync('callConnectionLostError'));
  }
};

export const callService = {
  async startOutgoingCall(params: {
    matchId: string;
    calleeUid: string;
    calleeName?: string;
    type: 'voice' | 'video';
  }) {
    // Also refuses a second outgoing call while one is already ringing/active -- the overlay
    // covers the screen once activeCall is set, but that's a UI convention, not a guarantee.
    if (isProcessingCallAction || useCallStore.getState().activeCall) return;
    isProcessingCallAction = true;

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
      await nativeCallAudio.startCallAudioSession(params.type === 'video');
      socketService.startCall({
        callId,
        calleeUid: params.calleeUid,
        matchId: params.matchId,
        type: params.type,
        offer,
      });
    } catch (err) {
      console.error('[CALL START ERROR]', err);
      if (err instanceof MediaAccessError) {
        failCall(
          err.reason,
          'media_error',
          err.reason === 'PERMISSION_DENIED'
            ? translateSync('callPermissionDeniedError')
            : translateSync('callDeviceUnavailableError')
        );
      } else {
        webrtcService.hangup();
        useCallStore.getState().endCall();
      }
    } finally {
      isProcessingCallAction = false;
    }
  },

  async acceptIncomingCall() {
    const call = useCallStore.getState().activeCall;
    if (!call || !call.offer || isProcessingCallAction) return;
    isProcessingCallAction = true;

    try {
      useCallStore.getState().setCallStatus('CONNECTING');
      const answer = await webrtcService.acceptOffer(call.callId, call.offer, call.type === 'video');
      socketService.answerCall({ callId: call.callId, answer });
      await nativeCallAudio.startCallAudioSession(call.type === 'video');
    } catch (err) {
      console.error('[CALL ACCEPT ERROR]', err);
      if (err instanceof MediaAccessError) {
        failCall(
          err.reason,
          'media_error',
          err.reason === 'PERMISSION_DENIED'
            ? translateSync('callPermissionDeniedError')
            : translateSync('callDeviceUnavailableError')
        );
      } else {
        webrtcService.hangup();
        useCallStore.getState().endCall();
      }
    } finally {
      isProcessingCallAction = false;
    }
  },

  endCall(reason: string = 'ended') {
    clearReconnectTimer();
    const call = useCallStore.getState().activeCall;
    if (call) {
      socketService.endCall({ callId: call.callId, reason });
    }
    webrtcService.hangup();
    void nativeCallAudio.resetAudioMode();
    useCallStore.getState().endCall();
  },

  /** Requester side of a mid-call voice->video upgrade. Only meaningful on an ACTIVE voice call;
   *  a failure here (e.g. camera permission denied) surfaces a toast but never ends the call --
   *  the existing audio connection is untouched by this whole flow. */
  async requestVideoUpgrade() {
    const call = useCallStore.getState().activeCall;
    if (!call || call.type === 'video' || call.status !== 'ACTIVE') return;
    try {
      const offer = await webrtcService.upgradeToVideo();
      if (!offer) return;
      socketService.sendRenegotiateOffer({ callId: call.callId, offer });
      useCallStore.getState().setCallType('video');
    } catch (err) {
      console.error('[CALL VIDEO UPGRADE ERROR]', err);
      toast.error(
        err instanceof MediaAccessError && err.reason === 'PERMISSION_DENIED'
          ? translateSync('callCameraPermissionDeniedError')
          : translateSync('callVideoUpgradeFailedError')
      );
    }
  },

  /** Peer side of a mid-call voice->video upgrade: received an offer that adds a video m-line to
   *  the already-connected call. Auto-accepts (adds its own camera track and answers) rather than
   *  prompting, matching this call flow's existing keep-it-simple style. */
  async handleIncomingRenegotiateOffer(offer: any) {
    const call = useCallStore.getState().activeCall;
    if (!call) return;
    try {
      const answer = await webrtcService.acceptVideoUpgrade(offer);
      if (!answer) return;
      socketService.sendRenegotiateAnswer({ callId: call.callId, answer });
      useCallStore.getState().setCallType('video');
    } catch (err) {
      // The peer already committed to sending video (their local preview is already live); not
      // being able to reciprocate here must not drop the still-healthy voice connection.
      console.error('[CALL VIDEO UPGRADE ACCEPT ERROR]', err);
    }
  },

  async handleIncomingRenegotiateAnswer(answer: any) {
    await webrtcService.confirmVideoUpgrade(answer);
  },
};
