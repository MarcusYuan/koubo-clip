import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { createProject } from "./project";
import { projectStatus } from "./project-status";

test("project status is read-only for a current detached project", () => {
  const project = currentDetachedProject();
  const before = snapshot(project);

  const status = projectStatus(project);

  expect(status.contract_version).toBe("1.0");
  expect(status.manifest_state).toBe("tracked");
  expect(status.sources?.[0]?.identity).toBe("available");
  expect(status.sources?.[0]?.materialization).toBe("unbound");
  expect(status.artifacts.some((artifact) => artifact.path.startsWith(".virtual/"))).toBe(false);
  expect(Object.keys(status.fingerprints).some((key) => key.startsWith("source-identity:"))).toBe(true);
  expect(snapshot(project)).toEqual(before);
});

test("project status rejects every non-current public project artifact contract", () => {
  const cases: Array<{ filename: string; value: unknown }> = [
    { filename: "production-proposal.json", value: { version: "1.1" } },
    { filename: "edit-plan.json", value: { decisions: [] } },
    { filename: "edl.json", value: { entries: [] } },
    { filename: "enrichment-plan.json", value: { version: "1.2", elements: [] } },
    { filename: "enrichment-plan.json", value: { version: "2.0", cards: [], profile: {}, elements: [], audio: {} } },
  ];

  for (const item of cases) {
    const project = currentDetachedProject();
    writeFileSync(join(project, item.filename), JSON.stringify(item.value));
    expectSchemaUnsupported(() => projectStatus(project));
  }

  const embedded = currentDetachedProject();
  const projectJson = JSON.parse(readFileSync(join(embedded, "project.json"), "utf8"));
  writeFileSync(join(embedded, "project.json"), JSON.stringify({ ...projectJson, asset_usage_plan: {} }));
  expectSchemaUnsupported(() => projectStatus(embedded));
});

function expectSchemaUnsupported(run: () => unknown): void {
  try {
    run();
    throw new Error("expected schema rejection");
  } catch (error) {
    expect((error as { code?: string }).code).toBe("CONTRACT_SCHEMA_UNSUPPORTED");
  }
}

function currentDetachedProject(): string {
  const root = mkdtempSync(join(tmpdir(), "koubo-current-status-"));
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
        duration_seconds: 2,
        video: {
          codec_name: "h264",
          width: 160,
          height: 90,
          display_width: 160,
          display_height: 90,
          rotation: 0,
          avg_frame_rate: "30/1",
          pixel_format: "yuv420p",
        },
        audio: { codec_name: "aac", sample_rate: 48000, channels: 2, channel_layout: "stereo" },
      },
    }],
  }));
  const created = createProject([], { projectPath: project, sourceManifestPath: sourceManifest, providerMode: "platform" });
  if (!created.ok) throw new Error(created.error.message);
  return project;
}

function snapshot(root: string): Array<{ path: string; size: number; bytes: string }> {
  const entries: Array<{ path: string; size: number; bytes: string }> = [];
  const visit = (directory: string) => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const stat = statSync(path);
      if (stat.isDirectory()) visit(path);
      else entries.push({ path: relative(root, path), size: stat.size, bytes: readFileSync(path, "utf8") });
    }
  };
  visit(root);
  return entries;
}
