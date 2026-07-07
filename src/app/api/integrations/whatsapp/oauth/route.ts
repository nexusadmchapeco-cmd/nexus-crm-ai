import { NextResponse } from "next/server";
import { requireEnv } from "@/lib/env";

export async function POST(request: Request) {
  try {
    const { code, wabaId, phoneNumberId, redirectUri } = await request.json();
    if (!code || !wabaId || !phoneNumberId) {
      return NextResponse.json({ error: "Dados de autorização incompletos." }, { status: 400 });
    }

    const appId = process.env.META_APP_ID || "1044757988238138";
    const appSecret = requireEnv("META_APP_SECRET");
    const tokenUrl = new URL("https://graph.facebook.com/v25.0/oauth/access_token");
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("code", code);
    if (redirectUri) tokenUrl.searchParams.set("redirect_uri", redirectUri);

    const tokenResponse = await fetch(tokenUrl, { method: "GET", cache: "no-store" });
    const tokenResult = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenResult.access_token) {
      throw new Error(tokenResult.error?.message || "A Meta não liberou o token de acesso.");
    }

    const subscriptionResponse = await fetch(
      `https://graph.facebook.com/v25.0/${encodeURIComponent(wabaId)}/subscribed_apps`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${tokenResult.access_token}` },
        cache: "no-store",
      },
    );
    const subscriptionResult = await subscriptionResponse.json();
    if (!subscriptionResponse.ok) {
      throw new Error(subscriptionResult.error?.message || "Não foi possível assinar os webhooks da conta.");
    }

    return NextResponse.json({
      success: true,
      accessToken: tokenResult.access_token,
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
