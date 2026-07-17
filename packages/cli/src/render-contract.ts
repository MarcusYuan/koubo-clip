import { createHash } from "node:crypto";
import * as nodeFs from "node:fs";
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

type FileStats = { isFile(): boolean; isSymbolicLink(): boolean };
type FsRuntime = {
  lstatSync(path: string): FileStats;
  realpathSync(path: string): string;
};

const fsRuntime = nodeFs as unknown as FsRuntime;

export const RENDER_CONTRACT_SCHEMA_VERSION = "1.0" as const;
export const RENDER_BINDING_SCHEMA_VERSION = "1.0" as const;
export const STRICT_RENDER_RESULT_SCHEMA_VERSION = "1.0" as const;
export const STRICT_INSPECTION_SCHEMA_VERSION = "1.0" as const;

export const renderContractErrorCodes = {
  INVALID_JSON_VALUE: "RENDER_CONTRACT_INVALID_JSON_VALUE",
  INVALID_RENDER_CONTRACT: "RENDER_CONTRACT_INVALID",
  INVALID_CONTRACT_DIGEST: "RENDER_CONTRACT_DIGEST_INVALID",
  CONTRACT_DIGEST_MISMATCH: "RENDER_CONTRACT_DIGEST_MISMATCH",
  INVALID_RENDER_BINDING: "RENDER_BINDING_INVALID",
  INVALID_BINDING_DIGEST: "RENDER_BINDING_DIGEST_INVALID",
  BINDING_DIGEST_MISMATCH: "RENDER_BINDING_DIGEST_MISMATCH",
  BINDING_CONTRACT_MISMATCH: "RENDER_BINDING_CONTRACT_MISMATCH",
  BINDING_SOURCE_MISMATCH: "RENDER_BINDING_SOURCE_MISMATCH",
  INVALID_STRICT_RENDER_RESULT: "STRICT_RENDER_RESULT_INVALID",
  INVALID_STRICT_INSPECTION: "STRICT_INSPECTION_INVALID",
  INVALID_SOURCE_MAP: "RENDER_SOURCE_MAP_INVALID",
  INVALID_BUNDLE_ASSET_PATH: "RENDER_ASSET_PATH_INVALID",
  ASSET_MISSING: "RENDER_ASSET_MISSING",
  ASSET_NOT_FILE: "RENDER_ASSET_NOT_FILE",
  ASSET_SIZE_MISMATCH: "RENDER_ASSET_SIZE_MISMATCH",
  ASSET_DIGEST_MISMATCH: "RENDER_ASSET_DIGEST_MISMATCH",
} as const;

export type RenderContractErrorCode = (typeof renderContractErrorCodes)[keyof typeof renderContractErrorCodes];
export type Sha256Digest = `sha256:${string}`;
export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;
export type JsonObject = { [key: string]: JsonValue };

export class RenderContractError extends Error {
  readonly code: RenderContractErrorCode;
  readonly field?: string;

  constructor(code: RenderContractErrorCode, message: string, field?: string) {
    super(message);
    this.name = "RenderContractError";
    this.code = code;
    this.field = field;
  }
}

export type RenderSourceVideoIdentityV1 = {
  codec_name: string;
  width: number;
  height: number;
  display_width: number;
  display_height: number;
  rotation: 0 | 90 | 180 | 270;
  avg_frame_rate: string;
  pixel_format: string;
};

export type RenderSourceAudioIdentityV1 = {
  codec_name: string;
  sample_rate: number;
  channels: number;
  channel_layout: string;
};

export type RenderSourceIdentityV1 = {
  sha256: Sha256Digest;
  size_bytes: number;
  duration_seconds: number;
  video: RenderSourceVideoIdentityV1;
  audio?: RenderSourceAudioIdentityV1;
};

export type RenderContractSourceV1 = {
  source_id: string;
  order: number;
  original_filename: string;
  identity: RenderSourceIdentityV1;
  binding_requirements: {
    sha256: "exact";
    size_bytes: "exact";
    duration_tolerance_seconds: number;
    dimensions: "exact";
    rotation: "exact";
    require_video: true;
    require_audio: boolean;
  };
};

export type RenderTimelineEntryV1 = {
  source_id: string;
  start: number;
  end: number;
  output_start: number;
  output_end: number;
  output_order: number;
  reason: string;
  quote?: string;
  label?: string;
};

export type OutputFrameSchedule = {
  fps: number;
  audio_sample_rate: number;
  total_frames: number;
  expected_duration_seconds: number;
  segments: Array<{
    output_order: number;
    start_frame: number;
    end_frame: number;
    frame_count: number;
    audio_sample_count: number;
  }>;
};

export type RenderCaptionCueV1 = {
  start: number;
  end: number;
  text: string;
};

export type RenderContractAssetV1 = {
  asset_id: string;
  bundle_path: string;
  sha256: Sha256Digest;
  size_bytes: number;
  media_type?: string;
};

export type RenderContractPayloadV1 = {
  runtime: JsonObject;
  sources: RenderContractSourceV1[];
  timeline: { entries: RenderTimelineEntryV1[] };
  captions: { cues: RenderCaptionCueV1[] };
  composition: JsonObject;
  assets: RenderContractAssetV1[];
  audio: JsonObject;
  output: JsonObject;
  preflight: JsonObject;
  inspection: JsonObject;
  authoring_lineage: JsonObject;
};

