import Link from "next/link";
import { Icon } from "@/components/ui/icon";

export function ConfigRequired() {
  return (
    <div className="config-state">
      <div className="config-icon"><Icon name="settings" size={24} /></div>
      <h2>Conecte o Supabase para começar</h2>
      <p>O CRM está pronto para usar dados reais. Preencha o arquivo <code>.env.local</code> e execute a migration inicial.</p>
      <div className="config-steps">
        <span><b>1</b> Criar projeto Supabase</span>
        <span><b>2</b> Executar a migration SQL</span>
        <span><b>3</b> Adicionar as credenciais</span>
      </div>
      <Link href="/test-inbound" className="button button-primary">Ir para o simulador <Icon name="arrow" /></Link>
    </div>
  );
}
