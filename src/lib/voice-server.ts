// Geração da voz da Nina (lado servidor).
// Com ELEVENLABS_API_KEY configurada usa o ElevenLabs (voz muito mais natural
// em pt-BR); sem a chave, cai para a OpenAI TTS com instruções de estilo.

import { synthesizeSpeech } from "@/lib/level-test-ai";
import { ninaVoiceInstructions } from "@/lib/voice";

export function elevenLabsConfigured() {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

export async function listElevenLabsVoices(): Promise<{ voice_id: string; name: string }[]> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return [];
  const response = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: { "xi-api-key": apiKey },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`ElevenLabs respondeu ${response.status}`);
  const payload = await response.json();
  return (payload.voices || []).map((voice: { voice_id: string; name: string }) => ({
    voice_id: voice.voice_id,
    name: voice.name,
  }));
}

async function synthesizeWithElevenLabs(text: string, voiceId: string): Promise<ArrayBuffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY não configurada");
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.8,
          style: 0.25,
          use_speaker_boost: true,
        },
      }),
    },
  );
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ElevenLabs falhou (${response.status}): ${body.slice(0, 200)}`);
  }
  return response.arrayBuffer();
}

/** Gera o mp3 da fala da Nina com o melhor provedor disponível. */
export async function synthesizeNinaVoice(
  text: string,
  options: { openAiVoice?: string; elevenVoiceId?: string },
): Promise<ArrayBuffer> {
  if (elevenLabsConfigured() && options.elevenVoiceId) {
    try {
      return await synthesizeWithElevenLabs(text, options.elevenVoiceId);
    } catch (error) {
      console.error("ElevenLabs falhou; caindo para OpenAI TTS", error);
    }
  }
  return synthesizeSpeech(text, {
    voice: options.openAiVoice || "nova",
    format: "mp3",
    instructions: ninaVoiceInstructions,
  });
}
