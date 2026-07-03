import { WhatsappConnection } from "@/components/forms/whatsapp-connection";

export default function WhatsappSettingsPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">Integrações</div>
          <h1>WhatsApp Business</h1>
          <p>Conecte o número comercial ao CRM mantendo o atendimento no celular.</p>
        </div>
      </div>
      <WhatsappConnection />
    </>
  );
}
