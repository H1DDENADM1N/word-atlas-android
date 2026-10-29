/**
 * Soft-keyboard helpers.
 *
 * The typing stages use an invisible <input> as the caret, so the field is
 * usually *already* focused when the user taps the stage. A WebView answers
 * `focus()` on an already-focused element with nothing at all — no keyboard —
 * which is why tapping the stage used to leave the page untypable. Blurring
 * first makes the next `focus()` a real focus change, and the shell is asked
 * to raise the IME as well so the result does not depend on that dance.
 */
import { shell } from "./native";

/** Focus a field and make sure the keyboard comes up with it. */
export function focusField(el: HTMLInputElement | HTMLTextAreaElement | null) {
  if (!el) return;
  const already = document.activeElement === el;
  if (already) el.blur();
  el.focus({ preventScroll: true });
  if (already) requestAnimationFrame(() => el.focus({ preventScroll: true }));
  try {
    shell?.showKeyboard?.();
  } catch {
    /* older shell without the method */
  }
}

/**
 * Keep the focused field inside the visible area once the keyboard has
 * finished animating. `scrollIntoView` is deliberately deferred: measuring
 * before the resize lands scrolls to the wrong place.
 */
export function revealField(el: HTMLElement | null, delay = 320) {
  if (!el) return;
  window.setTimeout(() => {
    const r = el.getBoundingClientRect();
    const vv = window.visualViewport;
    const visible = vv ? vv.height : window.innerHeight;
    if (r.bottom > visible - 12 || r.top < 0) el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, delay);
}
