import { NextResponse } from "next/server";
import { updateLeadMode } from "@/lib/leads";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json(await updateLeadMode(id, "takeover"));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro no takeover" }, { status: 500 });
  }
}
