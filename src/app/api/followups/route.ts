import { NextResponse } from "next/server";
import { parseOperationsSettings } from "@/lib/operations";
import { cancelPendingFollowups, sendReguaTemplate } from "@/lib/regua";
import { getSessionUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { scopedUnit, unitVisibleTo } from "@/lib/units";

// Menu Follow-up (briefing §6.4): agendados, enviados aguardando resposta e
// respondidos hoje — sempre com recorte de unidade do vendedor.
export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const unit = scopedUnit(session);
  const supabase = createAdminClient();

  const todayStart = new Date();
  todayStart.setHours(todayStart.getHours() - 24);

  // O vendedor volta ao modelo do CRM antigo: a página dele lista SÓ os
  // follow-ups manuais (os que ele agendou na ficha). A régua automática da
  // IA é operação do gestor/SDR e não pode virar tarefa do closer.
  const isVendedor = session.role === "vendedor";
  const [reguaResult, { data: manualTasks }] = await Promise.all([
    isVendedor
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from("followups")
          .select("id, stage_role, attempt, scheduled_for, status, template_name, sent_at, responded_at, lead:leads(id, name, phone, unit_interest, stage_id)")
          .in("status", ["pendente", "enviado", "respondido"])
          .gte("scheduled_for", new Date(Date.now() - 70 * 86400000).toISOString())
          .order("scheduled_for")
          .limit(300),
    supabase
      .from("lead_tasks")
      .select("id, title, due_at, status, lead:leads(id, name, phone, unit_interest)")
      .eq("status", "pending")
      .order("due_at")
      .limit(300),
  ]);
  const { data: rows, error } = reguaResult;
  // Sem a migração 015 a régua não existe, mas os follow-ups manuais (tabela
  // antiga) continuam funcionando — degrada em vez de esconder tudo.
  const reguaIndisponivel = Boolean(error);

  type Row = {
    id: string;
    stage_role: string;
    attempt: number;
    scheduled_for: string;
    status: string;
    template_name: string | null;
    sent_at: string | null;
    responded_at: string | null;
    lead: { id: string; name: string | null; phone: string; unit_interest: string | null } | null;
  };
  const visible = ((rows || []) as unknown as Row[]).filter(
    (row) => row.lead && unitVisibleTo(row.lead.unit_interest, unit),
  );
  const respondidosHoje = visible.filter(
    (row) => row.status === "respondido" && row.responded_at && row.responded_at >= todayStart.toISOString(),
  );

  const manuais = ((manualTasks || []) as unknown as {
    id: string;
    title: string;
    due_at: string;
    lead: { id: string; name: string | null; phone: string; unit_interest: string | null } | null;
  }[]).filter((task) => task.lead && unitVisibleTo(task.lead.unit_interest, unit));

  return NextResponse.json({
    role: session.role,
    regua_indisponivel: reguaIndisponivel,
    agendados: visible.filter((row) => row.status === "pendente"),
    enviados: visible.filter((row) => row.status === "enviado"),
    respondidos: respondidosHoje,
    manuais,
  });
}

// Ações manuais: cancelar ou disparar agora.
export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  // Disparar/cancelar a régua automática é operação de gestor/SDR — o
  // vendedor só enxerga (e conclui) os follow-ups manuais dele.
  if (session.role === "vendedor") {
    return NextResponse.json({ error: "A régua automática é operada pelo gestor." }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "");
  const action = String(body.action || "");
  if (!id || !["cancelar", "disparar"].includes(action)) {
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  }
  const supabase = createAdminClient();
  const { data: followup } = await supabase
    .from("followups")
    .select("id, lead_id, stage_role, attempt, status, lead:leads(id, name, phone, objective, unit_interest, opted_out_at, blocked_at)")
    .eq("id", id)
    .maybeSingle();
  if (!followup) return NextResponse.json({ error: "Follow-up não encontrado." }, { status: 404 });
  const lead = followup.lead as unknown as {
    id: string;
    name: string | null;
    phone: string;
    objective: string | null;
    unit_interest: string | null;
    opted_out_at: string | null;
    blocked_at: string | null;
  };
  const unit = scopedUnit(session);
  if (!unitVisibleTo(lead.unit_interest, unit)) {
    return NextResponse.json({ error: "Lead de outra unidade." }, { status: 403 });
  }

  if (action === "cancelar") {
    await supabase.from("followups").update({ status: "cancelado" }).eq("id", id);
    return NextResponse.json({ ok: true });
  }

  if (followup.status !== "pendente") {
    return NextResponse.json({ error: "Só follow-ups agendados podem ser disparados." }, { status: 400 });
  }
  if (lead.opted_out_at || lead.blocked_at) {
    return NextResponse.json({ error: "Lead bloqueado/descadastrado." }, { status: 400 });
  }
  const { data: operationsRow } = await supabase
    .from("ai_settings")
    .select("global_prompt")
    .eq("name", "__operations__")
    .maybeSingle();
  const operations = parseOperationsSettings(operationsRow?.global_prompt);
  try {
    const { template } = await sendReguaTemplate(lead, followup.stage_role, followup.attempt, operations.language_code);
    await supabase
      .from("followups")
      .update({ status: "enviado", sent_at: new Date().toISOString(), template_name: template })
      .eq("id", id);
    await supabase.from("lead_events").insert({
      lead_id: lead.id,
      event_type: "followup_sent",
      metadata: { regua: true, manual_fire: true, attempt: followup.attempt, template_name: template, author_name: session.name },
    });
    return NextResponse.json({ ok: true, template });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao disparar." },
      { status: 500 },
    );
  }
}
