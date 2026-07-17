import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import {
  parseEdl,
  parseSourcesManifest,
  parseTranscript,
  type ArtifactFingerprint,
  type ArtifactFingerprintReference,
  type ArtifactManifest,
  type ArtifactRecord,
  type ArtifactRole,
  type ProductionProposalArtifact,
  type ProductionProposalOption,
  type ProjectStatusArtifact,
  type RenderResult,
} from "./artifacts";
import { fileBytesFingerprint, semanticJsonFingerprint } from "./artifact-lifecycle";
import {
  inputFingerprint,
  projectMetadataFingerprintProjection,
  proposalSelectionFingerprint,
  renderResultFingerprintProjection,
} from "./project-lineage";
import {
  commandExists,
  createProject,
  enrichPlanProject,
  exploreProject,
  inspectProject,
  proposalProject,
  renderProject,
  reviewProject,
} from "./project";
import { projectStatus } from "./project-status";

const RECORDED_AT = "2026-07-15T01:00:00.000Z";

test("proposal selection fingerprint covers every confirmed selected-option field", () => {
  const proposal = proposalDocument("Selected direction", "Alternative direction");
  const baseline = proposalSelectionFingerprint(proposal, "selected");
  const changes: Array<(proposal: ProductionProposalArtifact) => void> = [
    (next) => { next.source_mode = "screen_recording"; },
    (next) => { next.presentation_intent = "product_demo"; },
    (next) => { next.goal_summary = "changed goal"; },
    (next) => { next.material_summary = "changed material"; },
    (next) => { next.options[0]!.label = "Changed label"; },
    (next) => { next.options[0]!.reason = "Changed reason"; },
    (next) => { next.options[0]!.cleanup.cut_candidate_ids = ["c-001"]; },
    (next) => { next.options[0]!.subtitles.enabled = false; },
    (next) => { next.options[0]!.visuals.direction = "kinetic_text"; },
    (next) => { next.options[0]!.images.needed = true; },
    (next) => { next.options[0]!.music.source = "local"; },
    (next) => { next.options[0]!.sfx.enabled = true; },
    (next) => { next.options[0]!.requires_confirmation = ["confirm music"]; },
    (next) => { next.options[0]!.business_direction.title = "Changed direction"; },
    (next) => { next.options[0]!.edit_execution_plan.user_confirmation_summary = "changed summary"; },
    (next) => { next.options[0]!.asset_requirements.image_slots = [{ slot_id: "img-1", kind: "image", purpose: "show proof", required: true }]; },
  ];

  for (const mutate of changes) {
    const changed = structuredClone(proposal);
    mutate(changed);
    expect(proposalSelectionFingerprint(changed, "selected") === baseline).toBe(false);
  }

  const unselectedChanged = structuredClone(proposal);
  unselectedChanged.options[1]!.cleanup.cut_candidate_ids = ["c-unselected"];
  unselectedChanged.options[1]!.business_direction.title = "Changed alternative";
  expect(proposalSelectionFingerprint(unselectedChanged, "selected")).toBe(baseline);
});

