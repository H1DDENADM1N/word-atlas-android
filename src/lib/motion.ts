import { flushSync } from "react-dom";

type ViewTransition = { ready: Promise<void>; finished: Promise<void> };
type VTDocument = Document & { startViewTransition?: (cb: () => void) => ViewTransition };

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Both promises reject when a newer transition supersedes this one — that is
 * the normal outcome of tapping quickly, not a failure. Unhandled, it surfaces
 * as "Uncaught (in promise) AbortError" on every navigation.
 */
function quiet(t: ViewTransition) {
  t.ready.catch(() => null);
  t.finished.catch(() => null);
}

/** Run a DOM-changing update inside a View Transition when the browser supports it. */
export function transition(update: () => void) {
  const d = document as VTDocument;
  if (!d.startViewTransition || reduced()) {
    update();
    return;
  }
  quiet(d.startViewTransition(() => flushSync(update)));
}

/** Morph an element (e.g. a gallery tile's illustration) into the word card. */
export function morphFrom(el: HTMLElement | null | undefined, update: () => void) {
  const d = document as VTDocument;
  if (!el || !d.startViewTransition || reduced()) {
    update();
    return;
  }
  el.style.viewTransitionName = "word-art";
  const t = d.startViewTransition(() => {
    el.style.viewTransitionName = "";
    flushSync(update);
  });
  t.ready.catch(() => null);
  t.finished.catch(() => null).finally(() => (el.style.viewTransitionName = ""));
}
