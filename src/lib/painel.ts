// Painel do Vendedor — montagem de dados no servidor (spec 31/07/2026).
// Tudo é unit-scoped: o vendedor vê só a unidade dele; o admin escolhe qual
// painel de vendedor está olhando.

import type { SessionUser } from "@/lib/auth";
import { saoPauloDayBounds } from "@/lib/day";
import { createAdminClient } from "@/lib/supabase/admin";
import { unitVisibleTo } from "@/lib/units";

export type PainelTask = {
  id: string | null;
  source: string | null;
  title: string;
  chip: "followup" | "indicacao" | "parceria" | null;
  done: boolean;
  manual: boolean;
  lead_id?: string | null;
  // Follow-up agendado na ficha do lead (lead_tasks): concluir marca a task.
  lead_task_id?: string | null;
  // Atalho de WhatsApp com mensagem pronta (ex.: link de indicação 30 dias).
  wa_url?: string | null;
};

const DEFAULT_GOALS: { key: string; label: string; target: number; suffix?: string }[] = [
  { key: "matriculas", label: "Matrículas totais", target: 30 },
  { key: "matriculas_desafio", label: "Matrículas (desafio)", target: 35 },
  { key: "conversao_ia", label: "Conversão sobre leads da IA", target: 25, suffix: "%" },
  { key: "matriculas_reativacao", label: "Matrículas por reativação", target: 4 },
  { key: "indicacoes", label: "Indicações recebidas", target: 20 },
  { key: "conversao_indicacoes", label: "Conversão de indicações", target: 40, suffix: "%" },
  { key: "parcerias", label: "Parcerias fechadas", target: 4 },
  { key: "prospeccao_contatos", label: "Contatos de prospecção", target: 40 },
];

function spNow() {
  return new Date();
}

function spDateString(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// Minutos do dia em São Paulo (para a janela 10h–19h da regra dos 10 min).
function spMinutesOfDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value || 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value || 0);
  return hour * 60 + minute;
}

function mondayOf(dateStr: string) {
  const base = new Date(`${dateStr}T00:00:00-03:00`);
  const weekday = (base.getUTCDay() + 6) % 7;
  const monday = new Date(base);
  monday.setUTCDate(base.getUTCDate() - weekday);
  return monday;
}

// Segundas do mês (para disparos: 2ª e 4ª; indicação IA: 1ª; fechamento:
// última sexta).
function monthKeyDates(year: number, month: number) {
  const mondays: Date[] = [];
  let lastFriday: Date | null = null;
  for (let day = 1; day <= 31; day += 1) {
    const date = new Date(Date.UTC(year, month - 1, day, 3));
    if (date.getUTCMonth() !== month - 1) break;
    if (date.getUTCDay() === 1) mondays.push(date);
    if (date.getUTCDay() === 5) lastFriday = date;
  }
  return { mondays, lastFriday };
}

