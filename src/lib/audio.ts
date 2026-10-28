import { duck } from "./sound";
import { shell, shellSpeak, shellPrepare, shellStopSpeak } from "./native";

let current: HTMLAudioElement | null = null;
let token = 0;

/**
 * The bundled voice reads a touch slower than the recordings, so slowing it
 * slightly makes the two sound like the same speaker. Shared with
 * {@link prepareVoice} — if the two ever disagree, the pre-rendered audio stops
 * matching the request and the work is wasted.
 */
const VOICE_RATE = 0.95;

export function stopAudio() {
  token++;
  current?.pause();
  current = null;
  shellStopSpeak();
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

/** Play a recording, falling back to the device voice. Resolves when playback ends. */
export async function play(url: string | null | undefined, text: string, accent: "uk" | "us" = "uk", rate = 1) {
  duck(true);
  try {
    return await speak(url, text, accent, rate);
  } finally {
    duck(false);
  }
}

/**
 * Render a sentence with the bundled voice before it is played.
 *
 * Synthesis, not model loading, is what makes the first tap feel slow: a long
 * example takes seconds to compute on a phone. Callers use this when a speaker
 * that has no recording appears, so the work happens while the reader is still
 * looking at the page. A no-op on the web, where the browser speaks on demand.
 */
export function prepareVoice(text: string, accent: "uk" | "us", rate = 1) {
  shellPrepare(text, accent, rate * VOICE_RATE);
}

async function speak(url: string | null | undefined, text: string, accent: "uk" | "us", rate: number) {
  stopAudio();
  const mine = ++token;
  if (url) {
    const a = new Audio(url);
    a.playbackRate = rate;
    current = a;
    try {
      await a.play();
      await new Promise<void>((r) => {
        a.onended = () => r();
        a.onpause = () => r();
      });
      return "recorded" as const;
    } catch {
      if (mine !== token) return "stopped" as const;
      current = null;
    }
  }
  if (shell) {
    // WebView has no speech engine of its own: the shell synthesises with the
    // Kokoro voice bundled in the APK, so no system TTS (and no network) is used.
    await shellSpeak(text, accent, rate * VOICE_RATE);
    return mine === token ? ("device" as const) : ("stopped" as const);
  }
  if (!("speechSynthesis" in window)) return "unsupported" as const;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = accent === "uk" ? "en-GB" : "en-US";
  u.rate = rate * 0.95;
  const voices = speechSynthesis.getVoices().filter((v) => v.lang.replace("_", "-") === u.lang);
  const best = voices.find((v) => /premium|enhanced|natural|google/i.test(v.name)) || voices[0];
  if (best) u.voice = best;
  await new Promise<void>((r) => {
    u.onend = () => r();
    u.onerror = () => r();
    speechSynthesis.speak(u);
  });
  return "device" as const;
}
