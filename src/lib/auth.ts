// Sessão assinada com HMAC-SHA256 via Web Crypto (funciona no Edge, onde o
// middleware roda). O token carrega e-mail + expiração; a chave vem de
// AUTH_SECRET. Credenciais ficam só em variáveis de ambiente — o repositório
// é público, nada de segredo no código.

const encoder = new TextEncoder();

export const SESSION_COOKIE = "nexus_session";
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 dias

export function isAuthConfigured() {
  return Boolean(
    process.env.AUTH_EMAIL && process.env.AUTH_PASSWORD && process.env.AUTH_SECRET,
  );
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

export async function createSessionToken(email: string, secret: string) {
  const payload = base64UrlEncode(
    encoder.encode(
      JSON.stringify({ email, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS }),
    ),
  );
  return `${payload}.${await hmac(payload, secret)}`;
}

export async function verifySessionToken(token: string | undefined, secret: string) {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  if (!timingSafeEqualStrings(signature, await hmac(payload, secret))) return false;
  try {
    const normalized = payload.replaceAll("-", "+").replaceAll("_", "/");
    const decoded = JSON.parse(atob(normalized)) as { exp?: number };
    return typeof decoded.exp === "number" && decoded.exp > Date.now() / 1000;
  } catch {
    return false;
  }
}
