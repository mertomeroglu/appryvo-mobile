import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Eye, RotateCcw, RotateCw, Smile, ShieldCheck, Circle } from 'lucide-react';
import { apiClient } from '../../services/api/apiClient';
import { mediaService } from '../../services/media/mediaService';
import { useAuthStore } from '../../stores/useAuthStore';
import { toast } from '../../stores/useToastStore';
import { nativeHaptics } from '../../native/haptics';
import { AppButton } from '../../components/ui/AppButton';
import { IconButton } from '../../components/ui/IconButton';
import { AppLogo } from '../../components/ui/AppLogo';

// Codes match the server-issued temporal sequence. FINAL is captured last and becomes the
// retained face-match reference; every earlier frame is a required liveness transition.
type ChallengeCode = 'CENTER' | 'TURN_LEFT' | 'CENTER_RETURN' | 'TURN_RIGHT' | 'BLINK' | 'SMILE';
type CaptureStepId = ChallengeCode | 'FINAL';

// BLINK is checked backend-side as "eyes measurably closed vs. the neutral open-eye frame" --
// a still photo can't capture the *act* of blinking, only a closed-eye state, so the instruction
// asks for that directly (close your eyes, hold, then shoot) rather than "blink" mid-shutter,
// which was confusing users into wondering what a still photo of a blink is even supposed to be.
const STEP_TITLE: Record<CaptureStepId, string> = {
  CENTER: 'Yüzünü Ortala',
  CENTER_RETURN: 'Tekrar Ortaya Bak',
  FINAL: 'Son Çekim',
  BLINK: 'Gözlerini Kapat',
  TURN_LEFT: 'Başını Sola Çevir',
  TURN_RIGHT: 'Başını Sağa Çevir',
  SMILE: 'Gülümse',
};

const STEP_HINT: Record<CaptureStepId, string> = {
  CENTER: 'Yüzünü çerçevenin içine yerleştir ve doğrudan kameraya bak.',
  CENTER_RETURN: 'Başını tekrar ortaya getir ve doğrudan kameraya bak.',
  FINAL: 'Doğrudan kameraya bak. Bu son görüntü doğrulama referansın olacak.',
  BLINK: 'Gözlerini kapat, o şekilde sabit dur ve çek.',
  TURN_LEFT: 'Başını sola çevir, o pozisyonda dur ve çek.',
  TURN_RIGHT: 'Başını sağa çevir, o pozisyonda dur ve çek.',
  SMILE: 'Kameraya bakarak gülümse ve çek.',
};

const STEP_ICON: Record<CaptureStepId, React.ReactNode> = {
  CENTER: <Circle className="w-7 h-7" />,
  CENTER_RETURN: <Circle className="w-7 h-7" />,
  FINAL: <ShieldCheck className="w-7 h-7" />,
  BLINK: <Eye className="w-7 h-7" />,
  TURN_LEFT: <RotateCcw className="w-7 h-7" />,
  TURN_RIGHT: <RotateCw className="w-7 h-7" />,
  SMILE: <Smile className="w-7 h-7" />,
};

type Phase = 'intro' | 'camera' | 'submitting';

interface CapturedFrame {
  step: CaptureStepId;
  blob: Blob;
}

const MAX_CAPTURE_EDGE = 1280;
const CAMERA_READY_TIMEOUT_MS = 15000;

