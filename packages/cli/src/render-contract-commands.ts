import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import * as nodeFs from "node:fs";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { cliVersion, resolveHyperframesRoot } from "./bundle-paths";
import {
  parseAssetManifest,
  parseEdl,
  parseEnrichmentPlan,
  parseSourcesManifest,
  parseTranscript,
  projectArtifacts,
  type AssetManifestArtifact,
  type EdlArtifact,
  type EnrichmentPlanArtifact,
} from "./artifacts";
import {
  canonicalJson,
  compileOutputFrameSchedule,
  createRenderContractV1,
  parseRenderBindingV1,
  parseRenderContractV1,
  parseSourceMapV1,
  parseStrictRenderResultV1,
  renderBindingDigest,
  renderContractErrorCode,
  sha256Digest,
  strictRenderResultDigest,
  verifyRenderAssets,
  verifyRenderBinding,
  type JsonObject,
  type RenderBindingV1,
  type RenderContractAssetV1,
  type RenderContractPayloadV1,
  type RenderContractV1,
  type StrictInspectionCheckV1,
  type StrictInspectionV1,
  type StrictRenderResultV1,
  type Sha256Digest,
  type RenderSourceIdentityV1,
  type OutputFrameSchedule,
} from "./render-contract";
import {
  compileEdlProject,
  executeResolvedRenderPlan,
  probeStrictOutputTiming,
  probePortableSourceIdentity,
  resolveRenderContractStoryboard,
  type EnrichmentStoryboard,
} from "./project";
import { computeRendererResourcesDigest } from "./delivery-identity";
import { verifyInstalledDelivery } from "./delivery-runtime";
import { artifactReference, commitProjectStage, inputFingerprint, readProjectArtifactManifest, recordJsonArtifact } from "./project-lineage";

const fsRuntime = nodeFs as unknown as { realpathSync(path: string): string; lstatSync(path: string): { isSymbolicLink(): boolean }; renameSync(from: string, to: string): void };
const CAPABILITY_IDS = [
  "detached_source.v1",
  "external_frame_evidence.v1",
  "portable_edl.v1",
  "render_contract.export.v1",
  "render_contract.consume_strict.v1",
  "source_binding.v1",
] as const;
const RUNTIME_DEPENDENCIES = ["gsap@3.15.0", "hyperframes@0.7.36"] as const;

type CommandResult<T extends string, D> = { ok: true; command: T; data: D } | { ok: false; command: T; error: { code: string; message: string } };

