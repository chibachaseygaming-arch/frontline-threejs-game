import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FRONTLINE // Conquest",
  description: "Infantry-first conquest combat built with Three.js.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
