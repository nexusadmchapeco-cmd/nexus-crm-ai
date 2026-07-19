export function isWhatsAppConfigured() {
  return Boolean(
    process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID,
  );
}

export async function sendWhatsAppMessage(phone: string, message: string) {
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
 * Marca a mensagem recebida como lida e mostra "digitando…" para o cliente
 * (o indicador some sozinho quando a resposta é enviada, ou após ~25s).
 */
export async function sendTypingIndicator(messageId: string) {
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
        status: "read",
        message_id: messageId,
        typing_indicator: { type: "text" },
      }),
    },
  );
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

  const response = await fetch(
    `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone,
        type: "audio",
        audio: { id: mediaId },
      }),
    },
  );
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
) {
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
