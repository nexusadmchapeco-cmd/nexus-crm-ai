"use client";

// Painel do Vendedor. Closer vê só o "Hoje" (minimalista); gestor/SDR têm as
// abas Semana, Mês & Metas e Disparos. Prospecção de Empresas virou o módulo
// próprio /parcerias.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LeadFicha } from "@/components/kanban/lead-ficha";

type Viewer = { uid: string; name: string; role: string; unit: string | null };
type Vendedor = { id: string; name: string; unit: string | null };

type PainelData = {
  user: { id: string; name: string; unit: string | null; role: string };
  today: string;
  wonStageId: string | null;
  indicacaoLink?: string | null;
  matriculaveis: { id: string; name: string; stage: string }[];
  hoje: {
    stats: {
      fila: number;
      regra10: number;
      followups: number;
      reunioes: number;
      matriculasMes: number;
      metaMatriculas: number;
      desafio: number;
    };
    fila: {
      lead_id: string;
      name: string;
      phone?: string;
      summary: string;
      waitingMinutes: number;
      indicacao: boolean;
      tags?: string[];
      overdue: boolean;
    }[];
    agenda: {
      id: string;
      starts_at: string;
      title: string;
      context: string | null;
      lead_id: string | null;
      lead_name: string | null;
      done: boolean;
      parceria: boolean;
    }[];
    tarefas: {
      id: string | null;
      source: string | null;
      title: string;
      chip: "followup" | "indicacao" | "parceria" | null;
      done: boolean;
      manual: boolean;
      lead_id?: string | null;
      lead_task_id?: string | null;
      wa_url?: string | null;
    }[];
  };
  semana: {
    stats: {
      respostasDisparo: number;
      parceriasContatadas: number;
      metaParceriasSemana: number;
      matriculasSemana: number;
    };
    dias: { label: string; isToday: boolean; past: boolean; items: string[] }[];
    revisao: {
      weekStart: string;
      checklist: Record<string, boolean>;
      blockers: string;
      completedAt: string | null;
      naoFechou: { lead_id: string | null; name: string | null; when: string }[];
    };
  };
  mes: {
    stats: {
      matriculas: number;
      meta: number;
      desafio: number;
      conversaoIa: number;
      metaConversao: number;
      indicacoes: number;
      metaIndicacoes: number;
      conversaoIndicacoes: number;
      diasUteisRestantes: number;
      ritmo: number;
    };
    metas: { key: string; label: string; current: number; target: number; suffix: string; pct: number; tone: string }[];
    mapa: { date: string; label: string; past: boolean }[];
  };
  disparos: {
    proximo: { date: string; numero: number; baseCount: number; grupos: number; esperadas: number } | null;
    historico: { date: string; grupo: string; enviados: number; respostas: number }[];
  };
  prospeccao: {
    counts: Record<string, number>;
    funil: {
      id: string;
      place_id: string;
      company_name: string;
      segment: string | null;
      city: string | null;
      status: string;
      note: string | null;
      next_action: string | null;
      next_action_at: string | null;
    }[];
  };
};

// Prospecção de Empresas saiu daqui: virou o módulo próprio /parcerias
// (menu lateral), operado pelo closer.
const TABS = [
  { key: "hoje", label: "Hoje" },
  { key: "semana", label: "Semana" },
  { key: "mes", label: "Mês & Metas" },
  { key: "disparos", label: "Disparos" },
];

const REVIEW_ITEMS = [
  "Quem fez reunião e não fechou — caso a caso: motivo + próxima tentativa agendada",
  "Números de todas as frentes: leads, conversão, disparo, indicações, parcerias",
  "Kanban limpo: zero lead parado +5 dias sem próxima ação",
  "Follow-ups da próxima semana agendados",
  "Status das parcerias ativas + benefícios de indicação pagos",
  "O que travou vendas na semana → anotar e reportar",
];

