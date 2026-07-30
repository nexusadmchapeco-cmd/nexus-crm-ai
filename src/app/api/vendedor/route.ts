import { NextResponse } from "next/server";
import { periodBounds } from "@/lib/day";
import { createAdminClient } from "@/lib/supabase/admin";

type Period = "dia" | "semana" | "mes";
const PERIODS: Period[] = ["dia", "semana", "mes"];

// Painel do vendedor: metas (alvo) x realizado por período, e ranking do mês.
// Realizado é calculado da melhor fonte disponível: contatos = observações do
// vendedor; agendamentos = appointments dele; matrículas = leads que viraram
// cliente no período (proxy). Receita ainda não tem fonte automática.
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const sellerId = url.searchParams.get("seller_id");
    const name = url.searchParams.get("name") || "";
    if (!sellerId || !name) {
      return NextResponse.json({ error: "Vendedor não informado." }, { status: 400 });
    }
    const supabase = createAdminClient();

    const metrics: Record<string, Record<string, { target: number; realized: number }>> = {};
    for (const period of PERIODS) {
      const { start, end, referenceDate } = periodBounds(period);
      const startISO = start.toISOString();
      const endISO = end.toISOString();

      const [{ count: contatos }, { count: agendamentos }, { count: matriculas }, { data: goals }] =
        await Promise.all([
          supabase
            .from("lead_notes")
            .select("id", { count: "exact", head: true })
            .eq("author_name", name)
            .gte("created_at", startISO)
            .lt("created_at", endISO),
          supabase
            .from("appointments")
            .select("id", { count: "exact", head: true })
            .eq("owner_name", name)
            .gte("created_at", startISO)
            .lt("created_at", endISO),
          supabase
            .from("leads")
            .select("id", { count: "exact", head: true })
            .eq("temperature", "cliente")
            .gte("updated_at", startISO)
            .lt("updated_at", endISO),
          supabase
            .from("sales_goals")
            .select("metric, target")
            .eq("seller_id", sellerId)
            .eq("period", period)
            .eq("reference_date", referenceDate),
        ]);

      const targets = new Map((goals || []).map((goal) => [goal.metric, Number(goal.target)]));
      const realized: Record<string, number> = {
        contatos: contatos || 0,
        agendamentos: agendamentos || 0,
        matriculas: matriculas || 0,
        receita: 0,
      };
      metrics[period] = {};
      for (const metric of ["contatos", "agendamentos", "matriculas", "receita"]) {
        metrics[period][metric] = { target: targets.get(metric) || 0, realized: realized[metric] };
      }
    }

    // Ranking do mês por contatos.
    const { start } = periodBounds("mes");
    const { data: monthNotes } = await supabase
      .from("lead_notes")
      .select("author_name")
      .gte("created_at", start.toISOString());
    const tally = new Map<string, number>();
    for (const note of monthNotes || []) {
      if (!note.author_name) continue;
      tally.set(note.author_name, (tally.get(note.author_name) || 0) + 1);
    }
    const ranking = Array.from(tally.entries())
      .map(([sellerName, contatos]) => ({ name: sellerName, contatos }))
      .sort((a, b) => b.contatos - a.contatos);

    return NextResponse.json({ metrics, ranking });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao carregar o painel." },
      { status: 500 },
    );
  }
}
