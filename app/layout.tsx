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

// साइट का असली पता (env में न हो तो sthamly.com)। साझा लिंक और sitemap इसी से बनते हैं।
const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://sthamly.com").replace(/\/+$/, "");

// सिर्फ़ वही बातें लिखी हैं जो आज सच में चालू हैं: बोलकर या लिखकर काम, पोस्टर और कैप्शन,
// और बिना मंज़ूरी के खर्च या पब्लिश नहीं। आगे नए काम जुड़ें तो यहीं बदलें।
const TITLE = "Sthamly | AI एजेंट जो आपका काम करके देता है";
const DESCRIPTION =
  "Sthamly एक AI एजेंट है। बोलिए या लिखिए, पोस्टर और कैप्शन तैयार। आपकी मंज़ूरी के बिना न कुछ खर्च होता है, न कुछ पब्लिश।";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    // आगे किसी पन्ने का अपना title हो तो "पन्ने का नाम | Sthamly" बनेगा
    template: "%s | Sthamly",
  },
  description: DESCRIPTION,
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
  openGraph: {
    type: "website",
    siteName: "Sthamly",
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    locale: "hi_IN",
  },
  twitter: {
    card: "summary",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // कीबोर्ड खुलने पर पन्ना उतना ही छोटा हो जाए, ऊपर का हिस्सा बाहर न धकेले
  interactiveWidget: "resizes-content",
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
        <AppDrawer lang={lang} />
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}