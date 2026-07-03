export function isWhatsAppConfigured() {
  return Boolean(
    process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID,
  );
}

export async function sendWhatsAppMessage(phone: string, message: string) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = process.env.WHATSAPP_API_VERSION || "v22.0";
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
