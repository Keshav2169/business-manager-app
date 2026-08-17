import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// App-shell offline support (PWA). Registered here rather than inline in
// index.html so it goes through the same build/bundling as everything else.
// Actual data offline-ness (Sheets reads/writes) is unrelated to this and
// lives in src/shared/offlineDB.js + sheetsAPI — see sw.js for why the two
// are kept deliberately separate.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline support degrades gracefully without it — data-level offline
      // (IndexedDB cache + write queue) still works even if the shell itself
      // can't be pre-cached (e.g. unsupported browser, blocked by a policy).
    });
  });
}