export type RenderContractV1 = {
  schema_version: typeof RENDER_CONTRACT_SCHEMA_VERSION;
  contract_digest: Sha256Digest;
  payload: RenderContractPayloadV1;
};

export type RenderBindingSourceV1 = {
  source_id: string;
  resolved_path: string;
  verified_identity: RenderSourceIdentityV1;
};

export type RenderBindingV1 = {
  schema_version: typeof RENDER_BINDING_SCHEMA_VERSION;
  contract_digest: Sha256Digest;
  sources: RenderBindingSourceV1[];
  binding_digest: Sha256Digest;
};

export type SourceMapV1 = Record<string, string>;

export type StrictRenderOutputV1 = {
  output_path: string;
  sha256: Sha256Digest;
  size_bytes: number;
  duration_seconds: number;
  probe: JsonObject;
};

export type StrictRenderResultV1 = {
  schema_version: typeof STRICT_RENDER_RESULT_SCHEMA_VERSION;
  contract_digest: Sha256Digest;
  binding_digest: Sha256Digest;
  output: StrictRenderOutputV1;
  renderer: JsonObject;
  warnings: string[];
  completed_at: string;
};

export type StrictInspectionCheckV1 = {
  id: string;
  status: "passed" | "warning" | "blocker";
  message: string;
};

export type StrictInspectionV1 = {
  schema_version: typeof STRICT_INSPECTION_SCHEMA_VERSION;
  contract_digest: Sha256Digest;
  binding_digest: Sha256Digest;
  render_result_digest: Sha256Digest;
  output_sha256: Sha256Digest;
  accepted: boolean;
  checks: StrictInspectionCheckV1[];
  frames: string[];
  warnings: string[];
  blockers: string[];
  inspected_at: string;
};

export type RenderAssetVerificationV1 = Pick<RenderContractAssetV1, "asset_id" | "bundle_path" | "sha256" | "size_bytes">;

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value, "$", new Set()));
}

