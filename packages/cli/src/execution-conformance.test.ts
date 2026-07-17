import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { productionProposalExample } from "./artifact-contracts";
import { fileBytesFingerprint, semanticJsonFingerprint } from "./artifact-lifecycle";
import type { EdlArtifact, ProductionProposalArtifact } from "./artifacts";
import { compileEdlProject, createProject, enrichPlanProject, exploreProject, proposalProject, reviewProject } from "./project";
import { projectStatus } from "./project-status";

const CUT_CANDIDATE_ID = "c-002-filler";

test("compile-edl rejects an edit plan that omits the selected proposal cleanup cut", async () => {
  const project = await projectWithConfirmedCleanupProposal();
  writeEditPlan(project, []);

  const compiled = compileEdlProject(project);

  expect(compiled.ok).toBe(false);
  if (!compiled.ok) expect(compiled.error.message).toContain(CUT_CANDIDATE_ID);
});

test("compile-edl accepts an edit plan that cuts the selected proposal cleanup candidate", async () => {
  const project = await projectWithConfirmedCleanupProposal();
  writeEditPlan(project, [{ action: "cut", candidate_id: CUT_CANDIDATE_ID, reason: "confirmed cleanup" }]);

  const compiled = compileEdlProject(project);

  expect(compiled.ok).toBe(true);
  if (!compiled.ok) throw new Error(compiled.error.message);
  const edl = JSON.parse(readFileSync(join(project, "edl.json"), "utf8")) as EdlArtifact;
  expect(edl.entries.some((entry) => entry.start < 1.2 && entry.end > 1.2)).toBe(false);
});

test("compile-edl keeps a confirmed selected option valid when an unselected proposal option changes", async () => {
  const project = await projectWithConfirmedCleanupProposal();
  writeEditPlan(project, [{ action: "cut", candidate_id: CUT_CANDIDATE_ID, reason: "confirmed cleanup" }]);
  const proposalPath = join(project, "production-proposal.json");
  const proposal = JSON.parse(readFileSync(proposalPath, "utf8")) as ProductionProposalArtifact;
  proposal.options[1]!.reason = "Unselected option changed after selected option was already confirmed.";
  proposal.options[1]!.cleanup.cut_candidate_ids = [];
  writeFileSync(proposalPath, JSON.stringify(proposal));
  const proposed = proposalProject(project);
  if (!proposed.ok) throw new Error(proposed.error.message);

  const compiled = compileEdlProject(project);

  expect(compiled.ok).toBe(true);
});

test("enrich-plan rejects SFX when the selected proposal disables SFX", async () => {
  const project = await projectWithConfirmedCleanupProposal();
  writeEditPlan(project, [{ action: "cut", candidate_id: CUT_CANDIDATE_ID, reason: "confirmed cleanup" }]);
  const compiled = compileEdlProject(project);
  if (!compiled.ok) throw new Error(compiled.error.message);
  writeFileSync(join(project, "enrichment-plan.json"), JSON.stringify({
    version: "2.0",
    profile: { source_mode: "talking_head_avatar", aspect_ratio: "source", caption_identity: "anchor", layout: "overlay", style: "minimal", frame: "clean" },
    elements: [],
    audio: {
      music: [],
      sfx: [{ id: "click", sfx_id: "click", start: 0.2, end: 0.3, volume: 0.15, fade_seconds: 0, reason: "button click cue" }],
    },
  }));

  const enriched = enrichPlanProject(project);

  expect(enriched.ok).toBe(false);
});