export async function getPainelData(target: SessionUser) {
  const supabase = createAdminClient();
  const unit = target.role === "vendedor" ? target.unit : null;
  const now = spNow();
  const { start: dayStart, end: dayEnd, today } = saoPauloDayBounds();
  const [yearStr, monthStr] = today.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const monthStart = new Date(`${yearStr}-${monthStr}-01T00:00:00-03:00`);
  const weekStart = mondayOf(today);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 7);
  const weekStartStr = spDateString(weekStart);

  const { data: operationsRow } = await supabase
    .from("ai_settings")
    .select("global_prompt")
    .eq("name", "__operations__")
    .maybeSingle();
  let publicWhatsApp = "";
  try {
    publicWhatsApp = JSON.parse(operationsRow?.global_prompt || "{}").public_whatsapp_number || "";
  } catch {
    publicWhatsApp = "";
  }

  const [
    { data: stages },
    { data: leadsRaw },
    { data: appointmentsRaw },
    { data: tasksRows },
    { data: reviewRow },
    { data: goalsRows },
    { data: prospectsRows },
    { data: campaignEvents },
  ] = await Promise.all([
    supabase.from("pipeline_stages").select("id, name, role"),
    supabase
      .from("leads")
      .select("*")
      .order("last_message_at", { ascending: false })
      .limit(1000),
    supabase
      .from("appointments")
      .select("id, title, type, starts_at, status, notes, lead:leads(id, name, phone, unit_interest, stage_id)")
      .gte("starts_at", new Date(dayStart.getTime() - 8 * 86400000).toISOString())
      .lte("starts_at", weekEnd.toISOString())
      .order("starts_at"),
    supabase
      .from("seller_tasks")
      .select("*")
      .eq("user_id", target.uid)
      .eq("due_date", today),
    supabase
      .from("weekly_reviews")
      .select("*")
      .eq("user_id", target.uid)
      .eq("week_start", weekStartStr)
      .maybeSingle(),
    supabase
      .from("panel_goals")
      .select("metric, target")
      .eq("user_id", target.uid)
      .eq("month", `${yearStr}-${monthStr}-01`),
    supabase.from("prospects").select("*").order("created_at", { ascending: false }).limit(200),
    supabase
      .from("lead_events")
      .select("lead_id, created_at, metadata")
      .eq("event_type", "campaign_sent")
      .gte("created_at", new Date(now.getTime() - 90 * 86400000).toISOString())
      .order("created_at", { ascending: false })
      .limit(2000),
  ]);

  // Follow-ups agendados na ficha do lead (lead_tasks) vencendo até hoje.
  const { data: leadTasksRaw } = await supabase
    .from("lead_tasks")
    .select("id, title, due_at, lead:leads(id, name, phone, unit_interest)")
    .eq("status", "pending")
    .lte("due_at", dayEnd.toISOString())
    .order("due_at")
    .limit(100);

  const stageById = new Map((stages || []).map((s) => [s.id, s]));
  const stageByRole = new Map((stages || []).map((s) => [s.role, s]));
  const leads = (leadsRaw || []).filter((lead) => unitVisibleTo(lead.unit_interest, unit));
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const roleOf = (lead: { stage_id: string }) => stageById.get(lead.stage_id)?.role || "";

  const wonStageId = stageByRole.get("won")?.id || null;
  const activeRoles = new Set(["new_lead", "ai_service", "qualifying", "hot_lead", "handoff", "closer_owns"]);
  const isIndicacao = (lead: { source: string | null }) =>
    Boolean(lead.source && lead.source.toLowerCase().includes("indica"));

  // ── Fila: leads em "Qualificado" (hot_lead) esperando o vendedor. Timer a
  // partir do último evento de entrada na etapa (fallback updated_at).
  const filaLeads = leads.filter((lead) => roleOf(lead) === "hot_lead" && !lead.opted_out_at);
  const filaIds = filaLeads.map((l) => l.id);
  let qualifiedAt = new Map<string, string>();
  if (filaIds.length) {
    const { data: qualifiedEvents } = await supabase
      .from("lead_events")
      .select("lead_id, created_at, event_type, metadata")
      .in("lead_id", filaIds)
      .in("event_type", ["ai_qualified", "stage_changed_manually"])
      .order("created_at", { ascending: false })
      .limit(500);
    for (const event of qualifiedEvents || []) {
      if (qualifiedAt.has(event.lead_id)) continue;
      const meta = (event.metadata || {}) as { stage?: string; stage_id?: string };
      const isEntry =
        meta.stage === "Qualificado" ||
        (meta.stage_id && stageById.get(meta.stage_id)?.role === "hot_lead");
      if (isEntry) qualifiedAt.set(event.lead_id, event.created_at);
    }
  }
  const minutesOfDay = spMinutesOfDay(now);
  const inWindow = minutesOfDay >= 10 * 60 && minutesOfDay <= 19 * 60;
  const fila = filaLeads
    .map((lead) => {
      const since = new Date(qualifiedAt.get(lead.id) || lead.updated_at);
      const waitingMinutes = Math.max(0, Math.floor((now.getTime() - since.getTime()) / 60000));
      const detalhes = [lead.objective, lead.unit_interest || lead.city, lead.source]
        .filter(Boolean)
        .join(" · ");
      return {
        lead_id: lead.id,
        name: lead.name || lead.phone,
        phone: lead.phone,
        summary: detalhes || "Qualificado pela IA",
        waitingMinutes,
        indicacao: isIndicacao(lead),
        tags: (lead as { tags?: string[] }).tags || [],
        overdue: inWindow && waitingMinutes > 10,
      };
    })
    .sort((a, b) => Number(b.indicacao) - Number(a.indicacao) || b.waitingMinutes - a.waitingMinutes);

  // ── Agenda de hoje + no-shows de ontem.
  const appointments = (appointmentsRaw || []).filter((item) =>
    unitVisibleTo((item.lead as { unit_interest?: string | null } | null)?.unit_interest, unit),
  );
  const agendaHoje = appointments
    .filter((a) => a.starts_at >= dayStart.toISOString() && a.starts_at <= dayEnd.toISOString())
    .filter((a) => ["scheduled", "confirmed", "completed"].includes(a.status))
    .map((a) => ({
      id: a.id,
      starts_at: a.starts_at,
      title: a.title,
      context: a.notes || null,
      lead_id: (a.lead as { id?: string } | null)?.id || null,
      lead_name: (a.lead as { name?: string | null } | null)?.name || null,
      done: a.status === "completed",
      parceria: /parceria|convênio|convenio|empresa/i.test(`${a.title} ${a.notes || ""}`),
    }));

  const yesterdayStart = new Date(dayStart.getTime() - 86400000);
  const noShows = appointments.filter(
    (a) =>
      (a.status === "no_show" ||
        (["scheduled", "confirmed"].includes(a.status) && a.starts_at < dayStart.toISOString())) &&
      a.starts_at >= yesterdayStart.toISOString() &&
      a.starts_at < dayStart.toISOString(),
  );

  // ── Tarefas do dia: automáticas (regras) + manuais + estado persistido.
  const taskState = new Map<string, { id: string; done: boolean }>();
  for (const row of tasksRows || []) {
    if (row.source) taskState.set(row.source, { id: row.id, done: Boolean(row.done_at) });
  }
  const tarefas: PainelTask[] = [];

  let followupsHoje = 0;
  try {
    const { count } = await supabase
      .from("followups")
      .select("id", { count: "exact", head: true })
      .eq("status", "pendente")
      .lte("scheduled_for", dayEnd.toISOString());
    followupsHoje = (count || 0) + (leadTasksRaw || []).length;
  } catch {
    followupsHoje = (leadTasksRaw || []).length;
  }

  // Follow-ups (automáticos e manuais) NÃO entram nas Tarefas do dia — eles
  // vivem no menu dedicado /follow-up (briefing §6 + pedido do closer).
  const scheduledLeadIds = new Set<string>();
  for (const task of leadTasksRaw || []) {
    const taskLead = task.lead as { id?: string } | null;
    if (taskLead?.id) scheduledLeadIds.add(taskLead.id);
  }

  const followupLeads = leads.filter(
    (lead) =>
      activeRoles.has(roleOf(lead)) &&
      !lead.opted_out_at &&
      lead.last_message_at < new Date(now.getTime() - 3 * 86400000).toISOString() &&
      lead.last_message_at >= new Date(now.getTime() - 30 * 86400000).toISOString(),
  );
  for (const appointment of noShows) {
    const source = `ns:${appointment.id}`;
    const state = taskState.get(source);
    const leadName = (appointment.lead as { name?: string | null } | null)?.name || appointment.title;
    tarefas.push({
      id: state?.id || null,
      source,
      title: `Recuperar no-show: ${leadName} (ontem)`,
      chip: null,
      done: state?.done || false,
      manual: false,
      lead_id: (appointment.lead as { id?: string } | null)?.id || null,
    });
  }
  for (const row of tasksRows || []) {
    if (row.manual) {
      tarefas.push({
        id: row.id,
        source: null,
        title: row.title,
        chip: (row.chip as PainelTask["chip"]) || null,
        done: Boolean(row.done_at),
        manual: true,
      });
    }
  }

  // ── Números do mês.
  const monthIso = monthStart.toISOString();
  const wonLeads = leads.filter((lead) => roleOf(lead) === "won");

  // ── Indicação 30 dias pós-matrícula (decisão do diretor: SEM IA e sem
  // template — o sistema só lembra e o closer manda na mão). O aluno ganha o
  // PRÓPRIO link, com mensagem pronta; a tarefa some quando marcada feita.
  if (publicWhatsApp) {
    const now30 = new Date(now.getTime() - 30 * 86400000).toISOString();
    const now90 = new Date(now.getTime() - 90 * 86400000).toISOString();
    const elegiveis = wonLeads.filter(
      (lead) => lead.phone && lead.updated_at <= now30 && lead.updated_at >= now90,
    );
    for (const lead of elegiveis) {
      const source = `ind:${lead.id}`;
      const state = taskState.get(source);
      const firstName = (lead.name || "").split(" ")[0] || "aluno(a)";
      const linkAluno = `https://wa.me/${publicWhatsApp}?text=${encodeURIComponent(
        `Olá! Fui indicado(a) por ${firstName} e quero saber mais sobre a Nexus English Center 😊`,
      )}`;
      const mensagem =
        `Oi ${firstName}! 🎉 Agora que você faz parte da Nexus English Center, ` +
        `você tem direito a um link de indicação próprio e único. Mande para até 5 amigos: ` +
        `assim que eles fizerem a matrícula, você ganha um crédito aqui com a gente — ` +
        `e seu amigo recebe uma condição especial para começar na Nexus. Seu link: ${linkAluno}`;
      tarefas.push({
        id: state?.id || null,
        source,
        title: `Enviar link de indicação: ${lead.name || lead.phone} (30 dias de matrícula)`,
        chip: "indicacao",
        done: state?.done || false,
        manual: false,
        lead_id: lead.id,
        wa_url: `https://wa.me/${lead.phone.replace(/\D/g, "")}?text=${encodeURIComponent(mensagem)}`,
      });
    }
  }
  const matriculasMes = wonLeads.filter((lead) => lead.updated_at >= monthIso).length;
  const matriculasSemana = wonLeads.filter((lead) => lead.updated_at >= weekStart.toISOString()).length;
  const indicacoesMes = leads.filter((lead) => isIndicacao(lead) && lead.created_at >= monthIso).length;
  const indicacoesWon = wonLeads.filter(
    (lead) => isIndicacao(lead) && lead.updated_at >= monthIso,
  ).length;
  const qualificadosMes = leads.filter(
    (lead) =>
      ["hot_lead", "handoff", "closer_owns", "won"].includes(roleOf(lead)) &&
      lead.updated_at >= monthIso,
  ).length;
  const conversaoIa = qualificadosMes > 0 ? Math.round((matriculasMes / qualificadosMes) * 100) : 0;
  const conversaoIndicacoes =
    indicacoesMes > 0 ? Math.round((indicacoesWon / indicacoesMes) * 100) : 0;
  const paradosCinco = leads.filter(
    (lead) =>
      activeRoles.has(roleOf(lead)) &&
      !lead.opted_out_at &&
      lead.last_message_at < new Date(now.getTime() - 5 * 86400000).toISOString(),
  ).length;

  // ── Prospecção / parcerias.
  const prospects = (prospectsRows || []).filter(
    (p) => !p.user_id || p.user_id === target.uid,
  );
  const prospectCounts: Record<string, number> = {
    novo: 0,
    contatado: 0,
    respondeu: 0,
    reuniao: 0,
    negociacao: 0,
    fechado: 0,
    descartado: 0,
  };
  for (const p of prospects) prospectCounts[p.status] = (prospectCounts[p.status] || 0) + 1;
  const prospeccaoSemana = prospects.filter(
    (p) => p.contacted_at && p.contacted_at >= weekStart.toISOString(),
  ).length;
  const prospeccaoMes = prospects.filter((p) => p.contacted_at && p.contacted_at >= monthIso).length;
  const parceriasFechadas = prospects.filter(
    (p) => p.status === "fechado",
  ).length;

  // ── Metas (padrão da spec, sobrescritas pelo admin em panel_goals).
  const goalOverrides = new Map((goalsRows || []).map((g) => [g.metric, Number(g.target)]));
  const goalTarget = (key: string) =>
    goalOverrides.get(key) ?? DEFAULT_GOALS.find((g) => g.key === key)?.target ?? 0;
  const metaMatriculas = goalTarget("matriculas");
  const currentByKey: Record<string, number> = {
    matriculas: matriculasMes,
    conversao_ia: conversaoIa,
    matriculas_reativacao: 0,
    indicacoes: indicacoesMes,
    conversao_indicacoes: conversaoIndicacoes,
    parcerias: parceriasFechadas,
    prospeccao_contatos: prospeccaoMes,
  };

  // Matrículas por reativação: leads matriculados que responderam a disparo.
  const respondedCampaign = new Set(
    (campaignEvents || []).map((e) => e.lead_id).filter((id) => leadById.has(id)),
  );
  currentByKey.matriculas_reativacao = wonLeads.filter(
    (lead) => lead.updated_at >= monthIso && respondedCampaign.has(lead.id),
  ).length;

  const metas = DEFAULT_GOALS.filter((g) => g.key !== "matriculas_desafio").map((goal) => {
    const target = goalTarget(goal.key);
    const current = currentByKey[goal.key] ?? 0;
    const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
    return {
      key: goal.key,
      label: goal.label,
      current,
      target,
      suffix: goal.suffix || "",
      pct,
      tone: pct >= 70 ? "green" : pct >= 45 ? "orange" : "yellow",
    };
  });
  metas.push({
    key: "parados",
    label: "Leads parados +5 dias",
    current: paradosCinco,
    target: 0,
    suffix: "",
    pct: paradosCinco === 0 ? 100 : Math.max(10, 100 - paradosCinco * 10),
    tone: paradosCinco === 0 ? "green" : "yellow",
  });

  // ── Dias restantes / ritmo.
  const { mondays, lastFriday } = monthKeyDates(year, month);
  const lastDay = new Date(Date.UTC(year, month, 0, 3));
  let diasUteisRestantes = 0;
  for (let d = new Date(`${today}T12:00:00-03:00`); d <= lastDay; d.setUTCDate(d.getUTCDate() + 1)) {
    const wd = d.getUTCDay();
    if (wd >= 1 && wd <= 5) diasUteisRestantes += 1;
  }
  const faltam = Math.max(0, metaMatriculas - matriculasMes);
  const ritmo =
    diasUteisRestantes > 0 ? Math.round((faltam / diasUteisRestantes) * 10) / 10 : faltam;

  // ── Mapa do mês + disparos (2ª e 4ª segundas; indicação IA na 1ª).
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit" }).format(d);
  const mapa = [
    mondays[0] && { date: spDateString(mondays[0]), label: `${fmt(mondays[0])} — IA dispara pedido de indicação pra base de alunos` },
    mondays[1] && { date: spDateString(mondays[1]), label: `${fmt(mondays[1])} — Disparo quinzenal nº 1 (base completa)` },
    mondays[3] && { date: spDateString(mondays[3]), label: `${fmt(mondays[3])} — Disparo quinzenal nº 2 (base completa)` },
    lastFriday && { date: spDateString(lastFriday), label: `${fmt(lastFriday)} — Fechamento do mês com o Guilherme` },
  ]
    .filter(Boolean)
    .map((item) => ({ ...(item as { date: string; label: string }), past: (item as { date: string }).date < today }));

  const dispatchMondays = [mondays[1], mondays[3]].filter(Boolean) as Date[];
  const nextDispatch = dispatchMondays.find((d) => spDateString(d) >= today) || null;
  const baseCount = leads.filter((lead) => !lead.opted_out_at).length;

  // Histórico de disparos: agrupa eventos campaign_sent por campanha+dia.
  const histMap = new Map<string, { date: string; grupo: string; enviados: number; respostas: number }>();
  for (const event of campaignEvents || []) {
    if (!leadById.has(event.lead_id)) continue;
    const meta = (event.metadata || {}) as { campaign_name?: string };
    const dateStr = spDateString(new Date(event.created_at));
    const key = `${dateStr}|${meta.campaign_name || "Disparo"}`;
    const entry = histMap.get(key) || {
      date: dateStr,
      grupo: meta.campaign_name || "Disparo",
      enviados: 0,
      respostas: 0,
    };
    entry.enviados += 1;
    const lead = leadById.get(event.lead_id);
    if (lead && lead.last_message_at > event.created_at) entry.respostas += 1;
    histMap.set(key, entry);
  }
  const historico = [...histMap.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);

  // ── Semana: reuniões que não fecharam + grade Seg–Sex.
  const naoFechou = appointments
    .filter(
      (a) =>
        a.starts_at >= weekStart.toISOString() &&
        a.starts_at < weekEnd.toISOString() &&
        a.starts_at < now.toISOString(),
    )
    .filter((a) => {
      const leadRef = a.lead as { id?: string } | null;
      const lead = leadRef?.id ? leadById.get(leadRef.id) : null;
      return lead ? roleOf(lead) !== "won" : false;
    })
    .map((a) => ({
      lead_id: (a.lead as { id?: string } | null)?.id || null,
      name: (a.lead as { name?: string | null } | null)?.name || a.title,
      when: a.starts_at,
    }));

  const isDispatchWeek = dispatchMondays.some((d) => spDateString(d) === weekStartStr);
  const weekdayLabels = ["SEG", "TER", "QUA", "QUI", "SEX"];
  const planos: string[][] = [
    isDispatchWeek
      ? ["Disparo quinzenal (base toda)", "Revisão do funil", "Lista de empresas"]
      : ["Revisão do funil", "Planejamento de parcerias", "Lista de empresas"],
    ["Atendimento leads IA", "Prospecção: 5 empresas"],
    ["Atendimento leads IA", "Follow-ups do disparo"],
    ["Atendimento leads IA", "Prospecção: 5 empresas"],
    ["Revisão semanal completa", "Reuniões que não fecharam", "Kanban zerado + resumo"],
  ];
  const dias = weekdayLabels.map((label, index) => {
    const date = new Date(weekStart);
    date.setUTCDate(weekStart.getUTCDate() + index);
    const dateStr = spDateString(date);
    return {
      label: `${label} ${dateStr.slice(8)}`,
      isToday: dateStr === today,
      past: dateStr < today,
      items: planos[index],
    };
  });

  return {
    user: { id: target.uid, name: target.name, unit: target.unit, role: target.role },
    today,
    wonStageId,
    indicacaoLink: publicWhatsApp
      ? `https://wa.me/${publicWhatsApp}?text=${encodeURIComponent(
          `Olá! Fui indicado(a) por ${target.name.split(" ")[0]} e quero saber mais sobre a Nexus English Center 😊`,
        )}`
      : null,
    matriculaveis: leads
      .filter((lead) => activeRoles.has(roleOf(lead)))
      .slice(0, 200)
      .map((lead) => ({
        id: lead.id,
        name: lead.name || lead.phone,
        stage: stageById.get(lead.stage_id)?.name || "",
      })),
    hoje: {
      stats: {
        fila: fila.length,
        regra10: fila.filter((f) => f.overdue).length,
        followups: followupsHoje,
        reunioes: agendaHoje.length,
        matriculasMes,
        metaMatriculas,
        desafio: goalTarget("matriculas_desafio"),
      },
      fila,
      agenda: agendaHoje,
      tarefas,
    },
    semana: {
      stats: {
        respostasDisparo: historico[0]?.respostas ?? 0,
        parceriasContatadas: prospeccaoSemana,
        metaParceriasSemana: 10,
        matriculasSemana,
      },
      dias,
      revisao: {
        weekStart: weekStartStr,
        checklist: (reviewRow?.checklist as Record<string, boolean>) || {},
        blockers: reviewRow?.blockers || "",
        completedAt: reviewRow?.completed_at || null,
        naoFechou,
      },
    },
    mes: {
      stats: {
        matriculas: matriculasMes,
        meta: metaMatriculas,
        desafio: goalTarget("matriculas_desafio"),
        conversaoIa,
        metaConversao: goalTarget("conversao_ia"),
        indicacoes: indicacoesMes,
        metaIndicacoes: goalTarget("indicacoes"),
        conversaoIndicacoes,
        diasUteisRestantes,
        ritmo,
      },
      metas,
      mapa,
    },
    disparos: {
      proximo: nextDispatch
        ? {
            date: spDateString(nextDispatch),
            numero: spDateString(nextDispatch) === (mondays[1] ? spDateString(mondays[1]) : "") ? 1 : 2,
            baseCount,
            grupos: 4,
            esperadas: Math.round(baseCount * 0.05),
          }
        : null,
      historico,
    },
    prospeccao: {
      counts: prospectCounts,
      funil: prospects
        .filter((p) => p.status !== "descartado")
        .slice(0, 50)
        .map((p) => ({
          id: p.id,
          place_id: p.place_id,
          company_name: p.company_name || p.owner_name || "Empresa salva",
          segment: p.segment,
          city: p.city,
          status: p.status,
          note: p.note,
          next_action: p.next_action,
          next_action_at: p.next_action_at,
        })),
    },
  };
}
