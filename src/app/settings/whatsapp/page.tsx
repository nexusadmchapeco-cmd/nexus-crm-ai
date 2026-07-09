import { WhatsappConnection } from "@/components/forms/whatsapp-connection";

export default function WhatsappSettingsPage() {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  const isConnected = Boolean(process.env.WHATSAPP_TOKEN && phoneNumberId);

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
              }
            : null
        }
        tokenApplied={isConnected}
      />
    </>
  );
}