export function sha256Digest(value: string | Uint8Array): Sha256Digest {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function renderContractDigest(payload: RenderContractPayloadV1 | unknown): Sha256Digest {
  return sha256Digest(canonicalJson(payload));
}

export function renderBindingDigest(binding: Pick<RenderBindingV1, "contract_digest" | "sources">): Sha256Digest {
  return sha256Digest(canonicalJson({ contract_digest: binding.contract_digest, sources: binding.sources }));
}

export function strictRenderResultDigest(result: StrictRenderResultV1 | unknown): Sha256Digest {
  return sha256Digest(canonicalJson(result));
}

export function compileOutputFrameSchedule(
  entries: readonly Pick<RenderTimelineEntryV1, "output_order" | "start" | "end">[],
  fps: number,
  audioSampleRate = 48_000,
): OutputFrameSchedule {
  if (!Number.isSafeInteger(fps) || fps <= 0) fail(renderContractErrorCodes.INVALID_RENDER_CONTRACT, "output fps must be a positive integer", "output.fps");
  if (!Number.isSafeInteger(audioSampleRate) || audioSampleRate <= 0) fail(renderContractErrorCodes.INVALID_RENDER_CONTRACT, "audio sample rate must be a positive integer", "output.audio_sample_rate");
  let cumulativeSeconds = 0;
  let previousFrame = 0;
  let previousSample = 0;
  const segments = entries.map((entry, index) => {
    if (entry.output_order !== index) fail(renderContractErrorCodes.INVALID_RENDER_CONTRACT, `timeline entry ${index} has non-contiguous output_order`, `timeline.entries[${index}].output_order`);
    const duration = entry.end - entry.start;
    if (!Number.isFinite(duration) || duration <= 0) fail(renderContractErrorCodes.INVALID_RENDER_CONTRACT, `timeline entry ${index} has invalid duration`, `timeline.entries[${index}].end`);
    cumulativeSeconds += duration;
    const endFrame = Math.round(cumulativeSeconds * fps);
    const endSample = Math.round(endFrame * audioSampleRate / fps);
    const frameCount = endFrame - previousFrame;
    if (frameCount <= 0) fail(renderContractErrorCodes.INVALID_RENDER_CONTRACT, `timeline entry ${index} is shorter than one output frame`, `timeline.entries[${index}]`);
    const segment = {
      output_order: entry.output_order,
      start_frame: previousFrame,
      end_frame: endFrame,
      frame_count: frameCount,
      audio_sample_count: endSample - previousSample,
    };
    previousFrame = endFrame;
    previousSample = endSample;
    return segment;
  });
  return {
    fps,
    audio_sample_rate: audioSampleRate,
    total_frames: previousFrame,
    expected_duration_seconds: previousFrame / fps,
    segments,
  };
}

export function createRenderContractV1(payload: RenderContractPayloadV1 | unknown): RenderContractV1 {
  const parsedPayload = parseRenderContractPayloadV1(payload);
  return {
    schema_version: RENDER_CONTRACT_SCHEMA_VERSION,
    contract_digest: renderContractDigest(parsedPayload),
    payload: parsedPayload,
  };
}

export function parseRenderContractV1(value: unknown): RenderContractV1 {
  const obj = strictRecord(value, "render contract", ["schema_version", "contract_digest", "payload"], renderContractErrorCodes.INVALID_RENDER_CONTRACT);
  const contract: RenderContractV1 = {
    schema_version: literalVersion(obj.schema_version, "render contract.schema_version", RENDER_CONTRACT_SCHEMA_VERSION, renderContractErrorCodes.INVALID_RENDER_CONTRACT),
    contract_digest: digest(obj.contract_digest, "render contract.contract_digest", renderContractErrorCodes.INVALID_CONTRACT_DIGEST),
    payload: parseRenderContractPayloadV1(obj.payload),
  };
  verifyRenderContractDigest(contract);
  return contract;
}

export const parseRenderContract = parseRenderContractV1;

export function parseRenderContractPayloadV1(value: unknown): RenderContractPayloadV1 {
  const code = renderContractErrorCodes.INVALID_RENDER_CONTRACT;
  const obj = strictRecord(value, "render contract.payload", [
    "runtime",
    "sources",
    "timeline",
    "captions",
    "composition",
    "assets",
    "audio",
    "output",
    "preflight",
    "inspection",
    "authoring_lineage",
  ], code);
  const sources = array(obj.sources, "render contract.payload.sources", code).map((entry, index) => parseContractSource(entry, `render contract.payload.sources[${index}]`));
  if (sources.length === 0) fail(code, "render contract.payload.sources must not be empty", "payload.sources");
  unique(sources.map((source) => source.source_id), "source_id", code);
  unique(sources.map((source) => source.order), "source order", code);
  for (const [index, source] of sources.entries()) {
    if (source.order !== index) fail(code, `render contract.payload.sources[${index}].order must equal its zero-based array index`, `payload.sources[${index}].order`);
  }
  const sourceById = new Map(sources.map((source) => [source.source_id, source]));

  const timelineObject = strictRecord(obj.timeline, "render contract.payload.timeline", ["entries"], code);
  const entries = array(timelineObject.entries, "render contract.payload.timeline.entries", code).map((entry, index) =>
    parseTimelineEntry(entry, `render contract.payload.timeline.entries[${index}]`, sourceById),
  );
  if (entries.length === 0) fail(code, "render contract.payload.timeline.entries must not be empty", "payload.timeline.entries");
  unique(entries.map((entry) => entry.output_order), "timeline output_order", code);
  for (const [index, entry] of entries.entries()) {
    if (entry.output_order !== index) fail(code, `render contract.payload.timeline.entries[${index}].output_order must equal its zero-based array index`, `payload.timeline.entries[${index}].output_order`);
    const expectedStart = index === 0 ? 0 : entries[index - 1]!.output_end;
    if (Math.abs(entry.output_start - expectedStart) > 0.000001) fail(code, `render contract.payload.timeline.entries[${index}].output_start must form a continuous output timeline`, `payload.timeline.entries[${index}].output_start`);
  }

  const captionsObject = strictRecord(obj.captions, "render contract.payload.captions", ["cues"], code);
  const cues = array(captionsObject.cues, "render contract.payload.captions.cues", code).map((cue, index) =>
    parseCaptionCue(cue, `render contract.payload.captions.cues[${index}]`),
  );
  const assets = array(obj.assets, "render contract.payload.assets", code).map((asset, index) =>
    parseRenderContractAssetV1(asset, `render contract.payload.assets[${index}]`),
  );
  unique(assets.map((asset) => asset.asset_id), "asset_id", code);
  unique(assets.map((asset) => asset.bundle_path), "asset bundle_path", code);

  return {
    runtime: jsonObject(obj.runtime, "render contract.payload.runtime"),
    sources,
    timeline: { entries },
    captions: { cues },
    composition: jsonObject(obj.composition, "render contract.payload.composition"),
    assets,
    audio: jsonObject(obj.audio, "render contract.payload.audio"),
    output: jsonObject(obj.output, "render contract.payload.output"),
    preflight: jsonObject(obj.preflight, "render contract.payload.preflight"),
    inspection: jsonObject(obj.inspection, "render contract.payload.inspection"),
    authoring_lineage: jsonObject(obj.authoring_lineage, "render contract.payload.authoring_lineage"),
  };
}

export function verifyRenderContractDigest(contract: Pick<RenderContractV1, "contract_digest" | "payload">): Sha256Digest {
  const actual = renderContractDigest(contract.payload);
  if (actual !== contract.contract_digest) {
    fail(renderContractErrorCodes.CONTRACT_DIGEST_MISMATCH, `contract_digest mismatch: expected ${contract.contract_digest}, computed ${actual}`, "contract_digest");
  }
  return actual;
}

export function parseRenderBindingV1(value: unknown): RenderBindingV1 {
  const code = renderContractErrorCodes.INVALID_RENDER_BINDING;
  const obj = strictRecord(value, "render binding", ["schema_version", "contract_digest", "sources", "binding_digest"], code);
  const sources = array(obj.sources, "render binding.sources", code).map((source, index) => parseBindingSource(source, `render binding.sources[${index}]`));
  if (sources.length === 0) fail(code, "render binding.sources must not be empty", "sources");
  unique(sources.map((source) => source.source_id), "binding source_id", code);
  const binding: RenderBindingV1 = {
    schema_version: literalVersion(obj.schema_version, "render binding.schema_version", RENDER_BINDING_SCHEMA_VERSION, code),
    contract_digest: digest(obj.contract_digest, "render binding.contract_digest", renderContractErrorCodes.INVALID_CONTRACT_DIGEST),
    sources,
    binding_digest: digest(obj.binding_digest, "render binding.binding_digest", renderContractErrorCodes.INVALID_BINDING_DIGEST),
  };
  const actual = renderBindingDigest(binding);
  if (actual !== binding.binding_digest) {
    fail(renderContractErrorCodes.BINDING_DIGEST_MISMATCH, `binding_digest mismatch: expected ${binding.binding_digest}, computed ${actual}`, "binding_digest");
  }
  return binding;
}

export const parseRenderBinding = parseRenderBindingV1;

export function verifyRenderBinding(contract: RenderContractV1, binding: RenderBindingV1): RenderBindingV1 {
  verifyRenderContractDigest(contract);
  const actualBindingDigest = renderBindingDigest(binding);
  if (actualBindingDigest !== binding.binding_digest) {
    fail(renderContractErrorCodes.BINDING_DIGEST_MISMATCH, `binding_digest mismatch: expected ${binding.binding_digest}, computed ${actualBindingDigest}`, "binding_digest");
  }
  if (binding.contract_digest !== contract.contract_digest) {
    fail(renderContractErrorCodes.BINDING_CONTRACT_MISMATCH, "render binding contract_digest does not match render contract", "contract_digest");
  }
  const boundById = new Map(binding.sources.map((source) => [source.source_id, source]));
  if (boundById.size !== contract.payload.sources.length) {
    fail(renderContractErrorCodes.BINDING_SOURCE_MISMATCH, "render binding must bind every contract source exactly once", "sources");
  }
  for (const source of contract.payload.sources) {
    const bound = boundById.get(source.source_id);
    if (!bound || canonicalJson(bound.verified_identity) !== canonicalJson(source.identity)) {
      fail(renderContractErrorCodes.BINDING_SOURCE_MISMATCH, `render binding identity does not match source ${source.source_id}`, "sources");
    }
  }
  return binding;
}

export function parseSourceMapV1(value: unknown): SourceMapV1 {
  const code = renderContractErrorCodes.INVALID_SOURCE_MAP;
  const obj = record(value, "source map", code);
  const result: SourceMapV1 = Object.create(null) as SourceMapV1;
  for (const [sourceId, path] of Object.entries(obj)) {
    stableId(sourceId, `source map key ${sourceId}`, code);
    result[sourceId] = localPath(path, `source map.${sourceId}`, code);
  }
  if (Object.keys(result).length === 0) fail(code, "source map must not be empty");
  return result;
}

export const parseSourceMap = parseSourceMapV1;

export function parseStrictRenderResultV1(value: unknown): StrictRenderResultV1 {
  const code = renderContractErrorCodes.INVALID_STRICT_RENDER_RESULT;
  const obj = strictRecord(value, "strict render result", ["schema_version", "contract_digest", "binding_digest", "output", "renderer", "warnings", "completed_at"], code);
  const output = strictRecord(obj.output, "strict render result.output", ["output_path", "sha256", "size_bytes", "duration_seconds", "probe"], code);
  return {
    schema_version: literalVersion(obj.schema_version, "strict render result.schema_version", STRICT_RENDER_RESULT_SCHEMA_VERSION, code),
    contract_digest: digest(obj.contract_digest, "strict render result.contract_digest", code),
    binding_digest: digest(obj.binding_digest, "strict render result.binding_digest", code),
    output: {
      output_path: localPath(output.output_path, "strict render result.output.output_path", code),
      sha256: digest(output.sha256, "strict render result.output.sha256", code),
      size_bytes: nonNegativeInteger(output.size_bytes, "strict render result.output.size_bytes", code),
      duration_seconds: nonNegativeNumber(output.duration_seconds, "strict render result.output.duration_seconds", code),
      probe: jsonObject(output.probe, "strict render result.output.probe"),
    },
    renderer: jsonObject(obj.renderer, "strict render result.renderer"),
    warnings: stringArray(obj.warnings, "strict render result.warnings", code),
    completed_at: timestamp(obj.completed_at, "strict render result.completed_at", code),
  };
}

export const parseStrictRenderResult = parseStrictRenderResultV1;

export function parseStrictInspectionV1(value: unknown): StrictInspectionV1 {
  const code = renderContractErrorCodes.INVALID_STRICT_INSPECTION;
  const obj = strictRecord(value, "strict inspection", [
    "schema_version",
    "contract_digest",
    "binding_digest",
    "render_result_digest",
    "output_sha256",
    "accepted",
    "checks",
    "frames",
    "warnings",
    "blockers",
    "inspected_at",
  ], code);
  const checks = array(obj.checks, "strict inspection.checks", code).map((check, index): StrictInspectionCheckV1 => {
    const item = strictRecord(check, `strict inspection.checks[${index}]`, ["id", "status", "message"], code);
    const status = item.status;
    if (status !== "passed" && status !== "warning" && status !== "blocker") {
      fail(code, `strict inspection.checks[${index}].status must be passed, warning, or blocker`, `checks[${index}].status`);
    }
    return {
      id: stableId(item.id, `strict inspection.checks[${index}].id`, code),
      status,
      message: nonBlankString(item.message, `strict inspection.checks[${index}].message`, code),
    };
  });
  unique(checks.map((check) => check.id), "inspection check id", code);
  const blockers = stringArray(obj.blockers, "strict inspection.blockers", code);
  const accepted = boolean(obj.accepted, "strict inspection.accepted", code);
  if (accepted && (blockers.length > 0 || checks.some((check) => check.status === "blocker"))) {
    fail(code, "strict inspection cannot be accepted with blockers", "accepted");
  }
  return {
    schema_version: literalVersion(obj.schema_version, "strict inspection.schema_version", STRICT_INSPECTION_SCHEMA_VERSION, code),
    contract_digest: digest(obj.contract_digest, "strict inspection.contract_digest", code),
    binding_digest: digest(obj.binding_digest, "strict inspection.binding_digest", code),
    render_result_digest: digest(obj.render_result_digest, "strict inspection.render_result_digest", code),
    output_sha256: digest(obj.output_sha256, "strict inspection.output_sha256", code),
    accepted,
    checks,
    frames: stringArray(obj.frames, "strict inspection.frames", code).map((path, index) => localPath(path, `strict inspection.frames[${index}]`, code)),
    warnings: stringArray(obj.warnings, "strict inspection.warnings", code),
    blockers,
    inspected_at: timestamp(obj.inspected_at, "strict inspection.inspected_at", code),
  };
}

export const parseStrictInspection = parseStrictInspectionV1;

export function assertBundleRelativeAssetPath(path: unknown, expectedDigest?: Sha256Digest): string {
  const code = renderContractErrorCodes.INVALID_BUNDLE_ASSET_PATH;
  const text = nonBlankString(path, "asset bundle_path", code);
  if (text.includes("\\") || text.includes("\0") || localIsAbsolute(text) || /^[A-Za-z]:/.test(text) || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(text)) {
    fail(code, "asset bundle_path must be a local POSIX bundle-relative path", "bundle_path");
  }
  const match = /^assets\/([a-f0-9]{64})\.([A-Za-z0-9][A-Za-z0-9_-]{0,15})$/.exec(text);
  if (!match) fail(code, "asset bundle_path must match assets/<sha256>.<ext>", "bundle_path");
  if (expectedDigest && match[1] !== expectedDigest.slice("sha256:".length)) {
    fail(code, "asset bundle_path digest must match asset sha256", "bundle_path");
  }
  return text;
}

export function isBundleRelativeAssetPath(path: unknown, expectedDigest?: Sha256Digest): path is string {
  try {
    assertBundleRelativeAssetPath(path, expectedDigest);
    return true;
  } catch {
    return false;
  }
}

export function parseRenderContractAssetV1(value: unknown, name = "render asset"): RenderContractAssetV1 {
  const code = renderContractErrorCodes.INVALID_RENDER_CONTRACT;
  const obj = strictRecord(value, name, ["asset_id", "bundle_path", "sha256", "size_bytes", "media_type"], code, ["media_type"]);
  const sha256 = digest(obj.sha256, `${name}.sha256`, code);
  return {
    asset_id: stableId(obj.asset_id, `${name}.asset_id`, code),
    bundle_path: assertBundleRelativeAssetPath(obj.bundle_path, sha256),
    sha256,
    size_bytes: positiveInteger(obj.size_bytes, `${name}.size_bytes`, code),
    ...(obj.media_type === undefined ? {} : { media_type: nonBlankString(obj.media_type, `${name}.media_type`, code) }),
  };
}

export function verifyRenderAssetBytes(asset: RenderContractAssetV1, bytes: Uint8Array): RenderAssetVerificationV1 {
  const parsed = parseRenderContractAssetV1(asset);
  if (bytes.byteLength !== parsed.size_bytes) {
    fail(renderContractErrorCodes.ASSET_SIZE_MISMATCH, `${parsed.asset_id} size mismatch: expected ${parsed.size_bytes}, received ${bytes.byteLength}`, "size_bytes");
  }
  const actual = sha256Digest(bytes);
  if (actual !== parsed.sha256) {
    fail(renderContractErrorCodes.ASSET_DIGEST_MISMATCH, `${parsed.asset_id} sha256 mismatch: expected ${parsed.sha256}, computed ${actual}`, "sha256");
  }
  return pickAssetVerification(parsed);
}

export function verifyRenderAssets(bundleRoot: string, assets: readonly RenderContractAssetV1[]): RenderAssetVerificationV1[] {
  let root: string;
  try {
    root = fsRuntime.realpathSync(bundleRoot);
  } catch {
    fail(renderContractErrorCodes.ASSET_MISSING, "render bundle root does not exist");
  }
  return assets.map((asset) => {
    const parsed = parseRenderContractAssetV1(asset);
    const candidate = resolve(root, parsed.bundle_path);
    let stats;
    try {
      stats = fsRuntime.lstatSync(candidate);
    } catch {
      fail(renderContractErrorCodes.ASSET_MISSING, `render asset is missing: ${parsed.bundle_path}`, "bundle_path");
    }
    if (!stats.isFile() || stats.isSymbolicLink()) {
      fail(renderContractErrorCodes.ASSET_NOT_FILE, `render asset must be a regular file: ${parsed.bundle_path}`, "bundle_path");
    }
    let real: string;
    let bytes: Uint8Array;
    try {
      real = fsRuntime.realpathSync(candidate);
      bytes = readFileSync(real);
    } catch {
      fail(renderContractErrorCodes.ASSET_MISSING, `render asset cannot be read: ${parsed.bundle_path}`, "bundle_path");
    }
    const fromRoot = relative(root, real);
    if (fromRoot === "" || fromRoot === ".." || fromRoot.startsWith("../") || fromRoot.startsWith("..\\") || localIsAbsolute(fromRoot)) {
      fail(renderContractErrorCodes.INVALID_BUNDLE_ASSET_PATH, `render asset escapes the bundle: ${parsed.bundle_path}`, "bundle_path");
    }
    return verifyRenderAssetBytes(parsed, bytes);
  });
}

export function renderContractErrorCode(error: unknown): RenderContractErrorCode | undefined {
  if (error instanceof RenderContractError) return error.code;
  if (error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string") {
    const code = (error as { code: string }).code;
    if (Object.values(renderContractErrorCodes).includes(code as RenderContractErrorCode)) return code as RenderContractErrorCode;
  }
  return undefined;
}

function parseContractSource(value: unknown, name: string): RenderContractSourceV1 {
  const code = renderContractErrorCodes.INVALID_RENDER_CONTRACT;
  const obj = strictRecord(value, name, ["source_id", "order", "original_filename", "identity", "binding_requirements"], code);
  const identity = parseSourceIdentity(obj.identity, `${name}.identity`, code);
  const requirements = strictRecord(obj.binding_requirements, `${name}.binding_requirements`, ["sha256", "size_bytes", "duration_tolerance_seconds", "dimensions", "rotation", "require_video", "require_audio"], code);
  if (requirements.sha256 !== "exact" || requirements.size_bytes !== "exact" || requirements.dimensions !== "exact" || requirements.rotation !== "exact" || requirements.require_video !== true) {
    fail(code, `${name}.binding_requirements must require exact hash, size, dimensions, rotation, and a video stream`, `${name}.binding_requirements`);
  }
  const requireAudio = boolean(requirements.require_audio, `${name}.binding_requirements.require_audio`, code);
  if (requireAudio !== Boolean(identity.audio)) fail(code, `${name}.binding_requirements.require_audio must match the source identity`, `${name}.binding_requirements.require_audio`);
  return {
    source_id: stableId(obj.source_id, `${name}.source_id`, code),
    order: nonNegativeInteger(obj.order, `${name}.order`, code),
    original_filename: portableFilename(obj.original_filename, `${name}.original_filename`, code),
    identity,
    binding_requirements: {
      sha256: "exact",
      size_bytes: "exact",
      duration_tolerance_seconds: nonNegativeNumber(requirements.duration_tolerance_seconds, `${name}.binding_requirements.duration_tolerance_seconds`, code),
      dimensions: "exact",
      rotation: "exact",
      require_video: true,
      require_audio: requireAudio,
    },
  };
}

function parseSourceIdentity(value: unknown, name: string, code: RenderContractErrorCode): RenderSourceIdentityV1 {
  const obj = strictRecord(value, name, ["sha256", "size_bytes", "duration_seconds", "video", "audio"], code, ["audio"]);
  const video = strictRecord(obj.video, `${name}.video`, ["codec_name", "width", "height", "display_width", "display_height", "rotation", "avg_frame_rate", "pixel_format"], code);
  const audio = obj.audio === undefined ? undefined : strictRecord(obj.audio, `${name}.audio`, ["codec_name", "sample_rate", "channels", "channel_layout"], code);
  return {
    sha256: digest(obj.sha256, `${name}.sha256`, code),
    size_bytes: positiveInteger(obj.size_bytes, `${name}.size_bytes`, code),
    duration_seconds: positiveNumber(obj.duration_seconds, `${name}.duration_seconds`, code),
    video: {
      codec_name: nonBlankString(video.codec_name, `${name}.video.codec_name`, code),
      width: positiveInteger(video.width, `${name}.video.width`, code),
      height: positiveInteger(video.height, `${name}.video.height`, code),
      display_width: positiveInteger(video.display_width, `${name}.video.display_width`, code),
      display_height: positiveInteger(video.display_height, `${name}.video.display_height`, code),
      rotation: sourceRotation(video.rotation, `${name}.video.rotation`, code),
      avg_frame_rate: nonBlankString(video.avg_frame_rate, `${name}.video.avg_frame_rate`, code),
      pixel_format: nonBlankString(video.pixel_format, `${name}.video.pixel_format`, code),
    },
    ...(audio
      ? {
          audio: {
            codec_name: nonBlankString(audio.codec_name, `${name}.audio.codec_name`, code),
            sample_rate: positiveInteger(audio.sample_rate, `${name}.audio.sample_rate`, code),
            channels: positiveInteger(audio.channels, `${name}.audio.channels`, code),
            channel_layout: nonBlankString(audio.channel_layout, `${name}.audio.channel_layout`, code),
          },
        }
      : {}),
  };
}

function parseTimelineEntry(value: unknown, name: string, sourceById: ReadonlyMap<string, RenderContractSourceV1>): RenderTimelineEntryV1 {
  const code = renderContractErrorCodes.INVALID_RENDER_CONTRACT;
  const obj = strictRecord(value, name, ["source_id", "start", "end", "output_start", "output_end", "output_order", "reason", "quote", "label"], code, ["quote", "label"]);
  const sourceId = stableId(obj.source_id, `${name}.source_id`, code);
  const source = sourceById.get(sourceId);
  if (!source) fail(code, `${name}.source_id references unknown source ${sourceId}`, `${name}.source_id`);
  const start = nonNegativeNumber(obj.start, `${name}.start`, code);
  const end = positiveNumber(obj.end, `${name}.end`, code);
  if (end <= start) fail(code, `${name}.end must be greater than start`, `${name}.end`);
  if (end > source.identity.duration_seconds + 0.001) fail(code, `${name}.end exceeds source duration`, `${name}.end`);
  const outputStart = nonNegativeNumber(obj.output_start, `${name}.output_start`, code);
  const outputEnd = positiveNumber(obj.output_end, `${name}.output_end`, code);
  if (outputEnd <= outputStart) fail(code, `${name}.output_end must be greater than output_start`, `${name}.output_end`);
  if (Math.abs((outputEnd - outputStart) - (end - start)) > 0.000001) fail(code, `${name} output duration must match its source range`, `${name}.output_end`);
  return {
    source_id: sourceId,
    start,
    end,
    output_start: outputStart,
    output_end: outputEnd,
    output_order: nonNegativeInteger(obj.output_order, `${name}.output_order`, code),
    reason: nonBlankString(obj.reason, `${name}.reason`, code),
    ...(obj.quote === undefined ? {} : { quote: nonBlankString(obj.quote, `${name}.quote`, code) }),
    ...(obj.label === undefined ? {} : { label: nonBlankString(obj.label, `${name}.label`, code) }),
  };
}

function parseCaptionCue(value: unknown, name: string): RenderCaptionCueV1 {
  const code = renderContractErrorCodes.INVALID_RENDER_CONTRACT;
  const obj = strictRecord(value, name, ["start", "end", "text"], code);
  const start = nonNegativeNumber(obj.start, `${name}.start`, code);
  const end = positiveNumber(obj.end, `${name}.end`, code);
  if (end <= start) fail(code, `${name}.end must be greater than start`, `${name}.end`);
  return { start, end, text: nonBlankString(obj.text, `${name}.text`, code) };
}

function parseBindingSource(value: unknown, name: string): RenderBindingSourceV1 {
  const code = renderContractErrorCodes.INVALID_RENDER_BINDING;
  const obj = strictRecord(value, name, ["source_id", "resolved_path", "verified_identity"], code);
  return {
    source_id: stableId(obj.source_id, `${name}.source_id`, code),
    resolved_path: localPath(obj.resolved_path, `${name}.resolved_path`, code),
    verified_identity: parseSourceIdentity(obj.verified_identity, `${name}.verified_identity`, code),
  };
}

function canonicalize(value: unknown, path: string, active: Set<object>): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail(renderContractErrorCodes.INVALID_JSON_VALUE, `${path} must be a finite JSON number`, path);
    return value;
  }
  if (typeof value !== "object") fail(renderContractErrorCodes.INVALID_JSON_VALUE, `${path} is not a JSON value`, path);
  const object = value as object;
  if (active.has(object)) fail(renderContractErrorCodes.INVALID_JSON_VALUE, `${path} contains a cycle`, path);
  active.add(object);
  try {
    if (Array.isArray(value)) {
      const output: JsonValue[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) fail(renderContractErrorCodes.INVALID_JSON_VALUE, `${path}[${index}] is a sparse array entry`, `${path}[${index}]`);
        output.push(canonicalize(value[index], `${path}[${index}]`, active));
      }
      return output;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) fail(renderContractErrorCodes.INVALID_JSON_VALUE, `${path} must be a plain JSON object`, path);
    const output: JsonObject = {};
    for (const key of Object.keys(value).sort()) output[key] = canonicalize((value as Record<string, unknown>)[key], `${path}.${key}`, active);
    return output;
  } finally {
    active.delete(object);
  }
}

