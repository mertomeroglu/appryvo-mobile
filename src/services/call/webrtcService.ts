import { nativeCalls } from '../../native/calls';
import { socketService } from '../socket/socketService';

const FALLBACK_ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
const AUDIO_CONSTRAINTS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};
const DEBUG = import.meta.env.DEV;

/**
 * Thin WebRTC media layer over the existing, real signaling contract (call:start / call:answer /
 * call:ice-candidate / call:end, plus the additive call:renegotiate-offer / call:renegotiate-
 * answer pair used only for a mid-call voice->video upgrade — see socketService). This module
 * owns only the RTCPeerConnection + local/remote MediaStream lifecycle; it never renames or
 * reshapes the signaling events themselves.
 */
export class MediaAccessError extends Error {
  constructor(public reason: 'PERMISSION_DENIED' | 'DEVICE_UNAVAILABLE', cause: unknown) {
    super(reason);
    this.cause = cause;
  }
}

function classifyMediaError(err: unknown): MediaAccessError {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return new MediaAccessError('PERMISSION_DENIED', err);
  }
  return new MediaAccessError('DEVICE_UNAVAILABLE', err);
}

class WebRTCService {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private currentCallId: string | null = null;
  private mediaRequestId = 0;
  private facingMode: 'user' | 'environment' = 'user';
  // Trickle ICE candidates from the peer routinely arrive before this side has a remote
  // description to add them against -- guaranteed on the callee's side, since the caller starts
  // gathering/sending candidates the instant they call createOffer(), which is well before the
  // callee's peer connection even exists (that's only created once the user taps Accept, after
  // the full ringing delay). addIceCandidate() used to just attempt pc.addIceCandidate()
  // immediately and silently drop anything that failed, which discarded essentially every
  // candidate sent during ringing -- SDP offer/answer still completed fine (so the call
  // "connected" from a signaling point of view) but ICE never had a viable candidate pair to
  // actually carry media, so audio/video never flowed. Queue instead, and flush once the remote
  // description is actually set.
  private pendingRemoteIceCandidates: RTCIceCandidateInit[] = [];

  public onLocalStream?: (stream: MediaStream) => void;
  public onRemoteStream?: (stream: MediaStream | null) => void;
  public onConnectionStateChange?: (state: RTCPeerConnectionState) => void;

  private async getIceServers(): Promise<RTCIceServer[]> {
    try {
      const res: any = await nativeCalls.getIceConfig();
      // hasTurn:false means this call is STUN-only -- it will still connect between two peers on
      // permissive networks, but silently degrades (no relay fallback) on symmetric NAT/restrictive
      // firewalls with no visibility into why. Previously this flag was fetched and then completely
      // ignored; logging it is a real, if minimal, diagnostic instead of a guessed-at "call quality
      // was bad" report with nothing to check server-side (calls_controller.js now also logs the
      // specific reason, e.g. TURN_SECRET_NOT_CONFIGURED, when this happens).
      if (res?.data?.hasTurn === false) {
        console.warn('[CALL] TURN unavailable, using STUN-only ICE servers', res.data.reason);
      }
      const servers = res?.data?.iceServers;
      return Array.isArray(servers) && servers.length > 0 ? servers : FALLBACK_ICE_SERVERS;
    } catch {
      console.warn('[CALL][WebRTC] ICE configuration request failed; using STUN fallback');
      return FALLBACK_ICE_SERVERS;
    }
  }

  private async ensurePeerConnection(callId: string): Promise<RTCPeerConnection> {
    this.currentCallId = callId;
    const iceServers = await this.getIceServers();
    const pc = new RTCPeerConnection({ iceServers });
    this.remoteStream = new MediaStream();

    if (DEBUG) {
      console.info(`[CALL][WebRTC][${callId}] iceServers=${iceServers.length}`);
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && this.currentCallId) {
        socketService.sendIceCandidate({ callId: this.currentCallId, candidate: event.candidate.toJSON() });
      }
    };

    pc.ontrack = (event) => {
      if (!this.remoteStream) this.remoteStream = new MediaStream();
      if (!this.remoteStream.getTracks().some((track) => track.id === event.track.id)) {
        this.remoteStream.addTrack(event.track);
      }
      if (DEBUG) {
        console.info(
          `[CALL][WebRTC][${callId}] remoteTrack=${event.track.kind} ` +
            `audioTracks=${this.remoteStream.getAudioTracks().length} videoTracks=${this.remoteStream.getVideoTracks().length}`
        );
      }
      event.track.onended = () => {
        this.remoteStream?.removeTrack(event.track);
        this.emitRemoteStream();
      };
      this.emitRemoteStream();
    };

    pc.onconnectionstatechange = () => {
      console.info(`[CALL][WebRTC][${callId}] connectionState=${pc.connectionState}`);
      this.onConnectionStateChange?.(pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.onRemoteStream?.(null);
      }
    };
    pc.oniceconnectionstatechange = () =>
      console.info(`[CALL][WebRTC][${callId}] iceConnectionState=${pc.iceConnectionState}`);
    pc.onicegatheringstatechange = () =>
      console.info(`[CALL][WebRTC][${callId}] iceGatheringState=${pc.iceGatheringState}`);
    pc.onsignalingstatechange = () =>
      console.info(`[CALL][WebRTC][${callId}] signalingState=${pc.signalingState}`);

