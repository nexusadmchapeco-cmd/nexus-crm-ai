"use client";

// Painel do Vendedor — 5 sub-abas (Hoje, Semana, Mês & Metas, Disparos,
// Prospecção de Empresas), replicando o HTML de referência aprovado com o
// design system do projeto.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Viewer = { uid: string; name: string; role: string; unit: string | null };
type Vendedor = { id: string; name: string; unit: string | null };

type PainelData = {
  user: { id: string; name: string; unit: string | null; role: string };
  today: string;
  wonStageId: string | null;
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
      summary: string;
      waitingMinutes: number;
      indicacao: boolean;
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

type PlaceResult = {
  place_id: string;
  name: string;
  address: string | null;
  phone: string | null;
  rating: number | null;
  status: string;
};

const TABS = [
  { key: "hoje", label: "Hoje" },
  { key: "semana", label: "Semana" },
  { key: "mes", label: "Mês & Metas" },
  { key: "disparos", label: "Disparos" },
  { key: "prosp", label: "Prospecção de Empresas" },
];

const REVIEW_ITEMS = [
  "Quem fez reunião e não fechou — caso a caso: motivo + próxima tentativa agendada",
  "Números de todas as frentes: leads, conversão, disparo, indicações, parcerias",
  "Kanban limpo: zero lead parado +5 dias sem próxima ação",
  "Follow-ups da próxima semana agendados",
  "Status das parcerias ativas + benefícios de indicação pagos",
  "O que travou vendas na semana → anotar e reportar",
];

const FUNIL_ETAPAS: { key: string; label: string; color: string }[] = [
  { key: "novo", label: "MAPEADAS", color: "#3d8bfd" },
  { key: "contatado", label: "CONTATO FEITO", color: "#14b8a6" },
  { key: "reuniao", label: "REUNIÃO", color: "#8b5cf6" },
  { key: "negociacao", label: "NEGOCIAÇÃO", color: "#f5a623" },
  { key: "fechado", label: "PARCERIA ATIVA", color: "#22a06b" },
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

  // Prospecção
  const [segmento, setSegmento] = useState("");
  const [cidade, setCidade] = useState("Passo Fundo, RS");
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<PlaceResult[]>([]);
  const [waModal, setWaModal] = useState<{ place: PlaceResult; message: string; loading: boolean } | null>(null);

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

  async function buscar() {
    if (!segmento.trim() || buscando) return;
    setBuscando(true);
    try {
      const response = await fetch("/api/prospects/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: segmento.trim(), city: cidade }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Erro na busca.");
      setResultados(payload.results || payload.places || []);
      setError(null);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "Erro na busca.");
    } finally {
      setBuscando(false);
    }
  }

  async function salvarNoFunil(place: PlaceResult, status = "novo") {
    await fetch("/api/prospects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        place_id: place.place_id,
        status,
        company_name: place.name,
        segment: segmento.trim() || null,
        city: cidade,
        user_id: targetUserId,
      }),
    });
    setResultados((current) =>
      current.map((r) => (r.place_id === place.place_id ? { ...r, status } : r)),
    );
    void load();
  }

  async function abrirWhatsApp(place: PlaceResult) {
    setWaModal({ place, message: "", loading: true });
    const response = await fetch("/api/prospects/ai-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: place.name, segment: segmento.trim(), city: cidade }),
    });
    const payload = await response.json();
    setWaModal({ place, message: payload.message || "", loading: false });
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

      <div className="pv-tabs">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={tab === t.key ? "on" : ""} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {!data ? (
        <p className="dia-empty">Carregando painel...</p>
      ) : (
        <>
          {/* ═══ HOJE ═══ */}
          {tab === "hoje" && (
            <section>
              <div className="pv-stats">
                <div className="pv-stat b-blue"><h5>Leads na sua fila</h5><div className="v">{data.hoje.stats.fila}</div><span>Qualificados pela IA</span></div>
                <div className="pv-stat b-red"><h5>Regra dos 10 min</h5><div className="v">{data.hoje.stats.regra10}</div><span>Aguardando 1º contato</span></div>
                <div className="pv-stat b-yellow"><h5>Follow-ups de hoje</h5><div className="v">{data.hoje.stats.followups}</div><span>Agendados pelo sistema</span></div>
                <div className="pv-stat b-purple"><h5>Reuniões hoje</h5><div className="v">{data.hoje.stats.reunioes}</div><span>{data.hoje.agenda.slice(0, 3).map((a) => horaDe(a.starts_at)).join(" · ") || "Agenda livre"}</span></div>
                <div className="pv-stat b-green"><h5>Matrículas no mês</h5><div className="v">{data.hoje.stats.matriculasMes}</div><span>Meta {data.hoje.stats.metaMatriculas} · desafio {data.hoje.stats.desafio}</span></div>
              </div>
              <div className="pv-grid2">
                <div className="pv-card">
                  <div className="pv-card-h"><h3>Fila de leads · SDR IA</h3><Link className="pv-link" href="/kanban">Ver pipeline ›</Link></div>
                  {data.hoje.fila.length === 0 ? (
                    <p className="dia-empty">Fila zerada — nenhum lead esperando. 👏</p>
                  ) : (
                    data.hoje.fila.map((item) => (
                      <div className="pv-row" key={item.lead_id}>
                        <div className="pv-nm">
                          {item.name}
                          <small>{item.summary}</small>
                        </div>
                        <div className="pv-row-actions">
                          {item.indicacao && <span className="pv-chip pv-c-green">INDICAÇÃO</span>}
                          <span className={timerClass(item.waitingMinutes, item.overdue)}>{timerLabel(item.waitingMinutes)}</span>
                          <Link href={`/conversations?lead=${item.lead_id}`} className="pv-btn pv-btn-sm">Atender</Link>
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
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="pv-card pv-mt">
                <div className="pv-card-h"><h3>Tarefas do dia</h3><span className="pv-chip pv-c-orange">NADA VIRA AMANHÃ</span></div>
                {data.hoje.tarefas.length === 0 && <p className="dia-empty">Nenhuma tarefa pendente hoje.</p>}
                {data.hoje.tarefas.map((task, index) => (
                  <div className={`pv-task ${task.done ? "done" : ""}`} key={task.source || task.id || index}>
                    <input type="checkbox" checked={task.done} onChange={() => void toggleTask(task)} id={`tk-${index}`} />
                    <label htmlFor={`tk-${index}`}>
                      {task.title} {task.chip && <span className={CHIP_CLASS[task.chip]}>{CHIP_LABELS[task.chip]}</span>}
                    </label>
                    {task.lead_id && <Link className="pv-link" href={`/conversations?lead=${task.lead_id}`}>Abrir ›</Link>}
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

          {/* ═══ PROSPECÇÃO ═══ */}
          {tab === "prosp" && (
            <section>
              <div className="pv-pipe">
                {FUNIL_ETAPAS.map((etapa) => (
                  <div className="st" style={{ borderTopColor: etapa.color }} key={etapa.key}>
                    <b style={etapa.key === "fechado" ? { color: etapa.color } : undefined}>{data.prospeccao.counts[etapa.key] || 0}</b>
                    <span>{etapa.label}</span>
                  </div>
                ))}
              </div>
              <div className="pv-card">
                <div className="pv-card-h"><h3>Buscar empresas para prospectar</h3><span className="pv-gtag"><i className="pv-gdot" /> Google Places API</span></div>
                <div className="pv-search">
                  <input
                    placeholder="Segmento (academias, escritórios, escolas...)"
                    value={segmento}
                    onChange={(event) => setSegmento(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && void buscar()}
                  />
                  <select value={cidade} onChange={(event) => setCidade(event.target.value)}>
                    <option>Passo Fundo, RS</option>
                    <option>Chapecó, SC</option>
                  </select>
                  <button type="button" className="pv-btn" onClick={() => void buscar()} disabled={buscando || !segmento.trim()}>
                    {buscando ? "Buscando..." : "Buscar"}
                  </button>
                </div>
                {resultados.map((place) => (
                  <div className="pv-emp" key={place.place_id}>
                    <div>
                      <div className="nm">{place.name}</div>
                      <div className="dt">
                        {[place.address, place.rating ? `★ ${place.rating}` : null, place.phone].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <div className="acts">
                      {place.phone && (
                        <button type="button" className="pv-btn-green pv-btn-sm" onClick={() => void abrirWhatsApp(place)}>WhatsApp</button>
                      )}
                      {place.phone && (
                        <a className="pv-btn-ghost pv-btn-sm" href={`tel:${place.phone.replace(/\D/g, "")}`}>Ligar</a>
                      )}
                      <button
                        type="button"
                        className="pv-btn-ghost pv-btn-sm"
                        disabled={place.status !== "novo" && Boolean(place.status)}
                        onClick={() => void salvarNoFunil(place)}
                      >
                        {place.status && place.status !== "novo" ? "No funil ✓" : "+ Funil"}
                      </button>
                    </div>
                  </div>
                ))}
                <div className="pv-tip">💡 Ao clicar em <b>WhatsApp</b>, a IA gera a abordagem personalizada pelo segmento — você só revisa e envia. Cada contato conta na meta de prospecção.</div>
              </div>
              {data.prospeccao.funil.length > 0 && (
                <div className="pv-card pv-mt">
                  <div className="pv-card-h"><h3>Funil de parcerias</h3></div>
                  {data.prospeccao.funil.map((empresa) => (
                    <div className="pv-emp" key={empresa.id}>
                      <div>
                        <div className="nm">{empresa.company_name}</div>
                        <div className="dt">
                          {[empresa.segment, empresa.city, empresa.next_action ? `Próxima ação: ${empresa.next_action}${empresa.next_action_at ? ` (${empresa.next_action_at.slice(8)}/${empresa.next_action_at.slice(5, 7)})` : ""}` : null]
                            .filter(Boolean)
                            .join(" · ") || "Sem detalhes"}
                        </div>
                      </div>
                      <div className="acts">
                        <select
                          className="pv-select"
                          value={empresa.status}
                          onChange={(event) =>
                            void fetch("/api/prospects", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                place_id: empresa.place_id,
                                status: event.target.value,
                                company_name: empresa.company_name,
                                note: empresa.note,
                              }),
                            }).then(() => load())
                          }
                        >
                          <option value="novo">Mapeada</option>
                          <option value="contatado">Contato feito</option>
                          <option value="respondeu">Respondeu</option>
                          <option value="reuniao">Reunião</option>
                          <option value="negociacao">Negociação</option>
                          <option value="fechado">Parceria ativa</option>
                          <option value="descartado">Descartada</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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

      {/* Modal mensagem de WhatsApp gerada pela IA */}
      {waModal && (
        <div className="dia-modal-backdrop" onClick={() => setWaModal(null)}>
          <div className="dia-modal" onClick={(event) => event.stopPropagation()}>
            <div className="dia-modal-head"><h4>Abordagem — {waModal.place.name}</h4>
              <button type="button" onClick={() => setWaModal(null)} aria-label="Fechar">✕</button>
            </div>
            {waModal.loading ? (
              <p className="dia-empty">A IA está escrevendo a abordagem...</p>
            ) : (
              <>
                <textarea
                  className="pv-blockers"
                  value={waModal.message}
                  onChange={(event) => setWaModal({ ...waModal, message: event.target.value })}
                />
                <a
                  className="dia-modal-save"
                  style={{ textAlign: "center", textDecoration: "none" }}
                  href={`https://wa.me/${(waModal.place.phone || "").replace(/\D/g, "").replace(/^(?!55)/, "55")}?text=${encodeURIComponent(waModal.message)}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => void salvarNoFunil(waModal.place, "contatado")}
                >
                  Abrir no WhatsApp e marcar contato feito
                </a>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
