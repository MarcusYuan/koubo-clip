import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { productionProposalExample } from "./artifact-contracts";
import { fileBytesFingerprint, semanticJsonFingerprint } from "./artifact-lifecycle";
import type { AnalysisCandidate, ProductionProposalArtifact, ProductionProposalOption } from "./artifacts";
import { compileEdlProject, createProject, exploreProject, proposalProject, reviewProject } from "./project";
import { projectStatus } from "./project-status";

test("project proposal rejects an overlay crossing one selected cut before fingerprints", async () => {
  const { project, candidates } = await proposalProjectFixture();
  const proposal = proposalWithCuts([candidates[0]!.id]);
  proposal.options[0]!.edit_execution_plan.text_overlays = [overlay("cross-one", 0.5, 2.5)];
  writeProposal(project, proposal);

  const result = proposalProject(project, { providerMode: "platform" });

  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected proposal rejection");
  expect(result.error.code).toBe("ARTIFACT_VALIDATION_FAILED");
  expect("data" in result).toBe(false);
  expect(result.error.issues?.length).toBe(1);
  expect({
    path: result.error.issues?.[0]?.path,
    keyword: result.error.issues?.[0]?.keyword,
  }).toEqual({
    path: "/options/0/edit_execution_plan/text_overlays/0",
    keyword: "executableRange",
  });
  expect(result.error.issues?.[0]?.message).toContain(candidates[0]!.id);
  expect(result.error.issues?.[0]?.message).toContain("retained_subranges=");
  expect(existsSync(join(project, "production-proposal.md"))).toBe(false);
});

test("project proposal reports all cuts crossed by one overlay in one issue", async () => {
  const { project, candidates } = await proposalProjectFixture();
  const selected = candidates.slice(0, 3);
  const proposal = proposalWithCuts(selected.map((candidate) => candidate.id));
  proposal.options[0]!.edit_execution_plan.text_overlays = [overlay("cross-many", 0.5, 4.8)];
  writeProposal(project, proposal);

  const result = proposalProject(project, { providerMode: "platform" });

  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected proposal rejection");
  expect(result.error.issues?.length).toBe(1);
  for (const candidate of selected) expect(result.error.issues?.[0]?.message).toContain(candidate.id);
  expect(result.error.issues?.[0]?.message.match(/effective=/g)?.length).toBe(3);
});

test("project proposal reports every invalid overlay across all options", async () => {
  const { project, candidates } = await proposalProjectFixture();
  const proposal = proposalWithCuts([candidates[0]!.id]);
  proposal.options[0]!.edit_execution_plan.text_overlays = [overlay("first", 0.5, 2.5)];
  proposal.options[1]!.cleanup.cut_candidate_ids = [candidates[2]!.id];
  proposal.options[1]!.edit_execution_plan.text_overlays = [overlay("second", 3, 4.8)];
  writeProposal(project, proposal);

  const result = proposalProject(project, { providerMode: "platform" });

  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected proposal rejection");
  expect(result.error.issues?.map((issue) => issue.path)).toEqual([
    "/options/0/edit_execution_plan/text_overlays/0",
    "/options/1/edit_execution_plan/text_overlays/0",
  ]);
  expect(result.error.issues?.[1]?.message).toContain("option=alternate");
});

test("project proposal rejects an un-compilable cleanup option even without overlays", async () => {
  const { project, candidates } = await proposalProjectFixture();
  const first = candidates[0]!;
  const overlapping = { ...first, id: "overlap-cut", start: first.start + 0.1 };
  const reviewPath = join(project, "review-package.json");
  const review = JSON.parse(readFileSync(reviewPath, "utf8")) as { proposed_cuts: AnalysisCandidate[] };
  review.proposed_cuts.push(overlapping);
  writeFileSync(reviewPath, JSON.stringify(review));
  refreshRecordedArtifact(project, "review-package", reviewPath, review);
  const proposal = proposalWithCuts([first.id, overlapping.id]);
  writeProposal(project, proposal);

  const result = proposalProject(project, { providerMode: "platform" });

  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected proposal rejection");
  expect(result.error.issues?.[0]?.path).toBe("/options/0/cleanup/cut_candidate_ids");
  expect(result.error.issues?.[0]?.message).toContain("selected cut candidates overlap");
  expect(existsSync(join(project, "production-proposal.md"))).toBe(false);
});

