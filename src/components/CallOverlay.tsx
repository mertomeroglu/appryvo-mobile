import React, { useEffect, useRef, useState } from 'react';
import { useCallStore } from '../stores/useCallStore';
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
import { nativeAppSettings } from '../native/nativeSettings';
import { Avatar } from './ui/Avatar';
import { IconButton } from './ui/IconButton';
import { AppButton } from './ui/AppButton';
import { useAppTranslation } from '../i18n/appLocale';
import { ringbackTone } from '../services/call/ringbackTone';

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const CallOverlay: React.FC = () => {
  const { t } = useAppTranslation();
  const { activeCall } = useCallStore();
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false);
  const [isRequestingVideo, setIsRequestingVideo] = useState(false);
  const [canSwitchCamera, setCanSwitchCamera] = useState(true);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [pipExpanded, setPipExpanded] = useState(false);
  const [pipPosition, setPipPosition] = useState({ x: Math.max(12, window.innerWidth - 112), y: 80 });
  const pipDragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);

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
    const shouldRing = activeCall?.direction === 'outgoing' && activeCall.status === 'RINGING';
    if (shouldRing) void ringbackTone.start(); else ringbackTone.stop();
    return () => ringbackTone.stop();
  }, [activeCall?.direction, activeCall?.status]);

  useEffect(() => {
    const keepInside = () => {
      const width = pipExpanded ? 160 : 96;
      const height = pipExpanded ? 220 : 144;
      setPipPosition((position) => ({
        x: Math.min(Math.max(12, position.x), Math.max(12, window.innerWidth - width - 12)),
        y: Math.min(Math.max(72, position.y), Math.max(72, window.innerHeight - height - 190)),
      }));
    };
    window.addEventListener('resize', keepInside);
    keepInside();
    return () => window.removeEventListener('resize', keepInside);
  }, [pipExpanded]);

  useEffect(() => {
    if (activeCall?.status !== 'ACTIVE' || !activeCall.startedAt) return;
    const startedAt = activeCall.startedAt;
    const tick = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [activeCall?.status, activeCall?.startedAt]);

  // Call signaling responses (answered/ice-candidate/renegotiate/ended/busy) are handled in
  // RealtimeSync.tsx, not here -- CallOverlay is lazy-loaded and only mounts once activeCall is
  // already non-null, which is too late to reliably catch the peer's early signaling (see the
  // comment there for the full reasoning). This component only owns local stream wiring and UI.

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
    if (localStream) {
      void el.play().then(
        () => console.info('[CALL][Media] local video play success'),
        (error) => console.warn('[CALL][Media] local video play failed', error)
      );
    }
  }, [localStream]);

  useEffect(() => {
    const video = remoteVideoRef.current;
    if (video) {
      video.srcObject = remoteStream;
      if (remoteStream?.getVideoTracks().length) {
        void video.play().then(
          () => console.info('[CALL][Media] remote video play success'),
          (error) => console.warn('[CALL][Media] remote video play failed', error)
        );
      }
    }
    const audio = remoteAudioRef.current;
    if (audio) {
      audio.srcObject = remoteStream;
      if (remoteStream?.getAudioTracks().length) {
        void audio.play().then(
          () => console.info('[CALL][Media] remote audio play success'),
          (error) => console.warn('[CALL][Media] remote audio play failed', error)
        );
      }
    }
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

  const movePip = (event: React.PointerEvent<HTMLVideoElement>) => {
    const drag = pipDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const width = pipExpanded ? 160 : 96;
    const height = pipExpanded ? 220 : 144;
    setPipPosition({
      x: Math.min(Math.max(12, drag.originX + event.clientX - drag.startX), Math.max(12, window.innerWidth - width - 12)),
      y: Math.min(Math.max(72, drag.originY + event.clientY - drag.startY), Math.max(72, window.innerHeight - height - 190)),
    });
  };

  const finishPipDrag = (event: React.PointerEvent<HTMLVideoElement>) => {
    const drag = pipDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    pipDragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const width = pipExpanded ? 160 : 96;
    const height = pipExpanded ? 220 : 144;
    setPipPosition((position) => ({
      x: position.x + width / 2 < window.innerWidth / 2 ? 12 : window.innerWidth - width - 12,
      y: position.y + height / 2 < (window.innerHeight - 95) / 2 ? 72 : window.innerHeight - height - 190,
    }));
  };

  const failureMessage =
    activeCall.error === 'PERMISSION_DENIED'
      ? t('callPermissionDeniedError')
      : activeCall.error === 'DEVICE_UNAVAILABLE'
        ? t('callDeviceUnavailableError')
        : t('callConnectionLostError');

  const statusLabel = isFailed
    ? failureMessage
    : isReconnecting
      ? t('callReconnectingLabel')
      : isRinging
        ? isIncoming
          ? t('callIncomingLabel')
          : t('callRingingLabel')
        : activeCall.status === 'ACTIVE'
          ? formatDuration(elapsedSeconds)
          : t('callOngoingLabel');

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
          muted
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
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            pipDragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: pipPosition.x, originY: pipPosition.y };
          }}
          onPointerMove={movePip}
          onPointerUp={finishPipDrag}
          onPointerCancel={finishPipDrag}
          onDoubleClick={() => setPipExpanded((value) => !value)}
          style={{ left: pipPosition.x, top: pipPosition.y, width: pipExpanded ? 160 : 96, height: pipExpanded ? 220 : 144, touchAction: 'none' }}
          className={`absolute rounded-2xl object-cover border-2 border-app shadow-elevated z-10 transition-[opacity,width,height] ${
            showLocalVideo ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        />
      )}
      {/* Remote sound has one owner: this audio element. The remote video is muted above to
          prevent doubled audio while still allowing its explicit play() to bypass video stalls. */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {/* Top Status Header */}
      <header className={`pt-safe text-center z-10 ${showRemoteVideo ? 'text-white' : 'text-app'}`}>
        <h3 className="text-title">{isVideoCall ? t('callVideoCallTitle') : t('callVoiceCallTitle')}</h3>
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
          <h2 className="text-title text-app mb-1">{activeCall.targetUserName || t('callUnknownCallerFallback')}</h2>
        </div>
      )}

      {/* Bottom Actions Bar */}
      <footer className="pb-safe w-full max-w-sm mx-auto z-10">
        {isFailed ? (
          <div className="flex flex-col items-center gap-4">
            {/* A denied camera/mic permission has no in-call retry path -- unlike a dropped
                connection, hanging up again changes nothing until the OS permission itself is
                granted. Mirrors the existing openLocationSettings/openPermissionSettings pattern
                (DiscoverScreen.tsx/SocialMapScreen.tsx) instead of leaving the user with only a
                hangup button and a message telling them what's wrong but not how to fix it. */}
            {activeCall.error === 'PERMISSION_DENIED' && (
              <AppButton
                variant="secondary"
                size="md"
                onClick={() => void nativeAppSettings.open()}
              >
                {t('callOpenSettingsAction')}
              </AppButton>
            )}
            <IconButton
              aria-label={t('closeAriaLabel')}
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
              aria-label={t('callDeclineAriaLabel')}
              variant="surface"
              size="lg"
              className="w-16 h-16 bg-[#FF4B55] text-white border-0 shadow-elevated shadow-red-500/30"
              onClick={handleReject}
            >
              <PhoneOff className="w-8 h-8" />
            </IconButton>

            {isIncoming && (
              <IconButton
                aria-label={t('callAcceptAriaLabel')}
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
          <div className="flex items-center justify-around bg-surface-90 backdrop-blur-xl border border-app rounded-3xl p-4 shadow-floating">
            <IconButton
              aria-label={isMuted ? t('callUnmuteAriaLabel') : t('callMuteAriaLabel')}
              variant={isMuted ? 'gradient' : 'surface'}
              size="md"
              onClick={toggleMute}
            >
              {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </IconButton>

            {!isVideoCall && nativeCallAudio.isSupported() && (
              <IconButton
                aria-label={isSpeakerOn ? t('callSpeakerOffAriaLabel') : t('callSpeakerOnAriaLabel')}
                variant={isSpeakerOn ? 'gradient' : 'surface'}
                size="md"
                onClick={toggleSpeaker}
              >
                {isSpeakerOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
              </IconButton>
            )}

            {!isVideoCall && activeCall.status === 'ACTIVE' && (
              <IconButton
                aria-label={t('callSwitchToVideoAriaLabel')}
                variant="surface"
                size="md"
                disabled={isRequestingVideo}
                onClick={handleRequestVideo}
              >
                <Video className="w-5 h-5" />
              </IconButton>
            )}

            <IconButton
              aria-label={t('callEndCallAriaLabel')}
              variant="surface"
              size="lg"
              className="bg-[#FF4B55] text-white border-0 shadow-elevated shadow-red-500/30"
              onClick={handleHangup}
            >
              <PhoneOff className="w-7 h-7" />
            </IconButton>

            {isVideoCall && (
              <IconButton
                aria-label={isVideoOff ? t('callCameraOnAriaLabel') : t('callCameraOffAriaLabel')}
                variant={isVideoOff ? 'gradient' : 'surface'}
                size="md"
                onClick={toggleVideo}
              >
                {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
              </IconButton>
            )}

            {isVideoCall && !isVideoOff && canSwitchCamera && (
              <IconButton
                aria-label={t('callSwitchCameraAriaLabel')}
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
