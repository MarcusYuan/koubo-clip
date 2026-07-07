import { Buffer } from "node:buffer";
import { writeFileSync } from "node:fs";
import type { MusicRequestArtifact } from "../../artifacts";

export type MusicProviderResult = {
  provider: string;
  model?: string;
  prompt?: string;
  query?: string;
  license?: string;
  license_url?: string;
  original_url?: string;
  duration_seconds?: number;
  cost_usd?: number;
  output_path: string;
};

type MinimaxResponse = {
  data?: { audio?: string; status?: number };
  extra_info?: { music_duration?: number };
  base_resp?: { status_code?: number; status_msg?: string };
};

export async function acquireMinimaxMusic(request: MusicRequestArtifact, outputPath: string): Promise<MusicProviderResult> {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) throw new Error("MINIMAX_API_KEY is not set");
  const prompt = buildMinimaxPrompt(request);
  if (!prompt) throw new Error("minimax music requires prompt, mood, or reason");
  const model = request.model || "music-2.6";

  const response = await fetch("https://api.minimaxi.com/v1/music_generation", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      output_format: "hex",
      is_instrumental: true,
      aigc_watermark: false,
      audio_setting: { sample_rate: 44100, bitrate: 256000, format: "mp3" },
    }),
  });
  const json = (await response.json().catch(() => ({}))) as MinimaxResponse;
  if (!response.ok) throw new Error(`MiniMax music request failed with HTTP ${response.status}`);
  const statusCode = json.base_resp?.status_code ?? 0;
  if (statusCode !== 0) throw new Error(`MiniMax music request failed: ${json.base_resp?.status_msg || statusCode}`);
  const audioHex = json.data?.audio;
  if (!audioHex || json.data?.status !== 2) throw new Error("MiniMax music response did not contain completed hex audio");

  writeFileSync(outputPath, Buffer.from(audioHex, "hex"));
  const durationMs = json.extra_info?.music_duration;
  return {
    provider: "minimax",
    model,
    prompt,
    license: "MiniMax generated music; review platform terms for allowed use",
    duration_seconds: typeof durationMs === "number" ? Number((durationMs / 1000).toFixed(3)) : undefined,
    output_path: outputPath,
  };
}

function buildMinimaxPrompt(request: MusicRequestArtifact): string {
  const parts = [request.prompt || request.mood || request.reason];
  const base = parts[0]?.toLowerCase() ?? "";
  if (!/(background|underscore|bgm|背景|铺底|配乐)/i.test(base)) parts.push("background underscore for narrated video");
  if (!/(instrumental|no vocals|vocal-free|纯音乐|无歌词|无人声)/i.test(base)) parts.push("instrumental, no vocals");
  if (typeof request.target_duration_seconds === "number") parts.push(`target duration about ${Math.round(request.target_duration_seconds)} seconds`);
  parts.push("speech-safe, steady energy, unobtrusive");
  return parts.filter(Boolean).join(", ");
}
