import { NextResponse } from "next/server";
import { isCloserStage } from "@/lib/closer-board";
import { guardLead } from "@/lib/lead-guard";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const guard = await guardLead(id);
    if (guard.response) return guard.response;

    const { stage_id } = await request.json();
    if (!stage_id) return NextResponse.json({ error: "stage_id é obrigatório" }, { status: 400 });
    const supabase = createAdminClient();
    // Closer só move dentro do funil dele — as etapas de atendimento da IA
    // (Novo Lead, Contato Feito, Informações Passadas) são do gestor.
    if (guard.session?.role === "vendedor") {
      const { data: targetStage } = await supabase
        .from("pipeline_stages")
        .select("board_group, role")
        .eq("id", stage_id)
        .maybeSingle();
      if (!targetStage || !isCloserStage(targetStage)) {
        return NextResponse.json(
          { error: "Essa etapa faz parte do atendimento da IA — fale com o gestor." },
          { status: 403 },
        );
      }
    }
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
