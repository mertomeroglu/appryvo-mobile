import React, { useCallback, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, RotateCcw, X } from 'lucide-react';
import { IconButton } from './IconButton';
import { AppButton } from './AppButton';

interface PhotoCropScreenProps {
  imageSrc: string;
  /** width / height, e.g. 3/4 for a portrait profile photo */
  aspect?: number;
  onConfirm: (blob: Blob) => void;
  onUseOriginal?: () => void;
  onCancel: () => void;
}

const MAX_ZOOM = 4;
const OUTPUT_WIDTH = 1080;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function distance(a: Touch | PointerEvent, b: Touch | PointerEvent) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

/**
 * Immediate post-pick photo adjustment screen — crop/zoom/pan a portrait frame.
 * No native cropper dependency: image is transformed with CSS translate/scale
 * while dragging/pinching, then the visible frame region is rasterized to a
 * canvas at export time (see computeCrop below).
 */
export const PhotoCropScreen: React.FC<PhotoCropScreenProps> = ({
  imageSrc,
  aspect = 3 / 4,
  onConfirm,
  onUseOriginal,
  onCancel,
}) => {
  const frameRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const naturalSize = useRef({ w: 0, h: 0 });
  const baseScale = useRef(1);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [ready, setReady] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const pointers = useRef(new Map<number, PointerEvent>());
  const pinchStart = useRef<{ dist: number; zoom: number } | null>(null);
  const panStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const clampPan = useCallback((nextZoom: number, nextPan: { x: number; y: number }) => {
    const frame = frameRef.current;
    if (!frame) return nextPan;
    const fw = frame.clientWidth;
    const fh = frame.clientHeight;
    const iw = naturalSize.current.w * baseScale.current * nextZoom;
    const ih = naturalSize.current.h * baseScale.current * nextZoom;
    const slackX = Math.max(0, (iw - fw) / 2);
    const slackY = Math.max(0, (ih - fh) / 2);
    return {
      x: clamp(nextPan.x, -slackX, slackX),
      y: clamp(nextPan.y, -slackY, slackY),
    };
  }, []);

  const handleImageLoad = () => {
    const img = imgRef.current;
    const frame = frameRef.current;
    if (!img || !frame) return;
    naturalSize.current = { w: img.naturalWidth, h: img.naturalHeight };
    const fw = frame.clientWidth;
    const fh = frame.clientHeight;
    baseScale.current = Math.max(fw / img.naturalWidth, fh / img.naturalHeight);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setReady(true);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, e.nativeEvent);
    if (pointers.current.size === 1) {
      panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    } else if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      pinchStart.current = { dist: distance(a, b), zoom };
      panStart.current = null;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, e.nativeEvent);

    if (pointers.current.size === 2 && pinchStart.current) {
      const [a, b] = Array.from(pointers.current.values());
      const ratio = distance(a, b) / pinchStart.current.dist;
      const nextZoom = clamp(pinchStart.current.zoom * ratio, 1, MAX_ZOOM);
      setZoom(nextZoom);
      setPan((prev) => clampPan(nextZoom, prev));
    } else if (pointers.current.size === 1 && panStart.current) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setPan(clampPan(zoom, { x: panStart.current.panX + dx, y: panStart.current.panY + dy }));
    }
  };

  const endPointer = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 1) {
      const [remaining] = Array.from(pointers.current.values());
      panStart.current = { x: remaining.clientX, y: remaining.clientY, panX: pan.x, panY: pan.y };
    } else {
      panStart.current = null;
    }
  };

  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleConfirm = async () => {
    const img = imgRef.current;
    const frame = frameRef.current;
    if (!img || !frame || isExporting) return;
    setIsExporting(true);
    try {
      const fw = frame.clientWidth;
      const fh = frame.clientHeight;
      const scaleFactor = baseScale.current * zoom;
      const iw = naturalSize.current.w * scaleFactor;
      const ih = naturalSize.current.h * scaleFactor;

      const cropXNat = ((iw - fw) / 2 - pan.x) / scaleFactor;
      const cropYNat = ((ih - fh) / 2 - pan.y) / scaleFactor;
      const cropWNat = fw / scaleFactor;
      const cropHNat = fh / scaleFactor;

      const outputHeight = Math.round(OUTPUT_WIDTH / aspect);
      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT_WIDTH;
      canvas.height = outputHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context unavailable');
      ctx.drawImage(img, cropXNat, cropYNat, cropWNat, cropHNat, 0, 0, OUTPUT_WIDTH, outputHeight);

      canvas.toBlob(
        (blob) => {
          setIsExporting(false);
          if (blob) onConfirm(blob);
        },
        'image/jpeg',
        0.9
      );
    } catch {
      setIsExporting(false);
    }
  };

  const transform = `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;

  return (
    <div className="fixed inset-0 z-modal bg-black flex flex-col select-none">
      <header className="pt-safe px-5 h-16 flex items-center justify-between z-sticky">
        <IconButton aria-label="Vazgeç" variant="surface" size="md" onClick={onCancel}>
          <X className="w-5 h-5" />
        </IconButton>
        <span className="text-caption font-bold text-white normal-case">Fotoğrafı Ayarla</span>
        <IconButton aria-label="Sıfırla" variant="surface" size="md" onClick={handleReset}>
          <RotateCcw className="w-4 h-4" />
        </IconButton>
      </header>

      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        <div
          ref={frameRef}
          className="relative overflow-hidden rounded-3xl touch-none"
          style={{ width: 'min(86vw, 420px)', aspectRatio: `${aspect}` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
        >
          <img
            ref={imgRef}
            src={imageSrc}
            alt="Kırpılacak fotoğraf"
            onLoad={handleImageLoad}
            draggable={false}
            className="absolute left-1/2 top-1/2 max-w-none pointer-events-none"
            style={{
              width: naturalSize.current.w ? naturalSize.current.w * baseScale.current : 'auto',
              opacity: ready ? 1 : 0,
              transform,
            }}
          />
          <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/40 rounded-3xl" />
        </div>
      </div>

      <div className="px-6 pb-2 space-y-3 text-center">
        <p className="text-caption font-semibold text-white/60 normal-case">
          Yakınlaştırmak için sıkıştır, konumlandırmak için sürükle
        </p>
        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.05}
          value={zoom}
          aria-label="Fotoğraf yakınlaştırma"
          onChange={(event) => {
            const nextZoom = Number(event.target.value);
            setZoom(nextZoom);
            setPan((current) => clampPan(nextZoom, current));
          }}
          className="w-full max-w-sm accent-pink-500"
        />
      </div>

      <div className="px-6 pb-safe pt-2 grid grid-cols-2 gap-3">
        {onUseOriginal && (
          <AppButton variant="secondary" size="lg" onClick={onUseOriginal} className="min-w-0 px-3">
            Orijinali Kullan
          </AppButton>
        )}
        <motion.div className={onUseOriginal ? '' : 'col-span-2'} whileTap={{ scale: 0.97 }}>
          <AppButton
            variant="primary"
            size="lg"
            fullWidth
            loading={isExporting}
            disabled={!ready}
            leftIcon={<Check className="w-5 h-5" />}
            onClick={handleConfirm}
          >
            Kırpmayı Uygula
          </AppButton>
        </motion.div>
      </div>
    </div>
  );
};
