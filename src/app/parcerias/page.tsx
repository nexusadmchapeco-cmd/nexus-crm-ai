import { ParceriasBoard } from "@/components/parcerias/parcerias-board";
import { ConfigRequired } from "@/components/ui/config-required";
import { isSupabaseConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export default function ParceriasPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="page-shell">
        <div className="page-header"><div><div className="eyebrow">Parcerias</div><h1>Parcerias com Empresas</h1></div></div>
        <ConfigRequired />
      </div>
    );
  }
  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <div className="eyebrow">Prospecção manual</div>
          <h1>Parcerias com Empresas</h1>
          <p>Mapeie, chame do seu WhatsApp ou ligue, e aponte o status aqui — separado do funil de leads.</p>
        </div>
      </div>
      <ParceriasBoard />
    </div>
  );
}
