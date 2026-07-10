import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as nodeFs from "node:fs";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { parseAssetManifest, parseEnrichmentPlan, parseProjectMetadata } from "./artifacts";
import * as projectApi from "./project";
import { buildEnrichmentStoryboard, commandExists, createProject, elementCatalogProject, enrichPlanProject, exploreProject, inspectProject, musicAcquireProject, musicCatalogProject, musicReviewProject, normalizeCloudflareWhisperResult, normalizeWhisperJson, proposalProject, renderProject, reviewProject, sourceFramesProject, validateSourceFrameByteLimits, visualAcquireProject, visualCatalogProject, visualReviewProject, visualSearchProject } from "./project";

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
  writeFileSync(
    join(project, "production-proposal.json"),
    JSON.stringify({
      version: "1.0",
      source_mode: "mixed",
      presentation_intent: "knowledge_explainer",
      goal_summary: "turn this into a concise explainer",
      material_summary: "short screen recording with one filler candidate",
      recommended_option_id: "balanced",
      options: [
        {
          id: "balanced",
          label: "克制增强",
          recommended: true,
          reason: "clean the filler and keep visuals readable",
          cleanup: { cut_candidate_ids: ["c-002-filler"], keep_strategy: "keep spoken meaning", risks: ["segment timing needs review"] },
          subtitles: { enabled: true, style: "anchor", conflict_notes: [] },
          visuals: { direction: "transparent focus cues", viewer_job: "help viewers follow the key point", requires_grounding: true, notes: ["no opaque cards"] },
          images: { needed: true, reason: "one abstract idea is not visible in source", missing_assets: ["concept-image"] },
          music: { source: "minimax", mood: "quiet tech bed", ducking: true, notes: ["acquire only after OK"] },
          sfx: { enabled: true, usage: "subtle click accents", restraint: "low volume" },
          requires_confirmation: ["generate image", "acquire music"],
        },
        {
          id: "cleanup-only",
          label: "只清理",
          recommended: false,
          reason: "fastest path",
          cleanup: { cut_candidate_ids: ["c-002-filler"], keep_strategy: "keep all non-filler speech", risks: [] },
          subtitles: { enabled: true, style: "plain", conflict_notes: [] },
          visuals: { direction: "none", viewer_job: "only improve pacing", requires_grounding: false, notes: [] },
          images: { needed: false, reason: "no visual gap", missing_assets: [] },
          music: { source: "none", ducking: true, notes: [] },
          sfx: { enabled: false, usage: "none", restraint: "none" },
          requires_confirmation: [],
        },
      ],
    }),
  );

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

  writeFileSync(
    join(project, "production-proposal.json"),
    JSON.stringify({
      version: "1.0",
      source_mode: "mixed",
      presentation_intent: "knowledge_explainer",
      goal_summary: "bad",
      material_summary: "bad",
      recommended_option_id: "bad",
      options: [
        {
          id: "bad",
          label: "坏方案",
          recommended: true,
          reason: "bad",
          cleanup: { cut_candidate_ids: ["missing-candidate"], keep_strategy: "bad", risks: [] },
          subtitles: { enabled: true, style: "anchor", conflict_notes: [] },
          visuals: { direction: "none", viewer_job: "none", requires_grounding: false, notes: [] },
          images: { needed: false, reason: "none", missing_assets: [] },
          music: { source: "none", ducking: true, notes: [] },
          sfx: { enabled: false, usage: "none", restraint: "none" },
          requires_confirmation: [],
        },
      ],
    }),
  );
  const invalid = proposalProject(project);
  expect(invalid.ok).toBe(false);
  if (invalid.ok) throw new Error("expected invalid proposal");
  expect(invalid.error.message).toContain("unknown cleanup candidate_id");
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
  writeFileSync(join(project, "edit-plan.json"), JSON.stringify({ decisions: [{ action: "cut", candidate_id: "c-002-filler" }] }));

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

test("rejects unsafe precise cut timing", () => {
  const textOnlyProject = projectWithAnalysis("text-only", undefined);
  const textOnlyRender = renderProject(textOnlyProject);
  expect(textOnlyRender.ok).toBe(false);
  if (textOnlyRender.ok) throw new Error("expected text-only failure");
  expect(textOnlyRender.error.message).toContain("text-only");

  const chineseProject = projectWithAnalysis("word", "zh");
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
  writeFileSync(join(project, "analysis.json"), JSON.stringify({ candidates: [] }));
  writeFileSync(join(project, "edit-plan.json"), JSON.stringify({ decisions: [] }));
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
  const duration = JSON.parse(readFileSync(join(project, "sources.json"), "utf8")).sources[0].duration_seconds;
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
  writeFileSync(
    join(project, "analysis.json"),
    JSON.stringify({
      candidates: [
        { id: "c-001-cut", source_id: "src-001", start: 0.2, end: 0.5, text: "first", type: "manual", reason: "remove setup", confidence: 0.9 },
        { id: "c-002-risk", source_id: "src-002", start: 0.2, end: 0.5, text: "second", type: "manual", reason: "needs review", confidence: 0.6 },
      ],
    }),
  );
  reviewProject(project);
  writeFileSync(join(project, "edit-plan.json"), JSON.stringify({ decisions: [{ action: "cut", candidate_id: "c-001-cut" }] }));
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
  writeFileSync(join(project, "edit-plan.json"), JSON.stringify({ source_order: ["src-002", "src-001"], decisions: [] }));
  const rendered = renderProject(project);
  expect(rendered.ok).toBe(true);
  if (!rendered.ok) throw new Error(rendered.error.message);
  const edl = JSON.parse(readFileSync(join(project, "edl.json"), "utf8"));
  expect(edl.entries.map((entry: { source_id: string }) => entry.source_id)).toEqual(["src-002", "src-001"]);
});

