import { NextResponse } from "next/server";
import { toWhatsAppVoice } from "@/lib/audio";
import { parseOperationsSettings } from "@/lib/operations";
import { createAdminClient } from "@/lib/supabase/admin";
import { synthesizeNinaVoiceDetailed } from "@/lib/voice-server";
import { sendWhatsAppAudio } from "@/lib/whatsapp";

export const maxDuration = 60;

// Diagnóstico ponta a ponta da voz. Usa um texto longo (~400 caracteres)
// para provar que a chave aguenta uma resposta real, não só a amostra curta.
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
    };

    const text =
      "Oi! Que bom que você chamou a Nexus English Center. Aqui é a Nina, a assistente virtual. " +
      "Eu vou fazer um atendimento rapidinho pra entender teu perfil e já te passar uma ideia dos " +
      "planos e valores. Me conta uma coisa: você já estudou inglês antes, ou tá começando do zero? " +
      "E como é a tua rotina hoje, quais dias e horários funcionariam melhor pra fazer as aulas?";
    steps.text_length = text.length;

    const { audio, provider, elevenError } = await synthesizeNinaVoiceDetailed(text, {
      openAiVoice: operations.voice_name || "nova",
      elevenVoiceId: operations.elevenlabs_voice_id,
    });
    steps.synthesis = { provider, mp3_bytes: audio.byteLength, eleven_error: elevenError || null };

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
          ? "ElevenLabs funcionando em texto longo ✅"
          : `Fallback OpenAI. Motivo: ${elevenError || "desconhecido"}`,
      steps,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "erro", steps },
      { status: 500 },
    );
  }
}
