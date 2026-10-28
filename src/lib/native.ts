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
  speak(text: string, lang: string, rate: number): void;
  prepare(text: string, lang: string, rate: number): void;
  stopSpeak(): void;
  setChrome(color: string, dark: boolean): void;
  setBackEnabled(enabled: boolean): void;
  openExternal(url: string): void;
  toast(message: string): void;
  version(): string;
}

declare global {
  interface Window {
    WordAtlasAndroid?: Shell;
    __waBack?: () => boolean;
    __waSpeakDone?: () => void;
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
 */
export async function saveBlob(blob: Blob, name: string): Promise<"shell" | "browser"> {
  if (shell) {
    shell.saveFile(name, blob.type || "application/octet-stream", toBase64(new Uint8Array(await blob.arrayBuffer())));
    return "shell";
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return "browser";
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

/** Mirrors the router state into the shell so the hardware back key knows. */
function syncBack() {
  if (!shell) return;
  const loc = currentLocation();
  shell.setBackEnabled(!!loc.word || historyDepth() > 0 || loc.route.page !== "today");
}

/** Wires the hardware back key to in-app navigation. Returns true when consumed. */
export function installBackHandler() {
  if (!shell) return;
  window.__waBack = () => {
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
