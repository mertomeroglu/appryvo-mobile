import { nativeCalls } from '../../native/calls';
import { socketService } from '../socket/socketService';

const FALLBACK_ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

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
  private currentCallId: string | null = null;
  private mediaRequestId = 0;
  private facingMode: 'user' | 'environment' = 'user';

  public onLocalStream?: (stream: MediaStream) => void;
  public onRemoteStream?: (stream: MediaStream | null) => void;
  public onConnectionStateChange?: (state: RTCPeerConnectionState) => void;

  private async getIceServers(): Promise<RTCIceServer[]> {
    try {
      const res: any = await nativeCalls.getIceConfig();
      const servers = res?.data?.iceServers;
      return Array.isArray(servers) && servers.length > 0 ? servers : FALLBACK_ICE_SERVERS;
    } catch {
      return FALLBACK_ICE_SERVERS;
    }
  }

  private async ensurePeerConnection(callId: string): Promise<RTCPeerConnection> {
    this.currentCallId = callId;
    const iceServers = await this.getIceServers();
    const pc = new RTCPeerConnection({ iceServers });

    pc.onicecandidate = (event) => {
      if (event.candidate && this.currentCallId) {
        socketService.sendIceCandidate({ callId: this.currentCallId, candidate: event.candidate.toJSON() });
      }
    };

    pc.ontrack = (event) => {
      this.onRemoteStream?.(event.streams[0] || null);
    };

    pc.onconnectionstatechange = () => {
      this.onConnectionStateChange?.(pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.onRemoteStream?.(null);
      }
    };

    this.pc = pc;
    return pc;
  }

  private async acquireLocalStream(video: boolean): Promise<MediaStream> {
    const requestId = ++this.mediaRequestId;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: video ? { facingMode: this.facingMode } : false,
      });
    } catch (err) {
      throw classifyMediaError(err);
    }
    if (requestId !== this.mediaRequestId) {
      stream.getTracks().forEach((track) => track.stop());
      throw new DOMException('Call ended before media became available.', 'AbortError');
    }
    this.localStream = stream;
    this.onLocalStream?.(stream);
    return stream;
  }

  async createOffer(callId: string, video: boolean): Promise<RTCSessionDescriptionInit> {
    const pc = await this.ensurePeerConnection(callId);
    const stream = await this.acquireLocalStream(video);
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    return offer;
  }

  async acceptOffer(
    callId: string,
    offer: RTCSessionDescriptionInit,
    video: boolean
  ): Promise<RTCSessionDescriptionInit> {
    const pc = await this.ensurePeerConnection(callId);
    const stream = await this.acquireLocalStream(video);
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    return answer;
  }

  async setRemoteAnswer(answer: RTCSessionDescriptionInit) {
    if (this.pc) await this.pc.setRemoteDescription(answer);
  }

  async addIceCandidate(candidate: RTCIceCandidateInit) {
    if (!this.pc) return;
    try {
      await this.pc.addIceCandidate(candidate);
    } catch (err) {
      console.warn('[WEBRTC] Failed to add ICE candidate', err);
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
    await this.pc.setRemoteDescription(offer);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  /** Mid-call voice->video upgrade: the requester applying the peer's answer. */
  async confirmVideoUpgrade(answer: RTCSessionDescriptionInit) {
    if (this.pc) await this.pc.setRemoteDescription(answer);
  }

  getResourceSnapshot() {
    return {
      activeLocalTracks: this.localStream?.getTracks().filter((track) => track.readyState === 'live').length || 0,
      localTrackStates: this.localStream?.getTracks().map((track) => ({ kind: track.kind, enabled: track.enabled, readyState: track.readyState })) || [],
      hasPeerConnection: this.pc !== null,
      peerConnectionState: this.pc?.connectionState || 'closed',
      signalingState: this.pc?.signalingState || 'closed',
      currentCallId: this.currentCallId,
    };
  }

  hangup() {
    this.mediaRequestId += 1;
    if (this.pc) this.pc.onconnectionstatechange = null;
    this.pc?.getSenders().forEach((sender) => sender.track?.stop());
    this.pc?.close();
    this.pc = null;
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.localStream = null;
    this.currentCallId = null;
    this.facingMode = 'user';
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
