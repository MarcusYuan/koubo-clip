import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import type { ArtifactManifest, ProductionProposalArtifact } from "./artifacts";
import { productionProposalExample } from "./artifact-contracts";
import {
  commandExists,
  createProject,
  exploreProject,
  proposalProject,
  renderProject,
  reviewProject,
  validateEnrichmentPlan,
} from "./project";
import { projectStatus } from "./project-status";

test("pre-contract project explore fails closed", async () => {
  const root = mkdtempSync(join(tmpdir(), "koubo-owner-legacy-"));
  const project = join(root, "project");
  mkdirSync(join(project, "source"), { recursive: true });
  writeJson(join(project, "project.json"), {
    provider_execution_mode: "standalone",
  });
  writeJson(join(project, "sources.json"), {
    sources: [
      {
        source_id: "src-001",
        order: 0,
        original_filename: "legacy.mp4",
        project_path: "source/001-original.mp4",
        duration_seconds: 2,
      },
    ],
  });
  writeFileSync(join(project, "source", "001-original.mp4"), "legacy-source-bytes");
  writeTranscript(project, "legacy transcript");

  const explored = await exploreProject(project, { asr: "external" });
  expect(explored.ok).toBe(false);
  if (explored.ok) throw new Error("expected legacy project rejection");
  expect(explored.error.code).toBe("PROJECT_EXPLORE_FAILED");
  return;

  const manifest = readManifest(project);
  expect(Object.keys(manifest.artifacts).sort()).toContain("project");
  expect(Object.keys(manifest.artifacts).sort()).toContain("sources");
  expect(Object.keys(manifest.artifacts).sort()).toContain("source:src-001");
  expect(manifest.artifacts.sources?.inputs.map((input) => input.key)).toEqual(["source:src-001"]);
  expect(manifest.artifacts.transcript?.inputs.map((input) => input.key)).toEqual(["sources"]);
  expect(manifest.artifacts.analysis?.inputs.map((input) => input.key)).toEqual(["transcript"]);
  const reexplored = await exploreProject(project, { asr: "external" });
  expect(reexplored.ok).toBe(true);
  const status = projectStatus(project);
  expect(status.project_contract_version).toBe("legacy");
  expect(status.manifest_state).toBe("tracked");
  expect(status.artifacts.find((artifact) => artifact.key === "project")?.state).toBe("current");
  expect(status.artifacts.find((artifact) => artifact.key === "sources")?.state).toBe("current");
  expect(status.artifacts.find((artifact) => artifact.key === "source:src-001")?.state).toBe("current");
  expect(reviewProject(project).ok).toBe(true);
});

test("visual review is not an implicit asset authorization source", () => {
  const root = mkdtempSync(join(tmpdir(), "koubo-owner-visual-review-"));
  const project = join(root, "project");
  mkdirSync(join(project, "assets", "images"), { recursive: true });
  writeFileSync(join(project, "assets", "images", "review-only.png"), "review-only-image");
  writeJson(join(project, "asset-manifest.json"), {
    assets: [
      {
        id: "review-only",
        path: "assets/images/review-only.png",
        type: "image",
        source: "imported",
      },
    ],
  });
  writeJson(join(project, "enrichment-plan.json"), {
    version: "2.0",
    profile: { source_mode: "screen_recording", aspect_ratio: "source", caption_identity: "anchor", layout: "overlay", style: "minimal", frame: "clean" },
    elements: [
      {
        id: "reviewed-visual",
        source: "agent",
        element_id: "review-only",
        element_type: "visual_asset",
        start: 0,
        end: 0.5,
        asset_id: "review-only",
        reason: "show the reviewed image",
      },
    ],
    audio: { music: [], sfx: [] },
  });
  writeJson(join(project, "visual-review.json"), {
    version: "1.0",
    items: [
      {
        asset_id: "review-only",
        request_id: "image",
        candidate_id: "candidate",
        provider: "mcp-handoff",
        asset_type: "image",
        path: "assets/images/review-only.png",
        usage_reason: "show the image",
        selection_reason: "reviewed by the agent",
        runtime_dependencies: [],
        warnings: [],
      },
    ],
    warnings: [],
  });
  const edl = {
    contract_version: "2.0" as const,
    entries: [
      {
        source_id: "src-001",
        start: 0,
        end: 1,
        output_order: 0,
        reason: "keep",
      },
    ],
  };

  expect(() => validateEnrichmentPlan(project, edl)).toThrow("explicit manifest provenance");

  writeJson(join(project, "asset-manifest.json"), {
    assets: [
      {
        id: "review-only",
        path: "assets/images/review-only.png",
        type: "image",
        source: "imported",
        provenance: "visual-acquisition",
      },
    ],
  });
  writeFileSync(join(project, "visual-review.json"), "not valid JSON");
  expect(validateEnrichmentPlan(project, edl).plan.version).toBe("2.0");
});

test("explore rejects changed tracked source bytes before writing derived artifacts", async () => {
  const project = createTrackedProject(false);
  writeTranscript(project, "pending transcript");
  const manifestBefore = readFileSync(join(project, "artifact-manifest.json"), "utf8");
  writeFileSync(join(project, "source", "001-original.mp4"), "replacement-source-bytes");

  const explored = await exploreProject(project, { asr: "external" });
  expect(explored.ok).toBe(false);
  if (explored.ok) throw new Error("expected changed source rejection");
  expect(explored.error.code).toBe("SOURCE_CONTENT_CHANGED");
  expect(explored.error.stage).toBe("project.explore");
  expect(existsSync(join(project, "analysis.json"))).toBe(false);
  expect(readFileSync(join(project, "artifact-manifest.json"), "utf8")).toBe(manifestBefore);
});