test("project status never exposes a selection fingerprint from a now-invalid proposal", async () => {
  const { project, candidates } = await proposalProjectFixture();
  const proposal = proposalWithCuts([candidates[0]!.id]);
  writeProposal(project, proposal);
  const accepted = proposalProject(project, { providerMode: "platform" });
  if (!accepted.ok) throw new Error(accepted.error.message);

  proposal.options[0]!.edit_execution_plan.text_overlays = [overlay("stale", 0.5, 2.5)];
  writeProposal(project, proposal);
  const rejected = proposalProject(project, { providerMode: "platform" });
  expect(rejected.ok).toBe(false);

  expect(Object.keys(projectStatus(project).fingerprints).some((key) => key.startsWith("proposal-selection:"))).toBe(false);
});

test("proposal and compile-edl accept overlays touching effective cut boundaries", async () => {
  const { project, candidates } = await proposalProjectFixture();
  const cut = candidates[0]!;
  const proposal = proposalWithCuts([cut.id]);
  proposal.options[0]!.edit_execution_plan.text_overlays = [
    overlay("before", 0.5, cut.start + 0.05),
    overlay("after", cut.end - 0.05, 2.5),
  ];
  writeProposal(project, proposal);

  const proposed = proposalProject(project, { providerMode: "platform" });

  expect(proposed.ok).toBe(true);
  if (!proposed.ok) throw new Error(proposed.error.message);
  writeEditPlan(project, proposal, proposed.data.option_selection_fingerprints.cleanup, [cut.id]);
  expect(compileEdlProject(project).ok).toBe(true);
});

test("splitting an overlay by retained ranges produces confirmable fingerprints and a valid EDL", async () => {
  const { project, candidates } = await proposalProjectFixture();
  const cut = candidates[0]!;
  const proposal = proposalWithCuts([cut.id]);
  proposal.options[0]!.edit_execution_plan.text_overlays = [
    overlay("split-a", 0.5, cut.start + 0.05),
    overlay("split-b", cut.end - 0.05, 2.5),
  ];
  writeProposal(project, proposal);

  const proposed = proposalProject(project, { providerMode: "platform" });

  expect(proposed.ok).toBe(true);
  if (!proposed.ok) throw new Error(proposed.error.message);
  expect(proposed.data.option_selection_fingerprints.cleanup.startsWith("sha256:")).toBe(true);
  writeEditPlan(project, proposal, proposed.data.option_selection_fingerprints.cleanup, [cut.id]);
  expect(compileEdlProject(project).ok).toBe(true);
});

test("compile-edl independently rejects a current-looking cached EDL that no longer retains an overlay", async () => {
  const { project, candidates } = await proposalProjectFixture();
  const cut = candidates[0]!;
  const proposal = proposalWithCuts([cut.id]);
  proposal.options[0]!.edit_execution_plan.text_overlays = [overlay("guard", 0.5, 1)];
  writeProposal(project, proposal);
  const proposed = proposalProject(project, { providerMode: "platform" });
  if (!proposed.ok) throw new Error(proposed.error.message);
  writeEditPlan(project, proposal, proposed.data.option_selection_fingerprints.cleanup, [cut.id]);
  const initial = compileEdlProject(project);
  if (!initial.ok) throw new Error(initial.error.message);

  const edlPath = join(project, "edl.json");
  const edl = JSON.parse(readFileSync(edlPath, "utf8")) as { entries: Array<{ start: number; end: number }> };
  edl.entries[0]!.end = 0.8;
  writeFileSync(edlPath, JSON.stringify(edl));
  refreshRecordedArtifact(project, "edl", edlPath, edl);

  const compiled = compileEdlProject(project);

  expect(compiled.ok).toBe(false);
  if (!compiled.ok) {
    expect(compiled.error.code).toBe("PROPOSAL_EXECUTION_MISMATCH");
    expect(compiled.error.message).toContain("text-overlay:guard");
  }
});

