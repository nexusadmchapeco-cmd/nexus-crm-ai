import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

// Ajuste manual do avaliador: sobrescreve o nível CEFR final e deixa um comentário.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    if (body.reviewed_level && !LEVELS.includes(body.reviewed_level)) {
      return NextResponse.json({ error: "Nível inválido." }, { status: 400 });
    }
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("level_tests")
      .update({
        reviewed_level: body.reviewed_level || null,
        reviewer_note: body.reviewer_note ? String(body.reviewer_note).slice(0, 2000) : null,
        reviewed_by: body.reviewed_by ? String(body.reviewed_by).slice(0, 120) : null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ test: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao salvar a correção." },
      { status: 500 },
    );
  }
}
