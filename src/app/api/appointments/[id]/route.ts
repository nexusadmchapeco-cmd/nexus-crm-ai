import { NextResponse } from "next/server";
import { guardLead } from "@/lib/lead-guard";
import { getSessionUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";

// 09:00 BRT do dia seguinte — horário padrão do follow-up pós-reunião
// (modelo do CRM antigo: confirmar presença agenda o "1° Retorno Reunião").
function nextDayMorning() {
  const date = new Date(Date.now() + 86400000);
  const key = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return `${key}T09:00:00-03:00`;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { status } = await request.json();
    if (!["scheduled", "confirmed", "completed", "no_show", "cancelled"].includes(status)) {
      return NextResponse.json({ error: "Status inválido." }, { status: 400 });
    }
    const supabase = createAdminClient();
    const { data: current } = await supabase
      .from("appointments")
      .select("lead_id")
      .eq("id", id)
      .maybeSingle();
    if (current?.lead_id) {
      const guard = await guardLead(String(current.lead_id));
      if (guard.response) return guard.response;
    }
    // Só atualiza quando o status realmente muda: replay e duplo clique não
    // repetem os efeitos abaixo (o Postgres serializa os dois UPDATEs na
    // mesma linha, então a segunda chamada concorrente casa 0 linhas).
    const { data, error } = await supabase.from("appointments")
      .update({ status, updated_at: new Date().toISOString() }).eq("id", id)
      .neq("status", status)
      .select("*, leads(id,name,phone,city)").maybeSingle();
    if (error) throw error;
    if (!data) {
      const { data: unchanged, error: fetchError } = await supabase
        .from("appointments").select("*, leads(id,name,phone,city)").eq("id", id).single();
      if (fetchError) throw fetchError;
      return NextResponse.json(unchanged);
    }
    if (data.lead_id) {
      // Primeira conclusão desta reunião? O checkbox do painel permite
      // desmarcar/remarcar; só a primeira vez pode gerar nota + follow-up.
      let firstCompletion = true;
      if (status === "completed") {
        const { data: prior } = await supabase
          .from("lead_events")
          .select("id")
          .eq("lead_id", data.lead_id)
          .eq("event_type", "appointment_status_changed")
          .contains("metadata", { appointment_id: id, status: "completed" })
          .limit(1);
        firstCompletion = !prior?.length;
      }

      await supabase.from("lead_events").insert({
        lead_id: data.lead_id, event_type: "appointment_status_changed",
        metadata: { appointment_id: id, status, type: data.type },
      });

      const session = await getSessionUser();
      const authorName = session?.name || null;
      const meetingLabel = data.type === "experimental_class" ? "Aula experimental" : "Reunião";

      // Modelo do CRM antigo: a reunião realizada entra no histórico do lead e
      // já agenda o "1° Retorno Reunião" pro dia seguinte. O follow-up
      // pendente anterior é substituído — duas reuniões com o mesmo lead não
      // podem virar dois follow-ups na fila.
      if (status === "completed" && firstCompletion) {
        await supabase
          .from("lead_tasks")
          .update({ status: "canceled", done_at: new Date().toISOString() })
          .eq("lead_id", data.lead_id)
          .eq("status", "pending");
        await Promise.all([
          supabase.from("lead_tasks").insert({
            lead_id: data.lead_id,
            owner_name: authorName,
            title: "1° Retorno Reunião",
            due_at: new Date(nextDayMorning()).toISOString(),
          }),
          supabase.from("lead_notes").insert({
            lead_id: data.lead_id,
            author_name: authorName,
            contact_type: "presencial",
            outcome: "atendeu",
            content: `🤝 ${meetingLabel} realizada — follow-up "1° Retorno Reunião" agendado para amanhã às 09:00.`,
          }),
        ]);
      } else if (status === "no_show") {
        await supabase.from("lead_notes").insert({
          lead_id: data.lead_id,
          author_name: authorName,
          contact_type: "outro",
          outcome: "sem_resposta",
          content: `❌ Não compareceu à ${meetingLabel.toLowerCase()}.`,
        });
      } else if (status === "cancelled") {
        await supabase.from("lead_notes").insert({
          lead_id: data.lead_id,
          author_name: authorName,
          contact_type: "outro",
          outcome: "sem_resposta",
          content: `${meetingLabel} cancelada — horário liberado na agenda.`,
        });
      }
    }
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao atualizar." }, { status: 500 });
  }
}