export function exportRenderContract(projectPath: string, outputDir: string): CommandResult<"render-contract.export", { bundle_path: string; contract_digest: string; asset_count: number }> {
  let staging = "";
  let publishedBundle = false;
  let wroteProjectContract = false;
  const projectContractPath = join(projectPath, projectArtifacts.renderContract);
  const previousProjectContract = existsSync(projectContractPath) ? readFileSync(projectContractPath) : undefined;
  const startedAt = new Date().toISOString();
  try {
    verifyInstalledDelivery();
    if (existsSync(outputDir)) throw coded("CONTRACT_INVALID", "render contract output must not already exist");
    const compiled = compileEdlProject(projectPath);
    if (!compiled.ok) throw coded(compiled.error.code, compiled.error.message);
    const rawSources = parseSourcesManifest(readJson(join(projectPath, projectArtifacts.sources)));
    if (rawSources.contract_version !== "2.0" || rawSources.sources.some((source) => !source.identity)) {
      throw coded("CONTRACT_INVALID", "render contract export requires sources.json contract_version 2.0 with portable identities");
    }
    const edl = parseEdl(readJson(join(projectPath, projectArtifacts.edl)), rawSources);
    if (edl.contract_version !== "2.0") throw coded("CONTRACT_INVALID", "render contract export requires portable EDL contract_version 2.0");
    const transcript = parseTranscript(readJson(join(projectPath, projectArtifacts.transcriptJson)), rawSources);
    const cues = compileCaptionCues(transcript.segments, edl);

    const enrichmentPath = join(projectPath, projectArtifacts.enrichmentPlan);
    const assetManifestPath = join(projectPath, projectArtifacts.assetManifest);
    const plan = existsSync(enrichmentPath) ? parseEnrichmentPlan(readJson(enrichmentPath)) : undefined;
    const authoringAssets = plan && existsSync(assetManifestPath) ? parseAssetManifest(readJson(assetManifestPath)) : { assets: [] };
    if (plan && !existsSync(assetManifestPath) && referencedAssetIds(plan).size > 0) throw coded("CONTRACT_INVALID", "enrichment plan references assets but asset-manifest.json is missing");

    staging = `${outputDir}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    mkdirSync(join(staging, "assets"), { recursive: true });
    const { contractAssets, frozenAssets, bundlePaths } = stageReferencedAssets(projectPath, plan, authoringAssets, staging);
    const timelineEntries = (() => {
      let outputCursor = 0;
      return [...edl.entries].sort((a, b) => a.output_order - b.output_order).map(({ source_id, start, end, output_order, reason, quote, label }) => {
        const outputStart = outputCursor;
        outputCursor += end - start;
        return { source_id, start, end, output_start: outputStart, output_end: outputCursor, output_order, reason, ...(quote ? { quote } : {}), ...(label ? { label } : {}) };
      });
    })();
    const fps = 30;
    const frameSchedule = compileOutputFrameSchedule(timelineEntries, fps);
    const firstEntry = timelineEntries[0]!;
    const firstSource = rawSources.sources.find((source) => source.source_id === firstEntry.source_id)!;
    const output = resolveOutputSpec(plan?.profile.aspect_ratio ?? "source", firstSource.identity!.video.display_width, firstSource.identity!.video.display_height);
    const duration = frameSchedule.expected_duration_seconds;
    const storyboard = plan ? resolveRenderContractStoryboard({
      projectPath,
      width: output.width,
      height: output.height,
      durationSeconds: duration,
      captions: cues,
      plan,
      assets: authoringAssets,
      bundlePaths,
    }) : undefined;
    const runtime = liveRuntimeIdentity();
    const payload: RenderContractPayloadV1 = {
      runtime,
      sources: rawSources.sources.map((source) => ({
        source_id: source.source_id,
        order: source.order,
        original_filename: source.original_filename,
        identity: source.identity! as RenderSourceIdentityV1,
        binding_requirements: {
          sha256: "exact",
          size_bytes: "exact",
          duration_tolerance_seconds: 0.05,
          dimensions: "exact",
          rotation: "exact",
          require_video: true,
          require_audio: Boolean(source.identity!.audio),
        },
      })),
      timeline: { entries: timelineEntries },
      captions: { cues },
      composition: json({ mode: plan ? "resolved_storyboard" : "clean_captions", ...(plan ? { enrichment_plan: plan, storyboard } : {}) }),
      assets: contractAssets,
      audio: json(plan?.audio ?? { music: [], sfx: [] }),
      output: json({ container: "mp4", width: output.width, height: output.height, fps, video_codec: "h264", pixel_format: "yuv420p", audio_codec: "aac", audio_sample_rate: 48000, audio_channels: 2, canonical_filename: "koubo-final.mp4" }),
      preflight: json({ required_tools: ["ffmpeg", "ffprobe"], required_filters: ["scale", "pad", "fps", "format", "aresample", "aformat"], runtime_dependencies: [...RUNTIME_DEPENDENCIES], expected_duration_seconds: duration, source_probe_tolerance_seconds: 0.05 }),
      inspection: json({ duration_tolerance_seconds: Math.max(0.05, 2 / 30), require_video: true, require_audio: rawSources.sources.some((source) => Boolean(source.identity?.audio)), checks: storyboard?.qa_checks ?? [], hard_acceptance: true }),
      authoring_lineage: json({ members: authoringLineage(projectPath, [projectArtifacts.sources, projectArtifacts.edl, projectArtifacts.transcriptJson, ...(plan ? [projectArtifacts.enrichmentPlan] : []), ...(plan && existsSync(assetManifestPath) ? [projectArtifacts.assetManifest] : [])]) }),
    };
    const contract = createRenderContractV1(payload);
    writeJson(join(staging, "render-contract.json"), contract);
    fsRuntime.renameSync(staging, outputDir);
    staging = "";
    publishedBundle = true;
    writeJson(projectContractPath, contract);
    wroteProjectContract = true;
    const lifecycle = readProjectArtifactManifest(projectPath);
    const inputKeys = ["sources", "edl", "transcript", ...(plan ? ["enrichment-plan"] : []), ...(plan && existsSync(assetManifestPath) ? ["asset-manifest"] : [])];
    const inputs = inputKeys.map((key) => {
      const record = lifecycle?.artifacts[key];
      if (!record) throw coded("CONTRACT_INVALID", `render contract export requires current ${key}`);
      return artifactReference(record);
    });
    const recordedAt = new Date().toISOString();
    const contractRecord = recordJsonArtifact({
      project_path: projectPath,
      key: "render-contract",
      path: projectArtifacts.renderContract,
      role: "derived",
      schema_version: contract.schema_version,
      authored_by: "cli",
      command: "render-contract.export",
      mode: "produced",
      inputs,
      value: contract,
      recorded_at: recordedAt,
    });
    commitProjectStage({
      project_path: projectPath,
      stage: "render-contract.export",
      command: "render-contract.export",
      input_fingerprint: inputFingerprint(inputs),
      inputs,
      records: [contractRecord],
      started_at: startedAt,
      completed_at: recordedAt,
    });
    void frozenAssets;
    return { ok: true, command: "render-contract.export", data: { bundle_path: outputDir, contract_digest: contract.contract_digest, asset_count: contractAssets.length } };
  } catch (error) {
    if (staging) rmSync(staging, { recursive: true, force: true });
    if (publishedBundle) rmSync(outputDir, { recursive: true, force: true });
    if (wroteProjectContract) {
      if (previousProjectContract) writeFileSync(projectContractPath, previousProjectContract);
      else rmSync(projectContractPath, { force: true });
    }
    return failure("render-contract.export", error, "CONTRACT_INVALID");
  }
}

export function verifyRenderContractBundle(bundleDir: string): CommandResult<"render-contract.verify", { contract_digest: string; asset_count: number; runtime_compatible: boolean }> {
  try {
    const contract = readContract(bundleDir);
    verifyRenderAssets(bundleDir, contract.payload.assets);
    assertRuntimeCompatible(contract);
    return { ok: true, command: "render-contract.verify", data: { contract_digest: contract.contract_digest, asset_count: contract.payload.assets.length, runtime_compatible: true } };
  } catch (error) {
    return failure("render-contract.verify", error, "CONTRACT_INVALID");
  }
}

export function bindRenderContract(bundleDir: string, sourceMapPath: string, outputPath: string): CommandResult<"render-contract.bind", { binding_path: string; binding_digest: string }> {
  try {
    if (existsSync(outputPath)) throw coded("CONTRACT_INVALID", "binding output must not already exist");
    const contract = readContract(bundleDir);
    verifyRenderAssets(bundleDir, contract.payload.assets);
    assertRuntimeCompatible(contract);
    const sourceMap = parseSourceMapV1(readJson(sourceMapPath));
    const expected = new Set(contract.payload.sources.map((source) => source.source_id));
    const actual = Object.keys(sourceMap);
    const missing = [...expected].filter((sourceId) => !(sourceId in sourceMap));
    const unknown = actual.filter((sourceId) => !expected.has(sourceId));
    if (missing.length > 0) throw coded("SOURCE_BINDING_MISSING", `source binding is missing ${missing.join(",")}`);
    if (unknown.length > 0) throw coded("SOURCE_BINDING_UNKNOWN", `source binding contains unknown source ids: ${unknown.join(",")}`);
    const sources = contract.payload.sources.map((source) => {
      const path = sourceMap[source.source_id]!;
      const resolved = verifiedRegularFile(path, "SOURCE_BINDING_MISSING");
      const identity = probePortableSourceIdentity(resolved);
      assertSourceIdentity(source.identity, identity);
      return { source_id: source.source_id, resolved_path: resolved, verified_identity: identity as RenderSourceIdentityV1 };
    });
    const base = { schema_version: "1.0" as const, contract_digest: contract.contract_digest, sources };
    const binding: RenderBindingV1 = { ...base, binding_digest: renderBindingDigest(base) };
    writeJson(outputPath, binding);
    return { ok: true, command: "render-contract.bind", data: { binding_path: outputPath, binding_digest: binding.binding_digest } };
  } catch (error) {
    return failure("render-contract.bind", error, "SOURCE_IDENTITY_MISMATCH");
  }
}

export function renderBoundContract(bundleDir: string, bindingsPath: string, runDir: string): CommandResult<"render-contract.render", { result_path: string; output_path: string; contract_digest: string; binding_digest: string }> {
  let staging = "";
  try {
    if (existsSync(runDir)) throw coded("CONTRACT_RENDER_FAILED", "strict render output directory must not already exist");
    const contract = readContract(bundleDir);
    verifyRenderAssets(bundleDir, contract.payload.assets);
    assertRuntimeCompatible(contract);
    const binding = parseRenderBindingV1(readJson(bindingsPath));
    verifyRenderBinding(contract, binding);
    for (const bound of binding.sources) {
      const real = verifiedRegularFile(bound.resolved_path, "SOURCE_BINDING_MISSING");
      if (real !== bound.resolved_path) throw coded("SOURCE_IDENTITY_HASH_MISMATCH", "bound source realpath changed after binding");
      assertSourceIdentity(bound.verified_identity, probePortableSourceIdentity(real));
    }
    staging = `${runDir}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    mkdirSync(staging, { recursive: true });
    for (const asset of contract.payload.assets) {
      const target = join(staging, asset.bundle_path);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(join(bundleDir, asset.bundle_path), target);
    }
    const composition = contract.payload.composition as Record<string, unknown>;
    const plan = composition.mode === "resolved_storyboard" ? composition.enrichment_plan as EnrichmentPlanArtifact : undefined;
    const storyboard = composition.mode === "resolved_storyboard" ? composition.storyboard as EnrichmentStoryboard : undefined;
    const assets: AssetManifestArtifact = { assets: contract.payload.assets.map((asset) => ({ id: asset.asset_id, path: asset.bundle_path, type: asset.media_type as AssetManifestArtifact["assets"][number]["type"], source: "imported", provenance: "render-contract" })) };
    const output = contract.payload.output as Record<string, unknown>;
    const inspectionPolicy = contract.payload.inspection as Record<string, unknown>;
    const executed = executeResolvedRenderPlan({
      runRoot: staging,
      timeline: { contract_version: "2.0", entries: contract.payload.timeline.entries },
      sourcePaths: Object.fromEntries(binding.sources.map((source) => [source.source_id, source.resolved_path])),
      captions: contract.payload.captions.cues,
      output: { filename: text(output.canonical_filename, "output.canonical_filename"), width: integer(output.width, "output.width"), height: integer(output.height, "output.height"), fps: integer(output.fps, "output.fps") },
      sourceHasAudio: Object.fromEntries(contract.payload.sources.map((source) => [source.source_id, Boolean(source.identity.audio)])),
      durationToleranceSeconds: number(inspectionPolicy.duration_tolerance_seconds, "inspection.duration_tolerance_seconds"),
      plan,
      assets: plan ? assets : undefined,
      storyboard,
    });
    const outputIdentity = probePortableSourceIdentity(executed.outputPath);
    const result: StrictRenderResultV1 = {
      schema_version: "1.0",
      contract_digest: contract.contract_digest,
      binding_digest: binding.binding_digest,
      output: { output_path: basename(executed.outputPath), sha256: outputIdentity.sha256 as Sha256Digest, size_bytes: outputIdentity.size_bytes, duration_seconds: outputIdentity.duration_seconds, probe: json(outputIdentity) },
      renderer: liveRuntimeIdentity(),
      warnings: [],
      completed_at: new Date().toISOString(),
    };
    writeJson(join(staging, "render-contract-result.json"), result);
    fsRuntime.renameSync(staging, runDir);
    staging = "";
    return { ok: true, command: "render-contract.render", data: { result_path: join(runDir, "render-contract-result.json"), output_path: join(runDir, result.output.output_path), contract_digest: contract.contract_digest, binding_digest: binding.binding_digest } };
  } catch (error) {
    if (staging) rmSync(staging, { recursive: true, force: true });
    return failure("render-contract.render", error, "CONTRACT_RENDER_FAILED");
  }
}

