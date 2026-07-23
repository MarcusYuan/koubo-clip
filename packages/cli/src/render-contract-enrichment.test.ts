import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindRenderContract, exportRenderContract, inspectBoundContract, renderBoundContract, verifyRenderContractBundle } from "./render-contract-commands";
import { createRenderContractV2 } from "./render-contract";
import { compileEdlProject, createProject, enrichPlanProject, exploreProject, proposalProject } from "./project";
import { confirmProposalAndWriteEditPlan } from "./test-fixtures";
import type { ProductionProposalArtifact } from "./artifacts";

const profile = {
  source_mode: "talking_head_avatar",
  aspect_ratio: "source",
  caption_identity: "anchor",
  layout: "overlay",
  style: "minimal",
  frame: "clean",
} as const;

test("enrichment elements export through one JSON-safe render-contract boundary", async () => {
  if (!hasFfmpeg()) return;
  const { root, project } = await projectFixture("elements");
  writePlan(project, {
    elements: [
      ...["caption-highlight", "caption-editorial-emphasis", "caption-pill-karaoke"].map((element_id, index) => ({
        id: `caption-${index}`,
        source: "agent",
        element_id,
        element_type: "registry_component",
        start: 0.1,
        end: 0.6,
        reason: "emphasize the spoken point",
        params: { text: "Core point" },
      })),
      { id: "lower-third", source: "agent", element_id: "lt-clean-bar", element_type: "registry_block", start: 0.1, end: 0.6, reason: "show the topic", params: { title: "Koubo Clip" } },
      { id: "keyword", source: "agent", element_id: "animation-rule:asr-keyword-glow", element_type: "animation_rule", start: 0.1, end: 0.6, reason: "highlight the keyword", params: { text: "Core point" } },
      { id: "identity", source: "agent", element_id: "anchor", element_type: "caption_identity", start: 0.1, end: 0.6, reason: "keep captions readable", caption_identity: "anchor" },
    ],
    audio: { music: [], sfx: [] },
  });
  const enriched = enrichPlanProject(project);
  if (!enriched.ok) throw new Error(`${enriched.error.code}: ${enriched.error.message}`);

  const bundle = join(root, "bundle");
  const exported = exportRenderContract(project, bundle);
  if (!exported.ok) throw new Error(`${exported.error.code}: ${exported.error.message}`);
  expect(verifyRenderContractBundle(bundle).ok).toBe(true);

  const contract = readContract(bundle);
  const plan = contract.payload.composition.enrichment_plan as { elements: Array<Record<string, unknown>> };
  for (const element of plan.elements.slice(0, 3)) {
    for (const absent of ["asset_id", "anchor_point", "target_rect"]) expect(Object.hasOwn(element, absent)).toBe(false);
  }
  expect(plan.elements[3]?.params).toEqual({ title: "Koubo Clip" });
  const storyboard = contract.payload.composition.storyboard as { captions: { enabled: boolean; identity: string; emphasis: unknown[] } };
  expect(storyboard.captions.enabled).toBe(true);
  expect(storyboard.captions.identity).toBe("anchor");
  expect(storyboard.captions.emphasis).toEqual([]);
  expect(JSON.stringify(storyboard.captions).includes('"text":"anchor"')).toBe(false);
});

