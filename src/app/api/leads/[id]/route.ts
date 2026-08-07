import { NextResponse } from "next/server";
import { isCloserStage } from "@/lib/closer-board";
import { guardLead } from "@/lib/lead-guard";
import { createAdminClient } from "@/lib/supabase/admin";

// Ficha completa do lead + etapas do pipeline: permite abrir o modal da ficha
// de qualquer lugar (painel do vendedor, agenda), não só do Kanban.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const guard = await guardLead(id);
    if (guard.response) return guard.response;

    const supabase = createAdminClient();
    const [{ data: lead, error }, { data: stages, error: stagesError }] = await Promise.all([
      supabase.from("leads").select("*").eq("id", id).maybeSingle(),
      supabase.from("pipeline_stages").select("*").order("position"),
    ]);
    if (error) throw error;
    if (stagesError) throw stagesError;
    if (!lead) {
      return NextResponse.json(
        { error: "Lead não encontrado. Ele pode ter sido excluído." },
        { status: 404 },
      );
    }
    // Mesma regra do Kanban: o closer só enxerga (e só pode mover para) as
    // etapas do funil dele — as de atendimento da IA nem aparecem na ficha.
    const visibleStages =
      guard.session?.role === "vendedor"
        ? (stages || []).filter(isCloserStage)
        : stages || [];
    return NextResponse.json({ lead, stages: visibleStages });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao carregar o lead." },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const guard = await guardLead(id);
    if (guard.response) return guard.response;

    const supabase = createAdminClient();
    const { error } = await supabase.from("leads").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível excluir o lead." },
      { status: 500 },
    );
  }
}
