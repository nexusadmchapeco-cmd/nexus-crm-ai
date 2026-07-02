import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { stage_id } = await request.json();
    if (!stage_id) return NextResponse.json({ error: "stage_id é obrigatório" }, { status: 400 });
    const supabase = createAdminClient();
    const { data, error } = await supabase.from("leads").update({
      stage_id, updated_at: new Date().toISOString(),
    }).eq("id", id).select().single();
    if (error) throw error;
    await supabase.from("lead_events").insert({ lead_id: id, event_type: "stage_changed_manually", metadata: { stage_id } });
    return NextResponse.json({ lead: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao mover lead" }, { status: 500 });
  }
}
