import { NextResponse } from "next/server";
import { saoPauloDayBounds } from "@/lib/day";
import { getSessionUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";

// Tarefas do painel: criar manual ou marcar/desmarcar (automáticas persistem
// pelo `source`). Admin pode operar no painel de outro usuário via user_id.
export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  let body: {
    user_id?: string;
    id?: string;
    source?: string;
    title?: string;
    chip?: string | null;
    done?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }
  const userId = body.user_id && session.role !== "vendedor" ? body.user_id : session.uid;
  const supabase = createAdminClient();
  const { today } = saoPauloDayBounds();
  const doneAt = body.done ? new Date().toISOString() : null;
  const chip = ["followup", "indicacao", "parceria"].includes(String(body.chip)) ? body.chip : null;

  try {
    if (body.id) {
      const { error } = await supabase
        .from("seller_tasks")
        .update({ done_at: doneAt })
        .eq("id", body.id)
        .eq("user_id", userId);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (body.source) {
      const { error } = await supabase.from("seller_tasks").upsert(
        {
          user_id: userId,
          source: body.source,
          title: String(body.title || "Tarefa"),
          chip,
          due_date: today,
          manual: false,
          done_at: doneAt,
        },
        { onConflict: "user_id,source" },
      );
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    const title = String(body.title || "").trim();
    if (!title) return NextResponse.json({ error: "Informe a tarefa." }, { status: 400 });
    const { data, error } = await supabase
      .from("seller_tasks")
      .insert({ user_id: userId, title, chip, due_date: today, manual: true })
      .select("id")
      .single();
    if (error) throw error;
    return NextResponse.json({ ok: true, id: data.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao salvar tarefa." },
      { status: 500 },
    );
  }
}
