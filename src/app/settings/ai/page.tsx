import { AiSettingsForm } from "@/components/forms/ai-settings-form";
import { ConfigRequired } from "@/components/ui/config-required";
import { Icon } from "@/components/ui/icon";
import { getAiSettings } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function AiSettingsPage() {
  const configured = isSupabaseConfigured();
  const settings = configured ? await getAiSettings() : null;
  return (
    <>
      <div className="page-header"><div><div className="eyebrow">Configurações</div><h1>Assistente de IA</h1><p>Defina como a Nina conversa, qualifica e encaminha seus leads.</p></div></div>
      {!configured || !settings ? <ConfigRequired /> : (
        <div className="form-shell">
          <AiSettingsForm settings={settings} />
          <aside className="helper-card">
            <div className="helper-icon"><Icon name="bot" size={25} /></div>
            <h3>Prompt com responsabilidade</h3>
            <p>Uma boa instrução combina tom de voz, informações a coletar e limites comerciais claros.</p>
            <ul className="helper-list">
              <li><Icon name="check" size={13} /> Faça uma pergunta por vez</li>
              <li><Icon name="check" size={13} /> Não invente preços ou vagas</li>
              <li><Icon name="check" size={13} /> Encaminhe intenções fortes</li>
            </ul>
          </aside>
        </div>
      )}
    </>
  );
}