async function submitVerification(sessionId: string, allFrames: CapturedFrame[]) {
  const finalFrame = allFrames.find((frame) => frame.step === 'FINAL');
  const challengeFrames = allFrames.filter((frame) => frame.step !== 'FINAL');
  if (!finalFrame || challengeFrames.length === 0) throw new Error('Doğrulama çekimleri eksik.');

  // Verification captures are private media. Upload them in parallel so the liveness
  // session does not expire while a slow connection serially sends every frame.
  const [finalUpload, ...uploadedFrames] = await Promise.all([
    mediaService.uploadMedia(finalFrame.blob, 'verification'),
    ...challengeFrames.map((frame) => mediaService.uploadMedia(frame.blob, 'verification')),
  ]);
  const selfieUrl = finalUpload?.data?.url;
  const frames = challengeFrames.map((frame, index) => ({
    challenge: frame.step as ChallengeCode,
    imageUrl: uploadedFrames[index]?.data?.url,
  }));

  if (!selfieUrl || frames.some((frame) => !frame.imageUrl)) {
    throw new Error('Doğrulama görselleri yüklenemedi.');
  }

  return await apiClient.post(
    '/api/verification/submit',
    { sessionId, selfieUrl, frames },
    { timeoutMs: 90000 }
  ) as any;
}

