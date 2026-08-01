import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as nodeFs from "node:fs";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import {
  parseSourceMaterialization,
  parseSourcesManifest,
  parseTranscript,
  projectArtifacts,
  type CommandResult,
  type SourcesManifest,
  type TimedTextRange,
  type TimingGranularity,
  type TranscriptArtifact,
} from "./artifacts";
import { atomicWriteJson } from "./artifact-lifecycle";
import { resolveExistingProjectPath, resolveProjectOutputPath } from "./project-paths";
import { resolveManagedRuntimeTool } from "./managed-runtime";

export type PrepareExternalAsrOptions = {
  outputDir?: string;
  sourceId?: string;
  maxBytes?: number;
};

export type ImportExternalAsrOptions = {
  inputPath: string;
};

export type ExternalAsrPreparedData = {
  project_path: string;
  source_id: string;
  output_dir: string;
  manifest_path: string;
  audio_path: string;
  size_bytes: number;
  sha256: string;
  duration_seconds: number;
  upload_limit_bytes: number;
};

export type ExternalAsrImportData = {
  project_path: string;
  transcript_path: string;
  source_ids: string[];
  timing_granularity: Exclude<TimingGranularity, "text-only">;
  segment_count: number;
  duration_seconds: number;
};

type ExternalAsrErrorCode =
  | "ASR_INPUT_INVALID"
  | "ASR_INPUT_UNSAFE"
  | "ASR_OUTPUT_EXISTS"
  | "ASR_SOURCE_REQUIRED"
  | "ASR_SOURCE_NOT_FOUND"
  | "ASR_SOURCE_RESULT_MISSING"
  | "ASR_SOURCE_ID_MISMATCH"
  | "ASR_SOURCE_BINDING_REQUIRED"
  | "ASR_SOURCE_BINDING_INVALID"
  | "ASR_FFMPEG_UNAVAILABLE"
  | "ASR_FFMPEG_FAILED"
  | "ASR_PROBE_UNAVAILABLE"
  | "ASR_PROBE_FAILED"
  | "ASR_PROBE_OUTPUT_INVALID"
  | "ASR_UPLOAD_LIMIT_EXCEEDED"
  | "ASR_TIMING_REQUIRED"
  | "ASR_TIMING_INVALID"
  | "ASR_IMPORT_FAILED"
  | "ASR_PREPARE_FAILED";

type ExternalAsrUploadManifest = {
  contract_version: "1";
  source_id: string;
  source_duration_seconds: number;
  upload_limit_bytes: number;
  audio: {
    path: string;
    mime_type: "audio/mp4";
    codec: "aac";
    sample_rate_hz: 16000;
    channels: 1;
    bitrate_bps: 32000;
    size_bytes: number;
    sha256: string;
    duration_seconds: number;
  };
};

type ExternalAsrTimedInput = {
  contract_version: "1";
  provider?: string;
  language?: string;
  results: ExternalAsrSourceResult[];
};

type ExternalAsrSourceResult = {
  source_id: string;
  timing_granularity: Exclude<TimingGranularity, "text-only">;
  items: Array<{ start: number; end: number; text: string }>;
};

const DEFAULT_UPLOAD_LIMIT_BYTES = 25 * 1024 * 1024;
const INPUT_KEYS = new Set(["contract_version", "provider", "language", "results"]);
const RESULT_KEYS = new Set(["source_id", "timing_granularity", "segments", "words", "text"]);
const RANGE_KEYS = new Set(["start", "end", "text"]);
const fsRuntime = nodeFs as unknown as {
  renameSync(oldPath: string, newPath: string): void;
};

