import type { Metadata } from "next";
import { Inter, Sora } from "next/font/google";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const sora = Sora({ subsets: ["latin"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: "Nexus CRM AI",
  description: "Operação comercial inteligente da Nexus English Center",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${sora.variable}`}>
      <body>
        <div className="ambient-backdrop" aria-hidden="true" />
        <Sidebar />
        <div className="app-shell">
          <Topbar />
          <main className="page-content">{children}</main>
        </div>
      </body>
    </html>
  );
}
