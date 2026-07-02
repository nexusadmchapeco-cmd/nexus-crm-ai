import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PUT(request: Request) {
  try {
    const { name, model, global_prompt, temperature } = await request.json();
    const numericTemperature = Number(temperature);
    if (!name?.trim() || !model?.trim() || !global_prompt?.trim() || numericTemperature < 0 || numericTemperature > 1) {
      return NextResponse.json({ error: "Configurações inválidas" }, { status: 400 });
    }
    const supabase = createAdminClient();
    const { data: current, error: currentError } = await supabase.from("ai_settings").select("id").order("created_at").limit(1).single();
    if (currentError) throw currentError;
    const { data, error } = await supabase.from("ai_settings").update({
      name: name.trim(),
      model: model.trim(),
      global_prompt: global_prompt.trim(),
      temperature: numericTemperature,
      updated_at: new Date().toISOString(),
    }).eq("id", current.id).select().single();
    if (error) throw error;
    return NextResponse.json({ settings: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao salvar configurações" }, { status: 500 });
  }
}