function jsonObject(value: unknown, name: string): JsonObject {
  const canonical = canonicalize(value, name, new Set());
  if (!canonical || Array.isArray(canonical) || typeof canonical !== "object") {
    fail(renderContractErrorCodes.INVALID_JSON_VALUE, `${name} must be a JSON object`, name);
  }
  return canonical;
}

function record(value: unknown, name: string, code: RenderContractErrorCode): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code, `${name} must be an object`, name);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(code, `${name} must be a plain object`, name);
  return value as Record<string, unknown>;
}

function strictRecord(
  value: unknown,
  name: string,
  allowed: readonly string[],
  code: RenderContractErrorCode,
  optional: readonly string[] = [],
): Record<string, unknown> {
  const obj = record(value, name, code);
  const allowedSet = new Set(allowed);
  const optionalSet = new Set(optional);
  const unknown = Object.keys(obj).filter((key) => !allowedSet.has(key));
  if (unknown.length > 0) fail(code, `${name} has unknown field(s): ${unknown.sort().join(", ")}`, name);
  for (const field of allowed) {
    if (!Object.prototype.hasOwnProperty.call(obj, field) && !optionalSet.has(field)) fail(code, `${name}.${field} is required`, `${name}.${field}`);
  }
  return obj;
}

function array(value: unknown, name: string, code: RenderContractErrorCode): unknown[] {
  if (!Array.isArray(value)) fail(code, `${name} must be an array`, name);
  return value;
}

