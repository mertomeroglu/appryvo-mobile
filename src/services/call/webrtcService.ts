import { nativeCalls } from '../../native/calls';
import { socketService } from '../socket/socketService';

const FALLBACK_ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

/**
 * Thin WebRTC media layer over the existing, real signaling contract
 * (call:start / call:answer / call:ice-candidate / call:end — see socketService).
 * This module owns only the RTCPeerConnection + local/remote MediaStream lifecycle;
 * it never renames or reshapes the signaling events themselves.
 */
class WebRTCService {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private currentCallId: string | null = null;

  public onLocalStream?: (stream: MediaStream) => void;
  public onRemoteStream?: (stream: MediaStream | null) => void;

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
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.onRemoteStream?.(null);
      }
    };

    this.pc = pc;
    return pc;
  }

  private async acquireLocalStream(video: boolean): Promise<MediaStream> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video });
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

  hangup() {
    this.pc?.getSenders().forEach((sender) => sender.track?.stop());
    this.pc?.close();
    this.pc = null;
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.localStream = null;
    this.currentCallId = null;
    this.onRemoteStream?.(null);
  }
}

export const webrtcService = new WebRTCService();
