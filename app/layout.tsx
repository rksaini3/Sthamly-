import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { BottomNav } from "@/components/nav/BottomNav";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import "./globals.css";

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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="hi">
      <body>
        {children}
        <BottomNav />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}