function stringArray(value: unknown, name: string, code: RenderContractErrorCode): string[] {
  return array(value, name, code).map((entry, index) => nonBlankString(entry, `${name}[${index}]`, code));
}

function nonBlankString(value: unknown, name: string, code: RenderContractErrorCode): string {
  if (typeof value !== "string" || value.trim() === "") fail(code, `${name} must be a non-blank string`, name);
  return value;
}

function stableId(value: unknown, name: string, code: RenderContractErrorCode): string {
  const text = nonBlankString(value, name, code);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(text)) fail(code, `${name} must be a stable identifier`, name);
  return text;
}

function portableFilename(value: unknown, name: string, code: RenderContractErrorCode): string {
  const text = nonBlankString(value, name, code);
  if (text.includes("/") || text.includes("\\") || text.includes("\0") || text === "." || text === "..") fail(code, `${name} must be a filename without path components`, name);
  return text;
}

function localPath(value: unknown, name: string, code: RenderContractErrorCode): string {
  const text = nonBlankString(value, name, code);
  if (/[\u0000-\u001f\u007f]/.test(text) || (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(text) && !/^[A-Za-z]:[\\/]/.test(text))) {
    fail(code, `${name} must be a local path without control characters or URI schemes`, name);
  }
  return text;
}

function localIsAbsolute(path: string): boolean {
  return path.startsWith("/") || path.startsWith("\\\\") || /^[A-Za-z]:[\\/]/.test(path);
}