test("rejects edit plans that reference unknown candidates", () => {
  const project = projectWithAnalysis("segment", undefined);
  writeFileSync(join(project, "edit-plan.json"), JSON.stringify({ decisions: [{ action: "cut", candidate_id: "missing" }] }));
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
  writeFileSync(
    join(project, "analysis.json"),
    JSON.stringify({
      candidates: [{ id: "c-001-bad", source_id: "src-001", start: 0.5, end: 2, text: "bad", type: "manual", reason: "test", confidence: 0.9 }],
    }),
  );
  writeFileSync(join(project, "edit-plan.json"), JSON.stringify({ decisions: [{ action: "cut", candidate_id: "c-001-bad" }] }));
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
  writeFileSync(
    join(project, "analysis.json"),
    JSON.stringify({
      candidates: [
        { id: "c-001-a", source_id: "src-001", start: 0.2, end: 0.8, text: "a", type: "manual", reason: "test", confidence: 0.9 },
        { id: "c-002-b", source_id: "src-001", start: 0.7, end: 1.2, text: "b", type: "manual", reason: "test", confidence: 0.9 },
      ],
    }),
  );
  writeFileSync(
    join(project, "edit-plan.json"),
    JSON.stringify({
      decisions: [
        { action: "cut", candidate_id: "c-001-a" },
        { action: "cut", candidate_id: "c-002-b" },
      ],
    }),
  );
  const rendered = renderProject(project);
  expect(rendered.ok).toBe(false);
  if (rendered.ok) throw new Error("expected overlap failure");
  expect(rendered.error.message).toContain("overlap");
});

test("validates enrichment assets and output-timeline bounds", () => {
  if (!commandExists("ffmpeg")) return;
  const { project } = readyProject(2);
  const imagePath = join(project, "assets", "images", "card.png");
  makeStillImage(imagePath);
  writeFileSync(join(project, "asset-manifest.json"), JSON.stringify({ assets: [{ id: "card", path: "assets/images/card.png", type: "image" }] }));
  writeFileSync(
    join(project, "enrichment-plan.json"),
    JSON.stringify({ version: "1.0", slots: [{ id: "img", type: "image_overlay", start: 0.2, end: 1.2, asset_id: "card", reason: "show card" }] }),
  );
  const valid = enrichPlanProject(project);
  expect(valid.ok).toBe(true);
  if (!valid.ok) throw new Error(valid.error.message);
  expect(valid.data.slot_count).toBe(1);
  expect(valid.data.source_mode).toBe("talking_head_avatar");
  expect(valid.data.requires_hyperframes).toBe(true);
  expect(valid.data.block_usage[0]?.block_id).toBe("app_showcase");
  expect(valid.data.block_usage[0]?.visual_role).toBe("app or product showcase");
  expect(valid.data.cdn_dependencies.some((dependency) => dependency.id === "gsap_3_14_2")).toBe(true);
  expect(valid.data.asset_summary[0]?.id).toBe("card");
  expect(valid.data.asset_summary[0]?.path).toBe("assets/images/card.png");
  expect(valid.data.asset_summary[0]?.type).toBe("image");
  expect(valid.data.asset_summary[0]?.exists).toBe(true);

  writeFileSync(
    join(project, "enrichment-plan.json"),
    JSON.stringify({ version: "1.0", slots: [{ id: "late", type: "image_overlay", start: 1, end: 3, asset_id: "card", reason: "too late" }] }),
  );
  const outOfRange = enrichPlanProject(project);
  expect(outOfRange.ok).toBe(false);
  if (outOfRange.ok) throw new Error("expected out-of-range failure");
  expect(outOfRange.error.message).toContain("exceeds output duration");
});

test("validates v1.1 enrichment plans", () => {
  if (!commandExists("ffmpeg")) return;
  const { project } = readyProject(2);
  makeStillImage(join(project, "assets", "images", "card.png"));
  makeMusic(join(project, "assets", "music", "bed.wav"), 2);
  writeFileSync(
    join(project, "asset-manifest.json"),
    JSON.stringify({
      assets: [
        { id: "card", path: "assets/images/card.png", type: "image", source: "agent_generated", used_by: ["img"], dimensions: { width: 64, height: 64 } },
        { id: "bed", path: "assets/music/bed.wav", type: "music", source: "user", used_by: ["bed"], duration_seconds: 2 },
      ],
    }),
  );
  writeFileSync(
    join(project, "enrichment-plan.json"),
    JSON.stringify({
      version: "1.1",
      profile: { source_mode: "screen_recording", aspect_ratio: "source", caption_identity: "anchor" },
      captions: { enabled: true, identity: "anchor" },
      cards: [
        { id: "covering", start: 0.2, end: 1.2, kind: "key_point", style: "whiteboard", zone: "full_frame", title: "重点", reason: "warning test" },
        { id: "img", start: 1.2, end: 1.6, kind: "image", title: "示意图", asset_id: "card", reason: "show visual" },
      ],
      music: [{ id: "bed", type: "music_segment", start: 0, end: 1.8, asset_id: "bed", volume: 0.1, fade_seconds: 0.1, ducking: false, reason: "bed" }],
    }),
  );
  const valid = enrichPlanProject(project);
  expect(valid.ok).toBe(true);
  if (!valid.ok) throw new Error(valid.error.message);
  expect(valid.data.source_mode).toBe("screen_recording");
  expect(valid.data.visual_slot_count).toBe(2);
  expect(valid.data.requires_hyperframes).toBe(true);
  expect(valid.data.warnings.some((warning) => warning.includes("full_frame"))).toBe(true);
  expect(valid.data.warnings.some((warning) => warning.includes("whiteboard"))).toBe(true);
  expect(valid.data.warnings.some((warning) => warning.includes("image asset"))).toBe(true);
  expect(valid.data.warnings.some((warning) => warning.includes("includes music"))).toBe(true);
  expect(valid.data.block_usage.map((usage) => usage.block_id)).toEqual(["code_highlight", "macos_notification"]);
  expect(valid.data.block_usage.map((usage) => usage.visual_role)).toEqual(["code or keyword highlight", "small notification insert"]);
  expect(valid.data.block_usage[0]?.source).toContain("registry/blocks/code-highlight");
  expect(valid.data.cdn_dependencies.map((dependency) => dependency.id)).toContain("font_code_combo");
  expect(valid.data.cdn_dependencies.map((dependency) => dependency.id)).toContain("font_inter");
  const cardAsset = valid.data.asset_summary.find((asset) => asset.id === "card");
  expect(cardAsset?.source).toBe("agent_generated");
  expect(cardAsset?.used_by).toEqual(["img"]);
  expect(cardAsset?.dimensions).toEqual({ width: 64, height: 64 });
  expect(cardAsset?.exists).toBe(true);
  const bedAsset = valid.data.asset_summary.find((asset) => asset.id === "bed");
  expect(bedAsset?.source).toBe("user");
  expect(bedAsset?.used_by).toEqual(["bed"]);
  expect(bedAsset?.duration_seconds).toBe(2);
  expect(bedAsset?.exists).toBe(true);
  expect(valid.data.qa_checks.map((check) => check.id)).toEqual(["card-covering", "card-img", "music-bed"]);
  expect(valid.data.qa_checks.find((check) => check.id === "music-bed")?.warnings).toContain("bed: music ducking is disabled");
});

