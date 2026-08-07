import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import "./globals.css";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["500", "600", "800"],
  variable: "--font-nexus",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Nexus CRM AI",
  description: "Operação comercial inteligente da Nexus English Center",
  manifest: "/manifest.webmanifest",
  icons: {
    // ?v=2: fura o cache de favicon dos navegadores (marca nova de 07/08).
    icon: "/icons/icon-192.png?v=2",
    apple: "/icons/apple-touch-icon.png?v=2",
  },
  appleWebApp: {
    capable: true,
    title: "Nexus CRM",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#07111F",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={montserrat.variable}>
      <body>
        <Sidebar />
        <div className="app-shell">
          <Topbar />
          <main className="page-content">{children}</main>
        </div>
      </body>
    </html>
  );
}
