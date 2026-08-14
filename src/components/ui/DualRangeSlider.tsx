import React from 'react';

export interface DualRangeSliderProps {
  min: number;
  max: number;
  valueMin: number;
  valueMax: number;
  step?: number;
  onChange: (valueMin: number, valueMax: number) => void;
  formatValue?: (value: number) => string;
}

/**
 * Two independently draggable handles on one track. Built from two native <input type="range">
 * elements sharing the same bounds (see .dual-range-input in globals.css for the pointer-events
 * trick that keeps only each thumb clickable) rather than a synthetic pointer-tracking
 * implementation, so it keeps native accessibility/keyboard behavior for free.
 */
export const DualRangeSlider: React.FC<DualRangeSliderProps> = ({
  min,
  max,
  valueMin,
  valueMax,
  step = 1,
  onChange,
  formatValue = (v) => String(v),
}) => {
  const midpoint = (min + max) / 2;
  const rangeStartPct = ((valueMin - min) / (max - min)) * 100;
  const rangeEndPct = ((valueMax - min) / (max - min)) * 100;

  return (
    <div className="w-full">
      <div className="flex justify-between text-caption font-semibold mb-2">
        <span className="text-app-muted">Yaş Aralığı</span>
        <span className="text-pink-500 font-bold">
          {formatValue(valueMin)} – {formatValue(valueMax)}
        </span>
      </div>
      <div className="relative h-6 flex items-center">
        <div className="absolute inset-x-0 h-1.5 rounded-full bg-app-secondary" />
        <div
          className="absolute h-1.5 rounded-full bg-brand-gradient"
          style={{ left: `${rangeStartPct}%`, right: `${100 - rangeEndPct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={valueMin}
          onChange={(e) => onChange(Math.min(Number(e.target.value), valueMax), valueMax)}
          className="dual-range-input"
          style={{ zIndex: valueMin > midpoint ? 5 : 3 }}
          aria-label="Minimum yaş"
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={valueMax}
          onChange={(e) => onChange(valueMin, Math.max(Number(e.target.value), valueMin))}
          className="dual-range-input"
          style={{ zIndex: 4 }}
          aria-label="Maksimum yaş"
        />
      </div>
    </div>
  );
};
