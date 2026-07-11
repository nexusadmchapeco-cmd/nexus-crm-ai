import { StageEditor } from "@/components/settings/stage-editor";
import { ConfigRequired } from "@/components/ui/config-required";
import { getStages } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function PipelineSettingsPage() {
  const configured = isSupabaseConfigured();
  const stages = configured ? await getStages() : [];

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">Configurações</div>
          <h1>Etapas do pipeline</h1>
          <p>Renomeie, recolorir, reordene ou adicione etapas. Etapas usadas pela automação da IA ficam bloqueadas para renomear/excluir.</p>
        </div>
      </div>
      {!configured ? <ConfigRequired /> : <StageEditor initialStages={stages} />}
    </>
  );
}