test("caption identity only exposes explicit emphasis text", async () => {
  if (!hasFfmpeg()) return;
  const { root, project } = await projectFixture("caption-explicit-emphasis");
  writePlan(project, {
    elements: [{
      id: "identity",
      source: "agent",
      element_id: "anchor",
      element_type: "caption_identity",
      start: 0.1,
      end: 0.7,
      reason: "keep captions readable",
      caption_identity: "anchor",
      params: { text: "明确重点" },
    }],
    audio: { music: [], sfx: [] },
  });
  const enriched = enrichPlanProject(project);
  if (!enriched.ok) throw new Error(`${enriched.error.code}: ${enriched.error.message}`);
  const bundle = join(root, "bundle");
  const exported = exportRenderContract(project, bundle);
  if (!exported.ok) throw new Error(`${exported.error.code}: ${exported.error.message}`);
  const storyboard = readContract(bundle).payload.composition.storyboard as { captions: { emphasis: Array<{ text: string }> } };
  expect(storyboard.captions.emphasis.length).toBe(1);
  expect(storyboard.captions.emphasis[0]?.text).toBe("明确重点");

  writePlan(project, {
    elements: [{
      id: "identity",
      source: "agent",
      element_id: "anchor",
      element_type: "caption_identity",
      start: 0.1,
      end: 0.7,
      reason: "keep captions readable",
      caption_identity: "anchor",
      params: { label: "补充说明" },
    }],
    audio: { music: [], sfx: [] },
  });
  const labelEnriched = enrichPlanProject(project);
  if (!labelEnriched.ok) throw new Error(`${labelEnriched.error.code}: ${labelEnriched.error.message}`);
  const labelBundle = join(root, "bundle-label");
  const labelExported = exportRenderContract(project, labelBundle);
  if (!labelExported.ok) throw new Error(`${labelExported.error.code}: ${labelExported.error.message}`);
  const labelStoryboard = readContract(labelBundle).payload.composition.storyboard as { captions: { emphasis: Array<{ text: string }> } };
  expect(labelStoryboard.captions.emphasis.length).toBe(1);
  expect(labelStoryboard.captions.emphasis[0]?.text).toBe("补充说明");
});

test("enrichment caption layout must match the confirmed proposal preset", async () => {
  if (!hasFfmpeg()) return;
  const { project } = await projectFixture("caption-layout-mismatch");
  writeFileSync(join(project, "enrichment-plan.json"), JSON.stringify({
    version: "2.0",
    profile: { ...profile, caption_layout: { placement: "bottom_safe", size: "medium" } },
    elements: [{ id: "identity", source: "agent", element_id: "anchor", element_type: "caption_identity", start: 0.1, end: 0.6, reason: "keep captions readable", caption_identity: "anchor" }],
    audio: { music: [], sfx: [] },
  }));
  const enriched = enrichPlanProject(project);
  expect(enriched.ok).toBe(false);
  if (enriched.ok) throw new Error("expected caption layout mismatch");
  expect(enriched.error.code).toBe("PROPOSAL_EXECUTION_MISMATCH");
  expect(enriched.error.message).toContain("caption layout");
});

test("built-in and external SFX keep only their selected source and export deterministically", async () => {
  if (!hasFfmpeg()) return;
  const { root, project } = await projectFixture("sfx");
  confirmSelectedProposalMedia(project, { sfx: ["built-in", "external"] });
  const assetPath = join(project, "assets", "external.wav");
  mkdirSync(join(project, "assets"), { recursive: true });
  makeAudio(assetPath, 0.3, 880);
  writeFileSync(join(project, "asset-manifest.json"), JSON.stringify({ assets: [{ id: "external-sfx", path: "assets/external.wav", type: "sfx", source: "user" }] }));
  writePlan(project, {
    elements: [
      { id: "identity", source: "agent", element_id: "anchor", element_type: "caption_identity", start: 0.1, end: 0.6, reason: "keep captions readable", caption_identity: "anchor" },
      { id: "caption", source: "agent", element_id: "caption-editorial-emphasis", element_type: "registry_component", start: 0.1, end: 0.6, reason: "emphasize", params: { text: "Core point" } },
    ],
    audio: { music: [], sfx: [
      { id: "built-in", sfx_id: "click", start: 0.2, end: 0.3, volume: 0.2, fade_seconds: 0, reason: "sync click" },
      { id: "external", asset_id: "external-sfx", start: 0.4, end: 0.5, volume: 0.2, fade_seconds: 0, reason: "custom click" },
    ] },
  });
  const enriched = enrichPlanProject(project);
  if (!enriched.ok) throw new Error(`${enriched.error.code}: ${enriched.error.message}`);

  const first = exportRenderContract(project, join(root, "bundle-1"));
  const second = exportRenderContract(project, join(root, "bundle-2"));
  if (!first.ok) throw new Error(`${first.error.code}: ${first.error.message}`);
  if (!second.ok) throw new Error(`${second.error.code}: ${second.error.message}`);
  expect(first.data.contract_digest).toBe(second.data.contract_digest);
  expect(verifyRenderContractBundle(join(root, "bundle-1")).ok).toBe(true);

  const contract = readContract(join(root, "bundle-1"));
  const sfx = (contract.payload.audio as { sfx: Array<Record<string, unknown>> }).sfx;
  expect(sfx[0]?.sfx_id).toBe("click");
  expect(Object.hasOwn(sfx[0]!, "asset_id")).toBe(false);
  expect(sfx[1]?.asset_id).toBe("external-sfx");
  expect(Object.hasOwn(sfx[1]!, "sfx_id")).toBe(false);
  expect(contract.payload.assets.map((asset: { asset_id: string }) => asset.asset_id)).toEqual(["external-sfx"]);
});