export function prepareExternalAsrProject(
  projectPath: string,
  options: PrepareExternalAsrOptions = {},
): CommandResult<"external-asr.prepare", ExternalAsrPreparedData> {
  try {
    const projectRoot = resolve(projectPath);
    const sources = readSources(projectRoot);
    const source = selectSource(sources, options.sourceId);
    const inputPath = resolveMaterializedSourcePath(projectRoot, source.source_id, sources);
    const uploadLimit = uploadLimitBytes(options.maxBytes);
    const targetDir = resolveOutputDirectory(projectRoot, options.outputDir, source.source_id);
    if (existsSync(targetDir)) throw asrError("ASR_OUTPUT_EXISTS", "external ASR output directory already exists");

    const parent = dirname(targetDir);
    mkdirSync(parent, { recursive: true });
    const stagingDir = mkdtempSync(join(parent, `.${basename(targetDir)}.staging-`));
    try {
      const audioFile = `${source.source_id}.m4a`;
      const stagedAudioPath = join(stagingDir, audioFile);
      runFfmpeg([
        "-y",
        "-i",
        inputPath,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "aac",
        "-b:a",
        "32k",
        "-movflags",
        "+faststart",
        stagedAudioPath,
      ]);
      const size = statSync(stagedAudioPath).size;
      if (size > uploadLimit) {
        throw asrError("ASR_UPLOAD_LIMIT_EXCEEDED", "prepared ASR audio exceeds upload limit", {
          request: { source_id: source.source_id, size_bytes: size, max_bytes: uploadLimit },
        });
      }
      const sha256 = hashFile(stagedAudioPath);
      const duration = probeDuration(stagedAudioPath);
      const manifest: ExternalAsrUploadManifest = {
        contract_version: "1",
        source_id: source.source_id,
        source_duration_seconds: source.duration_seconds,
        upload_limit_bytes: uploadLimit,
        audio: {
          path: audioFile,
          mime_type: "audio/mp4",
          codec: "aac",
          sample_rate_hz: 16000,
          channels: 1,
          bitrate_bps: 32000,
          size_bytes: size,
          sha256,
          duration_seconds: duration,
        },
      };
      atomicWriteJson(join(stagingDir, "manifest.json"), manifest);
      fsRuntime.renameSync(stagingDir, targetDir);
      return {
        ok: true,
        command: "external-asr.prepare",
        data: {
          project_path: projectRoot,
          source_id: source.source_id,
          output_dir: targetDir,
          manifest_path: join(targetDir, "manifest.json"),
          audio_path: join(targetDir, audioFile),
          size_bytes: size,
          sha256,
          duration_seconds: duration,
          upload_limit_bytes: uploadLimit,
        },
      };
    } catch (error) {
      if (existsSync(stagingDir)) rmSync(stagingDir, { recursive: true, force: true });
      throw error;
    }
  } catch (error) {
    return failure("external-asr.prepare", error, "ASR_PREPARE_FAILED", "external ASR prepare failed");
  }
}

export function importExternalAsrProject(
  projectPath: string,
  options: ImportExternalAsrOptions,
): CommandResult<"external-asr.import", ExternalAsrImportData> {
  try {
    const projectRoot = resolve(projectPath);
    const sources = readSources(projectRoot);
    const inputPath = resolveExistingProjectPath(projectRoot, options.inputPath, "external ASR input");
    const parsed = parseExternalAsrInput(JSON.parse(readFileSync(inputPath, "utf8")));
    validateExactSourceCoverage(parsed, sources);
    const granularity = commonGranularity(parsed.results);
    const segments = sources.sources.flatMap((source) => {
      const result = parsed.results.find((item) => item.source_id === source.source_id)!;
      return validateExternalTimeline(result.items, source.source_id, source.duration_seconds);
    });
    const transcript: TranscriptArtifact = parseTranscript(
      {
        timing_granularity: granularity,
        provider: parsed.provider ?? "external-asr",
        language: parsed.language,
        segments,
      },
      sources,
    );
    const transcriptPath = resolveProjectOutputPath(projectRoot, projectArtifacts.transcriptJson, "external ASR transcript");
    atomicWriteJson(transcriptPath, transcript);
    return {
      ok: true,
      command: "external-asr.import",
      data: {
        project_path: projectRoot,
        transcript_path: transcriptPath,
        source_ids: transcript.segments.map((segment) => segment.source_id).filter((sourceId, index, all) => all.indexOf(sourceId) === index),
        timing_granularity: transcript.timing_granularity as Exclude<TimingGranularity, "text-only">,
        segment_count: transcript.segments.length,
        duration_seconds: transcript.segments.reduce((max, segment) => Math.max(max, segment.end), 0),
      },
    };
  } catch (error) {
    return failure("external-asr.import", error, "ASR_IMPORT_FAILED", "external ASR import failed");
  }
}

function readSources(projectPath: string): SourcesManifest {
  const sourcesPath = resolveExistingProjectPath(projectPath, projectArtifacts.sources, "sources manifest");
  return parseSourcesManifest(JSON.parse(readFileSync(sourcesPath, "utf8")));
}

function selectSource(sources: SourcesManifest, sourceId?: string): SourcesManifest["sources"][number] {
  if (sourceId !== undefined) {
    const source = sources.sources.find((item) => item.source_id === sourceId);
    if (!source) throw asrError("ASR_SOURCE_NOT_FOUND", "source_id is not in this project");
    return source;
  }
  if (sources.sources.length !== 1) throw asrError("ASR_SOURCE_REQUIRED", "source_id is required for multi-source projects");
  return sources.sources[0]!;
}