export function inspectBoundContract(bundleDir: string, resultPath: string): CommandResult<"render-contract.inspect", { inspection_path: string; accepted: boolean; checks: StrictInspectionCheckV1[] }> {
  try {
    const contract = readContract(bundleDir);
    verifyRenderAssets(bundleDir, contract.payload.assets);
    assertRuntimeCompatible(contract);
    const result = parseStrictRenderResultV1(readJson(resultPath));
    if (result.contract_digest !== contract.contract_digest) throw coded("CONTRACT_DIGEST_MISMATCH", "strict result belongs to another contract");
    const outputPath = resolveContained(dirname(resultPath), result.output.output_path);
    const identity = probePortableSourceIdentity(outputPath);
    const timing = probeStrictOutputTiming(outputPath);
    const checks: StrictInspectionCheckV1[] = [];
    checks.push(check("output-hash", identity.sha256 === result.output.sha256, "canonical output sha256 matches strict result"));
    checks.push(check("output-size", identity.size_bytes === result.output.size_bytes, "canonical output byte size matches strict result"));
    const expected = number((contract.payload.preflight as Record<string, unknown>).expected_duration_seconds, "preflight.expected_duration_seconds");
    const inspectionPolicy = contract.payload.inspection as Record<string, unknown>;
    const outputSpec = contract.payload.output as Record<string, unknown>;
    const tolerance = number(inspectionPolicy.duration_tolerance_seconds, "inspection.duration_tolerance_seconds");
    const frameSchedule = contractFrameSchedule(contract);
    const durationDelta = Math.abs(timing.container_duration_seconds - expected);
    checks.push(check("video-frame-count", timing.video_frame_count === frameSchedule.total_frames, `video frame count: expected=${frameSchedule.total_frames} actual=${timing.video_frame_count}`));
    checks.push(check("duration", durationDelta <= tolerance, `${durationDelta <= tolerance ? "output duration matches contract" : "output duration mismatch"}: expected=${seconds(expected)}s actual=${seconds(timing.container_duration_seconds)}s delta=${seconds(durationDelta)}s tolerance=${seconds(tolerance)}s`));
    checks.push(check("video-stream", identity.video.width > 0 && identity.video.height > 0, "canonical output has a video stream"));
    checks.push(check("video-dimensions", identity.video.display_width === integer(outputSpec.width, "output.width") && identity.video.display_height === integer(outputSpec.height, "output.height"), "canonical output dimensions match the contract"));
    checks.push(check("video-codec", identity.video.codec_name === text(outputSpec.video_codec, "output.video_codec"), "canonical output video codec matches the contract"));
    checks.push(check("pixel-format", identity.video.pixel_format === text(outputSpec.pixel_format, "output.pixel_format"), "canonical output pixel format matches the contract"));
    checks.push(check("frame-rate", Math.abs(frameRate(identity.video.avg_frame_rate) - integer(outputSpec.fps, "output.fps")) <= 0.5, "canonical output average frame rate matches the contract within container tolerance"));
    if (inspectionPolicy.require_audio === true) {
      checks.push(check("audio-stream", Boolean(identity.audio), "canonical output has an audio stream"));
      checks.push(check("audio-codec", identity.audio?.codec_name === text(outputSpec.audio_codec, "output.audio_codec"), "canonical output audio codec matches the contract"));
      checks.push(check("audio-sample-rate", identity.audio?.sample_rate === integer(outputSpec.audio_sample_rate, "output.audio_sample_rate"), "canonical output audio sample rate matches the contract"));
      checks.push(check("audio-channels", identity.audio?.channels === integer(outputSpec.audio_channels, "output.audio_channels"), "canonical output audio channels match the contract"));
    }
    checks.push(...frozenAcceptanceChecks(inspectionPolicy.checks));
    const resultDigest = strictRenderResultDigest(result);
    const extracted = extractInspectionFrames(outputPath, dirname(resultPath), contract.contract_digest, resultDigest, inspectionPolicy.checks);
    if (extracted.requested > 0) checks.push(check("qa-frame-extraction", extracted.frames.length === extracted.requested, `extracted ${extracted.frames.length}/${extracted.requested} frozen QA frames`));
    const blockers = checks.filter((item) => item.status === "blocker").map((item) => item.id);
    const inspection: StrictInspectionV1 = {
      schema_version: "1.0",
      contract_digest: contract.contract_digest,
      binding_digest: result.binding_digest,
      render_result_digest: resultDigest,
      output_sha256: identity.sha256 as Sha256Digest,
      accepted: blockers.length === 0,
      checks,
      frames: extracted.frames,
      warnings: [],
      blockers,
      inspected_at: new Date().toISOString(),
    };
    const inspectionPath = join(dirname(resultPath), "render-contract-inspection.json");
    writeJson(inspectionPath, inspection);
    if (blockers.length > 0) return { ok: false, command: "render-contract.inspect", error: { code: "INSPECTION_ACCEPTANCE_FAILED", message: `strict inspection failed; structured result: ${inspectionPath}` } };
    return { ok: true, command: "render-contract.inspect", data: { inspection_path: inspectionPath, accepted: true, checks } };
  } catch (error) {
    return failure("render-contract.inspect", error, "RENDER_OUTPUT_INVALID");
  }
}

