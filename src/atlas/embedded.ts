/**
 * Word data inlined into the Android build.
 *
 * The APK opens `index.html` from `file:///android_asset`, where `fetch()` is
 * blocked by the browser. `scripts/android/build-web.mjs` therefore writes the
 * index, the entry chunks and the sound cues into `atlas-embed/data.js`, which
 * is loaded before the app bundle. On the web nothing sets `__WA_DATA` and the
 * normal network paths are used.
 */
export interface EmbeddedData {
  /** JSON text of `atlas/index.json`. */
  index: string;
  /** JSON text per entry chunk, in `atlas/entries/N.json` order. */
  chunks: string[];
  /** Base64 payloads for `sfx/*.mp3`. */
  sfx: Record<string, string>;
}

export function embedded(): EmbeddedData | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { __WA_DATA?: EmbeddedData }).__WA_DATA;
}
