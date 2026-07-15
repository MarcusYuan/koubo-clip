import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import * as nodeFs from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import * as nodePath from "node:path";

export const EVIDENCE_MANIFEST_VERSION = "1.0" as const;

export type EvidenceImportErrorCode =
  | "UNSAFE_CONTRACT_PATH"
  | "EVIDENCE_INVALID"
  | "EVIDENCE_HASH_MISMATCH"
  | "EVIDENCE_BINDING_MISMATCH";

export type EvidenceImportError = Error & { code: EvidenceImportErrorCode };

export type EvidenceManifestEntry = {
  id: string;
  relative_path: string;
  sha256: string;
  size_bytes: number;
  width: number;
  height: number;
  source_id?: string;
  source_time_seconds?: number;
  request_id?: string;
  candidate_id?: string;
  output_time_seconds?: number;
};

export type EvidenceManifest = {
  version: typeof EVIDENCE_MANIFEST_VERSION;
  entries: EvidenceManifestEntry[];
};

export type EvidenceBindingExpectation = Partial<Pick<
  EvidenceManifestEntry,
  "source_id" | "source_time_seconds" | "request_id" | "candidate_id" | "output_time_seconds"
>>;

export type EvidenceProbeResult = {
  codec_name: string;
  width: number;
  height: number;
};

export type EvidenceProbe = (absolutePath: string) => EvidenceProbeResult;

export type ValidatedEvidenceMember = EvidenceManifestEntry & {
  absolute_path: string;
};

export type ValidateEvidenceDirectoryOptions = {
  probe?: EvidenceProbe;
  expectedBindings?: Record<string, EvidenceBindingExpectation>;
};

const SHA256_PATTERN = /^(?:sha256:)?([a-f0-9]{64})$/;
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const URI_SCHEME_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const WINDOWS_DRIVE_PATTERN = /^[A-Za-z]:[\\/]/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const fsRuntime = nodeFs as unknown as {
  lstatSync(path: string): { isSymbolicLink(): boolean; isFile(): boolean; size: number };
  realpathSync(path: string): string;
};
const pathRuntime = nodePath as unknown as { isAbsolute(path: string): boolean };

export function validateEvidenceDirectory(
  evidenceDirectory: string,
  options: ValidateEvidenceDirectoryOptions = {},
): ValidatedEvidenceMember[] {
  const root = validatedEvidenceRoot(evidenceDirectory);
  const manifestPath = validatedManifestPath(root);
  const manifest = readEvidenceManifest(manifestPath);
  validateExpectedBindings(manifest.entries, options.expectedBindings);

  const probe = options.probe ?? probeEvidenceJpeg;
  const validated: ValidatedEvidenceMember[] = [];
  for (const entry of manifest.entries) {
    const absolutePath = validatedMemberPath(root, entry.relative_path);
    const bytes = verifiedMemberBytes(absolutePath, entry);
    const image = safeProbe(probe, absolutePath);
    if (image.codec_name !== "mjpeg" || image.width !== entry.width || image.height !== entry.height) {
      throw evidenceError("EVIDENCE_INVALID", "evidence JPEG metadata does not match manifest");
    }
    // Hashing reads the complete file before any member is exposed to the caller.
    if (bytes.length !== entry.size_bytes) throw evidenceError("EVIDENCE_HASH_MISMATCH", "evidence member bytes do not match manifest");
    validated.push({ ...entry, absolute_path: absolutePath });
  }
  return validated;
}

export function parseEvidenceManifest(value: unknown): EvidenceManifest {
  const obj = strictRecord(value, "evidence manifest", ["version", "entries"]);
  if (obj.version !== EVIDENCE_MANIFEST_VERSION) throw evidenceError("EVIDENCE_INVALID", "evidence manifest version is unsupported");
  if (!Array.isArray(obj.entries) || obj.entries.length === 0) {
    throw evidenceError("EVIDENCE_INVALID", "evidence manifest must contain entries");
  }
  const entries = obj.entries.map((value, index) => parseEvidenceEntry(value, index));
  assertUnique(entries.map((entry) => entry.id), "evidence entry ids");
  assertUnique(entries.map((entry) => entry.relative_path), "evidence member paths");
  return { version: EVIDENCE_MANIFEST_VERSION, entries };
}

export function probeEvidenceJpeg(absolutePath: string): EvidenceProbeResult {
  const result = spawnSync(
    "ffprobe",
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,width,height", "-of", "json", absolutePath],
    { encoding: "utf8" },
  );
  if (result.status !== 0) throw evidenceError("EVIDENCE_INVALID", "evidence JPEG probe failed");
  try {
    const value = JSON.parse(result.stdout) as { streams?: Array<Record<string, unknown>> };
    const stream = value.streams?.[0];
    const codecName = stream?.codec_name;
    const width = stream?.width;
    const height = stream?.height;
    if (codecName !== "mjpeg" || !isPositiveInteger(width) || !isPositiveInteger(height)) throw new Error("invalid probe");
    return { codec_name: codecName, width, height };
  } catch {
    throw evidenceError("EVIDENCE_INVALID", "evidence JPEG probe failed");
  }
}

