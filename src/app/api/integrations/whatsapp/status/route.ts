import { NextResponse } from "next/server";

export const maxDuration = 60;

const GRAPH_VERSION = process.env.WHATSAPP_API_VERSION || "v25.0";

const PHONE_FIELDS =
  "display_phone_number,verified_name,quality_rating,code_verification_status,status,platform_type";

async function graphGet(path: string, token: string) {
  try {
    const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const body = await response.json();
    if (!response.ok) {
      return { error: body?.error?.message || `Erro ${response.status} da Meta.` };
    }
    return body;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha de rede ao consultar a Meta." };
  }
}

const TEMPLATE_FIELDS = "name,status,category,language,quality_score";

async function inspectWaba(wabaId: string, wabaName: string | undefined, token: string) {
  const [numbers, subscribedApps, templates] = await Promise.all([
    graphGet(`/${wabaId}/phone_numbers?fields=${PHONE_FIELDS}`, token),
    graphGet(`/${wabaId}/subscribed_apps`, token),
    graphGet(`/${wabaId}/message_templates?fields=${TEMPLATE_FIELDS}&limit=100`, token),
  ]);
  return {
    wabaId,
    wabaName: wabaName || null,
    numbers: numbers.data ?? numbers,
    subscribedApps: subscribedApps.data ?? subscribedApps,
    templates: templates.data ?? templates,
  };
}

export async function GET() {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "WHATSAPP_TOKEN não configurado" }, { status: 400 });
  }

  const appId = process.env.META_APP_ID || "1044757988238138";
  const appSecret = process.env.META_APP_SECRET;
  const appToken = appSecret ? `${appId}|${appSecret}` : null;
  const businessId = process.env.META_BUSINESS_ID || "1048092399063891";
  const configuredPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || null;

  const [configuredNumber, tokenDebug, appWebhook, ownedWabas, clientWabas] = await Promise.all([
    configuredPhoneNumberId
      ? graphGet(`/${configuredPhoneNumberId}?fields=${PHONE_FIELDS}`, token)
      : Promise.resolve(null),
    appToken
      ? graphGet(`/debug_token?input_token=${encodeURIComponent(token)}`, appToken)
      : Promise.resolve(null),
    appToken ? graphGet(`/${appId}/subscriptions`, appToken) : Promise.resolve(null),
    graphGet(`/${businessId}/owned_whatsapp_business_accounts?fields=id,name&limit=100`, token),
    graphGet(`/${businessId}/client_whatsapp_business_accounts?fields=id,name&limit=100`, token),
  ]);

  const wabaList = new Map<string, string | undefined>();
  for (const source of [ownedWabas, clientWabas]) {
    for (const account of source?.data ?? []) {
      if (account?.id) wabaList.set(account.id, account.name);
    }
  }
  const configuredWabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  if (configuredWabaId && !wabaList.has(configuredWabaId)) {
    wabaList.set(configuredWabaId, undefined);
  }

  const accounts = await Promise.all(
    Array.from(wabaList, ([id, name]) => inspectWaba(id, name, token)),
  );

  const debugData = tokenDebug?.data;

  return NextResponse.json({
    configured: {
      phoneNumberId: configuredPhoneNumberId,
      businessAccountId: configuredWabaId || null,
      businessId,
      apiVersion: GRAPH_VERSION,
    },
    token: debugData
      ? {
          valid: debugData.is_valid ?? null,
          type: debugData.type ?? null,
          expiresAt:
            debugData.expires_at === 0
              ? "nunca"
              : debugData.expires_at
                ? new Date(debugData.expires_at * 1000).toISOString()
                : null,
          scopes: debugData.scopes ?? null,
        }
      : (tokenDebug ?? { error: "META_APP_SECRET ausente; não foi possível validar o token." }),
    configuredNumber,
    appWebhook: appWebhook?.data ?? appWebhook,
    accounts,
  });
}
