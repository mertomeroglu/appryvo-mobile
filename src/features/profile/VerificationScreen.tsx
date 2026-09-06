import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RotateCcw, RotateCw, ShieldCheck } from 'lucide-react';
import type { FaceLandmarker } from '@mediapipe/tasks-vision';
import { apiClient } from '../../services/api/apiClient';
import { mediaService } from '../../services/media/mediaService';
import { useAuthStore } from '../../stores/useAuthStore';
import { toast } from '../../stores/useToastStore';
import { nativeHaptics } from '../../native/haptics';
import { AppButton } from '../../components/ui/AppButton';
import { IconButton } from '../../components/ui/IconButton';
import { AppLogo } from '../../components/ui/AppLogo';
import { useAppTranslation, translateSync, VERIFICATION_GUIDANCE_LABELS } from '../../i18n/appLocale';
import { createFaceLandmarker, expectedYawDirection, FACE_LIVENESS_CONFIG, measureFace, smoothYaw, type ActiveChallenge, type FaceGuidance } from '../../services/verification/faceLiveness';

type Stage = 'CENTER_BASELINE' | ActiveChallenge | 'FINAL';
type Phase = 'intro' | 'camera' | 'submitting';
interface Shot { blob: Blob; capturedAt: number; clientYaw: number }
interface Burst { challenge: ActiveChallenge; images: Shot[] }
const MAX_EDGE = 1280;

async function uploadAndSubmit(sessionId: string, baseline: Shot, bursts: Burst[], finalShot: Shot) {
  const shots = [baseline, ...bursts.flatMap((burst) => burst.images), finalShot];
  const uploads = await Promise.all(shots.map((shot) => mediaService.uploadMedia(shot.blob, 'verification')));
  const urls = uploads.map((upload) => upload?.data?.url as string | undefined);
  if (urls.some((url) => !url)) throw new Error(translateSync('verificationImagesUploadFailedError'));
  let cursor = 1;
  const frames = bursts.map((burst) => ({
    challenge: burst.challenge,
    images: burst.images.map((shot) => ({ imageUrl: urls[cursor++], capturedAt: shot.capturedAt, clientYaw: shot.clientYaw })),
  }));
  return apiClient.post('/api/verification/submit', { sessionId, baselineUrl: urls[0], selfieUrl: urls.at(-1), frames }, { timeoutMs: 120000 }) as Promise<any>;
}

