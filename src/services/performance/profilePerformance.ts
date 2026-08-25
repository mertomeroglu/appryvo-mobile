export const PROFILE_NAVIGATION_MARK = 'ryvo:profile:navigation-start';

type ProfileMilestone = 'shell-ready' | 'data-ready' | 'interactive';

export interface ProfilePerformanceSample {
  shellMs?: number;
  dataMs?: number;
  interactiveMs?: number;
}

const measureName = (milestone: ProfileMilestone) => `ryvo:profile:${milestone}`;

export function markProfileNavigationStart() {
  if (typeof performance === 'undefined') return;
  performance.mark(PROFILE_NAVIGATION_MARK);
}

export function measureProfileMilestone(milestone: ProfileMilestone) {
  if (typeof performance === 'undefined') return;
  const navigation = performance.getEntriesByName(PROFILE_NAVIGATION_MARK).at(-1);
  if (!navigation) return;

  const name = measureName(milestone);
  const existing = performance.getEntriesByName(name).at(-1);
  if (existing?.startTime === navigation.startTime) return;
  performance.clearMeasures(name);
  performance.measure(name, { start: navigation.startTime, end: performance.now() });

  if (milestone !== 'interactive') return;
  const duration = (key: ProfileMilestone) => performance.getEntriesByName(measureName(key)).at(-1)?.duration;
  const sample: ProfilePerformanceSample = {
    shellMs: duration('shell-ready'),
    dataMs: duration('data-ready'),
    interactiveMs: duration('interactive'),
  };
  if (typeof window !== 'undefined') {
    (window as typeof window & { __RYVO_PROFILE_PERFORMANCE__?: ProfilePerformanceSample }).__RYVO_PROFILE_PERFORMANCE__ = sample;
  }
  console.info('[PROFILE PERF]', JSON.stringify(sample));
}
