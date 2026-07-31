import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";

// Revisão semanal de sexta: salva checklist, travas e conclusão. Ao concluir,
// o resumo fica disponível pro admin (tabela weekly_reviews).
export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  let body: {
    user_id?: string;
    week_start?: string;
    checklist?: Record<string, boolean>;
    blockers?: string;
    complete?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }
  const userId = body.user_id && session.role !== "vendedor" ? body.user_id : session.uid;
  const weekStart = String(body.week_start || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return NextResponse.json({ error: "week_start inválido." }, { status: 400 });
  }
  const { error } = await createAdminClient().from("weekly_reviews").upsert(
    {
      user_id: userId,
      week_start: weekStart,
      checklist: body.checklist || {},
      blockers: body.blockers ? String(body.blockers).slice(0, 4000) : null,
      completed_at: body.complete ? new Date().toISOString() : null,
    },
    { onConflict: "user_id,week_start" },
  );
  if (error) return NextResponse.json({ error: "Erro ao salvar revisão." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
