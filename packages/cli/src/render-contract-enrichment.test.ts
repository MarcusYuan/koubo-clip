import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindRenderContract, exportRenderContract, inspectBoundContract, renderBoundContract, verifyRenderContractBundle } from "./render-contract-commands";
import { createProject, enrichPlanProject, exploreProject } from "./project";
import { confirmProposalAndWriteEditPlan } from "./test-fixtures";

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
      { id: "anchor", source: "agent", element_id: "shimmer-sweep", element_type: "registry_component", start: 0.1, end: 0.6, reason: "anchor the effect", anchor_point: { x: 0.5, y: 0.5 } },
      { id: "lower-third", source: "agent", element_id: "lt-clean-bar", element_type: "registry_block", start: 0.1, end: 0.6, reason: "show the topic", params: { title: "Koubo Clip" } },
      { id: "target", source: "agent", element_id: "animation-rule:coordinate-target-zoom", element_type: "animation_rule", start: 0.1, end: 0.6, reason: "focus the target", target_rect: { x: 0.1, y: 0.1, width: 0.4, height: 0.3 } },
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
  expect(plan.elements[3]?.anchor_point).toEqual({ x: 0.5, y: 0.5 });
  expect(plan.elements[5]?.target_rect).toEqual({ height: 0.3, width: 0.4, x: 0.1, y: 0.1 });
});

test("built-in and external SFX keep only their selected source and export deterministically", async () => {
  if (!hasFfmpeg()) return;
  const { root, project } = await projectFixture("sfx");
  const assetPath = join(project, "assets", "external.wav");
  mkdirSync(join(project, "assets"), { recursive: true });
  makeAudio(assetPath, 0.3, 880);
  writeFileSync(join(project, "asset-manifest.json"), JSON.stringify({ assets: [{ id: "external-sfx", path: "assets/external.wav", type: "sfx", source: "user" }] }));
  writePlan(project, {
    elements: [{ id: "caption", source: "agent", element_id: "caption-editorial-emphasis", element_type: "registry_component", start: 0.1, end: 0.6, reason: "emphasize", params: { text: "Core point" } }],
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

test("combined enrichment render contract stages only referenced assets and renders strictly", async () => {
  if (!hasFfmpeg()) return;
  const { root, project, source } = await projectFixture("combined");
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
    elements: [
      { id: "identity", source: "agent", element_id: "anchor", element_type: "caption_identity", start: 0.1, end: 0.6, reason: "captions", caption_identity: "anchor" },
      { id: "caption", source: "agent", element_id: "caption-editorial-emphasis", element_type: "registry_component", start: 0.1, end: 0.6, reason: "emphasize", params: { text: "Core point" } },
      { id: "lower-third", source: "agent", element_id: "lt-clean-bar", element_type: "registry_block", start: 0.1, end: 0.6, reason: "identify the topic", params: { title: "Koubo Clip" } },
      { id: "hero", source: "agent", element_id: "hero", element_type: "visual_asset", start: 0.2, end: 0.5, reason: "show approved visual", asset_id: "hero", zone: "upper_third" },
    ],
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
  expect(readContract(bundle).payload.assets.map((asset: { asset_id: string }) => asset.asset_id).sort()).toEqual(["hero", "music"]);
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
  const framesRoot = join(root, "run", "render-contract-inspection-frames");
  const outside = join(root, "outside");
  rmSync(framesRoot, { recursive: true, force: true });
  mkdirSync(outside);
  symlinkSync(outside, framesRoot);
  const unsafeInspect = inspectBoundContract(bundle, rendered.data.result_path);
  expect(unsafeInspect.ok).toBe(false);
  if (unsafeInspect.ok) throw new Error("expected symlinked inspection output rejection");
  expect(unsafeInspect.error.code).toBe("UNSAFE_CONTRACT_PATH");
}, 240_000);

async function projectFixture(name: string): Promise<{ root: string; project: string; source: string }> {
  const root = mkdtempSync(join(tmpdir(), `koubo-enrichment-contract-${name}-`));
  const source = join(root, "raw.mp4");
  const project = join(root, "project");
  makeVideo(source);
  const created = createProject([source], { projectPath: project });
  if (!created.ok) throw new Error(created.error.message);
  writeFileSync(join(project, "transcript.json"), JSON.stringify({ timing_granularity: "segment", segments: [{ source_id: "src-001", start: 0.1, end: 1, text: "Core point" }] }));
  const explored = await exploreProject(project, { asr: "external" });
  if (!explored.ok) throw new Error(explored.error.message);
  confirmProposalAndWriteEditPlan(project);
  return { root, project, source };
}

function writePlan(project: string, plan: { elements: unknown[]; audio: { music: unknown[]; sfx: unknown[] } }): void {
  writeFileSync(join(project, "enrichment-plan.json"), JSON.stringify({ version: "2.0", profile, ...plan }));
}

function readContract(bundle: string): any {
  return JSON.parse(readFileSync(join(bundle, "render-contract.json"), "utf8"));
}

function hasFfmpeg(): boolean {
  return spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
}

function makeVideo(path: string): void {
  runFfmpeg(["-y", "-f", "lavfi", "-i", "testsrc=size=160x90:rate=30", "-t", "1.2", "-pix_fmt", "yuv420p", path]);
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
