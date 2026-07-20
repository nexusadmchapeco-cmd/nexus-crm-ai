import { NextResponse } from "next/server";
import { toWhatsAppVoice } from "@/lib/audio";
import { parseOperationsSettings } from "@/lib/operations";
import { createAdminClient } from "@/lib/supabase/admin";
import { synthesizeNinaVoiceDetailed } from "@/lib/voice-server";
import { sendWhatsAppAudio } from "@/lib/whatsapp";

export const maxDuration = 60;

// Diagnóstico ponta a ponta da voz no WhatsApp. Roda o MESMO caminho do
// webhook (síntese -> conversão ogg -> envio) e reporta cada etapa.
// Opcional: ?to=55XXXXXXXXXXX envia um áudio de teste para esse número.
export async function GET(request: Request) {
  const to = new URL(request.url).searchParams.get("to");
  const steps: Record<string, unknown> = {};
  try {
    const { data: operationsRow } = await createAdminClient()
      .from("ai_settings")
      .select("global_prompt")
      .eq("name", "__operations__")
      .maybeSingle();
    const operations = parseOperationsSettings(operationsRow?.global_prompt);
    steps.config = {
      voice_reply_enabled: operations.voice_reply_enabled,
      elevenlabs_voice_id: operations.elevenlabs_voice_id,
      openai_voice: operations.voice_name,
    };

    const text =
      "Oi! Aqui é a Nina, da Nexus English Center. Esse é um teste de voz pra confirmar que tá tudo certo por aqui.";
    const { audio, provider, elevenError } = await synthesizeNinaVoiceDetailed(text, {
      openAiVoice: operations.voice_name || "nova",
      elevenVoiceId: operations.elevenlabs_voice_id,
    });
    steps.synthesis = {
      provider,
      mp3_bytes: audio.byteLength,
      eleven_error: elevenError || null,
    };

    const voiceNote = await toWhatsAppVoice(audio);
    steps.ogg_conversion = { ogg_bytes: voiceNote.byteLength, ok: voiceNote.byteLength > 0 };

    if (to) {
      const arrayBuffer = voiceNote.buffer.slice(
        voiceNote.byteOffset,
        voiceNote.byteOffset + voiceNote.byteLength,
      ) as ArrayBuffer;
      const result = await sendWhatsAppAudio(to.replace(/\D/g, ""), arrayBuffer, "audio/ogg");
      steps.whatsapp_send = { sent: true, message_id: result?.messages?.[0]?.id || null };
    }

    return NextResponse.json({
      ok: true,
      summary:
        provider === "elevenlabs"
          ? "ElevenLabs funcionando ✅"
          : `Usando OpenAI (fallback). Motivo: ${elevenError || "desconhecido"}`,
      steps,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "erro", steps },
      { status: 500 },
    );
  }
}
