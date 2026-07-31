import { NextResponse } from "next/server";
import { getAuthSecret, type SessionUser } from "@/lib/auth";
import { sessionResponse } from "@/lib/auth-server";
import { isSupabaseConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

// Primeiro acesso: enquanto não existe nenhum usuário, a tela de login vira
// "criar administrador". Assim que o primeiro admin nasce, isto se desliga.
async function bootstrapNeeded() {
  if (!isSupabaseConfigured()) return false;
  const secret = await getAuthSecret();
  if (!secret) return false;
  const { count, error } = await createAdminClient()
    .from("app_users")
    .select("id", { count: "exact", head: true });
  if (error) return false; // migration ainda não aplicada
  return (count || 0) === 0;
}

export async function GET() {
  return NextResponse.json({ needed: await bootstrapNeeded() });
}

export async function POST(request: Request) {
  if (!(await bootstrapNeeded())) {
    return NextResponse.json({ error: "Administrador já criado." }, { status: 409 });
  }
  let body: { name?: string; email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!name || !email.includes("@") || password.length < 8) {
    return NextResponse.json(
      { error: "Preencha nome, e-mail válido e senha com pelo menos 8 caracteres." },
      { status: 400 },
    );
  }
  const supabase = createAdminClient();
  const { data: hash, error: hashError } = await supabase.rpc("auth_hash_password", {
    p_password: password,
  });
  if (hashError || !hash) {
    return NextResponse.json({ error: "Erro ao preparar a senha." }, { status: 500 });
  }
  const { data: created, error: insertError } = await supabase
    .from("app_users")
    .insert({ name, email, role: "admin", password_hash: hash })
    .select("id, email, name, role, unit")
    .single();
  if (insertError || !created) {
    return NextResponse.json({ error: "Erro ao criar o administrador." }, { status: 500 });
  }
  const secret = (await getAuthSecret()) as string;
  return sessionResponse(
    {
      uid: String(created.id),
      email: String(created.email),
      name: String(created.name),
      role: "admin",
      unit: null,
    } satisfies SessionUser,
    secret,
  );
}