async function proposalProjectFixture(): Promise<{ project: string; candidates: AnalysisCandidate[] }> {
  const root = mkdtempSync(join(tmpdir(), "koubo-proposal-preflight-"));
  const project = join(root, "project");
  const sourceManifest = join(root, "sources.json");
  writeFileSync(sourceManifest, JSON.stringify({
    contract_version: "2.0",
    sources: [{
      source_id: "src-001",
      order: 0,
      original_filename: "raw.mp4",
      local_media_ref: "opaque-source-ref",
      identity: {
        sha256: `sha256:${"a".repeat(64)}`,
        size_bytes: 123,
        duration_seconds: 6,
        video: { codec_name: "h264", width: 160, height: 90, display_width: 160, display_height: 90, rotation: 0, avg_frame_rate: "30/1", pixel_format: "yuv420p" },
        audio: { codec_name: "aac", sample_rate: 48000, channels: 2, channel_layout: "stereo" },
      },
    }],
  }));
  const created = createProject([], { projectPath: project, sourceManifestPath: sourceManifest, providerMode: "platform" });
  if (!created.ok) throw new Error(created.error.message);
  writeFileSync(join(project, "transcript.json"), JSON.stringify({
    timing_granularity: "segment",
    segments: [
      { source_id: "src-001", start: 0, end: 1, text: "opening" },
      { source_id: "src-001", start: 1.1, end: 2.1, text: "um" },
      { source_id: "src-001", start: 2.2, end: 3.2, text: "uh" },
      { source_id: "src-001", start: 3.3, end: 4.3, text: "um" },
      { source_id: "src-001", start: 4.4, end: 5.4, text: "closing" },
    ],
  }));
  const explored = await exploreProject(project, { asr: "external", providerMode: "platform" });
  if (!explored.ok) throw new Error(explored.error.message);
  const reviewed = reviewProject(project, { providerMode: "platform" });
  if (!reviewed.ok) throw new Error(reviewed.error.message);
  const review = JSON.parse(readFileSync(join(project, "review-package.json"), "utf8")) as { proposed_cuts: AnalysisCandidate[] };
  return { project, candidates: review.proposed_cuts.filter((candidate) => candidate.type === "filler") };
}

function proposalWithCuts(cutIds: string[]): ProductionProposalArtifact {
  const proposal = structuredClone(productionProposalExample) as ProductionProposalArtifact;
  proposal.recommended_option_id = "cleanup";
  proposal.options[0]!.id = "cleanup";
  proposal.options[0]!.cleanup.cut_candidate_ids = cutIds;
  proposal.options[0]!.subtitles = { ...proposal.options[0]!.subtitles, enabled: true, style: "anchor" };
  proposal.options[0]!.edit_execution_plan.text_overlays = [];
  proposal.options[1]!.id = "alternate";
  proposal.options[1]!.cleanup.cut_candidate_ids = [];
  proposal.options[1]!.subtitles = { ...proposal.options[1]!.subtitles, enabled: true, style: "anchor" };
  proposal.options[1]!.edit_execution_plan.text_overlays = [];
  return proposal;
}

function overlay(id: string, start: number, end: number): ProductionProposalOption["edit_execution_plan"]["text_overlays"][number] {
  return {
    id,
    source_id: "src-001",
    start,
    end,
    element_id: "caption-highlight",
    text: id,
    purpose: "Confirm executable overlay timing.",
  };
}

function writeProposal(project: string, proposal: ProductionProposalArtifact): void {
  writeFileSync(join(project, "production-proposal.json"), JSON.stringify(proposal));
}

function writeEditPlan(project: string, proposal: ProductionProposalArtifact, fingerprint: string, cutIds: string[]): void {
  writeFileSync(join(project, "edit-plan.json"), JSON.stringify({
    contract_version: "1.0",
    confirmed_option_id: proposal.recommended_option_id,
    proposal_selection_fingerprint: fingerprint,
    decisions: cutIds.map((candidate_id) => ({ action: "cut", candidate_id, reason: "confirmed cleanup" })),
  }));
}

function refreshRecordedArtifact(project: string, key: string, artifactPath: string, value: unknown): void {
  const manifestPath = join(project, "artifact-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { artifacts: Record<string, { fingerprint: string; file_sha256?: string }> };
  manifest.artifacts[key]!.fingerprint = semanticJsonFingerprint(value);
  manifest.artifacts[key]!.file_sha256 = fileBytesFingerprint(artifactPath);
  writeFileSync(manifestPath, JSON.stringify(manifest));
}