test("empty enrichment exports and invalid enrichment remains fail-closed", async () => {
  if (!hasFfmpeg()) return;
  const { root, project } = await projectFixture("validation");
  writePlan(project, { elements: [], audio: { music: [], sfx: [] } });
  expect(enrichPlanProject(project).ok).toBe(true);
  const bundle = join(root, "bundle");
  expect(exportRenderContract(project, bundle).ok).toBe(true);
  expect(verifyRenderContractBundle(bundle).ok).toBe(true);

  const invalidPlans = [
    { elements: [{ id: "visual", source: "agent", element_id: "missing", element_type: "visual_asset", start: 0.1, end: 0.6, reason: "missing asset" }], audio: { music: [], sfx: [] } },
    { elements: [{ id: "anchor", source: "agent", element_id: "shimmer-sweep", element_type: "registry_component", start: 0.1, end: 0.6, reason: "missing anchor" }], audio: { music: [], sfx: [] } },
    { elements: [{ id: "target", source: "agent", element_id: "animation-rule:coordinate-target-zoom", element_type: "animation_rule", start: 0.1, end: 0.6, reason: "missing target" }], audio: { music: [], sfx: [] } },
    { elements: [], audio: { music: [], sfx: [{ id: "both", asset_id: "external", sfx_id: "click", start: 0.1, end: 0.2, volume: 0.2, fade_seconds: 0, reason: "invalid" }] } },
    { elements: [], audio: { music: [], sfx: [{ id: "neither", start: 0.1, end: 0.2, volume: 0.2, fade_seconds: 0, reason: "invalid" }] } },
    { elements: [{ id: "time", source: "agent", element_id: "caption-highlight", element_type: "registry_component", start: 0.6, end: 0.1, reason: "invalid time" }], audio: { music: [], sfx: [] } },
  ];
  for (const plan of invalidPlans) {
    writePlan(project, plan);
    expect(enrichPlanProject(project).ok).toBe(false);
  }
});

test("enrichment plan cannot change the confirmed proposal source mode", async () => {
  if (!hasFfmpeg()) return;
  const { project } = await projectFixture("source-mode-mismatch");
  writeFileSync(join(project, "enrichment-plan.json"), JSON.stringify({
    version: "2.0",
    profile: { ...profile, source_mode: "screen_recording" },
    elements: [],
    audio: { music: [], sfx: [] },
  }));

  const enriched = enrichPlanProject(project);
  expect(enriched.ok).toBe(false);
  if (enriched.ok) throw new Error("expected source mode mismatch");
  expect(enriched.error.code).toBe("PROPOSAL_EXECUTION_MISMATCH");
  expect(enriched.error.message).toContain("source_mode");
});

test("render-contract export rejects unfulfilled selected enrichment requirements", async () => {
  if (!hasFfmpeg()) return;
  const { root, project } = await projectFixture("missing-enrichment");
  confirmSelectedProposalMedia(project, { visual: ["visual-1"] });
  const exported = exportRenderContract(project, join(root, "bundle"));
  expect(exported.ok).toBe(false);
  if (exported.ok) throw new Error("expected missing enrichment plan rejection");
  expect(exported.error.code).toBe("PROPOSAL_EXECUTION_MISMATCH");
  expect(exported.error.message).toContain("missing=[visual-1]");
});

