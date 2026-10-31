import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "Budget Builder",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen">
        {children}
      </body>
    </html>
  );
}
