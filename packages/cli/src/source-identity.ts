export const SOURCES_CONTRACT_VERSION = "2.0" as const;
export const SOURCE_MATERIALIZATION_CONTRACT_VERSION = "1.0" as const;

export type SourceVideoIdentity = {
  codec_name: string;
  width: number;
  height: number;
  display_width: number;
  display_height: number;
  rotation: 0 | 90 | 180 | 270;
  avg_frame_rate: string;
  pixel_format: string;
};

export type SourceAudioIdentity = {
  codec_name: string;
  sample_rate: number;
  channels: number;
  channel_layout: string;
};

export type SourceIdentity = {
  sha256: `sha256:${string}`;
  size_bytes: number;
  duration_seconds: number;
  video: SourceVideoIdentity;
  audio?: SourceAudioIdentity;
};

export type PortableSourceAsset = {
  source_id: string;
  order: number;
  original_filename: string;
  local_media_ref: string;
  identity: SourceIdentity;
};

export type SourcesManifestV2 = {
  contract_version: typeof SOURCES_CONTRACT_VERSION;
  sources: PortableSourceAsset[];
};

export type SourceMaterialization = {
  source_id: string;
  project_path: string;
  sha256: `sha256:${string}`;
  size_bytes: number;
};

export type SourceMaterializationManifest = {
  contract_version: typeof SOURCE_MATERIALIZATION_CONTRACT_VERSION;
  sources: SourceMaterialization[];
};

export type SourceMap = Record<string, string>;

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const WINDOWS_DRIVE_PATTERN = /^[A-Za-z]:[\\/]/;
const URI_SCHEME_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

export function parseSourcesManifestV2(value: unknown): SourcesManifestV2 {
  const obj = strictRecord(value, "sources manifest", ["contract_version", "sources"]);
  literal(obj.contract_version, "contract_version", SOURCES_CONTRACT_VERSION);
  const sources = strictArray(obj.sources, "sources").map((item, index) => parsePortableSource(item, index));
  if (sources.length === 0) throw new Error("sources must contain at least one source");
  assertUnique(sources.map((source) => source.source_id), "source_id");
  assertUnique(sources.map((source) => String(source.order)), "source order");
  for (const [index, source] of sources.entries()) {
    if (source.order !== index) throw new Error(`sources[${index}].order must equal its zero-based array index`);
  }
  return { contract_version: SOURCES_CONTRACT_VERSION, sources };
}

export function parseSourceMaterializationManifest(value: unknown): SourceMaterializationManifest {
  const obj = strictRecord(value, "source materialization", ["contract_version", "sources"]);
  literal(obj.contract_version, "contract_version", SOURCE_MATERIALIZATION_CONTRACT_VERSION);
  const sources = strictArray(obj.sources, "sources").map((item, index): SourceMaterialization => {
    const name = `sources[${index}]`;
    const source = strictRecord(item, name, ["source_id", "project_path", "sha256", "size_bytes"]);
    return {
      source_id: opaqueId(source.source_id, `${name}.source_id`),
      project_path: validateMaterializationPath(source.project_path, `${name}.project_path`),
      sha256: sha256(source.sha256, `${name}.sha256`),
      size_bytes: positiveInteger(source.size_bytes, `${name}.size_bytes`),
    };
  });
  if (sources.length === 0) throw new Error("source materialization sources must contain at least one source");
  assertUnique(sources.map((source) => source.source_id), "source_id");
  assertUnique(sources.map((source) => source.project_path), "materialization project_path");
  return { contract_version: SOURCE_MATERIALIZATION_CONTRACT_VERSION, sources };
}

export function parseSourceMap(value: unknown): SourceMap {
  const obj = plainRecord(value, "source map");
  const entries = Object.entries(obj);
  if (entries.length === 0) throw new Error("source map must contain at least one source binding");
  return Object.fromEntries(
    entries
      .map(([sourceId, path]) => [opaqueId(sourceId, "source map key"), validateSourceMapPath(path, `source map.${sourceId}`)] as const)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0),
  );
}

