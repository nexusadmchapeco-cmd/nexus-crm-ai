import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { defaultOperationsSettings, normalizePhone } from "@/lib/operations";

type StagePromptPayload = {
  stage_id: string;
  prompt: string;
};

type FollowupStepPayload = {
  delay_minutes: number;
  message: string;
};

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const numericTemperature = Number(body.temperature);
    const stagePrompts = (body.stage_prompts || []) as StagePromptPayload[];
    const followup = body.followup as {
      id?: string;
      name?: string;
      trigger_stage_id?: string | null;
      active?: boolean;
      steps?: FollowupStepPayload[];
    };
    const operations = { ...defaultOperationsSettings, ...(body.operations || {}) };

    if (
      !body.name?.trim() ||
      !body.model?.trim() ||
      !body.global_prompt?.trim() ||
      numericTemperature < 0 ||
      numericTemperature > 1 ||
      !stagePrompts.length ||
      stagePrompts.some((item) => !item.stage_id || !item.prompt?.trim())
    ) {
      return NextResponse.json({ error: "Revise os campos obrigatórios." }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: current, error: currentError } = await supabase
      .from("ai_settings")
      .select("id")
      .order("created_at")
      .limit(1)
      .single();
    if (currentError) throw currentError;

    const { error: settingsError } = await supabase
      .from("ai_settings")
      .update({
        name: body.name.trim(),
        model: body.model.trim(),
        global_prompt: body.global_prompt.trim(),
        temperature: numericTemperature,
        updated_at: new Date().toISOString(),
      })
      .eq("id", current.id);
    if (settingsError) throw settingsError;

    const { data: existingPromptRows, error: promptRowsError } = await supabase
      .from("ai_settings")
      .select("id,name")
      .like("name", "__stage__:%");
    if (promptRowsError) throw promptRowsError;
    const existingByName = new Map(
      (existingPromptRows || []).map((row) => [row.name, row.id]),
    );

    for (const item of stagePrompts) {
      const rowName = `__stage__:${item.stage_id}`;
      const record = {
        name: rowName,
        global_prompt: item.prompt.trim(),
        model: body.model.trim(),
        temperature: numericTemperature,
        updated_at: new Date().toISOString(),
      };
      const existingId = existingByName.get(rowName);
      const result = existingId
        ? await supabase.from("ai_settings").update(record).eq("id", existingId)
        : await supabase.from("ai_settings").insert(record);
      if (result.error) throw result.error;
    }

    if (!followup?.name?.trim() || !followup.trigger_stage_id) {
      return NextResponse.json({ error: "Defina o nome e a etapa do follow-up." }, { status: 400 });
    }
    const steps = (followup.steps || []).map((step) => ({
      delay_minutes: Math.max(1, Math.round(Number(step.delay_minutes))),
      message: step.message?.trim(),
    }));
    if (!steps.length || steps.some((step) => !step.message)) {
      return NextResponse.json({ error: "Cada follow-up precisa de prazo e mensagem." }, { status: 400 });
    }

    let sequenceId = followup.id;
    if (sequenceId) {
      const { error } = await supabase
        .from("followup_sequences")
        .update({
          name: followup.name.trim(),
          trigger_stage_id: followup.trigger_stage_id,
          active: Boolean(followup.active),
        })
        .eq("id", sequenceId);
      if (error) throw error;
    } else {
      const { data, error } = await supabase
        .from("followup_sequences")
        .insert({
          name: followup.name.trim(),
          trigger_stage_id: followup.trigger_stage_id,
          active: Boolean(followup.active),
        })
        .select("id")
        .single();
      if (error) throw error;
      sequenceId = data.id;
    }

    const { error: deleteStepsError } = await supabase
      .from("followup_steps")
      .delete()
      .eq("sequence_id", sequenceId);
    if (deleteStepsError) throw deleteStepsError;

    const { error: insertStepsError } = await supabase
      .from("followup_steps")
      .insert(
        steps.map((step) => ({
          sequence_id: sequenceId,
          delay_minutes: step.delay_minutes,
          message: step.message,
        })),
      );
    if (insertStepsError) throw insertStepsError;

    const closerPhone = normalizePhone(String(operations.closer_phone || ""));
    if (operations.closer_enabled && closerPhone.length < 10) {
      return NextResponse.json({ error: "Informe o WhatsApp completo do closer." }, { status: 400 });
    }
    if (operations.closer_enabled && !String(operations.closer_template_name || "").trim()) {
      return NextResponse.json(
        { error: "Informe o modelo aprovado para avisar o closer." },
        { status: 400 },
      );
    }
    const operationsRecord = {
      name: "__operations__",
      global_prompt: JSON.stringify({
        closer_enabled: Boolean(operations.closer_enabled),
        closer_name: String(operations.closer_name || "").trim(),
        closer_phone: closerPhone,
        closer_template_name: String(operations.closer_template_name || "").trim(),
        followup_template_name: String(operations.followup_template_name || "").trim(),
        language_code: String(operations.language_code || "pt_BR"),
      }),
      model: body.model.trim(),
      temperature: numericTemperature,
      updated_at: new Date().toISOString(),
    };
    const { data: existingOperations, error: operationsFindError } = await supabase
      .from("ai_settings")
      .select("id")
      .eq("name", "__operations__")
      .maybeSingle();
    if (operationsFindError) throw operationsFindError;
    const operationsResult = existingOperations
      ? await supabase
          .from("ai_settings")
          .update(operationsRecord)
          .eq("id", existingOperations.id)
      : await supabase.from("ai_settings").insert(operationsRecord);
    if (operationsResult.error) throw operationsResult.error;

    return NextResponse.json({ ok: true, sequence_id: sequenceId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao salvar o estúdio de IA." },
      { status: 500 },
    );
  }
}
