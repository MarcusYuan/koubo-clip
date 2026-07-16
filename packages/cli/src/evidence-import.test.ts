import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import * as nodeFs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import {
  parseEvidenceManifest,
  parseEvidenceProbeResult,
  validateEvidenceDirectory,
  type EvidenceImportErrorCode,
  type EvidenceManifestEntry,
} from "./evidence-import";

const JPEG_BYTES = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);
const fsRuntime = nodeFs as unknown as { realpathSync(path: string): string };

test("validates every manifest member and returns absolute verified paths", () => {
  const fixture = evidenceFixture();
  const result = validateEvidenceDirectory(fixture.root, {
    probe: () => ({ codec_name: "mjpeg", width: 160, height: 90 }),
    expectedBindings: {
      "frame-1": { source_id: "src-001", source_time_seconds: 1.25, request_id: "request-1" },
    },
  });
  expect(result.length).toBe(1);
  expect(result[0]?.absolute_path).toBe(fsRuntime.realpathSync(fixture.framePath));
  expect(result[0]?.sha256).toBe(hash(JPEG_BYTES));
  expect(result[0]?.request_id).toBe("request-1");
});

test("accepts prefixed manifest digests but returns a normalized hex digest", () => {
  const fixture = evidenceFixture({ sha256: `sha256:${hash(JPEG_BYTES)}` });
  const result = validateEvidenceDirectory(fixture.root, { probe: validProbe });
  expect(result[0]?.sha256).toBe(hash(JPEG_BYTES));
});

test("strict manifest parsing rejects unknown fields and invalid identifiers", () => {
  expectCode(() => parseEvidenceManifest({ version: "1.0", entries: [{ ...entry(), provider_url: "https://example.com" }] }), "EVIDENCE_INVALID");
  expectCode(() => parseEvidenceManifest({ version: "1.0", entries: [{ ...entry(), id: "../private" }] }), "EVIDENCE_INVALID");
  expectCode(() => parseEvidenceManifest({ version: "2.0", entries: [entry()] }), "EVIDENCE_INVALID");
  expectCode(() => parseEvidenceManifest({ version: "1.0", entries: [] }), "EVIDENCE_INVALID");
});

test("rejects traversal, absolute, URL, Windows, and non-canonical member paths", () => {
  for (const relativePath of ["../frame.jpg", "/tmp/frame.jpg", "https://example.com/frame.jpg", "C:/frame.jpg", "frames\\frame.jpg", "frames//frame.jpg"]) {
    expectCode(() => parseEvidenceManifest({ version: "1.0", entries: [{ ...entry(), relative_path: relativePath }] }), "UNSAFE_CONTRACT_PATH");
  }
});

test("rejects direct and nested member symlinks without reading their targets", () => {
  const direct = evidenceFixture();
  const outside = join(direct.parent, "outside.jpg");
  writeFileSync(outside, JPEG_BYTES);
  unlinkSync(direct.framePath);
  symlinkSync(outside, direct.framePath);
  expectCode(() => validateEvidenceDirectory(direct.root, { probe: validProbe }), "UNSAFE_CONTRACT_PATH");

  const nested = evidenceFixture({ relative_path: "nested/frame.jpg" }, false);
  const outsideDirectory = join(nested.parent, "outside-dir");
  mkdirSync(outsideDirectory);
  writeFileSync(join(outsideDirectory, "frame.jpg"), JPEG_BYTES);
  symlinkSync(outsideDirectory, join(nested.root, "nested"));
  expectCode(() => validateEvidenceDirectory(nested.root, { probe: validProbe }), "UNSAFE_CONTRACT_PATH");
});

test("rejects a symlinked manifest", () => {
  const root = mkdtempSync(join(tmpdir(), "koubo-evidence-manifest-link-"));
  const external = join(root, "external.json");
  writeFileSync(external, JSON.stringify({ version: "1.0", entries: [entry()] }));
  symlinkSync(external, join(root, "manifest.json"));
  expectCode(() => validateEvidenceDirectory(root, { probe: validProbe }), "EVIDENCE_INVALID");
});

test("checks size and sha256 exactly before probing", () => {
  let probeCalls = 0;
  const wrongSize = evidenceFixture({ size_bytes: JPEG_BYTES.length + 1 });
  expectCode(() => validateEvidenceDirectory(wrongSize.root, { probe: () => {
    probeCalls += 1;
    return validProbe("");
  } }), "EVIDENCE_SIZE_MISMATCH");
  expect(probeCalls).toBe(0);

  const wrongHash = evidenceFixture({ sha256: "a".repeat(64) });
  expectCode(() => validateEvidenceDirectory(wrongHash.root, { probe: validProbe }), "EVIDENCE_HASH_MISMATCH");
});

test("requires JPEG codec and exact dimensions", () => {
  const wrongCodec = evidenceFixture();
  expectCode(() => validateEvidenceDirectory(wrongCodec.root, { probe: () => ({ codec_name: "png", width: 160, height: 90 }) }), "EVIDENCE_CODEC_MISMATCH");
  const wrongDimensions = evidenceFixture();
  expectCode(() => validateEvidenceDirectory(wrongDimensions.root, { probe: () => ({ codec_name: "mjpeg", width: 320, height: 180 }) }), "EVIDENCE_DIMENSION_MISMATCH");
  const probeFailure = evidenceFixture();
  expectCode(() => validateEvidenceDirectory(probeFailure.root, { probe: () => { throw new Error("private path"); } }), "EVIDENCE_PROBE_UNAVAILABLE");
});

