import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AppNavigation from "@/components/AppNavigation";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Confidently Wrong",
  description:
    "Find the beliefs you have been sure about and wrong about, then fix only those.",
  // Sized for where they are shown. An icon is served raw, so a 1024px source is
  // 627KB the visitor downloads to draw 32 pixels.
  icons: {
    icon: "/generated/icon-32.png",
    apple: "/generated/icon-180.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#f2eee9",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
    >
      <body className="min-h-full">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-ink-800 focus:px-4 focus:py-2 focus:text-ink-50"
        >
          Skip to content
        </a>
        <AppNavigation />
        {children}
      </body>
    </html>
  );
}
