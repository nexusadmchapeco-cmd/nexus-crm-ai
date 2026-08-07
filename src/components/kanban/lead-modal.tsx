"use client";

// Ficha do lead (modelo do CRM antigo): clicar no card abre Infos completas,
// Histórico com a cadência manual do closer e Follow-up agendado — que cai
// nas tarefas do Painel do Vendedor.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { formatRelative, labelEventType } from "@/lib/format";
import type { Lead, PipelineStage } from "@/lib/types";

// Modelo do CRM antigo: registrar um passo da cadência SUGERE o próximo passo
// como follow-up (data e assunto pré-preenchidos, editáveis antes de salvar).
// nextDays replica os prazos antigos (48/72/72/48h). 5° encerra sem próximo.
const CADENCIA = [
  { n: 1, label: "Retorno Reunião", color: "#eceafd", emoji: "🤝", nextDays: 2 },
  { n: 2, label: "Tirar Dúvidas", color: "#eceafd", emoji: "❓", nextDays: 3 },
  { n: 3, label: "Aula Experimental", color: "#e2f5ec", emoji: "🧪", nextDays: 3 },
  { n: 4, label: "Oferecer Promoção", color: "#fcf1dc", emoji: "🎁", nextDays: 2 },
  { n: 5, label: "Encerrar Atendimento", color: "#fce4e5", emoji: "🔚", nextDays: null },
];

// "Outros" do CRM antigo: tipos de contato avulsos, com o emoji na timeline.
const OUTROS: { value: string; label: string; emoji: string }[] = [
  { value: "whatsapp", label: "WhatsApp", emoji: "💬" },
  { value: "ligacao", label: "Ligação", emoji: "📞" },
  { value: "email", label: "Email", emoji: "📧" },
  { value: "presencial", label: "Reunião", emoji: "🤝" },
  { value: "outro", label: "Anotação", emoji: "📝" },
];

function isoInDays(days: number) {
  const date = new Date(Date.now() + days * 86400000);
  const dateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
  return `${dateStr}T09:00:00-03:00`;
}

const OUTCOME_LABELS: Record<string, string> = {
  atendeu: "Atendeu",
  sem_resposta: "Sem resposta",
  vai_pensar: "Vai pensar",
  agendou: "Agendou",
  fechou: "Fechou",
  perdeu: "Perdeu",
};

type Note = {
  id: string;
  author_name: string | null;
  contact_type: string;
  outcome: string;
  content: string;
  created_at: string;
};
type Task = {
  id: string;
  title: string;
  due_at: string;
  status: string;
};
type TimelineEvent = { id: string; event_type: string; created_at: string };

