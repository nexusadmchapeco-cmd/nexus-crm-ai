import { NextResponse } from "next/server";
import {
  createSessionToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  type SessionUser,
} from "@/lib/auth";

// Resposta JSON já com o cookie de sessão asssinado (login e bootstrap).
export async function sessionResponse(user: SessionUser, secret: string) {
  const token = await createSessionToken(user, secret);
  const response = NextResponse.json({ ok: true, user });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
