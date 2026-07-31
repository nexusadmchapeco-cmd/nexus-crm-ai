import { NextResponse } from "next/server";
import { guardLead } from "@/lib/lead-guard";
import { updateLeadMode } from "@/lib/leads";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const guard = await guardLead(id);
    if (guard.response) return guard.response;

    return NextResponse.json(await updateLeadMode(id, "ai"));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao devolver para IA" }, { status: 500 });
  }
}
