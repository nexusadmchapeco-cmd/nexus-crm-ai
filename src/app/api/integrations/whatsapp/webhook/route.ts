import { NextResponse } from "next/server";
import { requireEnv } from "@/lib/env";

type GraphError = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
};

type GraphPhoneResult = GraphError & {
  whatsapp_business_account?: {
    id?: string;
  };
};

function getRequestOrigin(request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const host = forwardedHost || request.headers.get("host");
  if (host) return `${forwardedProto || "https"}://${host}`;
  return new URL(request.url).origin;
}

async function readGraphError(response: Response) {
  try {
    const result = (await response.json()) as GraphError;
    return result.error?.message || `Erro ${response.status} da Meta.`;
  } catch {
    return `Erro ${response.status} da Meta.`;
  }
}

async function configureAppWebhook({
  appId,
  appSecret,
  callbackUrl,
  verifyToken,
}: {
  appId: string;
  appSecret: string;
  callbackUrl: string;
  verifyToken: string;
}) {
  const body = new URLSearchParams({
    object: "whatsapp_business_account",
    callback_url: callbackUrl,
    verify_token: verifyToken,
    fields: "messages",
    access_token: `${appId}|${appSecret}`,
  });

  const response = await fetch(`https://graph.facebook.com/v25.0/${appId}/subscriptions`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Webhook do app não configurado: ${await readGraphError(response)}`);
  }
}

async function resolveWabaId({
  token,
  fallbackWabaId,
  phoneNumberId,
}: {
  token: string;
  fallbackWabaId: string;
  phoneNumberId: string;
}) {
  const url = new URL(`https://graph.facebook.com/v25.0/${encodeURIComponent(phoneNumberId)}`);
  url.searchParams.set("fields", "whatsapp_business_account");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const result = (await response.json()) as GraphPhoneResult;
  if (response.ok && result.whatsapp_business_account?.id) {
    return result.whatsapp_business_account.id;
  }
  return fallbackWabaId;
}

async function subscribeWaba({
  token,
  wabaId,
}: {
  token: string;
  wabaId: string;
}) {
  const response = await fetch(
    `https://graph.facebook.com/v25.0/${encodeURIComponent(wabaId)}/subscribed_apps`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`Conta do WhatsApp não assinada: ${await readGraphError(response)}`);
  }
}

export async function POST(request: Request) {
  try {
    const appId = process.env.META_APP_ID || "1044757988238138";
    const appSecret = requireEnv("META_APP_SECRET");
    const verifyToken = requireEnv("META_VERIFY_TOKEN");
    const token = requireEnv("WHATSAPP_TOKEN");
    const phoneNumberId = requireEnv("WHATSAPP_PHONE_NUMBER_ID");
    const configuredWabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "2027823187360420";
    const callbackUrl = `${getRequestOrigin(request)}/api/webhooks/whatsapp`;

    await configureAppWebhook({ appId, appSecret, callbackUrl, verifyToken });
    const wabaId = await resolveWabaId({ token, fallbackWabaId: configuredWabaId, phoneNumberId });
    await subscribeWaba({ token, wabaId });

    return NextResponse.json({
      success: true,
      callbackUrl,
      wabaId,
      phoneNumberId,
      subscribedField: "messages",
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível configurar o webhook do WhatsApp.",
      },
      { status: 500 },
    );
  }
}
