"use client";

// Abertura cinematográfica: toca UMA vez por sessão (abrir o app/site), com
// o ícone da marca chegando de longe, anel de energia varrendo, faixas de
// luz e o nome se montando — depois some e entrega a tela. É pulável no
// toque e não roda pra quem pediu menos movimento.

import { useEffect, useState } from "react";

export function Splash() {
  const [phase, setPhase] = useState<"off" | "playing" | "leaving">("off");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || sessionStorage.getItem("nexus-splash") === "1") return;
    sessionStorage.setItem("nexus-splash", "1");
    setPhase("playing");
    const leave = setTimeout(() => setPhase("leaving"), 2300);
    const end = setTimeout(() => setPhase("off"), 2950);
    return () => {
      clearTimeout(leave);
      clearTimeout(end);
    };
  }, []);

  if (phase === "off") return null;

  return (
    <div
      className={`splash ${phase === "leaving" ? "splash-out" : ""}`}
      onClick={() => setPhase("leaving")}
      role="presentation"
    >
      <div className="splash-aurora" />
      <div className="splash-grid" />
      <div className="splash-rings">
        <i />
        <i className="r2" />
        <i className="r3" />
      </div>
      <div className="splash-beams">
        <i />
        <i className="b2" />
        <i className="b3" />
      </div>
      <div className="splash-core">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/branding/nexus-crm-icon.svg" alt="" />
        <span className="splash-sweep" />
      </div>
      <div className="splash-word">
        <strong>NEXUS</strong>
        <em>CRM AI</em>
      </div>
      <div className="splash-tag">Operação comercial inteligente</div>
    </div>
  );
}