test("lists vendored element catalog and validates v1.2 element usage", () => {
  if (!commandExists("ffmpeg")) return;
  const { project } = readyProject(2);
  const catalog = elementCatalogProject(project);
  expect(catalog.ok).toBe(true);
  if (!catalog.ok) throw new Error(catalog.error.message);
  expect(catalog.data.stats.registry.blocks).toBe(109);
  expect(catalog.data.stats.registry.components).toBe(25);
  expect(catalog.data.stats.resources.sfx).toBe(19);
  const codeElement = catalog.data.elements.find((element) => element.element_id === "code-highlight" && element.element_type === "registry_block");
  const shimmerElement = catalog.data.elements.find((element) => element.element_id === "shimmer-sweep" && element.element_type === "registry_component");
  const clickElement = catalog.data.elements.find((element) => element.element_id === "click" && element.element_type === "sfx");
  expect(codeElement?.adapter.family).toBe("code");
  expect(codeElement?.adapter.render_strategy).toBe("cli_overlay");
  expect(shimmerElement?.adapter.requires_anchor_point).toBe(true);
  expect(clickElement?.adapter.render_strategy).toBe("sfx_mix");
  expect(catalog.data.recommendations.screen_recording.some((element) => element.family === "transition" || element.family === "vfx_texture" || element.family === "social" || element.family === "app_showcase")).toBe(false);
  expect(catalog.data.recommendations.screen_recording.slice(0, 12).some((element) => element.family === "screen_focus")).toBe(true);
  expect(catalog.data.recommendations.screen_recording.slice(0, 12).some((element) => element.family === "sfx")).toBe(true);
  expect(catalog.data.purpose_recommendations.screen_recording.internal_tutorial.some((element) => element.family === "screen_focus")).toBe(true);
  expect(catalog.data.purpose_recommendations.screen_recording.internal_tutorial.some((element) => element.family === "transition" || element.family === "social" || element.family === "app_showcase")).toBe(false);
  expect(catalog.data.purpose_recommendations.talking_head_avatar.short_form.some((element) => element.family === "transition" || element.family === "social" || element.family === "app_showcase")).toBe(true);
  expect(catalog.data.purpose_recommendations.talking_head_avatar.product_demo.some((element) => element.family === "app_showcase")).toBe(true);

  writeFileSync(join(project, "asset-manifest.json"), JSON.stringify({ assets: [] }));
  writeFileSync(
    join(project, "enrichment-plan.json"),
    JSON.stringify({
      version: "1.2",
      profile: { source_mode: "screen_recording" },
      captions: { enabled: false, identity: "anchor" },
      elements: [
        {
          id: "large-block",
          source: "agent",
          element_id: "code-highlight",
          element_type: "registry_block",
          start: 0.1,
          end: 0.9,
          zone: "full_frame",
          params: { code: "const answer = 42;" },
          reason: "show real registry block warning",
        },
        {
          id: "shine",
          source: "agent",
          element_id: "shimmer-sweep",
          element_type: "registry_component",
          start: 0.9,
          end: 1.3,
          anchor_point: { x: 0.08, y: 0.72 },
          params: { text: "关键节点" },
          reason: "small text accent",
        },
        {
          id: "click",
          source: "agent",
          element_id: "click",
          element_type: "sfx",
          start: 1.3,
          end: 1.5,
          sfx_id: "click",
          params: { volume: 0.12 },
          reason: "sync UI click",
        },
        {
          id: "bad-sfx",
          source: "agent",
          element_id: "pop",
          element_type: "sfx",
          start: 1.45,
          end: 1.7,
          sfx_id: "pop",
          params: { volume: 0.2 },
          reason: "decorative sound",
        },
        {
          id: "zoom-rule",
          source: "agent",
          element_id: "animation-rule:coordinate-target-zoom",
          element_type: "animation_rule",
          start: 1.5,
          end: 1.8,
          target_rect: { x: 0.42, y: 0.28, width: 0.18, height: 0.14 },
          params: { title: "聚焦按钮", coordinate_source_frame: "source@1.6s" },
          reason: "zoom to a real UI target",
        },
      ],
    }),
  );
  const valid = enrichPlanProject(project);
  expect(valid.ok).toBe(true);
  if (!valid.ok) throw new Error(valid.error.message);
  expect(valid.data.source_mode).toBe("screen_recording");
  expect(valid.data.element_count).toBe(5);
  expect(valid.data.requires_hyperframes).toBe(true);
  expect(valid.data.element_usage.map((usage) => usage.element_id)).toEqual(["code-highlight", "shimmer-sweep", "click", "pop", "animation-rule:coordinate-target-zoom"]);
  expect(valid.data.element_usage[0]?.source).toBe("registry/blocks/code-highlight");
  expect(valid.data.element_usage[0]?.adapter.family).toBe("code");
  expect(valid.data.element_usage[0]?.adapter.render_strategy).toBe("cli_overlay");
  expect(valid.data.element_usage[1]?.source).toBe("registry/components/shimmer-sweep");
  expect(valid.data.element_usage[2]?.source).toBe("hyperframes-media/assets/sfx");
  expect(valid.data.element_usage[4]?.adapter.family).toBe("screen_focus");
  expect(valid.data.element_usage[4]?.adapter.render_strategy).toBe("cli_overlay");
  expect(valid.data.element_usage[4]?.guidance_only).toBe(false);
  expect(valid.data.warnings.some((warning) => warning.includes("full_frame"))).toBe(true);
  expect(valid.data.warnings.some((warning) => warning.includes("shine") && warning.includes("coordinate_source_frame"))).toBe(true);
  expect(valid.data.warnings.some((warning) => warning.includes("click") && warning.includes("SFX"))).toBe(false);
  expect(valid.data.warnings.some((warning) => warning.includes("bad-sfx") && warning.includes("SFX"))).toBe(true);
  expect(valid.data.warnings.some((warning) => warning.includes("zoom-rule") && warning.includes("guidance_only"))).toBe(false);
  expect(valid.data.warnings.some((warning) => warning.includes("zoom-rule") && warning.includes("coordinate_source_frame"))).toBe(false);
  expect(valid.data.qa_checks.map((check) => check.id)).toEqual(["element-large-block", "element-shine", "element-click", "element-bad-sfx", "element-zoom-rule"]);
  expect(valid.data.qa_checks.find((check) => check.id === "element-shine")?.warnings[0]).toContain("coordinate_source_frame");
  expect(valid.data.qa_checks.find((check) => check.id === "element-click")?.frame_times).toEqual([]);

  writeFileSync(
    join(project, "enrichment-plan.json"),
    JSON.stringify({
      version: "1.2",
      profile: { source_mode: "screen_recording" },
      captions: { enabled: false, identity: "anchor" },
      elements: [{ id: "missing-code", source: "agent", element_id: "code-highlight", element_type: "registry_block", start: 0.1, end: 0.9, reason: "missing code" }],
    }),
  );
  const missingCode = enrichPlanProject(project);
  expect(missingCode.ok).toBe(false);
  if (missingCode.ok) throw new Error("expected missing code failure");
  expect(missingCode.error.message).toContain("params.code");

  writeFileSync(
    join(project, "enrichment-plan.json"),
    JSON.stringify({
      version: "1.2",
      profile: { source_mode: "screen_recording" },
      captions: { enabled: false, identity: "anchor" },
      elements: [{ id: "missing-target", source: "agent", element_id: "cinematic-zoom", element_type: "registry_block", start: 0.1, end: 0.9, reason: "missing target" }],
    }),
  );
  const missingTarget = enrichPlanProject(project);
  expect(missingTarget.ok).toBe(false);
  if (missingTarget.ok) throw new Error("expected missing target failure");
  expect(missingTarget.error.message).toContain("target_rect");
});

