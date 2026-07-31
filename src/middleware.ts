import { NextRequest, NextResponse } from "next/server";
import { getAuthSecret, SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

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

// Áreas de gestão: vendedor não acessa (admin e SDR sim). O vendedor usa
// Painel, Pipeline, Conversas, Agenda e Disparos — inclusive a prospecção e
// os disparos DENTRO do painel (/api/prospects e /api/campaigns liberados).
const ADMIN_ONLY_PREFIXES = [
  "/settings",
  "/prospeccao",
  "/test-inbound",
  "/reports",
  "/api/settings",
  "/api/users",
  "/api/stages",
  "/api/knowledge",
  // Integrações WhatsApp (deregister/oauth/templates) e injeção de inbound
  // de teste são função de gestor. O webhook da Meta segue público (a lista
  // PUBLIC_PREFIXES é avaliada antes desta).
  "/api/integrations",
  "/api/messages",
];

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

  // Sem chave de sessão (migration 013 não aplicada e sem AUTH_SECRET no
  // ambiente), o app segue aberto — a proteção liga sozinha depois.
  const secret = await getAuthSecret();
  if (!secret) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = await verifySessionToken(token, secret);

  if (!user) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(loginUrl);
  }

  // Páginas aposentadas (substituídas pelo Painel do Vendedor).
  if (pathname === "/meu-dia" || pathname === "/vendedor") {
    const painelUrl = request.nextUrl.clone();
    painelUrl.pathname = "/painel-vendedor";
    painelUrl.search = "";
    return NextResponse.redirect(painelUrl);
  }

  if (user.role === "vendedor") {
    // Vendedor cai direto no painel dele.
    if (pathname === "/") {
      const painelUrl = request.nextUrl.clone();
      painelUrl.pathname = "/painel-vendedor";
      painelUrl.search = "";
      return NextResponse.redirect(painelUrl);
    }
    if (ADMIN_ONLY_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Acesso restrito ao gestor" }, { status: 403 });
      }
      const painelUrl = request.nextUrl.clone();
      painelUrl.pathname = "/painel-vendedor";
      painelUrl.search = "";
      return NextResponse.redirect(painelUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
