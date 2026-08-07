import { NextResponse } from "next/server";
import { parseOperationsSettings } from "@/lib/operations";
import { createAdminClient } from "@/lib/supabase/admin";

// Troca o WhatsApp do closer de uma unidade por URL (admin-only via
// middleware /api/settings). O mesmo campo continua editável no Estúdio de
// IA → Encaminhamento; esta rota é o atalho de um clique.
//   ?unit=chapeco&phone=5549991234567&confirm=sim
//   ?unit=passo_fundo&phone=5554991234567&confirm=sim

export async function GET(request: Request) {
  const url = new URL(request.url);
  const unit = url.searchParams.get("unit");
  const phone = (url.searchParams.get("phone") || "").replace(/\D/g, "");
  const confirm = url.searchParams.get("confirm");

  if (!unit || !["chapeco", "passo_fundo"].includes(unit)) {
    return NextResponse.json({ error: "Informe ?unit=chapeco ou ?unit=passo_fundo." }, { status: 400 });
  }
  if (!/^55\d{10,11}$/.test(phone)) {
    return NextResponse.json(
      { error: "Número inválido — use só dígitos com DDI 55 e DDD, ex.: 5554996663575." },
      { status: 400 },
    );
  }
  const unitLabel = unit === "chapeco" ? "Chapecó" : "Passo Fundo";
  if (confirm !== "sim") {
    return NextResponse.json({
      warning: `Isso troca o WhatsApp do closer de ${unitLabel} para ${phone}.`,
      howTo: "Chame novamente com &confirm=sim para aplicar.",
    });
  }

  try {
    const supabase = createAdminClient();
    const { data: row } = await supabase
      .from("ai_settings")
      .select("id, global_prompt")
      .eq("name", "__operations__")
      .maybeSingle();
    const current = parseOperationsSettings(row?.global_prompt);
    const anterior =
      unit === "chapeco" ? current.closer_phone_chapeco : current.closer_phone_passo_fundo;
    const next = {
      ...current,
      [unit === "chapeco" ? "closer_phone_chapeco" : "closer_phone_passo_fundo"]: phone,
    };

    const record = { name: "__operations__", global_prompt: JSON.stringify(next) };
    const result = row?.id
      ? await supabase.from("ai_settings").update(record).eq("id", row.id)
      : await supabase.from("ai_settings").insert(record);
    if (result.error) throw result.error;

    return NextResponse.json({
      ok: true,
      unidade: unitLabel,
      numero_anterior: anterior || "(vazio)",
      numero_novo: phone,
      teste: `/api/settings/ai/test-closer?unit=${unit}&confirm=sim`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : `Erro ao trocar: ${JSON.stringify(error)}` },
      { status: 500 },
    );
  }
}
