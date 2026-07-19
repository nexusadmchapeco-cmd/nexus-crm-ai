import { NextResponse } from "next/server";
import { listeningPlan } from "@/lib/level-test";
import { synthesizeSpeech } from "@/lib/level-test-ai";

export const maxDuration = 30;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const itemId = new URL(request.url).searchParams.get("item");
  const item = listeningPlan(id).find((entry) => entry.id === itemId);
  if (!item) return NextResponse.json({ error: "Áudio não encontrado" }, { status: 404 });
  try {
    const audio = await synthesizeSpeech(item.audioText);
    return new Response(audio, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao gerar áudio" },
      { status: 502 },
    );
  }
}
