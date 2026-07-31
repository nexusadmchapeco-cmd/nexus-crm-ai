import type { MetadataRoute } from "next";

// PWA: permite instalar o CRM como app no celular (Android/iPhone) e no
// desktop. Sem service worker de cache de propósito: CRM precisa de dado
// sempre fresco, e a instalação moderna não exige SW.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nexus CRM AI",
    short_name: "Nexus CRM",
    description: "Operação comercial inteligente da Nexus English Center",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f6f4",
    theme_color: "#151516",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
