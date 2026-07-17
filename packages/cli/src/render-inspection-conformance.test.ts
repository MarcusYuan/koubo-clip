import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { productionProposalExample } from "./artifact-contracts";
import type { EdlArtifact, EditDecision, ProductionProposalArtifact } from "./artifacts";
import { compileOutputFrameSchedule } from "./render-contract";
import {
  compileEdlProject,
  createProject,
  enrichPlanProject,
  exploreProject,
  inspectProject,
  probeStrictOutputTiming,
  proposalProject,
  renderProject,
  reviewProject,
} from "./project";

test("local project render keeps nine non-integral segments on the compiled frame timeline", async () => {
  if (!hasFfmpeg()) return;
  const durations = [0.95, 0.72, 1.18, 0.85, 0.98, 0.74, 1.21, 0.81, 0.726667];
  const { project, cutIds } = await projectWithNineSegmentCuts(durations);
  writeConfirmedEditPlan(project, cutIds.map((candidate_id) => ({ action: "cut", candidate_id, reason: "timing cut" })));
  const compiled = compileEdlProject(project);
  if (!compiled.ok) throw new Error(compiled.error.message);
  const edl = JSON.parse(readFileSync(join(project, "edl.json"), "utf8")) as EdlArtifact;
  const schedule = compileOutputFrameSchedule(edl.entries, 30);

  const rendered = renderProject(project);
  if (!rendered.ok) throw new Error(rendered.error.message);
  const timing = probeStrictOutputTiming(rendered.data.clean_render_path);

  expect(timing.video_frame_count).toBe(schedule.total_frames);
  const inspected = inspectProject(project);
  if (!inspected.ok) throw new Error(`${inspected.error.code}: ${inspected.error.message}`);
  expect(inspected.data.accepted).toBe(true);
  expect(inspected.data.blockers).toEqual([]);
  expect(inspected.data.expected_duration_seconds).toBe(schedule.expected_duration_seconds);
});

test("enrich-plan returns a QA check for audio SFX", async () => {
  if (!hasFfmpeg()) return;
  const project = await readyProject();
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

  expect(enriched.ok).toBe(true);
  if (!enriched.ok) throw new Error(enriched.error.message);
  expect(enriched.data.qa_checks.some((check) => check.kind === "sfx" && check.source_element_id === "click")).toBe(true);
});

async function projectWithNineSegmentCuts(durations: number[]): Promise<{ project: string; cutIds: string[] }> {
  const root = mkdtempSync(join(tmpdir(), "koubo-local-timing-"));
  const source = join(root, "raw.mp4");
  const project = join(root, "project");
  makeVideo(source, 10);
  const created = createProject([source], { projectPath: project });
  if (!created.ok) throw new Error(created.error.message);
  const cutIds: string[] = [];
  const segments: Array<{ source_id: string; start: number; end: number; text: string }> = [];
  let cursor = 0;
  durations.forEach((duration, index) => {
    const cutStart = cursor + duration - 0.05;
    segments.push({ source_id: "src-001", start: cursor, end: cutStart, text: `keep ${index}` });
    if (index < durations.length - 1) {
      const cutEnd = cursor + duration + 0.25;
      segments.push({ source_id: "src-001", start: cutStart, end: cutEnd, text: "um" });
      cutIds.push(`c-${String(segments.length).padStart(3, "0")}-filler`);
      cursor = cursor + duration + 0.2;
    }
  });
  writeFileSync(join(project, "transcript.json"), JSON.stringify({ timing_granularity: "segment", segments }));
  const explored = await exploreProject(project, { asr: "external" });
  if (!explored.ok) throw new Error(explored.error.message);
  const reviewed = reviewProject(project);
  if (!reviewed.ok) throw new Error(reviewed.error.message);
  writeProposal(project, cutIds);
  const proposed = proposalProject(project);
  if (!proposed.ok) throw new Error(proposed.error.message);
  return { project, cutIds };
}

async function readyProject(): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), "koubo-sfx-qa-"));
  const source = join(root, "raw.mp4");
  const project = join(root, "project");
  makeVideo(source, 1.2);
  const created = createProject([source], { projectPath: project });
  if (!created.ok) throw new Error(created.error.message);
  writeFileSync(join(project, "transcript.json"), JSON.stringify({
    timing_granularity: "segment",
    segments: [{ source_id: "src-001", start: 0.1, end: 1, text: "Core point" }],
  }));
  const explored = await exploreProject(project, { asr: "external" });
  if (!explored.ok) throw new Error(explored.error.message);
  const reviewed = reviewProject(project);
  if (!reviewed.ok) throw new Error(reviewed.error.message);
  writeProposal(project, [], true);
  writeConfirmedEditPlan(project, []);
  return project;
}

function writeProposal(project: string, cutIds: string[], enableSfx = false): void {
  const proposal = structuredClone(productionProposalExample) as ProductionProposalArtifact;
  proposal.recommended_option_id = "confirmed";
  proposal.options.forEach((option, index) => {
    option.id = index === 0 ? "confirmed" : `unselected-${index}`;
    option.cleanup.cut_candidate_ids = index === 0 ? cutIds : [];
    option.edit_execution_plan.remove_segments = index === 0
      ? cutIds.map((candidate_id) => ({ candidate_id, reason: "Confirmed cleanup." }))
      : [];
    option.visuals = { direction: "No decorative overlays.", viewer_job: "Focus on the cleaned explanation.", requires_grounding: false, notes: [] };
    option.requires_confirmation = [];
    option.sfx = index === 0 && enableSfx
      ? { enabled: true, usage: "Use one restrained click cue for the confirmed action.", restraint: "low volume, no speech masking" }
      : { enabled: false, usage: "No sound effects.", restraint: "Keep the original speech natural." };
  });
  writeFileSync(join(project, "production-proposal.json"), JSON.stringify(proposal));
  const proposed = proposalProject(project);
  if (!proposed.ok) throw new Error(proposed.error.message);
}

function writeConfirmedEditPlan(project: string, decisions: EditDecision[]): void {
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

function hasFfmpeg(): boolean {
  return spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
}

function makeVideo(path: string, duration: number): void {
  const result = spawnSync("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc=size=160x90:rate=30",
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=440:duration=${duration}`,
    "-t",
    String(duration),
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
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
}