function digest(value: unknown, name: string, code: RenderContractErrorCode): Sha256Digest {
  const text = nonBlankString(value, name, code);
  if (!/^sha256:[a-f0-9]{64}$/.test(text)) fail(code, `${name} must use sha256:<64 lowercase hex>`, name);
  return text as Sha256Digest;
}

function finiteNumber(value: unknown, name: string, code: RenderContractErrorCode): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(code, `${name} must be a finite number`, name);
  return value;
}

function nonNegativeNumber(value: unknown, name: string, code: RenderContractErrorCode): number {
  const number = finiteNumber(value, name, code);
  if (number < 0) fail(code, `${name} must be non-negative`, name);
  return number;
}

function positiveNumber(value: unknown, name: string, code: RenderContractErrorCode): number {
  const number = finiteNumber(value, name, code);
  if (number <= 0) fail(code, `${name} must be positive`, name);
  return number;
}

function nonNegativeInteger(value: unknown, name: string, code: RenderContractErrorCode): number {
  const number = nonNegativeNumber(value, name, code);
  if (!Number.isSafeInteger(number)) fail(code, `${name} must be a safe integer`, name);
  return number;
}

function positiveInteger(value: unknown, name: string, code: RenderContractErrorCode): number {
  const number = positiveNumber(value, name, code);
  if (!Number.isSafeInteger(number)) fail(code, `${name} must be a safe integer`, name);
  return number;
}