test("compile-edl deterministically realizes a confirmed same-source reordered timeline", async () => {
  const project = await projectWithConfirmedCleanupProposal();
  const proposal = explicitProposal();
  writeFileSync(join(project, "production-proposal.json"), JSON.stringify(proposal));
  const proposed = proposalProject(project);
  if (!proposed.ok) throw new Error(proposed.error.message);
  writeFileSync(join(project, "edit-plan.json"), JSON.stringify({
    contract_version: "1.0",
    confirmed_option_id: "strong-hook",
    proposal_selection_fingerprint: proposed.data.option_selection_fingerprints["strong-hook"],
    decisions: [],
  }));

  const compiled = compileEdlProject(project);

  if (!compiled.ok) throw new Error(compiled.error.message);
  const edl = JSON.parse(readFileSync(join(project, "edl.json"), "utf8")) as EdlArtifact;
  expect(edl.entries.map(({ source_id, start, end, output_order, label }) => ({ source_id, start, end, output_order, label }))).toEqual([
    { source_id: "src-001", start: 1.5, end: 2.5, output_order: 0, label: "payoff" },
    { source_id: "src-001", start: 0.1, end: 0.8, output_order: 1, label: "setup" },
  ]);
  const status = projectStatus(project);
  expect(status.acceptance.authoring_status).toBe("complete");
  expect(status.acceptance.proposal_conformance_status).toBe("passed");
  expect(status.acceptance.proposal_conformance?.actual_frame_count).toBe(51);
  expect(status.render_contract?.export_ready).toBe(true);
});

test("compile-edl blocks a confirmed timeline that cannot satisfy its business duration target", async () => {
  const project = await projectWithConfirmedCleanupProposal();
  const proposal = explicitProposal();
  proposal.options[0]!.edit_execution_plan.duration_target = {
    min_seconds: 0.4,
    max_seconds: 0.6,
    target_seconds: 0.5,
    tolerance_frames: 2,
  };
  writeFileSync(join(project, "production-proposal.json"), JSON.stringify(proposal));
  const proposed = proposalProject(project);
  if (!proposed.ok) throw new Error(proposed.error.message);
  writeFileSync(join(project, "edit-plan.json"), JSON.stringify({
    contract_version: "1.0",
    confirmed_option_id: "strong-hook",
    proposal_selection_fingerprint: proposed.data.option_selection_fingerprints["strong-hook"],
    decisions: [],
  }));

  const compiled = compileEdlProject(project);

  expect(compiled.ok).toBe(false);
  if (!compiled.ok) {
    expect(compiled.error.code).toBe("PROPOSAL_EXECUTION_MISMATCH");
    expect(compiled.error.message).toContain("target-duration");
    expect(compiled.error.message).toContain("actual=1.700s");
  }
});

test("compile-edl revalidates a cached EDL against the confirmed proposal", async () => {
  const project = await projectWithConfirmedCleanupProposal();
  const proposal = explicitProposal();
  writeFileSync(join(project, "production-proposal.json"), JSON.stringify(proposal));
  const proposed = proposalProject(project);
  if (!proposed.ok) throw new Error(proposed.error.message);
  writeFileSync(join(project, "edit-plan.json"), JSON.stringify({
    contract_version: "1.0",
    confirmed_option_id: "strong-hook",
    proposal_selection_fingerprint: proposed.data.option_selection_fingerprints["strong-hook"],
    decisions: [],
  }));
  const initial = compileEdlProject(project);
  if (!initial.ok) throw new Error(initial.error.message);

  const edlPath = join(project, "edl.json");
  const edl = JSON.parse(readFileSync(edlPath, "utf8")) as EdlArtifact;
  edl.entries = [...edl.entries].reverse().map((entry, output_order) => ({ ...entry, output_order }));
  writeFileSync(edlPath, JSON.stringify(edl));
  const manifestPath = join(project, "artifact-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    artifacts: Record<string, { fingerprint: string; file_sha256?: string }>;
  };
  manifest.artifacts.edl!.fingerprint = semanticJsonFingerprint(edl);
  manifest.artifacts.edl!.file_sha256 = fileBytesFingerprint(edlPath);
  writeFileSync(manifestPath, JSON.stringify(manifest));

  const compiled = compileEdlProject(project);

  expect(compiled.ok).toBe(false);
  if (!compiled.ok) {
    expect(compiled.error.code).toBe("PROPOSAL_EXECUTION_MISMATCH");
    expect(compiled.error.message).toContain("timeline");
  }
});

