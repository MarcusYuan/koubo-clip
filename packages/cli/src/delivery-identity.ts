import { createHash } from "node:crypto";
import * as nodeFs from "node:fs";
import { join, relative, resolve, sep } from "node:path";

export type DeliveryDigest = `sha256:${string}`;

export type DeliveryIdentityErrorCode =
  | "DELIVERY_PATH_INVALID"
  | "DELIVERY_PATH_ESCAPE"
  | "DELIVERY_PATH_NOT_FOUND"
  | "DELIVERY_SYMLINK_REJECTED"
  | "DELIVERY_FILE_TYPE_UNSUPPORTED"
  | "DELIVERY_DUPLICATE_PATH"
  | "DELIVERY_MANIFEST_INVALID"
  | "DELIVERY_DIGEST_MISMATCH";

export class DeliveryIdentityError extends Error {
  readonly code: DeliveryIdentityErrorCode;

  constructor(code: DeliveryIdentityErrorCode, message: string) {
    super(message);
    this.name = "DeliveryIdentityError";
    this.code = code;
  }
}

type DeliveryManifestBase = {
  cli_version: string;
  source_revision: string;
  distribution_kind: string;
  cli_payload_digest: DeliveryDigest;
  renderer_resources_digest: DeliveryDigest;
  official_skill_digest: DeliveryDigest;
  artifact_contracts_digest: DeliveryDigest;
  runtime_compatibility_digest: DeliveryDigest;
  schema_versions: Record<string, string>;
  capability_ids: string[];
  runtime_dependencies: string[];
};

export type DeliveryManifestV3 = DeliveryManifestBase & {
  schema_version: "3.0";
  delivery_digest: DeliveryDigest;
};

export type DeliveryManifest = DeliveryManifestV3;

export type DeliveryDigestSource = {
  /** Absolute filesystem root. Relative roots are rejected so results never depend on cwd. */
  root: string;
  /** POSIX paths relative to root. Omit to include the complete root directory. */
  files?: readonly string[];
  /** Optional POSIX namespace prepended to every path in this source. */
  prefix?: string;
};

export type DeliveryFileSetDigest = {
  digest: DeliveryDigest;
  file_count: number;
  byte_length: number;
  paths: string[];
};

export type DeliveryComponentDigestInput = DeliveryDigestSource | readonly DeliveryDigestSource[];

export type RuntimeCompatibilityInput = Pick<
  DeliveryManifestBase,
  "renderer_resources_digest" | "schema_versions" | "capability_ids" | "runtime_dependencies"
>;

export type DeliveryManifestPayloadDigests = Pick<
  DeliveryManifestBase,
  "cli_payload_digest" | "renderer_resources_digest" | "official_skill_digest" | "artifact_contracts_digest"
>;

export type DeliveryManifestExpectedIdentity = Partial<
  Pick<
    DeliveryManifestBase,
    "cli_version" | "source_revision" | "distribution_kind" | "schema_versions" | "capability_ids" | "runtime_dependencies"
  >
>;

type FileRecord = { path: string; bytes: Uint8Array };
type FileStat = { isDirectory(): boolean; isFile(): boolean; isSymbolicLink(): boolean };
type HashRuntime = { update(value: string | Uint8Array): HashRuntime; digest(encoding: "hex"): string };

const fsRuntime = nodeFs as unknown as {
  lstatSync(path: string): FileStat;
  realpathSync(path: string): string;
};

const DELIVERY_MANIFEST_KEYS = [
  "schema_version",
  "cli_version",
  "source_revision",
  "distribution_kind",
  "cli_payload_digest",
  "renderer_resources_digest",
  "official_skill_digest",
  "artifact_contracts_digest",
  "runtime_compatibility_digest",
  "schema_versions",
  "capability_ids",
  "runtime_dependencies",
  "delivery_digest",
] as const;

/**
 * Hash a logical file set as sorted POSIX path + NUL + decimal byte length +
 * NUL + exact bytes. Filesystem metadata, including mtime and mode, is ignored.
 */