test("builds storyboard aspect and anchor caption cues without rendering", () => {
  if (!commandExists("ffmpeg")) return;
  const cases = [
    { size: "160x90", expected: "16:9" },
    { size: "90x160", expected: "9:16" },
    { size: "120x150", expected: "4:5" },
  ] as const;
  for (const item of cases) {
    const dir = mkdtempSync(join(tmpdir(), "koubo-clip-storyboard-"));
    const clean = join(dir, "clean.mp4");
    const subtitles = join(dir, "subtitles.srt");
    const publicDir = join(dir, "public");
    mkdirSync(publicDir, { recursive: true });
    makeSampleVideo(clean, 2, item.size);
    writeFileSync(subtitles, "1\n00:00:00,100 --> 00:00:01,000\nhello caption\n");
    const plan = parseEnrichmentPlan({
      version: "1.1",
      profile: { source_mode: "screen_recording", aspect_ratio: "source", caption_identity: "anchor" },
      captions: { enabled: true, identity: "anchor" },
      cards: [
        {
          id: "card",
          start: 0.2,
          end: 1.2,
          kind: "screenshot_focus",
          block_id: "target_zoom",
          title: "Point",
          target_rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.2 },
          anchor_point: { x: 0.42, y: 0.3 },
          reason: "test",
        },
      ],
      music: [],
    });
    const storyboard = buildEnrichmentStoryboard(dir, clean, subtitles, plan, parseAssetManifest({ assets: [] }), publicDir);
    expect(storyboard.canvas.aspect_ratio).toBe(item.expected);
    expect(storyboard.profile.source_mode).toBe("screen_recording");
    expect(storyboard.captions.cues[0]).toEqual({ start: 0.1, end: 1, text: "hello caption" });
    expect(storyboard.cards[0]?.style).toBe("minimal");
    expect(storyboard.cards[0]?.block_id).toBe("target_zoom");
    expect(storyboard.cards[0]?.template_family).toBe("target_zoom");
    expect(storyboard.cards[0]?.motion).toContain("coordinate_zoom");
    expect(storyboard.block_usage[0]?.block_id).toBe("target_zoom");
    expect(storyboard.block_usage[0]?.visual_role).toBe("target zoom primitive");
    expect(storyboard.block_usage[0]?.dependencies).toContain("gsap_3_14_2");
    expect(storyboard.dependencies.some((dependency) => dependency.package_name === "gsap" && dependency.version === "3.14.2")).toBe(true);
    expect(storyboard.cards[0]?.target_rect).toEqual({ x: 0.1, y: 0.2, width: 0.3, height: 0.2 });
    expect(storyboard.cards[0]?.anchor_point).toEqual({ x: 0.42, y: 0.3 });
    expect(storyboard.qa_checks[0]?.id).toBe("card-card");
    expect(storyboard.qa_checks[0]?.frame_times.length).toBe(1);
    expect(storyboard.qa_checks[0]?.warnings[0]).toContain("coordinate_source_frame");
  }
});

