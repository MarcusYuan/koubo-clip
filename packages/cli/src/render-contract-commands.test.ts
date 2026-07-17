import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createProject, exploreProject, probePortableSourceIdentity, probeStrictOutputTiming } from "./project";
import { bindRenderContract, exportRenderContract, inspectBoundContract, renderBoundContract, verifyRenderContractBundle } from "./render-contract-commands";
import { compileOutputFrameSchedule, createRenderContractV1, type RenderContractV1 } from "./render-contract";
import { confirmProposalAndWriteEditPlan } from "./test-fixtures";

test("strict render contract binds source and renders without authoring artifacts", async () => {
    if (spawnSync("ffmpeg", ["-version"]).status !== 0) return;
    const root = mkdtempSync(join(tmpdir(), "koubo-contract-e2e-"));
    const source = join(root, "raw.mp4");
    const project = join(root, "authoring");
    makeVideo(source, 1.2);
    expect(createProject([source], { projectPath: project }).ok).toBe(true);
    writeFileSync(join(project, "transcript.json"), JSON.stringify({
      timing_granularity: "segment",
      segments: [{ source_id: "src-001", start: 0.1, end: 1.0, text: "contract caption" }],
    }));
    expect((await exploreProject(project, { asr: "external" })).ok).toBe(true);
    confirmProposalAndWriteEditPlan(project);

    const bundle = join(root, "bundle");
    const exported = exportRenderContract(project, bundle);
    expect(exported.ok).toBe(true);
    writeFileSync(join(bundle, "transcript.json"), JSON.stringify({ segments: [{ text: "must be ignored" }] }));
    writeFileSync(join(bundle, "edit-plan.json"), JSON.stringify({ decisions: [{ action: "cut", source_id: "src-001" }] }));
    writeFileSync(join(bundle, "enrichment-plan.json"), JSON.stringify({ version: "conflict" }));
    expect(verifyRenderContractBundle(bundle).ok).toBe(true);

    const sourceMap = join(root, "source-map.json");
    const bindings = join(root, "bindings.json");
    writeFileSync(sourceMap, JSON.stringify({ "src-001": source }));
    const bound = bindRenderContract(bundle, sourceMap, bindings);
    expect(bound.ok).toBe(true);

    const run = join(root, "strict-run");
    const rendered = renderBoundContract(bundle, bindings, run);
    expect(rendered.ok).toBe(true);
    if (!rendered.ok) throw new Error(rendered.error.message);
    const result = JSON.parse(readFileSync(rendered.data.result_path, "utf8")) as { contract_digest: string; output: { output_path: string } };
    expect(result.contract_digest).toBe(exported.ok ? exported.data.contract_digest : "");
    expect(result.output.output_path).toBe("koubo-final.mp4");
    const inspected = inspectBoundContract(bundle, rendered.data.result_path);
    expect(inspected.ok).toBe(true);
    const outputPath = join(run, result.output.output_path);
    const outputBytes = readFileSync(outputPath);
    const tamperedBytes = new Uint8Array(outputBytes.byteLength + 1);
    tamperedBytes.set(outputBytes);
    writeFileSync(outputPath, tamperedBytes);
    const rejected = inspectBoundContract(bundle, rendered.data.result_path);
    expect(rejected.ok).toBe(false);
    if (rejected.ok) throw new Error("expected tampered output rejection");
    expect(rejected.error.code).toBe("INSPECTION_ACCEPTANCE_FAILED");
    const inspection = JSON.parse(readFileSync(join(run, "render-contract-inspection.json"), "utf8")) as { accepted: boolean; blockers: string[] };
    expect(inspection.accepted).toBe(false);
    expect(inspection.blockers).toContain("output-hash");
  });

