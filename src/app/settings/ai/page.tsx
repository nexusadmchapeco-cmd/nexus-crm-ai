import { PromptStudio } from "@/components/forms/prompt-studio";
import { ConfigRequired } from "@/components/ui/config-required";
import { getPromptStudioData } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function AiSettingsPage() {
  const configured = isSupabaseConfigured();
  const studio = configured ? await getPromptStudioData() : null;
  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">Automação comercial</div>
          <h1>Estúdio de IA</h1>
          <p>Edite a personalidade, os prompts do funil e toda a cadência de follow-up.</p>
        </div>
      </div>
      {!configured || !studio?.settings ? (
        <ConfigRequired />
      ) : (
        <PromptStudio
          settings={studio.settings}
          stages={studio.stages}
          initialStagePrompts={studio.stagePrompts}
          initialFollowup={studio.followup}
          initialOperations={studio.operations}
        />
      )}
    </>
  );
}
