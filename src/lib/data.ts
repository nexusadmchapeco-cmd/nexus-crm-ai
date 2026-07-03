import { isSupabaseConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { defaultFollowupSteps, defaultStagePrompts, editableStageNames } from "@/lib/ai/prompt-defaults";
import { defaultOperationsSettings, parseOperationsSettings } from "@/lib/operations";
import type {
  AiSettings,
  FollowupSequence,
  Lead,
  Message,
  PipelineStage,
  StagePrompt,
  FollowupHistoryItem,
  OperationsSettings,
} from "@/lib/types";

export async function getStages(): Promise<PipelineStage[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await createAdminClient()
    .from("pipeline_stages")
    .select("*")
    .order("position");
  if (error) throw error;
  return data;
}

export async function getLeads(): Promise<Lead[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await createAdminClient()
    .from("leads")
    .select("*, pipeline_stages(*)")
    .order("last_message_at", { ascending: false });
  if (error) throw error;
  return data as Lead[];
}

export async function getMessages(leadId: string): Promise<Message[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await createAdminClient()
    .from("messages")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at");
  if (error) throw error;
  return data;
}

export async function getAiSettings(): Promise<AiSettings | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await createAdminClient()
    .from("ai_settings")
    .select("*")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getPromptStudioData(): Promise<{
  settings: AiSettings | null;
  stages: PipelineStage[];
  stagePrompts: StagePrompt[];
  followup: FollowupSequence;
  operations: OperationsSettings;
}> {
  if (!isSupabaseConfigured()) {
    return {
      settings: null,
      stages: [],
      stagePrompts: [],
      followup: {
        name: "Follow-up comercial",
        trigger_stage_id: null,
        active: false,
        steps: defaultFollowupSteps.map((step, position) => ({ ...step, position })),
      },
      operations: defaultOperationsSettings,
    };
  }

  const supabase = createAdminClient();
  const [
    settingsResult,
    stagesResult,
    promptRowsResult,
    sequenceResult,
    operationsResult,
  ] = await Promise.all([
    supabase.from("ai_settings").select("*").order("created_at").limit(1).maybeSingle(),
    supabase.from("pipeline_stages").select("*").order("position"),
    supabase.from("ai_settings").select("*").like("name", "__stage__:%"),
    supabase.from("followup_sequences").select("*").order("created_at").limit(1).maybeSingle(),
    supabase
      .from("ai_settings")
      .select("global_prompt")
      .eq("name", "__operations__")
      .maybeSingle(),
  ]);

  if (settingsResult.error) throw settingsResult.error;
  if (stagesResult.error) throw stagesResult.error;
  if (promptRowsResult.error) throw promptRowsResult.error;
  if (sequenceResult.error) throw sequenceResult.error;
  if (operationsResult.error) throw operationsResult.error;

  const stages = (stagesResult.data || []) as PipelineStage[];
  const promptRows = promptRowsResult.data || [];
  const promptByStage = new Map(
    promptRows.map((row) => [row.name.replace("__stage__:", ""), row]),
  );
  const stagePrompts = stages
    .filter((stage) => editableStageNames.includes(stage.name as (typeof editableStageNames)[number]))
    .map((stage) => {
      const row = promptByStage.get(stage.id);
      return {
        id: row?.id,
        stage_id: stage.id,
        stage_name: stage.name,
        stage_color: stage.color,
        prompt: row?.global_prompt || defaultStagePrompts[stage.name] || "",
        active: true,
      };
    });

  let followup: FollowupSequence;
  if (sequenceResult.data) {
    const stepsResult = await supabase
      .from("followup_steps")
      .select("*")
      .eq("sequence_id", sequenceResult.data.id)
      .order("delay_minutes");
    if (stepsResult.error) throw stepsResult.error;
    followup = {
      id: sequenceResult.data.id,
      name: sequenceResult.data.name,
      trigger_stage_id: sequenceResult.data.trigger_stage_id,
      active: sequenceResult.data.active,
      steps: (stepsResult.data || []).map((step, position) => ({
        id: step.id,
        position,
        delay_minutes: step.delay_minutes,
        message: step.message,
      })),
    };
  } else {
    followup = {
      name: "Follow-up comercial",
      trigger_stage_id: stages.find((stage) => stage.name === "Follow-up")?.id || null,
      active: false,
      steps: defaultFollowupSteps.map((step, position) => ({ ...step, position })),
    };
  }

  return {
    settings: settingsResult.data,
    stages,
    stagePrompts,
    followup,
    operations: parseOperationsSettings(operationsResult.data?.global_prompt),
  };
}

export async function getFollowupHistory(leadId?: string): Promise<FollowupHistoryItem[]> {
  if (!isSupabaseConfigured()) return [];
  let query = createAdminClient()
    .from("lead_events")
    .select("id,lead_id,metadata,created_at")
    .eq("event_type", "followup_sent")
    .order("created_at");
  if (leadId) query = query.eq("lead_id", leadId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((event) => ({
    id: event.id,
    lead_id: event.lead_id,
    label: String(event.metadata?.label || "Follow-up"),
    delay_minutes: Number(event.metadata?.delay_minutes || 0),
    message: String(event.metadata?.message || ""),
    created_at: event.created_at,
  }));
}
