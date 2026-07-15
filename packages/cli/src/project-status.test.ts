import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import {
  parseSourcesManifest,
  type ArtifactFingerprint,
  type ArtifactFingerprintReference,
  type ArtifactManifest,
  type ArtifactRecord,
  type ArtifactRole,
  type ProviderExecutionMode,
  type RenderResult,
} from "./artifacts";
import { fileBytesFingerprint, semanticJsonFingerprint } from "./artifact-lifecycle";
import { inputFingerprint, renderResultFingerprintProjection } from "./project-lineage";
import { projectStatus } from "./project-status";

test("project status classifies legacy authoritative inputs as pending and old derived outputs as lineage-unproven", () => {
  const project = legacyProject("standalone");
  writeFileSync(
    join(project, "transcript.json"),
    JSON.stringify({
      timing_granularity: "segment",
      segments: [{ source_id: "src-001", start: 0, end: 2, text: "hello" }],
    }),
  );
  writeFileSync(join(project, "analysis.json"), JSON.stringify({ candidates: [] }));
  writeFileSync(
    join(project, "edl.json"),
    JSON.stringify({
      entries: [
        {
          source_id: "src-001",
          source_path: "source/001-original.mp4",
          start: 0,
          end: 2,
          output_order: 0,
          reason: "keep",
        },
      ],
    }),
  );

  const status = projectStatus(project);

  expect(status.manifest_state).toBe("legacy_untracked");
  expect(artifact(status, "project")?.state).toBe("pending_validation");
  expect(artifact(status, "sources")?.state).toBe("pending_validation");
  expect(artifact(status, "source:src-001")?.state).toBe("pending_validation");
  expect(artifact(status, "transcript")?.state).toBe("pending_validation");
  expect(artifact(status, "analysis")?.state).toBe("stale");
  expect(artifact(status, "analysis")?.reason_code).toBe("LINEAGE_UNPROVEN");
  expect(artifact(status, "edl")?.state).toBe("stale");
  expect(artifact(status, "edl")?.reason_code).toBe("LINEAGE_UNPROVEN");
  expect(status.next_commands[0]?.includes("project explore")).toBe(true);
  expect(existsSync(join(project, "artifact-manifest.json"))).toBe(false);
});

test("project status is strictly read-only, including file contents, mtimes, and manifest bytes", () => {
  const project = trackedCleanRenderProject("standalone");
  writeFileSync(join(project, "material-report.md"), "# material\n");
  const before = snapshot(project);
  const manifestBefore = readFileSync(join(project, "artifact-manifest.json"), "utf8");

  projectStatus(project);

  const after = snapshot(project);
  expect(after).toEqual(before);
  expect(readFileSync(join(project, "artifact-manifest.json"), "utf8")).toBe(manifestBefore);
});

test("a current clean render result remains canonical when an old final.mp4 is left on disk", () => {
  const project = trackedCleanRenderProject("standalone");

  const status = projectStatus(project);

  expect(status.manifest_state).toBe("tracked");
  expect(artifact(status, "render-result")?.state).toBe("current");
  expect(artifact(status, "render-output:clean")?.state).toBe("current");
  expect(artifact(status, "render-output:final")?.state).toBe("stale");
  expect(status.canonical_deliverable?.key).toBe("render-output:clean");
  expect(status.canonical_deliverable?.path).toBe("renders/clean.mp4");
  expect(status.canonical_deliverable?.fingerprint).toBe(fileBytesFingerprint(join(project, "renders/clean.mp4")));
});

