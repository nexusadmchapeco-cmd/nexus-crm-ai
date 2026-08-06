import { NextResponse } from "next/server";
import { guardLead } from "@/lib/lead-guard";
import { createAdminClient } from "@/lib/supabase/admin";

// Bloquear contato (briefing §5.2): o lead sai de TODAS as automações
// (follow-up, retomada, lembrete, disparo). Reversível só com desbloqueio
// manual explícito nesta mesma rota.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const guard = await guardLead(id);
    if (guard.response) return guard.response;
    const body = await request.json().catch(() => ({}));
    const block = body.block !== false;
    const blockedAt = block ? new Date().toISOString() : null;
    const supabase = createAdminClient();
    const { error } = await supabase.from("leads").update({ blocked_at: blockedAt }).eq("id", id);
    if (error) throw error;
    await supabase.from("lead_events").insert({
      lead_id: id,
      event_type: block ? "contact_blocked" : "contact_unblocked",
      metadata: { author_name: guard.session?.name || null },
    });
    return NextResponse.json({ ok: true, blocked: block });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao bloquear contato." },
      { status: 500 },
    );
  }
}
