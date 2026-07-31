import { cookies } from "next/headers";
import { getAuthSecret, SESSION_COOKIE, verifySessionToken, type SessionUser } from "@/lib/auth";

// Usuário logado, para páginas e rotas no servidor. Retorna null quando o
// login ainda não está configurado (migration 013 ausente e sem AUTH_*).
export async function getSessionUser(): Promise<SessionUser | null> {
  const secret = await getAuthSecret();
  if (!secret) return null;
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value, secret);
}
