import { WhatsappConnection } from "@/components/forms/whatsapp-connection";

export const dynamic = "force-dynamic";

async function fetchDisplayPhoneNumber(phoneNumberId: string, token: string) {
  try {
    const apiVersion = process.env.WHATSAPP_API_VERSION || "v25.0";
    const response = await fetch(
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}?fields=display_phone_number,verified_name`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
    );
    if (!response.ok) return null;
    const data = await response.json();
    return (data.display_phone_number as string | undefined) || null;
  } catch {
    return null;
  }
}

export default async function WhatsappSettingsPage() {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  const token = process.env.WHATSAPP_TOKEN;
  const isConnected = Boolean(token && phoneNumberId);
  const displayPhoneNumber =
    isConnected && phoneNumberId && token
      ? await fetchDisplayPhoneNumber(phoneNumberId, token)
      : null;

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">Integrações</div>
          <h1>WhatsApp Business</h1>
          <p>Conecte o número comercial ao CRM mantendo o atendimento no celular.</p>
        </div>
      </div>
      <WhatsappConnection
        initialConnection={
          isConnected && phoneNumberId
            ? {
                wabaId,
                phoneNumberId,
                displayPhoneNumber,
              }
            : null
        }
        tokenApplied={isConnected}
      />
    </>
  );
}
