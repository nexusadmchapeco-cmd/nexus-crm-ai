// Sessão assinada com HMAC-SHA256 via Web Crypto (funciona no Edge, onde o
// middleware roda). O token carrega usuário/papel/unidade + expiração.
// A chave de assinatura vem do banco (app_secrets.auth_session_secret, criada
// pela migration 013) — com fallback em AUTH_SECRET no ambiente. Enquanto a
// migration não roda e não há env, o app fica aberto (modo antigo).

const encoder = new TextEncoder();

export const SESSION_COOKIE = "nexus_session";
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 dias

export type SessionUser = {
  uid: string;
  email: string;
  name: string;
  role: "admin" | "sdr" | "vendedor";
  unit: "chapeco" | "passo_fundo" | null;
};

// Cache em escopo de módulo: no serverless vale por instância; evita bater no
// banco a cada request. TTL curto para a proteção ligar logo após a migration.
let cachedSecret: { value: string | null; at: number } | null = null;
const SECRET_TTL_MS = 5 * 60 * 1000;

export async function getAuthSecret(): Promise<string | null> {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (cachedSecret && Date.now() - cachedSecret.at < SECRET_TTL_MS) return cachedSecret.value;
  try {
    const response = await fetch(
      `${url}/rest/v1/app_secrets?name=eq.auth_session_secret&select=value`,
      {
        headers: { apikey: key, authorization: `Bearer ${key}` },
        cache: "no-store",
      },
    );
    const rows = (await response.json()) as { value?: string }[] | unknown;
    const value =
      Array.isArray(rows) && rows[0] && typeof rows[0].value === "string" ? rows[0].value : null;
    cachedSecret = { value, at: Date.now() };
    return value;
  } catch {
    return cachedSecret?.value ?? null;
  }
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function hmac(payload: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return base64UrlEncode(new Uint8Array(signature));
}

export function timingSafeEqualStrings(a: string, b: string) {
  const bytesA = encoder.encode(a);
  const bytesB = encoder.encode(b);
  let diff = bytesA.length ^ bytesB.length;
  const length = Math.max(bytesA.length, bytesB.length);
  for (let i = 0; i < length; i += 1) {
    diff |= (bytesA[i % bytesA.length] ?? 0) ^ (bytesB[i % bytesB.length] ?? 0);
  }
  return diff === 0;
}

export async function createSessionToken(user: SessionUser, secret: string) {
  const payload = base64UrlEncode(
    encoder.encode(
      JSON.stringify({ ...user, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS }),
    ),
  );
  return `${payload}.${await hmac(payload, secret)}`;
}

export async function verifySessionToken(
  token: string | undefined,
  secret: string,
): Promise<SessionUser | null> {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  if (!timingSafeEqualStrings(signature, await hmac(payload, secret))) return null;
  try {
    const normalized = payload.replaceAll("-", "+").replaceAll("_", "/");
    const decoded = JSON.parse(atob(normalized)) as Partial<SessionUser> & { exp?: number };
    if (typeof decoded.exp !== "number" || decoded.exp <= Date.now() / 1000) return null;
    if (!decoded.uid || !decoded.email || !decoded.role) return null;
    return {
      uid: String(decoded.uid),
      email: String(decoded.email),
      name: String(decoded.name || decoded.email),
      role: decoded.role as SessionUser["role"],
      unit: decoded.unit === "chapeco" || decoded.unit === "passo_fundo" ? decoded.unit : null,
    };
  } catch {
    return null;
  }
}
