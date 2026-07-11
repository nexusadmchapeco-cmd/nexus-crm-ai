import { createAdminClient } from "@/lib/supabase/admin";

export async function updateLeadMode(leadId: string, mode: "takeover" | "ai") {
  const supabase = createAdminClient();
  const stageRole = mode === "takeover" ? "closer_owns" : "ai_service";
  const { data: stage, error: stageError } = await supabase
    .from("pipeline_stages").select("id").eq("role", stageRole).single();
  if (stageError) throw stageError;
  const updates = mode === "takeover"
    ? { human_takeover: true, ai_enabled: false, stage_id: stage.id, updated_at: new Date().toISOString() }
    : { human_takeover: false, ai_enabled: true, stage_id: stage.id, updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from("leads").update(updates).eq("id", leadId).select().single();
  if (error) throw error;
  await supabase.from("lead_events").insert({
    lead_id: leadId,
    event_type: mode === "takeover" ? "human_takeover" : "returned_to_ai",
    metadata: {},
  });
  return { lead: data };
}
