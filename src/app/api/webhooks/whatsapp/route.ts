import { after, NextResponse } from "next/server";
import { toWhatsAppVoice } from "@/lib/audio";
import { processInbound } from "@/lib/inbound";
import { synthesizeSpeech, transcribeAudio } from "@/lib/level-test-ai";
import { parseOperationsSettings } from "@/lib/operations";
import { createAdminClient } from "@/lib/supabase/admin";
import { downloadWhatsAppMedia, sendWhatsAppAudio, sendWhatsAppMessage } from "@/lib/whatsapp";

export const maxDuration = 60;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");
  if (mode === "subscribe" && token === process.env.META_VERIFY_TOKEN && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Token de verificação inválido" }, { status: 403 });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const value = body?.entry?.[0]?.changes?.[0]?.value;
    const incoming = value?.messages?.[0];
    if (!incoming || (incoming.type !== "text" && incoming.type !== "audio")) {
      return NextResponse.json({ received: true });
    }
    const contact = value?.contacts?.[0];

    after(async () => {
      try {
        const isAudio = incoming.type === "audio";
        let messageText = incoming.text?.body || "";
        if (isAudio) {
          // Áudio do lead: baixa a mídia e transcreve para a IA entender.
          const mediaId = incoming.audio?.id;
          if (!mediaId) return;
          const media = await downloadWhatsAppMedia(mediaId);
          const extension = media.mimeType.includes("mpeg") ? "mp3" : "ogg";
          const transcript = (
            await transcribeAudio(
              new File([media.buffer], `lead-audio.${extension}`, { type: media.mimeType }),
            )
          ).trim();
          if (!transcript) return;
          messageText = `🎙️ ${transcript}`;
        }
        if (!messageText.trim()) return;

        const result = await processInbound({
          phone: incoming.from,
          name: contact?.profile?.name,
          message: messageText,
          source: "whatsapp",
          whatsapp_message_id: incoming.id,
        });
        if (!result.ai_reply) return;

        // Lead mandou áudio -> Nina responde com áudio (se habilitado);
        // qualquer falha na voz cai para texto, o atendimento nunca para.
        let voiceSent = false;
        if (isAudio) {
          try {
            const { data: operationsRow } = await createAdminClient()
              .from("ai_settings")
              .select("global_prompt")
              .eq("name", "__operations__")
              .maybeSingle();
            const operations = parseOperationsSettings(operationsRow?.global_prompt);
            if (operations.voice_reply_enabled) {
              const speech = await synthesizeSpeech(result.ai_reply, {
                voice: "coral",
                format: "mp3",
                instructions:
                  "Fale em português brasileiro com sotaque natural, como uma atendente brasileira jovem mandando áudio no WhatsApp: tom caloroso, espontâneo e conversacional, ritmo natural, sem parecer locutora nem robô.",
              });
              // WhatsApp só renderiza como mensagem de voz (bolha com
              // waveform) se o áudio for OGG/Opus mono.
              const voiceNote = await toWhatsAppVoice(speech);
              await sendWhatsAppAudio(
                incoming.from,
                voiceNote.buffer.slice(
                  voiceNote.byteOffset,
                  voiceNote.byteOffset + voiceNote.byteLength,
                ) as ArrayBuffer,
                "audio/ogg",
              );
              voiceSent = true;
            }
          } catch (voiceError) {
            console.error("Voice reply failed, falling back to text", voiceError);
          }
        }
        if (!voiceSent) {
          await sendWhatsAppMessage(incoming.from, result.ai_reply);
        }
      } catch (error) {
        console.error("WhatsApp background processing error", error);
      }
    });
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("WhatsApp webhook error", error);
    return NextResponse.json({ received: true });
  }
}