test("changing canonical output bytes invalidates the render result and removes the deliverable", () => {
  const project = trackedCleanRenderProject("standalone");
  const before = projectStatus(project);
  expect(before.canonical_deliverable?.key).toBe("render-output:clean");

  writeFileSync(join(project, "renders/clean.mp4"), "tampered-clean-output");
  const after = projectStatus(project);

  expect(artifact(after, "render-output:clean")?.state).toBe("invalid");
  expect(artifact(after, "render-output:clean")?.reason_code).toBe("CONTENT_FINGERPRINT_MISMATCH");
  expect(artifact(after, "render-result")?.state).toBe("invalid");
  expect(artifact(after, "render-result")?.reason_code).toBe("RENDER_OUTPUT_NOT_CURRENT");
  expect(after.canonical_deliverable).toBe(undefined);
});

test("manifest dependency-cycle members are deterministically invalid instead of being downgraded to stale", () => {
  const project = trackedCleanRenderProject("standalone");
  const manifestPath = join(project, "artifact-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as ArtifactManifest;
  const projectRecord = manifest.artifacts.project!;
  const sourcesRecord = manifest.artifacts.sources!;
  const sourceRecord = manifest.artifacts["source:src-001"]!;
  projectRecord.inputs = [{ key: sourcesRecord.key, schema_version: sourcesRecord.schema_version, fingerprint: sourcesRecord.fingerprint }];
  sourcesRecord.inputs = [{ key: sourceRecord.key, schema_version: sourceRecord.schema_version, fingerprint: sourceRecord.fingerprint }];
  sourceRecord.inputs = [{ key: projectRecord.key, schema_version: projectRecord.schema_version, fingerprint: projectRecord.fingerprint }];
  writeFileSync(manifestPath, JSON.stringify(manifest));

  const status = projectStatus(project);

  expect(status.manifest_state).toBe("invalid");
  for (const key of ["project", "sources", "source:src-001"]) {
    expect(artifact(status, key)?.state).toBe("invalid");
    expect(artifact(status, key)?.reason_code).toBe("DEPENDENCY_CYCLE");
  }
});

test("standalone and platform projects expose the same status shape and state algorithm", () => {
  const standalone = projectStatus(legacyProject("standalone"));
  const platform = projectStatus(legacyProject("platform"));

  expect(standalone.provider_execution_mode).toBe("standalone");
  expect(platform.provider_execution_mode).toBe("platform");
  expect(standalone.artifacts.map(({ key, role, state }) => ({ key, role, state }))).toEqual(
    platform.artifacts.map(({ key, role, state }) => ({ key, role, state })),
  );
  expect(standalone.stages.map(({ stage, state }) => ({ stage, state }))).toEqual(
    platform.stages.map(({ stage, state }) => ({ stage, state })),
  );
  expect(standalone.next_commands.map(commandShape)).toEqual(platform.next_commands.map(commandShape));
});

function legacyProject(mode: ProviderExecutionMode): string {
  const root = mkdtempSync(join(tmpdir(), `koubo-project-status-${mode}-`));
  const project = join(root, "project");
  mkdirSync(join(project, "source"), { recursive: true });
  mkdirSync(join(project, "renders"), { recursive: true });
  writeFileSync(join(project, "project.json"), JSON.stringify({ provider_execution_mode: mode }));
  writeFileSync(join(project, "source", "001-original.mp4"), "source-bytes");
  writeFileSync(
    join(project, "sources.json"),
    JSON.stringify({
      sources: [
        {
          source_id: "src-001",
          order: 0,
          original_filename: "raw.mp4",
          project_path: "source/001-original.mp4",
          duration_seconds: 10,
        },
      ],
    }),
  );
  return project;
}

function trackedCleanRenderProject(mode: ProviderExecutionMode): string {
  const project = legacyProject(mode);
  const projectValue = { contract_version: "1.0", provider_execution_mode: mode } as const;
  const sourcesValue = {
    sources: [
      {
        source_id: "src-001",
        order: 0,
        original_filename: "raw.mp4",
        project_path: "source/001-original.mp4",
        duration_seconds: 10,
      },
    ],
  };
  writeFileSync(join(project, "project.json"), JSON.stringify(projectValue));
  writeFileSync(join(project, "sources.json"), JSON.stringify(sourcesValue));
  writeFileSync(join(project, "renders", "clean.mp4"), "current-clean-output");
  writeFileSync(join(project, "renders", "final.mp4"), "residual-old-final-output");

  const projectFingerprint = semanticJsonFingerprint(projectValue) as ArtifactFingerprint;
  const sourcesFingerprint = semanticJsonFingerprint(parseSourcesManifest(sourcesValue)) as ArtifactFingerprint;
  const sourceFingerprint = fileBytesFingerprint(join(project, "source", "001-original.mp4")) as ArtifactFingerprint;
  const cleanFingerprint = fileBytesFingerprint(join(project, "renders", "clean.mp4")) as ArtifactFingerprint;
  const inputs: ArtifactFingerprintReference[] = [
    { key: "source:src-001", schema_version: "bytes", fingerprint: sourceFingerprint },
  ];
  const renderResult: RenderResult = {
    contract_version: "1.0",
    input_fingerprint: compositeInputFingerprint(inputs),
    inputs,
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
    completed_at: "2026-07-15T01:00:00.000Z",
  };
  writeFileSync(join(project, "render-result.json"), JSON.stringify(renderResult));
  const renderResultFingerprint = semanticJsonFingerprint(renderResultFingerprintProjection(renderResult)) as ArtifactFingerprint;
  const cleanReference: ArtifactFingerprintReference = {
    key: "render-output:clean",
    schema_version: "bytes",
    fingerprint: cleanFingerprint,
  };

  const manifest: ArtifactManifest = {
    contract_version: "1.0",
    artifacts: {
      project: producedRecord("project", "project.json", "authoritative_input", projectFingerprint),
      sources: producedRecord("sources", "sources.json", "authoritative_input", sourcesFingerprint),
      "source:src-001": producedRecord("source:src-001", "source/001-original.mp4", "authoritative_input", sourceFingerprint),
      "render-output:clean": producedRecord("render-output:clean", "renders/clean.mp4", "execution_result", cleanFingerprint, inputs),
      "render-result": producedRecord("render-result", "render-result.json", "execution_result", renderResultFingerprint, [...inputs, cleanReference]),
    },
    stage_attempts: {},
    updated_at: "2026-07-15T01:00:00.000Z",
  };
  writeFileSync(join(project, "artifact-manifest.json"), JSON.stringify(manifest));
  return project;
}

function producedRecord(
  key: string,
  path: string,
  role: ArtifactRole,
  fingerprint: ArtifactFingerprint,
  inputs: ArtifactFingerprintReference[] = [],
): ArtifactRecord {
  return {
    key,
    path,
    role,
    schema_version: path.endsWith(".mp4") ? "bytes" : "1.0",
    fingerprint,
    ...(path.endsWith(".mp4") ? { file_sha256: fingerprint } : {}),
    authored_by: "cli",
    produced_by_command: key === "render-result" || key.startsWith("render-output:") ? "project.render" : "project.create",
    producer_cli_version: "0.0.1",
    command_contract_version: "1.0",
    inputs,
    produced_at: "2026-07-15T01:00:00.000Z",
  };
}

function compositeInputFingerprint(inputs: readonly ArtifactFingerprintReference[]): ArtifactFingerprint {
  return inputFingerprint(inputs);
}

function artifact(status: ReturnType<typeof projectStatus>, key: string) {
  return status.artifacts.find((item) => item.key === key);
}

function snapshot(root: string): Array<{ path: string; content: string; mtimeMs: number }> {
  const files: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(path);
    }
  };
  visit(root);
  return files.sort().map((path) => ({
    path: relative(root, path),
    content: readFileSync(path, "utf8"),
    mtimeMs: (statSync(path) as unknown as { mtimeMs: number }).mtimeMs,
  }));
}

function commandShape(value: string): string {
  return value.replace(/"[^"]*"/, '"<project>"');
}