export const VerificationScreen: React.FC = () => {
  const navigate = useNavigate();
  const { locale, t } = useAppTranslation();
  const user = useAuthStore((state) => state.user);
  const blocked = user?.verified === true || user?.verificationState === 'APPROVED' || user?.verificationState === 'PENDING';
  const [phase, setPhase] = useState<Phase>('intro');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [stages, setStages] = useState<Stage[]>([]);
  const [stageIndex, setStageIndex] = useState(0);
  const [guidance, setGuidance] = useState<FaceGuidance>('NO_FACE');
  const [cameraReady, setCameraReady] = useState(false);
  const [flash, setFlash] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const rafRef = useRef(0);
  const inferBusyRef = useRef(false);
  const lastInferenceRef = useRef(0);
  const yawsRef = useRef<number[]>([]);
  const neutralYawRef = useRef(0);
  const stableSinceRef = useRef<number | null>(null);
  const baselineRef = useRef<Shot | null>(null);
  const burstsRef = useRef<Burst[]>([]);
  const activeBurstRef = useRef<Shot[]>([]);
  const currentStage = stages[stageIndex];
  const currentStageRef = useRef<Stage | undefined>(currentStage);
  currentStageRef.current = currentStage;

  useEffect(() => {
    if (!blocked) return;
    toast.show(t(user?.verified ? 'verificationAlreadyVerifiedToast' : 'verificationPendingReviewToast'));
    navigate('/profile', { replace: true });
  }, [blocked, navigate, t, user?.verified]);

  const stop = () => {
    cancelAnimationFrame(rafRef.current);
    landmarkerRef.current?.close(); landmarkerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null;
  };

  const grab = async (clientYaw: number): Promise<Shot | null> => {
    const video = videoRef.current; const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) return null;
    const scale = Math.min(1, MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext('2d'); if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.84));
    return blob ? { blob, capturedAt: Date.now(), clientYaw } : null;
  };

  const completeStage = async (yaw: number) => {
    const stage = currentStageRef.current;
    if (!stage) return;
    setFlash(true);
    try {
      const shot = await grab(yaw); if (!shot) throw new Error(t('verificationPhotoCaptureFailedError'));
      nativeHaptics.impact();
      if (stage === 'CENTER_BASELINE') { baselineRef.current = shot; neutralYawRef.current = yaw; }
      else if (stage === 'FINAL') {
        stop(); setPhase('submitting'); setBusy(true);
        if (!baselineRef.current || burstsRef.current.length !== 2) throw new Error(t('verificationFramesMissingError'));
        const response = await uploadAndSubmit(sessionId, baselineRef.current, burstsRef.current, shot);
        await useAuthStore.getState().fetchMe();
        response?.verified ? toast.success(response.message || t('verificationSuccessToast')) : toast.show(response?.message || t('verificationSubmittedPendingToast'));
        navigate('/profile', { replace: true }); return;
      } else { activeBurstRef.current.push(shot); burstsRef.current.push({ challenge: stage, images: activeBurstRef.current }); activeBurstRef.current = []; }
      yawsRef.current = []; stableSinceRef.current = null; setStageIndex((index) => index + 1);
    } catch (reason: any) { setError(reason?.message || t('verificationSubmitFailedError')); if (stage === 'FINAL') setPhase('intro'); }
    finally { setFlash(false); setBusy(false); }
  };

  useEffect(() => {
    if (phase !== 'camera') return;
    let cancelled = false;
    const loop = async (now: number) => {
      rafRef.current = requestAnimationFrame(loop);
      if (cancelled || inferBusyRef.current || now - lastInferenceRef.current < FACE_LIVENESS_CONFIG.inferenceIntervalMs) return;
      const video = videoRef.current; const landmarker = landmarkerRef.current;
      if (!video || !landmarker || video.readyState < 2) return;
      inferBusyRef.current = true; lastInferenceRef.current = now;
      try {
        const stage = currentStageRef.current;
        if (!stage) return;
        const started = performance.now();
        const measured = measureFace(landmarker.detectForVideo(video, now).faceLandmarks); setGuidance(measured.guidance);
        if (import.meta.env.DEV) console.debug(`[VERIFY][MediaPipe] inferenceMs=${(performance.now() - started).toFixed(1)}`);
        // One imperfect/jitter frame must not erase an otherwise stable turn. The median yaw
        // window plus the directed-threshold hysteresis below owns reset behavior.
        if (measured.guidance !== 'READY') return;
        yawsRef.current.push(measured.yaw); const yaw = smoothYaw(yawsRef.current); const delta = yaw - neutralYawRef.current;
        const centered = Math.abs(stage === 'CENTER_BASELINE' ? yaw : delta) <= FACE_LIVENESS_CONFIG.centerYaw;
        if (stage === 'CENTER_BASELINE' || stage === 'FINAL') {
          stableSinceRef.current = centered ? (stableSinceRef.current ?? now) : null;
          if (stableSinceRef.current && now - stableSinceRef.current >= FACE_LIVENESS_CONFIG.stableMs) await completeStage(yaw);
        } else {
          const directed = delta * expectedYawDirection(stage);
          if (!activeBurstRef.current.length && centered) { const shot = await grab(yaw); if (shot) activeBurstRef.current.push(shot); }
          if (directed >= FACE_LIVENESS_CONFIG.turnStartYaw) {
            stableSinceRef.current ??= now;
            if (activeBurstRef.current.length === 1) { const shot = await grab(yaw); if (shot) activeBurstRef.current.push(shot); }
          } else if (directed < FACE_LIVENESS_CONFIG.turnStartYaw - 0.05) {
            stableSinceRef.current = null;
          }
          // completeStage captures the third audit frame after a single robust 250ms turn hold.
          if (activeBurstRef.current.length >= 2 && stableSinceRef.current && now - stableSinceRef.current >= FACE_LIVENESS_CONFIG.stableMs) await completeStage(yaw);
        }
      } catch (reason) { console.warn('[VERIFY][MediaPipe] inference failed', reason); }
      finally { inferBusyRef.current = false; }
    };
    Promise.all([navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false }), createFaceLandmarker()])
      .then(([stream, landmarker]) => {
        if (cancelled) { stream.getTracks().forEach((track) => track.stop()); landmarker.close(); return; }
        streamRef.current = stream; landmarkerRef.current = landmarker;
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.onloadedmetadata = () => { setCameraReady(true); rafRef.current = requestAnimationFrame(loop); }; }
      }).catch((reason) => { console.warn('[VERIFY] camera initialization failed', reason); if (!cancelled) setError(t('verificationCameraAccessError')); });
    return () => { cancelled = true; stop(); };
    // completeStage reads the current stage through currentStageRef so the camera/landmarker
    // remain alive across challenge transitions instead of restarting between movements.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const start = async () => {
    setBusy(true); setError('');
    try {
      const response: any = await apiClient.post('/api/verification/session'); const data = response?.data || {};
      if (data.verified === true || data.pending === true) {
        await useAuthStore.getState().fetchMe();
        toast.show(response?.message || t(data.verified ? 'verificationAlreadyVerifiedToast' : 'verificationPendingReviewToast'));
        navigate('/profile', { replace: true });
        return;
      }
      const turns = Array.isArray(data.challenges) ? data.challenges.filter((value: string) => value === 'TURN_LEFT' || value === 'TURN_RIGHT') : [];
      if (!data.sessionId || turns.length !== 2) throw new Error(t('verificationSessionInvalidError'));
      setSessionId(data.sessionId); setStages(['CENTER_BASELINE', ...turns, 'FINAL']); setStageIndex(0);
      baselineRef.current = null; burstsRef.current = []; activeBurstRef.current = []; setPhase('camera');
    } catch (reason: any) { setError(reason?.message || t('verificationSessionStartFailedError')); }
    finally { setBusy(false); }
  };

  if (blocked) return null;
  const title = currentStage === 'TURN_LEFT' ? t('verificationStepTitleTurnLeft') : currentStage === 'TURN_RIGHT' ? t('verificationStepTitleTurnRight') : currentStage === 'FINAL' ? t('verificationStepTitleFinal') : t('verificationStepTitleCenter');
  const hint = guidance === 'READY' && currentStage === 'TURN_LEFT' ? t('verificationStepHintTurnLeft') : guidance === 'READY' && currentStage === 'TURN_RIGHT' ? t('verificationStepHintTurnRight') : VERIFICATION_GUIDANCE_LABELS[locale][guidance];
  return <div className="flex flex-col h-full w-full bg-app text-app select-none">
    {phase !== 'camera' && <header className="pt-safe px-4 min-h-[calc(4rem+var(--safe-top))] flex items-center gap-3 border-b border-app bg-surface-80"><IconButton aria-label={t('backButtonLabel')} variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></IconButton><AppLogo variant="icon" size="sm" /><h2 className="text-heading">{t('verificationScreenTitle')}</h2></header>}
    {phase === 'intro' && <main className="flex-1 grid place-items-center p-6 text-center"><div className="max-w-sm">{error && <p className="mb-4 p-3 rounded-2xl bg-red-500/10 text-red-500">{error}</p>}<ShieldCheck className="w-16 h-16 mx-auto text-pink-500 mb-5" /><h3 className="text-title mb-2">{t('verificationIntroTitle')}</h3><p className="text-app-muted mb-6">{t('verificationIntroDescription')}</p><AppButton variant="primary" size="lg" loading={busy} onClick={start}>{t('verificationStartButtonLabel')}</AppButton></div></main>}
    {phase === 'submitting' && <main className="flex-1 grid place-items-center text-center"><div><div className="h-10 w-10 mx-auto animate-spin rounded-full border-4 border-pink-500/30 border-t-pink-500 mb-5" /><h3 className="text-title">{t('verificationProcessingTitle')}</h3><p className="text-app-muted">{t('verificationProcessingDescription')}</p></div></main>}
    {phase === 'camera' && currentStage && <main className="relative flex-1 bg-black overflow-hidden"><video ref={videoRef} autoPlay muted playsInline className="absolute inset-0 w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} /><canvas ref={canvasRef} className="hidden" />{!cameraReady && <div className="absolute inset-0 z-30 bg-black grid place-items-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-white/30 border-t-white" /></div>}<div className="absolute inset-0 grid place-items-center pointer-events-none"><div className={`w-64 h-80 rounded-[50%] border-4 ${guidance === 'READY' ? 'border-emerald-400' : 'border-white/70'} shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]`} /></div><div className="absolute top-0 inset-x-0 pt-safe px-4 z-10 flex justify-between"><IconButton aria-label={t('discardAriaLabel')} variant="overlay" size="md" onClick={() => setPhase('intro')}><ArrowLeft /></IconButton><span className="text-white font-bold">{stageIndex + 1} / {stages.length}</span><div className="w-11" /></div>{flash && <div className="absolute inset-0 bg-white/70 z-20" />}<div className="absolute bottom-0 inset-x-0 pb-safe px-6 pt-16 z-10 bg-gradient-to-t from-black/90 to-transparent text-center text-white"><div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-white/15">{currentStage === 'TURN_LEFT' ? <RotateCcw /> : currentStage === 'TURN_RIGHT' ? <RotateCw /> : <ShieldCheck />}</div><h3 className="text-heading mb-2">{title}</h3><p className="text-caption text-white/75">{hint}</p>{error && <p className="mt-3 text-red-300">{error}</p>}</div></main>}
  </div>;
};
