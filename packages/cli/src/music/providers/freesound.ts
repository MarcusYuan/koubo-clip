import { Buffer } from "node:buffer";
import { writeFileSync } from "node:fs";
import type { MusicRequestArtifact } from "../../artifacts";
import type { MusicProviderResult } from "./minimax";

type FreesoundSearchResponse = {
  results?: Array<{
    id: number;
    name?: string;
    duration?: number;
    previews?: Record<string, string>;
    tags?: string[];
    avg_rating?: number;
    username?: string;
    license?: string;
  }>;
};

export async function acquireFreesoundMusic(request: MusicRequestArtifact, outputPath: string): Promise<MusicProviderResult> {
  const apiKey = process.env.FREESOUND_API_KEY;
  if (!apiKey) throw new Error("FREESOUND_API_KEY is not set");
  const query = request.query || request.mood || request.reason;
  if (!query) throw new Error("freesound music requires query, mood, or reason");

  const params = new URLSearchParams({
    query,
    filter: `duration:[${request.min_duration_seconds ?? 10} TO ${request.max_duration_seconds ?? Math.max(30, request.target_duration_seconds ?? 120)}]`,
    sort: "rating_desc",
    fields: "id,name,duration,previews,tags,avg_rating,username,license",
    token: apiKey,
    page_size: "15",
  });
  const response = await fetch(`https://freesound.org/apiv2/search/text/?${params.toString()}`, {
    headers: { "User-Agent": "koubo-clip/0.0 music acquisition" },
  });
  if (!response.ok) throw new Error(`Freesound search failed with HTTP ${response.status}`);
  const data = (await response.json()) as FreesoundSearchResponse;
  const sound = data.results?.[0];
  const previewUrl = sound?.previews?.["preview-hq-mp3"] || sound?.previews?.["preview-lq-mp3"];
  if (!sound || !previewUrl) throw new Error(`No Freesound music preview found for query: ${query}`);

  const audio = await fetch(previewUrl, { headers: { "User-Agent": "koubo-clip/0.0 music acquisition" } });
  if (!audio.ok) throw new Error(`Freesound preview download failed with HTTP ${audio.status}`);
  writeFileSync(outputPath, Buffer.from(await audio.arrayBuffer()));

  return {
    provider: "freesound",
    query,
    license: sound.license || "Creative Commons (check individual Freesound license)",
    license_url: sound.license,
    original_url: `https://freesound.org/people/${sound.username || ""}/sounds/${sound.id}/`,
    duration_seconds: sound.duration,
    output_path: outputPath,
  };
}
