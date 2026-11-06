"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const INTERVAL_MS = 20_000;

// जब तक कोई job बन रही है (queued/running), पेज हर 20 सेकंड में ताज़ा होता है
export function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      router.refresh();
    }, INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [active, router]);

  return null;
}