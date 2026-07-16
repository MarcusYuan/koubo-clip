import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { projectArtifacts } from "./artifacts";
import { acquireVisualAssets } from "./visual/acquire";
import { commandExists, createProject, enrichPlanProject, exploreProject, renderProject } from "./project";
import { confirmProposalAndWriteEditPlan } from "./test-fixtures";

test("enrich and render reject asset symlinks that resolve outside the project", async () => {
  if (!commandExists("ffmpeg")) return;
  const { project, root } = await readyProject();
  const externalAsset = join(root, "outside-secret.svg");
  const linkedAsset = join(project, "assets", "images", "escape.svg");
  const externalBytes = '<svg xmlns="http://www.w3.org/2000/svg"><text>outside-secret-bytes</text></svg>';
  writeFileSync(externalAsset, externalBytes);
  symlinkSync(externalAsset, linkedAsset);
  writeFileSync(
    join(project, projectArtifacts.assetManifest),
    JSON.stringify({ assets: [{ id: "escape", path: "assets/images/escape.svg", type: "image", source: "user" }] }),
  );
  writeFileSync(
    join(project, projectArtifacts.enrichmentPlan),
    JSON.stringify({
      version: "2.0",
      profile: { source_mode: "talking_head_avatar", aspect_ratio: "source", caption_identity: "anchor", layout: "stack", style: "whiteboard", frame: "clean" },
      elements: [{ id: "escape-card", source: "agent", element_id: "escape", element_type: "visual_asset", start: 0.2, end: 1.2, asset_id: "escape", zone: "right_panel", reason: "security regression" }],
      audio: { music: [], sfx: [] },
    }),
  );

  const enriched = enrichPlanProject(project);
  const rendered = renderProject(project);

  expect(enriched.ok).toBe(false);
  expect(rendered.ok).toBe(false);
  if (enriched.ok || rendered.ok) throw new Error("expected project-local asset enforcement");
  expect(enriched.error.message).toContain("resolves outside the project");
  expect(rendered.error.message).toContain("resolves outside the project");
  expect(readFileSync(externalAsset, "utf8")).toBe(externalBytes);
  const lifecycle = JSON.parse(readFileSync(join(project, projectArtifacts.artifactManifest), "utf8")) as {
    artifacts: Record<string, unknown>;
  };
  expect(lifecycle.artifacts["asset:escape"]).toBe(undefined);
  expect(existsSync(join(project, projectArtifacts.finalRender))).toBe(false);
});

test("render rejects a symlinked staging root before writing outside the project", async () => {
  if (!commandExists("ffmpeg")) return;
  const { project, root } = await readyProject();
  const externalRenderRoot = join(root, "outside-render");
  mkdirSync(externalRenderRoot);
  symlinkSync(externalRenderRoot, join(project, ".render"));

  const rendered = renderProject(project);

  expect(rendered.ok).toBe(false);
  if (rendered.ok) throw new Error("expected render staging containment failure");
  expect(rendered.error.message).toContain("render staging directory resolves outside the project");
  expect(readdirSync(externalRenderRoot)).toEqual([]);
});

test("visual acquisition rejects a local asset symlink before reading or staging it", async () => {
  const root = mkdtempSync(join(tmpdir(), "koubo-visual-symlink-"));
  const project = join(root, "project");
  mkdirSync(project);
  const externalAsset = join(root, "outside.svg");
  const externalBytes = '<svg xmlns="http://www.w3.org/2000/svg"><text>outside-visual</text></svg>';
  writeFileSync(externalAsset, externalBytes);
  symlinkSync(externalAsset, join(project, "handoff.svg"));
  writeFileSync(
    join(project, projectArtifacts.visualRequest),
    JSON.stringify({
      version: "1.0",
      source_mode: "screen_recording",
      presentation_intent: "short_form",
      requests: [{
        id: "alarm",
        viewer_job: "show alarm",
        semantic_query: "alarm",
        asset_type: "icon",
        preferred_sources: ["local"],
        reason: "alarm needs an icon",
        selected_candidate_id: "alarm-local",
        selection_reason: "host handoff",
      }],
    }),
  );
  writeFileSync(
    join(project, projectArtifacts.visualCandidates),
    JSON.stringify({
      version: "1.0",
      candidates: [{
        id: "alarm-local",
        request_id: "alarm",
        provider: "local",
        asset_type: "icon",
        title: "Alarm",
        semantic_query: "alarm",
        local_path: "handoff.svg",
        renderable: true,
        recommended: true,
        reason: "local handoff",
        runtime_dependencies: [],
      }],
      warnings: [],
    }),
  );

  let failure: unknown;
  try {
    await acquireVisualAssets(project);
  } catch (error) {
    failure = error;
  }

  expect(String(failure)).toContain("local_path must be a project-local file");
  expect(String(failure)).toContain("resolves outside the project");
  expect(readFileSync(externalAsset, "utf8")).toBe(externalBytes);
  expect(existsSync(join(project, "assets"))).toBe(false);
  expect(readdirSync(project).some((entry) => entry.startsWith(".visual-acquire-staging-"))).toBe(false);
});

async function readyProject(): Promise<{ project: string; root: string }> {
  const root = mkdtempSync(join(tmpdir(), "koubo-asset-symlink-"));
  const source = join(root, "raw.mp4");
  const project = join(root, "project");
  makeSampleVideo(source);
  const created = createProject([source], { projectPath: project });
  if (!created.ok) throw new Error(created.error.message);
  writeFileSync(
    join(project, projectArtifacts.transcriptJson),
    JSON.stringify({
      timing_granularity: "segment",
      segments: [{ source_id: "src-001", start: 0.1, end: 1.9, text: "hello world" }],
    }),
  );
  const explored = await exploreProject(project, { asr: "external" });
  if (!explored.ok) throw new Error(explored.error.message);
  confirmProposalAndWriteEditPlan(project);
  return { project, root };
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
