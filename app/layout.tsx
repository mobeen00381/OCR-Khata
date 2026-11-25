import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/manrope";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: {
    default: "SteelKhata AI — Camera-first Khata for Steel Businesses",
    template: "%s · SteelKhata AI",
  },
  description:
    "Scan handwritten steel pipe parchis, auto-update stock and khata, and close your day with clean PDF and Excel reports. Built for Pakistani steel businesses.",
  applicationName: "SteelKhata AI",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "SteelKhata AI",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "SteelKhata AI",
    description: "Camera-first khata, stock and EOD closing for steel pipe stores.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#0F172A",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