test("strict render contract fails closed after source replacement", async () => {
    if (spawnSync("ffmpeg", ["-version"]).status !== 0) return;
    const root = mkdtempSync(join(tmpdir(), "koubo-contract-tamper-"));
    const source = join(root, "raw.mp4");
    const project = join(root, "authoring");
    makeVideo(source, 1);
    createProject([source], { projectPath: project });
    writeFileSync(join(project, "transcript.json"), JSON.stringify({ timing_granularity: "segment", segments: [{ source_id: "src-001", start: 0, end: 0.8, text: "hello" }] }));
    await exploreProject(project, { asr: "external" });
    confirmProposalAndWriteEditPlan(project);
    const bundle = join(root, "bundle");
    expect(exportRenderContract(project, bundle).ok).toBe(true);
    const sourceMap = join(root, "source-map.json");
    const bindings = join(root, "bindings.json");
    writeFileSync(sourceMap, JSON.stringify({ "src-001": source }));
    expect(bindRenderContract(bundle, sourceMap, bindings).ok).toBe(true);
    makeVideo(source, 1.4);
    const result = renderBoundContract(bundle, bindings, join(root, "run"));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected source mismatch");
    expect(["SOURCE_IDENTITY_HASH_MISMATCH", "SOURCE_IDENTITY_PROBE_MISMATCH"]).toContain(result.error.code);
  });

test("strict consumer rejects a continuous-seconds duration that disagrees with the frame schedule", async () => {
  if (spawnSync("ffmpeg", ["-version"]).status !== 0) return;
  const root = mkdtempSync(join(tmpdir(), "koubo-contract-duration-contract-"));
  const source = join(root, "raw.mp4");
  const project = join(root, "project");
  makeVideo(source, 1.2);
  expect(createProject([source], { projectPath: project }).ok).toBe(true);
  writeFileSync(join(project, "transcript.json"), JSON.stringify({ timing_granularity: "segment", segments: [{ source_id: "src-001", start: 0, end: 1, text: "duration" }] }));
  expect((await exploreProject(project, { asr: "external" })).ok).toBe(true);
  confirmProposalAndWriteEditPlan(project);
  const bundle = join(root, "bundle");
  expect(exportRenderContract(project, bundle).ok).toBe(true);
  const contractPath = join(bundle, "render-contract.json");
  const contract = JSON.parse(readFileSync(contractPath, "utf8")) as RenderContractV1;
  const rawDuration = contract.payload.timeline.entries.reduce((sum, entry) => sum + entry.end - entry.start, 0);
  expect(contract.payload.preflight.expected_duration_seconds === rawDuration).toBe(false);
  contract.payload.preflight.expected_duration_seconds = rawDuration;
  writeFileSync(contractPath, `${JSON.stringify(createRenderContractV1(contract.payload), null, 2)}\n`);
  const verified = verifyRenderContractBundle(bundle);
  expect(verified.ok).toBe(false);
  if (verified.ok) throw new Error("expected duration contract rejection");
  expect(verified.error.code).toBe("CONTRACT_INVALID");
});

test("strict render contract normalizes different multi-source media before concat", async () => {
  if (spawnSync("ffmpeg", ["-version"]).status !== 0) return;
  const root = mkdtempSync(join(tmpdir(), "koubo-contract-multi-"));
  const first = join(root, "landscape.mp4");
  const second = join(root, "square.mp4");
  makeVideo(first, 1);
  const secondResult = spawnSync("ffmpeg", [
    "-y", "-f", "lavfi", "-i", "testsrc=size=120x120:rate=15",
    "-t", "1", "-pix_fmt", "yuv420p", second,
  ], { encoding: "utf8" });
  if (secondResult.status !== 0) throw new Error(secondResult.stderr || secondResult.stdout);
  const project = join(root, "project");
  expect(createProject([first, second], { projectPath: project }).ok).toBe(true);
  writeFileSync(join(project, "transcript.json"), JSON.stringify({ timing_granularity: "segment", segments: [
    { source_id: "src-001", start: 0.05, end: 0.8, text: "first" },
    { source_id: "src-002", start: 0.05, end: 0.8, text: "second" },
  ] }));
  expect((await exploreProject(project, { asr: "external" })).ok).toBe(true);
  confirmProposalAndWriteEditPlan(project, [], ["src-001", "src-002"]);
  const bundle = join(root, "bundle");
  expect(exportRenderContract(project, bundle).ok).toBe(true);
  const sourceMap = join(root, "source-map.json");
  const bindings = join(root, "bindings.json");
  writeFileSync(sourceMap, JSON.stringify({ "src-001": first, "src-002": second }));
  expect(bindRenderContract(bundle, sourceMap, bindings).ok).toBe(true);
  const rendered = renderBoundContract(bundle, bindings, join(root, "run"));
  expect(rendered.ok).toBe(true);
  if (!rendered.ok) throw new Error(rendered.error.message);
  expect(inspectBoundContract(bundle, rendered.data.result_path).ok).toBe(true);
});

