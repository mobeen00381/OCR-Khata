import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SteelKhata AI — Camera-first Khata",
    short_name: "SteelKhata",
    description:
      "Scan handwritten steel pipe parchis, manage stock and customer khatay, and close your day with manual PDF and Excel reports.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F8FAFC",
    theme_color: "#0F172A",
    categories: ["business", "finance", "productivity"],
    lang: "en-PK",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Scan Sales Bill",
        short_name: "Scan Sale",
        description: "Open the camera-first sales parchi scanner",
        url: "/scan?type=sale",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Khatay / Udhaar",
        short_name: "Khatay",
        description: "Open customer and supplier ledgers",
        url: "/khatay",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "EOD Reports",
        short_name: "Reports",
        description: "Generate and export the end-of-day report",
        url: "/reports",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
