import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";

// Metas mensais por vendedor — só o admin edita.
export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Só o administrador edita metas." }, { status: 403 });
  }
  let body: { user_id?: string; month?: string; metric?: string; target?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }
  const month = String(body.month || "");
  const metric = String(body.metric || "").trim();
  const target = Number(body.target);
  if (!body.user_id || !/^\d{4}-\d{2}-01$/.test(month) || !metric || !Number.isFinite(target)) {
    return NextResponse.json({ error: "Informe vendedor, mês, métrica e valor." }, { status: 400 });
  }
  const { error } = await createAdminClient().from("panel_goals").upsert(
    { user_id: body.user_id, month, metric, target, updated_at: new Date().toISOString() },
    { onConflict: "user_id,month,metric" },
  );
  if (error) return NextResponse.json({ error: "Erro ao salvar meta." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
