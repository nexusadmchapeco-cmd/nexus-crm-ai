import { NextResponse } from "next/server";
import { guardLead } from "@/lib/lead-guard";
import { createAdminClient } from "@/lib/supabase/admin";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const guard = await guardLead(id);
    if (guard.response) return guard.response;

    const supabase = createAdminClient();
    const { error } = await supabase.from("leads").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível excluir o lead." },
      { status: 500 },
    );
  }
}