test("review and proposal refuse stale upstream closure instead of blessing it", async () => {
  const reviewProjectPath = createTrackedProject(false);
  writeTranscript(reviewProjectPath, "review input");
  const exploredForReview = await exploreProject(reviewProjectPath, { asr: "external" });
  if (!exploredForReview.ok) throw new Error(exploredForReview.error.message);
  writeJson(join(reviewProjectPath, "analysis.json"), {
    candidates: [
      {
        id: "manual-change",
        source_id: "src-001",
        start: 0.2,
        end: 0.4,
        text: "changed",
        type: "manual",
        reason: "unvalidated analysis change",
        confidence: 0.5,
      },
    ],
  });
  const staleReview = reviewProject(reviewProjectPath);
  expect(staleReview.ok).toBe(false);
  if (staleReview.ok) throw new Error("expected stale review input rejection");
  expect(staleReview.error.code).toBe("ARTIFACT_STALE");
  expect(existsSync(join(reviewProjectPath, "review-package.json"))).toBe(false);

  const proposalProjectPath = await exploredAndReviewedProject(false);
  writeJson(join(proposalProjectPath, "production-proposal.json"), proposalDocument());
  writeTranscript(proposalProjectPath, "changed after review");
  const staleProposal = proposalProject(proposalProjectPath);
  expect(staleProposal.ok).toBe(false);
  if (staleProposal.ok) throw new Error("expected stale proposal input rejection");
  expect(staleProposal.error.code).toBe("ARTIFACT_STALE");
  expect(existsSync(join(proposalProjectPath, "production-proposal.md"))).toBe(false);
  expect(readManifest(proposalProjectPath).artifacts["production-proposal"]).toBe(undefined);
});

test("compile validates but never re-registers changed material owners", async () => {
  if (!commandExists("ffmpeg")) return;
  const project = await exploredAndReviewedProject(true);
  const proposal = proposalDocument();
  writeJson(join(project, "production-proposal.json"), proposal);
  const proposed = proposalProject(project);
  expect(proposed.ok).toBe(true);
  if (!proposed.ok) throw new Error(proposed.error.message);
  writeJson(join(project, "edit-plan.json"), {
    contract_version: "1.0",
    confirmed_option_id: proposal.recommended_option_id,
    proposal_selection_fingerprint: proposed.data.option_selection_fingerprints[proposal.recommended_option_id],
    decisions: [],
  });

  const initialRender = renderProject(project);
  if (!initialRender.ok) throw new Error(`${initialRender.error.code}: ${initialRender.error.message}`);
  expect(initialRender.ok).toBe(true);
  const committed = readManifest(project);
  expect(committed.artifacts["edit-plan"]?.validated_by_command).toBe("project.compile-edl");
  expect(committed.artifacts.edl?.produced_by_command).toBe("project.compile-edl");
  const ownedBefore = ownedMaterialRecords(committed);

  writeTranscript(project, "changed after compile");
  const rerender = renderProject(project);
  expect(rerender.ok).toBe(false);
  if (rerender.ok) throw new Error("expected changed transcript rejection");
  expect(rerender.error.code).toBe("ARTIFACT_STALE");
  expect(ownedMaterialRecords(readManifest(project))).toEqual(ownedBefore);
}, 20_000);

function createTrackedProject(realMedia: boolean): string {
  const root = mkdtempSync(join(tmpdir(), "koubo-owner-tracked-"));
  const source = join(root, "raw.mp4");
  const project = join(root, "project");
  if (realMedia) makeSampleVideo(source);
  else writeFileSync(source, "source-bytes");
  const created = createProject([source], { projectPath: project });
  if (!created.ok) throw new Error(created.error.message);
  return project;
}

async function exploredAndReviewedProject(realMedia: boolean): Promise<string> {
  const project = createTrackedProject(realMedia);
  writeTranscript(project, "current transcript");
  const explored = await exploreProject(project, { asr: "external" });
  if (!explored.ok) throw new Error(explored.error.message);
  const reviewed = reviewProject(project);
  if (!reviewed.ok) throw new Error(reviewed.error.message);
  return project;
}

function writeTranscript(project: string, text: string): void {
  writeJson(join(project, "transcript.json"), {
    timing_granularity: "segment",
    segments: [{ source_id: "src-001", start: 0.1, end: 0.9, text }],
  });
}

function proposalDocument(): ProductionProposalArtifact {
  const proposal = structuredClone(productionProposalExample) as ProductionProposalArtifact;
  proposal.options.forEach((option) => {
    option.cleanup.cut_candidate_ids = [];
  });
  return proposal;
}

function ownedMaterialRecords(manifest: ArtifactManifest): unknown {
  return Object.fromEntries(
    ["sources", "source:src-001", "transcript", "analysis"].map((key) => [key, manifest.artifacts[key]]),
  );
}

function readManifest(project: string): ArtifactManifest {
  return JSON.parse(readFileSync(join(project, "artifact-manifest.json"), "utf8")) as ArtifactManifest;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function makeSampleVideo(path: string): void {
  const result = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=160x90:rate=10",
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
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "failed to create sample video");
}