export function computeDeliveryFileSetDigest(
  input: DeliveryComponentDigestInput,
  options: { exclude_paths?: readonly string[] } = {},
): DeliveryFileSetDigest {
  const sources = Array.isArray(input) ? input : [input];
  if (sources.length === 0) fail("DELIVERY_PATH_INVALID", "delivery digest requires at least one source");

  const exclusions = new Set((options.exclude_paths ?? []).map((path) => validatePosixPath(path, "excluded path")));
  const records: FileRecord[] = [];
  for (const source of sources) collectSource(source, exclusions, records);
  records.sort((left, right) => compareUtf8(left.path, right.path));

  for (let index = 1; index < records.length; index += 1) {
    if (records[index - 1]?.path === records[index]?.path) {
      fail("DELIVERY_DUPLICATE_PATH", `delivery payload contains duplicate path ${records[index]?.path}`);
    }
  }

  const hash = createHash("sha256") as unknown as HashRuntime;
  let byteLength = 0;
  for (const record of records) {
    hash.update(record.path);
    hash.update("\0");
    hash.update(String(record.bytes.byteLength));
    hash.update("\0");
    hash.update(record.bytes);
    byteLength += record.bytes.byteLength;
  }

  return {
    digest: asDigest(hash.digest("hex")),
    file_count: records.length,
    byte_length: byteLength,
    paths: records.map((record) => record.path),
  };
}

/** The manifest is always excluded from the CLI payload identity. */
export function computeCliPayloadDigest(
  input: DeliveryComponentDigestInput,
  manifestPath = "delivery-manifest.json",
): DeliveryFileSetDigest {
  return computeDeliveryFileSetDigest(input, { exclude_paths: [manifestPath] });
}

export function computeRendererResourcesDigest(input: DeliveryComponentDigestInput): DeliveryFileSetDigest {
  return computeDeliveryFileSetDigest(input);
}

export function computeOfficialSkillDigest(input: DeliveryComponentDigestInput): DeliveryFileSetDigest {
  return computeDeliveryFileSetDigest(input);
}

/**
 * Bind the renderer bytes to the schemas, capabilities, and external/local
 * runtime dependency IDs that those bytes claim to support.
 */
export function computeRuntimeCompatibilityDigest(input: RuntimeCompatibilityInput): DeliveryDigest {
  const rendererDigest = parseDigest(input.renderer_resources_digest, "renderer_resources_digest", "DELIVERY_MANIFEST_INVALID");
  const schemaVersions = parseStringRecord(input.schema_versions, "schema_versions", "DELIVERY_MANIFEST_INVALID");
  const capabilityIds = parseUniqueStrings(input.capability_ids, "capability_ids", "DELIVERY_MANIFEST_INVALID");
  const runtimeDependencies = parseUniqueStrings(input.runtime_dependencies, "runtime_dependencies", "DELIVERY_MANIFEST_INVALID");
  const canonical = JSON.stringify({
    renderer_resources_digest: rendererDigest,
    schema_versions: Object.fromEntries(Object.entries(schemaVersions).sort(([left], [right]) => compareUtf8(left, right))),
    capability_ids: [...capabilityIds].sort(compareUtf8),
    runtime_dependencies: [...runtimeDependencies].sort(compareUtf8),
  });
  return asDigest(sha256(canonical));
}

export function computeDeliveryDigest(input: DeliveryManifestBase & { schema_version: "3.0" }): DeliveryDigest {
  const canonical = JSON.stringify({
    schema_version: input.schema_version,
    cli_version: parseText(input.cli_version, "cli_version"),
    source_revision: parseText(input.source_revision, "source_revision"),
    distribution_kind: parseText(input.distribution_kind, "distribution_kind"),
    cli_payload_digest: parseDigest(input.cli_payload_digest, "cli_payload_digest", "DELIVERY_MANIFEST_INVALID"),
    renderer_resources_digest: parseDigest(input.renderer_resources_digest, "renderer_resources_digest", "DELIVERY_MANIFEST_INVALID"),
    official_skill_digest: parseDigest(input.official_skill_digest, "official_skill_digest", "DELIVERY_MANIFEST_INVALID"),
    artifact_contracts_digest: parseDigest(input.artifact_contracts_digest, "artifact_contracts_digest", "DELIVERY_MANIFEST_INVALID"),
    runtime_compatibility_digest: parseDigest(input.runtime_compatibility_digest, "runtime_compatibility_digest", "DELIVERY_MANIFEST_INVALID"),
    schema_versions: Object.fromEntries(Object.entries(parseStringRecord(input.schema_versions, "schema_versions", "DELIVERY_MANIFEST_INVALID")).sort(([left], [right]) => compareUtf8(left, right))),
    capability_ids: [...parseUniqueStrings(input.capability_ids, "capability_ids", "DELIVERY_MANIFEST_INVALID")].sort(compareUtf8),
    runtime_dependencies: [...parseUniqueStrings(input.runtime_dependencies, "runtime_dependencies", "DELIVERY_MANIFEST_INVALID")].sort(compareUtf8),
  });
  return asDigest(sha256(canonical));
}

