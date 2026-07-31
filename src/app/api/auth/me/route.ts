import { NextResponse } from "next/server";
import { getAuthSecret } from "@/lib/auth";
import { getSessionUser } from "@/lib/session";

// Sessão atual para a UI (sidebar, telas com regra por papel).
// authActive=false significa "login ainda não configurado, app aberto".
export async function GET() {
  const secret = await getAuthSecret();
  if (!secret) return NextResponse.json({ authActive: false, user: null });
  const user = await getSessionUser();
  return NextResponse.json({ authActive: true, user });
}