test("stages generated asset elements into the recut workspace", () => {
  if (!commandExists("ffmpeg")) return;
  const dir = mkdtempSync(join(tmpdir(), "koubo-clip-generated-asset-"));
  const clean = join(dir, "clean.mp4");
  const subtitles = join(dir, "subtitles.srt");
  const publicDir = join(dir, "public");
  mkdirSync(join(dir, "assets", "images"), { recursive: true });
  mkdirSync(join(publicDir, "assets"), { recursive: true });
  makeSampleVideo(clean, 2);
  writeFileSync(subtitles, "");
  writeFileSync(join(dir, "assets", "images", "concept.svg"), '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240"><rect width="400" height="240" fill="#111827"/></svg>');
  const assets = parseAssetManifest({ assets: [{ id: "concept", path: "assets/images/concept.svg", type: "image", source: "agent_generated" }] });
  const plan = parseEnrichmentPlan({
    version: "1.2",
    profile: { source_mode: "talking_head_avatar", aspect_ratio: "source", caption_identity: "anchor" },
    captions: { enabled: false, identity: "anchor" },
    elements: [
      {
        id: "concept-overlay",
        source: "agent",
        element_id: "concept-card",
        element_type: "generated_asset",
        start: 0.2,
        end: 1.4,
        asset_id: "concept",
        zone: "right_panel",
        params: { title: "Concept", detail: "Real asset overlay" },
        reason: "show generated visual",
      },
    ],
    music: [],
  });

  const storyboard = buildEnrichmentStoryboard(dir, clean, subtitles, plan, assets, publicDir);
  expect(storyboard.elements[0]?.adapter.render_strategy).toBe("asset_overlay");
  expect(storyboard.elements[0]?.asset_path).toBe("assets/concept.svg");
  expect(storyboard.qa_checks[0]?.asset_id).toBe("concept");
  expect(storyboard.qa_checks[0]?.status).toBe("sampled");
  expect(existsSync(join(publicDir, "assets", "concept.svg"))).toBe(true);
});

test("storyboard QA samples long visual elements at three points", () => {
  if (!commandExists("ffmpeg")) return;
  const dir = mkdtempSync(join(tmpdir(), "koubo-clip-qa-"));
  const clean = join(dir, "clean.mp4");
  const subtitles = join(dir, "subtitles.srt");
  const publicDir = join(dir, "public");
  mkdirSync(publicDir, { recursive: true });
  makeSampleVideo(clean, 8);
  writeFileSync(subtitles, "");
  const plan = parseEnrichmentPlan({
    version: "1.2",
    profile: { source_mode: "talking_head_avatar", aspect_ratio: "source", caption_identity: "anchor" },
    captions: { enabled: false, identity: "anchor" },
    elements: [{ id: "long-lower", source: "agent", element_id: "lt-accent-underline", element_type: "registry_block", start: 0.2, end: 6.8, params: { title: "Long", subtitle: "QA" }, reason: "long visual" }],
    music: [],
  });
  const storyboard = buildEnrichmentStoryboard(dir, clean, subtitles, plan, parseAssetManifest({ assets: [] }), publicDir);
  expect(storyboard.qa_checks[0]?.frame_times).toEqual([0.6, 3.5, 6.4]);
});