export const VerificationScreen: React.FC = () => {
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>('intro');
  const [errorMsg, setErrorMsg] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [steps, setSteps] = useState<CaptureStepId[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const framesRef = useRef<CapturedFrame[]>([]);

  const currentStep = steps[stepIndex];

  // Camera lifecycle: acquire only while actively on the capture phase, always release on
  // phase change or unmount. Plain getUserMedia (front camera) -- the WebView here already
  // grants camera access for WebRTC calls (see webrtcService.ts), so no native plugin needed.
  useEffect(() => {
    if (phase !== 'camera') return;
    let cancelled = false;
    let cameraTimedOut = false;
    setErrorMsg('');
    setIsCameraReady(false);

    const readyTimer = window.setTimeout(() => {
      cameraTimedOut = true;
      if (!cancelled) setErrorMsg('Kamera zamanında açılamadı. Kamerayı kullanan başka bir uygulamayı kapatıp tekrar dene.');
    }, CAMERA_READY_TIMEOUT_MS);

    // Deliberately no width/height "ideal" constraints: on several Android camera HALs,
    // requesting a specific ideal resolution that doesn't match a native sensor mode makes
    // Chrome fall back to a heavily cropped/digitally-zoomed feed instead of downscaling --
    // confirmed on-device (the preview filled the screen with skin at point-blank range even
    // held at a normal arm's-length selfie distance). Letting the browser pick its own default
    // preview size avoids that crop entirely.
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then((stream) => {
        if (cancelled || cameraTimedOut) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        window.clearTimeout(readyTimer);
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          // Covered by an opaque loading layer (see isCameraReady) until this actually fires --
          // otherwise there's a gap between the <video> mounting and the stream attaching where
          // the WebView briefly renders its own native play-button/poster chrome for the still-
          // sourceless element, which read as a confusing flash of an unrelated "play video" UI.
          videoRef.current.onloadedmetadata = () => setIsCameraReady(true);
        }
      })
      .catch(() => {
        window.clearTimeout(readyTimer);
        if (!cancelled) setErrorMsg('Kameraya erişilemedi. Kamera izni verildiğinden emin ol.');
      });

    return () => {
      cancelled = true;
      window.clearTimeout(readyTimer);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [phase]);

  const startVerification = async () => {
    setErrorMsg('');
    setIsBusy(true);
    try {
      const res: any = await apiClient.post('/api/verification/session');
      const data = res?.data || {};
      if (data.verified === true) {
        await useAuthStore.getState().fetchMe();
        toast.show(res?.message || 'Profilin zaten doğrulandı.');
        navigate('/profile', { replace: true });
        return;
      }
      if (data.pending === true) {
        await useAuthStore.getState().fetchMe();
        toast.show(res?.message || 'Doğrulaman inceleniyor.');
        navigate('/profile', { replace: true });
        return;
      }
      const challenges: ChallengeCode[] = Array.isArray(data.challenges) ? data.challenges : [];
      if (!data.sessionId || challenges.length === 0) {
        throw new Error('Doğrulama oturumu geçersiz. Lütfen tekrar dene.');
      }
      setSessionId(data.sessionId);
      setSteps([...challenges, 'FINAL']);
      setStepIndex(0);
      framesRef.current = [];
      setPhase('camera');
    } catch (err: any) {
      setErrorMsg(err.message || 'Doğrulama oturumu başlatılamadı.');
    } finally {
      setIsBusy(false);
    }
  };

  const grabFrame = (): Promise<Blob | null> =>
    new Promise((resolve) => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.videoWidth === 0) {
        resolve(null);
        return;
      }
      // WebView video pixels are already orientation-normalized and canvas output carries no
      // EXIF orientation. Downscale without cropping so three captures stay small enough for a
      // weak mobile uplink while preserving the complete face and both head-turn directions.
      const scale = Math.min(1, MAX_CAPTURE_EDGE / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.84);
    });

  // No countdown: the user performs the gesture (or is already holding it) and taps Çek when
  // ready, capturing immediately -- a countdown-before-capture felt slow and ceremonial in
  // testing; this reads closer to a normal camera shutter.
  const performCapture = async () => {
    if (isCapturing) return;
    setIsCapturing(true);
    nativeHaptics.impact();
    const blob = await grabFrame();

    if (!blob) {
      setIsCapturing(false);
      setErrorMsg('Fotoğraf yakalanamadı. Tekrar dene.');
      return;
    }

    const nextFrames = [...framesRef.current, { step: currentStep, blob }];
    framesRef.current = nextFrames;

    if (stepIndex + 1 >= steps.length) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setIsCapturing(false);
      setPhase('submitting');
      setIsBusy(true);
      try {
        if (!sessionId) throw new Error('Doğrulama oturumu bulunamadı.');
        const response = await submitVerification(sessionId, nextFrames);
        await useAuthStore.getState().fetchMe();
        if (response?.verified === true) {
          toast.success(response?.message || 'Doğrulandın! 🎉');
          navigate('/profile', { replace: true });
          return;
        }
        if (response?.status === 'pending') {
          toast.show(response?.message || 'Doğrulaman incelemeye alındı.');
          navigate('/profile', { replace: true });
          return;
        }
        setErrorMsg(response?.message || 'Doğrulama tamamlanamadı. Lütfen tekrar dene.');
        setPhase('intro');
      } catch (err: any) {
        setErrorMsg(err.message || 'Doğrulama gönderilemedi. Lütfen tekrar dene.');
        setPhase('intro');
      } finally {
        setIsBusy(false);
      }
      return;
    }

    // Brief settle so the flash is visible before the next step's instructions swap in.
    setTimeout(() => {
      setIsCapturing(false);
      setStepIndex((i) => i + 1);
    }, 260);
  };

  const handleExitCamera = () => {
    setPhase('intro');
  };

  return (
    <div className="flex flex-col h-full w-full bg-app text-app select-none">
      {phase !== 'camera' && (
        <header className="pt-safe px-4 h-16 flex items-center gap-3 border-b border-app bg-surface/80 backdrop-blur-md z-sticky">
          <IconButton aria-label="Geri" variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </IconButton>
          <AppLogo variant="icon" size="sm" />
          <h2 className="text-heading text-app">Kimlik Doğrulama</h2>
        </header>
      )}

      {phase === 'intro' && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          {errorMsg && (
            <div className="mb-4 w-full max-w-sm p-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-500 text-caption font-bold text-center">
              {errorMsg}
            </div>
          )}
          <div className="max-w-sm space-y-6">
            <div className="w-20 h-20 rounded-full bg-brand-gradient mx-auto flex items-center justify-center shadow-elevated">
              <ShieldCheck className="w-9 h-9 text-white" />
            </div>
            <div>
              <h3 className="text-title text-app mb-2">Profilini Doğrula</h3>
              <p className="text-body text-app-muted">
                Kamera açılacak ve seni birkaç kısa hareket yaparken çekecek. Bu, hesabının
                gerçek ve canlı bir kişiye ait olduğunu kanıtlar. Çekimlerden sonra sonucu
                güvenli şekilde işleyip profil durumuna yansıtacağız.
              </p>
            </div>
            <AppButton variant="primary" size="lg" fullWidth loading={isBusy} onClick={startVerification}>
              Başla
            </AppButton>
          </div>
        </div>
      )}

      {phase === 'submitting' && (
        <div className="flex flex-1 flex-col items-center justify-center p-6 text-center" aria-live="polite">
          <div className="max-w-sm space-y-5">
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-brand-gradient shadow-elevated">
              <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-white/35 border-t-white" />
            </div>
            <div>
              <h3 className="mb-2 text-title text-app">Doğrulama İşleniyor</h3>
              <p className="text-body text-app-muted">Görsellerin güvenli şekilde yükleniyor ve yüz eşleşmesi kontrol ediliyor. Bu ekranı açık tut.</p>
            </div>
          </div>
        </div>
      )}

      {phase === 'camera' && currentStep && (
        <div className="relative flex-1 w-full h-full bg-black overflow-hidden">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' }}
          />
          <canvas ref={canvasRef} className="hidden" />

          {/* Opaque cover until the stream actually attaches -- masks the brief window where
              the WebView renders its own native chrome for a still-sourceless <video> element. */}
          <AnimatePresence>
            {!isCameraReady && (
              <motion.div
                initial={{ opacity: 1 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 z-30 bg-black flex items-center justify-center"
              >
                <div className="w-8 h-8 border-[3px] border-t-white border-r-white/40 border-b-white/40 border-l-white/40 rounded-full animate-spin" />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Face guide oval */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-64 h-80 rounded-[50%] border-4 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
          </div>

          {/* Top: exit + step progress */}
          <div className="absolute top-0 inset-x-0 pt-safe px-4 z-10">
            <div className="h-14 flex items-center justify-between">
              <IconButton aria-label="Vazgeç" variant="overlay" size="md" onClick={handleExitCamera}>
                <ArrowLeft className="w-5 h-5" />
              </IconButton>
              <span className="text-caption font-bold text-white/90">
                {stepIndex + 1} / {steps.length}
              </span>
              <div className="w-11" />
            </div>
            <div className="flex gap-1.5 px-1">
              {steps.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 flex-1 rounded-full ${i <= stepIndex ? 'bg-brand-gradient' : 'bg-white/25'}`}
                />
              ))}
            </div>
          </div>

          {/* Capture flash */}
          <AnimatePresence>
            {isCapturing && (
              <motion.div
                initial={{ opacity: 0.9 }}
                animate={{ opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="absolute inset-0 bg-white z-20 pointer-events-none"
              />
            )}
          </AnimatePresence>

          {/* Bottom: instruction + capture button */}
          <div className="absolute bottom-0 inset-x-0 pb-safe px-6 pt-10 z-10 bg-gradient-to-t from-black/80 to-transparent">
            {errorMsg && (
              <div className="mb-3 p-3 rounded-2xl bg-red-500/20 border border-red-500/40 text-red-200 text-caption font-bold text-center">
                {errorMsg}
              </div>
            )}
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="text-center mb-5"
              >
                <div className="w-12 h-12 rounded-full bg-white/15 backdrop-blur-md mx-auto mb-2 flex items-center justify-center text-white">
                  {STEP_ICON[currentStep]}
                </div>
                <h3 className="text-heading text-white mb-1">{STEP_TITLE[currentStep]}</h3>
                <p className="text-caption text-white/70 max-w-xs mx-auto">{STEP_HINT[currentStep]}</p>
              </motion.div>
            </AnimatePresence>

            <AppButton
              variant="primary"
              size="lg"
              fullWidth
              disabled={isCapturing}
              onClick={performCapture}
              className="mb-6"
            >
              Çek
            </AppButton>
          </div>
        </div>
      )}
    </div>
  );
};
