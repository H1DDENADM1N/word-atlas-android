/**
 * Bridge to the Android shell.
 *
 * The web build ships the same code path: when `window.WordAtlasAndroid` is
 * missing every helper falls back to the browser behaviour, so the site and the
 * APK share one code base.
 */
import { closeWord, currentLocation, go, historyDepth } from "./router";

interface Shell {
  saveFile(name: string, mime: string, base64: string): void;
  saveAndShare(name: string, mime: string, base64: string, title: string): void;
  assetDataUrl(url: string): string | null;
  speak(text: string, lang: string, rate: number): void;
  prepare(text: string, lang: string, rate: number): void;
  stopSpeak(): void;
  setChrome(color: string, dark: boolean): void;
  setBackEnabled(enabled: boolean): void;
  /** "light" | "dark" — the phone's own setting, not the app theme. */
  systemTheme?(): string;
  openExternal(url: string): void;
  toast(message: string): void;
  version(): string;
}

declare global {
  interface Window {
    WordAtlasAndroid?: Shell;
    __waBack?: () => boolean;
    __waSpeakDone?: () => void;
    __waSystemTheme?: (theme: string) => void;
  }
}

export const shell: Shell | undefined = typeof window === "undefined" ? undefined : window.WordAtlasAndroid;
/** True inside the packaged Android app. */
export const isShell = !!shell;

/* ---------- files ---------- */

const CHUNK = 0x8000;

function toBase64(bytes: Uint8Array) {
  let text = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK);
    text += String.fromCharCode(...(slice as unknown as number[]));
  }
  return btoa(text);
}

/**
 * Save a generated file (backup, share card). Inside the app it is handed to
 * the shell, which writes it to the device's Downloads folder; on the web the
 * browser download is used.
 *
 * Pass {@code share} for an image the user is expected to send on: the shell
 * then opens the system share sheet after saving, which is the only way to
 * reach WeChat and friends from a WebView. The browser keeps using its own
 * download, since the page has no access to the system chooser.
 */
export async function saveBlob(
  blob: Blob,
  name: string,
  share?: { title: string },
): Promise<"shell" | "browser"> {
  if (shell) {
    const type = blob.type || "application/octet-stream";
    const base64 = toBase64(new Uint8Array(await blob.arrayBuffer()));
    if (share && shell.saveAndShare) shell.saveAndShare(name, type, base64, share.title);
    else shell.saveFile(name, type, base64);
    return "shell";
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return "browser";
}

/**
 * Read a packaged asset as a `data:` URL, or null on the web.
 *
 * The page runs from `file://` inside the APK, and drawing such an image into a
 * canvas taints it — `canvas.toBlob()` then throws, so the share card could
 * never be exported. A `data:` URL is origin-clean, so the card renders from
 * the same bytes the page displays.
 */
export function assetDataUrl(src: string): string | null {
  if (!shell?.assetDataUrl) return null;
  try {
    return shell.assetDataUrl(new URL(src, location.href).href);
  } catch {
    return null;
  }
}

/* ---------- speech ---------- */

/**
 * Read text with the voice bundled in the APK. Resolves when the utterance
 * finishes, so callers can keep the ambience ducked for exactly as long.
 */
export function shellSpeak(text: string, accent: "uk" | "us", rate: number) {
  if (!shell) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.__waSpeakDone = undefined;
      window.clearTimeout(timer);
      resolve(true);
    };
    const timer = window.setTimeout(finish, 20000);
    window.__waSpeakDone = finish;
    try {
      shell.speak(text, accent === "uk" ? "en-GB" : "en-US", rate);
    } catch {
      finish();
    }
  });
}

export function shellStopSpeak() {
  shell?.stopSpeak();
}

/**
 * Get the bundled voice ready for a sentence before it is needed.
 *
 * Synthesis, not loading, is the slow part — a long sentence takes seconds on a
 * phone CPU — so this renders the exact text that the speaker next to it will
 * read. Called while the button is merely on screen, it moves that work off the
 * tap. Safe to call repeatedly: only the newest request is kept.
 */
export function shellPrepare(text: string, accent: "uk" | "us", rate: number) {
  shell?.prepare(text, accent === "uk" ? "en-GB" : "en-US", rate);
}

/* ---------- system appearance ---------- */

/**
 * Whether the operating system is in dark mode.
 *
 * A WebView answers `prefers-color-scheme` from the *app's* theme, and the APK
 * ships a dark platform theme so the launch window never flashes white. Left to
 * the media query, "跟随系统" therefore stayed dark on a phone in light mode.
 * The shell is asked first; the browser falls back to the media query.
 */
function readSystemDark(): boolean {
  try {
    const v = shell?.systemTheme?.();
    if (v === "dark") return true;
    if (v === "light") return false;
  } catch {
    /* older shell without the method */
  }
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
}

let systemDark = typeof window === "undefined" ? false : readSystemDark();
const themeListeners = new Set<() => void>();

function publishSystemDark(next: boolean) {
  if (next === systemDark) return;
  systemDark = next;
  themeListeners.forEach((l) => l());
}

export function getSystemDark() {
  return systemDark;
}

export function subscribeSystemTheme(listener: () => void) {
  themeListeners.add(listener);
  return () => themeListeners.delete(listener);
}

/** Wires the shell's push and the browser's own `change` event. */
export function installSystemTheme() {
  window.__waSystemTheme = (theme) => publishSystemDark(theme === "dark");
  if (typeof matchMedia === "function") {
    matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => publishSystemDark(readSystemDark()));
  }
}

/* ---------- chrome ---------- */

/** Tint the status and navigation bars to match the page theme. */
export function setChrome(color: string, dark: boolean) {
  shell?.setChrome(color, dark);
}

export function openExternal(url: string) {
  if (shell) shell.openExternal(url);
  else window.open(url, "_blank", "noreferrer");
}

export function shellToast(message: string) {
  shell?.toast(message);
}

/* ---------- system back button ---------- */

/** Floating panels that sit above the router and want the back key first. */
const overlays = new Set<() => boolean>();

/** Lets an overlay claim the hardware back key. Returns an unregister function. */
export function registerOverlay(close: () => boolean) {
  overlays.add(close);
  syncBack();
  return () => {
    overlays.delete(close);
    syncBack();
  };
}

/** Mirrors the router state into the shell so the hardware back key knows. */
function syncBack() {
  if (!shell) return;
  const loc = currentLocation();
  shell.setBackEnabled(!!loc.word || historyDepth() > 0 || loc.route.page !== "today" || overlays.size > 0);
}

/** Wires the hardware back key to in-app navigation. Returns true when consumed. */
export function installBackHandler() {
  if (!shell) return;
  window.__waBack = () => {
    // Newest overlay first: the lookup card closes before the entry behind it.
    for (const close of [...overlays].reverse()) if (close()) return true;
    const loc = currentLocation();
    if (loc.word) {
      closeWord();
      return true;
    }
    if (historyDepth() > 0) {
      history.back();
      return true;
    }
    if (loc.route.page !== "today") {
      go({ page: "today" }, null, true);
      return true;
    }
    return false;
  };
  window.addEventListener("wa:loc", syncBack);
  syncBack();
}