export function parseDeliveryManifest(value: unknown): DeliveryManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("delivery manifest must be an object");
  const schemaVersion = (value as Record<string, unknown>).schema_version;
  if (schemaVersion !== "3.0") invalid("delivery manifest schema_version must be 3.0");
  const manifest = strictRecord(value, "delivery manifest", DELIVERY_MANIFEST_KEYS);

  const base = {
    cli_version: parseText(manifest.cli_version, "cli_version"),
    source_revision: parseText(manifest.source_revision, "source_revision"),
    distribution_kind: parseText(manifest.distribution_kind, "distribution_kind"),
    cli_payload_digest: parseDigest(manifest.cli_payload_digest, "cli_payload_digest", "DELIVERY_MANIFEST_INVALID"),
    renderer_resources_digest: parseDigest(
      manifest.renderer_resources_digest,
      "renderer_resources_digest",
      "DELIVERY_MANIFEST_INVALID",
    ),
    official_skill_digest: parseDigest(manifest.official_skill_digest, "official_skill_digest", "DELIVERY_MANIFEST_INVALID"),
    artifact_contracts_digest: parseDigest(
      manifest.artifact_contracts_digest,
      "artifact_contracts_digest",
      "DELIVERY_MANIFEST_INVALID",
    ),
    runtime_compatibility_digest: parseDigest(
      manifest.runtime_compatibility_digest,
      "runtime_compatibility_digest",
      "DELIVERY_MANIFEST_INVALID",
    ),
    schema_versions: parseStringRecord(manifest.schema_versions, "schema_versions", "DELIVERY_MANIFEST_INVALID"),
    capability_ids: parseUniqueStrings(manifest.capability_ids, "capability_ids", "DELIVERY_MANIFEST_INVALID"),
    runtime_dependencies: parseUniqueStrings(
      manifest.runtime_dependencies,
      "runtime_dependencies",
      "DELIVERY_MANIFEST_INVALID",
    ),
  };
  return {
    schema_version: "3.0",
    ...base,
    delivery_digest: parseDigest(manifest.delivery_digest, "delivery_digest", "DELIVERY_MANIFEST_INVALID"),
  };
}

export function verifyDeliveryDigest(expected: DeliveryDigest, actual: DeliveryDigest, field = "delivery digest"): void {
  const parsedExpected = parseDigest(expected, `${field} expected`, "DELIVERY_MANIFEST_INVALID");
  const parsedActual = parseDigest(actual, `${field} actual`, "DELIVERY_MANIFEST_INVALID");
  if (parsedExpected !== parsedActual) fail("DELIVERY_DIGEST_MISMATCH", `${field} does not match delivered bytes`);
}

/**
 * Strictly parse a manifest, verify every delivered component digest, and
 * verify that runtime compatibility is the canonical digest of the declared
 * runtime contract. Optional expected identity fields let callers pin release metadata.
 */
export function verifyDeliveryManifest(
  value: unknown,
  actualDigests: DeliveryManifestPayloadDigests,
  expectedIdentity: DeliveryManifestExpectedIdentity = {},
): DeliveryManifest {
  const manifest = parseDeliveryManifest(value);
  verifyDeliveryDigest(manifest.cli_payload_digest, actualDigests.cli_payload_digest, "cli_payload_digest");
  verifyDeliveryDigest(
    manifest.renderer_resources_digest,
    actualDigests.renderer_resources_digest,
    "renderer_resources_digest",
  );
  verifyDeliveryDigest(manifest.official_skill_digest, actualDigests.official_skill_digest, "official_skill_digest");
  verifyDeliveryDigest(
    manifest.artifact_contracts_digest,
    actualDigests.artifact_contracts_digest,
    "artifact_contracts_digest",
  );
  verifyDeliveryDigest(
    manifest.runtime_compatibility_digest,
    computeRuntimeCompatibilityDigest(manifest),
    "runtime_compatibility_digest",
  );
  verifyDeliveryDigest(manifest.delivery_digest, computeDeliveryDigest(manifest), "delivery_digest");
  verifyExpectedIdentity(manifest, expectedIdentity);
  return manifest;
}