function readContract(bundleDir: string): RenderContractV1 {
  const root = verifiedDirectory(bundleDir);
  const contractPath = resolveContained(root, "render-contract.json");
  const value = readJson(contractPath);
  if (value && typeof value === "object" && "schema_version" in value && (value as { schema_version?: unknown }).schema_version !== "1.0") {
    throw coded("CONTRACT_SCHEMA_UNSUPPORTED", `unsupported render contract schema: ${String((value as { schema_version?: unknown }).schema_version)}`);
  }
  const contract = parseRenderContractV1(value);
  contractFrameSchedule(contract);
  return contract;
}

function contractFrameSchedule(contract: RenderContractV1): OutputFrameSchedule {
  const output = contract.payload.output as Record<string, unknown>;
  const preflight = contract.payload.preflight as Record<string, unknown>;
  const schedule = compileOutputFrameSchedule(contract.payload.timeline.entries, integer(output.fps, "output.fps"));
  const expected = number(preflight.expected_duration_seconds, "preflight.expected_duration_seconds");
  if (Math.abs(expected - schedule.expected_duration_seconds) > 1e-9) {
    throw coded("CONTRACT_INVALID", `preflight.expected_duration_seconds must equal the frame-domain duration ${schedule.expected_duration_seconds}`);
  }
  return schedule;
}

