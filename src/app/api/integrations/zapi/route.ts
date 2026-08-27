import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getZapiConfig,
  invalidateZapiCache,
  zapiQrImage,
  zapiSetWebhook,
  zapiStatus,
} from "@/lib/zapi";

// Gestão do canal não oficial (Z-API) — admin-only via middleware
// (/api/integrations). GET traz o estado; POST salva credenciais, gera QR,
// liga/desliga o canal e aponta o webhook da instância pro CRM.

function requestOrigin(request: Request) {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "https";
  return host ? `${proto}://${host}` : new URL(request.url).origin;
}

async function saveSecret(name: string, value: string) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("app_secrets")
    .upsert({ name, value, updated_at: new Date().toISOString() }, { onConflict: "name" });
  if (error) throw error;
}

export async function GET() {
  try {
    const config = await getZapiConfig();
    if (!config) return NextResponse.json({ configured: false, enabled: false });
    let status: { connected?: boolean; smartphoneConnected?: boolean; error?: string } | null = null;
    try {
      status = await zapiStatus();
    } catch {
      status = null;
    }
    return NextResponse.json({
      configured: true,
      enabled: config.enabled,
      instance_hint: `${config.instanceId.slice(0, 4)}…${config.instanceId.slice(-4)}`,
      connected: Boolean(status?.connected),
      smartphone_connected: Boolean(status?.smartphoneConnected),
      status_error: status?.error || null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao consultar a Z-API." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "save");

    if (action === "save") {
      const instanceId = String(body.instance_id || "").trim();
      const instanceToken = String(body.instance_token || "").trim();
      const clientToken = String(body.client_token || "").trim();
      if (!instanceId || !instanceToken) {
        return NextResponse.json(
          { error: "Informe o ID da instância e o token (painel da Z-API)." },
          { status: 400 },
        );
      }
      await saveSecret("zapi_instance_id", instanceId);
      await saveSecret("zapi_instance_token", instanceToken);
      if (clientToken) await saveSecret("zapi_client_token", clientToken);
      // Segredo do webhook: gerado uma vez, reaproveitado depois.
      const existing = await getZapiConfig();
      if (!existing?.webhookSecret) {
        await saveSecret(
          "zapi_webhook_secret",
          Array.from(crypto.getRandomValues(new Uint8Array(16)))
            .map((byte) => byte.toString(16).padStart(2, "0"))
            .join(""),
        );
      }
      invalidateZapiCache();
      // Já aponta o webhook da instância pro CRM.
      const webhook = await zapiSetWebhook(requestOrigin(request)).catch((error) => ({
        ok: false,
        url: null,
        body: String(error),
      }));
      return NextResponse.json({ ok: true, webhook });
    }

    if (action === "qr") {
      const qr = await zapiQrImage();
      return NextResponse.json(qr);
    }

    if (action === "toggle") {
      const enabled = Boolean(body.enabled);
      await saveSecret("zapi_enabled", enabled ? "1" : "0");
      invalidateZapiCache();
      return NextResponse.json({ ok: true, enabled });
    }

    if (action === "set-webhook") {
      const webhook = await zapiSetWebhook(requestOrigin(request));
      return NextResponse.json(webhook);
    }

    return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro na Z-API." },
      { status: 500 },
    );
  }
}
