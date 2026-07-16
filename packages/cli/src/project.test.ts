import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as nodeFs from "node:fs";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { parseAssetManifest, parseEnrichmentPlan, parseProjectMetadata, type ProductionProposalArtifact } from "./artifacts";
import { fileBytesFingerprint, semanticJsonFingerprint } from "./artifact-lifecycle";
import * as projectApi from "./project";
import { buildEnrichmentStoryboard, commandExists, createProject, elementCatalogProject, enrichPlanProject, exploreProject, inspectProject, musicAcquireProject, musicCatalogProject, musicReviewProject, normalizeCloudflareWhisperResult, normalizeWhisperJson, proposalProject, renderProject, reviewProject, sourceFramesProject, validateSourceFrameByteLimits, visualAcquireProject, visualCatalogProject, visualReviewProject, visualSearchProject } from "./project";
import { projectStatus } from "./project-status";
import { productionProposalExample } from "./artifact-contracts";
import { confirmProposalAndWriteEditPlan } from "./test-fixtures";

test("creates, explores, and reviews a source-aware project", async () => {
  const dir = mkdtempSync(join(tmpdir(), "koubo-clip-"));
  const source = join(dir, "raw.mp4");
  const project = join(dir, "project");
  writeFileSync(source, "not real media");

  const created = createProject([source], { projectPath: project });
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error(created.error.message);
  expect(created.data.source_count).toBe(1);

  writeFileSync(
    join(project, "transcript.json"),
    JSON.stringify({
      timing_granularity: "segment",
      segments: [
        { source_id: "src-001", start: 0, end: 1, text: "hello" },
        { source_id: "src-001", start: 2.5, end: 3, text: "um" },
        { source_id: "src-001", start: 4, end: 5, text: "bye" },
        { source_id: "src-001", start: 5.1, end: 6, text: "bye" },
      ],
    }),
  );

  const explored = await exploreProject(project, { asr: "external" });
  expect(explored.ok).toBe(true);
  if (!explored.ok) throw new Error(explored.error.message);
  expect(explored.data.candidate_count).toBe(4);

  const reviewed = reviewProject(project);
  expect(reviewed.ok).toBe(true);
  if (!reviewed.ok) throw new Error(reviewed.error.message);
  expect(reviewed.data.proposed_cut_count).toBe(4);
  expect(reviewed.data.unresolved_risk_count).toBe(1);
  const reviewMarkdown = readFileSync(reviewed.data.review_package_path, "utf8");
  expect(reviewMarkdown).toContain("## Original Ranges");
  expect(reviewMarkdown).toContain("confidence=");
  expect(reviewMarkdown).toContain("timing=segment");
});

test("project provider mode defaults, persists, and rejects mismatches", () => {
  const dir = mkdtempSync(join(tmpdir(), "koubo-provider-mode-"));
  const source = join(dir, "raw.mp4");
  const standaloneProject = join(dir, "standalone-project");
  const platformProject = join(dir, "platform-project");
  const legacyProject = join(dir, "legacy-project");
  const implicitLegacyProject = join(dir, "implicit-legacy-project");
  writeFileSync(source, "not real media");

  const standalone = createProject([source], { projectPath: standaloneProject });
  expect(standalone.ok).toBe(true);
  if (!standalone.ok) throw new Error(standalone.error.message);
  expect(standalone.data.provider_mode).toBe("standalone");
  expect(parseProjectMetadata(JSON.parse(readFileSync(join(standaloneProject, "project.json"), "utf8"))).provider_execution_mode).toBe("standalone");

  const platform = createProject([source], { projectPath: platformProject, providerMode: "platform" });
  expect(platform.ok).toBe(true);
  if (!platform.ok) throw new Error(platform.error.message);
  expect(platform.data.provider_mode).toBe("platform");
  expect(parseProjectMetadata(JSON.parse(readFileSync(join(platformProject, "project.json"), "utf8"))).provider_execution_mode).toBe("platform");

  const mismatch = elementCatalogProject(platformProject, { providerMode: "standalone" });
  expect(mismatch.ok).toBe(false);
  if (mismatch.ok) throw new Error("expected provider mode mismatch");
  expect(mismatch.error.code).toBe("PROVIDER_MODE_MISMATCH");
  expect(mismatch.error.provider_execution_mode).toBe("platform");
  expect(mismatch.error.artifact).toBe("project.json");

  mkdirSync(legacyProject, { recursive: true });
  const asserted = elementCatalogProject(legacyProject, { providerMode: "platform" });
  expect(asserted.ok).toBe(true);
  expect(parseProjectMetadata(JSON.parse(readFileSync(join(legacyProject, "project.json"), "utf8"))).provider_execution_mode).toBe("platform");

  mkdirSync(implicitLegacyProject, { recursive: true });
  const implicitStandalone = elementCatalogProject(implicitLegacyProject);
  expect(implicitStandalone.ok).toBe(true);
  expect(parseProjectMetadata(JSON.parse(readFileSync(join(implicitLegacyProject, "project.json"), "utf8"))).provider_execution_mode).toBe("standalone");
  const laterPlatform = elementCatalogProject(implicitLegacyProject, { providerMode: "platform" });
  expect(laterPlatform.ok).toBe(false);
  if (laterPlatform.ok) throw new Error("expected provider mode mismatch");
  expect(laterPlatform.error.code).toBe("PROVIDER_MODE_MISMATCH");
});

test("platform mode explore blocks missing transcript before ASR", async () => {
  const dir = mkdtempSync(join(tmpdir(), "koubo-platform-asr-"));
  const source = join(dir, "raw.mp4");
  const project = join(dir, "project");
  writeFileSync(source, "not real media");
  createProject([source], { projectPath: project, providerMode: "platform" });

  const explored = await exploreProject(project, { asr: "auto", asrProvider: "whisper-cli", providerMode: "platform" });
  expect(explored.ok).toBe(false);
  if (explored.ok) throw new Error("expected platform ASR blocker");
  expect(explored.error.code).toBe("PLATFORM_PROVIDER_BLOCKED");
  expect(explored.error.stage).toBe("asr");
  expect(explored.error.artifact).toBe("transcript.json");
  expect(explored.error.message).toContain("transcript.json");
});