function sourceRotation(value: unknown, name: string, code: RenderContractErrorCode): 0 | 90 | 180 | 270 {
  if (value === 0 || value === 90 || value === 180 || value === 270) return value;
  fail(code, `${name} must be 0, 90, 180, or 270`, name);
}

function boolean(value: unknown, name: string, code: RenderContractErrorCode): boolean {
  if (typeof value !== "boolean") fail(code, `${name} must be a boolean`, name);
  return value;
}

function timestamp(value: unknown, name: string, code: RenderContractErrorCode): string {
  const text = nonBlankString(value, name, code);
  if (!Number.isFinite(Date.parse(text))) fail(code, `${name} must be an ISO-8601 timestamp`, name);
  return text;
}

function literalVersion<TVersion extends string>(value: unknown, name: string, expected: TVersion, code: RenderContractErrorCode): TVersion {
  if (value !== expected) fail(code, `${name} must be "${expected}"`, name);
  return expected;
}

function unique(values: readonly (string | number)[], name: string, code: RenderContractErrorCode): void {
  const seen = new Set<string | number>();
  for (const value of values) {
    if (seen.has(value)) fail(code, `duplicate ${name}: ${value}`, name);
    seen.add(value);
  }
}

function pickAssetVerification(asset: RenderContractAssetV1): RenderAssetVerificationV1 {
  return { asset_id: asset.asset_id, bundle_path: asset.bundle_path, sha256: asset.sha256, size_bytes: asset.size_bytes };
}

function fail(code: RenderContractErrorCode, message: string, field?: string): never {
  throw new RenderContractError(code, message, field);
}
