import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";

// Cadastro manual de lead (briefing §5.2): quem chegou por fora do WhatsApp
// (indicação verbal, presencial, telefone). Entra no Kanban na etapa escolhida.
export async function POST(request: Request) {
  try {
    const session = await getSessionUser();
    const body = await request.json();
    const name = String(body.name || "").trim();
    const phone = String(body.phone || "").replace(/\D/g, "");
    if (!name || phone.length < 10) {
      return NextResponse.json({ error: "Informe nome e celular com DDD." }, { status: 400 });
    }
    const fullPhone = phone.startsWith("55") ? phone : `55${phone}`;

    const supabase = createAdminClient();
    const { data: existing } = await supabase
      .from("leads")
      .select("id")
      .eq("phone", fullPhone)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { error: "Já existe um lead com esse celular.", lead_id: existing.id },
        { status: 409 },
      );
    }

    let stageId = body.stage_id || null;
    if (!stageId) {
      const { data: stage } = await supabase
        .from("pipeline_stages")
        .select("id")
        .eq("role", "hot_lead")
        .maybeSingle();
      stageId = stage?.id;
    }
    if (!stageId) return NextResponse.json({ error: "Etapa não encontrada." }, { status: 500 });

    const modalidade = ["presencial", "online"].includes(body.modalidade) ? body.modalidade : null;
    const base: Record<string, unknown> = {
      name,
      phone: fullPhone,
      stage_id: stageId,
      source: String(body.source || "Cadastro manual").slice(0, 80),
      unit_interest: body.unit_interest ? String(body.unit_interest).slice(0, 60) : modalidade === "online" ? "Online" : null,
      summary: body.note ? String(body.note).slice(0, 2000) : null,
      human_takeover: true, // lead manual é conduzido pelo closer, não pela IA
    };

    let created = await supabase
      .from("leads")
      .insert({ ...base, modalidade, qualification_step: "done" })
      .select()
      .single();
    if (created.error) {
      created = await supabase.from("leads").insert(base).select().single();
    }
    if (created.error) throw created.error;

    await Promise.all([
      supabase.from("conversations").insert({ lead_id: created.data.id, channel: "whatsapp" }),
      supabase.from("lead_events").insert({
        lead_id: created.data.id,
        event_type: "stage_changed_manually",
        metadata: { reason: "manual_create", author_name: session?.name || null },
      }),
    ]);
    return NextResponse.json({ lead: created.data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao cadastrar lead." },
      { status: 500 },
    );
  }
}