const CHIP_LABELS: Record<string, string> = {
  followup: "FOLLOW-UP",
  indicacao: "INDICAÇÃO",
  parceria: "PARCERIA",
};
const CHIP_CLASS: Record<string, string> = {
  followup: "pv-chip pv-c-yellow",
  indicacao: "pv-chip pv-c-green",
  parceria: "pv-chip pv-c-blue",
};

function saudacao() {
  const hour = Number(
    new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(new Date()),
  );
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function subtitulo(today: string) {
  const date = new Date(`${today}T12:00:00-03:00`);
  const texto = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
  const semana = Math.ceil(Number(today.slice(8)) / 7);
  const capitalizado = texto.charAt(0).toUpperCase() + texto.slice(1);
  return `${capitalizado} · Semana ${semana} · Aqui está o que fecha o seu dia.`;
}

function timerLabel(minutes: number) {
  if (minutes >= 60 * 24) return `${Math.floor(minutes / (60 * 24))}d`;
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`;
  return `${String(minutes).padStart(2, "0")} min`;
}

function timerClass(minutes: number, overdue: boolean) {
  if (overdue || minutes > 10) return "pv-timer pv-c-red";
  if (minutes > 5) return "pv-timer pv-c-yellow";
  return "pv-timer pv-c-green";
}

function horaDe(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function PainelVendedor({
  viewer,
  vendedores,
  initialData,
}: {
  viewer: Viewer | null;
  vendedores: Vendedor[];
  initialData?: PainelData;
}) {
  const isGestor = viewer ? viewer.role !== "vendedor" : false;
  const [selected, setSelected] = useState<string>(isGestor ? vendedores[0]?.id || "" : viewer?.uid || "");
  const [tab, setTab] = useState("hoje");
  const [data, setData] = useState<PainelData | null>(initialData || null);
  const [error, setError] = useState<string | null>(null);

  // Registrar matrícula
  const [matriculaOpen, setMatriculaOpen] = useState(false);
  const [matriculaLead, setMatriculaLead] = useState("");
  const [matriculaBusy, setMatriculaBusy] = useState(false);

  // Tarefa manual
  const [novaTarefa, setNovaTarefa] = useState("");

  // Revisão
  const [blockers, setBlockers] = useState("");

  // Metas (edição do admin)
  const [editGoals, setEditGoals] = useState(false);
  const [goalDraft, setGoalDraft] = useState<Record<string, string>>({});

  // Ficha do lead aberta por clique (modelo do CRM antigo)
  const [fichaLeadId, setFichaLeadId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (initialData) return; // modo demonstração: dados vêm prontos do servidor
    if (isGestor && !selected) return;
    try {
      const url = isGestor ? `/api/painel?u=${selected}` : "/api/painel";
      const response = await fetch(url);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Erro ao carregar o painel.");
      setData(payload);
      setBlockers(payload.semana.revisao.blockers || "");
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Erro ao carregar o painel.");
    }
  }, [isGestor, selected, initialData]);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 60000);
    return () => clearInterval(interval);
  }, [load]);

  const targetUserId = data?.user.id;

  async function toggleTask(task: PainelData["hoje"]["tarefas"][number]) {
    if (!data) return;
    // Follow-up agendado na ficha do lead: concluir marca a lead_task e
    // registra a observação na timeline do lead.
    if (task.lead_task_id && task.lead_id) {
      if (task.done) return;
      await fetch(`/api/leads/${task.lead_id}/tasks/${task.lead_task_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "done",
          done_note: `Concluído pelo Painel do Vendedor: ${task.title}`,
          author_name: viewer?.name || null,
        }),
      });
      void load();
      return;
    }
    const done = !task.done;
    setData({
      ...data,
      hoje: {
        ...data.hoje,
        tarefas: data.hoje.tarefas.map((t) => (t === task ? { ...t, done } : t)),
      },
    });
    await fetch("/api/painel/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: targetUserId,
        id: task.id,
        source: task.source,
        title: task.title,
        chip: task.chip,
        done,
      }),
    });
    void load();
  }

  async function addTask() {
    if (!novaTarefa.trim()) return;
    await fetch("/api/painel/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: targetUserId, title: novaTarefa.trim() }),
    });
    setNovaTarefa("");
    void load();
  }

  async function toggleAgenda(item: PainelData["hoje"]["agenda"][number]) {
    await fetch(`/api/appointments/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: item.done ? "confirmed" : "completed" }),
    });
    void load();
  }

  async function saveReview(patch: { checklist?: Record<string, boolean>; complete?: boolean }) {
    if (!data) return;
    await fetch("/api/painel/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: targetUserId,
        week_start: data.semana.revisao.weekStart,
        checklist: patch.checklist ?? data.semana.revisao.checklist,
        blockers,
        complete: patch.complete ?? Boolean(data.semana.revisao.completedAt),
      }),
    });
    void load();
  }

  async function registrarMatricula() {
    if (!data?.wonStageId || !matriculaLead || matriculaBusy) return;
    setMatriculaBusy(true);
    try {
      await fetch(`/api/leads/${matriculaLead}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage_id: data.wonStageId }),
      });
      setMatriculaOpen(false);
      setMatriculaLead("");
      void load();
    } finally {
      setMatriculaBusy(false);
    }
  }

  async function saveGoals() {
    if (!data) return;
    const month = `${data.today.slice(0, 7)}-01`;
    await Promise.all(
      Object.entries(goalDraft)
        .filter(([, value]) => value !== "")
        .map(([metric, value]) =>
          fetch("/api/painel/goals", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: targetUserId, month, metric, target: Number(value) }),
          }),
        ),
    );
    setEditGoals(false);
    setGoalDraft({});
    void load();
  }

  const firstName = useMemo(() => (data?.user.name || viewer?.name || "").split(" ")[0], [data, viewer]);


  if (!viewer) {
    return (
      <div className="page-shell">
        <div className="page-header"><div><div className="eyebrow">Painel do vendedor</div><h1>Painel do Vendedor</h1><p>Faça login para ver o painel.</p></div></div>
      </div>
    );
  }

  return (
    <div className="pv-shell">
      <div className="eyebrow">PAINEL DO VENDEDOR</div>
      <div className="pv-hgroup">
        <div>
          <h1>{saudacao()}, {firstName || "vendedor"}</h1>
          <div className="pv-hline" />
          <p className="pv-sub">{data ? subtitulo(data.today) : "Carregando..."}</p>
        </div>
        <div className="pv-head-actions">
          {isGestor && (
            <select className="pv-select" value={selected} onChange={(event) => setSelected(event.target.value)}>
              {vendedores.length === 0 && <option value="">Sem vendedores cadastrados</option>}
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} {v.unit ? `· ${v.unit === "chapeco" ? "Chapecó" : "Passo Fundo"}` : ""}
                </option>
              ))}
            </select>
          )}
          <button type="button" className="pv-btn" onClick={() => setMatriculaOpen(true)}>＋ Registrar matrícula</button>
        </div>
      </div>

      {error && <div className="vendedor-error">{error}</div>}
      {data?.hoje.stats.regra10 ? (
        <div className="pv-alert">
          🚨 {data.hoje.stats.regra10} lead{data.hoje.stats.regra10 > 1 ? "s" : ""} estourando a regra dos 10 minutos — atenda agora.
        </div>
      ) : null}

      {data && data.hoje.stats.followups > 0 && (
        <Link className="pv-alert pv-alert-fu" href="/follow-up">
          ⏰ {data.hoje.stats.followups} follow-up{data.hoje.stats.followups > 1 ? "s" : ""} para hoje ou atrasado{data.hoje.stats.followups > 1 ? "s" : ""} — abrir Follow-up ›
        </Link>
      )}

      {/* Closer: só o "Hoje", super minimalista. Semana/Metas/Disparos/
          Prospecção são gestão — ficam com o admin e o SDR. */}
      {isGestor && (
        <div className="pv-tabs">
          {TABS.map((t) => (
            <button key={t.key} type="button" className={tab === t.key ? "on" : ""} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {!data ? (
        <p className="dia-empty">Carregando painel...</p>
      ) : (
        <>
          {/* ═══ HOJE ═══ */}
          {tab === "hoje" && (
            <section>
              {/* Minimalista: 3 números. Regra dos 10 min já tem o alerta
                  vermelho no topo; follow-ups têm menu próprio. */}
              <div className="pv-stats">
                <div className="pv-stat b-blue"><h5>Leads na sua fila</h5><div className="v">{data.hoje.stats.fila}</div><span>Qualificados pela IA</span></div>
                <div className="pv-stat b-purple"><h5>Reuniões hoje</h5><div className="v">{data.hoje.stats.reunioes}</div><span>{data.hoje.agenda.slice(0, 3).map((a) => horaDe(a.starts_at)).join(" · ") || "Agenda livre"}</span></div>
                <div className="pv-stat b-green"><h5>Matrículas no mês</h5><div className="v">{data.hoje.stats.matriculasMes}</div><span>Meta {data.hoje.stats.metaMatriculas}</span></div>
              </div>
              <div className="pv-grid2">
                <div className="pv-card">
                  <div className="pv-card-h"><h3>Leads quentes · atender agora</h3><Link className="pv-link" href="/kanban">Ver pipeline ›</Link></div>
                  {data.hoje.fila.length === 0 ? (
                    <p className="dia-empty">Fila zerada — nenhum lead esperando. 👏</p>
                  ) : (
                    data.hoje.fila.map((item) => (
                      <div className="pv-row" key={item.lead_id}>
                        <button type="button" className="pv-nm pv-nm-click" onClick={() => setFichaLeadId(item.lead_id)}>
                          {item.name}
                          <small>{item.summary}</small>
                        </button>
                        <div className="pv-row-actions">
                          {(item.tags || []).map((tag) => (
                            <span key={tag} className={`pv-chip ${tag === "Experimental" ? "pv-c-blue" : "pv-c-red"}`}>
                              {tag.toUpperCase()}
                            </span>
                          ))}
                          {item.indicacao && <span className="pv-chip pv-c-green">INDICAÇÃO</span>}
                          <span className={timerClass(item.waitingMinutes, item.overdue)}>{timerLabel(item.waitingMinutes)}</span>
                          {item.phone && (
                            <a className="pv-btn-green pv-btn-sm" href={`https://wa.me/${item.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">WhatsApp</a>
                          )}
                          <Link href={`/conversations?lead=${item.lead_id}`} className="pv-btn-ghost pv-btn-sm">Ver conversa</Link>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="pv-card">
                  <div className="pv-card-h"><h3>Agenda de hoje</h3><Link className="pv-link" href="/agenda">Agenda ›</Link></div>
                  {data.hoje.agenda.length === 0 ? (
                    <p className="dia-empty">Nenhum compromisso hoje.</p>
                  ) : (
                    data.hoje.agenda.map((item) => (
                      <div className={`pv-task ${item.done ? "done" : ""}`} key={item.id}>
                        <input type="checkbox" checked={item.done} onChange={() => void toggleAgenda(item)} id={`ag-${item.id}`} />
                        <label htmlFor={`ag-${item.id}`}>
                          <b>{horaDe(item.starts_at)}</b> — {item.lead_name || item.title} {item.parceria && <span className="pv-chip pv-c-blue">PARCERIA</span>}
                          {item.context && <small>{item.context}</small>}
                        </label>
                        {item.lead_id && (
                          <button type="button" className="pv-link" onClick={() => setFichaLeadId(item.lead_id)}>
                            Ficha ›
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
              {data.indicacaoLink && (
                <div className="pv-indicacao pv-mt">
                  <span>Link de indicação</span>
                  <input readOnly value={data.indicacaoLink} onFocus={(event) => event.target.select()} />
                  <button
                    type="button"
                    className="pv-btn pv-btn-sm"
                    onClick={() => {
                      void navigator.clipboard?.writeText(data.indicacaoLink || "");
                    }}
                  >
                    Copiar
                  </button>
                </div>
              )}
              <div className="pv-card pv-mt">
                <div className="pv-card-h"><h3>Tarefas do dia</h3></div>
                {data.hoje.tarefas.length === 0 && <p className="dia-empty">Nenhuma tarefa pendente hoje.</p>}
                {data.hoje.tarefas.map((task, index) => (
                  <div className={`pv-task ${task.done ? "done" : ""}`} key={task.source || task.id || index}>
                    <input type="checkbox" checked={task.done} onChange={() => void toggleTask(task)} id={`tk-${index}`} />
                    <label htmlFor={`tk-${index}`}>
                      {task.title} {task.chip && <span className={CHIP_CLASS[task.chip]}>{CHIP_LABELS[task.chip]}</span>}
                    </label>
                    {task.wa_url && !task.done && (
                      <a className="pv-btn-green pv-btn-sm" href={task.wa_url} target="_blank" rel="noreferrer">
                        Enviar no WhatsApp
                      </a>
                    )}
                    {task.lead_id && (
                      <button type="button" className="pv-link" onClick={() => setFichaLeadId(task.lead_id!)}>
                        Ficha ›
                      </button>
                    )}
                  </div>
                ))}
                <div className="pv-add-task">
                  <input
                    placeholder="Adicionar tarefa manual..."
                    value={novaTarefa}
                    onChange={(event) => setNovaTarefa(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && void addTask()}
                  />
                  <button type="button" className="pv-btn pv-btn-sm" onClick={() => void addTask()} disabled={!novaTarefa.trim()}>Adicionar</button>
                </div>
              </div>
            </section>
          )}

          {/* ═══ SEMANA ═══ */}
          {tab === "semana" && (
            <section>
              <div className="pv-stats">
                <div className="pv-stat b-orange"><h5>Respostas do disparo</h5><div className="v">{data.semana.stats.respostasDisparo}</div><span>Último disparo da base</span></div>
                <div className="pv-stat b-blue"><h5>Parcerias contatadas</h5><div className="v">{data.semana.stats.parceriasContatadas}</div><span>Meta {data.semana.stats.metaParceriasSemana} na semana</span></div>
                <div className="pv-stat b-green"><h5>Matrículas na semana</h5><div className="v">{data.semana.stats.matriculasSemana}</div><span>Contra a meta do mês</span></div>
              </div>
              <div className="pv-week">
                {data.semana.dias.map((dia) => (
                  <div className={`pv-day ${dia.isToday ? "today" : ""}`} key={dia.label}>
                    <h4>{dia.isToday ? `● ${dia.label} — HOJE` : dia.label}</h4>
                    <ul>
                      {dia.items.map((item) => (
                        <li key={item} className={dia.past ? "ok" : ""}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <div className="pv-card pv-mt">
                <div className="pv-card-h">
                  <h3>Sexta · Revisão semanal completa</h3>
                  <span className="pv-chip pv-c-orange">ROTEIRO FIXO</span>
                </div>
                {data.semana.revisao.naoFechou.length > 0 && (
                  <div className="pv-naofechou">
                    <strong>Reuniões da semana que ainda não fecharam:</strong>
                    {data.semana.revisao.naoFechou.map((item, index) => (
                      <span key={index}>
                        {item.lead_id ? <Link href={`/conversations?lead=${item.lead_id}`}>{item.name}</Link> : item.name}
                        {index < data.semana.revisao.naoFechou.length - 1 ? " · " : ""}
                      </span>
                    ))}
                  </div>
                )}
                {REVIEW_ITEMS.map((item, index) => {
                  const key = String(index + 1);
                  const checked = Boolean(data.semana.revisao.checklist[key]);
                  return (
                    <div className={`pv-task ${checked ? "done" : ""}`} key={key}>
                      <input
                        type="checkbox"
                        checked={checked}
                        id={`rv-${key}`}
                        onChange={() =>
                          void saveReview({ checklist: { ...data.semana.revisao.checklist, [key]: !checked } })
                        }
                      />
                      <label htmlFor={`rv-${key}`}>{item}</label>
                    </div>
                  );
                })}
                <textarea
                  className="pv-blockers"
                  placeholder="O que travou vendas nessa semana? (vai no resumo pro gestor)"
                  value={blockers}
                  onChange={(event) => setBlockers(event.target.value)}
                  onBlur={() => void saveReview({})}
                />
                <button
                  type="button"
                  className="pv-btn"
                  disabled={Boolean(data.semana.revisao.completedAt)}
                  onClick={() => void saveReview({ complete: true })}
                >
                  {data.semana.revisao.completedAt ? "Revisão concluída ✓" : "Concluir revisão e enviar resumo"}
                </button>
              </div>
            </section>
          )}

          {/* ═══ MÊS & METAS ═══ */}
          {tab === "mes" && (
            <section>
              <div className="pv-stats">
                <div className="pv-stat b-green"><h5>Matrículas</h5><div className="v">{data.mes.stats.matriculas}</div><span>Meta {data.mes.stats.meta} · desafio {data.mes.stats.desafio}</span></div>
                <div className="pv-stat b-blue"><h5>Conversão leads IA</h5><div className="v">{data.mes.stats.conversaoIa}%</div><span>Meta {data.mes.stats.metaConversao}%</span></div>
                <div className="pv-stat b-teal"><h5>Indicações</h5><div className="v">{data.mes.stats.indicacoes}</div><span>Meta {data.mes.stats.metaIndicacoes} · conv. {data.mes.stats.conversaoIndicacoes}%</span></div>
                <div className="pv-stat b-purple"><h5>Dias úteis restantes</h5><div className="v">{data.mes.stats.diasUteisRestantes}</div><span>~{data.mes.stats.ritmo} matrícula/dia útil</span></div>
              </div>
              <div className="pv-grid2">
                <div className="pv-card">
                  <div className="pv-card-h">
                    <h3>Metas do mês</h3>
                    {viewer.role === "admin" &&
                      (editGoals ? (
                        <button type="button" className="pv-btn pv-btn-sm" onClick={() => void saveGoals()}>Salvar metas</button>
                      ) : (
                        <button type="button" className="pv-btn-ghost pv-btn-sm" onClick={() => setEditGoals(true)}>Editar metas</button>
                      ))}
                  </div>
                  {data.mes.metas.map((meta) => (
                    <div className="pv-meta" key={meta.key}>
                      <div className="mr">
                        <span>{meta.label}</span>
                        {editGoals && meta.key !== "parados" ? (
                          <input
                            className="pv-goal-input"
                            type="number"
                            placeholder={String(meta.target)}
                            value={goalDraft[meta.key] ?? ""}
                            onChange={(event) => setGoalDraft({ ...goalDraft, [meta.key]: event.target.value })}
                          />
                        ) : (
                          <span>
                            {meta.key === "parados"
                              ? meta.current === 0
                                ? "0 ✓"
                                : meta.current
                              : `${meta.current}${meta.suffix} / ${meta.target}${meta.suffix}`}
                          </span>
                        )}
                      </div>
                      <div className="pv-bar"><i className={meta.tone} style={{ width: `${meta.pct}%` }} /></div>
                    </div>
                  ))}
                </div>
                <div className="pv-card">
                  <div className="pv-card-h"><h3>Mapa do mês</h3></div>
                  {data.mes.mapa.map((item) => (
                    <div className={`pv-task ${item.past ? "done" : ""}`} key={item.date}>
                      <input type="checkbox" checked={item.past} readOnly />
                      <label>{item.label}</label>
                    </div>
                  ))}
                  <div className="pv-tip">🎯 <b>Bônus:</b> nível 1 aos {data.mes.stats.meta} · nível 2 aos {data.mes.stats.desafio} · extra por indicações 40%+ e 4 parcerias fechadas.</div>
                </div>
              </div>
            </section>
          )}

          {/* ═══ DISPAROS ═══ */}
          {tab === "disparos" && (
            <section>
              {data.disparos.proximo ? (
                <div className="pv-disp">
                  <div className="pv-disp-eyebrow">PRÓXIMO DISPARO · QUINZENAL Nº {data.disparos.proximo.numero}</div>
                  <h3>
                    {new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long" }).format(new Date(`${data.disparos.proximo.date}T12:00:00-03:00`))} — base completa
                  </h3>
                  <p>Um disparo, mensagem adaptada por grupo (frios, reunião sem fechar, ex-alunos, antigos). Todo mundo que responder cai na sua fila.</p>
                  <div className="pv-dstats">
                    <div><b>{data.disparos.proximo.baseCount}</b><span>contatos na base</span></div>
                    <div><b>{data.disparos.proximo.grupos}</b><span>grupos de mensagem</span></div>
                    <div><b>~{data.disparos.proximo.esperadas}</b><span>respostas esperadas</span></div>
                  </div>
                  <Link href="/campaigns" className="pv-btn">Preparar disparo</Link>
                  <Link href="/campaigns" className="pv-btn-dark">Revisar mensagens por grupo</Link>
                </div>
              ) : (
                <div className="pv-card"><p className="dia-empty">Os disparos quinzenais deste mês já passaram — o próximo aparece na virada do mês.</p></div>
              )}
              <div className="pv-card pv-mt">
                <div className="pv-card-h"><h3>Histórico de disparos</h3></div>
                {data.disparos.historico.length === 0 ? (
                  <p className="dia-empty">Nenhum disparo registrado ainda.</p>
                ) : (
                  <div className="pv-table-wrap">
                    <table className="pv-table">
                      <thead>
                        <tr><th>DATA</th><th>GRUPO</th><th>ENVIADOS</th><th>RESPOSTAS</th></tr>
                      </thead>
                      <tbody>
                        {data.disparos.historico.map((item, index) => (
                          <tr key={index}>
                            <td><b>{item.date.slice(8)}/{item.date.slice(5, 7)}</b></td>
                            <td>{item.grupo}</td>
                            <td>{item.enviados}</td>
                            <td><b>{item.respostas}</b></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          )}

        </>
      )}

      {/* Modal registrar matrícula */}
      {matriculaOpen && data && (
        <div className="dia-modal-backdrop" onClick={() => setMatriculaOpen(false)}>
          <div className="dia-modal" onClick={(event) => event.stopPropagation()}>
            <div className="dia-modal-head"><h4>Registrar matrícula 🎉</h4>
              <button type="button" onClick={() => setMatriculaOpen(false)} aria-label="Fechar">✕</button>
            </div>
            <p className="pv-sub" style={{ marginBottom: 10 }}>Escolha o lead que fechou — ele vai para a etapa Matriculado.</p>
            <select className="pv-select pv-select-full" value={matriculaLead} onChange={(event) => setMatriculaLead(event.target.value)}>
              <option value="">Selecione o lead...</option>
              {data.matriculaveis.map((lead) => (
                <option key={lead.id} value={lead.id}>{lead.name} — {lead.stage}</option>
              ))}
            </select>
            <button type="button" className="dia-modal-save" disabled={!matriculaLead || matriculaBusy} onClick={() => void registrarMatricula()}>
              {matriculaBusy ? "Salvando..." : "Confirmar matrícula"}
            </button>
          </div>
        </div>
      )}

      {/* Ficha completa do lead — clicou na pessoa, abre tudo (modelo antigo) */}
      {fichaLeadId && (
        <LeadFicha
          leadId={fichaLeadId}
          authorName={viewer?.name || null}
          onClose={() => setFichaLeadId(null)}
          onChanged={() => void load()}
        />
      )}
    </div>
  );
}