function liveRuntimeIdentity(): JsonObject {
  const delivery = verifyInstalledDelivery();
  const resources = computeRendererResourcesDigest({ root: resolveHyperframesRoot() }).digest;
  return json({
    cli_version: cliVersion(),
    delivery_manifest_schema_version: delivery.schema_version,
    delivery_digest: delivery.delivery_digest,
    artifact_contracts_digest: delivery.artifact_contracts_digest,
    runtime_compatibility_digest: delivery.runtime_compatibility_digest,
    renderer_resources_digest: resources,
    required_capability_ids: [...CAPABILITY_IDS],
    hyperframes_version: "0.7.36",
    gsap_version: "3.15.0",
  });
}

function assertRuntimeCompatible(contract: RenderContractV1): void {
  const delivery = verifyInstalledDelivery();
  const expected = liveRuntimeIdentity();
  const actual = contract.payload.runtime as Record<string, unknown>;
  if (actual.runtime_compatibility_digest !== expected.runtime_compatibility_digest) throw coded("CONTRACT_RUNTIME_MISMATCH", "runtime compatibility digest does not match installed Koubo Clip delivery");
  if (actual.renderer_resources_digest !== expected.renderer_resources_digest) throw coded("CONTRACT_RUNTIME_MISMATCH", "renderer resources digest does not match installed Koubo Clip delivery");
  const required = Array.isArray(actual.required_capability_ids) ? actual.required_capability_ids : [];
  if (required.some((capability) => typeof capability !== "string" || !delivery.capability_ids.includes(capability))) throw coded("CONTRACT_CAPABILITY_MISSING", "contract requires an unavailable capability");
  if (actual.hyperframes_version !== "0.7.36" || actual.gsap_version !== "3.15.0") throw coded("CONTRACT_RUNTIME_MISMATCH", "contract runtime dependency versions do not match");
}