test("render-contract export honors selected proposal subtitles disabled", async () => {
  if (!hasFfmpeg()) return;
  const { root, project } = await projectFixture("subtitles-off");
  confirmSelectedProposalMedia(project, { subtitles: false });
  const bundle = join(root, "bundle");
  const exported = exportRenderContract(project, bundle);
  if (!exported.ok) throw new Error(`${exported.error.code}: ${exported.error.message}`);
  const contract = readContract(bundle);
  expect(contract.payload.captions.cues).toEqual([]);
  expect(contract.payload.composition.mode).toBe("clean");
});

test("combined enrichment render contract stages only referenced assets and renders strictly", async () => {
  if (!hasFfmpeg()) return;
  const { root, project, source } = await projectFixture("combined");
  confirmSelectedProposalMedia(project, { music: ["bed"], sfx: ["click"] });
  mkdirSync(join(project, "assets"), { recursive: true });
  makeImage(join(project, "assets", "hero.png"));
  makeAudio(join(project, "assets", "music.wav"), 1, 330);
  makeImage(join(project, "assets", "unused.png"));
  writeFileSync(join(project, "asset-manifest.json"), JSON.stringify({ assets: [
    { id: "hero", path: "assets/hero.png", type: "image", source: "user" },
    { id: "music", path: "assets/music.wav", type: "music", source: "user" },
    { id: "unused", path: "assets/unused.png", type: "image", source: "user" },
  ] }));
  writePlan(project, {
    elements: [],
    audio: {
      music: [{ id: "bed", asset_id: "music", start: 0, end: 0.7, volume: 0.08, fade_seconds: 0.05, ducking: true, reason: "quiet bed" }],
      sfx: [{ id: "click", sfx_id: "click", start: 0.3, end: 0.4, volume: 0.15, fade_seconds: 0, reason: "sync click" }],
    },
  });
  const enriched = enrichPlanProject(project);
  if (!enriched.ok) throw new Error(`${enriched.error.code}: ${enriched.error.message}`);

  const bundle = join(root, "bundle");
  const exported = exportRenderContract(project, bundle);
  if (!exported.ok) throw new Error(`${exported.error.code}: ${exported.error.message}`);
  expect(verifyRenderContractBundle(bundle).ok).toBe(true);
  expect(readContract(bundle).payload.assets.map((asset: { asset_id: string }) => asset.asset_id).sort()).toEqual(["music"]);
  expect(existsSync(join(bundle, "assets"))).toBe(true);

  const sourceMap = join(root, "source-map.json");
  const bindings = join(root, "bindings.json");
  writeFileSync(sourceMap, JSON.stringify({ "src-001": source }));
  expect(bindRenderContract(bundle, sourceMap, bindings).ok).toBe(true);
  const rendered = renderBoundContract(bundle, bindings, join(root, "run"));
  if (!rendered.ok) throw new Error(`${rendered.error.code}: ${rendered.error.message}`);
  const inspected = inspectBoundContract(bundle, rendered.data.result_path);
  if (!inspected.ok) throw new Error(`${inspected.error.code}: ${inspected.error.message}`);
  expect(inspected.data.accepted).toBe(true);
}, 240_000);

