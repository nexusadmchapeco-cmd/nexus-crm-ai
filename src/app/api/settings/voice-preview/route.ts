import { NextResponse } from "next/server";
import { voicePreviewText } from "@/lib/voice";
import { resolveElevenLabsKey, synthesizeNinaVoice } from "@/lib/voice-server";

export const maxDuration = 30;

export async function GET(request: Request) {
  const voice = new URL(request.url).searchParams.get("voice") || "nova";
  try {
    const elevenActive = Boolean(await resolveElevenLabsKey());
    const audio = await synthesizeNinaVoice(voicePreviewText, {
      openAiVoice: elevenActive ? undefined : voice,
      elevenVoiceId: elevenActive ? voice : undefined,
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
