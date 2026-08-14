/**
 * Lazy loading infrastructure for Rive animations.
 * Only loads Rive runtime dynamically when a .riv component is actually mounted.
 */
export async function loadRiveAnimation(container: HTMLElement, src: string, autoplay = true) {
  try {
    const riveModule = await import('@rive-app/canvas');
    const rive = new riveModule.Rive({
      src,
      canvas: container as HTMLCanvasElement,
      autoplay,
    });
    return rive;
  } catch (err) {
    console.warn('[RIVE LAZY LOAD NOTICE] Rive asset could not be loaded dynamically:', err);
    return null;
  }
}
