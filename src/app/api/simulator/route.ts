import { NextResponse } from "next/server";
import { runSdr } from "@/lib/ai/sdr";
import { defaultStagePrompts } from "@/lib/ai/prompt-defaults";
import { removeNulls, resolveSuggestedStage } from "@/lib/ai/stages";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Lead, Message, PipelineStage, StageRole, Temperature } from "@/lib/types";

export const maxDuration = 60;

type SimMessage = { sender_type: "lead" | "ai"; content: string };

type SimulatorPayload = {
  messages?: SimMessage[];
  lead?: Partial<Lead>;
  stage_role?: StageRole;
};

const simLeadDefaults: Lead = {
  id: "simulador",
  name: null,
  phone: "5500000000000",
  city: null,
  unit_interest: null,
  course_interest: null,
  objective: null,
  level: null,
  availability: null,
  urgency: null,
  objection: null,
  temperature: "frio",
  stage_id: "",
  owner_id: null,
  source: "simulador",
  campaign: null,
  ad_name: null,
  summary: null,
  next_action: null,
  ai_enabled: true,
  human_takeover: false,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  last_message_at: new Date().toISOString(),
};

export async function POST(request: Request) {
  let payload: SimulatorPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const history = (payload.messages || []).filter(
    (message) =>
      (message?.sender_type === "lead" || message?.sender_type === "ai") &&
      typeof message.content === "string" &&
      message.content.trim(),
  );
  if (!history.length || history[history.length - 1].sender_type !== "lead") {
    return NextResponse.json(
      { error: "Envie ao menos uma mensagem do cliente" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const { data: stages, error: stagesError } = await supabase
    .from("pipeline_stages")
    .select("*")
    .order("position");
  if (stagesError) {
    return NextResponse.json({ error: stagesError.message }, { status: 500 });
  }
  const stageByRole = new Map(
    (stages as PipelineStage[])
      .filter((stage) => stage.role)
      .map((stage) => [stage.role as StageRole, stage]),
  );

  const currentStage =
    stageByRole.get(payload.stage_role || "new_lead") || stageByRole.get("new_lead");
  if (!currentStage) {
    return NextResponse.json(
      { error: "Etapa new_lead não encontrada; rode as migrations" },
      { status: 500 },
    );
  }

  const lead: Lead = {
    ...simLeadDefaults,
    ...removeNulls((payload.lead || {}) as Record<string, unknown>),
    id: "simulador",
    phone: "5500000000000",
    stage_id: currentStage.id,
    ai_enabled: true,
    human_takeover: false,
  } as Lead;

  const stagePromptKey = `__stage__:${currentStage.id}`;
  const now = new Date().toISOString().slice(0, 10);
  const [
    { data: settings, error: settingsError },
    { data: stagePromptRow },
    { data: knowledge },
    { data: slots },
  ] = await Promise.all([
    supabase.from("ai_settings").select("*").order("created_at").limit(1).single(),
    supabase.from("ai_settings").select("global_prompt").eq("name", stagePromptKey).maybeSingle(),
    supabase
      .from("knowledge_articles")
      .select("title, category, content, unit, valid_from, valid_until, priority")
      .eq("status", "published")
      .eq("visibility", "customer")
      .order("priority", { ascending: false })
      .limit(30),
    supabase
      .from("availability_slots")
      .select("weekday, start_time, end_time, type, unit, owner_name")
      .eq("active", true)
      .order("weekday")
      .order("start_time"),
  ]);
  if (settingsError) {
    return NextResponse.json({ error: settingsError.message }, { status: 500 });
  }

  const applicableKnowledge = (knowledge || []).filter(
    (article) =>
      (!article.valid_from || article.valid_from <= now) &&
      (!article.valid_until || article.valid_until >= now),
  );
  const knowledgeContext = applicableKnowledge
    .map(
      (article) =>
        `[${article.category}] ${article.title}${article.unit ? ` (${article.unit})` : ""}\n${article.content}`,
    )
    .join("\n\n")
    .slice(0, 12000);
  const weekdays = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const availableSlots = (slots || [])
    .map(
      (slot) =>
        `${weekdays[slot.weekday]} ${String(slot.start_time).slice(0, 5)}–${String(slot.end_time).slice(0, 5)} · ${
          slot.type === "closer_meeting" ? "reunião com closer" : "aula experimental"
        }${slot.owner_name ? ` · ${slot.owner_name}` : ""}${slot.unit ? ` · ${slot.unit}` : ""}`,
    )
    .join("\n")
    .slice(0, 6000);

  const messages = history.slice(-20).map(
    (message, index) =>
      ({
        id: `sim-${index}`,
        conversation_id: "simulador",
        lead_id: "simulador",
        sender_type: message.sender_type,
        content: message.content.trim(),
        whatsapp_message_id: null,
        status: "received",
        is_ai: message.sender_type === "ai",
        created_at: new Date().toISOString(),
      }) satisfies Message,
  );

  try {
    const decision = await runSdr({
      lead,
      settings,
      messages,
      stagePrompt:
        stagePromptRow?.global_prompt || defaultStagePrompts[currentStage.role || ""] || null,
      knowledgeContext: knowledgeContext || null,
      availableSlots: availableSlots || null,
    });
    const nextRole = resolveSuggestedStage(decision, lead);
    const nextStage = stageByRole.get(nextRole) || currentStage;
    const mergedLead = {
      ...lead,
      ...removeNulls(decision.extracted),
      temperature: decision.temperature as Temperature,
      summary: decision.summary,
      next_action: decision.next_action,
    };

    return NextResponse.json({
      reply: decision.reply_messages.join("\n\n"),
      reply_messages: decision.reply_messages,
      stage_role: nextRole,
      stage_name: nextStage.name,
      lead: {
        name: mergedLead.name,
        city: mergedLead.city,
        unit_interest: mergedLead.unit_interest,
        course_interest: mergedLead.course_interest,
        objective: mergedLead.objective,
        level: mergedLead.level,
        availability: mergedLead.availability,
        urgency: mergedLead.urgency,
        objection: mergedLead.objection,
        temperature: mergedLead.temperature,
        summary: mergedLead.summary,
        next_action: mergedLead.next_action,
      },
      flags: {
        should_handoff: decision.should_handoff,
        should_disqualify: decision.should_disqualify,
        disqualify_reason: decision.disqualify_reason,
        appointment: decision.appointment?.should_schedule ? decision.appointment : null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao rodar a IA" },
      { status: 500 },
    );
  }
}
