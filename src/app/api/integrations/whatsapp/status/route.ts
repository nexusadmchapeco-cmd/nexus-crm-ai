import { NextResponse } from "next/server";

const GRAPH_VERSION = process.env.WHATSAPP_API_VERSION || "v25.0";

const PHONE_FIELDS =
  "display_phone_number,verified_name,quality_rating,code_verification_status,status,platform_type";

async function graphGet(path: string, token: string) {
  const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const body = await response.json();
  return { ok: response.ok, body };
}

export async function GET() {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "WHATSAPP_TOKEN não configurado" }, { status: 400 });
  }

  const configuredPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || null;
  const businessId = process.env.META_BUSINESS_ID || null;

  const result: Record<string, unknown> = {
    configured: {
      phoneNumberId: configuredPhoneNumberId,
      businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || null,
    },
  };

  if (configuredPhoneNumberId) {
    const { ok, body } = await graphGet(`/${configuredPhoneNumberId}?fields=${PHONE_FIELDS}`, token);
    result.configuredNumber = ok
      ? body
      : { error: body?.error?.message || "Falha ao consultar o número configurado" };
  }

  if (businessId) {
    const wabaList = await graphGet(`/${businessId}/owned_whatsapp_business_accounts?fields=id,name`, token);
    if (wabaList.ok) {
      const accounts = (wabaList.body?.data as { id: string; name: string }[]) || [];
      const inventory = [];
      for (const account of accounts) {
        const numbers = await graphGet(`/${account.id}/phone_numbers?fields=${PHONE_FIELDS}`, token);
        inventory.push({
          wabaId: account.id,
          wabaName: account.name,
          numbers: numbers.ok
            ? numbers.body?.data || []
            : { error: numbers.body?.error?.message || "Falha ao listar números" },
        });
      }
      result.allWhatsAppBusinessAccounts = inventory;
    } else {
      result.allWhatsAppBusinessAccounts = {
        error: wabaList.body?.error?.message || "Falha ao listar contas do WhatsApp Business",
      };
    }
  } else {
    result.hint =
      "Defina META_BUSINESS_ID (ID do Business Manager) para listar automaticamente todas as WABAs e localizar um número com status CONNECTED.";
  }

  return NextResponse.json(result);
}