test("strict render keeps nine non-integral segments on the contract frame timeline", async () => {
  if (spawnSync("ffmpeg", ["-version"]).status !== 0) return;
  const root = mkdtempSync(join(tmpdir(), "koubo-contract-timing-"));
  const source = join(root, "raw.mp4");
  const project = join(root, "project");
  makeVideo(source, 10);
  expect(createProject([source], { projectPath: project }).ok).toBe(true);
  writeFileSync(join(project, "transcript.json"), JSON.stringify({ timing_granularity: "segment", segments: [{ source_id: "src-001", start: 0, end: 9, text: "timing" }] }));
  expect((await exploreProject(project, { asr: "external" })).ok).toBe(true);
  confirmProposalAndWriteEditPlan(project);
  const bundle = join(root, "bundle");
  expect(exportRenderContract(project, bundle).ok).toBe(true);

  const contractPath = join(bundle, "render-contract.json");
  const original = JSON.parse(readFileSync(contractPath, "utf8")) as RenderContractV1;
  const durations = [0.95, 0.72, 1.18, 0.85, 0.98, 0.74, 1.21, 0.81, 0.726667];
  let sourceCursor = 0;
  let outputCursor = 0;
  const entries = durations.map((duration, output_order) => {
    const entry = { source_id: "src-001", start: sourceCursor, end: sourceCursor + duration, output_start: outputCursor, output_end: outputCursor + duration, output_order, reason: "keep" };
    sourceCursor += duration + 0.1;
    outputCursor += duration;
    return entry;
  });
  const schedule = compileOutputFrameSchedule(entries, 30);
  original.payload.timeline = { entries };
  original.payload.captions = { cues: [] };
  original.payload.preflight.expected_duration_seconds = schedule.expected_duration_seconds;
  writeFileSync(contractPath, `${JSON.stringify(createRenderContractV1(original.payload), null, 2)}\n`);

  const sourceMap = join(root, "source-map.json");
  const bindings = join(root, "bindings.json");
  writeFileSync(sourceMap, JSON.stringify({ "src-001": source }));
  expect(bindRenderContract(bundle, sourceMap, bindings).ok).toBe(true);
  const rendered = renderBoundContract(bundle, bindings, join(root, "run"));
  expect(rendered.ok).toBe(true);
  if (!rendered.ok) throw new Error(rendered.error.message);
  const timing = probeStrictOutputTiming(rendered.data.output_path);
  expect(timing.video_frame_count).toBe(245);
  expect(timing.avg_frame_rate).toBe("30/1");
  expect(inspectBoundContract(bundle, rendered.data.result_path).ok).toBe(true);

  makeVideo(rendered.data.output_path, 9.2);
  const identity = probePortableSourceIdentity(rendered.data.output_path);
  const result = JSON.parse(readFileSync(rendered.data.result_path, "utf8")) as { output: Record<string, unknown> };
  result.output = { ...result.output, sha256: identity.sha256, size_bytes: identity.size_bytes, duration_seconds: identity.duration_seconds, probe: identity };
  writeFileSync(rendered.data.result_path, `${JSON.stringify(result, null, 2)}\n`);
  const rejected = inspectBoundContract(bundle, rendered.data.result_path);
  expect(rejected.ok).toBe(false);
  const inspection = JSON.parse(readFileSync(join(root, "run", "render-contract-inspection.json"), "utf8")) as { blockers: string[]; checks: Array<{ id: string; message: string }> };
  expect(inspection.blockers).toContain("video-frame-count");
  expect(inspection.blockers).toContain("duration");
  const durationMessage = inspection.checks.find((check) => check.id === "duration")?.message ?? "";
  expect(durationMessage).toContain("output duration mismatch");
  for (const field of ["expected=", "actual=", "delta=", "tolerance="]) expect(durationMessage).toContain(field);
});

function makeVideo(path: string, duration: number): void {
  const result = spawnSync("ffmpeg", [
    "-y", "-f", "lavfi", "-i", "testsrc=size=160x90:rate=10",
    "-f", "lavfi", "-i", `sine=frequency=440:duration=${duration}`,
    "-t", String(duration), "-pix_fmt", "yuv420p", path,
  ], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
}
