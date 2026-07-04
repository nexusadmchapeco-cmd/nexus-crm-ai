import { CampaignCenter } from "@/components/campaigns/campaign-center";
import { ConfigRequired } from "@/components/ui/config-required";
import { getPromptStudioData, getStages } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const configured = isSupabaseConfigured();
  const [stages, studio] = configured
    ? await Promise.all([getStages(), getPromptStudioData()])
    : [[], null];
  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">Campanhas oficiais</div>
          <h1>Central de disparos</h1>
          <p>Encontre o público certo com filtros ou descrevendo para a IA.</p>
        </div>
      </div>
      {configured ? (
        <CampaignCenter
          stages={stages}
          templateNames={studio?.operations.campaign_template_names}
        />
      ) : (
        <ConfigRequired />
      )}
    </>
  );
}
