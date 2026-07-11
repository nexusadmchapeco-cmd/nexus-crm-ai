import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const stageIds = Array.isArray(body.stage_ids) ? (body.stage_ids as string[]) : [];
    if (!stageIds.length) {
      return NextResponse.json({ error: "Lista de etapas vazia." }, { status: 400 });
    }

    const supabase = createAdminClient();
    for (let index = 0; index < stageIds.length; index += 1) {
      const { error } = await supabase
        .from("pipeline_stages")
        .update({ position: index + 1 })
        .eq("id", stageIds[index]);
      if (error) throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível reordenar as etapas." },
      { status: 500 },
    );
  }
}
