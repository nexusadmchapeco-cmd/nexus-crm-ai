import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.title?.trim() || !body.starts_at || !body.ends_at || !["experimental_class", "closer_meeting"].includes(body.type)) {
      return NextResponse.json({ error: "Revise os dados do compromisso." }, { status: 400 });
    }
    const supabase = createAdminClient();
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
