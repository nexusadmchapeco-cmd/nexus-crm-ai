import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.title?.trim() || !body.starts_at || !body.ends_at || !["experimental_class", "closer_meeting"].includes(body.type)) {
      return NextResponse.json({ error: "Revise os dados do compromisso." }, { status: 400 });
    }
    if (new Date(body.ends_at).getTime() - new Date(body.starts_at).getTime() !== 30 * 60_000) {
      return NextResponse.json({ error: "Os atendimentos devem durar 30 minutos." }, { status: 400 });
    }
    const supabase = createAdminClient();
    const [{ data: appointmentConflict }, { data: blockConflict }] = await Promise.all([
      supabase
        .from("appointments")
        .select("id")
        .lt("starts_at", body.ends_at)
        .gt("ends_at", body.starts_at)
        .in("status", ["scheduled", "confirmed"])
        .limit(1)
        .maybeSingle(),
      supabase
        .from("calendar_blocks")
        .select("id")
        .lt("starts_at", body.ends_at)
        .gt("ends_at", body.starts_at)
        .limit(1)
        .maybeSingle(),
    ]);
    if (appointmentConflict || blockConflict) {
      return NextResponse.json(
        { error: blockConflict ? "Este horário está bloqueado." : "Já existe atendimento neste horário." },
        { status: 409 },
      );
    }
    const { data, error } = await supabase.from("appointments").insert({
      lead_id: body.lead_id || null, type: body.type, title: body.title.trim(),
      starts_at: body.starts_at, ends_at: body.ends_at,
      owner_name: body.owner_name?.trim() || null,
      meeting_url: body.meeting_url?.trim() || null,
      notes: body.notes?.trim() || null, created_by: body.created_by === "ai" ? "ai" : "human",
    }).select("*, leads(id,name,phone,city)").single();
    if (error) throw error;
    await Promise.all([
      supabase.from("notifications").insert({
        appointment_id: data.id,
        title: body.type === "closer_meeting" ? "Nova reunião na agenda" : "Nova aula experimental",
        body: `${data.leads?.name || body.title} · ${new Date(body.starts_at).toLocaleString("pt-BR", {
          timeZone: "America/Sao_Paulo",
          dateStyle: "short",
          timeStyle: "short",
        })}`,
      }),
      body.lead_id
        ? supabase.from("lead_events").insert({
            lead_id: body.lead_id, event_type: "appointment_scheduled",
            metadata: { appointment_id: data.id, type: body.type, starts_at: body.starts_at },
          })
        : Promise.resolve(),
    ]);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao agendar." }, { status: 500 });
  }
}
