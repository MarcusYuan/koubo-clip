import { Buffer } from "node:buffer";
import { writeFileSync } from "node:fs";
import type { MusicRequestArtifact } from "../../artifacts";
import type { MusicProviderResult } from "./minimax";

type PixabayTrack = { url: string; title?: string; artist?: string; duration?: number };

export async function acquirePixabayMusic(request: MusicRequestArtifact, outputPath: string): Promise<MusicProviderResult> {
  const query = request.query || request.mood || request.reason;
  if (!query) throw new Error("pixabay music requires query, mood, or reason");
  const slug = encodeURIComponent(query.trim().toLowerCase().replace(/\s+/g, "-"));
  const pageUrl = `https://pixabay.com/music/search/${slug}/`;
  const htmlResponse = await fetch(pageUrl, { headers: browserHeaders() });
  if (!htmlResponse.ok) throw new Error(pixabayError("search", htmlResponse.status));
  const html = await htmlResponse.text();
  const tracks = await pixabayTracks(html, pageUrl);
  const min = request.min_duration_seconds ?? 10;
  const max = request.max_duration_seconds ?? Math.max(30, request.target_duration_seconds ?? 120);
  const track = tracks.find((item) => item.duration === undefined || (item.duration >= min && item.duration <= max)) || tracks[0];
  if (!track) throw new Error(`No Pixabay music found for query: ${query}`);

  const audio = await fetch(track.url, { headers: browserHeaders() });
  if (!audio.ok) throw new Error(pixabayError("download", audio.status));
  writeFileSync(outputPath, Buffer.from(await audio.arrayBuffer()));

  return {
    provider: "pixabay",
    query,
    license: "Pixabay Content License (verify current terms before publication)",
    license_url: "https://pixabay.com/service/license-summary/",
    original_url: pageUrl,
    duration_seconds: track.duration,
    output_path: outputPath,
  };
}

async function pixabayTracks(html: string, pageUrl: string): Promise<PixabayTrack[]> {
  const bootstrap = html.match(/__BOOTSTRAP_URL__\s*=\s*["']([^"']+)["']/)?.[1];
  if (bootstrap) {
    const url = new URL(bootstrap, pageUrl).toString();
    const response = await fetch(url, { headers: browserHeaders() });
    if (response.ok) {
      const json = await response.json();
      const tracks = collectTracks(json);
      if (tracks.length) return tracks;
    }
  }
  return [...new Set(html.match(/https?:\/\/[^"'\\\s]+\.mp3[^"'\\\s]*/g) || [])].map((url) => ({ url }));
}

function collectTracks(value: unknown): PixabayTrack[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(collectTracks);
  const obj = value as Record<string, unknown>;
  const rawUrl = Object.values(obj).find((entry) => typeof entry === "string" && /^https?:\/\/.+\.mp3/.test(entry));
  const here = typeof rawUrl === "string" ? [{ url: rawUrl, title: stringField(obj, "title") || stringField(obj, "name"), artist: stringField(obj, "artist"), duration: numberField(obj, "duration") }] : [];
  return [...here, ...Object.values(obj).flatMap(collectTracks)];
}

function stringField(obj: Record<string, unknown>, key: string): string | undefined {
  return typeof obj[key] === "string" ? obj[key] : undefined;
}

function numberField(obj: Record<string, unknown>, key: string): number | undefined {
  return typeof obj[key] === "number" ? obj[key] : undefined;
}

function browserHeaders(): Record<string, string> {
  return {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,application/json,audio/mpeg,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Ch-Ua": '"Chromium";v="131", "Not_A Brand";v="24"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Upgrade-Insecure-Requests": "1",
  };
}

function pixabayError(operation: string, status: number): string {
  const suffix = status === 403 ? "; Pixabay Music is an experimental web-retrieval source and may be blocked by Cloudflare. A Pixabay API key does not unlock music search." : "";
  return `Pixabay music ${operation} failed with HTTP ${status}${suffix}`;
}
