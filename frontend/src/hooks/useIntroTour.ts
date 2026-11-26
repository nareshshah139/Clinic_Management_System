import { useCallback, useEffect, useRef } from 'react';
import type introJs from 'intro.js';

type Tour = ReturnType<typeof introJs.tour>;

export interface TourStep {
  /** CSS selector. The step points at the first match on screen and is left out when nothing matches. */
  element?: string;
  title: string;
  intro: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

const isShown = (element: Element) =>
  element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';

function stepsOnScreen(steps: readonly TourStep[]) {
  return steps.flatMap(({ element, ...step }) => {
    if (!element) return [step];
    const target = Array.from(document.querySelectorAll(element)).find(isShown);
    return target ? [{ ...step, element: target }] : [];
  });
}

// intro.js renders each step after its change callbacks run, leaves the tooltip dialog unnamed
// and writes "ariadisabled" instead of aria-disabled, so the labels follow its DOM instead.
function labelTooltip() {
  const tooltip = document.querySelector('.introjs-tooltip');
  const title = tooltip?.querySelector('.introjs-tooltip-title');
  const text = tooltip?.querySelector('.introjs-tooltiptext');
  if (!tooltip || !title || !text) return;
  title.id = 'tour-step-title';
  text.id = 'tour-step-text';
  tooltip.setAttribute('aria-labelledby', title.id);
  tooltip.setAttribute('aria-describedby', text.id);
  tooltip.querySelectorAll('[role="button"]').forEach((button) => {
    button.setAttribute('aria-disabled', String(button.classList.contains('introjs-disabled')));
  });
}

export function useIntroTour(steps: readonly TourStep[]) {
  const tourRef = useRef<Tour | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      void tourRef.current?.exit(true);
      tourRef.current = null;
    };
  }, []);

  return useCallback(async (opener?: HTMLElement) => {
    const { default: introJs } = await import('intro.js');
    if (!mountedRef.current) return;
    await tourRef.current?.exit(true);
    const tour = introJs.tour().setOptions({
      steps: stepsOnScreen(steps),
      nextLabel: 'Next',
      prevLabel: 'Back',
      doneLabel: 'Done',
      skipLabel: 'Skip tour',
      showBullets: false,
      showProgress: false,
      showStepNumbers: true,
      exitOnOverlayClick: true,
      scrollToElement: false,
      positionPrecedence: ['bottom', 'top', 'right', 'left'],
    });
    // The dashboard scrolls inside <main>, not the window. intro.js only scrolls the window and
    // places its highlight once, so the step's element is scrolled here and every scroll re-places it.
    tour.onBeforeChange((target) => {
      if (!target.classList.contains('introjsFloatingElement')) target.scrollIntoView({ block: 'center' });
      return true;
    });
    let frame = 0;
    const follow = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => tour.refresh());
    };
    document.addEventListener('scroll', follow, true);
    const labeller = new MutationObserver(labelTooltip);
    labeller.observe(document.body, { childList: true, subtree: true, characterData: true });
    tour.onExit(() => {
      document.removeEventListener('scroll', follow, true);
      cancelAnimationFrame(frame);
      labeller.disconnect();
      if (tourRef.current === tour) tourRef.current = null;
      opener?.focus();
    });
    tourRef.current = tour;
    await tour.start();
  }, [steps]);
}
