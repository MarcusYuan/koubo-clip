import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { main } from "./cli";
import { createProject } from "./project";

const packageVersion = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../../package.json"), "utf8")).version;

test("prints help", async () => {
  let output = "";
  const code = await main(["--help"], { stdout: (text) => (output = text) });
  expect(code).toBe(0);
  expect(output).toContain("koubo-clip doctor");
  expect(output).toContain("koubo-clip capabilities --json");
  expect(output).toContain("koubo-clip artifact contract <artifact-id> --json");
  expect(output).toContain("skills path");
  expect(output).toContain("skills install --target codex|claude|hermes");
  expect(output).toContain("project source-frames <project>");
  expect(output).toContain("project proposal");
  expect(output).toContain("project music-catalog");
  expect(output).toContain("project visual-catalog");
  expect(output).toContain("project enrich-plan");
});

test("prints the package version without loading provider environment", async () => {
  const previousCwd = process.cwd();
  const old = process.env.MINIMAX_API_KEY;
  delete process.env.MINIMAX_API_KEY;
  const dir = mkdtempSync(join(tmpdir(), "koubo-version-env-"));
  writeFileSync(join(dir, ".env"), "MINIMAX_API_KEY=must-not-load-for-version\n");
  process.chdir(dir);
  try {
    let output = "";
    const code = await main(["--version"], { stdout: (text) => (output = text) });
    expect(code).toBe(0);
    expect(output).toBe(packageVersion);
    expect(process.env.MINIMAX_API_KEY).toBe(undefined);
  } finally {
    process.chdir(previousCwd);
    if (old === undefined) delete process.env.MINIMAX_API_KEY;
    else process.env.MINIMAX_API_KEY = old;
  }
});

test("capabilities reports stable software contracts without probing or loading secrets", async () => {
  const previousCwd = process.cwd();
  const old = process.env.LORDICON_API_KEY;
  delete process.env.LORDICON_API_KEY;
  const dir = mkdtempSync(join(tmpdir(), "koubo-capabilities-env-"));
  writeFileSync(join(dir, ".env"), "LORDICON_API_KEY=must-not-load-for-capabilities\n");
  process.chdir(dir);
  try {
    let output = "";
    const code = await main(["capabilities", "--json"], { stdout: (text) => (output = text) });
    expect(code).toBe(0);
    expect(process.env.LORDICON_API_KEY).toBe(undefined);
    expect(output.includes("must-not-load-for-capabilities")).toBe(false);
    const json = JSON.parse(output);
    expect(json.contract_version).toBe("1.0");
    expect(json.cli_version).toBe(packageVersion);
    expect(json.project_commands).toContain("status");
    expect(json.features.structured_project_status).toBe(true);
    expect(json.features.render_result).toBe(true);
    expect(json.features.structured_inspection).toBe(true);
    expect(json.provider_modes.standalone.providers).toBe("cli-managed");
    expect(json.provider_modes.platform.providers).toBe("host-managed");
    expect(json.provider_modes.standalone.artifact_contract).toBe("shared");
    expect(json.artifact_schema_versions["artifact-manifest.json"]).toBe("1.0");
    expect(json.error_codes).toContain("ASSET_USAGE_PLAN_CONFLICT");
    expect(json.error_codes).toContain("PROPOSAL_EXECUTION_MISMATCH");
    expect(json.error_codes).toContain("PROPOSAL_SELECTION_MISMATCH");
    expect(json.artifact_schema_versions["production-proposal.json"]).toBe("3.0");
    expect(json.artifact_schema_versions["render-contract.json"]).toBe("2.0");
    expect(json.artifact_schema_versions["bindings.json"]).toBe("2.0");
    expect(json.artifact_schema_versions["render-contract-result.json"]).toBe("2.0");
    expect(json.artifact_schema_versions["render-contract-inspection.json"]).toBe("2.0");
    expect(json.artifact_contracts["production-proposal"].schema_version).toBe("3.0");
    for (const artifactId of ["render-contract", "source-binding", "render-contract-result", "render-contract-inspection"]) {
      expect(json.artifact_contracts[artifactId].schema_version).toBe("2.0");
      expect(json.artifact_contracts[artifactId].external_writes_allowed).toBe(false);
    }
    expect(json.capability_ids).toContain("artifact_contract.discovery.v1");
    expect(json.capability_ids).toContain("caption_layout.safe_area.v1");
    expect(json.render_contract.schema_version).toBe("2.0");
  } finally {
    process.chdir(previousCwd);
    if (old === undefined) delete process.env.LORDICON_API_KEY;
    else process.env.LORDICON_API_KEY = old;
  }
});

