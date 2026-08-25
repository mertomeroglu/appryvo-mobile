import { useEffect, type PointerEvent as ReactPointerEvent } from 'react';
import { nativeKeyboard } from '../native/keyboard';

const KEYBOARD_OPEN_THRESHOLD = 80;
const FOCUS_MARGIN = 24;

function focusedTextControl(): HTMLElement | null {
  const active = document.activeElement;
  return active instanceof HTMLElement && active.matches('input:not([type="hidden"]), textarea, select')
    ? active
    : null;
}

function ensureFocusedControlVisible() {
  const active = focusedTextControl();
  if (!active) return;

  const viewport = window.visualViewport;
  const viewportTop = viewport?.offsetTop ?? 0;
  const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
  const rect = active.getBoundingClientRect();

  if (rect.top < viewportTop + FOCUS_MARGIN || rect.bottom > viewportBottom - FOCUS_MARGIN) {
    active.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
  }
}

export function useKeyboardViewport() {
  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    let disposed = false;
    let focusTimer: number | undefined;
    let showHandle: { remove: () => void } | undefined;
    let hideHandle: { remove: () => void } | undefined;

    const scheduleFocusVisibility = () => {
      window.clearTimeout(focusTimer);
      focusTimer = window.setTimeout(ensureFocusedControlVisible, 120);
    };

    const updateViewport = () => {
      const visibleHeight = Math.round(viewport?.height ?? window.innerHeight);
      root.style.setProperty('--app-viewport-height', `${visibleHeight}px`);

      const viewportObscuredByKeyboard = Math.max(
        0,
        window.innerHeight - visibleHeight - Math.round(viewport?.offsetTop ?? 0),
      );
      if (viewportObscuredByKeyboard > KEYBOARD_OPEN_THRESHOLD) {
        root.classList.add('keyboard-open');
        root.style.setProperty('--keyboard-height', `${viewportObscuredByKeyboard}px`);
      } else if (!root.dataset.nativeKeyboardOpen) {
        root.classList.remove('keyboard-open');
        root.style.setProperty('--keyboard-height', '0px');
      }
      scheduleFocusVisibility();
    };

    const onFocusIn = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement && event.target.matches('input, textarea, select')) {
        scheduleFocusVisibility();
      }
    };

    updateViewport();
    viewport?.addEventListener('resize', updateViewport);
    viewport?.addEventListener('scroll', updateViewport);
    window.addEventListener('resize', updateViewport);
    document.addEventListener('focusin', onFocusIn);

    void nativeKeyboard.addShowListener(({ keyboardHeight }) => {
      root.dataset.nativeKeyboardOpen = 'true';
      root.classList.add('keyboard-open');
      root.style.setProperty('--keyboard-height', `${keyboardHeight}px`);
      updateViewport();
      scheduleFocusVisibility();
    }).then((handle) => {
      if (disposed) handle.remove();
      else showHandle = handle;
    });

    void nativeKeyboard.addHideListener(() => {
      delete root.dataset.nativeKeyboardOpen;
      root.classList.remove('keyboard-open');
      root.style.setProperty('--keyboard-height', '0px');
      updateViewport();
    }).then((handle) => {
      if (disposed) handle.remove();
      else hideHandle = handle;
    });

    return () => {
      disposed = true;
      window.clearTimeout(focusTimer);
      viewport?.removeEventListener('resize', updateViewport);
      viewport?.removeEventListener('scroll', updateViewport);
      window.removeEventListener('resize', updateViewport);
      document.removeEventListener('focusin', onFocusIn);
      showHandle?.remove();
      hideHandle?.remove();
      delete root.dataset.nativeKeyboardOpen;
      root.classList.remove('keyboard-open');
      root.style.removeProperty('--app-viewport-height');
      root.style.removeProperty('--keyboard-height');
    };
  }, []);
}

export function dismissKeyboardOnBackgroundPointerDown(event: ReactPointerEvent<HTMLElement>) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest('input, textarea, select, button, a, [role="button"], [role="option"]')) return;

  const active = document.activeElement;
  if (active instanceof HTMLElement && active.matches('input, textarea, select')) {
    active.blur();
    void nativeKeyboard.hide();
  }
}