    this.pc = pc;
    return pc;
  }

  private emitRemoteStream() {
    if (!this.remoteStream || this.remoteStream.getTracks().length === 0) {
      this.onRemoteStream?.(null);
      return;
    }
    // A fresh wrapper makes React observe audio/video track additions and removals while the
    // underlying tracks remain the same objects consumed by HTMLMediaElement.
    this.onRemoteStream?.(new MediaStream(this.remoteStream.getTracks()));
  }

  private async acquireLocalStream(video: boolean): Promise<MediaStream> {
    const requestId = ++this.mediaRequestId;
    let stream: MediaStream;
    const preferredConstraints = {
      audio: AUDIO_CONSTRAINTS,
      video: video
        ? { facingMode: this.facingMode, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } }
        : false,
    };
    try {
      stream = await navigator.mediaDevices.getUserMedia(preferredConstraints);
    } catch (err) {
      if (!video) {
        console.error('[CALL][WebRTC] getUserMedia failed for voice call', err);
        throw classifyMediaError(err);
      }
      const classifiedError = classifyMediaError(err);
      if (classifiedError.reason === 'PERMISSION_DENIED') {
        console.error('[CALL][WebRTC] getUserMedia permission denied for video call', err);
        throw classifiedError;
      }
      console.warn('[CALL][WebRTC] Preferred video constraints failed; trying basic capture', err);
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS, video: true });
      } catch (fallbackError) {
        console.error('[CALL][WebRTC] getUserMedia video fallback failed', fallbackError);
        throw classifyMediaError(fallbackError);
      }
    }
    if (requestId !== this.mediaRequestId) {
      stream.getTracks().forEach((track) => track.stop());
      throw new DOMException('Call ended before media became available.', 'AbortError');
    }
    this.localStream = stream;
    if (DEBUG) {
      console.info(
        `[CALL][WebRTC][${this.currentCallId || 'pending'}] getUserMedia success ` +
          `audioTracks=${stream.getAudioTracks().length} videoTracks=${stream.getVideoTracks().length}`
      );
    }
    this.onLocalStream?.(stream);
    return stream;
  }

  async createOffer(callId: string, video: boolean): Promise<RTCSessionDescriptionInit> {
    try {
      const pc = await this.ensurePeerConnection(callId);
      const stream = await this.acquireLocalStream(video);
      this.addLocalTracks(pc, stream);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      return offer;
    } catch (error) {
      this.hangup();
      throw error;
    }
  }

  async acceptOffer(
    callId: string,
    offer: RTCSessionDescriptionInit,
    video: boolean
  ): Promise<RTCSessionDescriptionInit> {
    try {
      const pc = await this.ensurePeerConnection(callId);
      await pc.setRemoteDescription(offer);
      await this.flushPendingIceCandidates();
      const stream = await this.acquireLocalStream(video);
      this.addLocalTracks(pc, stream);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      return answer;
    } catch (error) {
      this.hangup();
      throw error;
    }
  }

  private addLocalTracks(pc: RTCPeerConnection, stream: MediaStream) {
    for (const track of stream.getTracks()) {
      const alreadyAdded = pc.getSenders().some((sender) => sender.track?.id === track.id);
      if (!alreadyAdded) pc.addTrack(track, stream);
    }
    if (DEBUG) {
      const senders = pc.getSenders();
      console.info(
        `[CALL][WebRTC][${this.currentCallId || 'pending'}] senders ` +
          `audio=${senders.filter((sender) => sender.track?.kind === 'audio').length} ` +
          `video=${senders.filter((sender) => sender.track?.kind === 'video').length}`
      );
    }
  }

  async setRemoteAnswer(answer: RTCSessionDescriptionInit) {
    if (!this.pc) return;
    await this.pc.setRemoteDescription(answer);
    await this.flushPendingIceCandidates();
  }

  async addIceCandidate(candidate: RTCIceCandidateInit) {
    // Per the WebRTC spec, a candidate can only be added once a remote description exists.
    // Queue anything that arrives earlier (the normal case while the callee is still ringing)
    // instead of attempting and discarding it.
    if (!this.pc || !this.pc.remoteDescription) {
      this.pendingRemoteIceCandidates.push(candidate);
      return;
    }
    try {
      await this.pc.addIceCandidate(candidate);
    } catch (err) {
      console.warn('[WEBRTC] Failed to add ICE candidate', err);
    }
  }

  private async flushPendingIceCandidates() {
    if (!this.pc || this.pendingRemoteIceCandidates.length === 0) return;
    const queued = this.pendingRemoteIceCandidates;
    this.pendingRemoteIceCandidates = [];
    for (const candidate of queued) {
      try {
        await this.pc.addIceCandidate(candidate);
      } catch (err) {
        console.warn('[WEBRTC] Failed to add queued ICE candidate', err);
      }
    }
  }

  setMuted(muted: boolean) {
    this.localStream?.getAudioTracks().forEach((track) => (track.enabled = !muted));
  }

  setVideoEnabled(enabled: boolean) {
    this.localStream?.getVideoTracks().forEach((track) => (track.enabled = enabled));
  }

  /**
   * Swaps the outgoing video track for one from the other physical camera. Uses
   * RTCRtpSender.replaceTrack rather than renegotiating -- same media kind/count, so no new
   * offer/answer round trip (and none is available: the signaling server only relays the initial
   * offer/answer once, see socket_server.js call:answer).
   */
  async switchCamera(): Promise<'user' | 'environment' | null> {
    if (!this.pc || !this.localStream) return null;
    const nextFacing = this.facingMode === 'user' ? 'environment' : 'user';
    let newStream: MediaStream;
    try {
      newStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { exact: nextFacing } },
      });
    } catch (err) {
      throw classifyMediaError(err);
    }
    const newTrack = newStream.getVideoTracks()[0];
    if (!newTrack) return null;

    const sender = this.pc.getSenders().find((s) => s.track?.kind === 'video');
    await sender?.replaceTrack(newTrack);

    const oldTrack = this.localStream.getVideoTracks()[0];
    if (oldTrack) {
      this.localStream.removeTrack(oldTrack);
      oldTrack.stop();
    }
    this.localStream.addTrack(newTrack);
    this.facingMode = nextFacing;
    this.onLocalStream?.(this.localStream);
    return nextFacing;
  }

  /**
   * Mid-call voice->video upgrade: the side requesting video. Adds a fresh camera track to the
   * already-connected peer connection (addTrack on a live pc requires renegotiation, unlike
   * switchCamera's replaceTrack above) and returns the resulting offer for the caller to relay
   * via the new call:renegotiate-offer signaling event. Never touches the existing audio
   * sender/track, so a failure here cannot drop the ongoing voice call.
   */
  async upgradeToVideo(): Promise<RTCSessionDescriptionInit | null> {
    if (!this.pc || !this.localStream) return null;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: this.facingMode } });
    } catch (err) {
      throw classifyMediaError(err);
    }
    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) return null;
    this.pc.addTrack(videoTrack, this.localStream);
    this.localStream.addTrack(videoTrack);
    this.onLocalStream?.(this.localStream);
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  /**
   * Mid-call voice->video upgrade: the side receiving the request. Adds its own camera track
   * first (so the answer's video m-line is sendrecv, giving genuine two-way video rather than
   * one-sided), then answers the renegotiation offer.
   */
  async acceptVideoUpgrade(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit | null> {
    if (!this.pc || !this.localStream) return null;
    await this.pc.setRemoteDescription(offer);
    await this.flushPendingIceCandidates();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: this.facingMode } });
    } catch (err) {
      throw classifyMediaError(err);
    }
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      this.pc.addTrack(videoTrack, this.localStream);
      this.localStream.addTrack(videoTrack);
      this.onLocalStream?.(this.localStream);
    }
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  /** Mid-call voice->video upgrade: the requester applying the peer's answer. */
  async confirmVideoUpgrade(answer: RTCSessionDescriptionInit) {
    if (!this.pc) return;
    await this.pc.setRemoteDescription(answer);
    await this.flushPendingIceCandidates();
  }

  getResourceSnapshot() {
    return {
      activeLocalTracks: this.localStream?.getTracks().filter((track) => track.readyState === 'live').length || 0,
      localTrackStates: this.localStream?.getTracks().map((track) => ({ kind: track.kind, enabled: track.enabled, readyState: track.readyState })) || [],
      hasPeerConnection: this.pc !== null,
      peerConnectionState: this.pc?.connectionState || 'closed',
      signalingState: this.pc?.signalingState || 'closed',
      currentCallId: this.currentCallId,
      pendingIceCandidateCount: this.pendingRemoteIceCandidates.length,
    };
  }

  hangup() {
    this.mediaRequestId += 1;
    if (this.pc) this.pc.onconnectionstatechange = null;
    if (this.pc) {
      this.pc.onicecandidate = null;
      this.pc.ontrack = null;
      this.pc.oniceconnectionstatechange = null;
      this.pc.onicegatheringstatechange = null;
      this.pc.onsignalingstatechange = null;
    }
    this.pc?.getSenders().forEach((sender) => sender.track?.stop());
    this.pc?.close();
    this.pc = null;
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.localStream = null;
    this.remoteStream?.getTracks().forEach((track) => {
      track.onended = null;
    });
    this.remoteStream = null;
    this.currentCallId = null;
    this.facingMode = 'user';
    this.pendingRemoteIceCandidates = [];
    this.onRemoteStream?.(null);
  }
}

export const webrtcService = new WebRTCService();

if (typeof window !== 'undefined') {
  Object.defineProperty(window, '__RYVO_WEBRTC_DEBUG__', {
    configurable: true,
    value: () => webrtcService.getResourceSnapshot(),
  });
}