test("proposal v3 invalidation is scoped to the confirmed option", async () => {
  if (!commandExists("ffmpeg")) return;
  const project = await confirmedProject();

  const initialProposal = proposalDocument("Selected direction", "Alternative direction");
  writeJson(join(project, "production-proposal.json"), initialProposal);
  const proposed = proposalProject(project);
  expect(proposed.ok).toBe(true);
  if (!proposed.ok) throw new Error(proposed.error.message);

  const selectedFingerprint = proposed.data.option_selection_fingerprints.selected;
  const unselectedFingerprint = proposed.data.option_selection_fingerprints.alternative;
  expect(selectedFingerprint?.startsWith("sha256:")).toBe(true);
  expect(unselectedFingerprint?.startsWith("sha256:")).toBe(true);
  writeJson(join(project, "edit-plan.json"), {
    contract_version: "1.0",
    confirmed_option_id: "selected",
    proposal_selection_fingerprint: selectedFingerprint,
    decisions: [],
  });

  const rendered = renderProject(project);
  expect(rendered.ok).toBe(true);
  if (!rendered.ok) throw new Error(rendered.error.message);
  const baseline = projectStatus(project);
  const baselineEdlFingerprint = artifact(baseline, "edl")?.fingerprint;
  const baselineAuthoringFingerprint = baseline.render_contract?.current_authoring_fingerprint;
  expect(artifact(baseline, "edit-plan")?.state).toBe("current");
  expect(artifact(baseline, "edl")?.state).toBe("current");
  expect(artifact(baseline, "render-result")?.state).toBe("current");

  writeJson(
    join(project, "production-proposal.json"),
    proposalDocument("Selected direction", "Rewritten alternative direction"),
  );
  const unselectedChanged = proposalProject(project);
  expect(unselectedChanged.ok).toBe(true);
  if (!unselectedChanged.ok) throw new Error(unselectedChanged.error.message);
  expect(unselectedChanged.data.option_selection_fingerprints.selected).toBe(selectedFingerprint);
  expect(unselectedChanged.data.option_selection_fingerprints.alternative === unselectedFingerprint).toBe(false);

  const afterUnselectedChange = projectStatus(project);
  expect(artifact(afterUnselectedChange, "edit-plan")?.state).toBe("current");
  expect(artifact(afterUnselectedChange, "edl")?.state).toBe("current");
  expect(artifact(afterUnselectedChange, "edl")?.fingerprint).toBe(baselineEdlFingerprint);
  expect(artifact(afterUnselectedChange, "render-result")?.state).toBe("current");
  expect(afterUnselectedChange.canonical_deliverable?.key).toBe("render-output:clean");
  expect(afterUnselectedChange.render_contract?.current_authoring_fingerprint === baselineAuthoringFingerprint).toBe(false);

  writeJson(
    join(project, "production-proposal.json"),
    proposalDocument("Changed selected direction", "Rewritten alternative direction"),
  );
  const selectedChanged = proposalProject(project);
  expect(selectedChanged.ok).toBe(true);
  if (!selectedChanged.ok) throw new Error(selectedChanged.error.message);
  expect(selectedChanged.data.option_selection_fingerprints.selected === selectedFingerprint).toBe(false);

  const afterSelectedChange = projectStatus(project);
  expect(artifact(afterSelectedChange, "edit-plan")?.state).toBe("stale");
  expect(artifact(afterSelectedChange, "edit-plan")?.reason_code).toBe("PROPOSAL_SELECTION_MISMATCH");
  expect(artifact(afterSelectedChange, "edl")?.state).toBe("stale");
  expect(artifact(afterSelectedChange, "render-result")?.state).toBe("stale");
  expect(afterSelectedChange.canonical_deliverable).toBe(undefined);
});