test("confirmed strong-hook reorder and source-local overlay survive the complete strict contract chain", async () => {
  if (!hasFfmpeg()) return;
  const { root, project, source } = await projectFixture("strong-hook", true);
  const proposal = JSON.parse(readFileSync(join(project, "production-proposal.json"), "utf8")) as ProductionProposalArtifact;
  const option = proposal.options.find((item) => item.id === proposal.recommended_option_id)!;
  option.label = "Strong hook";
  option.cleanup.cut_candidate_ids = [];
  option.subtitles = { enabled: true, style: "anchor", conflict_notes: [] };
  option.edit_execution_plan.duration_target = { min_seconds: 0.7, max_seconds: 0.8, target_seconds: 0.75, tolerance_frames: 2 };
  option.edit_execution_plan.timeline = {
    mode: "explicit_segments",
    segments: [
      { id: "payoff", source_id: "src-001", start: 0.65, end: 1.05, reason: "Open with the payoff." },
      { id: "setup", source_id: "src-001", start: 0.1, end: 0.45, reason: "Then show the compact setup." },
    ],
  };
  option.edit_execution_plan.text_overlays = [{
    id: "hook-text",
    source_id: "src-001",
    segment_id: "payoff",
    start: 0.7,
    end: 0.9,
    element_id: "caption-editorial-emphasis",
    text: "Core point",
    purpose: "Freeze the confirmed hook reminder.",
  }];
  option.asset_requirements = { visual_asset_slots: [], music_slots: [], sfx_slots: [], image_slots: [] };
  writeFileSync(join(project, "production-proposal.json"), JSON.stringify(proposal));
  const proposed = proposalProject(project);
  if (!proposed.ok) throw new Error(`${proposed.error.code}: ${proposed.error.message}`);
  writeFileSync(join(project, "edit-plan.json"), JSON.stringify({
    contract_version: "1.0",
    confirmed_option_id: option.id,
    proposal_selection_fingerprint: proposed.data.option_selection_fingerprints[option.id],
    decisions: [],
  }));
  const compiled = compileEdlProject(project);
  if (!compiled.ok) throw new Error(`${compiled.error.code}: ${compiled.error.message}`);

  const bundle = join(root, "bundle");
  const exported = exportRenderContract(project, bundle);
  if (!exported.ok) throw new Error(`${exported.error.code}: ${exported.error.message}`);
  const contract = readContract(bundle);
  expect(contract.schema_version).toBe("2.0");
  expect(contract.payload.captions.layout).toEqual({
    placement: "center_lower",
    size: "medium",
    anchor_x_ratio: 0.5,
    anchor_y_ratio: 0.7,
    font_size_px: 24,
  });
  expect(contract.payload.composition.storyboard.captions.layout).toEqual(contract.payload.captions.layout);
  expect(contract.payload.timeline.entries.map((entry: { source_id: string; start: number; end: number }) => ({
    source_id: entry.source_id,
    start: entry.start,
    end: entry.end,
  }))).toEqual([
    { source_id: "src-001", start: 0.65, end: 1.05 },
    { source_id: "src-001", start: 0.1, end: 0.45 },
  ]);
  const frozenPlan = contract.payload.composition.enrichment_plan as { elements: Array<Record<string, unknown>> };
  const overlay = frozenPlan.elements.find((element) => element.id === "hook-text")!;
  expect(Math.abs(Number(overlay.start) - 0.05) < 0.000001).toBe(true);
  expect(Math.abs(Number(overlay.end) - 0.25) < 0.000001).toBe(true);
  expect(overlay.params).toEqual({ text: "Core point" });
  expect(contract.payload.captions.cues.length > 0).toBe(true);
  expect(contract.payload.inspection.proposal_conformance.status).toBe("passed");
  expect(contract.payload.inspection.proposal_conformance.checks.some((check: { id: string; status: string }) => check.id === "resolved-overlay:hook-text" && check.status === "passed")).toBe(true);
  expect(contract.payload.authoring_lineage.members.map((member: { path: string }) => member.path)).toEqual([
    "sources.json",
    "production-proposal.json",
    "edit-plan.json",
    "edl.json",
    "transcript.json",
  ]);
  expect(contract.payload.authoring_lineage.logical_members).toEqual([{
    key: `proposal-selection:${option.id}`,
    fingerprint: proposed.data.option_selection_fingerprints[option.id],
  }]);
  const lifecycle = JSON.parse(readFileSync(join(project, "artifact-manifest.json"), "utf8")) as {
    artifacts: Record<string, { inputs?: Array<{ key: string }> }>;
  };
  expect(lifecycle.artifacts["render-contract"]?.inputs?.map((input) => input.key)).toEqual([
    "sources",
    "production-proposal",
    `proposal-selection:${option.id}`,
    "edit-plan",
    "edl",
    "transcript",
  ]);

  const sourceMap = join(root, "source-map.json");
  const bindings = join(root, "bindings.json");
  writeFileSync(sourceMap, JSON.stringify({ "src-001": source }));
  const bound = bindRenderContract(bundle, sourceMap, bindings);
  if (!bound.ok) throw new Error(`${bound.error.code}: ${bound.error.message}`);
  const rendered = renderBoundContract(bundle, bindings, join(root, "run"));
  if (!rendered.ok) throw new Error(`${rendered.error.code}: ${rendered.error.message}`);
  const inspected = inspectBoundContract(bundle, rendered.data.result_path);
  if (!inspected.ok) throw new Error(`${inspected.error.code}: ${inspected.error.message}`);
  expect(inspected.data.accepted).toBe(true);
  expect(inspected.data.technical_inspection_status).toBe("passed");
  expect(inspected.data.proposal_conformance_status).toBe("passed");
  expect(inspected.data.business_acceptance_status).toBe("passed");
  expect(inspected.data.overall_status).toBe("completed");
  const strictInspection = JSON.parse(readFileSync(join(root, "run", "render-contract-inspection.json"), "utf8")) as { frames: string[] };
  expect(strictInspection.frames.some((path) => path.includes("caption-layout"))).toBe(true);

  const drifted = structuredClone(contract);
  drifted.payload.composition.storyboard.captions.layout.anchor_y_ratio = 0.76;
  writeFileSync(join(bundle, "render-contract.json"), `${JSON.stringify(createRenderContractV2(drifted.payload), null, 2)}\n`);
  const rejected = verifyRenderContractBundle(bundle);
  expect(rejected.ok).toBe(false);
  if (rejected.ok) throw new Error("expected frozen caption layout drift rejection");
  expect(rejected.error.code).toBe("CONTRACT_INVALID");

  const cueDrifted = structuredClone(contract);
  cueDrifted.payload.composition.storyboard.captions.cues[0].text = "different frozen caption";
  writeFileSync(join(bundle, "render-contract.json"), `${JSON.stringify(createRenderContractV2(cueDrifted.payload), null, 2)}\n`);
  const cueRejected = verifyRenderContractBundle(bundle);
  expect(cueRejected.ok).toBe(false);
  if (cueRejected.ok) throw new Error("expected frozen caption cue drift rejection");
  expect(cueRejected.error.code).toBe("CONTRACT_INVALID");
}, 240_000);

