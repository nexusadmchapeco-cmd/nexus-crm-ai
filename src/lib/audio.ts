import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

const execFileAsync = promisify(execFile);

/**
 * Converte um áudio (mp3 da OpenAI TTS) para OGG/Opus mono — o único formato
 * que o WhatsApp renderiza como mensagem de voz (bolha com waveform) em vez
 * de arquivo de áudio anexado.
 */
export async function toWhatsAppVoice(input: ArrayBuffer): Promise<Buffer> {
  const workDir = await mkdtemp(join(tmpdir(), "nina-voice-"));
  const inputPath = join(workDir, `${randomUUID()}.mp3`);
  const outputPath = join(workDir, `${randomUUID()}.ogg`);
  try {
    await writeFile(inputPath, Buffer.from(input));
    await execFileAsync(ffmpegInstaller.path, [
      "-y",
      "-i", inputPath,
      "-c:a", "libopus",
      "-ac", "1",
      "-ar", "48000",
      "-b:a", "24k",
      "-application", "voip",
      "-f", "ogg",
      outputPath,
    ]);
    return await readFile(outputPath);
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
