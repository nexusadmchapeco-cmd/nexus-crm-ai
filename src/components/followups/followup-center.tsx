"use client";

// Menu Follow-up.
// Vendedor: modelo do CRM antigo — só os follow-ups manuais dele, com
// "Concluir" abrindo o "o que aconteceu?" e a opção de já agendar o próximo
// com assunto. A régua automática da IA aparece apenas para gestor/SDR.

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

// Próximo passo da cadência closer (mesmo modelo da ficha do lead): concluir
// o passo N sugere o N+1 com o prazo do CRM antigo (48/72/72/48h).
const PROXIMO_PASSO: Record<string, { days: number; title: string }> = {
  "1": { days: 2, title: "2° Tirar Dúvidas" },
  "2": { days: 3, title: "3° Aula Experimental" },
  "3": { days: 3, title: "4° Oferecer Promoção" },
  "4": { days: 2, title: "5° Encerrar Atendimento" },
};

function dateInDays(days: number) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() + days * 86400000));
}

function quando(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function hojeKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function dataKey(iso: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function waLink(phone: string) {
  return `https://wa.me/${phone.replace(/\D/g, "")}`;
}

export function FollowupCenter() {
  const [data, setData] = useState<{
    role?: string;
    regua_indisponivel?: boolean;
    agendados: FollowupRow[];
    enviados: FollowupRow[];
    respondidos: FollowupRow[];
    manuais: ManualRow[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Modal de conclusão do follow-up manual (o que aconteceu + próximo).
  const [conclui, setConclui] = useState<ManualRow | null>(null);
  const [concluiObs, setConcluiObs] = useState("");
  const [proxDate, setProxDate] = useState("");
  const [proxTitle, setProxTitle] = useState("");
  const [busy, setBusy] = useState(false);

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

  function abrirConcluir(task: ManualRow) {
    setConclui(task);
    setConcluiObs("");
    const stepMatch = task.title.match(/^(\d)° /);
    const proximo = stepMatch ? PROXIMO_PASSO[stepMatch[1]] : null;
    setProxDate(proximo ? dateInDays(proximo.days) : "");
    setProxTitle(proximo ? proximo.title : "");
  }

  async function concluirManual() {
    if (!conclui?.lead || !concluiObs.trim() || busy) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        status: "done",
        done_note: `✅ Follow-up concluído (${conclui.title}): ${concluiObs.trim()}`,
      };
      if (proxDate) {
        body.next_contact_at = `${proxDate}T09:00:00-03:00`;
        body.next_contact_title = proxTitle.trim() || "Retomar contato";
      }
      const response = await fetch(`/api/leads/${conclui.lead.id}/tasks/${conclui.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Erro ao concluir.");
      setConclui(null);
      setError(null);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Erro ao concluir.");
    } finally {
      setBusy(false);
    }
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

  function renderManual(task: ManualRow) {
    const overdue = dataKey(task.due_at) < hojeKey();
    const today = dataKey(task.due_at) === hojeKey();
    return (
      <div className={`pv-row ${overdue ? "fu-overdue" : ""}`} key={task.id}>
        <div className="pv-nm">
          {task.lead?.name || task.lead?.phone}
          <small>
            {task.title} · {overdue ? "⚠ atrasado — " : today ? "🔴 hoje — " : ""}
            {quando(task.due_at)}
          </small>
        </div>
        <div className="pv-row-actions">
          {task.lead && (
            <a className="pv-btn-green pv-btn-sm" href={waLink(task.lead.phone)} target="_blank" rel="noreferrer">WhatsApp</a>
          )}
          {task.lead && (
            <Link className="pv-btn-ghost pv-btn-sm" href={`/conversations?lead=${task.lead.id}`}>Conversa</Link>
          )}
          {task.lead && (
            <button type="button" className="pv-btn pv-btn-sm" onClick={() => abrirConcluir(task)}>
              ✓ Concluir
            </button>
          )}
        </div>
      </div>
    );
  }

  if (error && !data) return <div className="vendedor-error">{error}</div>;
  if (!data) return <p className="dia-empty">Carregando follow-ups...</p>;

  const isVendedor = data.role === "vendedor";
  const atrasados = data.manuais.filter((task) => dataKey(task.due_at) < hojeKey());
  const deHoje = data.manuais.filter((task) => dataKey(task.due_at) === hojeKey());
  const futuros = data.manuais.filter((task) => dataKey(task.due_at) > hojeKey());

  const concluiModal = conclui && (
    <div className="lm-conclui-backdrop" onClick={() => setConclui(null)}>
      <div className="lm-conclui" onClick={(event) => event.stopPropagation()}>
        <h4>✅ Concluir follow-up</h4>
        <p className="lm-conclui-sub">
          {conclui.lead?.name || conclui.lead?.phone} · {conclui.title} · {quando(conclui.due_at)}
        </p>
        <label className="lm-conclui-field">
          O que aconteceu? *
          <textarea
            autoFocus
            placeholder="Ex.: Cliente confirmou interesse, vai pensar e retorna semana que vem."
            value={concluiObs}
            onChange={(event) => setConcluiObs(event.target.value)}
          />
        </label>
        <div className="lm-conclui-next">
          <span>Já agendar o próximo (opcional)</span>
          <div>
            <input type="date" value={proxDate} onChange={(event) => setProxDate(event.target.value)} />
            <input
              placeholder="Assunto — ex.: 2° Tirar Dúvidas"
              value={proxTitle}
              onChange={(event) => setProxTitle(event.target.value)}
            />
          </div>
        </div>
        <div className="lm-actions">
          <button type="button" className="pv-btn-ghost pv-btn-sm" onClick={() => setConclui(null)}>Cancelar</button>
          <button
            type="button"
            className="pv-btn-green pv-btn-sm"
            disabled={!concluiObs.trim() || busy}
            onClick={() => void concluirManual()}
          >
            {busy ? "Salvando..." : proxDate ? "Concluir e agendar próximo" : "Concluir"}
          </button>
        </div>
      </div>
    </div>
  );

  // Vendedor: página simples no modelo antigo — só os follow-ups dele.
  if (isVendedor) {
    return (
      <div className="pv-shell">
        {error && <div className="vendedor-error">{error}</div>}
        <div className="pv-stats">
          <div className="pv-stat b-orange"><h5>Atrasados</h5><div className="v">{atrasados.length}</div><span>Resolver primeiro</span></div>
          <div className="pv-stat b-yellow"><h5>Para hoje</h5><div className="v">{deHoje.length}</div><span>Contatos do dia</span></div>
          <div className="pv-stat b-blue"><h5>Próximos</h5><div className="v">{futuros.length}</div><span>Agendados na ficha</span></div>
        </div>
        <div className="pv-card pv-mt">
          <div className="pv-card-h"><h3>Seus follow-ups</h3></div>
          {data.manuais.length === 0 && <p className="dia-empty">Nenhum follow-up agendado — marque na ficha do lead, pela aba Histórico ou Follow-up.</p>}
          {[...atrasados, ...deHoje, ...futuros].map(renderManual)}
        </div>
        {concluiModal}
      </div>
    );
  }

  return (
    <div className="pv-shell">
      {error && <div className="vendedor-error">{error}</div>}
      {data.regua_indisponivel && (
        <div className="studio-notice warning">
          A régua automática ainda não está ativa — rode a migração 015 no Supabase. Os follow-ups manuais continuam funcionando normalmente.
        </div>
      )}
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
        <div className="pv-card-h"><h3>Follow-ups manuais (agendados na ficha)</h3></div>
        {data.manuais.length === 0 && <p className="dia-empty">Nenhum contato manual agendado.</p>}
        {[...atrasados, ...deHoje, ...futuros].map(renderManual)}
      </div>

      <div className="pv-card pv-mt">
        <div className="pv-card-h"><h3>Régua da IA · agendados</h3></div>
        {data.agendados.length === 0 && <p className="dia-empty">Nenhum follow-up agendado.</p>}
        {data.agendados.map((row) => renderRow(row, true))}
      </div>

      <div className="pv-card pv-mt">
        <div className="pv-card-h"><h3>Régua da IA · enviados, aguardando resposta</h3></div>
        {data.enviados.length === 0 && <p className="dia-empty">Nada aguardando resposta.</p>}
        {data.enviados.map((row) => renderRow(row, false))}
      </div>
      {concluiModal}
    </div>
  );
}
