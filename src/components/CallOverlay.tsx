import React, { useEffect, useRef, useState } from 'react';
import { useCallStore } from '../stores/useCallStore';
import { socketService } from '../services/socket/socketService';
import { webrtcService } from '../services/call/webrtcService';
import { callService } from '../services/call/callService';
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff } from 'lucide-react';
import { nativeHaptics } from '../native/haptics';
import { Avatar } from './ui/Avatar';
import { IconButton } from './ui/IconButton';

export const CallOverlay: React.FC = () => {
  const { activeCall, setCallStatus } = useCallStore();
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    webrtcService.onLocalStream = setLocalStream;
    webrtcService.onRemoteStream = setRemoteStream;
    return () => {
      webrtcService.onLocalStream = undefined;
      webrtcService.onRemoteStream = undefined;
    };
  }, []);

  useEffect(() => {
    const unsubIncoming = socketService.on('call:incoming', (data) => {
      nativeHaptics.impact();
      useCallStore.getState().startCall({
        callId: data.callId,
        matchId: data.matchId,
        targetUserId: data.callerUid,
        targetUserName: data.callerName || 'Arayan Kişi',
        type: data.type || 'voice',
        status: 'RINGING',
        direction: 'incoming',
        offer: data.offer,
      });
    });

    const unsubAnswered = socketService.on('call:answered', async (data) => {
      await webrtcService.setRemoteAnswer(data.answer);
      setCallStatus('ACTIVE');
    });

    const unsubIce = socketService.on('call:ice-candidate', (data) => {
      webrtcService.addIceCandidate(data.candidate);
    });

    const unsubEnded = socketService.on('call:ended', () => {
      webrtcService.hangup();
      useCallStore.getState().endCall();
    });

    const unsubBusy = socketService.on('call:busy', () => {
      webrtcService.hangup();
      useCallStore.getState().endCall();
    });

    return () => {
      unsubIncoming();
      unsubAnswered();
      unsubIce();
      unsubEnded();
      unsubBusy();
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

  const statusLabel = isRinging
    ? isIncoming
      ? 'Gelen Arama...'
      : 'Aranıyor...'
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
        <p className={`text-caption mt-1 normal-case ${showRemoteVideo ? 'text-white/80' : 'text-app-muted'}`}>
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
        {isRinging ? (
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
          </div>
        )}
      </footer>
    </div>
  );
};
