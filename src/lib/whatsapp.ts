import {
  renderButtonsAsText,
  renderTemplateAsButtons,
  renderTemplateAsText,
  zapiActive,
  zapiSendAudio,
  zapiSendButtonList,
  zapiSendText,
} from "@/lib/zapi";

export function isWhatsAppConfigured() {
  return Boolean(
    process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID,
  );
}

// Canal-agnóstico: há ALGUM canal de envio pronto (Cloud API oficial ou
// Z-API não oficial ligada)? Use nas rotas que decidem se enviam de verdade.
export async function isAnyWhatsAppChannelReady() {
  if (isWhatsAppConfigured()) return true;
  return zapiActive();
}

export async function sendWhatsAppMessage(phone: string, message: string) {
  // Canal não oficial ligado? Tudo sai pela Z-API (sem janela de 24h).
  if (await zapiActive()) return zapiSendText(phone, message);
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = process.env.WHATSAPP_API_VERSION || "v25.0";
  if (!token || !phoneNumberId) throw new Error("WhatsApp Cloud API não configurada");
  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone,
      type: "text",
      text: { body: message },
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Falha ao enviar WhatsApp (${response.status}): ${body.slice(0, 300)}`);
  }
  return response.json();
}

/**
 * Marca a mensagem como lida e mostra o indicador: "digitando…" (text) ou
 * "gravando áudio" (audio). Se a conta não aceitar o modo áudio, cai para
 * text. O indicador some sozinho ao enviar a resposta, ou após ~25s.
 */
export async function sendTypingIndicator(messageId: string, mode: "text" | "audio" = "text") {
  // Z-API não tem indicador equivalente pro id de mensagem da Meta.
  if (await zapiActive()) return null;
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = process.env.WHATSAPP_API_VERSION || "v25.0";
  if (!token || !phoneNumberId) throw new Error("WhatsApp Cloud API não configurada");
  const post = (type: string) =>
    fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
        typing_indicator: { type },
      }),
    });
  let response = await post(mode);
  if (!response.ok && mode !== "text") {
    // Modo "audio" não suportado nesta conta -> volta pro "digitando".
    response = await post("text");
  }
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Falha no indicador de digitação (${response.status}): ${body.slice(0, 200)}`);
  }
  return response.json();
}

/** Baixa uma mídia recebida pelo webhook (áudio, imagem etc.) pelo media id. */
export async function downloadWhatsAppMedia(mediaId: string) {
  const token = process.env.WHATSAPP_TOKEN;
  const apiVersion = process.env.WHATSAPP_API_VERSION || "v25.0";
  if (!token) throw new Error("WhatsApp Cloud API não configurada");

  const metaResponse = await fetch(`https://graph.facebook.com/${apiVersion}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!metaResponse.ok) {
    throw new Error(`Falha ao localizar mídia (${metaResponse.status})`);
  }
  const meta = await metaResponse.json();
  const fileResponse = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!fileResponse.ok) {
    throw new Error(`Falha ao baixar mídia (${fileResponse.status})`);
  }
  return {
    buffer: await fileResponse.arrayBuffer(),
    mimeType: String(meta.mime_type || "application/octet-stream"),
  };
}

/** Envia um áudio (voz da Nina): sobe a mídia e dispara a mensagem de áudio. */
export async function sendWhatsAppAudio(phone: string, audio: ArrayBuffer, mimeType: string) {
  if (await zapiActive()) {
    return zapiSendAudio(phone, Buffer.from(audio).toString("base64"));
  }
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = process.env.WHATSAPP_API_VERSION || "v25.0";
  if (!token || !phoneNumberId) throw new Error("WhatsApp Cloud API não configurada");

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mimeType);
  form.append(
    "file",
    new File([audio], mimeType.includes("ogg") ? "nina.ogg" : "nina.mp3", { type: mimeType }),
  );
  const uploadResponse = await fetch(
    `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/media`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form },
  );
  if (!uploadResponse.ok) {
    const body = await uploadResponse.text();
    throw new Error(`Falha ao subir áudio (${uploadResponse.status}): ${body.slice(0, 200)}`);
  }
  const { id: mediaId } = await uploadResponse.json();

  const sendAudio = (asVoice: boolean) =>
    fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone,
        type: "audio",
        // voice:true é o que faz o WhatsApp renderizar como mensagem de voz
        // (bolha com waveform) em vez de arquivo de áudio.
        audio: asVoice ? { id: mediaId, voice: true } : { id: mediaId },
      }),
    });

  let response = await sendAudio(true);
  if (!response.ok) {
    // Se a versão da API rejeitar o campo voice, reenvia como áudio comum.
    response = await sendAudio(false);
  }
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Falha ao enviar áudio (${response.status}): ${body.slice(0, 300)}`);
  }
  return response.json();
}

