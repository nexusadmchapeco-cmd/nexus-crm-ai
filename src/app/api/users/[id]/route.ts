import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";

// Atualiza um usuário: ativar/desativar, papel, unidade, nome, nova senha.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Acesso restrito ao administrador." }, { status: 403 });
  }
  const { id } = await params;
  let body: {
    name?: string;
    role?: string;
    unit?: string | null;
    active?: boolean;
    password?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  if (body.active === false && id === session.uid) {
    return NextResponse.json({ error: "Você não pode desativar o próprio acesso." }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.name === "string" && body.name.trim()) updates.name = body.name.trim();
  if (typeof body.active === "boolean") updates.active = body.active;
  if (typeof body.role === "string") {
    if (!["admin", "sdr", "vendedor"].includes(body.role)) {
      return NextResponse.json({ error: "Papel inválido." }, { status: 400 });
    }
    updates.role = body.role;
  }
  if (body.unit !== undefined) {
    if (body.unit !== null && !["chapeco", "passo_fundo"].includes(String(body.unit))) {
      return NextResponse.json({ error: "Unidade inválida." }, { status: 400 });
    }
    updates.unit = body.unit;
  }

  const supabase = createAdminClient();
  if (typeof body.password === "string" && body.password) {
    if (body.password.length < 8) {
      return NextResponse.json({ error: "Senha precisa de pelo menos 8 caracteres." }, { status: 400 });
    }
    const { data: hash, error: hashError } = await supabase.rpc("auth_hash_password", {
      p_password: body.password,
    });
    if (hashError || !hash) {
      return NextResponse.json({ error: "Erro ao preparar a senha." }, { status: 500 });
    }
    updates.password_hash = hash;
  }

  const { data, error } = await supabase
    .from("app_users")
    .update(updates)
    .eq("id", id)
    .select("id, email, name, role, unit, active, created_at")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "Erro ao atualizar usuário." }, { status: 500 });
  }
  return NextResponse.json({ user: data });
}