function parseEvidenceEntry(value: unknown, index: number): EvidenceManifestEntry {
  const name = `entries[${index}]`;
  const obj = strictRecord(value, name, [
    "id",
    "relative_path",
    "sha256",
    "size_bytes",
    "width",
    "height",
    "source_id",
    "source_time_seconds",
    "request_id",
    "candidate_id",
    "output_time_seconds",
  ]);
  return {
    id: opaqueId(obj.id, `${name}.id`),
    relative_path: evidenceRelativePath(obj.relative_path),
    sha256: normalizedSha256(obj.sha256),
    size_bytes: positiveInteger(obj.size_bytes, `${name}.size_bytes`),
    width: positiveInteger(obj.width, `${name}.width`),
    height: positiveInteger(obj.height, `${name}.height`),
    source_id: optionalOpaqueId(obj.source_id, `${name}.source_id`),
    source_time_seconds: optionalNonNegativeNumber(obj.source_time_seconds, `${name}.source_time_seconds`),
    request_id: optionalOpaqueId(obj.request_id, `${name}.request_id`),
    candidate_id: optionalOpaqueId(obj.candidate_id, `${name}.candidate_id`),
    output_time_seconds: optionalNonNegativeNumber(obj.output_time_seconds, `${name}.output_time_seconds`),
  };
}

function validatedEvidenceRoot(value: string): string {
  if (typeof value !== "string" || value.trim() === "" || CONTROL_CHARACTER_PATTERN.test(value)) {
    throw evidenceError("UNSAFE_CONTRACT_PATH", "evidence directory path is unsafe");
  }
  try {
    const lexical = resolve(value);
    if (fsRuntime.lstatSync(lexical).isSymbolicLink()) throw new Error("symlink");
    const root = fsRuntime.realpathSync(lexical);
    if (!statSync(root).isDirectory()) throw new Error("not directory");
    return root;
  } catch {
    throw evidenceError("UNSAFE_CONTRACT_PATH", "evidence directory path is unsafe");
  }
}

function validatedManifestPath(root: string): string {
  const path = join(root, "manifest.json");
  try {
    const lexical = fsRuntime.lstatSync(path);
    if (lexical.isSymbolicLink() || !lexical.isFile()) throw new Error("unsafe manifest");
    const resolved = fsRuntime.realpathSync(path);
    assertContained(root, resolved);
    return resolved;
  } catch (error) {
    if (isEvidenceImportError(error)) throw error;
    throw evidenceError("EVIDENCE_INVALID", "evidence manifest is missing or invalid");
  }
}

function readEvidenceManifest(path: string): EvidenceManifest {
  try {
    return parseEvidenceManifest(JSON.parse(readFileSync(path, "utf8")));
  } catch (error) {
    if (isEvidenceImportError(error)) throw error;
    throw evidenceError("EVIDENCE_INVALID", "evidence manifest is missing or invalid");
  }
}

function validatedMemberPath(root: string, memberPath: string): string {
  const segments = memberPath.split("/");
  let current = root;
  try {
    for (const segment of segments) {
      current = join(current, segment);
      if (fsRuntime.lstatSync(current).isSymbolicLink()) {
        throw evidenceError("UNSAFE_CONTRACT_PATH", "evidence member path is unsafe");
      }
    }
    const resolved = fsRuntime.realpathSync(current);
    assertContained(root, resolved);
    if (!statSync(resolved).isFile()) throw new Error("not file");
    return resolved;
  } catch (error) {
    if (isEvidenceImportError(error)) throw error;
    throw evidenceError("EVIDENCE_INVALID", "evidence member is missing or invalid");
  }
}

function verifiedMemberBytes(path: string, entry: EvidenceManifestEntry): Uint8Array {
  let bytes: Uint8Array;
  let size: number;
  try {
    const before = fsRuntime.lstatSync(path);
    if (before.isSymbolicLink() || !before.isFile()) throw new Error("unsafe file");
    bytes = readFileSync(path);
    const after = fsRuntime.lstatSync(path);
    if (after.isSymbolicLink() || !after.isFile()) throw new Error("unsafe file");
    size = after.size;
  } catch {
    throw evidenceError("EVIDENCE_INVALID", "evidence member is missing or invalid");
  }
  if (size !== entry.size_bytes || bytes.length !== entry.size_bytes) {
    throw evidenceError("EVIDENCE_HASH_MISMATCH", "evidence member bytes do not match manifest");
  }
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== entry.sha256) throw evidenceError("EVIDENCE_HASH_MISMATCH", "evidence member bytes do not match manifest");
  return bytes;
}

