import { NextResponse } from "next/server";
import {
  createSessionToken,
  isAuthConfigured,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  timingSafeEqualStrings,
} from "@/lib/auth";

export async function POST(request: Request) {
  if (!isAuthConfigured()) {
    return NextResponse.json(
      { error: "Login não configurado (AUTH_EMAIL, AUTH_PASSWORD e AUTH_SECRET ausentes)." },
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
  const emailOk = timingSafeEqualStrings(email, String(process.env.AUTH_EMAIL).trim().toLowerCase());
  const passwordOk = timingSafeEqualStrings(password, String(process.env.AUTH_PASSWORD));
  if (!emailOk || !passwordOk) {
    return NextResponse.json({ error: "E-mail ou senha incorretos." }, { status: 401 });
  }
  const token = await createSessionToken(email, String(process.env.AUTH_SECRET));
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
