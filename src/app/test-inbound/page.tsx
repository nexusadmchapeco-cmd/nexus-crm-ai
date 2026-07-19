import { SimulatorChat } from "@/components/simulator/simulator-chat";
import { ConfigRequired } from "@/components/ui/config-required";
import { isSupabaseConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export default function TestInboundPage() {
  const configured = isSupabaseConfigured();
  return (
    <div className="conversations-shell">
      <div className="page-header">
        <div>
          <div className="eyebrow">Ambiente de teste</div>
          <h1>Simulador</h1>
          <p>Converse como se fosse um cliente e veja a IA responder com o prompt e a base de conhecimento reais. Nada é salvo.</p>
        </div>
      </div>
      {configured ? <SimulatorChat /> : <ConfigRequired />}
    </div>
  );
}
