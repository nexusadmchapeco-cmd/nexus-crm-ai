import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const value = new URL(request.url).searchParams.get("value");
    if (value !== "won" && value !== "lost") return NextResponse.json({ error: "Status inválido" }, { status: 400 });
    const stageRole = value === "won" ? "won" : "lost";
    const temperature = value === "won" ? "cliente" : "perdido";
    const supabase = createAdminClient();
    const { data: stage, error: stageError } = await supabase.from("pipeline_stages").select("id").eq("role", stageRole).single();
    if (stageError) throw stageError;
    const { data, error } = await supabase.from("leads").update({
      stage_id: stage.id, temperature, ai_enabled: false, updated_at: new Date().toISOString(),
    }).eq("id", id).select().single();
    if (error) throw error;
    await supabase.from("lead_events").insert({ lead_id: id, event_type: value === "won" ? "enrollment_won" : "lead_lost", metadata: {} });
    return NextResponse.json({ lead: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao atualizar status" }, { status: 500 });
  }
}
