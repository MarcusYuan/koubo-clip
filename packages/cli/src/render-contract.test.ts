import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  RenderContractError,
  assertBundleRelativeAssetPath,
  canonicalJson,
  compileOutputFrameSchedule,
  createRenderContractV2,
  materializeJsonObject,
  parseRenderBinding,
  parseRenderContractV2,
  parseRenderContract,
  parseSourceMapV1,
  parseStrictInspection,
  parseStrictRenderResult,
  renderBindingDigest,
  renderContractDigest,
  renderContractErrorCode,
  renderContractErrorCodes,
  RENDER_BINDING_SCHEMA_VERSION,
  RENDER_CONTRACT_SCHEMA_VERSION,
  STRICT_INSPECTION_SCHEMA_VERSION,
  STRICT_RENDER_RESULT_SCHEMA_VERSION,
  sha256Digest,
  strictRenderResultDigest,
  verifyRenderAssetBytes,
  verifyRenderAssets,
  verifyRenderBinding,
  type RenderBindingV2,
  type RenderContractPayloadV2,
  type StrictRenderResultV2,
} from "./render-contract";

const SOURCE_DIGEST = `sha256:${"a".repeat(64)}` as const;

function payload(): RenderContractPayloadV2 {
  return {
    runtime: { renderer: "koubo-clip", cli_version: "0.0.1" },
    sources: [
      {
        source_id: "source-1",
        order: 0,
        original_filename: "talking-head.mp4",
        identity: {
          sha256: SOURCE_DIGEST,
          size_bytes: 123,
          duration_seconds: 10,
          video: {
            codec_name: "h264",
            width: 1920,
            height: 1080,
            display_width: 1920,
            display_height: 1080,
            rotation: 0,
            avg_frame_rate: "30/1",
            pixel_format: "yuv420p",
          },
          audio: { codec_name: "aac", sample_rate: 48000, channels: 2, channel_layout: "stereo" },
        },
        binding_requirements: {
          sha256: "exact",
          size_bytes: "exact",
          duration_tolerance_seconds: 0.05,
          dimensions: "exact",
          rotation: "exact",
          require_video: true,
          require_audio: true,
        },
      },
    ],
    timeline: { entries: [{ source_id: "source-1", start: 1, end: 4, output_start: 0, output_end: 3, output_order: 0, reason: "keep" }] },
    captions: { cues: [{ start: 0, end: 2, text: "hello" }], layout: { placement: "center_lower", size: "medium", anchor_x_ratio: 0.5, anchor_y_ratio: 0.7, font_size_px: 46 } },
    composition: { elements: [] },
    assets: [],
    audio: { music: [], sfx: [] },
    output: { filename: "final.mp4", width: 1920, height: 1080, fps: 30 },
    preflight: { require_audio: true },
    inspection: { duration_tolerance_seconds: 0.25 },
    authoring_lineage: { edit_plan: `sha256:${"b".repeat(64)}` },
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function expectCode(action: () => unknown, code: string): void {
  try {
    action();
    throw new Error("expected action to throw");
  } catch (error) {
    expect(error instanceof RenderContractError).toBe(true);
    expect(renderContractErrorCode(error)).toBe(code);
    expect((error as { code?: unknown }).code).toBe(code);
  }
}

test("unified strict render protocol exposes all output schemas as 2.0 and rejects v1", () => {
  expect(RENDER_CONTRACT_SCHEMA_VERSION).toBe("2.0");
  expect(RENDER_BINDING_SCHEMA_VERSION).toBe("2.0");
  expect(STRICT_RENDER_RESULT_SCHEMA_VERSION).toBe("2.0");
  expect(STRICT_INSPECTION_SCHEMA_VERSION).toBe("2.0");

  const contract = createRenderContractV2(payload());
  expect(parseRenderContract(clone(contract))).toEqual(contract);
  expectCode(() => parseRenderContract({ ...contract, schema_version: "1.0" }), renderContractErrorCodes.PROTOCOL_SCHEMA_UNSUPPORTED);

  const bindingBase = {
    schema_version: RENDER_BINDING_SCHEMA_VERSION,
    contract_digest: contract.contract_digest,
    sources: [{ source_id: "source-1", resolved_path: "/media/source.mp4", verified_identity: contract.payload.sources[0].identity }],
  };
  const binding = { ...bindingBase, binding_digest: renderBindingDigest(bindingBase) };
  expect(parseRenderBinding(clone(binding))).toEqual(binding);
  expectCode(() => parseRenderBinding({ ...binding, schema_version: "1.0" }), renderContractErrorCodes.PROTOCOL_SCHEMA_UNSUPPORTED);

  const result = strictRenderResult(contract.contract_digest, binding.binding_digest);
  expect(parseStrictRenderResult(clone(result))).toEqual(result);
  expectCode(() => parseStrictRenderResult({ ...result, schema_version: "1.0" }), renderContractErrorCodes.PROTOCOL_SCHEMA_UNSUPPORTED);

  const inspection = strictInspection(result);
  expect(parseStrictInspection(clone(inspection))).toEqual(inspection);
  expectCode(() => parseStrictInspection({ ...inspection, schema_version: "1.0" }), renderContractErrorCodes.PROTOCOL_SCHEMA_UNSUPPORTED);
});

test("binding digest includes the binding schema version", () => {
  const contract = createRenderContractV2(payload());
  const bindingBase = {
    schema_version: RENDER_BINDING_SCHEMA_VERSION,
    contract_digest: contract.contract_digest,
    sources: [{ source_id: "source-1", resolved_path: "/media/source.mp4", verified_identity: contract.payload.sources[0].identity }],
  };

  expect(renderBindingDigest(bindingBase)).toBe(sha256Digest(canonicalJson(bindingBase)));
  expect(renderBindingDigest(bindingBase) === sha256Digest(canonicalJson({ contract_digest: bindingBase.contract_digest, sources: bindingBase.sources }))).toBe(false);
});

test("accepted strict inspection requires final acceptance statuses", () => {
  const result = strictRenderResult(`sha256:${"a".repeat(64)}`, `sha256:${"b".repeat(64)}`);
  const accepted = strictInspection(result);
  expect(parseStrictInspection(accepted)).toEqual(accepted);

  for (const field of [
    "render_status",
    "technical_inspection_status",
    "proposal_conformance_status",
    "business_acceptance_status",
    "overall_status",
  ]) {
    const missing = clone(accepted) as Record<string, unknown>;
    delete missing[field];
    expectCode(() => parseStrictInspection(missing), renderContractErrorCodes.INVALID_STRICT_INSPECTION);
  }
});

test("canonical JSON sorts object keys recursively and preserves array order", () => {
  expect(canonicalJson({ z: 1, a: { y: true, x: [3, 2, 1] } })).toBe('{"a":{"x":[3,2,1],"y":true},"z":1}');
  expect(renderContractDigest({ a: 1, b: [1, 2] })).toBe(renderContractDigest({ b: [1, 2], a: 1 }));
  expect(renderContractDigest({ a: [1, 2] }) === renderContractDigest({ a: [2, 1] })).toBe(false);
});

test("canonical JSON rejects values that JSON.stringify would silently discard or rewrite", () => {
  expectCode(() => canonicalJson({ unsafe: undefined }), renderContractErrorCodes.INVALID_JSON_VALUE);
  expectCode(() => canonicalJson({ unsafe: Number.NaN }), renderContractErrorCodes.INVALID_JSON_VALUE);
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  expectCode(() => canonicalJson(cyclic), renderContractErrorCodes.INVALID_JSON_VALUE);
});

test("contract JSON materialization omits only undefined object properties", () => {
  expect(materializeJsonObject({ z: undefined, a: { d: undefined, c: 1 } })).toEqual({ a: { c: 1 } });
  expect(canonicalJson(materializeJsonObject({ z: undefined, a: { d: undefined, c: 1 } }))).toBe('{"a":{"c":1}}');

  expectCode(() => materializeJsonObject({ unsafe: [undefined] }), renderContractErrorCodes.INVALID_JSON_VALUE);
  const sparse = Array(1);
  expectCode(() => materializeJsonObject({ unsafe: sparse }), renderContractErrorCodes.INVALID_JSON_VALUE);
  for (const unsafe of [Number.NaN, Number.POSITIVE_INFINITY, () => undefined, Symbol("unsafe"), 1n]) {
    expectCode(() => materializeJsonObject({ unsafe }), renderContractErrorCodes.INVALID_JSON_VALUE);
  }
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  expectCode(() => materializeJsonObject(cyclic), renderContractErrorCodes.INVALID_JSON_VALUE);
  expectCode(() => materializeJsonObject({ unsafe: new Date(0) }), renderContractErrorCodes.INVALID_JSON_VALUE);
});

test("output frame schedule uses cumulative boundaries without per-segment drift", () => {
  expect(compileOutputFrameSchedule([{ output_order: 0, start: 0, end: 1 }], 30).total_frames).toBe(30);
  expect(compileOutputFrameSchedule([{ output_order: 0, start: 0, end: 0.95 }], 30).total_frames).toBe(29);

  const shortDurations = [0.95, 0.72, 1.18, 0.85, 0.98, 0.74, 1.21, 0.81, 0.726667];
  const short = compileOutputFrameSchedule(shortDurations.map((duration, output_order) => ({ output_order, start: 0, end: duration })), 30);
  expect(short.total_frames).toBe(245);
  expect(short.segments.reduce((sum, segment) => sum + segment.frame_count, 0)).toBe(short.total_frames);

  const reportedDurations = [12.1, 11.7, 13.05, 9.4, 14.2, 10.35, 12.6, 11.8, 12.966667];
  const reported = compileOutputFrameSchedule(reportedDurations.map((duration, output_order) => ({ output_order, start: 0, end: duration })), 30);
  expect(reported.total_frames).toBe(3245);
  expect(Number(reported.expected_duration_seconds.toFixed(6))).toBe(108.166667);

  expectCode(() => compileOutputFrameSchedule([{ output_order: 0, start: 0, end: 0.01 }], 30), renderContractErrorCodes.INVALID_RENDER_CONTRACT);
});

test("render contract parser is closed and verifies the digest over payload only", () => {
  const contract = createRenderContractV2(payload());
  expect(contract.schema_version).toBe("2.0");
  expect(contract.contract_digest).toBe(renderContractDigest(contract.payload));
  expect(contract.payload.captions.layout).toEqual({
    placement: "center_lower",
    size: "medium",
    anchor_x_ratio: 0.5,
    anchor_y_ratio: 0.7,
    font_size_px: 46,
  });
  expect(parseRenderContractV2(clone(contract))).toEqual(contract);

  const reordered = clone(contract);
  reordered.payload.runtime = { cli_version: "0.0.1", renderer: "koubo-clip" };
  expect(parseRenderContractV2(reordered).contract_digest).toBe(contract.contract_digest);

  const changed = clone(contract);
  changed.payload.output = { ...changed.payload.output, filename: "other.mp4" };
  expectCode(() => parseRenderContractV2(changed), renderContractErrorCodes.CONTRACT_DIGEST_MISMATCH);

  const unknown = { ...contract, fallback_project_path: "/tmp/project" };
  expectCode(() => parseRenderContractV2(unknown), renderContractErrorCodes.INVALID_RENDER_CONTRACT);
});

test("render contract v2 requires typed caption layout in parsed contracts", () => {
  const contract = createRenderContractV2({
    ...payload(),
    captions: {
      cues: [{ start: 0, end: 2, text: "hello" }],
      layout: { placement: "bottom_safe", size: "large", anchor_x_ratio: 0.5, anchor_y_ratio: 0.88, font_size_px: 56 },
    },
  });
  expect(parseRenderContractV2(clone(contract))).toEqual(contract);

  const empty = createRenderContractV2({ ...payload(), captions: { cues: [], layout: null } });
  expect(parseRenderContractV2(clone(empty)).payload.captions.layout).toBe(null);

  const old = { ...contract, schema_version: "1.0" };
  expectCode(() => parseRenderContractV2(old), renderContractErrorCodes.PROTOCOL_SCHEMA_UNSUPPORTED);

  const missingLayout = clone(contract) as unknown as { payload: { captions: Record<string, unknown> } };
  delete missingLayout.payload.captions.layout;
  expectCode(() => parseRenderContractV2(missingLayout), renderContractErrorCodes.INVALID_RENDER_CONTRACT);

  for (const layout of [
    { placement: "top", size: "large", anchor_x_ratio: 0.5, anchor_y_ratio: 0.8, font_size_px: 56 },
    { placement: "bottom_safe", size: "huge", anchor_x_ratio: 0.5, anchor_y_ratio: 0.8, font_size_px: 56 },
    { placement: "bottom_safe", size: "large", anchor_x_ratio: 1.1, anchor_y_ratio: 0.8, font_size_px: 56 },
    { placement: "center_lower", size: "large", anchor_x_ratio: 0.5, anchor_y_ratio: 0.83, font_size_px: 56 },
    { placement: "bottom_safe", size: "large", anchor_x_ratio: 0.5, anchor_y_ratio: 0.91, font_size_px: 56 },
    { placement: "bottom_safe", size: "large", anchor_x_ratio: 0.5, anchor_y_ratio: 0.8, font_size_px: 0 },
    { placement: "bottom_safe", size: "large", anchor_x_ratio: 0.5, anchor_y_ratio: Number.NaN, font_size_px: 56 },
    null,
  ]) {
    expectCode(() => createRenderContractV2({ ...payload(), captions: { cues: [{ start: 0, end: 2, text: "hello" }], layout } }), renderContractErrorCodes.INVALID_RENDER_CONTRACT);
  }

  expectCode(() => createRenderContractV2({
    ...payload(),
    captions: { cues: [{ start: 0, end: 2, text: "hello" }], layout: { placement: "bottom_safe", size: "medium", anchor_x_ratio: 0.5, anchor_y_ratio: 0.9, font_size_px: 46 } },
    output: { filename: "final.mp4", width: 1080, height: 1920, fps: 30 },
  }), renderContractErrorCodes.INVALID_RENDER_CONTRACT);
});

test("render contract rejects source paths, unknown source references, and out-of-range timeline entries", () => {
  const withPath = payload() as unknown as { sources: Array<Record<string, unknown>> };
  withPath.sources[0].project_path = "/private/source.mp4";
  expectCode(() => createRenderContractV2(withPath), renderContractErrorCodes.INVALID_RENDER_CONTRACT);

  const unknownSource = payload();
  unknownSource.timeline.entries[0].source_id = "source-2";
  expectCode(() => createRenderContractV2(unknownSource), renderContractErrorCodes.INVALID_RENDER_CONTRACT);

  const pastDuration = payload();
  pastDuration.timeline.entries[0].end = 10.1;
  expectCode(() => createRenderContractV2(pastDuration), renderContractErrorCodes.INVALID_RENDER_CONTRACT);

  const missingAudioSection = payload() as unknown as Record<string, unknown>;
  delete missingAudioSection.audio;
  expectCode(() => createRenderContractV2(missingAudioSection), renderContractErrorCodes.INVALID_RENDER_CONTRACT);

  const videoOnly = payload();
  delete videoOnly.sources[0].identity.audio;
  videoOnly.sources[0].binding_requirements.require_audio = false;
  expect(createRenderContractV2(videoOnly).payload.sources[0].identity.audio).toBe(undefined);
});

test("bundle asset paths are content-addressed and traversal-safe", () => {
  const digest = sha256Digest("asset");
  const path = `assets/${digest.slice("sha256:".length)}.png`;
  expect(assertBundleRelativeAssetPath(path, digest)).toBe(path);

  for (const unsafe of [
    "../assets/file.png",
    "/assets/file.png",
    "assets/../file.png",
    "assets\\file.png",
    "https://example.test/file.png",
    `assets/${"b".repeat(64)}.png`,
    `nested/assets/${digest.slice(7)}.png`,
  ]) {
    expectCode(() => assertBundleRelativeAssetPath(unsafe, digest), renderContractErrorCodes.INVALID_BUNDLE_ASSET_PATH);
  }
});

test("asset metadata and bytes validation is reusable in memory and against a bundle", () => {
  const bytes = Buffer.from("verified asset");
  const digest = sha256Digest(bytes);
  const asset = {
    asset_id: "hero",
    bundle_path: `assets/${digest.slice(7)}.bin`,
    sha256: digest,
    size_bytes: bytes.byteLength,
    media_type: "application/octet-stream",
  };
  expect(verifyRenderAssetBytes(asset, bytes)).toEqual({
    asset_id: asset.asset_id,
    bundle_path: asset.bundle_path,
    sha256: asset.sha256,
    size_bytes: asset.size_bytes,
  });
  expectCode(() => verifyRenderAssetBytes({ ...asset, size_bytes: bytes.byteLength + 1 }, bytes), renderContractErrorCodes.ASSET_SIZE_MISMATCH);

  const root = mkdtempSync(join(tmpdir(), "koubo-render-contract-"));
  mkdirSync(join(root, "assets"));
  writeFileSync(join(root, asset.bundle_path), bytes);
  expect(verifyRenderAssets(root, [asset])).toEqual([{
    asset_id: asset.asset_id,
    bundle_path: asset.bundle_path,
    sha256: asset.sha256,
    size_bytes: asset.size_bytes,
  }]);

  const outside = join(root, "outside.bin");
  writeFileSync(outside, bytes);
  const linkedPath = join(root, "assets", `${digest.slice(7)}.linked`);
  symlinkSync(outside, linkedPath);
  expectCode(
    () => verifyRenderAssets(root, [{ ...asset, bundle_path: `assets/${digest.slice(7)}.linked` }]),
    renderContractErrorCodes.ASSET_NOT_FILE,
  );
});

test("source map and binding parsers reject fallback metadata and bind exact identities", () => {
  expect(parseSourceMapV1({ "source-1": "/media/source.mp4" })).toEqual({ "source-1": "/media/source.mp4" });
  expectCode(() => parseSourceMapV1({ "source-1": "https://example.test/source.mp4" }), renderContractErrorCodes.INVALID_SOURCE_MAP);

  const contract = createRenderContractV2(payload());
  const bindingBase = {
    schema_version: RENDER_BINDING_SCHEMA_VERSION,
    contract_digest: contract.contract_digest,
    sources: [{ source_id: "source-1", resolved_path: "/media/source.mp4", verified_identity: contract.payload.sources[0].identity }],
  };
  const binding: RenderBindingV2 = { ...bindingBase, binding_digest: renderBindingDigest(bindingBase) };
  expect(parseRenderBinding(clone(binding))).toEqual(binding);
  expect(verifyRenderBinding(contract, binding)).toEqual(binding);

  const changedBinding = clone(binding);
  changedBinding.sources[0].resolved_path = "/media/other.mp4";
  expectCode(() => parseRenderBinding(changedBinding), renderContractErrorCodes.BINDING_DIGEST_MISMATCH);
  expectCode(() => verifyRenderBinding(contract, changedBinding), renderContractErrorCodes.BINDING_DIGEST_MISMATCH);

  const otherContract = { ...contract, contract_digest: `sha256:${"f".repeat(64)}` as const };
  expectCode(() => verifyRenderBinding(otherContract, binding), renderContractErrorCodes.CONTRACT_DIGEST_MISMATCH);
});

test("strict result and inspection parsers require digest-bound receipts", () => {
  const result: StrictRenderResultV2 = {
    schema_version: STRICT_RENDER_RESULT_SCHEMA_VERSION,
    contract_digest: `sha256:${"a".repeat(64)}`,
    binding_digest: `sha256:${"b".repeat(64)}`,
    output: {
      output_path: "/renders/final.mp4",
      sha256: `sha256:${"c".repeat(64)}`,
      size_bytes: 1024,
      duration_seconds: 3,
      probe: { format: "mp4" },
    },
    renderer: { cli_version: "0.0.1" },
    warnings: [],
    completed_at: "2026-07-15T08:00:00.000Z",
  };
  expect(parseStrictRenderResult(result)).toEqual(result);

  const inspection = {
    schema_version: STRICT_INSPECTION_SCHEMA_VERSION,
    contract_digest: result.contract_digest,
    binding_digest: result.binding_digest,
    render_result_digest: strictRenderResultDigest(result),
    output_sha256: result.output.sha256,
    accepted: true,
    render_status: "success",
    technical_inspection_status: "passed",
    proposal_conformance_status: "passed",
    business_acceptance_status: "passed",
    overall_status: "completed",
    checks: [{ id: "duration", status: "passed", message: "duration matches" }],
    frames: [],
    warnings: [],
    blockers: [],
    inspected_at: "2026-07-15T08:01:00.000Z",
  };
  expect(parseStrictInspection(inspection)).toEqual(inspection);

  const partial = {
    ...inspection,
    accepted: false,
    render_status: "success",
    technical_inspection_status: "passed",
    proposal_conformance_status: "failed",
    business_acceptance_status: "failed",
    overall_status: "partial",
    checks: [{ id: "proposal-conformance", status: "blocker", message: "confirmed option was not realized" }],
    blockers: ["proposal-conformance"],
  } as const;
  expect(parseStrictInspection(partial)).toEqual(partial);
  expectCode(
    () => parseStrictInspection({ ...partial, accepted: true, checks: [], blockers: [] }),
    renderContractErrorCodes.INVALID_STRICT_INSPECTION,
  );

  expectCode(
    () => parseStrictInspection({ ...inspection, blockers: ["duration mismatch"] }),
    renderContractErrorCodes.INVALID_STRICT_INSPECTION,
  );
  expectCode(
    () => parseStrictRenderResult({ ...result, project_path: "/authoring/project" }),
    renderContractErrorCodes.INVALID_STRICT_RENDER_RESULT,
  );
});

function strictRenderResult(contract_digest: string, binding_digest: string) {
  return {
    schema_version: "2.0",
    contract_digest,
    binding_digest,
    output: {
      output_path: "koubo-final.mp4",
      sha256: `sha256:${"c".repeat(64)}`,
      size_bytes: 1024,
      duration_seconds: 3,
      probe: { format: "mp4" },
    },
    renderer: { cli_version: "0.0.14", runtime_compatibility_digest: `sha256:${"d".repeat(64)}` },
    warnings: [],
    completed_at: "2026-07-15T08:00:00.000Z",
  };
}

function strictInspection(result: ReturnType<typeof strictRenderResult>) {
  return {
    schema_version: "2.0",
    contract_digest: result.contract_digest,
    binding_digest: result.binding_digest,
    render_result_digest: strictRenderResultDigest(result),
    output_sha256: result.output.sha256,
    accepted: true,
    render_status: "success",
    technical_inspection_status: "passed",
    proposal_conformance_status: "passed",
    business_acceptance_status: "passed",
    overall_status: "completed",
    checks: [{ id: "duration", status: "passed", message: "duration matches" }],
    frames: [],
    warnings: [],
    blockers: [],
    inspected_at: "2026-07-15T08:01:00.000Z",
  };
}
