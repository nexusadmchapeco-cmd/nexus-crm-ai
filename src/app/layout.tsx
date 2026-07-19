import type { Metadata } from "next";
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
