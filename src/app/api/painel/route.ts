import { NextResponse } from "next/server";
import { getPainelData } from "@/lib/painel";
import { getSessionUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SessionUser } from "@/lib/auth";

// Dados do Painel do Vendedor. Vendedor vê o próprio; admin/SDR podem passar
// ?u=<user_id> para ver o painel de qualquer vendedor.
export async function GET(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  let target: SessionUser = session;
  const viewId = new URL(request.url).searchParams.get("u");
  if (viewId && viewId !== session.uid) {
    if (session.role === "vendedor") {
      return NextResponse.json({ error: "Sem acesso ao painel de outro vendedor." }, { status: 403 });
    }
    const { data } = await createAdminClient()
      .from("app_users")
      .select("id, email, name, role, unit")
      .eq("id", viewId)
      .maybeSingle();
    if (!data) return NextResponse.json({ error: "Vendedor não encontrado." }, { status: 404 });
    target = {
      uid: String(data.id),
      email: String(data.email),
      name: String(data.name),
      role: data.role as SessionUser["role"],
      unit: (data.unit as SessionUser["unit"]) || null,
    };
  }

  try {
    const data = await getPainelData(target);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao montar o painel." },
      { status: 500 },
    );
  }
}
