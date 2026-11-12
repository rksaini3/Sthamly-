"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import styles from "@/components/nav/AppDrawer.module.css";
import type { ChatSummary } from "@/lib/chats";

// ☰ इन पन्नों पर नहीं दिखेगा (लॉगिन और कानूनी पन्ने)
const HIDDEN_PREFIXES = ["/login", "/auth", "/privacy", "/terms"] as const;

type IconName = "new" | "notebook" | "library" | "images" | "batch" | "feed" | "shop" | "pin" | "trash";

interface DrawerItem {
  href: string;
  label: string;
  icon: IconName;
}

// ड्रॉअर की सूची। "नया काम" ऊपर अलग बटन है। "खोज" v1 में नहीं है।
// नोटबुक = ऑफ़र और उनसे बने पोस्टर, मेरे बनाए = लाइब्रेरी, इमेज = सिर्फ़ तस्वीरें।
const ITEMS: DrawerItem[] = [
  { href: "/notebook", label: "नोटबुक", icon: "notebook" },
  { href: "/my-posters", label: "मेरे बनाए", icon: "library" },
  { href: "/images", label: "इमेज", icon: "images" },
  { href: "/batch", label: "बैच", icon: "batch" },
  { href: "/feed", label: "घोषणा", icon: "feed" },
  { href: "/account", label: "दुकान की जानकारी", icon: "shop" },
];

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

// साफ़ और सादे आइकन (सब एक ही मोटाई की लाइन में)
const PATHS: Record<IconName, string[]> = {
  new: ["M12 20h9", "M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"],
  notebook: ["M6 3h11a1 1 0 011 1v16a1 1 0 01-1 1H6z", "M6 3v18", "M10 8h5M10 12h5"],
  library: ["M4 5h4v14H4z", "M10 5h4v14h-4z", "M16.5 6l3.7 1-3 12-3.7-1z"],
  images: ["M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1z", "M3 16l5-5 4 4 3-3 6 6", "M9 9.5h.01"],
  batch: ["M12 3l9 5-9 5-9-5z", "M3 13l9 5 9-5"],
  feed: ["M3 11v2a1 1 0 001 1h2l7 4V6L6 10H4a1 1 0 00-1 1z", "M17 9a4 4 0 010 6"],
  shop: ["M4 9l1-5h14l1 5", "M4 9a2.5 2.5 0 005 0 2.5 2.5 0 005 0 2.5 2.5 0 005 0", "M5 12v8h14v-8", "M10 20v-5h4v5"],
  pin: ["M9 4h6l-1 6 3 3H7l3-3z", "M12 13v7"],
  trash: ["M4 7h16", "M9 7V4h6v3", "M6 7l1 13h10l1-13"],
};

function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 8h16M4 16h10" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} st