function resolveMaterializedSourcePath(projectPath: string, sourceId: string, sources: SourcesManifest): string {
  const materializationPath = resolveExistingProjectPath(projectPath, projectArtifacts.sourceMaterialization, "source materialization");
  const materialization = parseSourceMaterialization(JSON.parse(readFileSync(materializationPath, "utf8")), sources);
  const binding = materialization.sources.find((item) => item.source_id === sourceId);
  if (!binding) throw asrError("ASR_SOURCE_BINDING_REQUIRED", "source bytes must be materialized before external ASR prepare");
  const sourcePath = resolveExistingProjectPath(projectPath, binding.project_path, "materialized source");
  const stat = statSync(sourcePath);
  if (!stat.isFile()) throw asrError("ASR_SOURCE_BINDING_INVALID", "materialized source is not a regular file");
  const digest = hashFile(sourcePath);
  if (digest !== binding.sha256 || stat.size !== binding.size_bytes) {
    throw asrError("ASR_SOURCE_BINDING_INVALID", "materialized source does not match source-materialization.json");
  }
  return sourcePath;
}

function resolveOutputDirectory(projectPath: string, outputDir: string | undefined, sourceId: string): string {
  const relativePath = outputDir ?? join(".external-asr", sourceId);
  if (isAbsolutePath(relativePath)) throw asrError("ASR_INPUT_UNSAFE", "external ASR output directory must be project-relative");
  return resolveProjectOutputPath(projectPath, relativePath, "external ASR output directory");
}

function parseExternalAsrInput(value: unknown): ExternalAsrTimedInput {
  const obj = strictObject(value, "external ASR result", INPUT_KEYS);
  if (obj.contract_version !== "1") throw asrError("ASR_INPUT_INVALID", "external ASR contract_version must be \"1\"");
  if (!Array.isArray(obj.results) || obj.results.length === 0) throw asrError("ASR_TIMING_REQUIRED", "external ASR result must include source results");
  return {
    contract_version: "1",
    provider: optionalStringField(obj.provider, "provider"),
    language: optionalStringField(obj.language, "language"),
    results: obj.results.map((item, index) => parseExternalSourceResult(item, `results[${index}]`)),
  };
}

function parseExternalSourceResult(value: unknown, label: string): ExternalAsrSourceResult {
  const obj = strictObject(value, label, RESULT_KEYS);
  const sourceId = stringField(obj.source_id, `${label}.source_id`);
  const granularity = obj.timing_granularity;
  if (granularity === "text-only") throw asrError("ASR_TIMING_REQUIRED", "external ASR result must include segment or word timings");
  if (granularity !== "segment" && granularity !== "word") {
    throw asrError("ASR_INPUT_INVALID", `${label}.timing_granularity must be segment or word`);
  }
  if (granularity === "segment" && obj.words !== undefined) throw asrError("ASR_INPUT_INVALID", "segment ASR result must not include words");
  if (granularity === "word" && obj.segments !== undefined) throw asrError("ASR_INPUT_INVALID", "word ASR result must not include segments");
  const rawItems = granularity === "segment" ? obj.segments : obj.words;
  if (!Array.isArray(rawItems) || rawItems.length === 0) throw asrError("ASR_TIMING_REQUIRED", "external ASR result must include timed entries");
  return {
    source_id: sourceId,
    timing_granularity: granularity,
    items: rawItems.map((item, index) => parseExternalRange(item, granularity === "segment" ? `${label}.segments[${index}]` : `${label}.words[${index}]`)),
  };
}

function parseExternalRange(value: unknown, label: string): { start: number; end: number; text: string } {
  const obj = strictObject(value, label, RANGE_KEYS);
  return {
    start: finiteNumber(obj.start, `${label}.start`),
    end: finiteNumber(obj.end, `${label}.end`),
    text: stringField(obj.text, `${label}.text`).trim(),
  };
}

function validateExternalTimeline(items: Array<{ start: number; end: number; text: string }>, sourceId: string, duration: number): TimedTextRange[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end || a.text.localeCompare(b.text));
  const normalized: TimedTextRange[] = [];
  let previousEnd = -Infinity;
  sorted.forEach((item, index) => {
    if (item.text.length === 0) throw asrError("ASR_TIMING_INVALID", `external ASR item ${index} text is empty`);
    if (item.start < 0) throw asrError("ASR_TIMING_INVALID", `external ASR item ${index} start must be non-negative`);
    if (item.end <= item.start) throw asrError("ASR_TIMING_INVALID", `external ASR item ${index} end must be greater than start`);
    if (item.end > duration) throw asrError("ASR_TIMING_INVALID", `external ASR item ${index} end exceeds source duration`);
    if (item.start < previousEnd) throw asrError("ASR_TIMING_INVALID", "external ASR timeline must be non-overlapping");
    previousEnd = item.end;
    normalized.push({ source_id: sourceId, start: item.start, end: item.end, text: item.text });
  });
  return normalized;
}

