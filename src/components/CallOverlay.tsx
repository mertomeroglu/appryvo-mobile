import React, { useEffect, useRef, useState } from 'react';
import { useCallStore } from '../stores/useCallStore';
import { socketService } from '../services/socket/socketService';
import { webrtcService } from '../services/call/webrtcService';
import { callService } from '../services/call/callService';
import { nativeCallAudio } from '../native/callAudio';
import {
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  SwitchCamera,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { nativeHaptics } from '../native/haptics';
import { Avatar } from './ui/Avatar';
import { IconButton } from './ui/IconButton';

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const CallOverlay: React.FC = () => {
  const { activeCall, setCallStatus } = useCallStore();
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false);
  const [isRequestingVideo, setIsRequestingVideo] = useState(false);
  const [canSwitchCamera, setCanSwitchCamera] = useState(true);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    webrtcService.onLocalStream = setLocalStream;
    webrtcService.onRemoteStream = setRemoteStream;
    return () => {
      webrtcService.onLocalStream = undefined;
      webrtcService.onRemoteStream = undefined;
      // Covers route/error/logout teardown as well as the normal callService.endCall path.
      webrtcService.hangup();
      void nativeCallAudio.resetAudioMode();
    };
  }, []);

  // Local-only UI state (mute/video/speaker) does not survive a session -- reset it whenever a
  // fresh call session starts so leftover state from a previous call can't carry over.
  useEffect(() => {
    if (!activeCall) return;
    setIsMuted(false);
    setIsVideoOff(false);
    setIsSpeakerOn(false);
    setElapsedSeconds(0);
    setCanSwitchCamera(true);
    setIsRequestingVideo(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the session itself changes
  }, [activeCall?.callId]);

  useEffect(() => {
    if (activeCall?.status !== 'ACTIVE' || !activeCall.startedAt) return;
    const startedAt = activeCall.startedAt;
    const tick = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [activeCall?.status, activeCall?.startedAt]);

  useEffect(() => {
    const unsubAnswered = socketService.on('call:answered', async (data) => {
      await webrtcService.setRemoteAnswer(data.answer);
      setCallStatus('ACTIVE');
    });

    const unsubIce = socketService.on('call:ice-candidate', (data) => {
      webrtcService.addIceCandidate(data.candidate);
    });

    const unsubRenegotiateOffer = socketService.on('call:renegotiate-offer', (data) => {
      void callService.handleIncomingRenegotiateOffer(data.offer);
    });

    const unsubRenegotiateAnswer = socketService.on('call:renegotiate-answer', (data) => {
      void callService.handleIncomingRenegotiateAnswer(data.answer);
    });

    const unsubEnded = socketService.on('call:ended', () => {
      webrtcService.hangup();
      void nativeCallAudio.resetAudioMode();
      useCallStore.getState().endCall();
    });

    const unsubBusy = socketService.on('call:busy', () => {
      webrtcService.hangup();
      void nativeCallAudio.resetAudioMode();
      useCallStore.getState().endCall();
    });

    // The disconnected device cannot receive the server's call:ended event. Release its own
    // camera/microphone immediately; the server notifies and cleans up the remote participant.
    const unsubDisconnect = socketService.on('disconnect', () => {
      webrtcService.hangup();
      void nativeCallAudio.resetAudioMode();
      useCallStore.getState().endCall();
    });

    return () => {
      unsubAnswered();
      unsubIce();
      unsubRenegotiateOffer();
      unsubRenegotiateAnswer();
      unsubEnded();
      unsubBusy();
      unsubDisconnect();
    };
  }, [setCallStatus]);

  // Video elements are always mounted (see JSX below) and only assigned a new srcObject when
  // the stream itself actually changes -- never conditionally created/destroyed as the call
  // status flickers. A remounted <video> re-triggers autoplay negotiation from scratch, which
  // is what was surfacing a native center "tap to play" control mid-call. autoPlay alone can
  // still silently no-op in a WebView, so .play() is called explicitly and retried once the
  // element reports it has enough data.
  useEffect(() => {
    const el = localVideoRef.current;
    if (!el) return;
    el.srcObject = localStream;
    if (localStream) el.play().catch(() => {});
  }, [localStream]);

  useEffect(() => {
    const el = remoteVideoRef.current;
    if (el) {
      el.srcObject = remoteStream;
      if (remoteStream) el.play().catch(() => {});
    }
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  if (!activeCall) return null;

  const isVideoCall = activeCall.type === 'video';
  const isRinging = activeCall.status === 'RINGING';
  const isReconnecting = activeCall.status === 'RECONNECTING';
  const isFailed = activeCall.status === 'FAILED';
  const isIncoming = activeCall.direction === 'incoming';
  const showRemoteVideo = isVideoCall && !!remoteStream && activeCall.status === 'ACTIVE';
  const showLocalVideo = isVideoCall && !!localStream && !isVideoOff;

  const handleAccept = () => {
    nativeHaptics.impact();
    callService.acceptIncomingCall();
  };

  const handleReject = () => {
    nativeHaptics.impact();
    callService.endCall('declined');
  };

  const handleHangup = () => {
    nativeHaptics.impact();
    callService.endCall('ended');
  };

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    webrtcService.setMuted(next);
  };

  const toggleVideo = () => {
    const next = !isVideoOff;
    setIsVideoOff(next);
    webrtcService.setVideoEnabled(!next);
  };

  const toggleSpeaker = async () => {
    const next = !isSpeakerOn;
    setIsSpeakerOn(next);
    await nativeCallAudio.setSpeakerOn(next);
  };

  const handleRequestVideo = async () => {
    if (isRequestingVideo) return;
    setIsRequestingVideo(true);
    try {
      await callService.requestVideoUpgrade();
    } finally {
      setIsRequestingVideo(false);
    }
  };

  const handleSwitchCamera = async () => {
    if (isSwitchingCamera) return;
    setIsSwitchingCamera(true);
    try {
      await webrtcService.switchCamera();
    } catch (err) {
      console.warn('[CALL] Camera switch failed', err);
      setCanSwitchCamera(false);
    } finally {
      setIsSwitchingCamera(false);
    }
  };

  const failureMessage =
    activeCall.error === 'PERMISSION_DENIED'
      ? 'Mikrofon/kamera izni verilmedi'
      : activeCall.error === 'DEVICE_UNAVAILABLE'
        ? 'Mikrofon/kamera kullanılamıyor'
        : 'Bağlantı kesildi';

  const statusLabel = isFailed
    ? failureMessage
    : isReconnecting
      ? 'Yeniden bağlanılıyor...'
      : isRinging
        ? isIncoming
          ? 'Gelen Arama...'
          : 'Aranıyor...'
        : activeCall.status === 'ACTIVE'
          ? formatDuration(elapsedSeconds)
          : 'Arama Devam Ediyor';

  return (
    <div className="fixed inset-0 z-call-overlay flex flex-col justify-between p-6 bg-app text-app select-none overflow-hidden">
      {/* Remote video: kept mounted for the lifetime of any video call (never conditionally
          created/destroyed on status/stream flicker) -- visibility toggles via class only, so
          autoplay never has to renegotiate mid-call. */}
      {isVideoCall && (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          disablePictureInPicture
          controlsList="nodownload nofullscreen noremoteplayback"
          className={`absolute inset-0 w-full h-full object-cover z-0 transition-opacity ${
            showRemoteVideo ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        />
      )}
      {/* Ambient glow (voice calls / no remote video yet) */}
      {!showRemoteVideo && (
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full bg-pink-500/10 blur-3xl pointer-events-none" />
      )}

      {/* Local video PiP: same stable-mount treatment as the remote video. */}
      {isVideoCall && (
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          disablePictureInPicture
          controlsList="nodownload nofullscreen noremoteplayback"
          className={`absolute top-20 right-4 w-24 h-36 rounded-2xl object-cover border-2 border-app shadow-elevated z-10 transition-opacity ${
            showLocalVideo ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        />
      )}
      <audio ref={remoteAudioRef} autoPlay className="hidden" />

      {/* Top Status Header */}
      <header className={`pt-safe text-center z-10 ${showRemoteVideo ? 'text-white' : 'text-app'}`}>
        <h3 className="text-title">{isVideoCall ? 'Görüntülü Arama' : 'Sesli Arama'}</h3>
        <p
          className={`text-caption mt-1 normal-case flex items-center justify-center gap-1.5 ${
            isFailed
              ? 'text-[#FF4B55]'
              : isReconnecting
                ? 'text-[#F5B942]'
                : showRemoteVideo
                  ? 'text-white/80'
                  : 'text-app-muted'
          }`}
        >
          {isReconnecting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
          {isFailed && <ShieldAlert className="w-3.5 h-3.5" />}
          {statusLabel}
        </p>
      </header>

      {/* Center Caller Avatar */}
      {!showRemoteVideo && (
        <div className="my-auto text-center flex flex-col items-center justify-center z-10">
          <div className="relative mb-6">
            <div
              className={`w-36 h-36 rounded-full p-1.5 bg-brand-gradient shadow-elevated shadow-pink-500/30 ${
                isRinging ? 'animate-pulse' : ''
              }`}
            >
              <Avatar name={activeCall.targetUserName} size="xl" className="w-full h-full" />
            </div>
          </div>
          <h2 className="text-title text-app mb-1">{activeCall.targetUserName || 'Arayan Kişi'}</h2>
        </div>
      )}

      {/* Bottom Actions Bar */}
      <footer className="pb-safe w-full max-w-sm mx-auto z-10">
        {isFailed ? (
          <div className="flex items-center justify-center">
            <IconButton
              aria-label="Kapat"
              variant="surface"
              size="lg"
              className="w-16 h-16 bg-[#FF4B55] text-white border-0 shadow-elevated shadow-red-500/30"
              onClick={handleHangup}
            >
              <PhoneOff className="w-8 h-8" />
            </IconButton>
          </div>
        ) : isRinging ? (
          <div className="flex items-center justify-around">
            <IconButton
              aria-label="Reddet"
              variant="surface"
              size="lg"
              className="w-16 h-16 bg-[#FF4B55] text-white border-0 shadow-elevated shadow-red-500/30"
              onClick={handleReject}
            >
              <PhoneOff className="w-8 h-8" />
            </IconButton>

            {isIncoming && (
              <IconButton
                aria-label="Kabul Et"
                variant="surface"
                size="lg"
                className="w-16 h-16 bg-[#32D583] text-white border-0 shadow-elevated shadow-emerald-500/30"
                onClick={handleAccept}
              >
                <Phone className="w-8 h-8" />
              </IconButton>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-around bg-surface/90 backdrop-blur-xl border border-app rounded-3xl p-4 shadow-floating">
            <IconButton
              aria-label={isMuted ? 'Sesi Aç' : 'Sesi Kapat'}
              variant={isMuted ? 'gradient' : 'surface'}
              size="md"
              onClick={toggleMute}
            >
              {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </IconButton>

            {!isVideoCall && nativeCallAudio.isSupported() && (
              <IconButton
                aria-label={isSpeakerOn ? 'Hoparlörü Kapat' : 'Hoparlörü Aç'}
                variant={isSpeakerOn ? 'gradient' : 'surface'}
                size="md"
                onClick={toggleSpeaker}
              >
                {isSpeakerOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
              </IconButton>
            )}

            {!isVideoCall && activeCall.status === 'ACTIVE' && (
              <IconButton
                aria-label="Görüntülü Aramaya Geç"
                variant="surface"
                size="md"
                disabled={isRequestingVideo}
                onClick={handleRequestVideo}
              >
                <Video className="w-5 h-5" />
              </IconButton>
            )}

            <IconButton
              aria-label="Aramayı Sonlandır"
              variant="surface"
              size="lg"
              className="bg-[#FF4B55] text-white border-0 shadow-elevated shadow-red-500/30"
              onClick={handleHangup}
            >
              <PhoneOff className="w-7 h-7" />
            </IconButton>

            {isVideoCall && (
              <IconButton
                aria-label={isVideoOff ? 'Kamerayı Aç' : 'Kamerayı Kapat'}
                variant={isVideoOff ? 'gradient' : 'surface'}
                size="md"
                onClick={toggleVideo}
              >
                {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
              </IconButton>
            )}

            {isVideoCall && !isVideoOff && canSwitchCamera && (
              <IconButton
                aria-label="Kamerayı Değiştir"
                variant="surface"
                size="md"
                disabled={isSwitchingCamera}
                onClick={handleSwitchCamera}
              >
                <SwitchCamera className="w-5 h-5" />
              </IconButton>
            )}
          </div>
        )}
      </footer>
    </div>
  );
};
