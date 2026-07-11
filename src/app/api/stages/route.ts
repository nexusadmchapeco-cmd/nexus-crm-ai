import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = String(body.name || "").trim();
    const color = String(body.color || "#64748b").trim();
    const boardGroup = body.board_group === "closer" ? "closer" : "ia";
    if (!name) return NextResponse.json({ error: "Informe um nome para a etapa." }, { status: 400 });

    const supabase = createAdminClient();
    const { data: maxRow, error: maxError } = await supabase
      .from("pipeline_stages")
      .select("position")
      .eq("board_group", boardGroup)
      .lt("position", 900)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (maxError) throw maxError;

    const { data, error } = await supabase
      .from("pipeline_stages")
      .insert({ name, color, board_group: boardGroup, position: (maxRow?.position ?? 0) + 1 })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ ok: true, stage: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível criar a etapa." },
      { status: 500 },
    );
  }
}
