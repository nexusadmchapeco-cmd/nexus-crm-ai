"use client";

// Menu Follow-up (briefing §6.4): agendados / enviados aguardando resposta /
// respondidos hoje + follow-ups manuais da ficha. Ações: cancelar, disparar
// agora, atalho pro WhatsApp.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type LeadRef = { id: string; name: string | null; phone: string };
type FollowupRow = {
  id: string;
  stage_role: string;
  attempt: number;
  scheduled_for: string;
  status: string;
  template_name: string | null;
  sent_at: string | null;
  responded_at: string | null;
  lead: LeadRef | null;
};
type ManualRow = { id: string; title: string; due_at: string; lead: LeadRef | null };

const STAGE_LABELS: Record<string, string> = {
  ai_service: "Contato feito",
  qualifying: "Informações passadas",
  hot_lead: "Qualificado",
  not_qualified: "Reengajamento",
};

function quando(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function waLink(phone: string) {
  return `https://wa.me/${phone.replace(/\D/g, "")}`;
}

export function FollowupCenter() {
  const [data, setData] = useState<{
    agendados: FollowupRow[];
    enviados: FollowupRow[];
    respondidos: FollowupRow[];
    manuais: ManualRow[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/followups");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Erro ao carregar.");
      setData(payload);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Erro ao carregar.");
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 60000);
    return () => clearInterval(interval);
  }, [load]);

  async function action(id: string, kind: "cancelar" | "disparar") {
    const response = await fetch("/api/followups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: kind }),
    });
    const payload = await response.json();
    if (!response.ok) setError(payload.error || "Erro na ação.");
    void load();
  }

  function renderRow(row: FollowupRow, actions: boolean) {
    return (
      <div className="pv-row" key={row.id}>
        <div className="pv-nm">
          {row.lead?.name || row.lead?.phone}
          <small>
            {STAGE_LABELS[row.stage_role] || row.stage_role} · tentativa {row.attempt} ·{" "}
            {row.status === "pendente"
              ? `sai ${quando(row.scheduled_for)}`
              : row.status === "enviado"
                ? `enviado ${row.sent_at ? quando(row.sent_at) : ""}`
                : `respondeu ${row.responded_at ? quando(row.responded_at) : ""}`}
            {row.template_name ? ` · ${row.template_name}` : ""}
          </small>
        </div>
        <div className="pv-row-actions">
          {row.lead && (
            <a className="pv-btn-green pv-btn-sm" href={waLink(row.lead.phone)} target="_blank" rel="noreferrer">
              WhatsApp
            </a>
          )}
          {row.lead && (
            <Link className="pv-btn-ghost pv-btn-sm" href={`/conversations?lead=${row.lead.id}`}>
              Conversa
            </Link>
          )}
          {actions && (
            <>
              <button type="button" className="pv-btn pv-btn-sm" onClick={() => void action(row.id, "disparar")}>
                Disparar agora
              </button>
              <button type="button" className="pv-btn-ghost pv-btn-sm" onClick={() => void action(row.id, "cancelar")}>
                Cancelar
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  if (error) return <div className="vendedor-error">{error}</div>;
  if (!data) return <p className="dia-empty">Carregando follow-ups...</p>;

  return (
    <div className="pv-shell">
      <div className="pv-stats">
        <div className="pv-stat b-yellow"><h5>Agendados</h5><div className="v">{data.agendados.length}</div><span>Na régua automática</span></div>
        <div className="pv-stat b-blue"><h5>Enviados · aguardando</h5><div className="v">{data.enviados.length}</div><span>Sem resposta ainda</span></div>
        <div className="pv-stat b-green"><h5>Responderam hoje</h5><div className="v">{data.respondidos.length}</div><span>Atender agora</span></div>
        <div className="pv-stat b-orange"><h5>Manuais agendados</h5><div className="v">{data.manuais.length}</div><span>Da ficha do lead</span></div>
      </div>

      {data.respondidos.length > 0 && (
        <div className="pv-card pv-mt">
          <div className="pv-card-h"><h3>🔥 Responderam hoje — atender já</h3></div>
          {data.respondidos.map((row) => renderRow(row, false))}
        </div>
      )}

      <div className="pv-card pv-mt">
        <div className="pv-card-h"><h3>Agendados (régua automática)</h3></div>
        {data.agendados.length === 0 && <p className="dia-empty">Nenhum follow-up agendado.</p>}
        {data.agendados.map((row) => renderRow(row, true))}
      </div>

      <div className="pv-card pv-mt">
        <div className="pv-card-h"><h3>Enviados · aguardando resposta</h3></div>
        {data.enviados.length === 0 && <p className="dia-empty">Nada aguardando resposta.</p>}
        {data.enviados.map((row) => renderRow(row, false))}
      </div>

      <div className="pv-card pv-mt">
        <div className="pv-card-h"><h3>Follow-ups manuais (agendados na ficha)</h3></div>
        {data.manuais.length === 0 && <p className="dia-empty">Nenhum contato manual agendado.</p>}
        {data.manuais.map((task) => (
          <div className="pv-row" key={task.id}>
            <div className="pv-nm">
              {task.lead?.name || task.lead?.phone}
              <small>{task.title} · {quando(task.due_at)}</small>
            </div>
            <div className="pv-row-actions">
              {task.lead && (
                <a className="pv-btn-green pv-btn-sm" href={waLink(task.lead.phone)} target="_blank" rel="noreferrer">WhatsApp</a>
              )}
              {task.lead && (
                <Link className="pv-btn-ghost pv-btn-sm" href={`/conversations?lead=${task.lead.id}`}>Conversa</Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
