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

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

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
        {children}
        <Footer />
        <GlobalShortcuts />
        <SupportBot />
        <FloatingMessagesWrapper />
      </body>
    </html>
  );
}