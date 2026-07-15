import { expect, test } from "bun:test";
import {
  normalizeSourcesManifest,
  parseSourceMap,
  parseSourceMaterializationManifest,
  parseSourcesManifestV2,
  sourcesIdentityFingerprintProjection,
  validateMaterializationPath,
  validateSourceMapPath,
} from "./source-identity";

const HASH_A = `sha256:${"a".repeat(64)}`;
const HASH_B = `sha256:${"b".repeat(64)}`;

function source(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    source_id: "src-001",
    order: 0,
    original_filename: "raw.mp4",
    local_media_ref: "workspace://opaque/upload-1",
    identity: {
      sha256: HASH_A,
      size_bytes: 123456,
      duration_seconds: 83.42,
      video: {
        codec_name: "h264",
        width: 1920,
        height: 1080,
        display_width: 1920,
        display_height: 1080,
        rotation: 0,
        avg_frame_rate: "30000/1000",
        pixel_format: "yuv420p",
      },
      audio: {
        codec_name: "aac",
        sample_rate: 48000,
        channels: 2,
        channel_layout: "stereo",
      },
    },
    ...overrides,
  };
}

test("sources v2 parser returns a canonical strict identity", () => {
  const manifest = parseSourcesManifestV2({ contract_version: "2.0", sources: [source()] });
  expect(manifest.sources[0]?.identity.video.avg_frame_rate).toBe("30/1");
  expect(manifest.sources[0]?.local_media_ref).toBe("workspace://opaque/upload-1");
  expect(manifest.sources[0]?.identity.audio?.sample_rate).toBe(48000);
});

test("sources v2 parser rejects unknown fields and incomplete or ambiguous identity", () => {
  expect(() => parseSourcesManifestV2({ contract_version: "2.0", sources: [{ ...source(), unexpected: true }] })).toThrow("unknown field");
  expect(() => parseSourcesManifestV2({ contract_version: "2.0", sources: [source({ source_id: "../raw" })] })).toThrow("opaque identifier");
  expect(() => parseSourcesManifestV2({ contract_version: "2.0", sources: [source({ original_filename: "source/raw.mp4" })] })).toThrow("filename");
  expect(() => parseSourcesManifestV2({ contract_version: "2.0", sources: [source({ identity: { ...(source().identity as object), sha256: "abc" } })] })).toThrow("sha256");
  expect(() => parseSourcesManifestV2({ contract_version: "2.0", sources: [source({ identity: { ...(source().identity as object), duration_seconds: 0 } })] })).toThrow("positive number");
  expect(() => parseSourcesManifestV2({
    contract_version: "2.0",
    sources: [source({ identity: { ...(source().identity as object), extra_probe_payload: {} } })],
  })).toThrow("unknown field");
  expect(() => parseSourcesManifestV2({ contract_version: "2.0", sources: [source({ order: 1 })] })).toThrow("zero-based array index");
});

test("sources v2 parser normalizes rotations and allows a video without audio", () => {
  const baseIdentity = source().identity as Record<string, unknown>;
  const video = baseIdentity.video as Record<string, unknown>;
  const parsed = parseSourcesManifestV2({
    contract_version: "2.0",
    sources: [source({ identity: { ...baseIdentity, video: { ...video, rotation: -90 }, audio: undefined } })],
  });
  expect(parsed.sources[0]?.identity.video.rotation).toBe(270);
  expect(parsed.sources[0]?.identity.audio).toBe(undefined);
});

test("source materialization parser binds verified bytes to safe project-relative paths", () => {
  const materialization = parseSourceMaterializationManifest({
    contract_version: "1.0",
    sources: [{ source_id: "src-001", project_path: "source/001-raw.mp4", sha256: HASH_A, size_bytes: 123456 }],
  });
  expect(materialization.sources[0]?.project_path).toBe("source/001-raw.mp4");
  expect(() => parseSourceMaterializationManifest({
    contract_version: "1.0",
    sources: [{ source_id: "src-001", project_path: "../raw.mp4", sha256: HASH_A, size_bytes: 123456 }],
  })).toThrow("must not contain");
  expect(() => parseSourceMaterializationManifest({
    contract_version: "1.0",
    sources: [
      { source_id: "src-001", project_path: "source/a.mp4", sha256: HASH_A, size_bytes: 1 },
      { source_id: "src-002", project_path: "source/a.mp4", sha256: HASH_B, size_bytes: 2 },
    ],
  })).toThrow("duplicate materialization project_path");
});

test("legacy source manifests normalize without inventing portable identity", () => {
  const normalized = normalizeSourcesManifest({
    sources: [{
      source_id: "src-legacy",
      order: 0,
      original_filename: "legacy.mp4",
      project_path: "source/001-legacy.mp4",
      duration_seconds: 12,
      probe: { streams: [] },
    }],
  });
  expect(normalized).toEqual({
    contract_version: "legacy",
    sources: [{
      source_id: "src-legacy",
      order: 0,
      original_filename: "legacy.mp4",
      project_path: "source/001-legacy.mp4",
      duration_seconds: 12,
      probe: { streams: [] },
    }],
  });
  expect(normalized.sources[0]?.identity).toBe(undefined);
});

test("portable source manifests normalize to the same common shape", () => {
  const normalized = normalizeSourcesManifest({ contract_version: "2.0", sources: [source()] });
  expect(normalized.contract_version).toBe("2.0");
  expect(normalized.sources[0]?.duration_seconds).toBe(83.42);
  expect(normalized.sources[0]?.project_path).toBe(undefined);
  expect(normalized.sources[0]?.identity?.sha256).toBe(HASH_A);
});

test("identity fingerprint projection excludes display and host-only refs", () => {
  const first = parseSourcesManifestV2({ contract_version: "2.0", sources: [source()] });
  const second = parseSourcesManifestV2({
    contract_version: "2.0",
    sources: [source({ original_filename: "renamed.mp4", local_media_ref: "another-host-ref" })],
  });
  expect(sourcesIdentityFingerprintProjection(first)).toEqual(sourcesIdentityFingerprintProjection(second));
  expect("local_media_ref" in sourcesIdentityFingerprintProjection(first).sources[0]!).toBe(false);
});

test("source map parser accepts explicit local paths but rejects URLs and unsafe ids", () => {
  expect(parseSourceMap({ "src-b": "C:\\Media\\b.mp4", "src-a": "/media/a.mp4" })).toEqual({
    "src-a": "/media/a.mp4",
    "src-b": "C:\\Media\\b.mp4",
  });
  expect(() => parseSourceMap({ "../src": "/media/a.mp4" })).toThrow("opaque identifier");
  expect(() => parseSourceMap({ "src-a": "file:///media/a.mp4" })).toThrow("not a URI");
  expect(() => parseSourceMap({ "src-a": "https://example.com/a.mp4" })).toThrow("not a URI");
  expect(() => parseSourceMap({ "src-a": "workspace:opaque-source" })).toThrow("not a URI");
});

test("lexical path validators do not resolve or touch the filesystem", () => {
  expect(validateSourceMapPath("/does/not/need/to/exist.mp4")).toBe("/does/not/need/to/exist.mp4");
  expect(validateMaterializationPath("source/my raw.mp4")).toBe("source/my raw.mp4");
  for (const unsafe of ["", "/tmp/raw.mp4", "C:/raw.mp4", "source\\raw.mp4", "source/../raw.mp4", "source//raw.mp4", "https://example.com/raw.mp4"]) {
    expect(() => validateMaterializationPath(unsafe)).toThrow();
  }
});
