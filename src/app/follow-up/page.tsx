import { FollowupCenter } from "@/components/followups/followup-center";
import { ConfigRequired } from "@/components/ui/config-required";
import { isSupabaseConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export default function FollowupPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="page-shell">
        <div className="page-header"><div><div className="eyebrow">Operação</div><h1>Follow-up</h1></div></div>
        <ConfigRequired />
      </div>
    );
  }
  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <div className="eyebrow">Operação</div>
          <h1>Follow-up</h1>
          <p>A régua automática por etapa + seus contatos agendados, tudo num lugar só.</p>
        </div>
      </div>
      <FollowupCenter />
    </div>
  );
}