function validateExactSourceCoverage(parsed: ExternalAsrTimedInput, sources: SourcesManifest): void {
  const expected = new Set(sources.sources.map((source) => source.source_id));
  const actual = new Set<string>();
  for (const result of parsed.results) {
    if (actual.has(result.source_id)) throw asrError("ASR_SOURCE_ID_MISMATCH", "external ASR result has duplicate source_id");
    actual.add(result.source_id);
  }
  const unknown = [...actual].filter((sourceId) => !expected.has(sourceId)).sort();
  if (unknown.length > 0) {
    throw asrError("ASR_SOURCE_ID_MISMATCH", "external ASR source_id is not in this project", { request: { source_ids: unknown } });
  }
  const missing = [...expected].filter((sourceId) => !actual.has(sourceId)).sort();
  if (missing.length > 0) {
    throw asrError("ASR_SOURCE_RESULT_MISSING", "external ASR result is missing project source_id entries", { request: { source_ids: missing } });
  }
}

function commonGranularity(results: ExternalAsrSourceResult[]): Exclude<TimingGranularity, "text-only"> {
  const first = results[0]!.timing_granularity;
  if (results.some((result) => result.timing_granularity !== first)) {
    throw asrError("ASR_TIMING_INVALID", "external ASR results must use one timing granularity");
  }
  return first;
}

function runFfmpeg(args: string[]): void {
  const result = spawnSync(resolveManagedRuntimeTool("ffmpeg"), args, { encoding: "utf8" });
  if (result.status === null) throw asrError("ASR_FFMPEG_UNAVAILABLE", "ffmpeg is unavailable");
  if (result.status !== 0) throw asrError("ASR_FFMPEG_FAILED", "ffmpeg failed to prepare external ASR audio");
}

function probeDuration(path: string): number {
  const result = spawnSync(resolveManagedRuntimeTool("ffprobe"), ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path], {
    encoding: "utf8",
  });
  if (result.status === null) throw asrError("ASR_PROBE_UNAVAILABLE", "ffprobe is unavailable");
  if (result.status !== 0) throw asrError("ASR_PROBE_FAILED", "ffprobe failed to probe external ASR audio");
  const duration = Number.parseFloat(result.stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) throw asrError("ASR_PROBE_OUTPUT_INVALID", "ffprobe returned invalid external ASR audio duration");
  return duration;
}

function uploadLimitBytes(value: number | undefined): number {
  if (value === undefined) return DEFAULT_UPLOAD_LIMIT_BYTES;
  if (!Number.isInteger(value) || value <= 0) throw asrError("ASR_INPUT_INVALID", "maxBytes must be a positive integer");
  return value;
}

function hashFile(path: string): string {
  return `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
}

function strictObject(value: unknown, label: string, keys: Set<string>): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw asrError("ASR_INPUT_INVALID", `${label} must be an object`);
  const obj = value as Record<string, unknown>;
  const unknown = Object.keys(obj).filter((key) => !keys.has(key));
  if (unknown.length > 0) throw asrError("ASR_INPUT_INVALID", `${label} has unknown field ${unknown[0]}`);
  return obj;
}

function stringField(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") throw asrError("ASR_INPUT_INVALID", `${label} must be a non-empty string`);
  return value;
}

function optionalStringField(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  return stringField(value, label);
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw asrError("ASR_INPUT_INVALID", `${label} must be a finite number`);
  return value;
}

function isAbsolutePath(path: string): boolean {
  return path.startsWith(sep) || /^[A-Za-z]:[\\/]/.test(path);
}

function failure<TCommand extends "external-asr.prepare" | "external-asr.import">(
  command: TCommand,
  error: unknown,
  fallbackCode: ExternalAsrErrorCode,
  fallbackMessage: string,
): CommandResult<TCommand, never> {
  const code = typeof error === "object" && error !== null && typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : fallbackCode;
  const message = error instanceof Error && isKnownAsrErrorCode(code) ? error.message : fallbackMessage;
  const request = typeof error === "object" && error !== null ? (error as { request?: Record<string, unknown> }).request : undefined;
  return {
    ok: false,
    command,
    error: {
      code,
      message,
      ...(request ? { request } : {}),
    },
  };
}

function asrError(code: ExternalAsrErrorCode, message: string, extra: { request?: Record<string, unknown> } = {}): Error & {
  code: ExternalAsrErrorCode;
  request?: Record<string, unknown>;
} {
  const error = new Error(message) as Error & { code: ExternalAsrErrorCode; request?: Record<string, unknown> };
  error.code = code;
  if (extra.request) error.request = extra.request;
  return error;
}

function isKnownAsrErrorCode(value: string): boolean {
  return value.startsWith("ASR_");
}

export const externalAsrContractV1 = {
  contract_version: "1",
  timing_granularities: ["segment", "word"],
  result_shape: { source_id: "string", timing_granularity: "segment|word", segments: "timed ranges", words: "timed ranges" },
  segment_shape: { start: "number", end: "number", text: "string" },
  word_shape: { start: "number", end: "number", text: "string" },
} as const;
