import { NextResponse } from "next/server";
import { updateLeadMode } from "@/lib/leads";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json(await updateLeadMode(id, "ai"));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao devolver para IA" }, { status: 500 });
  }
}
