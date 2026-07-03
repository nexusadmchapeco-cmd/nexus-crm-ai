"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";

const nav = [
  { href: "/", label: "Visão geral", icon: "grid" as const },
  { href: "/kanban", label: "Pipeline", icon: "board" as const },
  { href: "/conversations", label: "Conversas", icon: "chat" as const },
  { href: "/test-inbound", label: "Simulador", icon: "flask" as const },
  { href: "/campaigns", label: "Disparos", icon: "send" as const },
];

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="mobile-menu" onClick={() => setOpen(true)} aria-label="Abrir menu">
        <Icon name="menu" />
      </button>
      {open && <button className="sidebar-overlay" onClick={() => setOpen(false)} aria-label="Fechar menu" />}
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">N</div>
          <div>
            <strong>Nexus</strong>
            <span>CRM AI</span>
          </div>
          <button className="sidebar-close" onClick={() => setOpen(false)} aria-label="Fechar menu">
            <Icon name="x" />
          </button>
        </div>
        <nav className="main-nav" aria-label="Navegação principal">
          <span className="nav-label">Operação</span>
          {nav.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} className={active ? "active" : ""} onClick={() => setOpen(false)}>
                <Icon name={item.icon} />
                {item.label}
              </Link>
            );
          })}
          <span className="nav-label nav-label-spaced">Configurações</span>
          <Link href="/settings/whatsapp" className={pathname.startsWith("/settings/whatsapp") ? "active" : ""} onClick={() => setOpen(false)}>
            <Icon name="chat" />
            Conectar WhatsApp
          </Link>
          <Link href="/settings/ai" className={pathname.startsWith("/settings/ai") ? "active" : ""} onClick={() => setOpen(false)}>
            <Icon name="settings" />
            Estúdio de IA
          </Link>
        </nav>
        <div className="sidebar-status">
          <div className="status-dot" />
          <div>
            <strong>IA em operação</strong>
            <span>Atendimento automático</span>
          </div>
        </div>
        <div className="profile">
          <div className="avatar avatar-dark">NC</div>
          <div>
            <strong>Equipe Nexus</strong>
            <span>Operação comercial</span>
          </div>
        </div>
      </aside>
    </>
  );
}
