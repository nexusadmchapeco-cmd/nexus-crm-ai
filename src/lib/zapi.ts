// Canal NÃO OFICIAL de WhatsApp via Z-API (z-api.io): um WhatsApp normal
// pareado por QR Code. Decisão do diretor (07/08): a conta oficial da Meta
// travou por cobrança, então o sistema ganha este canal alternativo — quando
// ativado, TODOS os envios saem por aqui (sem templates, sem janela de 24h;
// botões viram opções numeradas). Risco conhecido: canal não oficial pode
// levar a banimento do número pelo WhatsApp — usar com número dedicado.
//
// Credenciais em app_secrets: zapi_instance_id, zapi_instance_token,
// zapi_client_token, zapi_enabled ("1" liga o canal), zapi_webhook_secret.

import { createAdminClient } from "@/lib/supabase/admin";

export type ZapiConfig = {
  instanceId: string;
  instanceToken: string;
  clientToken: string;
  enabled: boolean;
  webhookSecret: string;
};

const SECRET_NAMES = [
  "zapi_instance_id",
  "zapi_instance_token",
  "zapi_client_token",
  "zapi_enabled",
  "zapi_webhook_secret",
] as const;

// Cache curtíssimo: o canal é consultado a cada envio; 15s evita uma ida ao
// banco por mensagem sem segurar uma troca de canal por muito tempo.
let cache: { config: ZapiConfig | null; at: number } | null = null;

export function invalidateZapiCache() {
  cache = null;
}

export async function getZapiConfig(): Promise<ZapiConfig | null> {
  if (cache && Date.now() - cache.at < 15_000) return cache.config;
  try {
    const { data } = await createAdminClient()
      .from("app_secrets")
      .select("name, value")
      .in("name", [...SECRET_NAMES]);
    const map = new Map((data || []).map((row) => [row.name, String(row.value || "")]));
    const config: ZapiConfig | null =
      map.get("zapi_instance_id") && map.get("zapi_instance_token")
        ? {
            instanceId: map.get("zapi_instance_id")!.trim(),
            instanceToken: map.get("zapi_instance_token")!.trim(),
            clientToken: (map.get("zapi_client_token") || "").trim(),
            enabled: map.get("zapi_enabled") === "1",
            webhookSecret: (map.get("zapi_webhook_secret") || "").trim(),
          }
        : null;
    cache = { config, at: Date.now() };
    return config;
  } catch {
    return null;
  }
}

// O canal Z-API está LIGADO como via de envio?
export async function zapiActive(): Promise<boolean> {
  const config = await getZapiConfig();
  return Boolean(config?.enabled && config.instanceId && config.instanceToken);
}

async function zapiFetch(
  config: ZapiConfig,
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const url = `https://api.z-api.io/instances/${config.instanceId}/token/${config.instanceToken}/${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(config.clientToken ? { "Client-Token": config.clientToken } : {}),
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { ok: response.ok, status: response.status, body };
}

export async function zapiSendText(phone: string, message: string) {
  const config = await getZapiConfig();
  if (!config) throw new Error("Z-API não configurada");
  const result = await zapiFetch(config, "send-text", {
    method: "POST",
    body: JSON.stringify({ phone: phone.replace(/\D/g, ""), message }),
  });
  if (!result.ok) {
    throw new Error(`Z-API recusou o envio (${result.status}): ${JSON.stringify(result.body).slice(0, 200)}`);
  }
  return result.body as { messageId?: string; zaapId?: string };
}

export async function zapiSendAudio(phone: string, base64Audio: string) {
  const config = await getZapiConfig();
  if (!config) throw new Error("Z-API não configurada");
  const result = await zapiFetch(config, "send-audio", {
    method: "POST",
    body: JSON.stringify({ phone: phone.replace(/\D/g, ""), audio: `data:audio/ogg;base64,${base64Audio}` }),
  });
  if (!result.ok) {
    throw new Error(`Z-API recusou o áudio (${result.status})`);
  }
  return result.body;
}

// QR Code para parear (imagem base64 pronta pra <img src>).
export async function zapiQrImage() {
  const config = await getZapiConfig();
  if (!config) throw new Error("Z-API não configurada");
  const result = await zapiFetch(config, "qr-code/image");
  const body = result.body as { value?: string; connected?: boolean } | null;
  return { connected: Boolean(body?.connected), image: body?.value || null, raw: result.body };
}

export async function zapiStatus() {
  const config = await getZapiConfig();
  if (!config) throw new Error("Z-API não configurada");
  const result = await zapiFetch(config, "status");
  return result.body as { connected?: boolean; smartphoneConnected?: boolean; error?: string } | null;
}

// Aponta o webhook de mensagens recebidas da instância pro nosso endpoint.
export async function zapiSetWebhook(baseUrl: string) {
  const config = await getZapiConfig();
  if (!config) throw new Error("Z-API não configurada");
  const url = `${baseUrl}/api/webhooks/zapi${config.webhookSecret ? `?secret=${config.webhookSecret}` : ""}`;
  const result = await zapiFetch(config, "update-webhook-received", {
    method: "PUT",
    body: JSON.stringify({ value: url }),
  });
  return { ok: result.ok, url, body: result.body };
}

// ── Degradação de templates: no canal não oficial não existem templates
// aprovados — cada modelo conhecido vira texto puro com os parâmetros.
export function renderTemplateAsText(templateName: string, params: string[]): string {
  const p = (index: number) => params[index] ?? "";
  switch (templateName) {
    case "lead_quente":
      return (
        `🔥 Lead quente esperando contato!\n\n` +
        `Nome: ${p(0)}\nNúmero do celular: ${p(1)}\nObjetivo: ${p(2)}\n` +
        `Unidade: ${p(3)}\nModalidade do curso: ${p(4)}\n\nResumo do atendimento: ${p(5)}`
      );
    case "resumo_closer":
      return `🔥 Lead quente: ${p(0)} · Objetivo: ${p(1)} · Unidade: ${p(2)} · Disponibilidade: ${p(3)} · ${p(4)}`;
    case "confirmacao_reuniao":
      return (
        `Oi, ${p(0)}! Passando pra confirmar seu horário na Nexus English Center: ${p(1)}. Podemos confirmar?\n\n` +
        `1️⃣ Sim, confirmado\n2️⃣ Preciso remarcar\n\nResponda com o número da opção. 😊`
      );
    default: {
      if (templateName.startsWith("followup_")) {
        return (
          `Oi, ${p(0)}! Aqui é a Nina, da Nexus English Center. 😊 Retomando nosso papo sobre o seu inglês ${p(1)}.\n\n` +
          `1️⃣ Falar com consultor\n2️⃣ Tenho uma dúvida\n3️⃣ Agora não\n\nResponda com o número da opção.`
        );
      }
      return params.filter(Boolean).join("\n");
    }
  }
}

// Botões interativos viram opções numeradas (o lead responde "1", "2"...).
export function renderButtonsAsText(bodyText: string, buttons: { id: string; title: string }[]): string {
  const digits = ["1️⃣", "2️⃣", "3️⃣"];
  const options = buttons.map((button, index) => `${digits[index] || `${index + 1})`} ${button.title}`).join("\n");
  return `${bodyText}\n\n${options}\n\nResponda com o número da opção.`;
}
