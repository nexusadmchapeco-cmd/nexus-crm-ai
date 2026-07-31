import { NextResponse } from "next/server";
import { guardLead } from "@/lib/lead-guard";
import { createAdminClient } from "@/lib/supabase/admin";

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
    const { data, error } = await supabase.from("appointments")
      .update({ status, updated_at: new Date().toISOString() }).eq("id", id)
      .select("*, leads(id,name,phone,city)").single();
    if (error) throw error;
    if (data.lead_id) await supabase.from("lead_events").insert({
      lead_id: data.lead_id, event_type: "appointment_status_changed",
      metadata: { appointment_id: id, status, type: data.type },
    });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao atualizar." }, { status: 500 });
  }
}
