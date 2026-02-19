import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SupportBot } from "@/components/SupportBot";
import { GlobalShortcuts } from "@/components/GlobalShortcuts";
import { AccountTopMenu } from "@/components/AccountTopMenu";
import { SessionWatcher } from "@/components/SessionWatcher";
import { PresenceBeacon } from "@/components/PresenceBeacon";
import LocationTracker from "@/components/security/LocationTracker";
import { Footer } from "@/components/Footer";
import { FloatingMessagesWrapper } from "@/components/FloatingMessagesWrapper";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { ImpersonationProvider } from "@/components/ImpersonationProvider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

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
        <Footer />
        <GlobalShortcuts />
        <SupportBot />
        <FloatingMessagesWrapper />
      </body>
    </html>
  );
}
