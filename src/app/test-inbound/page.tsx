import { InboundForm } from "@/components/forms/inbound-form";
import { Icon } from "@/components/ui/icon";
import { isSupabaseConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export default function TestInboundPage() {
  const configured = isSupabaseConfigured();
  return (
    <>
      <div className="page-header"><div><div className="eyebrow">Ambiente de teste</div><h1>Simulador de mensagem</h1><p>Teste o fluxo completo antes de conectar o WhatsApp real.</p></div></div>
      <div className="form-shell">
        <InboundForm configured={configured} />
        <aside className="helper-card">
          <div className="helper-icon"><Icon name="flask" size={25} /></div>
          <h3>O que acontece neste teste?</h3>
          <p>A mensagem percorre o mesmo fluxo que será usado pela integração oficial.</p>
          <ul className="helper-list">
            <li><Icon name="check" size={13} /> Lead e conversa são criados no Supabase</li>
            <li><Icon name="check" size={13} /> A IA responde e extrai os dados</li>
            <li><Icon name="check" size={13} /> Temperatura e etapa são atualizadas</li>
            <li><Icon name="check" size={13} /> O card aparece no pipeline</li>
          </ul>
        </aside>
      </div>
    </>
  );
}