export async function sendWhatsAppTemplate(
  phone: string,
  templateName: string,
  languageCode: string,
  bodyParameters: string[],
  // Payloads dos botões quick reply (na ordem dos botões do modelo). O clique
  // volta no webhook como button.payload — é assim que o roteamento fixo
  // (CONFIRMAR_PRESENCA, HANDOFF_CONSULTOR...) funciona.
  buttonPayloads?: string[],
) {
  // No canal não oficial não há templates: modelos com botões conhecidos
  // viram mensagens com botões REAIS (clique volta como payload no webhook);
  // se o envio com botões falhar, cai no texto com opções numeradas.
  if (await zapiActive()) {
    const withButtons = renderTemplateAsButtons(templateName.trim(), bodyParameters);
    if (withButtons) {
      try {
        return await zapiSendButtonList(phone, withButtons.message, withButtons.buttons);
      } catch {
        // aparelho/instância sem suporte a botões — segue como texto
      }
    }
    return zapiSendText(phone, renderTemplateAsText(templateName.trim(), bodyParameters));
  }
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = process.env.WHATSAPP_API_VERSION || "v25.0";
  if (!token || !phoneNumberId) throw new Error("WhatsApp Cloud API não configurada");
  if (!templateName.trim()) throw new Error("Informe um modelo aprovado da Meta");

  const response = await fetch(
    `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone.replace(/\D/g, ""),
        type: "template",
        template: {
          name: templateName.trim(),
          language: { code: languageCode || "pt_BR" },
          components: [
            {
              type: "body",
              parameters: bodyParameters.map((text) => ({ type: "text", text })),
            },
            ...(buttonPayloads || []).map((payload, index) => ({
              type: "button",
              sub_type: "quick_reply",
              index: String(index),
              parameters: [{ type: "payload", payload }],
            })),
          ],
        },
      }),
    },
  );
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Falha no modelo do WhatsApp (${response.status}): ${body.slice(0, 300)}`);
  }
  return response.json();
}

// Mensagem interativa com botões de resposta (máx. 3 por mensagem — limite da
// Cloud API). O clique volta no webhook como interactive.button_reply
// {id, title}; roteamos pelo id.
export async function sendWhatsAppButtons(
  phone: string,
  bodyText: string,
  buttons: { id: string; title: string }[],
) {
  if (await zapiActive()) {
    // Botões de verdade quando o aparelho aceita; senão, opções numeradas
    // (os dígitos 1/2/3 são interpretados de qualquer jeito).
    try {
      return await zapiSendButtonList(phone, bodyText, buttons);
    } catch {
      return zapiSendText(phone, renderButtonsAsText(bodyText, buttons));
    }
  }
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = process.env.WHATSAPP_API_VERSION || "v25.0";
  if (!token || !phoneNumberId) throw new Error("WhatsApp Cloud API não configurada");
  const response = await fetch(
    `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone.replace(/\D/g, ""),
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: bodyText.slice(0, 1024) },
          action: {
            buttons: buttons.slice(0, 3).map((button) => ({
              type: "reply",
              reply: { id: button.id, title: button.title.slice(0, 20) },
            })),
          },
        },
      }),
    },
  );
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Falha nos botões do WhatsApp (${response.status}): ${body.slice(0, 300)}`);
  }
  return response.json();
}