function stageReferencedAssets(projectPath: string, plan: EnrichmentPlanArtifact | undefined, assets: AssetManifestArtifact, staging: string): { contractAssets: RenderContractAssetV1[]; frozenAssets: AssetManifestArtifact; bundlePaths: Record<string, string> } {
  const refs = plan ? referencedAssetIds(plan) : new Set<string>();
  const byId = new Map(assets.assets.map((asset) => [asset.id, asset]));
  const contractAssets: RenderContractAssetV1[] = [];
  const frozen: AssetManifestArtifact["assets"] = [];
  const bundlePaths: Record<string, string> = {};
  for (const id of [...refs].sort()) {
    const asset = byId.get(id);
    if (!asset) throw coded("CONTRACT_INVALID", `referenced asset ${id} is missing from asset-manifest.json`);
    const path = resolveProjectFile(projectPath, asset.path);
    const bytes = readFileSync(path);
    const sha256 = sha256Digest(bytes);
    const extension = safeExtension(extname(asset.path));
    const bundlePath = `assets/${sha256.slice("sha256:".length)}.${extension}`;
    copyFileSync(path, join(staging, bundlePath));
    contractAssets.push({ asset_id: id, bundle_path: bundlePath, sha256, size_bytes: bytes.byteLength, ...(asset.type ? { media_type: asset.type } : {}) });
    frozen.push({ ...asset, path: bundlePath });
    bundlePaths[id] = bundlePath;
  }
  return { contractAssets, frozenAssets: { assets: frozen }, bundlePaths };
}

