import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

type Json = Record<string, any>;

const tarball = resolve(required(process.argv[2], "npm tarball path"));
const root = mkdtempSync(join(tmpdir(), "koubo-npm-acceptance-"));

try {
  const installRoot = join(root, "install");
  mkdirSync(installRoot, { recursive: true });
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--no-package-lock", "--no-save", "--prefix", installRoot, tarball], root, {
    npm_config_cache: join(root, "npm-cache"),
  });
  const packageRoot = join(installRoot, "node_modules", "koubo-clip");
  const cli = join(packageRoot, "bin", "koubo-clip");
  if (!existsSync(cli)) throw new Error("installed npm package is missing bin/koubo-clip");

  const packageJson = readJson(join(packageRoot, "package.json"));
  const manifest = readJson(join(packageRoot, "delivery-manifest.json"));
  const version = String(packageJson.version);
  expect(runCli(cli, ["--version"], packageRoot).trim() === version, "installed CLI version does not match package.json");

  const delivery = runCliJson(cli, ["delivery", "verify", "--json"], packageRoot).data;
  expect(delivery.schema_version === "2.0", "installed package must use delivery manifest schema 2.0");
  expect(delivery.delivery_digest === manifest.delivery_digest, "delivery verify returned a different aggregate digest");
  expect(delivery.cli_version === version, "delivery CLI version does not match package version");
  expect(delivery.distribution_kind === "npm", "installed package distribution_kind must be npm");
  if (process.env.EXPECTED_SOURCE_REVISION) {
    expect(delivery.source_revision === process.env.EXPECTED_SOURCE_REVISION, "delivery source_revision does not match release commit");
  }

  const bundledSkill = runCliJson(cli, ["skills", "verify", "--json"], packageRoot);
  expect(bundledSkill.ok === true && bundledSkill.digest === manifest.official_skill_digest, "bundled Skill verification failed");
  const skillInstallRoot = join(root, "hermes-skills");
  const installedSkill = runCliJson(cli, ["skills", "install", "--target", "hermes", "--dest", skillInstallRoot], packageRoot);
  expect(installedSkill.ok === true, "official Skill install failed");
  const copiedSkill = runCliJson(cli, ["skills", "verify", "--path", join(skillInstallRoot, "koubo-clip"), "--json"], packageRoot);
  expect(copiedSkill.digest === manifest.official_skill_digest, "installed Hermes Skill digest does not match delivery");

  const catalog = runCliJson(cli, ["project", "element-catalog", packageRoot], packageRoot);
  expect(catalog.ok === true, "installed renderer resource catalog is unreadable");

  requireCommand("ffmpeg");
  requireCommand("ffprobe");
  const source = join(root, "raw.mp4");
  makeVideo(source);
  const project = join(root, "project");
  expect(runCliJson(cli, ["project", "create", source, "--project", project], packageRoot).ok === true, "installed CLI could not create a project");
  writeFileSync(join(project, "transcript.json"), `${JSON.stringify({
    timing_granularity: "segment",
    segments: [{ source_id: "src-001", start: 0.1, end: 1.0, text: "installed package contract caption" }],
  })}\n`);
  expect(runCliJson(cli, ["project", "explore", project, "--asr", "external"], packageRoot).ok === true, "installed CLI explore failed");
  writeFileSync(join(project, "edit-plan.json"), `${JSON.stringify({ decisions: [] })}\n`);
  expect(runCliJson(cli, ["project", "compile-edl", project], packageRoot).ok === true, "installed CLI portable EDL compilation failed");

  const bundle = join(root, "bundle");
  const exported = runCliJson(cli, ["render-contract", "export", project, "--output", bundle], packageRoot);
  expect(exported.ok === true, "installed CLI render contract export failed");
  expect(runCliJson(cli, ["render-contract", "verify", bundle], packageRoot).ok === true, "installed CLI render contract verification failed");
  const contract = readJson(join(bundle, "render-contract.json"));
  expect(contract.payload.runtime.cli_version === version, "render contract CLI version does not match delivery");
  expect(contract.payload.runtime.delivery_digest === manifest.delivery_digest, "render contract complete delivery digest does not match delivery");
  expect(contract.payload.runtime.renderer_resources_digest === manifest.renderer_resources_digest, "render contract renderer digest does not match delivery");
  expect(contract.payload.runtime.runtime_compatibility_digest === manifest.runtime_compatibility_digest, "render contract runtime digest does not match delivery");

  const sourceMap = join(root, "source-map.json");
  const bindings = join(root, "bindings.json");
  writeFileSync(sourceMap, `${JSON.stringify({ "src-001": source })}\n`);
  expect(runCliJson(cli, ["render-contract", "bind", bundle, "--source-map", sourceMap, "--output", bindings], packageRoot).ok === true, "installed CLI source binding failed");
  const runDir = join(root, "run");
  const rendered = runCliJson(cli, ["render-contract", "render", bundle, "--bindings", bindings, "--output", runDir], packageRoot);
  expect(rendered.ok === true, "installed CLI strict render failed");
  const inspected = runCliJson(cli, ["render-contract", "inspect", bundle, "--result", join(runDir, "render-contract-result.json")], packageRoot);
  expect(inspected.ok === true, "installed CLI strict inspect failed");
  const inspection = readJson(join(runDir, "render-contract-inspection.json"));
  expect(inspection.accepted === true, "installed package output did not satisfy contract inspection");

  const acceptance = {
    schema_version: "1.0",
    ok: true,
    package: `koubo-clip@${version}`,
    delivery_digest: manifest.delivery_digest,
    renderer_resources_digest: manifest.renderer_resources_digest,
    official_skill_digest: manifest.official_skill_digest,
    runtime_compatibility_digest: manifest.runtime_compatibility_digest,
    contract_digest: exported.data.contract_digest,
    inspection_accepted: true,
  };
  const acceptancePath = process.env.PACKAGE_ACCEPTANCE_OUTPUT ?? `${tarball}.acceptance.json`;
  writeFileSync(acceptancePath, `${JSON.stringify(acceptance, null, 2)}\n`);
  console.error(JSON.stringify({ ...acceptance, acceptance_path: acceptancePath }));
} finally {
  if (process.env.KEEP_PACKAGE_ACCEPTANCE !== "1") rmSync(root, { recursive: true, force: true });
}

function runCli(cli: string, args: string[], cwd: string): string {
  return run("bun", [cli, ...args], cwd);
}

function runCliJson(cli: string, args: string[], cwd: string): Json {
  const output = runCli(cli, args, cwd).trim();
  const parsed = JSON.parse(output) as Json;
  if (parsed.ok === false) throw new Error(`koubo-clip ${args.join(" ")} failed: ${JSON.stringify(parsed.error)}`);
  return parsed;
}

function run(command: string, args: string[], cwd: string, env: Record<string, string> = {}): string {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.stdout}`.trim());
  return result.stdout;
}

function readJson(path: string): Json {
  return JSON.parse(readFileSync(path, "utf8")) as Json;
}

function makeVideo(path: string): void {
  run("ffmpeg", [
    "-y", "-f", "lavfi", "-i", "testsrc=size=160x90:rate=10",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=1.2",
    "-t", "1.2", "-pix_fmt", "yuv420p", path,
  ], root);
}

function requireCommand(command: string): void {
  const result = spawnSync(command, ["-version"], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${command} is required for installed-package acceptance`);
}

function expect(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function required(value: string | undefined, label: string): string {
  if (!value) throw new Error(`${label} is required`);
  return value;
}
