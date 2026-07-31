import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") return null;
  return user;
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Acesso restrito ao administrador." }, { status: 403 });
  }
  const { data, error } = await createAdminClient()
    .from("app_users")
    .select("id, email, name, role, unit, active, created_at")
    .order("created_at");
  if (error) return NextResponse.json({ error: "Erro ao listar usuários." }, { status: 500 });
  return NextResponse.json({ users: data || [] });
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Acesso restrito ao administrador." }, { status: 403 });
  }
  let body: { name?: string; email?: string; password?: string; role?: string; unit?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const role = String(body.role || "vendedor");
  const unit = body.unit ? String(body.unit) : null;

  if (!name || !email.includes("@")) {
    return NextResponse.json({ error: "Informe nome e e-mail válidos." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Senha precisa de pelo menos 8 caracteres." }, { status: 400 });
  }
  if (!["admin", "sdr", "vendedor"].includes(role)) {
    return NextResponse.json({ error: "Papel inválido." }, { status: 400 });
  }
  if (role === "vendedor" && !["chapeco", "passo_fundo"].includes(unit || "")) {
    return NextResponse.json({ error: "Vendedor precisa de unidade (Chapecó ou Passo Fundo)." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: hash, error: hashError } = await supabase.rpc("auth_hash_password", {
    p_password: password,
  });
  if (hashError || !hash) {
    return NextResponse.json({ error: "Erro ao preparar a senha." }, { status: 500 });
  }
  const { data, error } = await supabase
    .from("app_users")
    .insert({ name, email, role, unit: role === "vendedor" ? unit : null, password_hash: hash })
    .select("id, email, name, role, unit, active, created_at")
    .single();
  if (error) {
    const duplicated = String(error.message || "").includes("duplicate");
    return NextResponse.json(
      { error: duplicated ? "Já existe usuário com esse e-mail." : "Erro ao criar usuário." },
      { status: duplicated ? 409 : 500 },
    );
  }
  return NextResponse.json({ user: data });
}