test("platform mode blocks music provider acquisition before network", async () => {
  const dir = mkdtempSync(join(tmpdir(), "koubo-platform-music-"));
  const source = join(dir, "raw.mp4");
  const project = join(dir, "project");
  writeFileSync(source, "not real media");
  createProject([source], { projectPath: project, providerMode: "platform" });
  writeFileSync(
    join(project, "music-request.json"),
    JSON.stringify({ version: "1.0", id: "bed", source: "minimax", reason: "platform should generate music", prompt: "calm bed", target_duration_seconds: 2 }),
  );

  const oldFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("network should not be called");
  }) as typeof fetch;
  try {
    const acquired = await musicAcquireProject(project, { providerMode: "platform" });
    expect(acquired.ok).toBe(false);
    if (acquired.ok) throw new Error("expected music provider blocker");
    expect(acquired.error.code).toBe("PLATFORM_PROVIDER_BLOCKED");
    expect(acquired.error.stage).toBe("music-acquire");
    expect(acquired.error.artifact).toBe("music-request.json");
    expect(acquired.error.message).toContain("minimax");
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("platform mode music catalog does not expose local provider state", () => {
  const dir = mkdtempSync(join(tmpdir(), "koubo-platform-music-catalog-"));
  const source = join(dir, "raw.mp4");
  const project = join(dir, "project");
  const library = join(dir, "secret-library");
  writeFileSync(source, "not real media");
  mkdirSync(library, { recursive: true });
  writeFileSync(join(library, "track.mp3"), "not real audio");
  createProject([source], { projectPath: project, providerMode: "platform" });

  const oldLibrary = process.env.MUSIC_LIBRARY_DIR;
  const oldMiniMax = process.env.MINIMAX_API_KEY;
  process.env.MUSIC_LIBRARY_DIR = library;
  process.env.MINIMAX_API_KEY = "secret-minimax-value";
  try {
    const catalog = musicCatalogProject(project, { providerMode: "platform" });
    expect(catalog.ok).toBe(true);
    if (!catalog.ok) throw new Error(catalog.error.message);
    const text = readFileSync(catalog.data.music_catalog_path, "utf8");
    expect(text.includes(library)).toBe(false);
    expect(text.includes("secret-minimax-value")).toBe(false);
    expect(catalog.data.providers.every((provider) => provider.status === "host-managed")).toBe(true);
    expect(JSON.parse(text).library.library_dir).toBe("host-managed");
  } finally {
    if (oldLibrary === undefined) delete process.env.MUSIC_LIBRARY_DIR;
    else process.env.MUSIC_LIBRARY_DIR = oldLibrary;
    if (oldMiniMax === undefined) delete process.env.MINIMAX_API_KEY;
    else process.env.MINIMAX_API_KEY = oldMiniMax;
  }
});

test("platform mode visual search rejects provider download urls", async () => {
  const dir = mkdtempSync(join(tmpdir(), "koubo-platform-visual-download-"));
  const source = join(dir, "raw.mp4");
  const project = join(dir, "project");
  writeFileSync(source, "not real media");
  createProject([source], { projectPath: project, providerMode: "platform" });
  writeFileSync(
    join(project, "visual-request.json"),
    JSON.stringify({
      version: "1.0",
      source_mode: "screen_recording",
      presentation_intent: "short_form",
      requests: [
        {
          id: "alarm",
          viewer_job: "show alarm cue",
          semantic_query: "alarm clock",
          asset_type: "icon",
          preferred_sources: ["iconify"],
          reason: "needs local candidate",
          selected_candidate_id: "alarm-remote",
        },
      ],
    }),
  );
  writeFileSync(
    join(project, "visual-candidates.json"),
    JSON.stringify({
      version: "1.0",
      candidates: [
        {
          id: "alarm-remote",
          request_id: "alarm",
          provider: "iconify",
          asset_type: "icon",
          title: "alarm remote",
          semantic_query: "alarm clock",
          local_path: "handoff.svg",
          download_url: "https://api.iconify.design/mdi/alarm.svg",
          license: "MIT",
          renderable: true,
          recommended: true,
          reason: "host did not normalize provider URL away",
          runtime_dependencies: [],
        },
      ],
      warnings: [],
    }),
  );

  const searched = await visualSearchProject(project, { providerMode: "platform" });
  expect(searched.ok).toBe(false);
  if (searched.ok) throw new Error("expected visual search blocker");
  expect(searched.error.code).toBe("PLATFORM_PROVIDER_BLOCKED");
  expect(searched.error.message).toContain("download_url");
});

test("platform mode visual catalog does not expose local provider state", () => {
  const dir = mkdtempSync(join(tmpdir(), "koubo-platform-visual-catalog-"));
  const source = join(dir, "raw.mp4");
  const project = join(dir, "project");
  writeFileSync(source, "not real media");
  createProject([source], { projectPath: project, providerMode: "platform" });

  const oldLordicon = process.env.LORDICON_API_KEY;
  process.env.LORDICON_API_KEY = "secret-lordicon-value";
  try {
    const catalog = visualCatalogProject(project, { providerMode: "platform" });
    expect(catalog.ok).toBe(true);
    if (!catalog.ok) throw new Error(catalog.error.message);
    const text = readFileSync(catalog.data.visual_catalog_path, "utf8");
    expect(text.includes("secret-lordicon-value")).toBe(false);
    expect(catalog.data.providers.find((provider) => provider.id === "lordicon")?.status).toBe("host-managed");
    expect(catalog.data.providers.find((provider) => provider.id === "iconify")?.available).toBe(false);
  } finally {
    if (oldLordicon === undefined) delete process.env.LORDICON_API_KEY;
    else process.env.LORDICON_API_KEY = oldLordicon;
  }
});

test("platform mode visual search rejects provider source and preview urls", async () => {
  const dir = mkdtempSync(join(tmpdir(), "koubo-platform-visual-source-url-"));
  const source = join(dir, "raw.mp4");
  const project = join(dir, "project");
  writeFileSync(source, "not real media");
  createProject([source], { projectPath: project, providerMode: "platform" });
  writeFileSync(
    join(project, "visual-request.json"),
    JSON.stringify({
      version: "1.0",
      source_mode: "screen_recording",
      presentation_intent: "short_form",
      requests: [
        {
          id: "alarm",
          viewer_job: "show alarm cue",
          semantic_query: "alarm clock",
          asset_type: "icon",
          preferred_sources: ["iconify"],
          reason: "needs local candidate",
          selected_candidate_id: "alarm-source",
        },
      ],
    }),
  );
  writeFileSync(
    join(project, "visual-candidates.json"),
    JSON.stringify({
      version: "1.0",
      candidates: [
        {
          id: "alarm-source",
          request_id: "alarm",
          provider: "iconify",
          asset_type: "icon",
          title: "alarm source",
          semantic_query: "alarm clock",
          local_path: "handoff.svg",
          source_url: "https://icon-sets.iconify.design/mdi/alarm/",
          preview_url: "https://api.iconify.design/mdi/alarm.svg",
          license: "MIT",
          renderable: true,
          recommended: true,
          reason: "host did not normalize provider URLs away",
          runtime_dependencies: [],
        },
      ],
      warnings: [],
    }),
  );

  const searched = await visualSearchProject(project, { providerMode: "platform" });
  expect(searched.ok).toBe(false);
  if (searched.ok) throw new Error("expected visual search blocker");
  expect(searched.error.code).toBe("PLATFORM_PROVIDER_BLOCKED");
  expect(searched.error.message).toContain("preview_url");
});

test("platform mode visual search and acquire consume local candidates only", async () => {
  const dir = mkdtempSync(join(tmpdir(), "koubo-platform-visual-"));
  const source = join(dir, "raw.mp4");
  const project = join(dir, "project");
  writeFileSync(source, "not real media");
  createProject([source], { projectPath: project, providerMode: "platform" });
  writeFileSync(join(project, "handoff.svg"), '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10H0z"/></svg>');
  writeFileSync(
    join(project, "visual-request.json"),
    JSON.stringify({
      version: "1.0",
      source_mode: "screen_recording",
      presentation_intent: "short_form",
      requests: [
        {
          id: "alarm",
          viewer_job: "show alarm cue",
          semantic_query: "alarm clock",
          asset_type: "icon",
          preferred_sources: ["iconify"],
          reason: "host supplied icon candidate",
          selected_candidate_id: "alarm-local",
          selection_reason: "the local icon matches the requested alarm cue",
        },
      ],
    }),
  );
  writeFileSync(
    join(project, "visual-candidates.json"),
    JSON.stringify({
      version: "1.0",
      candidates: [
        {
          id: "alarm-local",
          request_id: "alarm",
          provider: "iconify",
          asset_type: "icon",
          title: "alarm local",
          semantic_query: "alarm clock",
          local_path: "handoff.svg",
          license: "MIT",
          renderable: true,
          recommended: true,
          reason: "host wrote local candidate",
          runtime_dependencies: [],
        },
      ],
      warnings: [],
    }),
  );

  const oldFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("network should not be called");
  }) as typeof fetch;
  try {
    const searched = await visualSearchProject(project, { providerMode: "platform" });
    expect(searched.ok).toBe(true);
    if (!searched.ok) throw new Error(searched.error.message);
    expect(searched.data.candidate_count).toBe(1);
    const acquired = await visualAcquireProject(project, { providerMode: "platform" });
    expect(acquired.ok).toBe(true);
    if (!acquired.ok) throw new Error(acquired.error.message);
    expect(acquired.data.acquired_count).toBe(1);
    expect(existsSync(join(project, "assets", "icons", "visual-alarm.svg"))).toBe(true);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("platform visual acquire requires an explicit reviewed project-local selection", async () => {
  const dir = mkdtempSync(join(tmpdir(), "koubo-platform-visual-contract-"));
  const source = join(dir, "raw.mp4");
  const project = join(dir, "project");
  writeFileSync(source, "not real media");
  createProject([source], { projectPath: project, providerMode: "platform" });
  writeFileSync(join(project, "preview.png"), "preview");
  writeFileSync(join(project, "selected.svg"), '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10H0z"/></svg>');

  const writeRequest = (selectedCandidateId?: string, selectionReason?: string) => writeFileSync(
    join(project, "visual-request.json"),
    JSON.stringify({
      version: "1.0",
      source_mode: "screen_recording",
      presentation_intent: "short_form",
      requests: [{
        id: "alarm",
        viewer_job: "show alarm cue",
        semantic_query: "alarm clock",
        asset_type: "icon",
        preferred_sources: ["iconify"],
        reason: "the slot needs a visible alarm cue",
        ...(selectedCandidateId === undefined ? {} : { selected_candidate_id: selectedCandidateId }),
        ...(selectionReason === undefined ? {} : { selection_reason: selectionReason }),
      }],
    }),
  );
  const writeCandidates = (candidate: Record<string, unknown>) => writeFileSync(
    join(project, "visual-candidates.json"),
    JSON.stringify({
      version: "1.0",
      candidates: [{
        id: "alarm-selected",
        request_id: "alarm",
        provider: "iconify",
        asset_type: "icon",
        title: "alarm",
        semantic_query: "alarm clock",
        license: "MIT",
        renderable: true,
        recommended: true,
        reason: "candidate from the platform",
        runtime_dependencies: [],
        ...candidate,
      }],
      warnings: [],
    }),
  );
  const expectBlocker = async (artifact: string) => {
    const result = await visualAcquireProject(project, { providerMode: "platform" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected platform visual acquire blocker");
    expect(result.error.code).toBe("PLATFORM_PROVIDER_BLOCKED");
    expect(result.error.stage).toBe("visual-acquire");
    expect(result.error.artifact).toBe(artifact);
    expect(result.error.remediation).toContain("selected_candidate_id and selection_reason");
    expect(result.error.remediation).toContain("only the selected candidate");
  };

  writeCandidates({ local_path: "selected.svg" });
  writeRequest();
  await expectBlocker("visual-request.json");
  writeRequest("alarm-selected");
  await expectBlocker("visual-request.json");
  writeRequest("alarm-selected", "   ");
  await expectBlocker("visual-request.json");

  writeRequest("alarm-selected", "best semantic match");
  writeCandidates({ request_id: "another-request", local_path: "selected.svg" });
  await expectBlocker("visual-candidates.json");
  writeCandidates({ renderable: false, local_path: "selected.svg" });
  await expectBlocker("visual-candidates.json");
  writeCandidates({ preview_path: "preview.png" });
  await expectBlocker("visual-candidates.json");
  writeCandidates({ local_path: "missing.svg" });
  await expectBlocker("visual-candidates.json");

  const outside = join(dir, "outside.svg");
  writeFileSync(outside, '<svg xmlns="http://www.w3.org/2000/svg"/>');
  nodeFs.symlinkSync(outside, join(project, "escaped.svg"));
  writeCandidates({ local_path: "escaped.svg" });
  await expectBlocker("visual-candidates.json");
  writeCandidates({ preview_path: "escaped.svg", local_path: "selected.svg" });
  await expectBlocker("visual-candidates.json");

  writeCandidates({ preview_path: "preview.png", local_path: "selected.svg", license_url: "https://example.com/license" });
  const acquired = await visualAcquireProject(project, { providerMode: "platform" });
  expect(acquired.ok).toBe(true);
  if (!acquired.ok) throw new Error(acquired.error.message);
  expect(acquired.data.acquired_count).toBe(1);
  expect(existsSync(join(project, "assets", "icons", "visual-alarm.svg"))).toBe(true);
});

test("platform mode visual provider paths return blockers instead of fetching", async () => {
  const dir = mkdtempSync(join(tmpdir(), "koubo-platform-visual-block-"));
  const source = join(dir, "raw.mp4");
  const project = join(dir, "project");
  writeFileSync(source, "not real media");
  createProject([source], { projectPath: project, providerMode: "platform" });
  writeFileSync(
    join(project, "visual-request.json"),
    JSON.stringify({
      version: "1.0",
      source_mode: "screen_recording",
      presentation_intent: "short_form",
      requests: [
        {
          id: "alarm",
          viewer_job: "show alarm cue",
          semantic_query: "alarm clock",
          asset_type: "icon",
          preferred_sources: ["iconify"],
          reason: "needs host candidate",
          selected_candidate_id: "alarm-remote",
          selection_reason: "the requested remote candidate matches the alarm cue",
        },
      ],
    }),
  );

  const oldFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("network should not be called");
  }) as typeof fetch;
  try {
    const searched = await visualSearchProject(project, { providerMode: "platform" });
    expect(searched.ok).toBe(false);
    if (searched.ok) throw new Error("expected visual search blocker");
    expect(searched.error.code).toBe("PLATFORM_PROVIDER_BLOCKED");
    expect(searched.error.stage).toBe("visual-search");

    writeFileSync(
      join(project, "visual-candidates.json"),
      JSON.stringify({
        version: "1.0",
        candidates: [
          {
            id: "alarm-remote",
            request_id: "alarm",
            provider: "iconify",
            asset_type: "icon",
            title: "alarm remote",
            semantic_query: "alarm clock",
            download_url: "https://api.iconify.design/mdi/alarm.svg",
            license: "MIT",
            renderable: true,
            recommended: true,
            reason: "remote provider candidate",
            runtime_dependencies: [],
          },
        ],
        warnings: [],
      }),
    );
    const acquired = await visualAcquireProject(project, { providerMode: "platform" });
    expect(acquired.ok).toBe(false);
    if (acquired.ok) throw new Error("expected visual acquire blocker");
    expect(acquired.error.code).toBe("PLATFORM_PROVIDER_BLOCKED");
    expect(acquired.error.stage).toBe("visual-acquire");
    expect(acquired.error.message).toContain("download_url");
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("validates and renders a production proposal without creating execution artifacts", async () => {
  const dir = mkdtempSync(join(tmpdir(), "koubo-clip-proposal-"));
  const source = join(dir, "raw.mp4");
  const project = join(dir, "project");
  writeFileSync(source, "not real media");
  createProject([source], { projectPath: project });
  writeFileSync(
    join(project, "transcript.json"),
    JSON.stringify({
      timing_granularity: "segment",
      segments: [
        { source_id: "src-001", start: 0, end: 1, text: "hello" },
        { source_id: "src-001", start: 2.5, end: 3, text: "um" },
      ],
    }),
  );
  await exploreProject(project, { asr: "external" });
  reviewProject(project);
  const proposal = structuredClone(productionProposalExample) as unknown as ProductionProposalArtifact;
  proposal.presentation_intent = "knowledge_explainer";
  proposal.recommended_option_id = "balanced";
  proposal.options[0]!.id = "balanced";
  proposal.options[0]!.label = "克制增强";
  proposal.options[0]!.cleanup.cut_candidate_ids = ["c-002-filler"];
  proposal.options[0]!.images = { needed: true, reason: "one abstract idea is not visible in source", missing_assets: ["concept-image"] };
  proposal.options[0]!.music = { source: "minimax", mood: "quiet tech bed", ducking: true, notes: ["acquire only after OK"] };
  proposal.options[0]!.sfx = { enabled: true, usage: "subtle click accents", restraint: "low volume" };
  proposal.options[1]!.id = "cleanup-only";
  proposal.options[1]!.label = "只清理";
  proposal.options[1]!.cleanup.cut_candidate_ids = ["c-002-filler"];
  writeFileSync(join(project, "production-proposal.json"), JSON.stringify(proposal));

  const proposed = proposalProject(project);
  expect(proposed.ok).toBe(true);
  if (!proposed.ok) throw new Error(proposed.error.message);
  expect(proposed.data.recommended_option_id).toBe("balanced");
  expect(proposed.data.recommended_option.cut_candidate_count).toBe(1);
  expect(proposed.data.next_required_artifacts).toContain("edit-plan.json");
  expect(proposed.data.next_required_artifacts).toContain("focus-candidates.json");
  expect(proposed.data.next_required_artifacts).toContain("music-request.json");
  expect(existsSync(proposed.data.proposal_markdown_path)).toBe(true);
  const markdown = readFileSync(proposed.data.proposal_markdown_path, "utf8");
  expect(markdown).toContain("## Reply");
  expect(markdown).toContain("OK: use balanced");
  expect(existsSync(join(project, "edit-plan.json"))).toBe(false);
  expect(existsSync(join(project, "focus-candidates.json"))).toBe(false);
  expect(existsSync(join(project, "music-request.json"))).toBe(false);
  expect(existsSync(join(project, "enrichment-plan.json"))).toBe(false);

  const initialProposalLifecycle = JSON.parse(readFileSync(join(project, "artifact-manifest.json"), "utf8")) as {
    artifacts: Record<string, unknown>;
  };
  expect(Boolean(initialProposalLifecycle.artifacts["proposal-selection:balanced"])).toBe(true);
  expect(Boolean(initialProposalLifecycle.artifacts["proposal-selection:cleanup-only"])).toBe(true);
  proposal.options[0]!.cleanup.cut_candidate_ids = ["missing-candidate", "another-missing-candidate"];
  writeFileSync(join(project, "production-proposal.json"), JSON.stringify(proposal));
  const invalid = proposalProject(project);
  expect(invalid.ok).toBe(false);
  if (invalid.ok) throw new Error("expected invalid proposal");
  expect(invalid.error.code).toBe("ARTIFACT_VALIDATION_FAILED");
  expect(invalid.error.issues?.length).toBe(2);
  expect(invalid.error.issues?.[0]?.message).toContain("unknown cleanup candidate_id");
});

test("visual acquisition accepts a confirmed local handoff candidate", async () => {
  const dir = mkdtempSync(join(tmpdir(), "koubo-visual-project-"));
  const source = join(dir, "raw.mp4");
  const project = join(dir, "project");
  writeFileSync(source, "not real media");
  createProject([source], { projectPath: project });
  writeFileSync(join(project, "assets", "visuals", "handoff-alarm.svg"), '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10H0z"/></svg>');
  writeFileSync(
    join(project, "visual-request.json"),
    JSON.stringify({
      version: "1.0",
      source_mode: "screen_recording",
      presentation_intent: "short_form",
      requests: [
        {
          id: "alarm",
          viewer_job: "make alarm cue visible",
          semantic_query: "alarm clock",
          asset_type: "icon",
          preferred_sources: ["mcp-handoff"],
          reason: "use a confirmed upstream icon instead of text",
          selected_candidate_id: "alarm-handoff",
        },
      ],
    }),
  );
  writeFileSync(
    join(project, "visual-candidates.json"),
    JSON.stringify({
      version: "1.0",
      candidates: [
        {
          id: "alarm-handoff",
          request_id: "alarm",
          provider: "mcp-handoff",
          asset_type: "icon",
          title: "alarm icon",
          semantic_query: "alarm clock",
          local_path: "assets/visuals/handoff-alarm.svg",
          source_url: "https://example.com/icon-source",
          license: "MIT",
          renderable: true,
          recommended: true,
          reason: "host MCP selected source icon",
          runtime_dependencies: [],
        },
      ],
      warnings: [],
    }),
  );

  const catalog = visualCatalogProject(project);
  expect(catalog.ok).toBe(true);
  const acquired = await visualAcquireProject(project);
  expect(acquired.ok).toBe(true);
  if (!acquired.ok) throw new Error(acquired.error.message);
  expect(acquired.data.acquired_count).toBe(1);
  expect(acquired.data.assets[0]?.id).toBe("visual-alarm");
  expect(existsSync(join(project, "assets", "icons", "visual-alarm.svg"))).toBe(true);
  const reviewed = visualReviewProject(project);
  expect(reviewed.ok).toBe(true);
  if (!reviewed.ok) throw new Error(reviewed.error.message);
  expect(reviewed.data.review.items[0]?.provider).toBe("mcp-handoff");
  const manifest = parseAssetManifest(JSON.parse(readFileSync(join(project, "asset-manifest.json"), "utf8")));
  expect(manifest.assets[0]?.provenance).toBe("visual-acquisition");
});

test("visual lifecycle binds acquisition to selected members and cleans removed candidate records", async () => {
  const dir = mkdtempSync(join(tmpdir(), "koubo-visual-lineage-"));
  const source = join(dir, "raw.mp4");
  const project = join(dir, "project");
  writeFileSync(source, "not real media");
  createProject([source], { projectPath: project, providerMode: "platform" });
  writeFileSync(join(project, "selected.svg"), '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10H0z"/></svg>');
  writeFileSync(join(project, "alternate.svg"), '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="4"/></svg>');
  writeFileSync(
    join(project, "visual-request.json"),
    JSON.stringify({
      version: "1.0",
      source_mode: "screen_recording",
      presentation_intent: "short_form",
      requests: [{
        id: "alarm",
        viewer_job: "make the alarm cue visible",
        semantic_query: "alarm clock",
        asset_type: "icon",
        preferred_sources: ["iconify"],
        reason: "the source needs a visible alarm cue",
        selected_candidate_id: "alarm-selected",
        selection_reason: "best semantic match",
      }],
    }),
  );
  const writeCandidates = (includeAlternate: boolean, alternateTitle = "alternate alarm", selectedTitle = "selected alarm") => writeFileSync(
    join(project, "visual-candidates.json"),
    JSON.stringify({
      version: "1.0",
      candidates: [
        {
          id: "alarm-selected",
          request_id: "alarm",
          provider: "iconify",
          asset_type: "icon",
          title: selectedTitle,
          semantic_query: "alarm clock",
          local_path: "selected.svg",
          license: "MIT",
          renderable: true,
          recommended: true,
          reason: "selected local candidate",
          runtime_dependencies: [],
        },
        ...(includeAlternate ? [{
          id: "alarm-alternate",
          request_id: "alarm",
          provider: "iconify",
          asset_type: "icon",
          title: alternateTitle,
          semantic_query: "alarm clock",
          local_path: "alternate.svg",
          license: "MIT",
          renderable: true,
          recommended: false,
          reason: "unselected local candidate",
          runtime_dependencies: [],
        }] : []),
      ],
      warnings: [],
    }),
  );

  writeCandidates(true);
  const catalog = visualCatalogProject(project, { providerMode: "platform" });
  expect(catalog.ok).toBe(true);
  const searched = await visualSearchProject(project, { providerMode: "platform" });
  expect(searched.ok).toBe(true);
  const acquired = await visualAcquireProject(project, { providerMode: "platform" });
  expect(acquired.ok).toBe(true);
  if (!acquired.ok) throw new Error(acquired.error.message);

  const readLifecycle = () => JSON.parse(readFileSync(join(project, "artifact-manifest.json"), "utf8")) as {
    artifacts: Record<string, { fingerprint: string; inputs: Array<{ key: string; fingerprint: string }> }>;
    stage_attempts: Record<string, { status: string; input_fingerprint: string; failure_code?: string }>;
  };
  let lifecycle = readLifecycle();
  expect(lifecycle.stage_attempts["project.visual-catalog"]?.status).toBe("success");
  expect(lifecycle.stage_attempts["project.visual-search"]?.status).toBe("success");
  expect(lifecycle.stage_attempts["project.visual-acquire"]?.status).toBe("success");
  expect(Boolean(lifecycle.artifacts["visual-request:alarm"])).toBe(true);
  expect(Boolean(lifecycle.artifacts["visual-candidate:alarm:alarm-selected"])).toBe(true);
  expect(Boolean(lifecycle.artifacts["visual-candidate:alarm:alarm-alternate"])).toBe(true);
  expect(Boolean(lifecycle.artifacts["asset:visual-alarm"])).toBe(true);
  expect(Boolean(lifecycle.artifacts["asset-manifest"])).toBe(true);
  expect(Boolean(lifecycle.artifacts["visual-review-view"])).toBe(true);
  const acquisitionInputKeys = lifecycle.artifacts["visual-acquisition"]!.inputs.map((input) => input.key);
  expect(acquisitionInputKeys).toContain("visual-request:alarm");
  expect(acquisitionInputKeys).toContain("visual-candidate:alarm:alarm-selected");
  expect(acquisitionInputKeys).toContain("asset:visual-alarm");
  expect(acquisitionInputKeys.includes("visual-candidate:alarm:alarm-alternate")).toBe(false);
  expect(acquisitionInputKeys.includes("visual-request")).toBe(false);
  expect(acquisitionInputKeys.includes("visual-candidates")).toBe(false);
  const acquisitionFingerprint = lifecycle.artifacts["visual-acquisition"]!.fingerprint;

  writeCandidates(true, "renamed alternate alarm");
  const searchedAgain = await visualSearchProject(project, { providerMode: "platform" });
  expect(searchedAgain.ok).toBe(true);
  const reviewedAfterUnselectedChange = visualReviewProject(project, { providerMode: "platform" });
  expect(reviewedAfterUnselectedChange.ok).toBe(true);
  lifecycle = readLifecycle();
  expect(lifecycle.artifacts["visual-acquisition"]?.fingerprint).toBe(acquisitionFingerprint);

  writeCandidates(false);
  const searchedWithoutAlternate = await visualSearchProject(project, { providerMode: "platform" });
  expect(searchedWithoutAlternate.ok).toBe(true);
  lifecycle = readLifecycle();
  expect(Boolean(lifecycle.artifacts["visual-candidate:alarm:alarm-alternate"])).toBe(false);
  expect(Boolean(lifecycle.artifacts["visual-candidate:alarm:alarm-selected"])).toBe(true);
  const reviewedAfterCandidateCleanup = visualReviewProject(project, { providerMode: "platform" });
  expect(reviewedAfterCandidateCleanup.ok).toBe(true);

  writeCandidates(false, "unused", "mutated selected alarm");
  const staleSelectedReview = visualReviewProject(project, { providerMode: "platform" });
  expect(staleSelectedReview.ok).toBe(false);
  if (staleSelectedReview.ok) throw new Error("expected selected candidate lineage failure");
  expect(staleSelectedReview.error.code).toBe("ARTIFACT_INVALID");
});

test("visual acquire records known-input failure without replacing the last successful acquisition", async () => {
  const dir = mkdtempSync(join(tmpdir(), "koubo-visual-failure-lineage-"));
  const source = join(dir, "raw.mp4");
  const project = join(dir, "project");
  writeFileSync(source, "not real media");
  createProject([source], { projectPath: project, providerMode: "platform" });
  writeFileSync(join(project, "selected.svg"), '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10H0z"/></svg>');
  const writeRequest = (candidateId: string) => writeFileSync(
    join(project, "visual-request.json"),
    JSON.stringify({
      version: "1.0",
      source_mode: "screen_recording",
      presentation_intent: "short_form",
      requests: [{
        id: "alarm",
        viewer_job: "make the alarm cue visible",
        semantic_query: "alarm clock",
        asset_type: "icon",
        preferred_sources: ["iconify"],
        reason: "the source needs a visible alarm cue",
        selected_candidate_id: candidateId,
        selection_reason: "reviewed local candidate",
      }],
    }),
  );
  writeFileSync(
    join(project, "visual-candidates.json"),
    JSON.stringify({
      version: "1.0",
      candidates: [{
        id: "alarm-selected",
        request_id: "alarm",
        provider: "iconify",
        asset_type: "icon",
        title: "selected alarm",
        semantic_query: "alarm clock",
        local_path: "selected.svg",
        license: "MIT",
        renderable: true,
        recommended: true,
        reason: "selected local candidate",
        runtime_dependencies: [],
      }],
      warnings: [],
    }),
  );

  writeRequest("alarm-selected");
  const acquired = await visualAcquireProject(project, { providerMode: "platform" });
  expect(acquired.ok).toBe(true);
  const acquisitionPath = join(project, "visual-acquisition.json");
  const acquisitionBeforeFailure = readFileSync(acquisitionPath, "utf8");
  const manifestBeforeFailure = JSON.parse(readFileSync(join(project, "artifact-manifest.json"), "utf8")) as {
    artifacts: Record<string, { fingerprint: string }>;
  };
  const acquisitionFingerprint = manifestBeforeFailure.artifacts["visual-acquisition"]!.fingerprint;

  writeRequest("missing-candidate");
  const failed = await visualAcquireProject(project, { providerMode: "platform" });
  expect(failed.ok).toBe(false);
  if (failed.ok) throw new Error("expected visual acquire failure");
  expect(failed.error.code).toBe("PLATFORM_PROVIDER_BLOCKED");
  expect(readFileSync(acquisitionPath, "utf8")).toBe(acquisitionBeforeFailure);
  const manifestAfterFailure = JSON.parse(readFileSync(join(project, "artifact-manifest.json"), "utf8")) as {
    artifacts: Record<string, { fingerprint: string }>;
    stage_attempts: Record<string, { status: string; input_fingerprint: string; failure_code?: string }>;
  };
  expect(manifestAfterFailure.artifacts["visual-acquisition"]?.fingerprint).toBe(acquisitionFingerprint);
  expect(manifestAfterFailure.stage_attempts["project.visual-acquire"]?.status).toBe("failed");
  expect(manifestAfterFailure.stage_attempts["project.visual-acquire"]?.input_fingerprint.startsWith("sha256:")).toBe(true);
  expect(manifestAfterFailure.stage_attempts["project.visual-acquire"]?.failure_code).toBe("PLATFORM_PROVIDER_BLOCKED");
});

test("visual acquire wrapper failure restores the current asset, manifest, and acquisition checkpoint", async () => {
  const dir = mkdtempSync(join(tmpdir(), "koubo-visual-wrapper-checkpoint-"));
  const source = join(dir, "raw.mp4");
  const project = join(dir, "project");
  writeFileSync(source, "not real media");
  createProject([source], { projectPath: project, providerMode: "platform" });
  const selectedPath = join(project, "selected.svg");
  writeFileSync(selectedPath, '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10H0z"/></svg>');
  writeFileSync(join(project, "visual-request.json"), JSON.stringify({
    version: "1.0",
    source_mode: "screen_recording",
    presentation_intent: "short_form",
    requests: [{
      id: "alarm",
      viewer_job: "make the alarm cue visible",
      semantic_query: "alarm clock",
      asset_type: "icon",
      preferred_sources: ["iconify"],
      reason: "the source needs a visible alarm cue",
      selected_candidate_id: "alarm-selected",
      selection_reason: "reviewed local candidate",
    }],
  }));
  writeFileSync(join(project, "visual-candidates.json"), JSON.stringify({
    version: "1.0",
    candidates: [{
      id: "alarm-selected",
      request_id: "alarm",
      provider: "iconify",
      asset_type: "icon",
      title: "selected alarm",
      semantic_query: "alarm clock",
      local_path: "selected.svg",
      license: "MIT",
      renderable: true,
      recommended: true,
      reason: "selected local candidate",
      runtime_dependencies: [],
    }],
    warnings: [],
  }));

  const first = await visualAcquireProject(project, { providerMode: "platform" });
  expect(first.ok).toBe(true);
  const assetPath = join(project, "assets", "icons", "visual-alarm.svg");
  const acquisitionPath = join(project, "visual-acquisition.json");
  const currentAsset = readFileSync(assetPath);
  const currentAcquisition = readFileSync(acquisitionPath, "utf8");
  writeFileSync(selectedPath, '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="4"/></svg>');
  mkdirSync(join(project, "assets", "images"), { recursive: true });
  writeFileSync(join(project, "assets", "images", "untracked.png"), "untracked image bytes");
  const manifestPath = join(project, "asset-manifest.json");
  const manifest = parseAssetManifest(JSON.parse(readFileSync(manifestPath, "utf8")));
  manifest.assets.push({ id: "untracked", path: "assets/images/untracked.png", type: "image", source: "user" });
  const currentManifest = `${JSON.stringify(manifest, null, 2)}\n`;
  writeFileSync(manifestPath, currentManifest);

  const failed = await visualAcquireProject(project, { providerMode: "platform" });
  expect(failed.ok).toBe(false);
  if (failed.ok) throw new Error("expected visual wrapper failure");
  expect(failed.error.code).toBe("LINEAGE_UNPROVEN");
  expect(readFileSync(assetPath)).toEqual(currentAsset);
  expect(readFileSync(manifestPath, "utf8")).toBe(currentManifest);
  expect(readFileSync(acquisitionPath, "utf8")).toBe(currentAcquisition);
  expect(nodeFs.readdirSync(project).some((entry) => entry.startsWith(".visual-acquire-staging-"))).toBe(false);
});

test("visual acquire preserves current non-visual asset lineage in a mixed manifest", async () => {
  const dir = mkdtempSync(join(tmpdir(), "koubo-visual-mixed-assets-"));
  const source = join(dir, "raw.mp4");
  const project = join(dir, "project");
  writeFileSync(source, "not real media");
  createProject([source], { projectPath: project, providerMode: "platform" });

  const userAssetPath = join(project, "assets", "images", "user-image.png");
  mkdirSync(join(project, "assets", "images"), { recursive: true });
  writeFileSync(userAssetPath, "user image bytes");
  writeFileSync(
    join(project, "asset-manifest.json"),
    JSON.stringify({ assets: [{ id: "user-image", path: "assets/images/user-image.png", type: "image", source: "user" }] }),
  );
  const lifecyclePath = join(project, "artifact-manifest.json");
  const lifecycle = JSON.parse(readFileSync(lifecyclePath, "utf8")) as {
    artifacts: Record<string, Record<string, unknown>>;
    updated_at: string;
  };
  const now = new Date().toISOString();
  const userAssetFingerprint = `sha256:${createHash("sha256").update(readFileSync(userAssetPath)).digest("hex")}`;
  const producerVersion = String(lifecycle.artifacts.project?.producer_cli_version ?? "0.0.0-test");
  lifecycle.artifacts["asset:user-image"] = {
    key: "asset:user-image",
    path: "assets/images/user-image.png",
    role: "authoritative_input",
    schema_version: "bytes-v1",
    fingerprint: userAssetFingerprint,
    file_sha256: userAssetFingerprint,
    authored_by: "user",
    validated_by_command: "project.enrich-plan",
    producer_cli_version: producerVersion,
    command_contract_version: "1.0",
    inputs: [],
    validated_at: now,
  };
  lifecycle.updated_at = now;
  writeFileSync(lifecyclePath, `${JSON.stringify(lifecycle, null, 2)}\n`);
  const preservedRecord = JSON.parse(JSON.stringify(lifecycle.artifacts["asset:user-image"]));

  writeFileSync(join(project, "selected.svg"), '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10H0z"/></svg>');
  writeFileSync(
    join(project, "visual-request.json"),
    JSON.stringify({
      version: "1.0",
      source_mode: "screen_recording",
      presentation_intent: "short_form",
      requests: [{
        id: "alarm",
        viewer_job: "make the alarm cue visible",
        semantic_query: "alarm clock",
        asset_type: "icon",
        preferred_sources: ["iconify"],
        reason: "the source needs a visible alarm cue",
        selected_candidate_id: "alarm-selected",
        selection_reason: "reviewed local candidate",
      }],
    }),
  );
  writeFileSync(
    join(project, "visual-candidates.json"),
    JSON.stringify({
      version: "1.0",
      candidates: [{
        id: "alarm-selected",
        request_id: "alarm",
        provider: "iconify",
        asset_type: "icon",
        title: "selected alarm",
        semantic_query: "alarm clock",
        local_path: "selected.svg",
        license: "MIT",
        renderable: true,
        recommended: true,
        reason: "selected local candidate",
        runtime_dependencies: [],
      }],
      warnings: [],
    }),
  );

  const acquired = await visualAcquireProject(project, { providerMode: "platform" });
  expect(acquired.ok).toBe(true);
  if (!acquired.ok) throw new Error(acquired.error.message);
  const after = JSON.parse(readFileSync(lifecyclePath, "utf8")) as {
    artifacts: Record<string, { inputs: Array<{ key: string }> }>;
  };
  expect(after.artifacts["asset:user-image"]).toEqual(preservedRecord);
  expect(Boolean(after.artifacts["asset:visual-alarm"])).toBe(true);
  const manifestInputKeys = after.artifacts["asset-manifest"]!.inputs.map((input) => input.key);
  expect(manifestInputKeys).toContain("asset:user-image");
  expect(manifestInputKeys).toContain("asset:visual-alarm");
  const acquisitionInputKeys = after.artifacts["visual-acquisition"]!.inputs.map((input) => input.key);
  expect(acquisitionInputKeys.includes("asset:user-image")).toBe(false);
  expect(acquisitionInputKeys).toContain("asset:visual-alarm");
});

test("explore fails clearly when transcript is missing", async () => {
  const dir = mkdtempSync(join(tmpdir(), "koubo-clip-"));
  const source = join(dir, "raw.mp4");
  const project = join(dir, "project");
  writeFileSync(source, "not real media");
  createProject([source], { projectPath: project });

  const explored = await exploreProject(project, { asr: "off" });
  expect(explored.ok).toBe(false);
  if (explored.ok) throw new Error("expected failure");
  expect(explored.error.message).toContain("missing transcript.json");
});

test("normalizes whisper json to segment transcript ranges", () => {
  const segments = normalizeWhisperJson(
    {
      transcription: [
        { offsets: { from: 0, to: 1250 }, text: " hello " },
        { timestamps: { from: "00:00:02,000", to: "00:00:03,500" }, text: "world" },
      ],
    },
    "src-001",
  );
  expect(segments).toEqual([
    { source_id: "src-001", start: 0, end: 1.25, text: "hello" },
    { source_id: "src-001", start: 2, end: 3.5, text: "world" },
  ]);
});

test("normalizes cloudflare whisper segments and vtt", () => {
  expect(
    normalizeCloudflareWhisperResult(
      {
        segments: [{ start: 0, end: 1.25, text: " hello " }],
      },
      "src-001",
    ),
  ).toEqual([{ source_id: "src-001", start: 0, end: 1.25, text: "hello" }]);
  expect(
    normalizeCloudflareWhisperResult(
      {
        vtt: "WEBVTT\n\n00:00:02.000 --> 00:00:03.500\nworld\n",
      },
      "src-001",
    ),
  ).toEqual([{ source_id: "src-001", start: 2, end: 3.5, text: "world" }]);
});

test("renders and inspects an edit plan", async () => {
  if (!commandExists("ffmpeg")) return;
  const dir = mkdtempSync(join(tmpdir(), "koubo-clip-render-"));
  const source = join(dir, "raw.mp4");
  const project = join(dir, "project");
  makeSampleVideo(source);
  createProject([source], { projectPath: project });
  writeFileSync(
    join(project, "transcript.json"),
    JSON.stringify({
      timing_granularity: "segment",
      segments: [
        { source_id: "src-001", start: 0, end: 1, text: "keep" },
        { source_id: "src-001", start: 1, end: 1.4, text: "um" },
        { source_id: "src-001", start: 1.4, end: 2.4, text: "after" },
        { source_id: "src-001", start: 2.45, end: 2.9, text: "after" },
      ],
    }),
  );
  await exploreProject(project, { asr: "external" });
  reviewProject(project);
  confirmProposalAndWriteEditPlan(project, [{ action: "cut", candidate_id: "c-002-filler" }]);

  const rendered = renderProject(project);
  expect(rendered.ok).toBe(true);
  if (!rendered.ok) throw new Error(rendered.error.message);
  expect(existsSync(rendered.data.clean_render_path)).toBe(true);

  const inspected = inspectProject(project);
  expect(inspected.ok).toBe(true);
  if (!inspected.ok) throw new Error(inspected.error.message);
  expect(inspected.data.captions_present).toBe(true);
  expect(inspected.data.warnings.length === 0).toBe(true);
  expect(inspected.data.removed_ranges[0]?.source_id).toBe("src-001");
  expect(inspected.data.removed_ranges[0]?.candidate_id).toBe("c-002-filler");
  expect(inspected.data.retained_risks.some((risk) => risk.candidate_id === "c-003-repeat")).toBe(true);
  const report = readFileSync(inspected.data.report_path, "utf8");
  expect(report).toContain("## Removed Ranges");
  expect(report).toContain("c-002-filler src-001");
  expect(report).toContain("## Retained Risks");
  expect(report).toContain("c-003-repeat src-001");
  const edl = JSON.parse(readFileSync(join(project, "edl.json"), "utf8"));
  expect(edl.entries[0].end).toBe(1.05);
  expect(edl.entries[1].start).toBe(1.3499999999999999);
});

test("rejects unsafe precise cut timing", async () => {
  const textOnlyProject = await projectWithAnalysis("text-only", undefined);
  const textOnlyRender = renderProject(textOnlyProject);
  expect(textOnlyRender.ok).toBe(false);
  if (textOnlyRender.ok) throw new Error("expected text-only failure");
  expect(textOnlyRender.error.message).toContain("text-only");

  const chineseProject = await projectWithAnalysis("word", "zh");
  const chineseReview = reviewProject(chineseProject);
  expect(chineseReview.ok).toBe(true);
  if (!chineseReview.ok) throw new Error(chineseReview.error.message);
  expect(chineseReview.data.unresolved_risk_count).toBe(1);
  expect(readFileSync(chineseReview.data.review_package_path, "utf8")).toContain("unvalidated Chinese word timing");
  const chineseRender = renderProject(chineseProject);
  expect(chineseRender.ok).toBe(false);
  if (chineseRender.ok) throw new Error("expected Chinese timing failure");
  expect(chineseRender.error.message).toContain("Chinese");
});

test("normalizes rounded SRT millisecond rollover", () => {
  if (!commandExists("ffmpeg")) return;
  const dir = mkdtempSync(join(tmpdir(), "koubo-clip-srt-"));
  const source = join(dir, "raw.mp4");
  const project = join(dir, "project");
  makeSampleVideo(source, 2);
  createProject([source], { projectPath: project });
  writeFileSync(
    join(project, "transcript.json"),
    JSON.stringify({
      timing_granularity: "segment",
      segments: [{ source_id: "src-001", start: 0.9996, end: 1.2004, text: "edge" }],
    }),
  );
  void exploreProject(project, { asr: "external" });
  confirmProposalAndWriteEditPlan(project);
  const rendered = renderProject(project);
  expect(rendered.ok).toBe(true);
  if (!rendered.ok) throw new Error(rendered.error.message);
  const subtitles = readFileSync(rendered.data.subtitles_path, "utf8");
  expect(subtitles).toContain("00:00:01,000 --> 00:00:01,200");
  expect(subtitles.includes(",1000")).toBe(false);
});

test("explore clips transcript ranges to source duration", async () => {
  if (!commandExists("ffmpeg")) return;
  const dir = mkdtempSync(join(tmpdir(), "koubo-clip-clip-"));
  const source = join(dir, "raw.mp4");
  const project = join(dir, "project");
  makeSampleVideo(source, 1);
  createProject([source], { projectPath: project });
  writeFileSync(
    join(project, "transcript.json"),
    JSON.stringify({
      timing_granularity: "segment",
      segments: [{ source_id: "src-001", start: 0.8, end: 1.5, text: "edge" }],
    }),
  );
  const explored = await exploreProject(project, { asr: "external" });
  expect(explored.ok).toBe(true);
  if (!explored.ok) throw new Error(explored.error.message);
  const duration = JSON.parse(readFileSync(join(project, "sources.json"), "utf8")).sources[0].identity.duration_seconds;
  const transcript = JSON.parse(readFileSync(join(project, "transcript.json"), "utf8"));
  expect(transcript.segments[0].end).toBe(duration);
});

test("renders two sources in manifest order", async () => {
  if (!commandExists("ffmpeg")) return;
  const dir = mkdtempSync(join(tmpdir(), "koubo-clip-two-source-"));
  const sourceA = join(dir, "a.mp4");
  const sourceB = join(dir, "b.mp4");
  const project = join(dir, "project");
  makeSampleVideo(sourceA, 1);
  makeSampleVideo(sourceB, 1);
  createProject([sourceA, sourceB], { projectPath: project });
  writeFileSync(
    join(project, "transcript.json"),
    JSON.stringify({
      timing_granularity: "segment",
      segments: [
        { source_id: "src-001", start: 0, end: 0.8, text: "first" },
        { source_id: "src-002", start: 0, end: 0.8, text: "second" },
      ],
    }),
  );
  await exploreProject(project, { asr: "external" });
  writeOwnedAnalysis(
    project,
    {
      candidates: [
        { id: "c-001-cut", source_id: "src-001", start: 0.2, end: 0.5, text: "first", type: "manual", reason: "remove setup", confidence: 0.9 },
        { id: "c-002-risk", source_id: "src-002", start: 0.2, end: 0.5, text: "second", type: "manual", reason: "needs review", confidence: 0.6 },
      ],
    },
  );
  reviewProject(project);
  confirmProposalAndWriteEditPlan(project, [{ action: "cut", candidate_id: "c-001-cut" }]);
  const rendered = renderProject(project);
  expect(rendered.ok).toBe(true);
  if (!rendered.ok) throw new Error(rendered.error.message);
  const inspected = inspectProject(project);
  expect(inspected.ok).toBe(true);
  if (!inspected.ok) throw new Error(inspected.error.message);
  expect(inspected.data.removed_ranges[0]?.source_id).toBe("src-001");
  expect(inspected.data.retained_risks.some((risk) => risk.source_id === "src-002" && risk.candidate_id === "c-002-risk")).toBe(true);
  const edl = JSON.parse(readFileSync(join(project, "edl.json"), "utf8"));
  expect(edl.entries.map((entry: { source_id: string }) => entry.source_id)).toEqual(["src-001", "src-001", "src-002"]);
});

test("honors explicit source order", async () => {
  if (!commandExists("ffmpeg")) return;
  const dir = mkdtempSync(join(tmpdir(), "koubo-clip-source-order-"));
  const sourceA = join(dir, "a.mp4");
  const sourceB = join(dir, "b.mp4");
  const project = join(dir, "project");
  makeSampleVideo(sourceA, 1);
  makeSampleVideo(sourceB, 1);
  createProject([sourceA, sourceB], { projectPath: project });
  writeFileSync(
    join(project, "transcript.json"),
    JSON.stringify({
      timing_granularity: "segment",
      segments: [
        { source_id: "src-001", start: 0, end: 0.8, text: "first" },
        { source_id: "src-002", start: 0, end: 0.8, text: "second" },
      ],
    }),
  );
  await exploreProject(project, { asr: "external" });
  confirmProposalAndWriteEditPlan(project, [], ["src-002", "src-001"]);
  const rendered = renderProject(project);
  expect(rendered.ok).toBe(true);
  if (!rendered.ok) throw new Error(rendered.error.message);
  const edl = JSON.parse(readFileSync(join(project, "edl.json"), "utf8"));
  expect(edl.entries.map((entry: { source_id: string }) => entry.source_id)).toEqual(["src-002", "src-001"]);
});

test("rejects edit plans that reference unknown candidates", async () => {
  const project = await projectWithAnalysis("segment", undefined);
  confirmProposalAndWriteEditPlan(project, [{ action: "cut", candidate_id: "missing" }]);
  const rendered = renderProject(project);
  expect(rendered.ok).toBe(false);
  if (rendered.ok) throw new Error("expected unknown candidate failure");
  expect(rendered.error.message).toContain("unknown candidate_id");
});

test("rejects candidate ranges outside source duration", () => {
  if (!commandExists("ffmpeg")) return;
  const dir = mkdtempSync(join(tmpdir(), "koubo-clip-bounds-"));
  const source = join(dir, "raw.mp4");
  const project = join(dir, "project");
  makeSampleVideo(source, 1);
  createProject([source], { projectPath: project });
  writeFileSync(
    join(project, "transcript.json"),
    JSON.stringify({
      timing_granularity: "segment",
      segments: [{ source_id: "src-001", start: 0, end: 1, text: "keep" }],
    }),
  );
  void exploreProject(project, { asr: "external" });
  writeOwnedAnalysis(
    project,
    {
      candidates: [{ id: "c-001-bad", source_id: "src-001", start: 0.5, end: 2, text: "bad", type: "manual", reason: "test", confidence: 0.9 }],
    },
  );
  confirmProposalAndWriteEditPlan(project, [{ action: "cut", candidate_id: "c-001-bad" }]);
  const rendered = renderProject(project);
  expect(rendered.ok).toBe(false);
  if (rendered.ok) throw new Error("expected bounds failure");
  expect(rendered.error.message).toContain("exceeds source duration");
});

test("rejects overlapping selected cut candidates", () => {
  if (!commandExists("ffmpeg")) return;
  const dir = mkdtempSync(join(tmpdir(), "koubo-clip-overlap-"));
  const source = join(dir, "raw.mp4");
  const project = join(dir, "project");
  makeSampleVideo(source, 2);
  createProject([source], { projectPath: project });
  writeFileSync(
    join(project, "transcript.json"),
    JSON.stringify({
      timing_granularity: "segment",
      segments: [{ source_id: "src-001", start: 0, end: 2, text: "keep" }],
    }),
  );
  void exploreProject(project, { asr: "external" });
  writeOwnedAnalysis(
    project,
    {
      candidates: [
        { id: "c-001-a", source_id: "src-001", start: 0.2, end: 0.8, text: "a", type: "manual", reason: "test", confidence: 0.9 },
        { id: "c-002-b", source_id: "src-001", start: 0.7, end: 1.2, text: "b", type: "manual", reason: "test", confidence: 0.9 },
      ],
    },
  );
  confirmProposalAndWriteEditPlan(project, [
    { action: "cut", candidate_id: "c-001-a" },
    { action: "cut", candidate_id: "c-002-b" },
  ]);
  const rendered = renderProject(project);
  expect(rendered.ok).toBe(false);
  if (rendered.ok) throw new Error("expected overlap failure");
  expect(rendered.error.message).toContain("overlap");
});


test("validates platform asset_usage_plan with prepared visual and audio assets", () => {
  if (!commandExists("ffmpeg")) return;
  const { project } = readyProject(2, "platform");
  const assetDir = join(project, "assets", "koubo-clip");
  mkdirSync(assetDir, { recursive: true });
  makeMusic(join(assetDir, "bgm.wav"), 2);
  makeMusic(join(assetDir, "sfx-click.wav"), 0.3);
  makeStillImage(join(assetDir, "bluetooth-icon.png"));
  writeFileSync(
    join(assetDir, "prepared-assets.json"),
    JSON.stringify({
      assets: [
        { asset_ref: "assets/koubo-clip/bgm.wav", type: "music" },
        { asset_ref: "assets/koubo-clip/sfx-click.wav", type: "sfx" },
        { asset_ref: "assets/koubo-clip/bluetooth-icon.png", type: "icon" },
      ],
    }),
  );
  writeFileSync(
    join(project, "asset-usage-plan.json"),
    JSON.stringify({
        music: [{ asset_ref: "assets/koubo-clip/bgm.wav", start: 0, end: 1.8, volume: 0.18, duck_original_audio: true, fade_in: 0.1, fade_out: 0.1, purpose: "增强科技感和节奏感" }],
        sfx: [{ asset_ref: "assets/koubo-clip/sfx-click.wav", time: 0.7, duration: 0.2, volume: 0.35, purpose: "语音拨打电话功能出现时的提示音" }],
        visual_assets: [{ asset_ref: "assets/koubo-clip/bluetooth-icon.png", start: 0.2, end: 1.1, position: "top-right", size: "small", animation: "fade-in", asset_type: "icon", purpose: "强化蓝牙耳机产品属性" }],
    }),
  );

  const enriched = enrichPlanProject(project, { providerMode: "platform" });
  expect(enriched.ok).toBe(true);
  if (!enriched.ok) throw new Error(enriched.error.message);
  expect(enriched.data.asset_summary.map((asset) => asset.path)).toEqual([
    "assets/koubo-clip/bgm.wav",
    "assets/koubo-clip/sfx-click.wav",
    "assets/koubo-clip/bluetooth-icon.png",
  ]);
  expect(enriched.data.audio_usage.music[0]?.asset_id).toContain("music-1-bgm");
  expect(enriched.data.audio_usage.sfx[0]?.asset_id).toContain("sfx-1-sfx-click");
  expect(enriched.data.element_usage.some((usage) => usage.asset_id?.includes("visual-1-bluetooth-icon"))).toBe(true);
  expect(enriched.data.element_usage.some((usage) => usage.element_type === "visual_asset")).toBe(true);
});

test("renders platform asset_usage_plan audio assets and reports audio_usage", () => {
  if (!commandExists("ffmpeg")) return;
  const { project } = readyProject(2, "platform");
  const assetDir = join(project, "assets", "koubo-clip");
  mkdirSync(assetDir, { recursive: true });
  makeMusic(join(assetDir, "bgm.wav"), 2);
  makeMusic(join(assetDir, "sfx-click.wav"), 0.3);
  writeFileSync(
    join(project, "asset-usage-plan.json"),
    JSON.stringify({
        music: [{ asset_ref: "assets/koubo-clip/bgm.wav", start: 0, end: 1.8, volume: 0.12, duck_original_audio: true, fade_in: 0.1, fade_out: 0.1, purpose: "背景节奏" }],
        sfx: [{ asset_ref: "assets/koubo-clip/sfx-click.wav", time: 0.7, duration: 0.2, volume: 0.2, purpose: "按钮提示音" }],
        visual_assets: [],
    }),
  );

  const normalized = enrichPlanProject(project, { providerMode: "platform" });
  expect(normalized.ok).toBe(true);
  if (!normalized.ok) throw new Error(normalized.error.message);
  const rendered = renderProject(project, { providerMode: "platform" });
  expect(rendered.ok).toBe(true);
  if (!rendered.ok) throw new Error(rendered.error.message);
  expect(rendered.data.enrichment_applied).toBe(true);
  expect(Boolean(rendered.data.final_render_path && hasAudio(rendered.data.final_render_path))).toBe(true);
  expect(rendered.data.audio_usage.music.length).toBe(1);
  expect(rendered.data.audio_usage.sfx.length).toBe(1);

  const inspected = inspectProject(project, { providerMode: "platform" });
  expect(inspected.ok).toBe(true);
  if (!inspected.ok) throw new Error(inspected.error.message);
  expect(inspected.data.enrichment_applied).toBe(true);
  expect(inspected.data.audio_usage.music[0]?.asset_id).toContain("music-1-bgm");
  expect(inspected.data.audio_usage.sfx[0]?.asset_id).toContain("sfx-1-sfx-click");
  expect(readFileSync(inspected.data.report_path, "utf8")).toContain("## Audio Usage");
});

test("asset_usage_plan normalization fails closed when an asset is missing", () => {
  if (!commandExists("ffmpeg")) return;
  const { project } = readyProject(2, "platform");
  writeFileSync(
    join(project, "asset-usage-plan.json"),
    JSON.stringify({
        music: [{ asset_ref: "assets/koubo-clip/missing.wav", start: 0, end: 1, volume: 0.1, duck_original_audio: true, fade_in: 0.1, fade_out: 0.1, purpose: "missing" }],
        sfx: [],
        visual_assets: [],
    }),
  );
  const normalized = enrichPlanProject(project, { providerMode: "platform" });
  expect(normalized.ok).toBe(false);
  if (normalized.ok) throw new Error("expected missing asset failure");
  expect(normalized.error.code).toBe("missing_asset_ref");
  expect(normalized.error.message).toContain("assets/koubo-clip/missing.wav");
});

test("asset_usage_plan normalization fails closed when the handoff is invalid", () => {
  if (!commandExists("ffmpeg")) return;
  const { project } = readyProject(2, "platform");
  writeFileSync(
    join(project, "asset-usage-plan.json"),
    JSON.stringify({
        music: [{ asset_ref: "assets/koubo-clip/bgm.wav", start: 0, end: 0, purpose: "bad timing" }],
        sfx: [],
        visual_assets: [],
    }),
  );
  const normalized = enrichPlanProject(project, { providerMode: "platform" });
  expect(normalized.ok).toBe(false);
  if (normalized.ok) throw new Error("expected invalid usage plan failure");
  expect(normalized.error.code).toBe("asset_usage_plan_invalid");
  expect(normalized.error.message).toContain("end must be greater");
});

test("keeps pure clipping behavior without asset_usage_plan", () => {
  if (!commandExists("ffmpeg")) return;
  const { project } = readyProject(2, "platform");
  const rendered = renderProject(project, { providerMode: "platform" });
  expect(rendered.ok).toBe(true);
  if (!rendered.ok) throw new Error(rendered.error.message);
  expect(rendered.data.enrichment_applied).toBe(false);
  expect(rendered.data.audio_usage.music).toEqual([]);
  expect(rendered.data.audio_usage.sfx).toEqual([]);
  const inspected = inspectProject(project, { providerMode: "platform" });
  expect(inspected.ok).toBe(true);
  if (!inspected.ok) throw new Error(inspected.error.message);
  expect(inspected.data.enrichment_applied).toBe(false);
  expect(inspected.data.asset_summary).toEqual([]);
  expect(inspected.data.element_usage).toEqual([]);
  expect(inspected.data.audio_usage).toEqual({ music: [], sfx: [] });
});

test("acquires local music and reports provenance through inspect", async () => {
  if (!commandExists("ffmpeg")) return;
  const { project } = readyProject(2);
  makeMusic(join(project, "source", "bed.wav"), 2);
  const catalog = musicCatalogProject(project);
  expect(catalog.ok).toBe(true);
  if (!catalog.ok) throw new Error(catalog.error.message);
  expect(existsSync(catalog.data.music_catalog_path)).toBe(true);

  writeFileSync(
    join(project, "music-request.json"),
    JSON.stringify({
      version: "1.0",
      id: "acquired-bed",
      source: "local",
      local_path: "source/bed.wav",
      reason: "short-form pacing",
      source_mode: "screen_recording",
      presentation_intent: "short_form",
      target_duration_seconds: 1.8,
      volume: 0.1,
      fade_seconds: 0.1,
      ducking: false,
    }),
  );
  const acquired = await musicAcquireProject(project);
  expect(acquired.ok).toBe(true);
  if (!acquired.ok) throw new Error(acquired.error.message);
  expect(acquired.data.asset?.provider).toBe("local");
  const manifest = parseAssetManifest(JSON.parse(readFileSync(join(project, "asset-manifest.json"), "utf8")));
  expect(manifest.assets[0]?.id).toBe("acquired-bed");
  expect(manifest.assets[0]?.path).toBe("assets/music/acquired-bed.wav");

  const review = await musicReviewProject(project);
  expect(review.ok).toBe(true);
  if (!review.ok) throw new Error(review.error.message);
  expect(review.data.review.recommended_music_segment?.asset_id).toBe("acquired-bed");

  writeFileSync(
    join(project, "enrichment-plan.json"),
    JSON.stringify({
      version: "2.0",
      profile: { source_mode: "screen_recording", aspect_ratio: "source", caption_identity: "anchor", layout: "overlay", style: "minimal", frame: "clean" },
      elements: [],
      audio: { music: [{ id: "music", start: 0, end: 1.8, asset_id: "acquired-bed", volume: 0.1, fade_seconds: 0.1, ducking: false, reason: "bed" }], sfx: [] },
    }),
  );
  const rendered = renderProject(project);
  expect(rendered.ok).toBe(true);
  const inspected = inspectProject(project);
  expect(inspected.ok).toBe(true);
  if (!inspected.ok) throw new Error(inspected.error.message);
  const report = readFileSync(inspected.data.report_path, "utf8");
  expect(report).toContain("## Music Review");
  expect(report).toContain("provider=local");
});

test("music acquisition rolls back a partially published checkpoint and records the failed attempt", async () => {
  if (!commandExists("ffmpeg")) return;
  const { project } = readyProject(2);
  makeMusic(join(project, "source", "stable.wav"), 2);
  const writeRequest = (id: string, localPath: string) => writeFileSync(
    join(project, "music-request.json"),
    JSON.stringify({
      version: "1.0",
      id,
      source: "local",
      local_path: localPath,
      reason: "commit-last regression",
      target_duration_seconds: 1.5,
    }),
  );

  writeRequest("stable-bed", "source/stable.wav");
  const committed = await musicAcquireProject(project);
  expect(committed.ok).toBe(true);
  if (!committed.ok) throw new Error(committed.error.message);
  const checkpointPaths = [
    join(project, "assets", "music", "stable-bed.wav"),
    join(project, "asset-manifest.json"),
    join(project, "music-acquisition.json"),
    join(project, "music-review.json"),
    join(project, "music-review.md"),
  ];
  const checkpointHashes = new Map(checkpointPaths.map((path) => [path, createHash("sha256").update(readFileSync(path)).digest("hex")]));
  const lifecycleBefore = JSON.parse(readFileSync(join(project, "artifact-manifest.json"), "utf8")) as {
    artifacts: Record<string, unknown>;
    stage_attempts: Record<string, { status: string; input_fingerprint: string; failure_code?: string }>;
  };

  const reviewPath = join(project, "music-review.json");
  const realFs = nodeFs as unknown as { renameSync(sourcePath: string, targetPath: string): void };
  let injected = false;
  const failed = await musicAcquireProject(project, {}, {
    renameSync(sourcePath, targetPath) {
      if (!injected && targetPath === reviewPath && sourcePath.includes("music-acquire")) {
        injected = true;
        throw new Error("injected music publication failure");
      }
      realFs.renameSync(sourcePath, targetPath);
    },
  });
  expect(failed.ok).toBe(false);
  if (failed.ok) throw new Error("expected injected music publication failure");
  expect(injected).toBe(true);
  expect(failed.error.message).toContain("injected music publication failure");
  for (const [path, fingerprint] of checkpointHashes) {
    expect(createHash("sha256").update(readFileSync(path)).digest("hex")).toBe(fingerprint);
  }
  const acquisition = JSON.parse(readFileSync(join(project, "music-acquisition.json"), "utf8")) as { request: { id: string } };
  expect(acquisition.request.id).toBe("stable-bed");

  const lifecycleAfter = JSON.parse(readFileSync(join(project, "artifact-manifest.json"), "utf8")) as typeof lifecycleBefore;
  expect(lifecycleAfter.artifacts).toEqual(lifecycleBefore.artifacts);
  expect(lifecycleAfter.stage_attempts["project.music-acquire"]?.status).toBe("failed");
  expect(lifecycleAfter.stage_attempts["project.music-acquire"]?.failure_code).toBe("PROJECT_MUSIC_ACQUIRE_FAILED");
  expect(lifecycleAfter.stage_attempts["project.music-acquire"]?.input_fingerprint)
    .toBe(lifecycleBefore.stage_attempts["project.music-acquire"]?.input_fingerprint);
  const status = projectStatus(project);
  const musicStage = status.stages.find((stage) => stage.stage === "music-acquire");
  expect(musicStage?.state).toBe("complete");
  expect(musicStage?.last_attempt?.status).toBe("failed");
});

test("acquires minimax music from hex response without leaking api key", async () => {
  if (!commandExists("ffmpeg")) return;
  const dir = mkdtempSync(join(tmpdir(), "koubo-clip-music-"));
  const project = join(dir, "project");
  mkdirSync(join(project, "assets", "music"), { recursive: true });
  const providerAudioPath = join(dir, "provider-audio.wav");
  makeMusic(providerAudioPath, 2);
  const providerAudioHex = Buffer.from(readFileSync(providerAudioPath)).toString("hex");
  writeFileSync(
    join(project, "music-request.json"),
    JSON.stringify({ version: "1.0", id: "minimax-bed", source: "minimax", reason: "publishable pacing", prompt: "calm tech tutorial instrumental", target_duration_seconds: 2 }),
  );
  const oldFetch = globalThis.fetch;
  const oldKey = process.env.MINIMAX_API_KEY;
  let payload: Record<string, unknown> | undefined;
  process.env.MINIMAX_API_KEY = "test-key-placeholder";
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    payload = JSON.parse(String(init?.body ?? "{}"));
    return new Response(
      JSON.stringify({
        data: { audio: providerAudioHex, status: 2 },
        extra_info: { music_duration: 2000 },
        base_resp: { status_code: 0, status_msg: "success" },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
  try {
    const acquired = await musicAcquireProject(project);
    expect(acquired.ok).toBe(true);
    if (!acquired.ok) throw new Error(acquired.error.message);
    expect(payload?.output_format).toBe("hex");
    expect(payload?.is_instrumental).toBe(true);
    expect(String(payload?.prompt)).toContain("background underscore");
    expect(String(payload?.prompt)).toContain("target duration about 2 seconds");
    const manifestText = readFileSync(join(project, "asset-manifest.json"), "utf8");
    expect(manifestText).toContain("minimax");
    expect(manifestText.includes("test-key-placeholder")).toBe(false);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.MINIMAX_API_KEY;
    else process.env.MINIMAX_API_KEY = oldKey;
  }
});

test("music acquisition rejects unprobeable provider bytes before publishing public artifacts", async () => {
  const dir = mkdtempSync(join(tmpdir(), "koubo-clip-music-invalid-"));
  const project = join(dir, "project");
  mkdirSync(project, { recursive: true });
  writeFileSync(
    join(project, "music-request.json"),
    JSON.stringify({ version: "1.0", id: "invalid-bed", source: "minimax", reason: "validate provider audio", prompt: "calm bed", target_duration_seconds: 2 }),
  );
  const oldFetch = globalThis.fetch;
  const oldKey = process.env.MINIMAX_API_KEY;
  process.env.MINIMAX_API_KEY = "test-key-placeholder";
  globalThis.fetch = (async () => new Response(
    JSON.stringify({
      data: { audio: Buffer.from("not audio").toString("hex"), status: 2 },
      extra_info: { music_duration: 2000 },
      base_resp: { status_code: 0, status_msg: "success" },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  )) as typeof fetch;
  try {
    const acquired = await musicAcquireProject(project);
    expect(acquired.ok).toBe(false);
    if (acquired.ok) throw new Error("expected invalid provider audio to fail");
    expect(acquired.error.message).toContain("could not be probed as audio");
    expect(existsSync(join(project, "assets", "music", "invalid-bed.mp3"))).toBe(false);
    expect(existsSync(join(project, "asset-manifest.json"))).toBe(false);
    expect(existsSync(join(project, "music-acquisition.json"))).toBe(false);
    expect(existsSync(join(project, "music-review.json"))).toBe(false);
    const lifecycle = JSON.parse(readFileSync(join(project, "artifact-manifest.json"), "utf8")) as {
      stage_attempts: Record<string, { status: string; failure_code?: string }>;
    };
    expect(lifecycle.stage_attempts["project.music-acquire"]?.status).toBe("failed");
    expect(lifecycle.stage_attempts["project.music-acquire"]?.failure_code).toBe("PROJECT_MUSIC_ACQUIRE_FAILED");
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.MINIMAX_API_KEY;
    else process.env.MINIMAX_API_KEY = oldKey;
  }
});

test("pixabay music 403 explains experimental web retrieval instead of api key setup", async () => {
  const dir = mkdtempSync(join(tmpdir(), "koubo-clip-music-"));
  const project = join(dir, "project");
  mkdirSync(project, { recursive: true });
  writeFileSync(
    join(project, "music-request.json"),
    JSON.stringify({ version: "1.0", id: "pixabay-bed", source: "pixabay", reason: "stock music test", query: "calm tutorial", target_duration_seconds: 2 }),
  );
  const oldFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("blocked", { status: 403 })) as typeof fetch;
  try {
    const acquired = await musicAcquireProject(project);
    expect(acquired.ok).toBe(false);
    if (acquired.ok) throw new Error("expected pixabay acquisition to fail");
    expect(acquired.error.message).toContain("experimental web-retrieval");
    expect(acquired.error.message).toContain("API key does not unlock music search");
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("inspect ignores an uncommitted caption-only final render and plan", () => {
  if (!commandExists("ffmpeg")) return;
  const { project } = readyProject(2);
  const cleanRendered = renderProject(project);
  expect(cleanRendered.ok).toBe(true);
  if (!cleanRendered.ok) throw new Error(cleanRendered.error.message);
  const finalPath = join(project, "renders", "final.mp4");
  copyFileSync(cleanRendered.data.clean_render_path, finalPath);
  writeFileSync(
    join(project, "enrichment-plan.json"),
    JSON.stringify({
      version: "2.0",
      profile: {
        source_mode: "screen_recording",
        aspect_ratio: "source",
        caption_identity: "anchor",
        layout: "overlay",
        style: "minimal",
        frame: "clean",
      },
      elements: [{
        id: "uncommitted-caption",
        source: "agent",
        element_id: "anchor",
        element_type: "caption_identity",
        start: 0.2,
        end: 0.8,
        caption_identity: "anchor",
        reason: "caption-only",
      }],
      audio: { music: [], sfx: [] },
    }),
  );

  const inspected = inspectProject(project);
  expect(inspected.ok).toBe(true);
  if (!inspected.ok) throw new Error(inspected.error.message);
  expect(inspected.data.output_path.endsWith("clean.mp4")).toBe(true);
  expect(inspected.data.enrichment_applied).toBe(false);
  expect(inspected.data.enrichment_summary).toEqual([]);
  expect(inspected.data.inspection_checks).toEqual([]);
  expect(inspected.data.inspection_frames).toEqual([]);
});

test("extracts ordered source-local semantic frames without an EDL", () => {
  const { project } = readyProject(2);
  rmSync(join(project, "edl.json"), { force: true });
  writeSourceFrameRequest(project, [
    sourceFrameRequest("frame-a", 0.4),
    sourceFrameRequest("frame-b", 0.4),
    sourceFrameRequest("frame-c", 1.2),
  ]);

  const result = sourceFramesProject(project);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  expect(existsSync(join(project, "edl.json"))).toBe(false);
  expect(result.data.source_frame_request_path).toBe("source-frame-request.json");
  expect(result.data.source_frames_path).toBe("source-frames.json");
  expect(result.data.warnings).toEqual(["SOURCE_FRAME_DUPLICATE_TIME: frame-b duplicates frame-a at src-001@0.4s"]);

  const manifest = JSON.parse(readFileSync(join(project, "source-frames.json"), "utf8")) as {
    frames: Array<{ id: string; index: number; time_seconds: number; path: string; mime_type: string; width: number; height: number; size_bytes: number; sha256: string }>;
    frame_count: number;
    total_size_bytes: number;
  };
  expect(manifest.frames.map((frame) => frame.id)).toEqual(["frame-a", "frame-b", "frame-c"]);
  expect(manifest.frames.map((frame) => frame.index)).toEqual([0, 1, 2]);
  expect(manifest.frames.map((frame) => frame.time_seconds)).toEqual([0.4, 0.4, 1.2]);
  expect(manifest.frames.map((frame) => frame.path)).toEqual([
    ".source-frames/frame-0001.jpg",
    ".source-frames/frame-0002.jpg",
    ".source-frames/frame-0003.jpg",
  ]);
  for (const frame of manifest.frames) {
    const framePath = join(project, frame.path);
    const probed = probeJpeg(framePath);
    expect(frame.mime_type).toBe("image/jpeg");
    expect(probed.codec_name).toBe("mjpeg");
    expect(frame.width).toBe(probed.width);
    expect(frame.height).toBe(probed.height);
    expect(frame.width <= 160 && frame.height <= 90).toBe(true);
    expect(Math.abs(frame.width / frame.height - 16 / 9) < 0.02).toBe(true);
    expect(frame.size_bytes).toBe(statSync(framePath).size);
    expect(frame.sha256).toBe(createHash("sha256").update(readFileSync(framePath)).digest("hex"));
  }
  expect(manifest.frame_count).toBe(3);
  expect(manifest.total_size_bytes).toBe(manifest.frames.reduce((sum, frame) => sum + frame.size_bytes, 0));
  const { project_path: _projectPath, ...portableData } = result.data;
  expect(JSON.stringify(portableData).includes(project)).toBe(false);
  expect(JSON.stringify(manifest).includes(project)).toBe(false);
});

test("source frames preserve request seek precision", () => {
  const { project } = readyProject(1);
  const fsRuntime = nodeFs as unknown as { chmodSync(path: string, mode: number): void };
  const bin = mkdtempSync(join(tmpdir(), "koubo-source-frame-seek-"));
  const capturedSeek = join(bin, "captured-seek.txt");
  writeExecutable(
    bin,
    "ffmpeg",
    `#!/bin/sh\nprev=\nfor arg\ndo\n  if [ \"$prev\" = \"-ss\" ]; then printf '%s\\n' \"$arg\" >> ${JSON.stringify(capturedSeek)}; fi\n  prev=$arg\n  last=$arg\ndone\nprintf bad > \"$last\"\n`,
    fsRuntime,
  );
  writeExecutable(bin, "ffprobe", "#!/bin/sh\nprintf '%s\\n' '{\"streams\":[{\"codec_name\":\"mjpeg\",\"width\":160,\"height\":90}]}'\n", fsRuntime);
  writeSourceFrameRequest(project, [sourceFrameRequest("precise", 0.9999), sourceFrameRequest("tiny", 1e-7), sourceFrameRequest("tiny-fraction", 1.23e-7)]);

  const result = runSourceFramesInChild(project, bin);
  expect(result.ok).toBe(true);
  expect(readFileSync(capturedSeek, "utf8")).toBe("0.9999\n0.0000001\n0.000000123\n");
});

test("source frame request errors do not echo path-like identifiers", () => {
  const { project } = readyProject(1);
  const privatePath = "/Users/example/private/source.mp4";
  writeSourceFrameRequest(project, [sourceFrameRequest(privatePath, 0.2)]);
  const result = sourceFramesProject(project);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected invalid request failure");
  expect(result.error.code).toBe("SOURCE_FRAME_REQUEST_INVALID");
  expect(JSON.stringify(result.error).includes(privatePath)).toBe(false);
  expect(JSON.stringify(result.error).includes(project)).toBe(false);
});

test("source frame reruns replace managed members and preserve the last checkpoint before request failures", () => {
  const { project } = readyProject(2);
  writeSourceFrameRequest(project, [sourceFrameRequest("frame-a", 0.2), sourceFrameRequest("frame-b", 0.7), sourceFrameRequest("frame-c", 1.2)]);
  expect(sourceFramesProject(project).ok).toBe(true);
  writeSourceFrameRequest(project, [sourceFrameRequest("frame-only", 0.5)]);
  expect(sourceFramesProject(project).ok).toBe(true);
  expect(existsSync(join(project, ".source-frames", "frame-0001.jpg"))).toBe(true);
  expect(existsSync(join(project, ".source-frames", "frame-0002.jpg"))).toBe(false);
  expect(existsSync(join(project, ".source-frames", "frame-0003.jpg"))).toBe(false);
  const lifecycle = JSON.parse(readFileSync(join(project, "artifact-manifest.json"), "utf8")) as { artifacts: Record<string, unknown> };
  expect(Boolean(lifecycle.artifacts["source-frame:frame-only"])).toBe(true);
  expect(Boolean(lifecycle.artifacts["source-frame:frame-a"])).toBe(false);
  expect(Boolean(lifecycle.artifacts["source-frame:frame-b"])).toBe(false);
  expect(Boolean(lifecycle.artifacts["source-frame:frame-c"])).toBe(false);
  const committedManifest = readFileSync(join(project, "source-frames.json"), "utf8");

  writeFileSync(join(project, "source-frame-request.json"), "{");
  const invalid = sourceFramesProject(project);
  expect(invalid.ok).toBe(false);
  if (invalid.ok) throw new Error("expected invalid request failure");
  expect(invalid.error.code).toBe("SOURCE_FRAME_REQUEST_INVALID");
  expect(readFileSync(join(project, "source-frames.json"), "utf8")).toBe(committedManifest);

  rmSync(join(project, "source-frame-request.json"), { force: true });
  const missing = sourceFramesProject(project);
  expect(missing.ok).toBe(false);
  if (missing.ok) throw new Error("expected missing request failure");
  expect(missing.error.code).toBe("SOURCE_FRAME_REQUEST_MISSING");
  expect(readFileSync(join(project, "source-frames.json"), "utf8")).toBe(committedManifest);
});

test("source frame publication rolls back frame bytes and JSON when lifecycle commit fails", () => {
  const { project } = readyProject(2);
  writeSourceFrameRequest(project, [sourceFrameRequest("frame-old", 0.2)]);
  expect(sourceFramesProject(project).ok).toBe(true);
  const framePath = join(project, ".source-frames", "frame-0001.jpg");
  const sourceFramesPath = join(project, "source-frames.json");
  const lifecyclePath = join(project, "artifact-manifest.json");
  const committedFrame = readFileSync(framePath);
  const committedSourceFrames = readFileSync(sourceFramesPath);
  const committedLifecycle = readFileSync(lifecyclePath);
  writeSourceFrameRequest(project, [sourceFrameRequest("frame-new", 1.2)]);

  const bin = mkdtempSync(join(tmpdir(), "koubo-source-frame-commit-failure-"));
  const fsRuntime = nodeFs as unknown as { chmodSync(path: string, mode: number): void; statSync(path: string): { mode: number } };
  const ffmpegPath = spawnSync("sh", ["-c", "command -v ffmpeg"], { encoding: "utf8" }).stdout.trim();
  const ffprobePath = spawnSync("sh", ["-c", "command -v ffprobe"], { encoding: "utf8" }).stdout.trim();
  writeExecutable(
    bin,
    "ffmpeg",
    `#!/bin/sh\nlast=\nfor arg\ndo\n  last=$arg\ndone\n${JSON.stringify(ffmpegPath)} "$@"\nstatus=$?\nproject=$(dirname "$(dirname "$last")")\nchmod 000 "$project/artifact-manifest.json"\nexit "$status"\n`,
    fsRuntime,
  );
  writeExecutable(bin, "ffprobe", `#!/bin/sh\nexec ${JSON.stringify(ffprobePath)} "$@"\n`, fsRuntime);

  const lifecycleMode = fsRuntime.statSync(lifecyclePath).mode & 0o777;
  let failed: ReturnType<typeof runSourceFramesInChild>;
  try {
    failed = runSourceFramesInChild(project, bin);
  } finally {
    fsRuntime.chmodSync(lifecyclePath, lifecycleMode || 0o644);
  }
  expect(failed!.ok).toBe(false);
  expect(failed!.error?.code).toBe("PROJECT_SOURCE_FRAMES_FAILED");
  expect(readFileSync(framePath)).toEqual(committedFrame);
  expect(readFileSync(sourceFramesPath)).toEqual(committedSourceFrames);
  expect(readFileSync(lifecyclePath)).toEqual(committedLifecycle);
});

test("source frame cleanup failures leave old manifests non-authoritative", () => {
  const { project } = readyProject(1);
  writeSourceFrameRequest(project, [sourceFrameRequest("frame-a", 0.2)]);
  expect(sourceFramesProject(project).ok).toBe(true);
  const manifestPath = join(project, "source-frames.json");
  expect(existsSync(manifestPath)).toBe(true);
  const fsRuntime = nodeFs as unknown as { chmodSync(path: string, mode: number): void; statSync(path: string): { mode: number } };
  const originalMode = fsRuntime.statSync(project).mode & 0o777;
  try {
    fsRuntime.chmodSync(project, 0o555);
    const result = sourceFramesProject(project);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected cleanup failure");
    expect(result.error.code).toBe("PROJECT_SOURCE_FRAMES_FAILED");
    expect(result.error.message).toBe("source frames command failed");
  } finally {
    fsRuntime.chmodSync(project, originalMode || 0o755);
  }
  expect(existsSync(manifestPath)).toBe(true);
});

test("source frames reject unknown, endpoint, unsafe, and escaping sources with stable errors", () => {
  const unknown = readyProject(2).project;
  writeSourceFrameRequest(unknown, [{ ...sourceFrameRequest("unknown", 0.2), source_id: "src-404" }]);
  expectSourceFrameFailure(unknown, "SOURCE_FRAME_SOURCE_NOT_FOUND");

  const endpoint = readyProject(2).project;
  const endpointManifest = JSON.parse(readFileSync(join(endpoint, "sources.json"), "utf8")) as { sources: Array<{ identity: { duration_seconds: number } }> };
  writeSourceFrameRequest(endpoint, [sourceFrameRequest("endpoint", endpointManifest.sources[0]!.identity.duration_seconds)]);
  expectSourceFrameFailure(endpoint, "SOURCE_FRAME_TIME_OUT_OF_RANGE");

  const unsafe = readyProject(2).project;
  const unsafeManifest = JSON.parse(readFileSync(join(unsafe, "source-materialization.json"), "utf8")) as { sources: Array<{ project_path: string }> };
  unsafeManifest.sources[0]!.project_path = "../raw.mp4";
  writeFileSync(join(unsafe, "source-materialization.json"), JSON.stringify(unsafeManifest));
  writeSourceFrameRequest(unsafe, [sourceFrameRequest("unsafe", 0.2)]);
  expectSourceFrameFailure(unsafe, "SOURCE_FRAME_SOURCE_NOT_FOUND");

  const escapingReady = readyProject(2);
  const escapingManifest = JSON.parse(readFileSync(join(escapingReady.project, "source-materialization.json"), "utf8")) as { sources: Array<{ project_path: string }> };
  const projectSource = join(escapingReady.project, escapingManifest.sources[0]!.project_path);
  unlinkSync(projectSource);
  const fsRuntime = nodeFs as unknown as { symlinkSync(target: string, path: string): void };
  fsRuntime.symlinkSync(escapingReady.source, projectSource);
  writeSourceFrameRequest(escapingReady.project, [sourceFrameRequest("escaping", 0.2)]);
  expectSourceFrameFailure(escapingReady.project, "SOURCE_FRAME_SOURCE_NOT_FOUND");

  const unreadableReady = readyProject(2);
  const unreadableManifest = JSON.parse(readFileSync(join(unreadableReady.project, "source-materialization.json"), "utf8")) as { sources: Array<{ project_path: string }> };
  const unreadableSource = join(unreadableReady.project, unreadableManifest.sources[0]!.project_path);
  const chmodFs = nodeFs as unknown as { chmodSync(path: string, mode: number): void };
  try {
    chmodFs.chmodSync(unreadableSource, 0o000);
    writeSourceFrameRequest(unreadableReady.project, [sourceFrameRequest("unreadable", 0.2)]);
    expectSourceFrameFailure(unreadableReady.project, "SOURCE_FRAME_SOURCE_NOT_FOUND");
  } finally {
    chmodFs.chmodSync(unreadableSource, 0o644);
  }
});

test("source frame byte limits report image before batch overflow", () => {
  expectSourceFrameLimitCode([11], { maxFrameBytes: 10, maxBatchBytes: 100 }, "SOURCE_FRAME_IMAGE_TOO_LARGE");
  expectSourceFrameLimitCode([6, 6], { maxFrameBytes: 10, maxBatchBytes: 10 }, "SOURCE_FRAME_BATCH_TOO_LARGE");
});

test("source frames sanitize ffmpeg and image validation failures", () => {
  const fsRuntime = nodeFs as unknown as { chmodSync(path: string, mode: number): void };
  const ffmpegFailure = readyProject(2).project;
  const failBin = mkdtempSync(join(tmpdir(), "koubo-source-frame-fail-"));
  writeExecutable(failBin, "ffmpeg", "#!/bin/sh\nexit 1\n", fsRuntime);
  writeExecutable(failBin, "ffprobe", "#!/bin/sh\nprintf '%s\\n' '{\"streams\":[]}'\n", fsRuntime);
  writeSourceFrameRequest(ffmpegFailure, [sourceFrameRequest("ffmpeg-failure", 0.2)]);
  expectChildSourceFrameFailure(ffmpegFailure, failBin, "SOURCE_FRAME_FFMPEG_FAILED");

  const invalidImage = readyProject(2).project;
  const invalidBin = mkdtempSync(join(tmpdir(), "koubo-source-frame-invalid-"));
  writeExecutable(invalidBin, "ffmpeg", "#!/bin/sh\nfor last\ndo\n  :\ndone\nprintf bad > \"$last\"\n", fsRuntime);
  writeExecutable(invalidBin, "ffprobe", "#!/bin/sh\nprintf '%s\\n' '{\"streams\":[{\"codec_name\":\"h264\",\"width\":160,\"height\":90}]}'\n", fsRuntime);
  writeSourceFrameRequest(invalidImage, [sourceFrameRequest("invalid-image", 0.2)]);
  expectChildSourceFrameFailure(invalidImage, invalidBin, "SOURCE_FRAME_IMAGE_INVALID");
});

test("completes focus flow from candidates to proposed elements and enrich plan validation", () => {
  if (!commandExists("ffmpeg")) return;
  const focusCandidatesProject = requiredProjectCommand("focusCandidatesProject");
  const focusFramesProject = requiredProjectCommand("focusFramesProject");
  const focusGroundingProject = requiredProjectCommand("focusGroundingProject");
  const focusReviewProject = requiredProjectCommand("focusReviewProject");
  const { project } = readyProject(2);

  writeFileSync(
    join(project, "focus-candidates.json"),
    JSON.stringify({
      version: "1.0",
      source_mode: "screen_recording",
      presentation_intent: "internal_tutorial",
      candidates: [
        {
          id: "focus-candidate-c-001-focus",
          start: 0.4,
          end: 1.2,
          transcript_quote: "click the pricing button",
          semantic_intent: "guide_attention",
          business_role: "operation_step",
          viewer_job: "guide attention to the exact visible control",
          visual_gap: "source_has_visible_target",
          recommended_treatment: "source_ui_component",
          element_id: "cinematic-zoom",
          element_type: "registry_block",
          requires_grounding: true,
          reason: "speaker names a visible UI target",
          params: { title: "Pricing button" },
        },
      ],
    }),
  );

  const candidates = focusCandidatesProject(project);
  if (!candidates.ok) throw new Error(candidates.error.message);
  expect(candidates.ok).toBe(true);
  expect(candidates.data.candidate_count).toBe(1);
  expect(candidates.data.focus_candidates_path.endsWith("focus-candidates.json")).toBe(true);
  const focusCandidatesMarkdown = readFileSync(join(project, "focus-candidates.md"), "utf8");
  expect(focusCandidatesMarkdown).toContain("role=operation_step");
  expect(focusCandidatesMarkdown).toContain("treatment=source_ui_component");

  const frames = focusFramesProject(project);
  if (!frames.ok) throw new Error(frames.error.message);
  expect(frames.ok).toBe(true);
  expect(frames.data.frame_count).toBe(3);
  expect(frames.data.focus_frames_path.endsWith("focus-frames.json")).toBe(true);
  expect(existsSync(join(project, frames.data.frames[0].path))).toBe(true);

  writeFileSync(
    join(project, "focus-grounding.json"),
    JSON.stringify({
      version: "1.0",
      groundings: [
        {
          candidate_id: "focus-candidate-c-001-focus",
          frame_id: frames.data.frames[0].id,
          target_rect: { x: 0.42, y: 0.32, width: 0.14, height: 0.09 },
          anchor_point: { x: 0.49, y: 0.36 },
          evidence_note: "pricing button is visible in the sampled frame",
          confidence: 0.86,
        },
      ],
    }),
  );

  const grounding = focusGroundingProject(project);
  if (!grounding.ok) throw new Error(grounding.error.message);
  expect(grounding.ok).toBe(true);
  expect(grounding.data.grounding_count).toBe(1);
  expect(grounding.data.ready_count).toBe(1);
  expect(grounding.data.invalid_count).toBe(0);

  const review = focusReviewProject(project);
  if (!review.ok) throw new Error(review.error.message);
  expect(review.ok).toBe(true);
  expect(review.data.proposed_element_count).toBe(1);
  expect(review.data.proposed_elements[0]?.id).toBe("focus-candidate-c-001-focus");
  expect(review.data.proposed_elements[0]?.element_id).toBe("cinematic-zoom");
  expect(review.data.proposed_elements[0]?.element_type).toBe("registry_block");
  expect(review.data.proposed_elements[0]?.target_rect).toEqual({ x: 0.42, y: 0.32, width: 0.14, height: 0.09 });

  const focusManifest = JSON.parse(readFileSync(join(project, "artifact-manifest.json"), "utf8")) as {
    artifacts: Record<string, { role: string; path: string; fingerprint: string; inputs: Array<{ key: string }> }>;
    stage_attempts: Record<string, { status: string; inputs: Array<{ key: string }>; output_artifact_keys: string[] }>;
  };
  const focusFrameKeys = frames.data.frames.map((frame: { id: string }) => `focus-frame:${frame.id}`);
  expect(focusManifest.artifacts["focus-candidates"]?.role).toBe("authoritative_input");
  expect(focusManifest.artifacts["focus-candidates"]?.inputs.map((input) => input.key)).toEqual(["edl"]);
  expect(focusManifest.artifacts["focus-candidates-view"]?.inputs.map((input) => input.key)).toEqual(["focus-candidates"]);
  expect(focusManifest.artifacts[focusFrameKeys[0]!]!.inputs.map((input) => input.key)).toEqual(["edl", "focus-candidates", "source:src-001"]);
  expect(focusManifest.artifacts["focus-frames"]?.inputs.map((input) => input.key)).toEqual(["edl", "focus-candidates", ...focusFrameKeys]);
  expect(focusManifest.artifacts["focus-grounding"]?.inputs.map((input) => input.key)).toEqual([
    "focus-candidates",
    "focus-frames",
    focusFrameKeys[0],
  ]);
  expect(focusManifest.artifacts["focus-review"]?.inputs.map((input) => input.key)).toEqual(["focus-candidates", "focus-frames", "focus-grounding"]);
  expect(focusManifest.artifacts["focus-review-view"]?.inputs.map((input) => input.key)).toEqual(["focus-candidates", "focus-review"]);
  expect([
    focusManifest.stage_attempts["project.focus-candidates"]?.status,
    focusManifest.stage_attempts["project.focus-frames"]?.status,
    focusManifest.stage_attempts["project.focus-grounding"]?.status,
    focusManifest.stage_attempts["project.focus-review"]?.status,
  ]).toEqual(["success", "success", "success", "success"]);
  expect(focusManifest.stage_attempts["project.focus-frames"]?.inputs.map((input) => input.key)).toEqual([
    "edl",
    "focus-candidates",
    "source:src-001",
  ]);
  expect(focusManifest.stage_attempts["project.focus-grounding"]?.inputs.map((input) => input.key)).toEqual([
    "focus-candidates",
    "focus-frames",
    focusFrameKeys[0],
    "focus-grounding",
  ]);

  writeFileSync(
    join(project, "enrichment-plan.json"),
    JSON.stringify({
      version: "2.0",
      profile: { source_mode: "screen_recording", aspect_ratio: "source", caption_identity: "anchor", layout: "overlay", style: "minimal", frame: "clean" },
      elements: [
        { id: "captions-anchor", source: "agent", element_id: "anchor", element_type: "caption_identity", start: 0, end: 2, caption_identity: "anchor", reason: "captions" },
        ...review.data.proposed_elements,
      ],
      audio: { music: [], sfx: [] },
    }),
  );

  const enriched = enrichPlanProject(project);
  if (!enriched.ok) throw new Error(enriched.error.message);
  expect(enriched.ok).toBe(true);
  expect(enriched.data.source_mode).toBe("screen_recording");
  expect(enriched.data.element_usage[0]?.id).toBe("captions-anchor");
  expect(enriched.data.element_usage[1]?.id).toBe("focus-candidate-c-001-focus");
  expect(enriched.data.element_usage[1]?.element_id).toBe("cinematic-zoom");
  expect(enriched.data.element_usage[1]?.target_rect).toEqual({ x: 0.42, y: 0.32, width: 0.14, height: 0.09 });
  expect(enriched.data.warnings.some((warning) => warning.includes("coordinate_source_frame"))).toBe(false);

  const successfulGroundingFingerprint = focusManifest.artifacts["focus-grounding"]!.fingerprint;
  writeFileSync(
    join(project, "focus-grounding.json"),
    JSON.stringify({
      version: "1.0",
      groundings: [
        {
          candidate_id: "focus-candidate-c-001-focus",
          frame_id: "missing-frame",
          evidence_note: "invalid current input should leave a failed attempt",
          confidence: 0.86,
        },
      ],
    }),
  );
  const invalidGrounding = focusGroundingProject(project);
  expect(invalidGrounding.ok).toBe(false);
  const failedManifest = JSON.parse(readFileSync(join(project, "artifact-manifest.json"), "utf8")) as typeof focusManifest;
  expect(failedManifest.stage_attempts["project.focus-grounding"]?.status).toBe("failed");
  expect(failedManifest.stage_attempts["project.focus-grounding"]?.output_artifact_keys).toEqual([]);
  expect(failedManifest.artifacts["focus-grounding"]?.fingerprint).toBe(successfulGroundingFingerprint);
});

test("artifact lifecycle: focus consumers rebuild an EDL after the edit plan changes", () => {
  if (!commandExists("ffmpeg")) return;
  const focusCandidatesProject = requiredProjectCommand("focusCandidatesProject");
  const { project } = readyProject(2);
  writeOwnedAnalysis(
    project,
    {
      candidates: [
        {
          id: "c-001-recut",
          source_id: "src-001",
          start: 0.6,
          end: 1.2,
          text: "remove this take",
          type: "manual",
          reason: "regression fixture",
          confidence: 0.99,
        },
      ],
    },
  );
  confirmProposalAndWriteEditPlan(project);

  const firstRender = renderProject(project);
  expect(firstRender.ok).toBe(true);
  if (!firstRender.ok) throw new Error(firstRender.error.message);
  const edlPath = join(project, "edl.json");
  const staleEdl = readFileSync(edlPath, "utf8");
  const editPlanPath = join(project, "edit-plan.json");
  const editPlan = JSON.parse(readFileSync(editPlanPath, "utf8")) as Record<string, unknown>;
  writeFileSync(editPlanPath, JSON.stringify({ ...editPlan, decisions: [{ action: "cut", candidate_id: "c-001-recut" }] }));
  writeFileSync(
    join(project, "focus-candidates.json"),
    JSON.stringify({ version: "1.0", source_mode: "screen_recording", presentation_intent: "internal_tutorial", candidates: [] }),
  );

  const focused = focusCandidatesProject(project);
  expect(focused.ok).toBe(true);
  if (!focused.ok) throw new Error(focused.error.message);
  const rebuiltEdlText = readFileSync(edlPath, "utf8");
  const rebuiltEdl = JSON.parse(rebuiltEdlText) as { entries: Array<{ start: number; end: number; reason: string }> };
  expect(rebuiltEdlText === staleEdl).toBe(false);
  expect(rebuiltEdl.entries.length).toBe(2);
  expect(rebuiltEdl.entries.map((entry) => entry.reason)).toEqual(["keep before c-001-recut", "keep source range"]);
});

test("artifact lifecycle: inspect ignores a physical stale final MP4 when the current render result is clean", () => {
  if (!commandExists("ffmpeg")) return;
  const { project } = readyProject(2);
  const rendered = renderProject(project);
  expect(rendered.ok).toBe(true);
  if (!rendered.ok) throw new Error(rendered.error.message);
  const staleFinalPath = join(project, "renders", "final.mp4");
  copyFileSync(rendered.data.clean_render_path, staleFinalPath);

  const inspected = inspectProject(project);
  expect(inspected.ok).toBe(true);
  if (!inspected.ok) throw new Error(inspected.error.message);
  expect(inspected.data.output_path).toBe(rendered.data.clean_render_path);
  expect(inspected.data.enrichment_applied).toBe(false);
  expect(existsSync(join(project, "render-result.json"))).toBe(true);
});

test("artifact lifecycle: inspect rerun removes retired inspection-frame records", () => {
  if (!commandExists("ffmpeg")) return;
  const { project } = readyProject(2);
  const rendered = renderProject(project);
  expect(rendered.ok).toBe(true);
  if (!rendered.ok) throw new Error(rendered.error.message);
  const firstInspection = inspectProject(project);
  expect(firstInspection.ok).toBe(true);
  if (!firstInspection.ok) throw new Error(firstInspection.error.message);

  const retiredFrameRelativePath = ".inspection/retired/old-frame.jpg";
  const retiredFramePath = join(project, retiredFrameRelativePath);
  mkdirSync(join(project, ".inspection", "retired"), { recursive: true });
  writeFileSync(retiredFramePath, "retired frame bytes");
  const retiredFrameFingerprint = `sha256:${createHash("sha256").update(readFileSync(retiredFramePath)).digest("hex")}`;
  const lifecyclePath = join(project, "artifact-manifest.json");
  const lifecycle = JSON.parse(readFileSync(lifecyclePath, "utf8")) as {
    artifacts: Record<string, Record<string, unknown>>;
    stage_attempts: Record<string, { output_artifact_keys: string[] }>;
    updated_at: string;
  };
  const renderResultRecord = lifecycle.artifacts["render-result"]!;
  const retiredKey = "inspection-frame:retired:0";
  const recordedAt = new Date().toISOString();
  lifecycle.artifacts[retiredKey] = {
    key: retiredKey,
    path: retiredFrameRelativePath,
    role: "evidence",
    schema_version: "image/jpeg",
    fingerprint: retiredFrameFingerprint,
    file_sha256: retiredFrameFingerprint,
    authored_by: "cli",
    produced_by_command: "project.inspect",
    producer_cli_version: renderResultRecord.producer_cli_version,
    command_contract_version: "1.0",
    inputs: [{
      key: "render-result",
      schema_version: renderResultRecord.schema_version,
      fingerprint: renderResultRecord.fingerprint,
    }],
    produced_at: recordedAt,
  };
  lifecycle.stage_attempts["project.inspect"]!.output_artifact_keys.push(retiredKey);
  lifecycle.updated_at = recordedAt;
  writeFileSync(lifecyclePath, `${JSON.stringify(lifecycle, null, 2)}\n`);

  const reinspected = inspectProject(project);
  expect(reinspected.ok).toBe(true);
  if (!reinspected.ok) throw new Error(reinspected.error.message);
  const committed = JSON.parse(readFileSync(lifecyclePath, "utf8")) as {
    artifacts: Record<string, unknown>;
    stage_attempts: Record<string, { output_artifact_keys: string[] }>;
  };
  expect(Boolean(committed.artifacts[retiredKey])).toBe(false);
  expect(committed.stage_attempts["project.inspect"]?.output_artifact_keys.includes(retiredKey)).toBe(false);
});



test("artifact lifecycle: standalone asset usage is consumed, immutable in lineage, idempotent, and renderable", () => {
  if (!commandExists("ffmpeg")) return;
  const { project } = readyProject(2, "platform");
  const assetDir = join(project, "assets", "koubo-clip");
  mkdirSync(assetDir, { recursive: true });
  makeMusic(join(assetDir, "bed.wav"), 2);
  const handoff = join(project, "asset-usage-plan.json");
  writeFileSync(handoff, JSON.stringify({
    music: [{ asset_ref: "assets/koubo-clip/bed.wav", start: 0, end: 1.8, volume: 0.1, duck_original_audio: true, fade_in: 0.1, fade_out: 0.1, purpose: "handoff" }],
    sfx: [], visual_assets: [],
  }));
  expect(enrichPlanProject(project, { providerMode: "platform" }).ok).toBe(true);
  expect(existsSync(handoff)).toBe(false);
  expect(enrichPlanProject(project, { providerMode: "platform" }).ok).toBe(true);
  expect(renderProject(project, { providerMode: "platform" }).ok).toBe(true);
  const manifest = JSON.parse(readFileSync(join(project, "artifact-manifest.json"), "utf8")) as { artifacts: Record<string, { path: string }> };
  const usage = Object.entries(manifest.artifacts).find(([key]) => key.startsWith("asset-usage-plan:"));
  expect(usage?.[1].path.startsWith(".virtual/asset-usage-plan/")).toBe(true);
});

test("artifact lifecycle: failed source-frame regeneration preserves committed manifest and evidence bytes", () => {
  if (!commandExists("ffmpeg")) return;
  const { project } = readyProject(2);
  writeSourceFrameRequest(project, [sourceFrameRequest("committed-a", 0.3), sourceFrameRequest("committed-b", 1.1)]);
  const first = sourceFramesProject(project);
  expect(first.ok).toBe(true);
  if (!first.ok) throw new Error(first.error.message);

  const manifestPath = join(project, "source-frames.json");
  const committedManifestText = readFileSync(manifestPath, "utf8");
  const committedManifest = JSON.parse(committedManifestText) as { frames: Array<{ path: string }> };
  const committedEvidence = new Map(
    committedManifest.frames.map((frame) => [frame.path, createHash("sha256").update(readFileSync(join(project, frame.path))).digest("hex")]),
  );

  writeSourceFrameRequest(project, [sourceFrameRequest("replacement", 0.7)]);
  const fsRuntime = nodeFs as unknown as { chmodSync(path: string, mode: number): void };
  const failBin = mkdtempSync(join(tmpdir(), "koubo-source-frame-regeneration-fail-"));
  writeExecutable(failBin, "ffmpeg", "#!/bin/sh\nexit 1\n", fsRuntime);
  writeExecutable(failBin, "ffprobe", "#!/bin/sh\nprintf '%s\\n' '{\"streams\":[]}'\n", fsRuntime);
  const failed = runSourceFramesInChild(project, failBin);
  expect(failed.ok).toBe(false);
  expect(failed.error?.code).toBe("SOURCE_FRAME_FFMPEG_FAILED");

  expect(readFileSync(manifestPath, "utf8")).toBe(committedManifestText);
  for (const [path, bytes] of committedEvidence) {
    expect(existsSync(join(project, path))).toBe(true);
    expect(createHash("sha256").update(readFileSync(join(project, path))).digest("hex")).toBe(bytes);
  }
});

test("artifact lifecycle: a failed rerender preserves the prior render result", () => {
  if (!commandExists("ffmpeg")) return;
  const { project } = readyProject(2);
  const firstRender = renderProject(project);
  expect(firstRender.ok).toBe(true);
  if (!firstRender.ok) throw new Error(firstRender.error.message);
  const renderResultPath = join(project, "render-result.json");
  const priorRenderResult = existsSync(renderResultPath) ? readFileSync(renderResultPath, "utf8") : undefined;
  const sources = JSON.parse(readFileSync(join(project, "source-materialization.json"), "utf8")) as { sources: Array<{ project_path: string }> };
  writeFileSync(join(project, sources.sources[0]!.project_path), "broken media for rerender failure");

  const failedRender = renderProject(project);
  expect(failedRender.ok).toBe(false);
  const renderResultAfterFailure = existsSync(renderResultPath) ? readFileSync(renderResultPath, "utf8") : undefined;
  expect({
    initial_render_result_committed: priorRenderResult !== undefined,
    prior_render_result_preserved: renderResultAfterFailure === priorRenderResult,
  }).toEqual({
    initial_render_result_committed: true,
    prior_render_result_preserved: true,
  });
});

function sourceFrameRequest(id: string, timeSeconds: number) {
  return {
    id,
    source_id: "src-001",
    time_seconds: timeSeconds,
    transcript_quote: `quote for ${id}`,
    reason: `inspect ${id}`,
  };
}

function writeSourceFrameRequest(project: string, frames: Array<ReturnType<typeof sourceFrameRequest>>): void {
  writeFileSync(join(project, "source-frame-request.json"), JSON.stringify({ version: "1.0", frames }));
}

function expectSourceFrameFailure(project: string, code: string): void {
  const result = sourceFramesProject(project);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error(`expected ${code}`);
  expect(result.error.code).toBe(code);
  expect(result.error.message.includes(project)).toBe(false);
  expect(existsSync(join(project, "source-frames.json"))).toBe(false);
}

function expectSourceFrameLimitCode(sizes: number[], limits: { maxFrameBytes: number; maxBatchBytes: number }, code: string): void {
  try {
    validateSourceFrameByteLimits(sizes, limits);
    throw new Error(`expected ${code}`);
  } catch (error) {
    expect((error as { code?: string }).code).toBe(code);
  }
}

function probeJpeg(path: string): { codec_name: string; width: number; height: number } {
  const result = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,width,height", "-of", "json", path], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return (JSON.parse(result.stdout) as { streams: Array<{ codec_name: string; width: number; height: number }> }).streams[0]!;
}

function expectChildSourceFrameFailure(project: string, bin: string, code: string): void {
  const result = runSourceFramesInChild(project, bin);
  expect(result.ok).toBe(false);
  expect(result.error?.code).toBe(code);
  expect(Boolean(result.error?.message.includes(project))).toBe(false);
  expect(existsSync(join(project, "source-frames.json"))).toBe(false);
}

function runSourceFramesInChild(project: string, bin: string): { ok: boolean; error?: { code: string; message: string } } {
  const modulePath = join(process.cwd(), "packages", "cli", "src", "project.ts");
  const pathRuntime = nodePath as unknown as { delimiter: string };
  const child = spawnSync(
    process.execPath,
    ["-e", `import { sourceFramesProject } from ${JSON.stringify(modulePath)}; console.log(JSON.stringify(sourceFramesProject(${JSON.stringify(project)})));`],
    {
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}${pathRuntime.delimiter}${process.env.PATH ?? ""}` },
    } as unknown as { encoding?: string },
  );
  if (child.status !== 0) throw new Error(child.stderr || child.stdout);
  return JSON.parse(child.stdout.trim()) as { ok: boolean; error?: { code: string; message: string } };
}

function writeExecutable(dir: string, name: string, content: string, fsRuntime: { chmodSync(path: string, mode: number): void }): void {
  const path = join(dir, name);
  writeFileSync(path, content);
  fsRuntime.chmodSync(path, 0o755);
}

async function projectWithAnalysis(timing: "word" | "segment" | "text-only", language: string | undefined): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "koubo-clip-unsafe-"));
  const source = join(dir, "raw.mp4");
  const project = join(dir, "project");
  writeFileSync(source, "not real media");
  createProject([source], { projectPath: project });
  writeFileSync(
    join(project, "transcript.json"),
    JSON.stringify({
      timing_granularity: timing,
      language,
      segments: [{ source_id: "src-001", start: 0, end: 1, text: "嗯" }],
    }),
  );
  const explored = await exploreProject(project, { asr: "external" });
  if (!explored.ok) throw new Error(explored.error.message);
  writeOwnedAnalysis(project, {
    candidates: [{ id: "c-001-filler", source_id: "src-001", start: 0, end: 1, text: "嗯", type: "filler", reason: "test", confidence: 0.9 }],
  });
  confirmProposalAndWriteEditPlan(project, [{ action: "cut", candidate_id: "c-001-filler" }]);
  return project;
}

function writeOwnedAnalysis(project: string, value: unknown): void {
  const analysisPath = join(project, "analysis.json");
  writeFileSync(analysisPath, JSON.stringify(value));
  const manifestPath = join(project, "artifact-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    artifacts: Record<string, { fingerprint: string; file_sha256?: string }>;
    updated_at: string;
  };
  const analysis = manifest.artifacts.analysis;
  if (!analysis) throw new Error("fixture requires explore to register the analysis artifact");
  analysis.fingerprint = semanticJsonFingerprint(value);
  analysis.file_sha256 = fileBytesFingerprint(analysisPath);
  manifest.updated_at = new Date().toISOString();
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function readyProject(duration = 2, providerMode: "standalone" | "platform" = "standalone"): { project: string; source: string } {
  const dir = mkdtempSync(join(tmpdir(), "koubo-clip-enrich-"));
  const source = join(dir, "raw.mp4");
  const project = join(dir, "project");
  makeSampleVideo(source, duration);
  createProject([source], { projectPath: project, providerMode });
  writeFileSync(
    join(project, "transcript.json"),
    JSON.stringify({
      timing_granularity: "segment",
      segments: [{ source_id: "src-001", start: 0.1, end: duration - 0.1, text: "hello world" }],
    }),
  );
  exploreProject(project, { asr: "external" });
  confirmProposalAndWriteEditPlan(project);
  return { project, source };
}

function makeSampleVideo(path: string, duration = 3, size = "160x90") {
  const result = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `testsrc=size=${size}:rate=10`,
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
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
}

function makeStillImage(path: string) {
  const result = spawnSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "color=c=red:s=64x64", "-frames:v", "1", path], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
}

function makeMusic(path: string, duration = 2) {
  const result = spawnSync("ffmpeg", ["-y", "-f", "lavfi", "-i", `sine=frequency=660:duration=${duration}`, "-c:a", "pcm_s16le", path], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
}

function hasAudio(path: string): boolean {
  const result = spawnSync("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_type", "-of", "csv=p=0", path], { encoding: "utf8" });
  return result.status === 0 && result.stdout.trim() === "audio";
}

function requiredProjectCommand(name: string): (...args: unknown[]) => any {
  const command = (projectApi as Record<string, unknown>)[name];
  expect(typeof command).toBe("function");
  return command as (...args: unknown[]) => any;
}