test("HyperFrames caption DOM overflow fails before a strict result is committed", async () => {
  if (!hasFfmpeg()) return;
  const { root, project, source } = await projectFixture("caption-overflow", true);
  writePlan(project, {
    elements: [{
      id: "identity",
      source: "agent",
      element_id: "anchor",
      element_type: "caption_identity",
      start: 0.1,
      end: 0.6,
      reason: "exercise the caption DOM overflow gate",
      caption_identity: "anchor",
      params: { text: "超".repeat(1200) },
    }],
    audio: { music: [], sfx: [] },
  });
  const enriched = enrichPlanProject(project);
  if (!enriched.ok) throw new Error(`${enriched.error.code}: ${enriched.error.message}`);
  const bundle = join(root, "bundle");
  const exported = exportRenderContract(project, bundle);
  if (!exported.ok) throw new Error(`${exported.error.code}: ${exported.error.message}`);
  const sourceMap = join(root, "source-map.json");
  const bindings = join(root, "bindings.json");
  const run = join(root, "run");
  writeFileSync(sourceMap, JSON.stringify({ "src-001": source }));
  expect(bindRenderContract(bundle, sourceMap, bindings).ok).toBe(true);
  const rendered = renderBoundContract(bundle, bindings, run);
  expect(rendered.ok).toBe(false);
  if (rendered.ok) throw new Error("expected caption overflow rejection");
  expect(rendered.error.code).toBe("RENDER_PREFLIGHT_FAILED");
  expect(rendered.error.message).toContain("caption DOM inspection failed");
  expect(existsSync(run)).toBe(false);
}, 240_000);