test("a real enriched render stays current through inspect and ignores unused asset bytes", async () => {
  if (!commandExists("ffmpeg")) return;
  const project = await confirmedProject();
  const proposal = proposalDocument("Selected direction", "Alternative direction");
  proposal.options[0]!.music = { source: "local", ducking: true, notes: ["confirmed music bed"] };
  proposal.options[0]!.asset_requirements.music_slots = [{ slot_id: "bed", kind: "music", purpose: "confirmed music bed", required: true }];
  writeJson(join(project, "production-proposal.json"), proposal);
  const proposed = proposalProject(project);
  expect(proposed.ok).toBe(true);
  if (!proposed.ok) throw new Error(proposed.error.message);
  writeJson(join(project, "edit-plan.json"), {
    contract_version: "1.0",
    confirmed_option_id: "selected",
    proposal_selection_fingerprint: proposed.data.option_selection_fingerprints.selected,
    decisions: [],
  });

  mkdirSync(join(project, "assets", "music"), { recursive: true });
  const usedAsset = join(project, "assets", "music", "bed.wav");
  const unusedAsset = join(project, "assets", "music", "unused.wav");
  makeSampleAudio(usedAsset, 2);
  makeSampleAudio(unusedAsset, 2);
  writeJson(join(project, "asset-manifest.json"), {
    assets: [
      { id: "bed", path: "assets/music/bed.wav", type: "music", source: "user", used_by: ["bed"], duration_seconds: 2 },
      { id: "unused", path: "assets/music/unused.wav", type: "music", source: "user", used_by: [], duration_seconds: 2 },
    ],
  });
  writeJson(join(project, "enrichment-plan.json"), {
    version: "2.0",
    profile: { source_mode: "talking_head_avatar", aspect_ratio: "source", caption_identity: "anchor", layout: "stack", style: "whiteboard", frame: "clean" },
    elements: [],
    audio: { music: [
      { id: "bed", start: 0, end: 1.7, asset_id: "bed", volume: 0.08, fade_seconds: 0.1, ducking: true, reason: "quiet bed" },
    ], sfx: [] },
  });

  const enriched = enrichPlanProject(project);
  expect(enriched.ok).toBe(true);
  if (!enriched.ok) throw new Error(enriched.error.message);
  const rendered = renderProject(project);
  expect(rendered.ok).toBe(true);
  if (!rendered.ok) throw new Error(rendered.error.message);

  const afterRender = projectStatus(project);
  expect(rendered.data.canonical_output_key).toBe("render-output:final");
  expect(artifact(afterRender, "enrichment-plan")?.state).toBe("current");
  expect(artifact(afterRender, "storyboard")?.state).toBe("current");
  expect(artifact(afterRender, "render-output:final")?.state).toBe("current");
  expect(artifact(afterRender, "render-result")?.state).toBe("current");
  expect(afterRender.canonical_deliverable?.key).toBe("render-output:final");
  expect(stage(afterRender, "enrichment")?.state).toBe("complete");
  expect(stage(afterRender, "render")?.state).toBe("complete");
  expect(afterRender.acceptance.proposal_conformance_status).toBe("passed");
  expect(afterRender.acceptance.render_status).toBe("success");
  expect(afterRender.acceptance.technical_inspection_status).toBe("pending");
  expect(afterRender.acceptance.business_acceptance_status).toBe("pending");
  expect(afterRender.acceptance.overall_status).toBe("in_progress");

  const inspected = inspectProject(project);
  expect(inspected.ok).toBe(true);
  if (!inspected.ok) throw new Error(inspected.error.message);
  const afterInspect = projectStatus(project);
  expect(inspected.data.output_path.endsWith("renders/final.mp4")).toBe(true);
  expect(inspected.data.asset_summary.map((asset) => asset.id)).toEqual(["bed"]);
  expect(artifact(afterInspect, "inspection")?.state).toBe("current");
  expect(stage(afterInspect, "inspect")?.state).toBe("complete");
  expect(afterInspect.canonical_deliverable?.fingerprint).toBe(fileBytesFingerprint(inspected.data.output_path));
  expect(inspected.data.render_status).toBe("success");
  expect(inspected.data.technical_inspection_status).toBe("passed");
  expect(inspected.data.proposal_conformance_status).toBe("passed");
  expect(inspected.data.business_acceptance_status).toBe("passed");
  expect(inspected.data.overall_status).toBe("completed");
  expect(afterInspect.acceptance.overall_status).toBe("completed");

  makeSampleAudio(unusedAsset, 1.5);
  const afterUnusedChange = projectStatus(project);
  expect(artifact(afterUnusedChange, "render-result")?.state).toBe("current");
  expect(artifact(afterUnusedChange, "inspection")?.state).toBe("current");
  expect(afterUnusedChange.canonical_deliverable?.key).toBe("render-output:final");

  makeSampleAudio(usedAsset, 1.5);
  const afterUsedChange = projectStatus(project);
  expect(artifact(afterUsedChange, "render-result")?.state).toBe("stale");
  expect(artifact(afterUsedChange, "inspection")?.state).toBe("stale");
  expect(afterUsedChange.canonical_deliverable).toBe(undefined);
});

async function confirmedProject(): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), "koubo-proposal-acceptance-"));
  const source = join(root, "raw.mp4");
  const project = join(root, "project");
  makeSampleVideo(source);
  const created = createProject([source], { projectPath: project });
  if (!created.ok) throw new Error(created.error.message);
  writeJson(join(project, "transcript.json"), {
    timing_granularity: "segment",
    segments: [{ source_id: "src-001", start: 0.1, end: 1.9, text: "hello world" }],
  });
  const explored = await exploreProject(project, { asr: "external" });
  if (!explored.ok) throw new Error(explored.error.message);
  const reviewed = reviewProject(project);
  if (!reviewed.ok) throw new Error(reviewed.error.message);
  return project;
}
function proposalDocument(
  selectedTitle: string,
  alternativeTitle: string,
): ProductionProposalArtifact {
  return {
    version: "3.0",
    source_mode: "talking_head_avatar",
    presentation_intent: "knowledge_explainer",
    goal_summary: "make a concise explainer",
    material_summary: "one short talking-head source",
    recommended_option_id: "selected",
    options: [
      proposalOption("selected", selectedTitle),
      proposalOption("alternative", alternativeTitle),
    ],
  };
}

