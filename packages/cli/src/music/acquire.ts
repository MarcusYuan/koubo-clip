import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import {
  type AssetManifestArtifact,
  type AssetManifestEntry,
  type MusicRequestArtifact,
  parseAssetManifest,
  parseMusicRequest,
  projectArtifacts,
} from "../artifacts";
import { analyzeMusicEnergy } from "./energy";
import { MUSIC_EXTENSIONS, probeAudioDuration, resolveLibraryTrack } from "./library";
import { acquireFreesoundMusic } from "./providers/freesound";
import { acquireMinimaxMusic, type MusicProviderResult } from "./providers/minimax";
import { acquirePixabayMusic } from "./providers/pixabay";

export type MusicAcquisitionArtifact = {
  version: "1.0";
  request: MusicRequestArtifact;
  acquired: boolean;
  asset?: AssetManifestEntry;
  recommendation?: {
    start: number;
    end: number;
    volume: number;
    fade_seconds: number;
    ducking: boolean;
    offset_seconds: number;
    loop: boolean;
  };
  warnings: string[];
};

export type MusicReviewArtifact = {
  version: "1.0";
  request_id: string;
  status: "ready" | "skipped";
  asset_id?: string;
  provider?: string;
  path?: string;
  duration_seconds?: number;
  license?: string;
  warnings: string[];
  recommended_music_segment?: {
    id: string;
    type: "music_segment";
    start: number;
    end: number;
    asset_id: string;
    volume: number;
    fade_seconds: number;
    ducking: boolean;
    reason: string;
  };
};

export async function acquireMusicAsset(projectPath: string): Promise<MusicAcquisitionArtifact> {
  const request = parseMusicRequest(JSON.parse(readFileSync(join(projectPath, projectArtifacts.musicRequest), "utf8")));
  if (request.source === "none") {
    return { version: "1.0", request, acquired: false, warnings: ["music request explicitly skipped"] };
  }

  mkdirSync(join(projectPath, "assets", "music"), { recursive: true });
  const outputPath = join(projectPath, "assets", "music", `${safeFileName(request.id)}${outputExt(request)}`);
  const providerResult = await acquireBySource(projectPath, request, outputPath);
  const duration = probeAudioDuration(providerResult.output_path) ?? providerResult.duration_seconds;
  const target = request.target_duration_seconds;
  const energy = analyzeMusicEnergy(providerResult.output_path, target);
  const relativePath = relativeProjectPath(projectPath, providerResult.output_path);
  const asset: AssetManifestEntry = {
    id: request.id,
    path: relativePath,
    type: "music",
    source: request.source === "minimax" ? "agent_generated" : "imported",
    provenance: `music-acquire:${request.source}`,
    provider: providerResult.provider,
    model: providerResult.model,
    prompt: providerResult.prompt,
    query: providerResult.query,
    license: providerResult.license,
    license_url: providerResult.license_url,
    original_url: providerResult.original_url,
    acquired_at: new Date().toISOString(),
    cost_usd: providerResult.cost_usd,
    reason: request.reason,
    duration_seconds: duration,
    hash: sha256(providerResult.output_path),
    mood: request.mood,
    loop: energy.needs_loop,
    volume: request.volume ?? 0.12,
    fade_seconds: request.fade_seconds ?? 0.5,
    ducking: request.ducking ?? true,
  };
  const warnings = acquisitionWarnings(request, asset);
  writeAssetManifest(projectPath, asset);
  return {
    version: "1.0",
    request,
    acquired: true,
    asset,
    recommendation: {
      start: 0,
      end: Math.max(0.01, request.target_duration_seconds ?? duration ?? 30),
      volume: asset.volume ?? 0.12,
      fade_seconds: asset.fade_seconds ?? 0.5,
      ducking: asset.ducking ?? true,
      offset_seconds: energy.recommended_offset_seconds,
      loop: energy.needs_loop,
    },
    warnings,
  };
}

export function buildMusicReview(acquisition: MusicAcquisitionArtifact): MusicReviewArtifact {
  if (!acquisition.asset || !acquisition.recommendation) {
    return { version: "1.0", request_id: acquisition.request.id, status: "skipped", warnings: acquisition.warnings };
  }
  return {
    version: "1.0",
    request_id: acquisition.request.id,
    status: "ready",
    asset_id: acquisition.asset.id,
    provider: acquisition.asset.provider,
    path: acquisition.asset.path,
    duration_seconds: acquisition.asset.duration_seconds,
    license: acquisition.asset.license,
    warnings: acquisition.warnings,
    recommended_music_segment: {
      id: acquisition.asset.id,
      type: "music_segment",
      start: acquisition.recommendation.start,
      end: acquisition.recommendation.end,
      asset_id: acquisition.asset.id,
      volume: acquisition.recommendation.volume,
      fade_seconds: acquisition.recommendation.fade_seconds,
      ducking: acquisition.recommendation.ducking,
      reason: acquisition.request.reason,
    },
  };
}

