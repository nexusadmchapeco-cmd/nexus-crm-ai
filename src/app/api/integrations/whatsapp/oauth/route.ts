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

type MetaPhoneNumberResult = {
  whatsapp_business_account?: {
    id?: string;
  };
};

type MetaBusinessAccountsResult = MetaErrorResult & {
  data?: Array<{
    id?: string;
    name?: string;
    phone_numbers?: {
      data?: Array<{
        id?: string;
        display_phone_number?: string;
      }>;
    };
  }>;
};

type MetaErrorResult = {
  error?: {
    message?: string;
  };
};

function explainWhatsAppPermissionIssue({
  wabaId,
  originalError,
}: {
  wabaId: string;
  originalError: string;
}) {
  const normalizedError = originalError.toLowerCase();
  const looksLikePermissionError =
    normalizedError.includes("does not exist") ||
    normalizedError.includes("missing permissions") ||
    normalizedError.includes("cannot be loaded") ||
    normalizedError.includes("does not support this operation");

  if (!looksLikePermissionError) return originalError;

  return [
    "A Meta autorizou o fluxo, mas o token retornado não tem permissão para assinar a entrada de mensagens dessa conta WhatsApp.",
    `Conta WhatsApp Business: ${wabaId}.`,
    "No Meta Business, atribua o app/usuário do sistema à conta WhatsApp Nexus Comercial com controle total e gere um token com whatsapp_business_management, whatsapp_business_messaging e business_management.",
    `Erro original da Meta: ${originalError}`,
  ].join(" ");
}

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

async function resolveWabaIdFromPhoneNumber({
  accessToken,
  phoneNumberId,
  businessId,
}: {
  accessToken: string;
  phoneNumberId: string;
  businessId: string;
}) {
  try {
    const phoneUrl = new URL(`https://graph.facebook.com/v25.0/${encodeURIComponent(phoneNumberId)}`);
    phoneUrl.searchParams.set("fields", "whatsapp_business_account");

    const response = await fetch(phoneUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    const result = (await response.json()) as MetaPhoneNumberResult;
    if (response.ok && result.whatsapp_business_account?.id) {
      return result.whatsapp_business_account.id;
    }
  } catch {
    // Tenta a busca pelo Business abaixo.
  }

  const edges = ["owned_whatsapp_business_accounts", "client_whatsapp_business_accounts"];
  for (const edge of edges) {
    try {
      const accountsUrl = new URL(
        `https://graph.facebook.com/v25.0/${encodeURIComponent(businessId)}/${edge}`,
      );
      accountsUrl.searchParams.set("fields", "id,name,phone_numbers{id,display_phone_number}");
      accountsUrl.searchParams.set("limit", "100");

      const response = await fetch(accountsUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const result = (await response.json()) as MetaBusinessAccountsResult;
      if (!response.ok) continue;

      const matchingAccount = result.data?.find((account) =>
        account.phone_numbers?.data?.some((phone) => phone.id === phoneNumberId),
      );
      if (matchingAccount?.id) return matchingAccount.id;
    } catch {
      // Continua tentando outras formas de descoberta.
    }
  }

  return undefined;
}

async function subscribeWabaToWebhooks({
  accessToken,
  wabaIds,
}: {
  accessToken: string;
  wabaIds: Array<string | undefined>;
}) {
  const uniqueWabaIds = Array.from(new Set(wabaIds.filter((wabaId): wabaId is string => Boolean(wabaId))));
  if (uniqueWabaIds.length === 0) {
    return {
      subscribed: false,
      warning:
        "Não consegui descobrir a conta WhatsApp vinculada ao número. O token autorizado não trouxe permissão para ler/gerenciar essa conta. Confirme se o app whats_crm_ai tem acesso à conta WhatsApp no Meta Business.",
      wabaId: undefined,
    };
  }

  let lastWarning = "Não foi possível assinar os webhooks da conta.";

  for (const wabaId of uniqueWabaIds) {
    const subscriptionResponse = await fetch(
      `https://graph.facebook.com/v25.0/${encodeURIComponent(wabaId)}/subscribed_apps`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      },
    );
    const subscriptionResult = (await subscriptionResponse.json()) as MetaErrorResult;
    if (subscriptionResponse.ok) return { subscribed: true, wabaId };

    lastWarning = explainWhatsAppPermissionIssue({
      wabaId,
      originalError: subscriptionResult.error?.message || lastWarning,
    });
  }

  return { subscribed: false, warning: lastWarning, wabaId: uniqueWabaIds[0] };
}

export async function POST(request: Request) {
  try {
    const { code, wabaId, phoneNumberId, redirectUri } = await request.json();
    if (!code || !phoneNumberId) {
      return NextResponse.json({ error: "Dados de autorização incompletos." }, { status: 400 });
    }

    const appId = process.env.META_APP_ID || "1044757988238138";
    const appSecret = requireEnv("META_APP_SECRET");
    const businessId = process.env.META_BUSINESS_ID || "1048092399063891";
    const accessToken = await exchangeMetaToken({ appId, appSecret, code, redirectUri });
    const resolvedWabaId = await resolveWabaIdFromPhoneNumber({
      accessToken,
      phoneNumberId,
      businessId,
    });

    const subscription = await subscribeWabaToWebhooks({
      accessToken,
      wabaIds: [resolvedWabaId, wabaId],
    });

    return NextResponse.json({
      success: true,
      accessToken,
      wabaId: subscription.wabaId || resolvedWabaId || wabaId,
      phoneNumberId,
      webhookSubscribed: subscription.subscribed,
      webhookWarning: subscription.subscribed ? undefined : subscription.warning,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao conectar o WhatsApp." },
      { status: 500 },
    );
  }
}
