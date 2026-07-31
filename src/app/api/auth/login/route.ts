import { NextResponse } from "next/server";
import { getAuthSecret, timingSafeEqualStrings, type SessionUser } from "@/lib/auth";
import { sessionResponse } from "@/lib/auth-server";
import { isSupabaseConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const secret = await getAuthSecret();
  if (!secret) {
    return NextResponse.json(
      { error: "Login não configurado: aplique a migration 013 no Supabase." },
      { status: 503 },
    );
  }
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!email || !password) {
    return NextResponse.json({ error: "Informe e-mail e senha." }, { status: 400 });
  }

  // Fallback por variáveis de ambiente (teste local / contingência).
  if (process.env.AUTH_EMAIL && process.env.AUTH_PASSWORD) {
    const emailOk = timingSafeEqualStrings(email, String(process.env.AUTH_EMAIL).trim().toLowerCase());
    const passwordOk = timingSafeEqualStrings(password, String(process.env.AUTH_PASSWORD));
    if (emailOk && passwordOk) {
      return sessionResponse(
        { uid: "env-admin", email, name: "Administrador", role: "admin", unit: null },
        secret,
      );
    }
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "E-mail ou senha incorretos." }, { status: 401 });
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("auth_login", {
    p_email: email,
    p_password: password,
  });
  if (error) {
    return NextResponse.json(
      { error: "Login indisponível: aplique a migration 013 no Supabase." },
      { status: 503 },
    );
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return NextResponse.json({ error: "E-mail ou senha incorretos." }, { status: 401 });
  }
  return sessionResponse(
    {
      uid: String(row.id),
      email: String(row.email),
      name: String(row.name),
      role: row.role as SessionUser["role"],
      unit: (row.unit as SessionUser["unit"]) || null,
    },
    secret,
  );
}