function collectSource(source: DeliveryDigestSource, exclusions: ReadonlySet<string>, records: FileRecord[]): void {
  if (!isAbsoluteRuntimePath(source.root)) fail("DELIVERY_PATH_INVALID", "delivery source root must be absolute");
  const root = resolve(source.root);
  const rootStat = lstat(root, "delivery source root");
  if (rootStat.isSymbolicLink()) fail("DELIVERY_SYMLINK_REJECTED", "delivery source root must not be a symlink");
  if (!rootStat.isDirectory()) fail("DELIVERY_FILE_TYPE_UNSUPPORTED", "delivery source root must be a directory");

  const realRoot = realpath(root, "delivery source root");
  const prefix = source.prefix === undefined || source.prefix === "" ? "" : validatePosixPath(source.prefix, "source prefix");
  const selections = source.files ?? [""];
  if (selections.length === 0) fail("DELIVERY_PATH_INVALID", "delivery source files must not be empty");
  for (const selection of selections) {
    const relativePath = selection === "" || selection === "." ? "" : validatePosixPath(selection, "source file");
    collectEntry(realRoot, relativePath, prefix, exclusions, records);
  }
}

function collectEntry(
  root: string,
  relativePath: string,
  prefix: string,
  exclusions: ReadonlySet<string>,
  records: FileRecord[],
): void {
  const candidate = relativePath ? join(root, ...relativePath.split("/")) : root;
  assertContained(root, candidate, relativePath || ".");
  assertNoSymlinkComponents(root, relativePath);
  const stat = lstat(candidate, relativePath || "delivery source root");
  const logicalPath = joinPosix(prefix, relativePath);

  if (stat.isSymbolicLink()) fail("DELIVERY_SYMLINK_REJECTED", `delivery path ${relativePath || "."} must not be a symlink`);
  if (stat.isFile()) {
    if (!logicalPath) fail("DELIVERY_PATH_INVALID", "delivery file requires a logical relative path");
    if (!exclusions.has(logicalPath)) records.push({ path: logicalPath, bytes: nodeFs.readFileSync(candidate) });
    return;
  }
  if (!stat.isDirectory()) fail("DELIVERY_FILE_TYPE_UNSUPPORTED", `delivery path ${relativePath || "."} is not a regular file or directory`);

  for (const name of nodeFs.readdirSync(candidate).sort(compareUtf8)) {
    const childRelative = relativePath ? `${relativePath}/${name}` : name;
    validatePosixPath(childRelative, "delivery path");
    collectEntry(root, childRelative, prefix, exclusions, records);
  }
}

function assertNoSymlinkComponents(root: string, relativePath: string): void {
  let current = root;
  for (const segment of relativePath ? relativePath.split("/") : []) {
    current = join(current, segment);
    const stat = lstat(current, relativePath);
    if (stat.isSymbolicLink()) fail("DELIVERY_SYMLINK_REJECTED", `delivery path ${relativePath} contains a symlink`);
  }
}

function assertContained(root: string, candidate: string, logicalPath: string): void {
  const fromRoot = relative(root, candidate);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || fromRoot.startsWith(sep) || /^[A-Za-z]:[\\/]/.test(fromRoot)) {
    fail("DELIVERY_PATH_ESCAPE", `delivery path ${logicalPath} escapes its root`);
  }
}

function validatePosixPath(value: string, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\0") ||
    value.includes("\\") ||
    value.startsWith("/") ||
    /^[A-Za-z]:/.test(value) ||
    value.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    fail("DELIVERY_PATH_INVALID", `${label} must be a normalized POSIX relative path`);
  }
  return value;
}

function joinPosix(prefix: string, path: string): string {
  return prefix && path ? `${prefix}/${path}` : prefix || path;
}

