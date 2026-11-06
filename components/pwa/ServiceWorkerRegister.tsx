"use client";

import { useEffect } from "react";

// PWA को "Home screen पर जोड़ें" के लिए service worker चाहिए।
// यह offline cache नहीं करता, क्योंकि पोस्टर और job की स्थिति हमेशा ताज़ा चाहिए।
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("service worker register failed", error);
    });
  }, []);

  return null;
}