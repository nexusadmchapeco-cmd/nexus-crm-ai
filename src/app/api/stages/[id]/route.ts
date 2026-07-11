import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { protectedStageRoles } from "@/lib/ai/prompt-defaults";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const supabase = createAdminClient();

    const update: { name?: string; color?: string; board_group?: string } = {};
    if (body.name !== undefined) {
      const nextName = String(body.name).trim();
      if (!nextName) return NextResponse.json({ error: "Informe um nome para a etapa." }, { status: 400 });
      // Renomear é seguro: a automação da IA casa por `role`, não por `name`.
      update.name = nextName;
    }
    if (body.color !== undefined) update.color = String(body.color).trim();
    if (body.board_group !== undefined) {
      if (body.board_group !== "ia" && body.board_group !== "closer") {
        return NextResponse.json({ error: "Seção inválida." }, { status: 400 });
      }
      update.board_group = body.board_group;
    }

    if (!Object.keys(update).length) {
      return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("pipeline_stages")
      .update(update)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ ok: true, stage: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível atualizar a etapa." },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();

    const { data: current, error: currentError } = await supabase
      .from("pipeline_stages")
      .select("name, role")
      .eq("id", id)
      .single();
    if (currentError) throw currentError;
    if (
      current.role &&
      protectedStageRoles.includes(current.role as (typeof protectedStageRoles)[number])
    ) {
      return NextResponse.json(
        { error: `"${current.name}" é usada pela automação da IA e não pode ser excluída.` },
        { status: 400 },
      );
    }

    const { error } = await supabase.from("pipeline_stages").delete().eq("id", id);
    if (error) {
      if (error.code === "23503") {
        return NextResponse.json(
          {
            error:
              "Essa etapa ainda tem leads (ou uma sequência de follow-up) vinculados a ela. Mova os leads para outra etapa antes de excluir.",
          },
          { status: 409 },
        );
      }
      throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível excluir a etapa." },
      { status: 500 },
    );
  }
}