async function projectWithConfirmedCleanupProposal(): Promise<string> {
  if (spawnSync("ffmpeg", ["-version"]).status !== 0) throw new Error("ffmpeg is required for execution conformance tests");
  const dir = mkdtempSync(join(tmpdir(), "koubo-exec-conformance-"));
  const source = join(dir, "raw.mp4");
  const project = join(dir, "project");
  makeVideo(source);
  const created = createProject([source], { projectPath: project });
  if (!created.ok) throw new Error(created.error.message);
  writeFileSync(join(project, "transcript.json"), JSON.stringify({
    timing_granularity: "segment",
    segments: [
      { source_id: "src-001", start: 0.1, end: 0.8, text: "Here is the main point." },
      { source_id: "src-001", start: 1.0, end: 1.4, text: "um" },
      { source_id: "src-001", start: 1.5, end: 2.5, text: "Now the proof continues." },
    ],
  }));
  const explored = await exploreProject(project, { asr: "external" });
  if (!explored.ok) throw new Error(explored.error.message);
  const reviewed = reviewProject(project);
  if (!reviewed.ok) throw new Error(reviewed.error.message);
  const proposal = cleanupProposal();
  writeFileSync(join(project, "production-proposal.json"), JSON.stringify(proposal));
  const proposed = proposalProject(project);
  if (!proposed.ok) throw new Error(proposed.error.message);
  return project;
}

function cleanupProposal(): ProductionProposalArtifact {
  const proposal = structuredClone(productionProposalExample) as ProductionProposalArtifact;
  proposal.recommended_option_id = "cleanup";
  proposal.options[0]!.id = "cleanup";
  proposal.options[0]!.cleanup.cut_candidate_ids = [CUT_CANDIDATE_ID];
  proposal.options[1]!.id = "alternate";
  proposal.options[1]!.cleanup.cut_candidate_ids = [];
  return proposal;
}

function explicitProposal(): ProductionProposalArtifact {
  const proposal = cleanupProposal();
  proposal.recommended_option_id = "strong-hook";
  const option = proposal.options[0]!;
  option.id = "strong-hook";
  option.label = "Strong hook";
  option.cleanup.cut_candidate_ids = [];
  option.subtitles = { enabled: true, style: "anchor", conflict_notes: [] };
  option.edit_execution_plan.duration_target = {
    min_seconds: 1.6,
    max_seconds: 1.8,
    target_seconds: 1.7,
    tolerance_frames: 2,
  };
  option.edit_execution_plan.timeline = {
    mode: "explicit_segments",
    segments: [
      { id: "payoff", source_id: "src-001", start: 1.5, end: 2.5, reason: "Open with the product payoff." },
      { id: "setup", source_id: "src-001", start: 0.1, end: 0.8, reason: "Then show the concise setup." },
    ],
  };
  option.edit_execution_plan.text_overlays = [{
    id: "hook-text",
    source_id: "src-001",
    segment_id: "payoff",
    start: 1.6,
    end: 2,
    element_id: "caption-editorial-emphasis",
    text: "Hands-free",
    purpose: "Make the confirmed hook explicit.",
  }];
  proposal.options[1]!.id = "cleanup-only";
  proposal.options[1]!.cleanup.cut_candidate_ids = [];
  return proposal;
}

function writeEditPlan(project: string, decisions: Array<{ action: "cut"; candidate_id: string; reason: string }>): void {
  const proposal = JSON.parse(readFileSync(join(project, "production-proposal.json"), "utf8")) as ProductionProposalArtifact;
  const proposed = proposalProject(project);
  if (!proposed.ok) throw new Error(proposed.error.message);
  writeFileSync(join(project, "edit-plan.json"), JSON.stringify({
    contract_version: "1.0",
    confirmed_option_id: proposal.recommended_option_id,
    proposal_selection_fingerprint: proposed.data.option_selection_fingerprints[proposal.recommended_option_id],
    decisions,
  }));
}

function makeVideo(path: string): void {
  const result = spawnSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "testsrc=size=160x90:rate=30", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-t", "3", "-pix_fmt", "yuv420p", path], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
}
