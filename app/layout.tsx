import type { Metadata, Viewport } from "next";
import { Noto_Sans_Devanagari } from "next/font/google";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { AppDrawer } from "@/components/nav/AppDrawer";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { LANG_COOKIE, parseLang } from "@/lib/i18n";
import "./globals.css";
import "./theme.css";

// हिंदी और अंग्रेज़ी दोनों के लिए एक ही साफ़ फ़ॉन्ट
const notoSans = Noto_Sans_Devanagari({
  subsets: ["devanagari", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-noto",
});

export const metadata: Metadata = {
  title: "Sthamly",
  description: "दुकान का ऑफ़र बताएं, पोस्टर और कैप्शन पाएं।",
  manifest: "/manifest.webmanifest",
  applicationName: "Sthamly",
  appleWebApp: {
    capable: true,
    title: "Sthamly",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#212121" },
  ],
};

// पेज दिखने से पहले थीम तय करता है, ताकि रंग अचानक न बदले
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('sthamly:theme');var dark=t==='dark'||((!t||t==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=dark?'dark':'light';}catch(e){document.documentElement.dataset.theme='light';}})();`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const lang = parseLang(cookieStore.get(LANG_COOKIE)?.value);

  return (
    <html lang={lang} className={notoSans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        {/* ☰ मेन्यू हर पन्ने पर, ऊपर बाईं ओर। नीचे कोई बार नहीं। */}
        <AppDrawer />
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}