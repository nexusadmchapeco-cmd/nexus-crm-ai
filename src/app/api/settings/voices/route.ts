import { NextResponse } from "next/server";
import { voiceOptions } from "@/lib/voice";
import { listElevenLabsVoices, resolveElevenLabsKey } from "@/lib/voice-server";

export async function GET() {
  if (!(await resolveElevenLabsKey())) {
    return NextResponse.json({
      provider: "openai",
      voices: voiceOptions.map((option) => ({ id: option.value, name: option.label })),
    });
  }
  try {
    const voices = await listElevenLabsVoices();
    return NextResponse.json({
      provider: "elevenlabs",
      voices: voices.map((voice) => ({ id: voice.voice_id, name: voice.name })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao listar vozes" },
      { status: 502 },
    );
  }
}
