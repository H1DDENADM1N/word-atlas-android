/**
 * Theme resolution shared by the shell chrome and the page.
 *
 * `settings.theme` is what the user picked; `mode` is what actually gets
 * painted. Two cases need care:
 *
 * - "system" is resolved from the operating system (see `lib/native`), because
 *   a WebView answers `prefers-color-scheme` from the app's own theme.
 * - The two night skies (极光 / 星光) are dark palettes that repaint every
 *   pigment, so they keep `data-theme="dark"` and add `data-skin`.
 */
import { useSyncExternalStore } from "react";
import { isSkin, useStore, type Theme } from "../store/store";
import { getSystemDark, subscribeSystemTheme } from "./native";

export type Mode = "light" | "dark";

/** Colour of the Android status/navigation bars for each palette. */
const CHROME: Record<Mode | "aurora" | "starlight", string> = {
  light: "#F6F1E7",
  dark: "#0D1120",
  aurora: "#05060F",
  starlight: "#080B18",
};

export function resolveMode(theme: Theme, systemDark: boolean): Mode {
  if (theme === "system") return systemDark ? "dark" : "light";
  return isSkin(theme) ? "dark" : theme;
}

export function chromeColor(theme: Theme, mode: Mode) {
  return isSkin(theme) ? CHROME[theme] : CHROME[mode];
}

export function useThemeSettings() {
  const theme = useStore((s) => s.settings.theme);
  const systemDark = useSyncExternalStore(subscribeSystemTheme, getSystemDark, getSystemDark);
  return { theme, mode: resolveMode(theme, systemDark) };
}
