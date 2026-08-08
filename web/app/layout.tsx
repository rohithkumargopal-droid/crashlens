import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CrashLens — Production Incident Simulator",
  description: "Diagnose and fix a live production incident before the clock runs out.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
