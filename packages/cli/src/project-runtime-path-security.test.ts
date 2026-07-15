import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { expect, test } from "bun:test";
import { projectArtifacts, type RenderResult } from "./artifacts";
import { commandExists, createProject, exploreProject, inspectProject, renderProject } from "./project";

test("inspect rejects project artifact symlinks that resolve outside the project", async () => {
  if (!commandExists("ffmpeg")) return;
  const root = mkdtempSync(join(tmpdir(), "koubo-runtime-path-security-"));
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
  writeFileSync(join(project, projectArtifacts.editPlan), JSON.stringify({ decisions: [] }));
  const rendered = renderProject(project);
  if (!rendered.ok) throw new Error(rendered.error.message);

  const renderResult = JSON.parse(readFileSync(join(project, projectArtifacts.renderResult), "utf8")) as RenderResult;
  const canonicalOutput = renderResult.outputs.find((output) => output.key === renderResult.canonical_output_key);
  if (!canonicalOutput) throw new Error("fixture render result has no canonical output");
  const manifestPath = join(project, projectArtifacts.artifactManifest);
  const committedManifest = readFileSync(manifestPath);
  const attackedPaths = [
    projectArtifacts.sources,
    projectArtifacts.edl,
    projectArtifacts.renderResult,
    canonicalOutput.path,
    projectArtifacts.artifactManifest,
  ];

  for (const [index, relativePath] of attackedPaths.entries()) {
    const projectPath = join(project, relativePath);
    const originalBytes = readFileSync(projectPath);
    const externalPath = join(root, `outside-${index}-${basename(relativePath)}`);
    copyFileSync(projectPath, externalPath);
    unlinkSync(projectPath);
    symlinkSync(externalPath, projectPath);
    try {
      const inspected = inspectProject(project);
      expect(inspected.ok).toBe(false);
      expect(readFileSync(externalPath)).toEqual(originalBytes);
    } finally {
      unlinkSync(projectPath);
      writeFileSync(projectPath, originalBytes);
      // A failure after render-result validation may record a failed inspect
      // attempt. Restore the checkpoint so every attack starts identically.
      writeFileSync(manifestPath, committedManifest);
    }
  }
});

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
