import { NextRequest, NextResponse } from "next/server";
import { isAuthConfigured, SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

// Rotas que precisam continuar acessíveis sem login:
// - webhook da Meta (verificação + mensagens) e webhook do Embedded Signup;
// - cron de follow-ups (protegido pelo CRON_SECRET no próprio handler);
// - teste de nível público que o lead abre pelo link (/teste/[id] e as APIs
//   que essa página consome);
// - páginas legais exigidas pela Meta;
// - a própria tela/rotas de login e os assets estáticos.
const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth/",
  "/api/webhooks/",
  "/api/integrations/whatsapp/webhook",
  "/api/jobs/",
  "/teste/",
  "/api/level-test/",
  "/privacy",
  "/terms",
  "/data-deletion",
  "/_next/",
  "/favicon",
];

// Dentro de /api/level-test, a revisão é interna (closer) — exige login.
const BLOCKED_INSIDE_PUBLIC = ["/review"];

function isPublicPath(pathname: string) {
  if (!PUBLIC_PREFIXES.some((prefix) => pathname === prefix.replace(/\/$/, "") || pathname.startsWith(prefix))) {
    return false;
  }
  if (pathname.startsWith("/api/level-test/") && BLOCKED_INSIDE_PUBLIC.some((s) => pathname.endsWith(s))) {
    return false;
  }
  return true;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  // Sem AUTH_EMAIL/AUTH_PASSWORD/AUTH_SECRET no ambiente, o app segue aberto
  // (comportamento antigo) — a proteção liga quando as variáveis existirem.
  if (!isAuthConfigured()) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const valid = await verifySessionToken(token, process.env.AUTH_SECRET as string);
  if (valid) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