function referencedAssetIds(plan: EnrichmentPlanArtifact): Set<string> {
  return new Set([
    ...plan.audio.music.map((item) => item.asset_id),
    ...plan.audio.sfx.flatMap((item) => item.asset_id ? [item.asset_id] : []),
    ...plan.elements.flatMap((item) => item.asset_id ? [item.asset_id] : []),
  ]);
}

function compileCaptionCues(segments: Array<{ source_id: string; start: number; end: number; text: string }>, edl: EdlArtifact): Array<{ start: number; end: number; text: string }> {
  const cues: Array<{ start: number; end: number; text: string }> = [];
  let cursor = 0;
  for (const entry of [...edl.entries].sort((a, b) => a.output_order - b.output_order)) {
    for (const segment of segments.filter((item) => item.source_id === entry.source_id && item.start >= entry.start && item.end <= entry.end)) {
      cues.push({ start: cursor + segment.start - entry.start, end: cursor + segment.end - entry.start, text: segment.text });
    }
    cursor += entry.end - entry.start;
  }
  return cues;
}

function resolveOutputSpec(aspect: string, sourceWidth: number, sourceHeight: number): { width: number; height: number } {
  if (aspect === "16:9") return { width: 1920, height: 1080 };
  if (aspect === "9:16") return { width: 1080, height: 1920 };
  if (aspect === "4:5") return { width: 1080, height: 1350 };
  return { width: sourceWidth, height: sourceHeight };
}

function assertSourceIdentity(expected: RenderSourceIdentityV1 | ReturnType<typeof probePortableSourceIdentity>, actual: ReturnType<typeof probePortableSourceIdentity>): void {
  if (expected.sha256 !== actual.sha256 || expected.size_bytes !== actual.size_bytes) throw coded("SOURCE_IDENTITY_HASH_MISMATCH", "source hash or byte size does not match contract");
  const videoMatches = expected.video.codec_name === actual.video.codec_name && expected.video.width === actual.video.width && expected.video.height === actual.video.height && expected.video.display_width === actual.video.display_width && expected.video.display_height === actual.video.display_height && expected.video.rotation === actual.video.rotation;
  const audioMatches = Boolean(expected.audio) === Boolean(actual.audio) && (!expected.audio || !actual.audio || (expected.audio.sample_rate === actual.audio.sample_rate && expected.audio.channels === actual.audio.channels));
  if (Math.abs(expected.duration_seconds - actual.duration_seconds) > 0.05 || !videoMatches || !audioMatches) throw coded("SOURCE_IDENTITY_PROBE_MISMATCH", "source probe identity does not match contract");
}

function authoringLineage(projectPath: string, paths: string[]): Array<{ path: string; sha256: string }> {
  return paths.map((path) => ({ path, sha256: sha256Digest(readFileSync(resolveProjectFile(projectPath, path))) }));
}

function resolveProjectFile(rootPath: string, projectRelativePath: string): string {
  if (projectRelativePath.includes("\\") || projectRelativePath.split("/").includes("..") || projectRelativePath.startsWith("/") || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(projectRelativePath)) throw coded("UNSAFE_CONTRACT_PATH", "project asset path is unsafe");
  return resolveContained(rootPath, projectRelativePath);
}

function resolveContained(rootPath: string, relativePath: string): string {
  const root = fsRuntime.realpathSync(rootPath);
  const target = fsRuntime.realpathSync(resolve(root, relativePath));
  const fromRoot = relative(root, target);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || fromRoot.startsWith("../") || resolve(fromRoot) === fromRoot) throw coded("UNSAFE_CONTRACT_PATH", "contract path escapes its authorized root");
  if (!statSync(target).isFile()) throw coded("UNSAFE_CONTRACT_PATH", "contract member must be a regular file");
  return target;
}

function verifiedRegularFile(path: string, code: string): string {
  if (!existsSync(path) || fsRuntime.lstatSync(path).isSymbolicLink() || !statSync(path).isFile()) throw coded(code, "source binding must name a readable regular file");
  return fsRuntime.realpathSync(path);
}

function verifiedDirectory(path: string): string {
  if (!existsSync(path) || fsRuntime.lstatSync(path).isSymbolicLink() || !statSync(path).isDirectory()) throw coded("CONTRACT_INVALID", "render contract bundle must be a regular directory");
  return fsRuntime.realpathSync(path);
}

function check(id: string, passed: boolean, message: string): StrictInspectionCheckV1 {
  return { id, status: passed ? "passed" : "blocker", message };
}