function safeProbe(probe: EvidenceProbe, path: string): EvidenceProbeResult {
  try {
    const result = probe(path);
    if (result.codec_name !== "mjpeg" || !isPositiveInteger(result.width) || !isPositiveInteger(result.height)) {
      throw new Error("invalid probe");
    }
    return result;
  } catch (error) {
    if (isEvidenceImportError(error)) throw error;
    throw evidenceError("EVIDENCE_INVALID", "evidence JPEG probe failed");
  }
}

function validateExpectedBindings(
  entries: EvidenceManifestEntry[],
  expectedBindings: Record<string, EvidenceBindingExpectation> | undefined,
): void {
  if (expectedBindings === undefined) return;
  const expectedIds = Object.keys(expectedBindings);
  if (expectedIds.length !== entries.length) throw evidenceError("EVIDENCE_BINDING_MISMATCH", "evidence bindings do not match request");
  const actualById = new Map(entries.map((entry) => [entry.id, entry]));
  for (const id of expectedIds) {
    if (!OPAQUE_ID_PATTERN.test(id)) throw evidenceError("EVIDENCE_BINDING_MISMATCH", "evidence bindings do not match request");
    const entry = actualById.get(id);
    const expected = expectedBindings[id];
    if (!entry || !expected || !bindingMatches(entry, expected)) {
      throw evidenceError("EVIDENCE_BINDING_MISMATCH", "evidence bindings do not match request");
    }
  }
}

function bindingMatches(entry: EvidenceManifestEntry, expected: EvidenceBindingExpectation): boolean {
  const keys: Array<keyof EvidenceBindingExpectation> = [
    "source_id",
    "source_time_seconds",
    "request_id",
    "candidate_id",
    "output_time_seconds",
  ];
  return keys.every((key) => expected[key] === undefined || Object.is(entry[key], expected[key]));
}

function evidenceRelativePath(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "" || CONTROL_CHARACTER_PATTERN.test(value)) {
    throw evidenceError("UNSAFE_CONTRACT_PATH", "evidence member path is unsafe");
  }
  if (URI_SCHEME_PATTERN.test(value) || WINDOWS_DRIVE_PATTERN.test(value) || pathRuntime.isAbsolute(value) || value.includes("\\")) {
    throw evidenceError("UNSAFE_CONTRACT_PATH", "evidence member path is unsafe");
  }
  const segments = value.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw evidenceError("UNSAFE_CONTRACT_PATH", "evidence member path is unsafe");
  }
  return value;
}

function assertContained(root: string, path: string): void {
  const fromRoot = relative(root, path);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || pathRuntime.isAbsolute(fromRoot)) {
    throw evidenceError("UNSAFE_CONTRACT_PATH", "evidence member path is unsafe");
  }
}

function strictRecord(value: unknown, name: string, allowedKeys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw evidenceError("EVIDENCE_INVALID", `${name} must be an object`);
  }
  const obj = value as Record<string, unknown>;
  const allowed = new Set(allowedKeys);
  if (Object.keys(obj).some((key) => !allowed.has(key))) throw evidenceError("EVIDENCE_INVALID", `${name} contains unknown fields`);
  return obj;
}

function opaqueId(value: unknown, name: string): string {
  if (typeof value !== "string" || !OPAQUE_ID_PATTERN.test(value)) throw evidenceError("EVIDENCE_INVALID", `${name} must be an opaque identifier`);
  return value;
}

function optionalOpaqueId(value: unknown, name: string): string | undefined {
  return value === undefined ? undefined : opaqueId(value, name);
}

function normalizedSha256(value: unknown): string {
  if (typeof value !== "string") throw evidenceError("EVIDENCE_INVALID", "evidence sha256 is invalid");
  const match = SHA256_PATTERN.exec(value);
  if (!match) throw evidenceError("EVIDENCE_INVALID", "evidence sha256 is invalid");
  return match[1]!;
}

function positiveInteger(value: unknown, name: string): number {
  if (!isPositiveInteger(value)) throw evidenceError("EVIDENCE_INVALID", `${name} must be a positive integer`);
  return value;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function optionalNonNegativeNumber(value: unknown, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw evidenceError("EVIDENCE_INVALID", `${name} must be a finite non-negative number`);
  }
  return value;
}

function assertUnique(values: string[], name: string): void {
  if (new Set(values).size !== values.length) throw evidenceError("EVIDENCE_INVALID", `${name} must be unique`);
}

function evidenceError(code: EvidenceImportErrorCode, message: string): EvidenceImportError {
  const error = new Error(message) as EvidenceImportError;
  error.code = code;
  return error;
}

function isEvidenceImportError(value: unknown): value is EvidenceImportError {
  if (!value || typeof value !== "object") return false;
  const code = (value as { code?: unknown }).code;
  return code === "UNSAFE_CONTRACT_PATH"
    || code === "EVIDENCE_INVALID"
    || code === "EVIDENCE_HASH_MISMATCH"
    || code === "EVIDENCE_BINDING_MISMATCH";
}
