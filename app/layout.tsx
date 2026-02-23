import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { GlobalShortcuts } from "@/components/GlobalShortcuts";
import { AccountTopMenu } from "@/components/AccountTopMenu";
import { PresenceBeacon } from "@/components/PresenceBeacon";
import LocationTracker from "@/components/security/LocationTracker";
import { FloatingMessagesWrapper } from "@/components/FloatingMessagesWrapper";
import { GlobalShell } from "@/components/GlobalShell";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { ImpersonationProvider } from "@/components/ImpersonationProvider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "GoPocket",
  description: "Aplicación web con Next.js, Tailwind CSS, Supabase y Cloudinary",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${inter.variable} font-sans antialiased`}>
        <AccountTopMenu />
        <LocationTracker />
        <PresenceBeacon role="user" />
        <ImpersonationProvider>
          <ImpersonationBanner />
          {children}
        </ImpersonationProvider>
        <GlobalShell />
        <GlobalShortcuts />
        <FloatingMessagesWrapper />
      </body>
    </html>
  );
}