function frameRate(value: string): number {
  const [numerator, denominator = "1"] = value.split("/");
  const parsed = Number(numerator) / Number(denominator);
  return Number.isFinite(parsed) ? parsed : 0;
}

function frozenAcceptanceChecks(value: unknown): StrictInspectionCheckV1[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry, index) => {
    const record = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    const status = record.status === "blocker" ? "blocker" : record.status === "warning" || record.needs_human_review === true ? "warning" : "passed";
    return { id: `frozen-qa-${safeId(String(record.id ?? index))}`, status, message: String(record.expected ?? "frozen authoring QA condition") };
  });
}

function extractInspectionFrames(outputPath: string, runDir: string, contractDigest: string, resultDigest: string, value: unknown): { requested: number; frames: string[] } {
  if (!Array.isArray(value)) return { requested: 0, frames: [] };
  const requests: Array<{ id: string; time: number }> = [];
  for (const [index, entry] of value.entries()) {
    const record = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    if (!Array.isArray(record.frame_times)) continue;
    for (const [frameIndex, time] of record.frame_times.entries()) {
      if (typeof time === "number" && Number.isFinite(time) && time >= 0) requests.push({ id: `${safeId(String(record.id ?? index))}-${frameIndex + 1}`, time });
      if (requests.length >= 200) break;
    }
    if (requests.length >= 200) break;
  }
  if (requests.length === 0) return { requested: 0, frames: [] };
  const namespace = `${contractDigest.slice(7, 19)}-${resultDigest.slice(7, 19)}`;
  const relativeRoot = join("render-contract-inspection-frames", namespace);
  const root = resolveContained(runDir, relativeRoot);
  mkdirSync(root, { recursive: true });
  const frames: string[] = [];
  for (const request of requests) {
    const relativePath = join(relativeRoot, `${request.id}.jpg`);
    const target = resolveContained(runDir, relativePath);
    const rendered = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-ss", request.time.toFixed(6), "-i", outputPath, "-frames:v", "1", target], { encoding: "utf8" });
    if (rendered.status === 0 && existsSync(target) && statSync(target).isFile()) frames.push(relativePath.replaceAll("\\", "/"));
  }
  return { requested: requests.length, frames };
}

function safeId(value: string): string {
  const normalized = value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || "check";
}

function seconds(value: number): string {
  return value.toFixed(6);
}

function safeExtension(value: string): string {
  const ext = value.replace(/^\./, "").toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,15}$/.test(ext) ? ext : "asset";
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function json(value: unknown): JsonObject {
  return JSON.parse(canonicalJson(value)) as JsonObject;
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw coded("CONTRACT_INVALID", `${field} must be a non-empty string`);
  return value;
}

function integer(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw coded("CONTRACT_INVALID", `${field} must be a positive integer`);
  return value;
}

function number(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw coded("CONTRACT_INVALID", `${field} must be a finite number`);
  return value;
}

function coded(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function failure<T extends string>(command: T, error: unknown, fallback: string): { ok: false; command: T; error: { code: string; message: string } } {
  const internalCode = renderContractErrorCode(error) ?? (error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string" ? String((error as { code: string }).code) : fallback);
  const code = publicErrorCode(internalCode);
  return { ok: false, command, error: { code, message: error instanceof Error ? error.message : String(error) } };
}

function publicErrorCode(code: string): string {
  switch (code) {
    case "RENDER_CONTRACT_DIGEST_MISMATCH":
    case "RENDER_BINDING_CONTRACT_MISMATCH":
      return "CONTRACT_DIGEST_MISMATCH";
    case "RENDER_ASSET_PATH_INVALID":
      return "UNSAFE_CONTRACT_PATH";
    case "RENDER_ASSET_MISSING":
    case "RENDER_ASSET_NOT_FILE":
    case "RENDER_ASSET_SIZE_MISMATCH":
    case "RENDER_ASSET_DIGEST_MISMATCH":
      return "CONTRACT_ASSET_HASH_MISMATCH";
    case "RENDER_CONTRACT_INVALID_JSON_VALUE":
    case "RENDER_CONTRACT_INVALID":
    case "RENDER_CONTRACT_DIGEST_INVALID":
    case "RENDER_BINDING_INVALID":
    case "RENDER_BINDING_DIGEST_INVALID":
    case "RENDER_BINDING_DIGEST_MISMATCH":
    case "RENDER_BINDING_SOURCE_MISMATCH":
    case "RENDER_SOURCE_MAP_INVALID":
      return "CONTRACT_INVALID";
    default:
      return code;
  }
}