test("renders v1.1 screen-recording recut to final mp4 and reports it when HyperFrames is enabled", () => {
  if (process.env.KOUBO_CLIP_TEST_HYPERFRAMES !== "1" || !commandExists("npx") || !commandExists("ffmpeg")) return;
  const { project } = readyProject(2);
  makeStillImage(join(project, "assets", "images", "card.png"));
  writeFileSync(join(project, "asset-manifest.json"), JSON.stringify({ assets: [{ id: "card", path: "assets/images/card.png", type: "image" }] }));
  mkdirSync(join(project, ".hyperframes", "recut", "public", "cards"), { recursive: true });
  writeFileSync(join(project, ".hyperframes", "recut", "public", "cards", "stale.html"), "stale");
  writeFileSync(
    join(project, "enrichment-plan.json"),
    JSON.stringify({
      version: "1.1",
      profile: { source_mode: "screen_recording", aspect_ratio: "source", caption_identity: "anchor" },
      captions: { enabled: true, identity: "anchor" },
      cards: [
        {
          id: "focus",
          start: 0.2,
          end: 0.8,
          kind: "screenshot_focus",
          title: "按钮位置",
          target_rect: { x: 0.18, y: 0.2, width: 0.28, height: 0.18 },
          reason: "highlight ui",
        },
        { id: "lower", start: 0.8, end: 1.2, kind: "lower_third", title: "关键步骤", anchor_point: { x: 0.08, y: 0.66 }, reason: "compact label" },
        { id: "img", start: 1.2, end: 1.7, kind: "image", title: "示意图", asset_id: "card", zone: "right_panel", reason: "show card" },
      ],
      music: [],
    }),
  );
  const rendered = renderProject(project);
  if (!rendered.ok) throw new Error(rendered.error.message);
  expect(rendered.ok).toBe(true);
  expect(Boolean(rendered.data.final_render_path && existsSync(rendered.data.final_render_path))).toBe(true);
  expect(existsSync(join(project, "storyboard.json"))).toBe(true);
  const indexPath = join(project, ".hyperframes", "recut", "public", "index.html");
  expect(existsSync(indexPath)).toBe(true);
  const indexHtml = readFileSync(indexPath, "utf8");
  expect(indexHtml).toContain("source-screen_recording");
  expect(indexHtml).toContain("https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js");
  expect(indexHtml).toContain('data-block-id="target_zoom"');
  expect(indexHtml).toContain('data-template-family="target_zoom"');
  expect(indexHtml).toContain("window.__timelines.recut");
  expect(indexHtml).toContain("focus-corners");
  expect(indexHtml).toContain("screen-chip");
  expect(indexHtml).toContain("accent-sweep");
  expect(indexHtml).toContain("allowlisted GSAP runtime failed to load");
  expect(indexHtml).toContain("animateScreenFocus");
  expect(indexHtml).toContain("right:auto;bottom:auto;min-height:auto;");
  expect(indexHtml.includes("assets/gsap.min.js")).toBe(false);
  expect(readFileSync(join(project, ".hyperframes", "recut", "public", "hyperframes.json"), "utf8").includes("https://")).toBe(false);
  expect(existsSync(join(project, ".hyperframes", "recut", "public", "assets", "gsap.min.js"))).toBe(false);
  expect(existsSync(join(project, ".hyperframes", "recut", "public", "cards", "stale.html"))).toBe(false);

  const inspected = inspectProject(project);
  expect(inspected.ok).toBe(true);
  if (!inspected.ok) throw new Error(inspected.error.message);
  expect(inspected.data.output_path.endsWith("final.mp4")).toBe(true);
  expect(inspected.data.enrichment_applied).toBe(true);
  expect(inspected.data.source_mode).toBe("screen_recording");
  expect(inspected.data.block_usage.map((usage) => usage.block_id)).toEqual(["target_zoom", "keyword_glow", "macos_notification"]);
  expect(inspected.data.block_usage.map((usage) => usage.visual_role)).toEqual(["target zoom primitive", "ASR keyword emphasis", "small notification insert"]);
  expect(inspected.data.cdn_dependencies.some((dependency) => dependency.id === "gsap_3_14_2" && dependency.version === "3.14.2")).toBe(true);
  expect(inspected.data.asset_summary[0]?.id).toBe("card");
  expect(inspected.data.asset_summary[0]?.path).toBe("assets/images/card.png");
  expect(inspected.data.asset_summary[0]?.type).toBe("image");
  expect(inspected.data.asset_summary[0]?.exists).toBe(true);
  expect(inspected.data.inspection_checks.length).toBe(3);
  expect(inspected.data.inspection_checks[0]?.frame_paths.length).toBe(1);
  expect(inspected.data.inspection_frames.length).toBe(3);
  expect(existsSync(inspected.data.inspection_frames[0]!)).toBe(true);
  expect(readFileSync(inspected.data.report_path, "utf8")).toContain("img image");
  expect(readFileSync(inspected.data.report_path, "utf8")).toContain("focus screenshot_focus");
  expect(readFileSync(inspected.data.report_path, "utf8")).toContain("## HyperFrames Blocks");
  expect(readFileSync(inspected.data.report_path, "utf8")).toContain("focus: target_zoom");
  expect(readFileSync(inspected.data.report_path, "utf8")).toContain("## CDN Dependencies");
  expect(readFileSync(inspected.data.report_path, "utf8")).toContain("gsap_3_14_2 script gsap@3.14.2");
  expect(readFileSync(inspected.data.report_path, "utf8")).toContain("## Assets");
  expect(readFileSync(inspected.data.report_path, "utf8")).toContain("## QA Checks");
  expect(readFileSync(inspected.data.report_path, "utf8")).toContain(".inspection/card-img.jpg");
});

