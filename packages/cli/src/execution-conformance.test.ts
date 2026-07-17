import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { productionProposalExample } from "./artifact-contracts";
import type { EdlArtifact, ProductionProposalArtifact } from "./artifacts";
import { compileEdlProject, createProject, enrichPlanProject, exploreProject, proposalProject, reviewProject } from "./project";

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
  proposal.options[0]!.edit_execution_plan.remove_segments = [{ candidate_id: CUT_CANDIDATE_ID, reason: "Confirmed filler removal." }];
  proposal.options[1]!.id = "alternate";
  proposal.options[1]!.cleanup.cut_candidate_ids = [];
  proposal.options[1]!.edit_execution_plan.remove_segments = [];
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