async function projectFixture(name: string, portrait = false): Promise<{ root: string; project: string; source: string }> {
  const root = mkdtempSync(join(tmpdir(), `koubo-enrichment-contract-${name}-`));
  const source = join(root, "raw.mp4");
  const project = join(root, "project");
  makeVideo(source, portrait ? "180x320" : "160x90");
  const created = createProject([source], { projectPath: project });
  if (!created.ok) throw new Error(created.error.message);
  writeFileSync(join(project, "transcript.json"), JSON.stringify({ timing_granularity: "segment", segments: [{ source_id: "src-001", start: 0.1, end: 1, text: "Core point" }] }));
  const explored = await exploreProject(project, { asr: "external" });
  if (!explored.ok) throw new Error(explored.error.message);
  confirmProposalAndWriteEditPlan(project, [], undefined, { subtitleStyle: "anchor", sourceMode: "talking_head_avatar" });
  return { root, project, source };
}

function writePlan(project: string, plan: { elements: unknown[]; audio: { music: unknown[]; sfx: unknown[] } }): void {
  writeFileSync(join(project, "enrichment-plan.json"), JSON.stringify({ version: "2.0", profile, ...plan }));
}

function confirmSelectedProposalMedia(project: string, needs: { visual?: string[]; music?: string[]; sfx?: string[]; subtitles?: boolean }): void {
  const proposal = JSON.parse(readFileSync(join(project, "production-proposal.json"), "utf8")) as ProductionProposalArtifact;
  const option = proposal.options.find((item) => item.id === proposal.recommended_option_id);
  if (!option) throw new Error("fixture proposal is missing recommended option");
  if (needs.subtitles !== undefined) {
    option.subtitles = { ...option.subtitles, enabled: needs.subtitles, style: needs.subtitles ? option.subtitles.style : "none" };
  }
  if (needs.visual?.length) {
    option.asset_requirements.visual_asset_slots = needs.visual.map((slot_id) => ({ slot_id, kind: "visual_asset", purpose: "confirmed visual handoff", required: true }));
  }
  if (needs.music?.length) {
    option.music = { source: "local", ducking: true, notes: ["confirmed music handoff"] };
    option.asset_requirements.music_slots = needs.music.map((slot_id) => ({ slot_id, kind: "music", purpose: "confirmed music handoff", required: true }));
  }
  if (needs.sfx?.length) {
    option.sfx = { enabled: true, usage: "confirmed SFX handoff", restraint: "subtle" };
    option.asset_requirements.sfx_slots = needs.sfx.map((slot_id) => ({ slot_id, kind: "sfx", purpose: "confirmed SFX handoff", required: true }));
  }
  writeFileSync(join(project, "production-proposal.json"), JSON.stringify(proposal));
  const proposed = proposalProject(project);
  if (!proposed.ok) throw new Error(proposed.error.message);
  const editPlanPath = join(project, "edit-plan.json");
  const editPlan = JSON.parse(readFileSync(editPlanPath, "utf8")) as Record<string, unknown>;
  writeFileSync(editPlanPath, JSON.stringify({
    ...editPlan,
    proposal_selection_fingerprint: proposed.data.option_selection_fingerprints[proposal.recommended_option_id],
  }));
}

function readContract(bundle: string): any {
  return JSON.parse(readFileSync(join(bundle, "render-contract.json"), "utf8"));
}

function hasFfmpeg(): boolean {
  return spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
}

function makeVideo(path: string, size = "160x90"): void {
  runFfmpeg(["-y", "-f", "lavfi", "-i", `testsrc=size=${size}:rate=30`, "-t", "1.2", "-pix_fmt", "yuv420p", path]);
}

function makeAudio(path: string, duration: number, frequency: number): void {
  runFfmpeg(["-y", "-f", "lavfi", "-i", `sine=frequency=${frequency}:duration=${duration}`, "-c:a", "pcm_s16le", path]);
}

function makeImage(path: string): void {
  runFfmpeg(["-y", "-f", "lavfi", "-i", "color=c=red:size=64x64", "-frames:v", "1", path]);
}

function runFfmpeg(args: string[]): void {
  const result = spawnSync("ffmpeg", args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
}
