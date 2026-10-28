import { flushSync } from "react-dom";

type VTDocument = Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Run a DOM-changing update inside a View Transition when the browser supports it. */
export function transition(update: () => void) {
  const d = document as VTDocument;
  if (!d.startViewTransition || reduced()) {
    update();
    return;
  }
  // A newer transition can cancel this one; that is expected, not an error.
  d.startViewTransition(() => flushSync(update)).finished.catch(() => null);
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
  t.finished.catch(() => null).finally(() => (el.style.viewTransitionName = ""));
}
