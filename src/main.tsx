import "@fontsource-variable/fraunces/opsz.css";
import "@fontsource-variable/fraunces/opsz-italic.css";
import "@fontsource-variable/source-serif-4/opsz.css";
import "@fontsource-variable/source-serif-4/opsz-italic.css";
import "@fontsource-variable/atkinson-hyperlegible-next/index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { installBackHandler, installSystemTheme, isShell } from "./lib/native";
import "./styles/app.css";

installSystemTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Inside the APK the page is already unpacked from the package, so the service
// worker would only add a second cache layer. The hardware back key is wired to
// in-app navigation instead.
installBackHandler();

if (import.meta.env.PROD && !isShell && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => null);
  });
}
