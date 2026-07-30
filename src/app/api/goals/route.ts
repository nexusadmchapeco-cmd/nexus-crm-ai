import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { periodBounds } from "@/lib/day";

const PERIODS = ["dia", "semana", "mes"] as const;
const METRICS = ["contatos", "agendamentos", "matriculas", "receita"] as const;

// Upsert de uma meta (por vendedor, período, métrica). A data de referência é
// calculada do período atual, então o gestor só escolhe período + métrica + alvo.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const sellerId = body.seller_id ? String(body.seller_id) : null;
    if (!sellerId) return NextResponse.json({ error: "Escolha o vendedor." }, { status: 400 });
    if (!PERIODS.includes(body.period)) {
      return NextResponse.json({ error: "Período inválido." }, { status: 400 });
    }
    if (!METRICS.includes(body.metric)) {
      return NextResponse.json({ error: "Métrica inválida." }, { status: 400 });
    }
    const target = Number(body.target);
    if (!Number.isFinite(target) || target < 0) {
      return NextResponse.json({ error: "Meta inválida." }, { status: 400 });
    }

    const { referenceDate } = periodBounds(body.period);
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("sales_goals")
      .upsert(
        {
          seller_id: sellerId,
          period: body.period,
          reference_date: referenceDate,
          metric: body.metric,
          target,
        },
        { onConflict: "seller_id,period,reference_date,metric" },
      )
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ goal: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao salvar meta." },
      { status: 500 },
    );
  }
}