test("classifies probe transport, process, and output failures", () => {
  expectCode(() => parseEvidenceProbeResult({ status: null, stdout: "", error: new Error("private path") }), "EVIDENCE_PROBE_UNAVAILABLE");
  expectCode(() => parseEvidenceProbeResult({ status: 9, stdout: "" }), "EVIDENCE_PROBE_FAILED");
  expectCode(() => parseEvidenceProbeResult({ status: 0, stdout: "not-json" }), "EVIDENCE_PROBE_OUTPUT_INVALID");
  expectCode(() => parseEvidenceProbeResult({ status: 0, stdout: JSON.stringify({ streams: [{}] }) }), "EVIDENCE_PROBE_OUTPUT_INVALID");
  expect(parseEvidenceProbeResult({ status: 0, stdout: JSON.stringify({ streams: [{ codec_name: "mjpeg", width: 224, height: 480 }] }) })).toEqual({ codec_name: "mjpeg", width: 224, height: 480 });
});

test("imports a real 224x480 baseline JPEG with the installed ffprobe", () => {
  if (spawnSync("ffmpeg", ["-version"]).status !== 0 || spawnSync("ffprobe", ["-version"]).status !== 0) return;
  const parent = mkdtempSync(join(tmpdir(), "koubo-evidence-real-jpeg-"));
  const root = join(parent, "evidence");
  mkdirSync(root);
  const framePath = join(root, "frame.jpg");
  const rendered = spawnSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "color=c=black:s=224x480", "-frames:v", "1", framePath], { encoding: "utf8" });
  if (rendered.status !== 0) throw new Error("failed to create JPEG fixture");
  const bytes = readFileSync(framePath);
  writeFileSync(join(root, "manifest.json"), JSON.stringify({ version: "1.0", entries: [{
    id: "frame-1", relative_path: "frame.jpg", sha256: hash(bytes), size_bytes: bytes.length,
    width: 224, height: 480, source_id: "src-001", source_time_seconds: 1.25, request_id: "request-1",
  }] }));
  expect(validateEvidenceDirectory(root).map(({ width, height }) => ({ width, height }))).toEqual([{ width: 224, height: 480 }]);
});

test("binding expectations are exact and fail closed for missing or extra entries", () => {
  const fixture = evidenceFixture();
  expectCode(() => validateEvidenceDirectory(fixture.root, {
    probe: validProbe,
    expectedBindings: { "frame-1": { source_id: "src-002" } },
  }), "EVIDENCE_BINDING_MISMATCH");
  expectCode(() => validateEvidenceDirectory(fixture.root, {
    probe: validProbe,
    expectedBindings: {},
  }), "EVIDENCE_BINDING_MISMATCH");
  expectCode(() => validateEvidenceDirectory(fixture.root, {
    probe: validProbe,
    expectedBindings: { "frame-1": {}, "frame-2": {} },
  }), "EVIDENCE_BINDING_MISMATCH");
});

test("validation failure never publishes or mutates evidence directory members", () => {
  const fixture = evidenceFixture({ sha256: "b".repeat(64) });
  const beforeNames = readdirSync(fixture.root).sort();
  const beforeBytes = readFileSync(fixture.framePath);
  expectCode(() => validateEvidenceDirectory(fixture.root, { probe: validProbe }), "EVIDENCE_HASH_MISMATCH");
  expect(readdirSync(fixture.root).sort()).toEqual(beforeNames);
  expect(readFileSync(fixture.framePath)).toEqual(beforeBytes);
});

function evidenceFixture(
  overrides: Partial<EvidenceManifestEntry> = {},
  writeMember = true,
): { parent: string; root: string; framePath: string } {
  const parent = mkdtempSync(join(tmpdir(), "koubo-evidence-import-"));
  const root = join(parent, "evidence");
  mkdirSync(root);
  const manifestEntry = entry(overrides);
  const framePath = join(root, ...manifestEntry.relative_path.split("/"));
  if (writeMember) {
    const directory = manifestEntry.relative_path.includes("/")
      ? framePath.slice(0, framePath.lastIndexOf("/"))
      : root;
    mkdirSync(directory, { recursive: true });
    writeFileSync(framePath, JPEG_BYTES);
  }
  writeFileSync(join(root, "manifest.json"), JSON.stringify({ version: "1.0", entries: [manifestEntry] }));
  return { parent, root, framePath };
}

function entry(overrides: Partial<EvidenceManifestEntry> = {}): EvidenceManifestEntry {
  return {
    id: "frame-1",
    relative_path: "frame.jpg",
    sha256: hash(JPEG_BYTES),
    size_bytes: JPEG_BYTES.length,
    width: 160,
    height: 90,
    source_id: "src-001",
    source_time_seconds: 1.25,
    request_id: "request-1",
    ...overrides,
  };
}

function validProbe(_path: string) {
  return { codec_name: "mjpeg", width: 160, height: 90 };
}

function hash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function expectCode(action: () => unknown, code: EvidenceImportErrorCode): void {
  try {
    action();
  } catch (error) {
    expect((error as { code?: unknown }).code).toBe(code);
    return;
  }
  throw new Error(`expected ${code}`);
}
