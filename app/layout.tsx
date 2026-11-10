import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { AppDrawer } from "@/components/nav/AppDrawer";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { LANG_COOKIE, parseLang } from "@/lib/i18n";
import "./globals.css";
import "./theme.css";

export const metadata: Metadata = {
  title: "Sthamly",
  description: "दुकान की फोटो भेजें, रील और पोस्टर पाएं।",
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
  themeColor: "#e0561a",
};

// पेज दिखने से पहले थीम तय करता है, ताकि रंग अचानक न बदले
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('sthamly:theme');var dark=t==='dark'||((!t||t==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=dark?'dark':'light';}catch(e){document.documentElement.dataset.theme='light';}})();`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const lang = parseLang(cookieStore.get(LANG_COOKIE)?.value);

  return (
    <html lang={lang} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        {/* नीचे कोई बार नहीं। ☰ हर पन्ने पर, ऊपर बाईं ओर */}
        <AppDrawer />
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}