import { NextResponse } from "next/server";
import { requireEnv } from "@/lib/env";

type MetaTokenResult = {
  access_token?: string;
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
};

async function exchangeMetaToken({
  appId,
  appSecret,
  code,
  redirectUri,
}: {
  appId: string;
  appSecret: string;
  code: string;
  redirectUri?: string;
}) {
  const attempts = redirectUri ? [redirectUri, undefined] : [undefined];
  let lastError = "A Meta não liberou o token de acesso.";

  for (const attemptRedirectUri of attempts) {
    const tokenUrl = new URL("https://graph.facebook.com/v25.0/oauth/access_token");
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("code", code);
    if (attemptRedirectUri) tokenUrl.searchParams.set("redirect_uri", attemptRedirectUri);

    const tokenResponse = await fetch(tokenUrl, { method: "GET", cache: "no-store" });
    const tokenResult = (await tokenResponse.json()) as MetaTokenResult;
    if (tokenResponse.ok && tokenResult.access_token) return tokenResult.access_token;

    lastError = tokenResult.error?.message || lastError;
  }

  if (lastError.toLowerCase().includes("redirect_uri")) {
    throw new Error(
      "A Meta recusou o código porque ele foi gerado por uma URL antiga. Atualize a página do CRM e clique em Conectar novamente.",
    );
  }

  throw new Error(lastError);
}

export async function POST(request: Request) {
  try {
    const { code, wabaId, phoneNumberId, redirectUri } = await request.json();
    if (!code || !wabaId || !phoneNumberId) {
      return NextResponse.json({ error: "Dados de autorização incompletos." }, { status: 400 });
    }

    const appId = process.env.META_APP_ID || "1044757988238138";
    const appSecret = requireEnv("META_APP_SECRET");
    const accessToken = await exchangeMetaToken({ appId, appSecret, code, redirectUri });

    const subscriptionResponse = await fetch(
      `https://graph.facebook.com/v25.0/${encodeURIComponent(wabaId)}/subscribed_apps`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      },
    );
    const subscriptionResult = await subscriptionResponse.json();
    if (!subscriptionResponse.ok) {
      throw new Error(subscriptionResult.error?.message || "Não foi possível assinar os webhooks da conta.");
    }

    return NextResponse.json({
      success: true,
      accessToken,
      wabaId,
      phoneNumberId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao conectar o WhatsApp." },
      { status: 500 },
    );
  }
}