function proposalOption(
  id: string,
  title: string,
): ProductionProposalOption {
  return {
    id,
    label: title,
    reason: `${title} best fits this fixture`,
    cleanup: { cut_candidate_ids: [], keep_strategy: "keep the complete statement", risks: [] },
    subtitles: { enabled: true, style: "plain", conflict_notes: [] },
    visuals: {
      direction: "none",
      viewer_job: "follow the spoken explanation",
      requires_grounding: false,
      notes: [],
    },
    images: { needed: false, reason: "the source is sufficient", missing_assets: [] },
    music: { source: "none", ducking: true, notes: [] },
    sfx: { enabled: false, usage: "none", restraint: "no decoration" },
    requires_confirmation: [],
    business_direction: {
      title,
      suitable_for: "knowledge sharing",
      editing_strategy: "keep the complete explanation",
      asset_style: "clean captions",
      risks: [],
    },
    edit_execution_plan: {
      objective: "deliver the idea clearly",
      target_audience: "general viewers",
      duration_target: { min_seconds: 1.7, max_seconds: 1.9, target_seconds: 1.8, tolerance_frames: 2 },
      narrative_structure: [{ beat: "explanation", purpose: "deliver the complete idea" }],
      timeline: {
        mode: "explicit_segments",
        segments: [{ id: "complete-statement", source_id: "src-001", start: 0.1, end: 1.9, reason: "contains the complete statement" }],
      },
      text_overlays: [],
      user_confirmation_summary: `use ${title}`,
    },
    asset_requirements: {
      visual_asset_slots: [], music_slots: [], sfx_slots: [], image_slots: [],
    },
  };
}

function trackedRenderProject(): {
  project: string;
  sources: ReturnType<typeof parseSourcesManifest>;
  renderInputFingerprint: ArtifactFingerprint;
} {
  const root = mkdtempSync(join(tmpdir(), "koubo-status-acceptance-"));
  const project = join(root, "project");
  mkdirSync(join(project, "source"), { recursive: true });
  mkdirSync(join(project, "renders"), { recursive: true });

  const projectValue = {
    contract_version: "1.0",
    provider_execution_mode: "standalone",
  } as const;
  const sourcesValue = {
    sources: [
      {
        source_id: "src-001",
        order: 0,
        original_filename: "raw.mp4",
        project_path: "source/001-original.mp4",
        duration_seconds: 2,
      },
    ],
  };
  const sources = parseSourcesManifest(sourcesValue);
  const transcriptValue = {
    timing_granularity: "segment",
    segments: [{ source_id: "src-001", start: 0, end: 2, text: "hello" }],
  } as const;
  const edlValue = {
    entries: [
      {
        source_id: "src-001",
        source_path: "source/001-original.mp4",
        start: 0,
        end: 2,
        output_order: 0,
        reason: "keep source range",
      },
    ],
  };

  writeJson(join(project, "project.json"), projectValue);
  writeJson(join(project, "sources.json"), sourcesValue);
  writeFileSync(join(project, "source", "001-original.mp4"), "source-bytes");
  writeJson(join(project, "transcript.json"), transcriptValue);
  writeJson(join(project, "edl.json"), edlValue);
  writeFileSync(join(project, "renders", "clean.mp4"), "clean-output-bytes");

  const projectFingerprint = semanticJsonFingerprint(projectMetadataFingerprintProjection(projectValue));
  const sourcesFingerprint = semanticJsonFingerprint(sources);
  const sourceFingerprint = fileBytesFingerprint(join(project, "source", "001-original.mp4"));
  const transcriptFingerprint = semanticJsonFingerprint(parseTranscript(transcriptValue, sources));
  const edlFingerprint = semanticJsonFingerprint(parseEdl(edlValue, sources));
  const cleanFingerprint = fileBytesFingerprint(join(project, "renders", "clean.mp4"));
  const renderInputs: ArtifactFingerprintReference[] = [
    { key: "edl", schema_version: "1.0", fingerprint: edlFingerprint },
    { key: "transcript", schema_version: "1.0", fingerprint: transcriptFingerprint },
    { key: "source:src-001", schema_version: "bytes-v1", fingerprint: sourceFingerprint },
  ];
  const renderInputFingerprint = inputFingerprint(renderInputs);
  const renderResult: RenderResult = {
    contract_version: "1.0",
    input_fingerprint: renderInputFingerprint,
    inputs: renderInputs,
    outputs: [
      {
        key: "render-output:clean",
        role: "execution_result",
        path: "renders/clean.mp4",
        sha256: cleanFingerprint,
      },
    ],
    canonical_output_key: "render-output:clean",
    enrichment_applied: false,
    clean_output_path: "renders/clean.mp4",
    producer_cli_version: "0.0.1",
    completed_at: RECORDED_AT,
  };
  writeJson(join(project, "render-result.json"), renderResult);

  const outputReference: ArtifactFingerprintReference = {
    key: "render-output:clean",
    schema_version: "bytes-v1",
    fingerprint: cleanFingerprint,
  };
  const manifest: ArtifactManifest = {
    contract_version: "1.0",
    artifacts: {
      project: record({
        key: "project",
        path: "project.json",
        role: "authoritative_input",
        schemaVersion: "1.0",
        fingerprint: projectFingerprint,
        command: "project.create",
      }),
      sources: record({
        key: "sources",
        path: "sources.json",
        role: "authoritative_input",
        schemaVersion: "1.0",
        fingerprint: sourcesFingerprint,
        command: "project.create",
      }),
      "source:src-001": record({
        key: "source:src-001",
        path: "source/001-original.mp4",
        role: "authoritative_input",
        schemaVersion: "bytes-v1",
        fingerprint: sourceFingerprint,
        command: "project.create",
      }),
      transcript: record({
        key: "transcript",
        path: "transcript.json",
        role: "authoritative_input",
        schemaVersion: "1.0",
        fingerprint: transcriptFingerprint,
        command: "project.explore",
      }),
      edl: record({
        key: "edl",
        path: "edl.json",
        role: "derived",
        schemaVersion: "1.0",
        fingerprint: edlFingerprint,
        command: "project.compile-edl",
      }),
      "render-output:clean": record({
        key: "render-output:clean",
        path: "renders/clean.mp4",
        role: "execution_result",
        schemaVersion: "bytes-v1",
        fingerprint: cleanFingerprint,
        inputs: renderInputs,
        command: "project.render",
      }),
      "render-result": record({
        key: "render-result",
        path: "render-result.json",
        role: "execution_result",
        schemaVersion: "1.0",
        fingerprint: semanticJsonFingerprint(renderResultFingerprintProjection(renderResult)),
        inputs: [...renderInputs, outputReference],
        command: "project.render",
      }),
    },
    stage_attempts: {
      "project.render": {
        stage: "project.render",
        command: "project.render",
        input_fingerprint: renderInputFingerprint,
        inputs: renderInputs,
        status: "success",
        started_at: RECORDED_AT,
        completed_at: RECORDED_AT,
        output_artifact_keys: ["render-output:clean", "render-result"],
      },
    },
    updated_at: RECORDED_AT,
  };
  writeManifest(project, manifest);
  return { project, sources, renderInputFingerprint };
}