test("renders music enrichment with audio in final mp4", () => {
  if (!commandExists("ffmpeg")) return;
  const { project } = readyProject(2);
  makeMusic(join(project, "assets", "music", "bed.wav"), 2);
  writeFileSync(join(project, "asset-manifest.json"), JSON.stringify({ assets: [{ id: "bed", path: "assets/music/bed.wav", type: "music" }] }));
  writeFileSync(
    join(project, "enrichment-plan.json"),
    JSON.stringify({ version: "1.0", slots: [{ id: "music", type: "music_segment", start: 0, end: 1.8, asset_id: "bed", volume: 0.1, fade_seconds: 0.1, ducking: false, reason: "bed" }] }),
  );
  const rendered = renderProject(project);
  expect(rendered.ok).toBe(true);
  if (!rendered.ok) throw new Error(rendered.error.message);
  expect(Boolean(rendered.data.final_render_path && hasAudio(rendered.data.final_render_path))).toBe(true);
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
    JSON.stringify({ version: "1.0", slots: [{ id: "music", type: "music_segment", start: 0, end: 1.8, asset_id: "acquired-bed", volume: 0.1, fade_seconds: 0.1, ducking: false, reason: "bed" }] }),
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

test("acquires minimax music from hex response without leaking api key", async () => {
  const dir = mkdtempSync(join(tmpdir(), "koubo-clip-music-"));
  const project = join(dir, "project");
  mkdirSync(join(project, "assets", "music"), { recursive: true });
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
        data: { audio: Buffer.from("fake audio").toString("hex"), status: 2 },
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

test("inspect reports caption-only final renders as enriched", () => {
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
      version: "1.1",
      profile: { source_mode: "screen_recording", aspect_ratio: "source", caption_identity: "anchor" },
      captions: { enabled: true, identity: "anchor", emphasis: [{ start: 0.2, end: 0.8, text: "Caption", reason: "caption-only" }] },
      cards: [],
      music: [],
    }),
  );

  const inspected = inspectProject(project);
  expect(inspected.ok).toBe(true);
  if (!inspected.ok) throw new Error(inspected.error.message);
  expect(inspected.data.output_path.endsWith("final.mp4")).toBe(true);
  expect(inspected.data.enrichment_applied).toBe(true);
  expect(inspected.data.enrichment_summary[0]).toBe("captions anchor emphasis=1");
  expect(inspected.data.inspection_checks[0]?.kind).toBe("caption_emphasis");
  expect(inspected.data.inspection_frames.length).toBe(1);
  expect(readFileSync(inspected.data.report_path, "utf8")).toContain("- captions anchor emphasis=1");
});

test("renders a HyperFrames keyword slot when explicitly enabled", () => {
  if (process.env.KOUBO_CLIP_TEST_HYPERFRAMES !== "1" || !commandExists("npx") || !commandExists("ffmpeg")) return;
  const { project } = readyProject(2);
  writeFileSync(join(project, "asset-manifest.json"), JSON.stringify({ assets: [] }));
  writeFileSync(
    join(project, "enrichment-plan.json"),
    JSON.stringify({ version: "1.0", slots: [{ id: "kw", type: "keyword_callout", start: 0.2, end: 1.2, text: "KEY POINT", reason: "emphasis" }] }),
  );
  const rendered = renderProject(project);
  if (!rendered.ok) throw new Error(rendered.error.message);
  expect(rendered.ok).toBe(true);
  expect(existsSync(join(project, "storyboard.json"))).toBe(true);
  expect(existsSync(join(project, ".hyperframes", "recut", "public", "index.html"))).toBe(true);
  expect(Boolean(rendered.data.final_render_path && existsSync(rendered.data.final_render_path))).toBe(true);
});

test("renders v1.2 vendored HyperFrames elements when explicitly enabled", () => {
  if (process.env.KOUBO_CLIP_TEST_HYPERFRAMES !== "1" || !commandExists("npx") || !commandExists("ffmpeg")) return;
  const { project } = readyProject(2);
  writeFileSync(join(project, "asset-manifest.json"), JSON.stringify({ assets: [] }));
  writeFileSync(
    join(project, "enrichment-plan.json"),
    JSON.stringify({
      version: "1.2",
      profile: { source_mode: "screen_recording", aspect_ratio: "source", caption_identity: "anchor" },
      captions: { enabled: true, identity: "anchor", emphasis: [{ start: 0.4, end: 1.0, text: "真实字幕重点", reason: "same as caption component" }] },
      elements: [
        { id: "lower", source: "agent", element_id: "lt-accent-underline", element_type: "registry_block", start: 0.2, end: 0.9, zone: "lower_third", params: { title: "关键步骤", subtitle: "屏幕操作" }, reason: "real registry block" },
        { id: "caption-pop", source: "agent", element_id: "caption-highlight", element_type: "registry_component", start: 0.4, end: 1.0, params: { text: "真实字幕重点" }, reason: "real caption component without demo words" },
        { id: "shine", source: "agent", element_id: "shimmer-sweep", element_type: "registry_component", start: 0.9, end: 1.4, anchor_point: { x: 0.08, y: 0.68 }, params: { text: "关键节点" }, reason: "real registry component" },
        { id: "click", source: "agent", element_id: "click", element_type: "sfx", start: 1.2, end: 1.45, sfx_id: "click", reason: "real vendored sfx" },
      ],
      music: [],
    }),
  );
  const rendered = renderProject(project);
  if (!rendered.ok) throw new Error(rendered.error.message);
  expect(Boolean(rendered.data.final_render_path && existsSync(rendered.data.final_render_path))).toBe(true);
  const indexHtml = readFileSync(join(project, ".hyperframes", "recut", "public", "index.html"), "utf8");
  expect(indexHtml).toContain('data-composition-src="compositions/lt-accent-underline.html"');
  expect(indexHtml).toContain("shimmer-sweep-target");
  expect(indexHtml).toContain("caption-component-host");
  expect(indexHtml).toContain("caption-component-host shimmer-sweep-target zone-caption");
  expect(indexHtml.includes("caption-component-host shimmer-sweep-target zone-lower_third")).toBe(false);
  expect(indexHtml.includes('class="clip emphasis-chip"')).toBe(false);
  expect(indexHtml).toContain("max-width:min(820px, calc(100% - 160px))");
  expect(indexHtml).toContain("真实字幕重点");
  expect(indexHtml.includes("Every great")).toBe(false);
  expect(existsSync(join(project, ".hyperframes", "recut", "public", "compositions", "lt-accent-underline.html"))).toBe(true);
  const lowerHtml = readFileSync(join(project, ".hyperframes", "recut", "public", "compositions", "lt-accent-underline.html"), "utf8");
  expect(lowerHtml).toContain("关键步骤");
  expect(lowerHtml.includes("Dr. Maya Chen")).toBe(false);
  expect(existsSync(join(project, ".hyperframes", "recut", "public", "compositions", "components", "shimmer-sweep.html"))).toBe(true);
  const inspected = inspectProject(project);
  expect(inspected.ok).toBe(true);
  if (!inspected.ok) throw new Error(inspected.error.message);
  expect(inspected.data.element_usage.map((usage) => usage.element_id)).toEqual(["anchor", "lt-accent-underline", "caption-highlight", "shimmer-sweep", "click"]);
  expect(inspected.data.element_usage[1]?.adapter.family).toBe("lower_third");
  expect(readFileSync(inspected.data.report_path, "utf8")).toContain("family=lower_third strategy=native_composition");
  expect(inspected.data.inspection_frames.some((frame) => frame.includes("element-lower"))).toBe(true);
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

test("source frame reruns clean managed files and invalidate old manifests before request failures", () => {
  const { project } = readyProject(2);
  writeSourceFrameRequest(project, [sourceFrameRequest("frame-a", 0.2), sourceFrameRequest("frame-b", 0.7), sourceFrameRequest("frame-c", 1.2)]);
  expect(sourceFramesProject(project).ok).toBe(true);
  writeSourceFrameRequest(project, [sourceFrameRequest("frame-only", 0.5)]);
  expect(sourceFramesProject(project).ok).toBe(true);
  expect(existsSync(join(project, ".source-frames", "frame-0001.jpg"))).toBe(true);
  expect(existsSync(join(project, ".source-frames", "frame-0002.jpg"))).toBe(false);
  expect(existsSync(join(project, ".source-frames", "frame-0003.jpg"))).toBe(false);

  writeFileSync(join(project, "source-frame-request.json"), "{");
  const invalid = sourceFramesProject(project);
  expect(invalid.ok).toBe(false);
  if (invalid.ok) throw new Error("expected invalid request failure");
  expect(invalid.error.code).toBe("SOURCE_FRAME_REQUEST_INVALID");
  expect(existsSync(join(project, "source-frames.json"))).toBe(false);

  rmSync(join(project, "source-frame-request.json"), { force: true });
  const missing = sourceFramesProject(project);
  expect(missing.ok).toBe(false);
  if (missing.ok) throw new Error("expected missing request failure");
  expect(missing.error.code).toBe("SOURCE_FRAME_REQUEST_MISSING");
  expect(existsSync(join(project, "source-frames.json"))).toBe(false);
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
  const endpointManifest = JSON.parse(readFileSync(join(endpoint, "sources.json"), "utf8")) as { sources: Array<{ duration_seconds: number }> };
  writeSourceFrameRequest(endpoint, [sourceFrameRequest("endpoint", endpointManifest.sources[0]!.duration_seconds)]);
  expectSourceFrameFailure(endpoint, "SOURCE_FRAME_TIME_OUT_OF_RANGE");

  const unsafe = readyProject(2).project;
  const unsafeManifest = JSON.parse(readFileSync(join(unsafe, "sources.json"), "utf8")) as { sources: Array<{ project_path: string }> };
  unsafeManifest.sources[0]!.project_path = "../raw.mp4";
  writeFileSync(join(unsafe, "sources.json"), JSON.stringify(unsafeManifest));
  writeSourceFrameRequest(unsafe, [sourceFrameRequest("unsafe", 0.2)]);
  expectSourceFrameFailure(unsafe, "SOURCE_FRAME_SOURCE_NOT_FOUND");

  const escapingReady = readyProject(2);
  const escapingManifest = JSON.parse(readFileSync(join(escapingReady.project, "sources.json"), "utf8")) as { sources: Array<{ project_path: string }> };
  const projectSource = join(escapingReady.project, escapingManifest.sources[0]!.project_path);
  unlinkSync(projectSource);
  const fsRuntime = nodeFs as unknown as { symlinkSync(target: string, path: string): void };
  fsRuntime.symlinkSync(escapingReady.source, projectSource);
  writeSourceFrameRequest(escapingReady.project, [sourceFrameRequest("escaping", 0.2)]);
  expectSourceFrameFailure(escapingReady.project, "SOURCE_FRAME_SOURCE_NOT_FOUND");

  const unreadableReady = readyProject(2);
  const unreadableManifest = JSON.parse(readFileSync(join(unreadableReady.project, "sources.json"), "utf8")) as { sources: Array<{ project_path: string }> };
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

  writeFileSync(
    join(project, "enrichment-plan.json"),
    JSON.stringify({
      version: "1.2",
      profile: { source_mode: "screen_recording" },
      captions: { enabled: true, identity: "anchor", emphasis: [] },
      cards: [],
      music: [],
      elements: review.data.proposed_elements,
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

function projectWithAnalysis(timing: "word" | "segment" | "text-only", language: string | undefined): string {
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
  writeFileSync(
    join(project, "analysis.json"),
    JSON.stringify({
      candidates: [{ id: "c-001-filler", source_id: "src-001", start: 0, end: 1, text: "嗯", type: "filler", reason: "test", confidence: 0.9 }],
    }),
  );
  writeFileSync(join(project, "edit-plan.json"), JSON.stringify({ decisions: [{ action: "cut", candidate_id: "c-001-filler" }] }));
  return project;
}

function readyProject(duration = 2): { project: string; source: string } {
  const dir = mkdtempSync(join(tmpdir(), "koubo-clip-enrich-"));
  const source = join(dir, "raw.mp4");
  const project = join(dir, "project");
  makeSampleVideo(source, duration);
  createProject([source], { projectPath: project });
  writeFileSync(
    join(project, "transcript.json"),
    JSON.stringify({
      timing_granularity: "segment",
      segments: [{ source_id: "src-001", start: 0.1, end: duration - 0.1, text: "hello world" }],
    }),
  );
  exploreProject(project, { asr: "external" });
  writeFileSync(join(project, "edit-plan.json"), JSON.stringify({ decisions: [] }));
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