export function LeadModal({
  lead,
  stages,
  authorName,
  onClose,
  onMove,
  onDelete,
}: {
  lead: Lead;
  stages: PipelineStage[];
  authorName: string | null;
  onClose: () => void;
  onMove: (stageId: string) => void;
  onDelete: () => void;
}) {
  const [tab, setTab] = useState<"infos" | "historico" | "followup">("infos");
  const [notes, setNotes] = useState<Note[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Papel do usuário: o closer (vendedor) vê a ficha minimalista — resumo da
  // IA + os contatos que ELE registrou, sem a linha do tempo do sistema.
  const [role, setRole] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/auth/me")
      .then((response) => response.json())
      .then((data) => setRole(data.user?.role || null))
      .catch(() => {});
  }, []);
  const minimal = role === "vendedor";

  // Registro de contato: "c1".."c5" (cadência) ou tipo avulso dos OUTROS.
  const [etapa, setEtapa] = useState("");
  const [tipo, setTipo] = useState("");
  const [nota, setNota] = useState("");
  const [registrando, setRegistrando] = useState(false);

  // Sugestão de próximo contato (modelo antigo): aparece pré-preenchida ao
  // escolher um passo da cadência; o closer edita ou limpa antes de registrar.
  const [sugDate, setSugDate] = useState("");
  const [sugTitle, setSugTitle] = useState("");

  // Follow-up
  const [fuDate, setFuDate] = useState("");
  const [fuNote, setFuNote] = useState("");
  const [fuBusy, setFuBusy] = useState(false);

  // Concluir follow-up (modelo antigo): modal com "o que aconteceu?" e a
  // opção de já agendar o próximo com assunto.
  const [concluiOpen, setConcluiOpen] = useState(false);
  const [concluiObs, setConcluiObs] = useState("");
  const [proxDate, setProxDate] = useState("");
  const [proxTitle, setProxTitle] = useState("");

  function pickEtapa(value: string) {
    setEtapa(value);
    if (value) setTipo("");
    const step = CADENCIA.find((c) => String(c.n) === value);
    const next = step ? CADENCIA.find((c) => c.n === step.n + 1) : null;
    if (step?.nextDays && next) {
      setSugDate(isoInDays(step.nextDays).slice(0, 10));
      setSugTitle(`${next.n}° ${next.label}`);
    } else {
      setSugDate("");
      setSugTitle("");
    }
  }

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/leads/${lead.id}/notes`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erro ao carregar histórico.");
      setNotes(data.notes || []);
      setTasks(data.tasks || []);
      setEvents(data.events || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Erro ao carregar histórico.");
    }
  }, [lead.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingTask = tasks.find((task) => task.status === "pending") || null;
  const stageName = stages.find((s) => s.id === lead.stage_id)?.name || "";

  async function cancelPendingTask() {
    if (!pendingTask) return;
    await fetch(`/api/leads/${lead.id}/tasks/${pendingTask.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "canceled", author_name: authorName }),
    });
  }

  async function registrarCadencia() {
    if (!nota.trim() || registrando) return;
    setRegistrando(true);
    setError(null);
    try {
      const step = etapa ? CADENCIA.find((c) => String(c.n) === etapa) : null;
      const outro = !step ? OUTROS.find((o) => o.value === tipo) : null;
      const body: Record<string, unknown> = {
        content: step
          ? `${step.n}° ${step.label} — ${nota.trim()}`
          : outro && outro.value !== "outro"
            ? `${outro.emoji} ${outro.label} — ${nota.trim()}`
            : nota.trim(),
        contact_type: step ? "whatsapp" : outro?.value || "outro",
        outcome: step || outro ? "atendeu" : "sem_resposta",
        author_name: authorName,
      };
      const replacesPending = Boolean(step && sugDate && pendingTask);
      if (step && sugDate) {
        body.next_contact_at = `${sugDate}T09:00:00-03:00`;
        body.next_contact_title = sugTitle.trim() || "Retomar contato";
      }
      const response = await fetch(`/api/leads/${lead.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erro ao registrar.");
      // Só depois do novo follow-up existir é que o pendente antigo sai — se o
      // registro falhar, o lead não fica sem nenhum follow-up na fila.
      if (replacesPending) await cancelPendingTask();
      setEtapa("");
      setTipo("");
      setNota("");
      setSugDate("");
      setSugTitle("");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Erro ao registrar.");
    } finally {
      setRegistrando(false);
    }
  }

  async function salvarFollowup() {
    if (!fuDate || fuBusy) return;
    setFuBusy(true);
    setError(null);
    try {
      const hadPending = Boolean(pendingTask);
      const title = fuNote.trim() || "Retomar contato";
      const response = await fetch(`/api/leads/${lead.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: `Follow-up agendado para ${fuDate.split("-").reverse().join("/")} — ${title}`,
          outcome: "agendou",
          author_name: authorName,
          next_contact_at: `${fuDate}T09:00:00-03:00`,
          next_contact_title: title,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erro ao salvar follow-up.");
      if (hadPending) await cancelPendingTask();
      setFuNote("");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Erro ao salvar follow-up.");
    } finally {
      setFuBusy(false);
    }
  }

  // Abre o modal de conclusão já sugerindo o próximo passo da cadência
  // quando o follow-up atual é um passo dela (modelo do CRM antigo).
  function abrirConcluir() {
    if (!pendingTask) return;
    const stepMatch = pendingTask.title.match(/^(\d)° /);
    const step = stepMatch ? CADENCIA.find((c) => String(c.n) === stepMatch[1]) : null;
    const next = step ? CADENCIA.find((c) => c.n === step.n + 1) : null;
    if (step?.nextDays && next) {
      setProxDate(isoInDays(step.nextDays).slice(0, 10));
      setProxTitle(`${next.n}° ${next.label}`);
    } else {
      setProxDate("");
      setProxTitle("");
    }
    setConcluiObs("");
    setConcluiOpen(true);
  }

  async function concluirFollowup() {
    if (!pendingTask || fuBusy || !concluiObs.trim()) return;
    setFuBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        status: "done",
        done_note: `✅ Follow-up concluído (${pendingTask.title}): ${concluiObs.trim()}`,
        author_name: authorName,
      };
      if (proxDate) {
        body.next_contact_at = `${proxDate}T09:00:00-03:00`;
        body.next_contact_title = proxTitle.trim() || "Retomar contato";
      }
      const response = await fetch(`/api/leads/${lead.id}/tasks/${pendingTask.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erro ao concluir.");
      setConcluiOpen(false);
      setConcluiObs("");
      setProxDate("");
      setProxTitle("");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Erro ao concluir.");
    } finally {
      setFuBusy(false);
    }
  }

  // Título da entrada como no CRM antigo: emoji + tipo do contato. Passo da
  // cadência vem do prefixo "N° " do texto; o resto vem do contact_type.
  function noteTitle(note: Note) {
    const stepMatch = note.content.match(/^(\d)° /);
    const step = stepMatch ? CADENCIA.find((c) => String(c.n) === stepMatch[1]) : null;
    if (step) return `${step.emoji} ${step.n}° ${step.label}`;
    const outro = OUTROS.find((o) => o.value === note.contact_type);
    if (outro && outro.value !== "whatsapp") return `${outro.emoji} ${outro.label}`;
    return OUTCOME_LABELS[note.outcome] || "Contato";
  }

  const timeline = [
    ...notes.map((note) => ({
      id: `n-${note.id}`,
      title: noteTitle(note),
      detail: note.content,
      author: note.author_name,
      created_at: note.created_at,
      isNote: true,
    })),
    ...(minimal
      ? []
      : events.map((event) => ({
          id: `e-${event.id}`,
          title: labelEventType(event.event_type),
          detail: "",
          author: null,
          created_at: event.created_at,
          isNote: false,
        }))),
  ]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 30);

  const infos: { label: string; value: string }[] = [
    { label: "Nome", value: lead.name || "—" },
    { label: "Telefone", value: lead.phone },
    { label: "Curso", value: lead.course_interest || "—" },
    { label: "Unidade", value: lead.unit_interest || "—" },
    { label: "Origem", value: lead.source || "Direto" },
    { label: "Cidade", value: lead.city || "—" },
    { label: "Objetivo", value: lead.objective || "—" },
    { label: "Nível", value: lead.level || "—" },
    { label: "Modalidade", value: lead.modalidade === "online" ? "Online" : lead.modalidade === "presencial" ? "Presencial" : "—" },
    {
      label: "Curso para",
      value:
        lead.para_quem === "outra"
          ? `Outra pessoa${lead.idade_aluno ? ` (${lead.idade_aluno} anos)` : ""}`
          : lead.para_quem === "propria"
            ? "A própria pessoa"
            : "—",
    },
  ];

  return (
    <div className="dia-modal-backdrop" onClick={onClose}>
      <div className="lm-modal" onClick={(event) => event.stopPropagation()}>
        <div className="lm-head">
          <div>
            <h4>{lead.name || lead.phone}</h4>
            <span>
              {stageName} · <a className="lm-phone" href={`https://wa.me/${lead.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">{lead.phone}</a>
              {lead.blocked_at ? " · 🚫 bloqueado" : ""}
            </span>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar"><Icon name="x" size={15} /></button>
        </div>

        <div className="lm-stages">
          {stages.filter((s) => s.board_visible).map((stage) => (
            <button
              key={stage.id}
              type="button"
              className={stage.id === lead.stage_id ? "on" : ""}
              style={stage.id === lead.stage_id ? { background: stage.color, borderColor: stage.color } : undefined}
              onClick={() => stage.id !== lead.stage_id && onMove(stage.id)}
            >
              {stage.name}
            </button>
          ))}
        </div>

        <div className="lm-tabs">
          <button type="button" className={tab === "infos" ? "on" : ""} onClick={() => setTab("infos")}>Infos</button>
          <button type="button" className={tab === "historico" ? "on" : ""} onClick={() => setTab("historico")}>
            Histórico {notes.length > 0 && <b>{notes.length}</b>}
          </button>
          <button type="button" className={tab === "followup" ? "on" : ""} onClick={() => setTab("followup")}>Follow-up</button>
        </div>

        {error && <div className="dia-modal-error">{error}</div>}

        {tab === "infos" && (
          <div>
            <div className="lm-infos">
              {infos.map((info) => (
                <div key={info.label} className="lm-info">
                  <span>{info.label}</span>
                  <strong>{info.value}</strong>
                </div>
              ))}
            </div>
            {lead.summary && (
              <div className="lm-resumo">
                <span>Resumo do atendimento (IA)</span>
                <p>{lead.summary}</p>
              </div>
            )}
            <div className="lm-actions">
              <button type="button" className="lm-delete" onClick={onDelete}>Excluir</button>
              <button
                type="button"
                className={lead.blocked_at ? "pv-btn-ghost pv-btn-sm" : "lm-delete"}
                onClick={() => {
                  void fetch(`/api/leads/${lead.id}/block`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ block: !lead.blocked_at }),
                  }).then(() => window.location.reload());
                }}
              >
                {lead.blocked_at ? "Desbloquear" : "Bloquear contato"}
              </button>
              <a
                className="pv-btn-green pv-btn-sm"
                href={`https://wa.me/${lead.phone.replace(/\D/g, "")}`}
                target="_blank"
                rel="noreferrer"
              >
                Abrir WhatsApp
              </a>
              <button
                type="button"
                className="pv-btn-green pv-btn-sm"
                onClick={() => {
                  void fetch(`/api/leads/${lead.id}/send-to-seller`, { method: "POST" })
                    .then((response) => response.json())
                    .then((data) => {
                      if (data.error) setError(data.error);
                      else if (data.notified) setError(null);
                      else setError(`Lead na fila, mas o aviso no WhatsApp falhou: ${data.notify_error || "erro"}`);
                    });
                }}
              >
                Enviar pro vendedor
              </button>
              <Link className="pv-btn pv-btn-sm" href={`/conversations?lead=${lead.id}`}>Abrir conversa</Link>
            </div>
          </div>
        )}

        {tab === "historico" && (
          <div>
            <div className="lm-label">Cadência closer</div>
            <div className="lm-cadencia">
              {CADENCIA.map((step) => {
                const next = CADENCIA.find((c) => c.n === step.n + 1);
                return (
                  <button
                    key={step.n}
                    type="button"
                    className={etapa === String(step.n) ? "on" : ""}
                    style={{ background: step.color }}
                    onClick={() => pickEtapa(etapa === String(step.n) ? "" : String(step.n))}
                  >
                    <b>{step.n}°</b> {step.label}
                    <small>{step.nextDays && next ? `sugere ${next.n}° em +${step.nextDays}d` : "encerra a cadência"}</small>
                  </button>
                );
              })}
            </div>
            <div className="lm-registrar">
              <select
                value={etapa ? `c${etapa}` : tipo ? `t${tipo}` : ""}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value.startsWith("c")) {
                    pickEtapa(value.slice(1));
                  } else {
                    pickEtapa("");
                    setTipo(value.slice(1));
                  }
                }}
              >
                <option value="">Selecione...</option>
                <optgroup label="Cadência Closer">
                  {CADENCIA.map((step) => (
                    <option key={step.n} value={`c${step.n}`}>{step.n}° {step.label}</option>
                  ))}
                </optgroup>
                <optgroup label="Outros">
                  {OUTROS.map((outro) => (
                    <option key={outro.value} value={`t${outro.value}`}>{outro.emoji} {outro.label}</option>
                  ))}
                </optgroup>
              </select>
              <input
                placeholder="O que aconteceu?"
                value={nota}
                onChange={(event) => setNota(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && void registrarCadencia()}
              />
              <button type="button" className="pv-btn pv-btn-sm" disabled={!nota.trim() || registrando} onClick={() => void registrarCadencia()}>
                {registrando ? "Salvando..." : "+ Registrar"}
              </button>
            </div>
            {etapa && (
              <div className="lm-sugestao">
                {sugDate ? (
                  <>
                    <span>Próximo follow-up junto com o registro:</span>
                    <input type="date" value={sugDate} onChange={(event) => setSugDate(event.target.value)} />
                    <input
                      className="lm-sug-title"
                      placeholder="Assunto"
                      value={sugTitle}
                      onChange={(event) => setSugTitle(event.target.value)}
                    />
                    <button type="button" onClick={() => { setSugDate(""); setSugTitle(""); }}>não agendar</button>
                  </>
                ) : (
                  <span>
                    {CADENCIA.find((c) => String(c.n) === etapa)?.nextDays
                      ? "Sem próximo follow-up — registrar só o contato."
                      : "5° encerra a cadência — nenhum follow-up será agendado."}
                  </span>
                )}
              </div>
            )}
            <div className="lm-timeline">
              {timeline.length === 0 && <p className="dia-empty">Nenhum contato registrado ainda.</p>}
              {timeline.map((item) => (
                <div className={`lm-entry ${item.isNote ? "note" : ""}`} key={item.id}>
                  <div className="lm-entry-head">
                    <strong>{item.title}{item.author ? ` · ${item.author}` : ""}</strong>
                    <time>{formatRelative(item.created_at)}</time>
                  </div>
                  {item.detail && <p>{item.detail}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "followup" && (
          <div>
            {pendingTask ? (
              <div className="lm-agendado">
                <b>✓ Agendado</b>
                <span>Data: <strong>{new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short" }).format(new Date(pendingTask.due_at))}</strong></span>
                <span>{pendingTask.title}</span>
                <em>Aparece no menu Follow-up na data marcada.</em>
              </div>
            ) : (
              <p className="pv-sub" style={{ marginBottom: 10 }}>Nenhum follow-up agendado — marque o próximo contato abaixo.</p>
            )}
            <div className="lm-fu-form">
              <label>Data
                <input type="date" value={fuDate} onChange={(event) => setFuDate(event.target.value)} />
              </label>
              <label>Nota (opcional)
                <input placeholder="Ex.: 1° Retorno Reunião" value={fuNote} onChange={(event) => setFuNote(event.target.value)} />
              </label>
            </div>
            <div className="lm-actions">
              {pendingTask && (
                <button type="button" className="pv-btn-green pv-btn-sm" disabled={fuBusy} onClick={abrirConcluir}>
                  ✓ Concluído
                </button>
              )}
              <button type="button" className="pv-btn pv-btn-sm" disabled={!fuDate || fuBusy} onClick={() => void salvarFollowup()}>
                {fuBusy ? "Salvando..." : "Salvar follow-up"}
              </button>
            </div>
          </div>
        )}

        {concluiOpen && pendingTask && (
          <div className="lm-conclui-backdrop" onClick={() => setConcluiOpen(false)}>
            <div className="lm-conclui" onClick={(event) => event.stopPropagation()}>
              <h4>✅ Concluir follow-up</h4>
              <p className="lm-conclui-sub">
                {pendingTask.title} · {new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short" }).format(new Date(pendingTask.due_at))}
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
                <button type="button" className="pv-btn-ghost pv-btn-sm" onClick={() => setConcluiOpen(false)}>Cancelar</button>
                <button
                  type="button"
                  className="pv-btn-green pv-btn-sm"
                  disabled={!concluiObs.trim() || fuBusy}
                  onClick={() => void concluirFollowup()}
                >
                  {fuBusy ? "Salvando..." : proxDate ? "Concluir e agendar próximo" : "Concluir"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
