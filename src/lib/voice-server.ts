// Geração da voz da Nina (lado servidor).
// A chave do ElevenLabs pode vir do banco (app_secrets.elevenlabs_api_key,
// prioridade) ou da env ELEVENLABS_API_KEY. Com a chave presente usa o
// ElevenLabs (voz muito mais natural em pt-BR); sem ela, cai para a OpenAI
// TTS com instruções de estilo.

import { synthesizeSpeech } from "@/lib/level-test-ai";
import { createAdminClient } from "@/lib/supabase/admin";
import { ninaVoiceInstructions } from "@/lib/voice";

let cachedKey: { value: string | null; fetchedAt: number } | null = null;
const KEY_CACHE_MS = 60_000;

export async function resolveElevenLabsKey(): Promise<string | null> {
  if (cachedKey && Date.now() - cachedKey.fetchedAt < KEY_CACHE_MS) return cachedKey.value;
  let value: string | null = null;
  try {
    const { data } = await createAdminClient()
      .from("app_secrets")
      .select("value")
      .eq("name", "elevenlabs_api_key")
      .maybeSingle();
    value = data?.value?.trim() || null;
  } catch {
    value = null;
  }
  if (!value) value = process.env.ELEVENLABS_API_KEY?.trim() || null;
  cachedKey = { value, fetchedAt: Date.now() };
  return value;
}

export async function listElevenLabsVoices(): Promise<{ voice_id: string; name: string }[]> {
  const apiKey = await resolveElevenLabsKey();
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

async function synthesizeWithElevenLabs(
  text: string,
  voiceId: string,
  apiKey: string,
): Promise<ArrayBuffer> {
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
  const apiKey = await resolveElevenLabsKey();
  if (apiKey && options.elevenVoiceId) {
    try {
      return await synthesizeWithElevenLabs(text, options.elevenVoiceId, apiKey);
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