test("artifact contract returns the unique current production proposal contract", async () => {
  let output = "";
  const code = await main(["artifact", "contract", "production-proposal", "--json"], { stdout: (text) => (output = text) });
  expect(code).toBe(0);
  const result = JSON.parse(output);
  expect(result.command).toBe("artifact.contract");
  expect(result.data.schema_version).toBe("3.0");
  expect(result.data.schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
  expect(result.data.example.options.length).toBe(2);
  expect(/^sha256:[a-f0-9]{64}$/.test(result.data.schema_digest)).toBe(true);
});

test("artifact contract rejects version selection and unknown artifacts", async () => {
  let error = "";
  expect(await main(["artifact", "contract", "production-proposal", "--version", "1.1", "--json"], { stderr: (text) => (error = text) })).toBe(1);
  expect(JSON.parse(error).error.code).toBe("ARTIFACT_CONTRACT_ARGUMENT_INVALID");
  expect(await main(["artifact", "contract", "missing", "--json"], { stderr: (text) => (error = text) })).toBe(1);
  expect(JSON.parse(error).error.code).toBe("ARTIFACT_CONTRACT_UNSUPPORTED");
});

test("prints project help before requiring a project path", async () => {
  let output = "";
  let error = "";
  const code = await main(["project", "element-catalog", "--help"], { stdout: (text) => (output = text), stderr: (text) => (error = text) });
  expect(code).toBe(0);
  expect(error).toBe("");
  expect(output).toContain("koubo-clip project source-frames <project>");
  expect(output).toContain("koubo-clip project element-catalog <project>");
  expect(output).toContain("koubo-clip project inspect <project>");
});

test("rejects unknown commands", async () => {
  let error = "";
  const code = await main(["wat"], { stderr: (text) => (error = text) });
  expect(code).toBe(1);
  expect(error).toBe("Unknown command: wat");
});

test("doctor prints runtime json", async () => {
  let output = "";
  const code = await main(["doctor"], { stdout: (text) => (output = text) });
  expect(code).toBe(0);
  const json = JSON.parse(output);
  expect(json.runtime).toBe("bun");
  expect(json.provider_mode).toBe("standalone");
  expect(typeof json.npx).toBe("boolean");
  expect(typeof json.providers.minimax_music).toBe("boolean");
  expect(json.providers.iconify).toBe(true);
  expect(typeof json.providers.lordicon).toBe("boolean");
  expect(json.bundle.hyperframes_resources).toBe(true);
  expect(json.bundle.koubo_clip_skill).toBe(true);
  expect(json.bundle.skill_path.endsWith("skills/koubo-clip")).toBe(true);
});

test("doctor --json prints the Box managed CLI envelope on stdout only", async () => {
  let output = "";
  let error = "";
  const code = await main(["doctor", "--json"], { stdout: (text) => (output = text), stderr: (text) => (error = text) });
  expect(code).toBe(0);
  expect(error).toBe("");
  const json = JSON.parse(output);
  expect(json.contract_version).toBe("1");
  expect(json.ok).toBe(true);
  expect(json.result.id).toBe("koubo-clip");
  expect(json.result.version).toBe(packageVersion);
  expect(["healthy", "degraded", "needs_configuration"]).toContain(json.result.status);
});

test("doctor --json failures use one redacted machine envelope and a non-zero exit", async () => {
  let output = "";
  let error = "";
  const code = await main(["doctor", "--provider-mode", "not-a-mode", "--json"], {
    stdout: (text) => (output = text),
    stderr: (text) => (error = text),
  });
  expect(code).toBe(1);
  expect(error).toBe("");
  const json = JSON.parse(output);
  expect(json).toEqual({
    contract_version: "1",
    ok: false,
    error: { code: "DOCTOR_FAILED", message: "Invalid --provider-mode value: not-a-mode", retryable: false },
  });
});

test("Box doctor verifies runtime-lock files and classifies missing versus corruption", async () => {
  const oldKind = process.env.KOUBO_CLIP_DISTRIBUTION_KIND;
  const oldRoot = process.env.KOUBO_CLIP_DISTRIBUTION_ROOT;
  const root = mkdtempSync(join(tmpdir(), "koubo-box-runtime-"));
  process.env.KOUBO_CLIP_DISTRIBUTION_KIND = "box-cli";
  process.env.KOUBO_CLIP_DISTRIBUTION_ROOT = root;
  try {
    let output = "";
    expect(await main(["doctor", "--json"], { stdout: (text) => (output = text) })).toBe(0);
    expect(JSON.parse(output).result.status).toBe("needs_configuration");
    expect(JSON.parse(output).result.issues[0].code).toBe("RUNTIME_LOCK_MISSING");

    mkdirSync(join(root, "runtime", "bin"), { recursive: true });
    const ffmpeg = join(root, "runtime", "bin", "ffmpeg");
    writeFileSync(ffmpeg, "managed-ffmpeg");
    expect(spawnSync("chmod", ["755", ffmpeg]).status).toBe(0);
    writeFileSync(join(root, "runtime-lock.json"), JSON.stringify({ schema_version: "1", files: [lockedFile(root, "runtime/bin/ffmpeg", "ffmpeg", true)] }));
    output = "";
    expect(await main(["doctor", "--json"], { stdout: (text) => (output = text) })).toBe(0);
    expect(JSON.parse(output).result.status).toBe("healthy");

    expect(spawnSync("chmod", ["644", ffmpeg]).status).toBe(0);
    output = "";
    expect(await main(["doctor", "--json"], { stdout: (text) => (output = text) })).toBe(0);
    const permission = JSON.parse(output);
    expect(permission.result.status).toBe("degraded");
    expect(permission.result.issues[0].code).toBe("MANAGED_RUNTIME_PERMISSION_MISMATCH");

    expect(spawnSync("chmod", ["755", ffmpeg]).status).toBe(0);
    writeFileSync(ffmpeg, "tampered");
    output = "";
    expect(await main(["doctor", "--json"], { stdout: (text) => (output = text) })).toBe(0);
    const degraded = JSON.parse(output);
    expect(degraded.result.status).toBe("degraded");
    expect(degraded.result.issues[0].code).toBe("MANAGED_RUNTIME_SIZE_MISMATCH");
  } finally {
    if (oldKind === undefined) delete process.env.KOUBO_CLIP_DISTRIBUTION_KIND;
    else process.env.KOUBO_CLIP_DISTRIBUTION_KIND = oldKind;
    if (oldRoot === undefined) delete process.env.KOUBO_CLIP_DISTRIBUTION_ROOT;
    else process.env.KOUBO_CLIP_DISTRIBUTION_ROOT = oldRoot;
  }
});

test("doctor reports platform provider mode as host managed without secrets", async () => {
  const oldMiniMax = process.env.MINIMAX_API_KEY;
  process.env.MINIMAX_API_KEY = "secret-platform-value";
  try {
    let output = "";
    const code = await main(["doctor", "--provider-mode", "platform"], { stdout: (text) => (output = text) });
    expect(code).toBe(0);
    expect(output.includes("secret-platform-value")).toBe(false);
    const json = JSON.parse(output);
    expect(json.provider_mode).toBe("platform");
    expect(json.providers.minimax_music).toBe("host-managed");
    expect(json.providers.cloudflare_whisper).toBe("host-managed");
    expect(json.providers.music_library_dir).toBe("disabled");
    expect(json.providers.iconify).toBe("host-managed");
  } finally {
    if (oldMiniMax === undefined) delete process.env.MINIMAX_API_KEY;
    else process.env.MINIMAX_API_KEY = oldMiniMax;
  }
});

test("test --json runs a real local render-contract smoke with a stdout envelope", async () => {
  if (spawnSync("ffmpeg", ["-version"]).status !== 0 || spawnSync("ffprobe", ["-version"]).status !== 0) return;
  let output = "";
  let error = "";
  const code = await main(["test", "--json"], { stdout: (text) => (output = text), stderr: (text) => (error = text) });
  expect(code).toBe(0);
  expect(error).toBe("");
  const json = JSON.parse(output);
  expect(json.contract_version).toBe("1");
  expect(json.ok).toBe(true);
  expect(json.result.status).toBe("passed");
  expect(json.result.steps).toContain("render-contract.inspect");
  expect(json.result.output_size_bytes > 0).toBe(true);
}, 240_000);

test("platform doctor does not load provider keys from local env files", async () => {
  const previousCwd = process.cwd();
  const old = process.env.MINIMAX_API_KEY;
  delete process.env.MINIMAX_API_KEY;
  const dir = mkdtempSync(join(tmpdir(), "koubo-platform-env-"));
  writeFileSync(join(dir, ".env"), "MINIMAX_API_KEY=secret-platform-local-value\n");
  process.chdir(dir);
  try {
    let output = "";
    const code = await main(["doctor", "--provider-mode", "platform"], { stdout: (text) => (output = text) });
    expect(code).toBe(0);
    expect(process.env.MINIMAX_API_KEY).toBe(undefined);
    expect(output.includes("secret-platform-local-value")).toBe(false);
    expect(JSON.parse(output).providers.minimax_music).toBe("host-managed");
  } finally {
    process.chdir(previousCwd);
    if (old === undefined) delete process.env.MINIMAX_API_KEY;
    else process.env.MINIMAX_API_KEY = old;
  }
});

test("loads local env without printing secrets", async () => {
  const previousCwd = process.cwd();
  const old = process.env.MINIMAX_API_KEY;
  delete process.env.MINIMAX_API_KEY;
  const dir = mkdtempSync(join(tmpdir(), "koubo-env-"));
  writeFileSync(join(dir, ".env"), "MINIMAX_API_KEY=secret-test-value\n");
  process.chdir(dir);
  try {
    let output = "";
    const code = await main(["doctor"], { stdout: (text) => (output = text) });
    expect(code).toBe(0);
    expect(output.includes("secret-test-value")).toBe(false);
    expect(JSON.parse(output).providers.minimax_music).toBe(true);
  } finally {
    process.chdir(previousCwd);
    if (old === undefined) delete process.env.MINIMAX_API_KEY;
    else process.env.MINIMAX_API_KEY = old;
  }
});

test("platform project metadata prevents provider env loading without a repeated flag", async () => {
  const previousCwd = process.cwd();
  const old = process.env.LORDICON_API_KEY;
  delete process.env.LORDICON_API_KEY;
  const dir = mkdtempSync(join(tmpdir(), "koubo-platform-project-env-"));
  const project = join(dir, "project");
  mkdirSync(project, { recursive: true });
  writeFileSync(join(dir, ".env"), "LORDICON_API_KEY=secret-platform-project-value\n");
  writeFileSync(join(project, "project.json"), JSON.stringify({ contract_version: "1.0", provider_execution_mode: "platform", created_at: "2026-01-01T00:00:00.000Z" }));
  process.chdir(dir);
  try {
    let output = "";
    const code = await main(["project", "element-catalog", project], { stdout: (text) => (output = text) });
    expect(code).toBe(0);
    expect(process.env.LORDICON_API_KEY).toBe(undefined);
    expect(output.includes("secret-platform-project-value")).toBe(false);
    expect(JSON.parse(output).ok).toBe(true);
  } finally {
    process.chdir(previousCwd);
    if (old === undefined) delete process.env.LORDICON_API_KEY;
    else process.env.LORDICON_API_KEY = old;
  }
});

test("loads user koubo env as fallback", async () => {
  const oldHome = process.env.HOME;
  const oldKey = process.env.LORDICON_API_KEY;
  delete process.env.LORDICON_API_KEY;
  const dir = mkdtempSync(join(tmpdir(), "koubo-home-"));
  process.env.HOME = dir;
  mkdirSync(join(dir, ".koubo-clip"), { recursive: true });
  writeFileSync(join(dir, ".koubo-clip", ".env"), "LORDICON_API_KEY=secret-lordicon-value\n");
  try {
    let output = "";
    const code = await main(["doctor"], { stdout: (text) => (output = text) });
    expect(code).toBe(0);
    expect(output.includes("secret-lordicon-value")).toBe(false);
    expect(JSON.parse(output).providers.lordicon).toBe(true);
  } finally {
    if (oldHome === undefined) delete process.env.HOME;
    else process.env.HOME = oldHome;
    if (oldKey === undefined) delete process.env.LORDICON_API_KEY;
    else process.env.LORDICON_API_KEY = oldKey;
  }
});

test("skills path reports the bundled skill", async () => {
  let output = "";
  const code = await main(["skills", "path", "--json"], { stdout: (text) => (output = text) });
  expect(code).toBe(0);
  const json = JSON.parse(output);
  expect(json.ok).toBe(true);
  expect(json.skill).toBe("koubo-clip");
  expect(json.exists).toBe(true);
  expect(readFileSync(join(json.path, "SKILL.md"), "utf8")).toContain("koubo-clip");
});

test("skills install copies the bundled skill and protects existing installs", async () => {
  const dir = mkdtempSync(join(tmpdir(), "koubo-skills-"));
  let output = "";
  const installed = await main(["skills", "install", "--target", "codex", "--dest", dir], { stdout: (text) => (output = text) });
  expect(installed).toBe(0);
  const target = JSON.parse(output).installed_path;
  expect(existsSync(join(target, "SKILL.md"))).toBe(true);
  expect(existsSync(join(target, "references", "workflow.md"))).toBe(true);

  let error = "";
  const duplicate = await main(["skills", "install", "--target", "codex", "--dest", dir], { stderr: (text) => (error = text) });
  expect(duplicate).toBe(1);
  expect(JSON.parse(error).error.code).toBe("SKILL_EXISTS");

  const forced = await main(["skills", "install", "--target", "codex", "--dest", dir, "--force"], { stdout: (text) => (output = text) });
  expect(forced).toBe(0);
  expect(existsSync(join(JSON.parse(output).installed_path, "references", "storyboard-qa.md"))).toBe(true);

  output = "";
  const claudeDir = mkdtempSync(join(tmpdir(), "koubo-claude-skills-"));
  const claude = await main(["skills", "install", "--target", "claude", "--dest", claudeDir], { stdout: (text) => (output = text) });
  expect(claude).toBe(0);
  expect(JSON.parse(output).target).toBe("claude");
  expect(existsSync(join(claudeDir, "koubo-clip", "SKILL.md"))).toBe(true);

  output = "";
  const hermesDir = mkdtempSync(join(tmpdir(), "koubo-hermes-skills-"));
  const hermes = await main(["skills", "install", "--target", "hermes", "--dest", hermesDir], { stdout: (text) => (output = text) });
  expect(hermes).toBe(0);
  expect(JSON.parse(output).target).toBe("hermes");
  expect(existsSync(join(hermesDir, "koubo-clip", "SKILL.md"))).toBe(true);
});

test("codex skills install defaults to the shared agent skills directory", async () => {
  const oldHome = process.env.HOME;
  const dir = mkdtempSync(join(tmpdir(), "koubo-codex-home-"));
  process.env.HOME = dir;
  try {
    let output = "";
    const code = await main(["skills", "install", "--target", "codex"], { stdout: (text) => (output = text) });
    expect(code).toBe(0);
    const json = JSON.parse(output);
    expect(json.installed_path).toBe(join(dir, ".agents", "skills", "koubo-clip"));
    expect(existsSync(join(dir, ".agents", "skills", "koubo-clip", "SKILL.md"))).toBe(true);
  } finally {
    if (oldHome === undefined) delete process.env.HOME;
    else process.env.HOME = oldHome;
  }
});

test("project command errors stay json", async () => {
  let error = "";
  const code = await main(["project", "explore", "demo", "--asr", "wat"], { stderr: (text) => (error = text) });
  expect(code).toBe(1);
  expect(JSON.parse(error).error.code).toBe("PROJECT_COMMAND_FAILED");
});

test("project status is routed as a read-only public command", async () => {
  const dir = mkdtempSync(join(tmpdir(), "koubo-cli-status-"));
  const source = join(dir, "source.mp4");
  const project = join(dir, "project");
  makeSourceFrameVideo(source);
  const created = createProject([source], { projectPath: project, providerMode: "platform" });
  if (!created.ok) throw new Error(created.error.message);
  const manifestPath = join(project, "artifact-manifest.json");
  const before = readFileSync(manifestPath, "utf8");
  let output = "";
  const code = await main(["project", "status", project, "--json"], { stdout: (text) => (output = text) });
  expect(code).toBe(0);
  const json = JSON.parse(output);
  expect(json.command).toBe("project.status");
  expect(json.data.manifest_state).toBe("tracked");
  expect(json.data.provider_execution_mode).toBe("platform");
  expect(readFileSync(manifestPath, "utf8")).toBe(before);
});

test("project status failure envelope preserves the status command and remediation", async () => {
  const project = join(mkdtempSync(join(tmpdir(), "koubo-cli-status-invalid-")), "project");
  mkdirSync(project);
  writeFileSync(join(project, "project.json"), "{");

  let error = "";
  const code = await main(["project", "status", project, "--json"], { stderr: (text) => (error = text) });

  expect(code).toBe(1);
  expect(error.includes(project)).toBe(false);
  const json = JSON.parse(error);
  expect(json.command).toBe("project.status");
  expect(json.error.code).toBe("PROJECT_METADATA_INVALID");
  expect(json.error.artifact).toBe("project.json");
  expect(typeof json.error.remediation === "string" && json.error.remediation.length > 0).toBe(true);
});

test("project create rejects occupied detached targets without writing", async () => {
  const cases: Array<{ name: string; seed: (target: string) => void }> = [
    { name: "empty", seed: (target) => mkdirSync(target) },
    { name: "unrelated", seed: (target) => { mkdirSync(target); writeFileSync(join(target, "notes.txt"), "not a koubo project"); } },
    { name: "missing-project-json", seed: (target) => { mkdirSync(target); writeFileSync(join(target, "sources.json"), "{}"); } },
  ];

  for (const item of cases) {
    const dir = mkdtempSync(join(tmpdir(), `koubo-cli-occupied-${item.name}-`));
    const sourceManifest = join(dir, "sources.json");
    const target = join(dir, "target");
    writeFileSync(sourceManifest, "{}");
    item.seed(target);
    const before = entries(target);

    let error = "";
    const code = await main(["project", "create", "--source-manifest", sourceManifest, "--project", target, "--provider-mode", "platform", "--json"], { stderr: (text) => (error = text) });

    expect(code).toBe(1);
    expect(JSON.parse(error).error.code).toBe("PROJECT_TARGET_OCCUPIED");
    expect(entries(target)).toEqual(before);
  }
});

test("source-frames reports a portable missing request error", async () => {
  const project = join(mkdtempSync(join(tmpdir(), "koubo-cli-source-frames-missing-")), "project");
  mkdirSync(project);
  let error = "";
  const code = await main(["project", "source-frames", project, "--json"], { stderr: (text) => (error = text) });
  expect(code).toBe(1);
  const json = JSON.parse(error);
  expect(json.command).toBe("project.source-frames");
  expect(json.error.code).toBe("SOURCE_FRAME_REQUEST_MISSING");
  expect(json.error.message.includes(project)).toBe(false);
});

test("source-frames prints the stable success json shape", async () => {
  const dir = mkdtempSync(join(tmpdir(), "koubo-cli-source-frames-"));
  const source = join(dir, "source.mp4");
  const project = join(dir, "project");
  makeSourceFrameVideo(source);
  const created = createProject([source], { projectPath: project });
  if (!created.ok) throw new Error(created.error.message);
  writeFileSync(
    join(project, "source-frame-request.json"),
    JSON.stringify({
      version: "1.0",
      frames: [{ id: "source-frame-001", source_id: "src-001", time_seconds: 0.25, transcript_quote: "demo frame", reason: "verify CLI output" }],
    }),
  );

  let output = "";
  const code = await main(["project", "source-frames", project, "--json"], { stdout: (text) => (output = text) });
  expect(code).toBe(0);
  const json = JSON.parse(output);
  expect(json.command).toBe("project.source-frames");
  expect(json.data.project_path).toBe(project);
  expect(json.data.source_frame_request_path).toBe("source-frame-request.json");
  expect(json.data.source_frames_path).toBe("source-frames.json");
  expect(json.data.frame_count).toBe(1);
  expect(json.data.total_size_bytes > 0).toBe(true);
  expect(json.data.warnings).toEqual([]);
});

function makeSourceFrameVideo(path: string): void {
  const result = spawnSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "testsrc=size=160x90:rate=10", "-t", "1", "-pix_fmt", "yuv420p", "-c:v", "libx264", "-preset", "ultrafast", path], {
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
}

function lockedFile(root: string, path: string, role: string, executable = false) {
  const bytes = readFileSync(join(root, ...path.split("/")));
  return {
    path,
    role,
    size: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    ...(executable ? { executable: true } : {}),
  };
}

function entries(path: string): string[] {
  return readdirSync(path).sort().map((name) => `${name}:${readFileSync(join(path, name), "utf8")}`);
}
