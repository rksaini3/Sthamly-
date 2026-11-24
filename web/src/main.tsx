// Sthamly AI web: React entry point (Blueprint 3.0, section 10)
// Yahan koi business logic nahi hai. Sirf React ko #root se jodna, styles aur routing ka context dena.
// Routes aur screens App.tsx mein hain. Session ka kaam AuthProvider mein hai.
// Production mein service worker register hota hai (PWA install ke liye). Dev mein nahi.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles.css";
import "./styles/access.css";
import { applyPrefs, readPrefs } from "./lib/prefs";

applyPrefs(readPrefs());

const rootElement = document.getElementById("root");

if (!rootElement) {
  // index.html mein #root hona hi chahiye. Na ho to app shuru hi nahi hoga.
  throw new Error("Root element #root nahi mila. index.html check karein.");
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);

// Service worker: sirf browser support ho to, aur sirf production mein.
// Register fail ho to app pe koi asar nahi (install na ho, bas).
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Silent: install ka option na aaye to bhi chat chalti rahegi.
    });
  });
}