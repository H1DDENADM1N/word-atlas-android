import { assetDataUrl } from "./native";

/** Load an image from a URL the page can already display. */
export function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Load a packaged image so it can be drawn into an exportable canvas.
 *
 * Inside the APK the page runs from `file://`, where every document is its own
 * opaque origin: drawing such an image taints the canvas and `canvas.toBlob()`
 * then hands back null. Asking the shell for the same bytes as a `data:` URL
 * keeps the canvas clean. On the web the URL is already same-origin and is used
 * as it is.
 */
export function loadExportable(src: string) {
  return loadImage(assetDataUrl(src) ?? src);
}

/** Same, but a missing or broken illustration is not an error. */
export function loadOptional(src: string | null | undefined) {
  if (!src) return Promise.resolve<HTMLImageElement | null>(null);
  return loadExportable(src).catch(() => null);
}