export function renderMusicReviewMarkdown(review: MusicReviewArtifact): string {
  return [
    "# Music Review",
    "",
    `Status: ${review.status}`,
    review.asset_id ? `Asset: ${review.asset_id}` : "Asset: none",
    review.provider ? `Provider: ${review.provider}` : undefined,
    review.path ? `Path: ${review.path}` : undefined,
    review.license ? `License: ${review.license}` : undefined,
    "",
    "## Recommended Segment",
    review.recommended_music_segment
      ? `- ${review.recommended_music_segment.id} ${review.recommended_music_segment.start.toFixed(2)}-${review.recommended_music_segment.end.toFixed(2)} volume=${review.recommended_music_segment.volume} ducking=${review.recommended_music_segment.ducking}`
      : "- none",
    "",
    "## Warnings",
    ...(review.warnings.length ? review.warnings.map((warning) => `- ${warning}`) : ["- none"]),
    "",
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}

async function acquireBySource(projectPath: string, request: MusicRequestArtifact, outputPath: string): Promise<MusicProviderResult> {
  if (request.source === "local") return acquireLocal(projectPath, request, outputPath);
  if (request.source === "minimax") return acquireMinimaxMusic(request, outputPath);
  if (request.source === "freesound") return acquireFreesoundMusic(request, outputPath);
  if (request.source === "pixabay") return acquirePixabayMusic(request, outputPath);
  throw new Error(`unsupported music source: ${request.source}`);
}

function acquireLocal(projectPath: string, request: MusicRequestArtifact, outputPath: string): MusicProviderResult {
  const sourcePath = request.library_track ? resolveLibraryTrack(request.library_track) : request.local_path ? join(projectPath, request.local_path) : undefined;
  if (!sourcePath) throw new Error("local music request requires local_path or library_track");
  if (!existsSync(sourcePath)) throw new Error(`local music source missing: ${request.library_track ?? request.local_path}`);
  if (!MUSIC_EXTENSIONS.has(extname(sourcePath).toLowerCase())) throw new Error(`unsupported music extension: ${extname(sourcePath)}`);
  const destination = outputPath.replace(extname(outputPath), extname(sourcePath));
  if (resolve(sourcePath) !== resolve(destination)) copyFileSync(sourcePath, destination);
  return {
    provider: request.library_track ? "music_library" : "local",
    query: request.library_track,
    license: "User-provided/local music; user must confirm usage rights",
    original_url: request.library_track ? `music_library:${request.library_track}` : request.local_path,
    duration_seconds: probeAudioDuration(destination),
    output_path: destination,
  };
}

function writeAssetManifest(projectPath: string, asset: AssetManifestEntry): void {
  const manifestPath = join(projectPath, projectArtifacts.assetManifest);
  const existing: AssetManifestArtifact = existsSync(manifestPath) ? parseAssetManifest(JSON.parse(readFileSync(manifestPath, "utf8"))) : { assets: [] };
  const assets = [...existing.assets.filter((item) => item.id !== asset.id), asset];
  writeFileSync(manifestPath, `${JSON.stringify({ assets }, null, 2)}\n`);
}

function acquisitionWarnings(request: MusicRequestArtifact, asset: AssetManifestEntry): string[] {
  const warnings: string[] = [];
  if (request.source_mode === "screen_recording" && request.presentation_intent !== "short_form") warnings.push("screen_recording music should stay off unless publishing/packaging needs it");
  if (asset.license?.toLowerCase().includes("check") || asset.license?.toLowerCase().includes("verify")) warnings.push("music license needs human review before publication");
  if (!asset.duration_seconds) warnings.push("music duration could not be probed");
  return warnings;
}

function outputExt(request: MusicRequestArtifact): string {
  return request.source === "local" && request.local_path ? extname(request.local_path) || ".mp3" : ".mp3";
}

function relativeProjectPath(projectPath: string, path: string): string {
  const resolvedProject = resolve(projectPath);
  const resolvedPath = resolve(path);
  if (!resolvedPath.startsWith(`${resolvedProject}/`)) throw new Error(`music output is outside project: ${basename(path)}`);
  return resolvedPath.slice(resolvedProject.length + 1);
}

function sha256(path: string): string {
  return `sha256-${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
}

function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "music";
}
