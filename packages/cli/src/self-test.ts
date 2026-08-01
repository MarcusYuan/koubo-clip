import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { productionProposalExample } from "./artifact-contracts";
import { parseSourcesManifest, type ProductionProposalArtifact } from "./artifacts";
import { assertManagedRuntimeForBox, resolveManagedRuntimeTool } from "./managed-runtime";
import { bindRenderContract, exportRenderContract, inspectBoundContract, renderBoundContract, verifyRenderContractBundle } from "./render-contract-commands";
import { createProject, exploreProject, proposalProject, reviewProject } from "./project";

export async function runSelfTest() {
  assertManagedRuntimeForBox();
  const root = mkdtempSync(join(tmpdir(), "koubo-clip-self-test-"));
  try {
    const source = join(root, "source.mp4");
    makeTinyVideo(source);
    const project = join(root, "project");
    const created = createProject([source], { projectPath: project, providerMode: "standalone" });
    if (!created.ok) throw resultError(created);

    writeFileSync(join(project, "transcript.json"), JSON.stringify({
      timing_granularity: "segment",
      segments: [{ source_id: "src-001", start: 0.1, end: 0.9, text: "koubo clip self test" }],
    }));
    const explored = await exploreProject(project, { asr: "external", providerMode: "standalone" });
    if (!explored.ok) throw resultError(explored);

    writeConfirmedArtifacts(project);
    const compiled = exportRenderContract(project, join(root, "bundle"));
    if (!compiled.ok) throw resultError(compiled);
    const verified = verifyRenderContractBundle(join(root, "bundle"));
    if (!verified.ok) throw resultError(verified);

    const sourceMap = join(root, "source-map.json");
    writeFileSync(sourceMap, JSON.stringify({ "src-001": source }));
    const bound = bindRenderContract(join(root, "bundle"), sourceMap, join(root, "bindings.json"));
    if (!bound.ok) throw resultError(bound);
    const rendered = renderBoundContract(join(root, "bundle"), join(root, "bindings.json"), join(root, "run"));
    if (!rendered.ok) throw resultError(rendered);
    const inspected = inspectBoundContract(join(root, "bundle"), rendered.data.result_path);
    if (!inspected.ok) throw resultError(inspected);

    return {
      id: "koubo-clip",
      status: "passed" as const,
      smoke: "render-contract-minimal",
      steps: ["project.create", "project.explore.external", "project.review", "project.proposal", "render-contract.verify", "render-contract.bind", "render-contract.render", "render-contract.inspect"],
      output_size_bytes: readFileSync(rendered.data.output_path).byteLength,
      inspection: {
        accepted: inspected.data.accepted,
        overall_status: inspected.data.overall_status,
        checks: inspected.data.checks.length,
      },
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function writeConfirmedArtifacts(project: string): void {
  const reviewed = reviewProject(project);
  if (!reviewed.ok) throw resultError(reviewed);
  const proposal = structuredClone(productionProposalExample) as ProductionProposalArtifact;
  const sources = parseSourcesManifest(JSON.parse(readFileSync(join(project, "sources.json"), "utf8")));
  const duration = sources.sources[0]?.duration_seconds ?? 1;
  proposal.options.forEach((option) => {
    option.cleanup.cut_candidate_ids = [];
    option.edit_execution_plan.duration_target = {
      min_seconds: Math.max(0, duration - 2 / 30),
      max_seconds: duration + 2 / 30,
      target_seconds: duration,
      tolerance_frames: 2,
    };
    option.edit_execution_plan.timeline = {
      mode: "explicit_segments",
      segments: [{ id: "self-test-full-source", source_id: "src-001", start: 0, end: duration, reason: "Self-test keeps the full tiny source." }],
    };
    option.subtitles = { ...option.subtitles, enabled: false, style: "none" };
  });
  writeFileSync(join(project, "production-proposal.json"), JSON.stringify(proposal));
  const proposed = proposalProject(project);
  if (!proposed.ok) throw resultError(proposed);
  const optionId = proposal.recommended_option_id;
  writeFileSync(join(project, "edit-plan.json"), JSON.stringify({
    contract_version: "1.0",
    confirmed_option_id: optionId,
    proposal_selection_fingerprint: proposed.data.option_selection_fingerprints[optionId],
    decisions: [],
  }));
}

function makeTinyVideo(path: string): void {
  const result = spawnSync(resolveManagedRuntimeTool("ffmpeg"), [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc=size=160x90:rate=30",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=1",
    "-t",
    "1",
    "-pix_fmt",
    "yuv420p",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-c:a",
    "aac",
    path,
  ], { encoding: "utf8" });
  if (result.status !== 0) throw coded("SELF_TEST_SOURCE_GENERATION_FAILED", result.stderr || result.stdout || "failed to generate self-test source");
}

function coded(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

function resultError(result: { error?: { code: string; message: string } }): Error {
  return coded(result.error?.code ?? "SELF_TEST_FAILED", result.error?.message ?? "self-test command failed");
}
