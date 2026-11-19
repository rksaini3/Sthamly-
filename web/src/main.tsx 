// Sthamly AI web: React entry point (Blueprint 3.0, section 10)
// Yahan koi business logic nahi hai. Sirf React ko #root se jodna, styles aur routing ka context dena.
// Routes aur screens App.tsx mein hain. Session ka kaam AuthProvider mein hai.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles.css";

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