/** Validates an explicitly supplied local binding path without resolving or touching it. */
export function validateSourceMapPath(value: unknown, name = "source map path"): string {
  const path = nonBlankString(value, name);
  if (CONTROL_CHARACTER_PATTERN.test(path)) throw new Error(`${name} must not contain control characters`);
  if (URI_SCHEME_PATTERN.test(path) && !WINDOWS_DRIVE_PATTERN.test(path)) {
    throw new Error(`${name} must be a local filesystem path, not a URI`);
  }
  return path;
}

/** Validates a canonical POSIX project-relative path without resolving or touching it. */
export function validateMaterializationPath(value: unknown, name = "materialization path"): string {
  const path = nonBlankString(value, name);
  if (CONTROL_CHARACTER_PATTERN.test(path)) throw new Error(`${name} must not contain control characters`);
  if (URI_SCHEME_PATTERN.test(path)) throw new Error(`${name} must be project-relative, not a URI`);
  if (path.startsWith("/") || path.startsWith("\\") || WINDOWS_DRIVE_PATTERN.test(path)) {
    throw new Error(`${name} must be a POSIX project-relative path`);
  }
  if (path.includes("\\")) throw new Error(`${name} must use POSIX separators`);
  const segments = path.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new Error(`${name} must not contain empty, ".", or ".." segments`);
  }
  return path;
}

export function sourceIdentityFingerprintProjection(source: PortableSourceAsset): {
  source_id: string;
  order: number;
  identity: SourceIdentity;
} {
  return {
    source_id: source.source_id,
    order: source.order,
    identity: source.identity,
  };
}

export function sourcesIdentityFingerprintProjection(manifest: SourcesManifestV2): {
  contract_version: typeof SOURCES_CONTRACT_VERSION;
  sources: ReturnType<typeof sourceIdentityFingerprintProjection>[];
} {
  return {
    contract_version: SOURCES_CONTRACT_VERSION,
    sources: [...manifest.sources]
      .sort((left, right) => left.order - right.order)
      .map(sourceIdentityFingerprintProjection),
  };
}

function parsePortableSource(value: unknown, index: number): PortableSourceAsset {
  const name = `sources[${index}]`;
  const source = strictRecord(value, name, ["source_id", "order", "original_filename", "local_media_ref", "identity"]);
  return {
    source_id: opaqueId(source.source_id, `${name}.source_id`),
    order: nonNegativeInteger(source.order, `${name}.order`),
    original_filename: filename(source.original_filename, `${name}.original_filename`),
    local_media_ref: nonBlankString(source.local_media_ref, `${name}.local_media_ref`),
    identity: parseSourceIdentity(source.identity, `${name}.identity`),
  };
}

export function parseSourceIdentity(value: unknown, name = "source identity"): SourceIdentity {
  const identity = strictRecord(value, name, ["sha256", "size_bytes", "duration_seconds", "video", "audio"]);
  return {
    sha256: sha256(identity.sha256, `${name}.sha256`),
    size_bytes: positiveInteger(identity.size_bytes, `${name}.size_bytes`),
    duration_seconds: positiveNumber(identity.duration_seconds, `${name}.duration_seconds`),
    video: parseVideoIdentity(identity.video, `${name}.video`),
    audio: identity.audio === undefined ? undefined : parseAudioIdentity(identity.audio, `${name}.audio`),
  };
}

function parseVideoIdentity(value: unknown, name: string): SourceVideoIdentity {
  const video = strictRecord(value, name, [
    "codec_name",
    "width",
    "height",
    "display_width",
    "display_height",
    "rotation",
    "avg_frame_rate",
    "pixel_format",
  ]);
  return {
    codec_name: nonBlankString(video.codec_name, `${name}.codec_name`),
    width: positiveInteger(video.width, `${name}.width`),
    height: positiveInteger(video.height, `${name}.height`),
    display_width: positiveInteger(video.display_width, `${name}.display_width`),
    display_height: positiveInteger(video.display_height, `${name}.display_height`),
    rotation: normalizedRotation(video.rotation, `${name}.rotation`),
    avg_frame_rate: normalizedFrameRate(video.avg_frame_rate, `${name}.avg_frame_rate`),
    pixel_format: nonBlankString(video.pixel_format, `${name}.pixel_format`),
  };
}

