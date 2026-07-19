import { NextResponse } from "next/server";
import { synthesizeSpeech } from "@/lib/level-test-ai";
import { ninaVoiceInstructions, voiceOptions, voicePreviewText } from "@/lib/voice";

export const maxDuration = 30;

export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get("voice") || "nova";
  const voice = voiceOptions.some((option) => option.value === requested) ? requested : "nova";
  try {
    const audio = await synthesizeSpeech(voicePreviewText, {
      voice,
      format: "mp3",
      instructions: ninaVoiceInstructions,
    });
    return new Response(audio, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao gerar amostra" },
      { status: 502 },
    );
  }
}
