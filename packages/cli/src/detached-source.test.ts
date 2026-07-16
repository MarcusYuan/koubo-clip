import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { compileEdlProject, createProject, exploreProject, sourceFramesProject } from "./project";
import { projectStatus } from "./project-status";
import { exportRenderContract } from "./render-contract-commands";
import { confirmProposalAndWriteEditPlan } from "./test-fixtures";

test("detached project plans, imports source evidence, and exports without source bytes", async () => {
  if (spawnSync("ffmpeg", ["-version"]).status !== 0) return;
  const root = mkdtempSync(join(tmpdir(), "koubo-detached-"));
  const source = join(root, "raw.mp4");
  makeVideo(source);
  const identityProject = join(root, "identity-project");
  expect(createProject([source], { projectPath: identityProject }).ok).toBe(true);
  expect(projectStatus(identityProject).render_contract?.execution_mode).toBe("local");
  expect(projectStatus(identityProject).stages.find((stage) => stage.stage === "render")?.state === "not_applicable").toBe(false);

  const detached = join(root, "detached-project");
  const created = createProject([], { projectPath: detached, sourceManifestPath: join(identityProject, "sources.json"), providerMode: "platform" });
  expect(created.ok).toBe(true);
  expect(existsSync(join(detached, "source"))).toBe(false);
  expect(existsSync(join(detached, "source-materialization.json"))).toBe(false);
  writeFileSync(join(detached, "transcript.json"), JSON.stringify({
    timing_granularity: "segment",
    segments: [{ source_id: "src-001", start: 0.1, end: 0.9, text: "detached planning" }],
  }));
  expect((await exploreProject(detached, { asr: "external", providerMode: "platform" })).ok).toBe(true);
  confirmProposalAndWriteEditPlan(detached);
  expect(compileEdlProject(detached).ok).toBe(true);

  const detachedStatus = projectStatus(detached);
  expect(detachedStatus.artifacts.some((artifact) => artifact.path.startsWith(".virtual/"))).toBe(false);
  expect(Object.keys(detachedStatus.fingerprints).some((key) => key.startsWith("proposal-selection:"))).toBe(true);
  expect(detachedStatus.sources).toEqual([{ source_id: "src-001", identity: "available", materialization: "unbound" }]);
  expect(detachedStatus.render_contract?.ready).toBe(true);
  expect(detachedStatus.render_contract?.export_ready).toBe(true);
  expect(detachedStatus.render_contract?.exported).toBe(false);
  expect(detachedStatus.render_contract?.execution_mode).toBe("distributed");
  expect(detachedStatus.render_contract?.handoff_ready).toBe(false);
  expect(detachedStatus.stages.find((stage) => stage.stage === "render")?.state).toBe("not_applicable");
  expect(detachedStatus.stages.find((stage) => stage.stage === "inspect")?.state).toBe("not_applicable");
  expect(detachedStatus.stages.find((stage) => stage.stage === "contract-export")?.state === "blocked").toBe(false);
  expect(detachedStatus.next_commands[0]).toContain("render-contract export");

  writeFileSync(join(detached, "source-frame-request.json"), JSON.stringify({ version: "1.0", frames: [{ id: "proof", source_id: "src-001", time_seconds: 0.4, transcript_quote: "detached", reason: "external evidence" }] }));
  const evidence = join(root, "source-evidence");
  mkdirSync(evidence, { recursive: true });
  const jpeg = join(evidence, "proof.jpg");
  const frame = spawnSync("ffmpeg", ["-y", "-ss", "0.4", "-i", source, "-frames:v", "1", jpeg], { encoding: "utf8" });
  if (frame.status !== 0) throw new Error(frame.stderr || frame.stdout);
  const bytes = readFileSync(jpeg);
  writeFileSync(join(evidence, "manifest.json"), JSON.stringify({ version: "1.0", entries: [{
    id: "proof",
    relative_path: "proof.jpg",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    size_bytes: statSync(jpeg).size,
    width: 160,
    height: 90,
    source_id: "src-001",
    source_time_seconds: 0.4,
    request_id: "proof",
  }] }));
  const imported = sourceFramesProject(detached, { providerMode: "platform", importPath: evidence });
  expect(imported.ok).toBe(true);

  const bundle = join(root, "bundle");
  const exported = exportRenderContract(detached, bundle);
  if (!exported.ok) throw new Error(`${exported.error.code}: ${exported.error.message}`);
  expect(existsSync(join(bundle, "render-contract.json"))).toBe(true);
  const second = exportRenderContract(detached, join(root, "bundle-2"));
  if (!second.ok) throw new Error(`${second.error.code}: ${second.error.message}`);
  if (exported.ok && second.ok) expect(second.data.contract_digest).toBe(exported.data.contract_digest);
  const exportedStatus = projectStatus(detached);
  expect(exportedStatus.render_contract?.current_contract_digest).toBe(exported.ok ? exported.data.contract_digest : undefined);
  expect(exportedStatus.render_contract?.exported).toBe(true);
  expect(exportedStatus.render_contract?.handoff_ready).toBe(true);
  expect(exportedStatus.next_commands).toEqual([
    "koubo-clip render-contract verify <bundle-dir>",
    "koubo-clip render-contract bind <bundle-dir> --source-map <source-map.json> --output <bindings.json>",
    "koubo-clip render-contract render <bundle-dir> --bindings <bindings.json> --output <run-dir>",
    "koubo-clip render-contract inspect <bundle-dir> --result <run-dir>/render-contract-result.json",
  ]);
});

function makeVideo(path: string): void {
  const result = spawnSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "testsrc=size=160x90:rate=10", "-f", "lavfi", "-i", "sine=frequency=440:duration=1.2", "-t", "1.2", "-pix_fmt", "yuv420p", path], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
}