function record(options: {
  key: string;
  path: string;
  role: ArtifactRole;
  schemaVersion: string;
  fingerprint: ArtifactFingerprint;
  command: string;
  inputs?: ArtifactFingerprintReference[];
}): ArtifactRecord {
  return {
    key: options.key,
    path: options.path,
    role: options.role,
    schema_version: options.schemaVersion,
    fingerprint: options.fingerprint,
    ...(options.schemaVersion === "bytes-v1" ? { file_sha256: options.fingerprint } : {}),
    authored_by: "cli",
    produced_by_command: options.command,
    producer_cli_version: "0.0.1",
    command_contract_version: "1.0",
    inputs: options.inputs ?? [],
    produced_at: RECORDED_AT,
  };
}

function machineState(status: ProjectStatusArtifact): unknown {
  return {
    artifacts: status.artifacts
      .filter((item) => item.role !== "human_view")
      .map(({ key, role, path, state, fingerprint, reason_code }) => ({
        key,
        role,
        path,
        state,
        fingerprint,
        reason_code,
      })),
    stages: status.stages,
    canonical_deliverable: status.canonical_deliverable,
    blockers: status.blockers,
    next_commands: status.next_commands,
    last_successful_checkpoint: status.last_successful_checkpoint,
  };
}

function artifact(status: ProjectStatusArtifact, key: string) {
  return status.artifacts.find((item) => item.key === key);
}

function stage(status: ProjectStatusArtifact, name: string) {
  return status.stages.find((item) => item.stage === name);
}

function readManifest(project: string): ArtifactManifest {
  return JSON.parse(readFileSync(join(project, "artifact-manifest.json"), "utf8")) as ArtifactManifest;
}

function writeManifest(project: string, manifest: ArtifactManifest): void {
  writeJson(join(project, "artifact-manifest.json"), manifest);
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
      "sine=frequency=440:duration=2",
      "-t",
      "2",
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
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
}

function makeSampleAudio(path: string, duration: number): void {
  const result = spawnSync(
    "ffmpeg",
    ["-y", "-f", "lavfi", "-i", `sine=frequency=220:duration=${duration}`, "-c:a", "pcm_s16le", path],
    { encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
}