function lstat(path: string, label: string): FileStat {
  try {
    return fsRuntime.lstatSync(path);
  } catch {
    fail("DELIVERY_PATH_NOT_FOUND", `${label} is missing or unreadable`);
  }
}

function realpath(path: string, label: string): string {
  try {
    return fsRuntime.realpathSync(path);
  } catch {
    fail("DELIVERY_PATH_NOT_FOUND", `${label} is missing or unreadable`);
  }
}

function strictRecord(value: unknown, label: string, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(`${label} must be an object`);
  const record = value as Record<string, unknown>;
  const allowed = new Set(keys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) invalid(`${label}.${key} is not allowed`);
  }
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) invalid(`${label}.${key} is required`);
  }
  return record;
}

function parseText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.includes("\0")) invalid(`${label} must be a non-empty string`);
  return value;
}

function parseDigest(value: unknown, label: string, code: DeliveryIdentityErrorCode): DeliveryDigest {
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value)) {
    fail(code, `${label} must use sha256:<64 lowercase hex>`);
  }
  return value as DeliveryDigest;
}

function parseStringRecord(value: unknown, label: string, code: DeliveryIdentityErrorCode): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code, `${label} must be an object`);
  const entries: Array<[string, string]> = [];
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (!key || key.trim().length === 0 || key.includes("\0")) fail(code, `${label} keys must be non-empty strings`);
    if (typeof item !== "string" || item.trim().length === 0 || item.includes("\0")) {
      fail(code, `${label}.${key} must be a non-empty string`);
    }
    entries.push([key, item]);
  }
  return Object.fromEntries(entries);
}

function parseUniqueStrings(value: unknown, label: string, code: DeliveryIdentityErrorCode): string[] {
  if (!Array.isArray(value)) fail(code, `${label} must be an array`);
  const result = value.map((item, index) => {
    if (typeof item !== "string" || item.trim().length === 0 || item.includes("\0")) {
      fail(code, `${label}[${index}] must be a non-empty string`);
    }
    return item;
  });
  if (new Set(result).size !== result.length) fail(code, `${label} must not contain duplicates`);
  return result;
}

function verifyExpectedIdentity(manifest: DeliveryManifest, expected: DeliveryManifestExpectedIdentity): void {
  for (const field of ["cli_version", "source_revision", "distribution_kind"] as const) {
    if (expected[field] !== undefined && expected[field] !== manifest[field]) {
      fail("DELIVERY_DIGEST_MISMATCH", `${field} does not match expected delivery identity`);
    }
  }
  for (const field of ["schema_versions", "capability_ids", "runtime_dependencies"] as const) {
    if (expected[field] !== undefined && canonicalIdentityValue(field, expected[field]) !== canonicalIdentityValue(field, manifest[field])) {
      fail("DELIVERY_DIGEST_MISMATCH", `${field} does not match expected delivery identity`);
    }
  }
}

function canonicalIdentityValue(
  field: "schema_versions" | "capability_ids" | "runtime_dependencies",
  value: Record<string, string> | string[],
): string {
  if (field === "schema_versions") {
    const parsed = parseStringRecord(value, field, "DELIVERY_MANIFEST_INVALID");
    return JSON.stringify(Object.fromEntries(Object.entries(parsed).sort(([left], [right]) => compareUtf8(left, right))));
  }
  return JSON.stringify([...parseUniqueStrings(value, field, "DELIVERY_MANIFEST_INVALID")].sort(compareUtf8));
}

function compareUtf8(left: string, right: string): number {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  const length = Math.min(leftBytes.byteLength, rightBytes.byteLength);
  for (let index = 0; index < length; index += 1) {
    const difference = (leftBytes[index] ?? 0) - (rightBytes[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return leftBytes.byteLength - rightBytes.byteLength;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function asDigest(hex: string): DeliveryDigest {
  return `sha256:${hex}`;
}

function isAbsoluteRuntimePath(path: string): boolean {
  return path.startsWith("/") || path.startsWith("\\\\") || /^[A-Za-z]:[\\/]/.test(path);
}

function invalid(message: string): never {
  fail("DELIVERY_MANIFEST_INVALID", message);
}

function fail(code: DeliveryIdentityErrorCode, message: string): never {
  throw new DeliveryIdentityError(code, message);
}