function parseAudioIdentity(value: unknown, name: string): SourceAudioIdentity {
  const audio = strictRecord(value, name, ["codec_name", "sample_rate", "channels", "channel_layout"]);
  return {
    codec_name: nonBlankString(audio.codec_name, `${name}.codec_name`),
    sample_rate: positiveInteger(audio.sample_rate, `${name}.sample_rate`),
    channels: positiveInteger(audio.channels, `${name}.channels`),
    channel_layout: nonBlankString(audio.channel_layout, `${name}.channel_layout`),
  };
}

function strictRecord(value: unknown, name: string, allowedKeys: readonly string[]): Record<string, unknown> {
  const obj = plainRecord(value, name);
  const allowed = new Set(allowedKeys);
  const unknownKeys = Object.keys(obj).filter((key) => !allowed.has(key));
  if (unknownKeys.length > 0) throw new Error(`${name} contains unknown field ${unknownKeys[0]}`);
  return obj;
}

function plainRecord(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be an object`);
  return value as Record<string, unknown>;
}

function strictArray(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${name} must be an array`);
  return value;
}

function nonBlankString(value: unknown, name: string): string {
  if (typeof value !== "string") throw new Error(`${name} must be a string`);
  if (value.trim() === "") throw new Error(`${name} must not be blank`);
  return value;
}

function filename(value: unknown, name: string): string {
  const result = nonBlankString(value, name);
  if (CONTROL_CHARACTER_PATTERN.test(result) || result === "." || result === ".." || result.includes("/") || result.includes("\\")) {
    throw new Error(`${name} must be a filename without path separators`);
  }
  return result;
}

function opaqueId(value: unknown, name: string): string {
  const result = nonBlankString(value, name);
  if (!OPAQUE_ID_PATTERN.test(result)) throw new Error(`${name} must be an opaque identifier`);
  return result;
}

function sha256(value: unknown, name: string): `sha256:${string}` {
  const result = nonBlankString(value, name);
  if (!SHA256_PATTERN.test(result)) throw new Error(`${name} must use sha256:<64 lowercase hex>`);
  return result as `sha256:${string}`;
}

function nonNegativeInteger(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  return value;
}

function positiveInteger(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

function nonNegativeNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`${name} must be a finite non-negative number`);
  return value;
}

function positiveNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a finite positive number`);
  return value;
}

function literal<T extends string>(value: unknown, name: string, expected: T): T {
  if (value !== expected) throw new Error(`${name} must be "${expected}"`);
  return expected;
}

function normalizedRotation(value: unknown, name: string): SourceVideoIdentity["rotation"] {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value % 90 !== 0) {
    throw new Error(`${name} must be an integer multiple of 90 degrees`);
  }
  const rotation = ((value % 360) + 360) % 360;
  return rotation as SourceVideoIdentity["rotation"];
}

function normalizedFrameRate(value: unknown, name: string): string {
  const rate = nonBlankString(value, name);
  const match = /^(\d+)\/(\d+)$/.exec(rate);
  if (!match) throw new Error(`${name} must be a positive rational such as 30/1`);
  const numerator = Number(match[1]);
  const denominator = Number(match[2]);
  if (!Number.isSafeInteger(numerator) || numerator <= 0 || !Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new Error(`${name} must be a positive rational such as 30/1`);
  }
  const divisor = greatestCommonDivisor(numerator, denominator);
  return `${String(numerator / divisor)}/${String(denominator / divisor)}`;
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = left;
  let b = right;
  while (b !== 0) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}

function assertUnique(values: string[], name: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`duplicate ${name}: ${value}`);
    seen.add(value);
  }
}
