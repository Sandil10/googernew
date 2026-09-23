import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Script from "next/script";
import ThemeController from "./components/ThemeController";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Googer",
  description: "Logo reduced size, purple border, black forms",
};

export const viewport = {
  themeColor: 'black',
  width: 'device-width',
  initialScale: 1,
  // Required for env(safe-area-inset-*) to resolve; without it the value is 0
  // and the bottom nav sits under the iPhone home indicator.
  viewportFit: 'cover' as const,
  // Stops iOS auto-zooming when a form field is focused, which made the app
  // feel like a web page rather than a native one.
  maximumScale: 1,
  userScalable: false,
};

import { CartProvider } from "./context/CartContext";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Helps mobile browsers trust the external icon scripts */}
        <meta httpEquiv="Content-Security-Policy" content="script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://static.cloudflareinsights.com; object-src 'none';" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var pref = localStorage.getItem('googer-theme-mode') || 'system';
                  var resolved = pref === 'system'
                    ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
                    : pref;
                  document.documentElement.dataset.theme = resolved;
                  document.documentElement.dataset.themePreference = pref;
                  document.documentElement.style.colorScheme = resolved;
                  document.documentElement.classList.toggle('light-theme', resolved === 'light');
                  document.documentElement.classList.toggle('dark-theme', resolved === 'dark');
                  document.addEventListener('DOMContentLoaded', function () {
                    document.body.dataset.theme = resolved;
                    document.body.classList.toggle('light-theme', resolved === 'light');
                    document.body.classList.toggle('dark-theme', resolved === 'dark');
                  });
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <CartProvider>
          <ThemeController />
          {children}
        </CartProvider>
        <Script
          type="module"
          src="https://unpkg.com/ionicons@7.1.0/dist/ionicons/ionicons.esm.js"
          strategy="lazyOnload"
        />
      </body>
    </html>
  );
}
