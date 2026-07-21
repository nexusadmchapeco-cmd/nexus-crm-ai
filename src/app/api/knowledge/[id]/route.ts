import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { error } = await createAdminClient().from("knowledge_articles").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao excluir." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const patch: Record<string, unknown> = {};
    if (body.status) patch.status = body.status;
    if (typeof body.title === "string") patch.title = body.title.trim();
    if (typeof body.content === "string") patch.content = body.content.trim();
    if (typeof body.category === "string") patch.category = body.category.trim() || "Geral";
    if (typeof body.unit === "string") patch.unit = body.unit || null;
    if (typeof body.valid_until === "string") patch.valid_until = body.valid_until || null;
    if (!Object.keys(patch).length) {
      return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
    }
    const { data, error } = await createAdminClient()
      .from("knowledge_articles")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao atualizar." },
      { status: 500 },
    );
  }
}
