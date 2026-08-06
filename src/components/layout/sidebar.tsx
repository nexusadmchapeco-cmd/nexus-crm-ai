"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";

const nav = [
  { href: "/", label: "Visão geral", icon: "grid" as const },
  { href: "/painel-vendedor", label: "Painel do Vendedor", icon: "user" as const },
  { href: "/kanban", label: "Pipeline", icon: "board" as const },
  { href: "/conversations", label: "Conversas", icon: "chat" as const },
  { href: "/follow-up", label: "Follow-up", icon: "check" as const },
  { href: "/agenda", label: "Agenda", icon: "calendar" as const },
  { href: "/level-tests", label: "Testes de nível", icon: "report" as const },
  { href: "/reports", label: "Relatório diário", icon: "report" as const },
  { href: "/test-inbound", label: "Simulador", icon: "flask" as const },
  { href: "/campaigns", label: "Disparos", icon: "send" as const },
];

// Itens de gestão: escondidos do papel "vendedor" (o middleware também
// bloqueia). Menu do vendedor (spec): Painel, Pipeline, Conversas, Agenda,
// Disparos.
const MANAGEMENT_HREFS = new Set(["/", "/reports", "/test-inbound"]);

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [diaCount, setDiaCount] = useState(0);
  const [role, setRole] = useState<string | null>(null);
  const isLogin = pathname === "/login";

  useEffect(() => {
    fetch("/api/meu-dia/summary")
      .then((response) => response.json())
      .then((data) => setDiaCount(data.count || 0))
      .catch(() => {});
  }, [pathname]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((response) => response.json())
      .then((data) => setRole(data.user?.role || null))
      .catch(() => {});
  }, [pathname]);

  if (isLogin) return null;

  const isVendedor = role === "vendedor";
  const visibleNav = nav.filter((item) => !isVendedor || !MANAGEMENT_HREFS.has(item.href));

  // Barra inferior do celular/PWA: atalhos principais no alcance do polegar;
  // "Menu" abre a gaveta com todo o resto.
  const tabbar = [
    { href: "/painel-vendedor", label: "Painel", icon: "user" as const },
    { href: "/kanban", label: "Pipeline", icon: "board" as const },
    { href: "/conversations", label: "Conversas", icon: "chat" as const },
    { href: "/agenda", label: "Agenda", icon: "calendar" as const },
  ];

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
          {visibleNav.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} className={active ? "active" : ""} onClick={() => setOpen(false)}>
                <Icon name={item.icon} />
                {item.label}
                {item.href === "/painel-vendedor" && diaCount > 0 && (
                  <span className="nav-badge">{diaCount}</span>
                )}
              </Link>
            );
          })}
          {!isVendedor && (
            <>
              <span className="nav-label nav-label-spaced">Configurações</span>
              <Link href="/settings/whatsapp" className={pathname.startsWith("/settings/whatsapp") ? "active" : ""} onClick={() => setOpen(false)}>
                <Icon name="chat" />
                Conectar WhatsApp
              </Link>
              <Link href="/settings/pipeline" className={pathname.startsWith("/settings/pipeline") ? "active" : ""} onClick={() => setOpen(false)}>
                <Icon name="board" />
                Etapas do pipeline
              </Link>
              <Link href="/settings/ai" className={pathname.startsWith("/settings/ai") ? "active" : ""} onClick={() => setOpen(false)}>
                <Icon name="settings" />
                Estúdio de IA
              </Link>
              <Link href="/settings/knowledge" className={pathname.startsWith("/settings/knowledge") ? "active" : ""} onClick={() => setOpen(false)}>
                <Icon name="book" />
                Base de conhecimento
              </Link>
              {role === "admin" && (
                <Link href="/settings/usuarios" className={pathname.startsWith("/settings/usuarios") ? "active" : ""} onClick={() => setOpen(false)}>
                  <Icon name="user" />
                  Usuários
                </Link>
              )}
            </>
          )}
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
          <button
            className="logout-btn"
            type="button"
            aria-label="Sair"
            title="Sair"
            onClick={() => {
              void fetch("/api/auth/logout", { method: "POST" }).finally(() => {
                window.location.href = "/login";
              });
            }}
          >
            Sair
          </button>
        </div>
      </aside>
      <nav className="mobile-tabbar" aria-label="Navegação inferior">
        {tabbar.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} className={active ? "on" : ""}>
              <Icon name={item.icon} size={18} />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <button type="button" onClick={() => setOpen(true)}>
          <Icon name="menu" size={18} />
          <span>Menu</span>
        </button>
      </nav>
    </>
  );
}
