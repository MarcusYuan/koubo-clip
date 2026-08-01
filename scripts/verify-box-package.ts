import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import * as nodeFs from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";

type Json = Record<string, any>;

const root = resolve(dirname(new URL(import.meta.url).pathname), "..");
const packageJson = readJson(join(root, "package.json"));
const version = String(packageJson.version);
const boxDist = join(root, "dist", "box");
const cliTarball = resolve(process.argv[2] ?? join(boxDist, `koubo-clip-box-cli-${version}-darwin-arm64.tgz`));
const skillTarball = resolve(process.argv[3] ?? join(boxDist, `koubo-clip-box-skill-${version}.tgz`));
const tmp = nodeFs.mkdtempSync(join(tmpdir(), "koubo-box-acceptance-"));

try {
  const cliDescriptor = readJson(join(dirname(cliTarball), "cli-package.box.json"));
  const skillDescriptor = readJson(join(dirname(skillTarball), "skill.box.json"));
  expectArtifact(cliDescriptor.artifacts?.[0], cliTarball, "Box CLI descriptor artifact");
  expectArtifact(skillDescriptor.artifacts?.[0], skillTarball, "Box Skill descriptor artifact");

  const unpackRoot = join(tmp, "unpack");
  nodeFs.mkdirSync(unpackRoot, { recursive: true });
  run("tar", ["-xzf", cliTarball, "-C", unpackRoot], root);
  run("tar", ["-xzf", skillTarball, "-C", unpackRoot], root);
  const cliRoot = singleDir(unpackRoot, `koubo-clip-box-cli-${version}-`);
  const skillRoot = singleDir(unpackRoot, `koubo-clip-box-skill-${version}`);
  const cli = join(cliRoot, "bin", "koubo-clip");
  const arbitraryCwd = join(tmp, "arbitrary-cwd");
  nodeFs.mkdirSync(arbitraryCwd, { recursive: true });

  expect(!nodeFs.existsSync(join(cliRoot, "skills", "koubo-clip")), "Box CLI package contains the Skill payload");
  expect(nodeFs.existsSync(cli), "Box CLI package is missing bin/koubo-clip");
  expect(nodeFs.existsSync(join(cliRoot, "runtime", "bin", "bun")), "Box CLI package is missing managed Bun");
  expect(nodeFs.existsSync(join(cliRoot, "runtime", "bin", "ffmpeg")), "Box CLI package is missing managed ffmpeg");
  expect(nodeFs.existsSync(join(cliRoot, "runtime", "bin", "ffprobe")), "Box CLI package is missing managed ffprobe");
  expect(nodeFs.existsSync(join(cliRoot, "runtime", "bin", "hyperframes")), "Box CLI package is missing managed HyperFrames launcher");
  expect(nodeFs.existsSync(join(cliRoot, "resources", "hyperframes", "registry")), "Box CLI package is missing HyperFrames registry resources");
  expect(nodeFs.existsSync(join(cliRoot, "runtime", "browser", "chrome-headless-shell", "mac_arm-131.0.6778.85", "chrome-headless-shell-mac-arm64", "chrome-headless-shell")), "Box CLI package is missing managed Chrome Headless Shell");
  for (const notice of ["LICENSE", "ffmpeg.README", "README.md"]) {
    expect(nodeFs.existsSync(join(cliRoot, "licenses", "ffmpeg-ffprobe-static", notice)), `Box CLI package is missing ffmpeg notice ${notice}`);
  }

  verifyRuntimeLock(cliRoot);
  verifyNoBareManagedToolSpawns();
  verifySkillDescriptor(skillRoot, skillDescriptor);
  verifyLinkedIdentity(cliDescriptor, skillDescriptor);

  const versionOutput = runCli(cli, ["--version"], arbitraryCwd).stdout.trim();
  expect(versionOutput === version, `Box CLI --version mismatch: ${versionOutput}`);
  const delivery = runCliJson(cli, ["delivery", "verify", "--json"], arbitraryCwd, {
    KOUBO_CLIP_SKILL_ROOT: join(skillRoot, "skills", "koubo-clip"),
  });
  expect(delivery.status === 0, `delivery verify --json failed: ${delivery.stderr || delivery.stdout}`);
  expect(delivery.json.ok === true && delivery.json.data?.distribution_kind === "box-cli", "delivery verify did not accept the split Box CLI/Skill identity");
  expect(delivery.json.data?.capability_ids?.includes("external_asr.handoff.v1"), "delivery manifest is missing external_asr.handoff.v1");
  expect(delivery.json.data?.capability_ids?.includes("box_managed_cli.v1"), "delivery manifest is missing box_managed_cli.v1");
  const doctor = runCliJson(cli, ["doctor", "--json"], arbitraryCwd);
  expect(doctor.status === 0, `doctor --json failed: ${doctor.stderr || doctor.stdout}`);
  expect(doctor.json.contract_version === "1", "doctor --json is missing contract_version 1");
  expect(doctor.json.ok === true, "doctor --json did not report ok=true");
  expect(doctor.json.result?.id === "koubo-clip", "doctor result id mismatch");
  expect(doctor.json.result?.version === version, "doctor result version mismatch");
  expect(["healthy", "degraded", "needs_configuration"].includes(doctor.json.result?.status), "doctor status is outside the Box contract");

  const smoke = runCliJson(cli, ["test", "--json"], arbitraryCwd);
  expect(smoke.status === 0, `test --json failed: ${smoke.stderr || smoke.stdout}`);
  expect(smoke.json.contract_version === "1", "test --json is missing contract_version 1");
  expect(smoke.json.ok === true, "test --json did not report ok=true");
  expect(smoke.json.result?.status === "passed", "test --json result.status must be passed");
  verifyNoHostFallbackForRenderAndAsr(cliRoot, cli, arbitraryCwd);
  verifyDoctorTamperClassifications(cliRoot, cli, arbitraryCwd);

  const acceptance = {
    schema_version: "1",
    ok: true,
    version,
    cli_package: artifactIdentity(cliTarball),
    skill_package: artifactIdentity(skillTarball),
    cli_root: cliRoot,
    skill_root: skillRoot,
    doctor_status: doctor.json.result.status,
    test_status: smoke.json.result.status,
  };
  const outputPath = process.env.BOX_PACKAGE_ACCEPTANCE_OUTPUT ?? `${cliTarball}.acceptance.json`;
  writeJson(outputPath, acceptance);
  console.error(JSON.stringify({ ...acceptance, acceptance_path: outputPath }));
} finally {
  if (process.env.KEEP_BOX_PACKAGE_ACCEPTANCE !== "1") nodeFs.rmSync(tmp, { recursive: true, force: true });
}

function verifyRuntimeLock(cliRoot: string): void {
  const lockPath = join(cliRoot, "runtime-lock.json");
  const lock = readJson(lockPath);
  expect(lock.schema_version === "1", "installed runtime-lock schema_version must be 1");
  expect(lock.target?.os === "darwin" && lock.target?.arch === "arm64", "installed runtime-lock target mismatch");
  expect(Array.isArray(lock.files) && lock.files.length > 0, "installed runtime-lock has no files");
  const locked = new Map<string, Json>();
  for (const entry of lock.files) {
    expect(typeof entry.path === "string" && typeof entry.size === "number" && /^[a-f0-9]{64}$/.test(entry.sha256) && typeof entry.role === "string", "runtime-lock file entry is incomplete");
    locked.set(entry.path, entry);
    const fullPath = join(cliRoot, entry.path);
    expect(nodeFs.existsSync(fullPath), `runtime-lock file is missing: ${entry.path}`);
    expect(nodeFs.statSync(fullPath).size === entry.size, `runtime-lock size mismatch: ${entry.path}`);
    expect(sha256File(fullPath) === entry.sha256, `runtime-lock hash mismatch: ${entry.path}`);
  }
  for (const required of ["bin/koubo-clip", "bin/koubo-clip-runtime", "runtime/bin/bun", "runtime/bin/ffmpeg", "runtime/bin/ffprobe", "runtime/bin/hyperframes", "runtime/bin/chrome-headless-shell", "runtime/hyperframes.js"]) {
    expect(locked.has(required), `runtime-lock does not list ${required}`);
  }
  for (const required of ["licenses/ffmpeg-ffprobe-static/LICENSE", "licenses/ffmpeg-ffprobe-static/ffmpeg.README", "licenses/ffmpeg-ffprobe-static/README.md"]) {
    expect(locked.has(required), `runtime-lock does not list ${required}`);
  }
}

function verifyNoBareManagedToolSpawns(): void {
  const sourceRoot = join(root, "packages", "cli", "src");
  for (const path of walkFiles(sourceRoot)) {
    if (!path.endsWith(".ts") || path.endsWith(".test.ts")) continue;
    const source = nodeFs.readFileSync(path, "utf8");
    expect(!/spawnSync\(\s*["']ff(?:mpeg|probe)["']/.test(source), `Box-stable CLI source bypasses resolveManagedRuntimeTool: ${relative(root, path)}`);
  }
}

function verifyDoctorTamperClassifications(cliRoot: string, cli: string, cwd: string): void {
  const ffprobe = join(cliRoot, "runtime", "bin", "ffprobe");
  const hyperframes = join(cliRoot, "runtime", "bin", "hyperframes");
  const ffprobeBackup = `${ffprobe}.bak`;
  rename(ffprobe, ffprobeBackup);
  try {
    const missing = runCliJson(cli, ["doctor", "--json"], cwd);
    expect(missing.status === 0 && missing.json.ok === true, "doctor should return an ok envelope for missing managed runtime files");
    expect(missing.json.result?.status === "needs_configuration", "missing managed runtime file should classify as needs_configuration");
    expect(missing.json.result?.issues?.some((issue: Json) => issue.code === "MANAGED_RUNTIME_FILE_MISSING"), "missing managed runtime issue code not reported");
  } finally {
    rename(ffprobeBackup, ffprobe);
  }

  const original = nodeFs.readFileSync(hyperframes);
  appendFile(hyperframes, "\n# tamper\n");
  try {
    const tampered = runCliJson(cli, ["doctor", "--json"], cwd);
    expect(tampered.status === 0 && tampered.json.ok === true, "doctor should return an ok envelope for digest corruption");
    expect(tampered.json.result?.status === "degraded", "digest corruption should classify as degraded");
    expect(tampered.json.result?.issues?.some((issue: Json) => issue.code === "MANAGED_RUNTIME_SIZE_MISMATCH" || issue.code === "MANAGED_RUNTIME_DIGEST_MISMATCH"), "digest corruption issue code not reported");
  } finally {
    nodeFs.writeFileSync(hyperframes, original);
    chmod(hyperframes, 0o755);
  }

  chmod(hyperframes, 0o644);
  try {
    const permission = runCliJson(cli, ["doctor", "--json"], cwd);
    expect(permission.status === 0 && permission.json.ok === true, "doctor should return an ok envelope for permission corruption");
    expect(permission.json.result?.status === "degraded", "permission corruption should classify as degraded");
    expect(permission.json.result?.issues?.some((issue: Json) => issue.code === "MANAGED_RUNTIME_PERMISSION_MISMATCH"), "permission corruption issue code not reported");
  } finally {
    chmod(hyperframes, 0o755);
  }
}

function verifyNoHostFallbackForRenderAndAsr(cliRoot: string, cli: string, cwd: string): void {
  expect(spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0, "host ffmpeg must exist to prove Box does not fall back to PATH");
  const source = join(cwd, "asr-source.mp4");
  const project = join(cwd, "asr-project");
  makeVideo(source);
  const created = runCliJson(cli, ["project", "create", source, "--project", project, "--json"], cwd);
  expect(created.status === 0 && created.json.ok === true, "failed to create Box fallback-test project while runtime was healthy");

  const ffmpeg = join(cliRoot, "runtime", "bin", "ffmpeg");
  const backup = `${ffmpeg}.bak`;
  rename(ffmpeg, backup);
  try {
    const renderSmoke = runCliJson(cli, ["test", "--json"], cwd);
    expect(renderSmoke.status !== 0 && renderSmoke.json.ok === false, "Box render smoke unexpectedly succeeded after managed ffmpeg was removed");
    expect(renderSmoke.json.error?.code === "MANAGED_RUNTIME_FILE_MISSING", "Box render smoke did not fail at the managed runtime guard after ffmpeg removal");

    const asrPrepare = runCliJsonResult(cli, ["project", "asr-prepare", project, "--output", "asr-upload", "--json"], cwd);
    expect(asrPrepare.status !== 0 && asrPrepare.json.ok === false, "Box external ASR prepare unexpectedly succeeded after managed ffmpeg was removed");
    expect(asrPrepare.json.error?.code === "MANAGED_RUNTIME_FILE_MISSING", "Box external ASR prepare did not fail at the managed runtime guard after ffmpeg removal");
  } finally {
    rename(backup, ffmpeg);
  }

  const original = nodeFs.readFileSync(ffmpeg);
  appendFile(ffmpeg, "\n# digest tamper\n");
  try {
    const asrPrepare = runCliJsonResult(cli, ["project", "asr-prepare", project, "--output", "asr-upload-tampered", "--json"], cwd);
    expect(asrPrepare.status !== 0 && asrPrepare.json.ok === false, "Box external ASR prepare unexpectedly succeeded after managed ffmpeg was tampered");
    expect(
      asrPrepare.json.error?.code === "MANAGED_RUNTIME_SIZE_MISMATCH" || asrPrepare.json.error?.code === "MANAGED_RUNTIME_DIGEST_MISMATCH",
      "Box external ASR prepare did not fail at the managed runtime guard after ffmpeg tamper",
    );
  } finally {
    nodeFs.writeFileSync(ffmpeg, original);
    chmod(ffmpeg, 0o755);
  }
}

function makeVideo(path: string): void {
  const result = spawnSync("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc=size=160x90:rate=10",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=1",
    "-t",
    "1",
    "-pix_fmt",
    "yuv420p",
    "-c:v",
    "libx264",
    "-c:a",
    "aac",
    "-preset",
    "ultrafast",
    path,
  ], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
}

function verifySkillDescriptor(skillPackageRoot: string, descriptor: Json): void {
  const payloadRoot = join(skillPackageRoot, "skills", "koubo-clip");
  expect(nodeFs.existsSync(join(payloadRoot, "SKILL.md")), "Box Skill package is missing SKILL.md");
  const expected = new Map<string, Json>();
  for (const entry of descriptor.payload?.files ?? []) expected.set(entry.path, entry);
  const actual = listFileEntries(payloadRoot);
  expect(expected.size === actual.length, "skill.box.json file count does not match payload");
  for (const entry of actual) {
    const descriptorEntry = expected.get(entry.path);
    expect(Boolean(descriptorEntry), `skill.box.json does not list ${entry.path}`);
    expect(descriptorEntry!.size === entry.size, `skill.box.json size mismatch for ${entry.path}`);
    expect(descriptorEntry!.sha256 === entry.sha256, `skill.box.json sha256 mismatch for ${entry.path}`);
  }
  const dependency = descriptor.cli_dependencies?.[0];
  expect(dependency?.id === "koubo-clip" && dependency.version === version, "Box Skill must depend on koubo-clip 0.0.17");
  for (const command of ["koubo-clip doctor --json", "koubo-clip test --json", "koubo-clip render-contract render"]) {
    expect(dependency.commands.includes(command), `Box Skill dependency is missing ${command}`);
  }
}

function verifyLinkedIdentity(cliDescriptor: Json, skillDescriptor: Json): void {
  const cliSha = cliDescriptor.artifacts?.[0]?.sha256;
  expect(skillDescriptor.delivery_identity?.cli_artifact_sha256 === cliSha, "Box Skill descriptor is not linked to the CLI artifact sha256");
  expect(skillDescriptor.delivery_identity?.delivery_digest === cliDescriptor.runtime?.delivery_digest, "Box Skill descriptor delivery digest does not match the CLI descriptor");
  expect(skillDescriptor.delivery_identity?.official_skill_digest === cliDescriptor.runtime?.official_skill_digest, "Box descriptors disagree on official Skill digest");
}

function runCliJson(command: string, args: string[], cwd: string, env: Record<string, string> = {}): { status: number; stdout: string; stderr: string; json: Json } {
  const result = runCli(command, args, cwd, env);
  const stdout = result.stdout.trim();
  expect(stdout.length > 0, `${args.join(" ")} produced no stdout JSON`);
  expect(stdout.split(/\r?\n/).filter(Boolean).length === 1, `${args.join(" ")} wrote more than one stdout line in JSON mode`);
  let parsed: Json;
  try {
    parsed = JSON.parse(stdout) as Json;
  } catch (error) {
    throw new Error(`${args.join(" ")} did not write valid JSON to stdout: ${stdout.slice(0, 300)}`);
  }
  return { ...result, json: parsed };
}

function runCliJsonResult(command: string, args: string[], cwd: string, env: Record<string, string> = {}): { status: number; stdout: string; stderr: string; json: Json } {
  const result = runCli(command, args, cwd, env);
  const output = (result.stdout || result.stderr).trim();
  expect(output.length > 0, `${args.join(" ")} produced no JSON output`);
  return { ...result, json: JSON.parse(output) as Json };
}

function runCli(command: string, args: string[], cwd: string, env: Record<string, string> = {}): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(command, args, {
    cwd,
    env: {
      ...process.env,
      ...env,
      KOUBO_CLIP_DISTRIBUTION_KIND: "box-cli",
      KOUBO_CLIP_DISTRIBUTION_ROOT: dirname(dirname(command)),
    },
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return { status: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
}

function expectArtifact(entry: Json | undefined, path: string, label: string): void {
  expect(Boolean(entry), `${label} is missing`);
  const actual = artifactIdentity(path);
  expect(entry!.size === actual.size, `${label} size mismatch`);
  expect(entry!.sha256 === actual.sha256, `${label} sha256 mismatch`);
}

function singleDir(parent: string, prefix: string): string {
  const matches = nodeFs.readdirSync(parent).filter((name) => name.startsWith(prefix)).map((name) => join(parent, name));
  expect(matches.length === 1, `expected one ${prefix} directory, found ${matches.length}`);
  return matches[0]!;
}

function listFileEntries(dir: string): Array<{ path: string; size: number; sha256: string }> {
  return walkFiles(dir).map((path) => ({
    path: relative(dir, path).replaceAll("\\", "/"),
    size: nodeFs.statSync(path).size,
    sha256: `sha256:${sha256File(path)}`,
  })).sort((left, right) => left.path.localeCompare(right.path));
}

function walkFiles(dir: string): string[] {
  const output: string[] = [];
  for (const name of nodeFs.readdirSync(dir).sort()) {
    const path = join(dir, name);
    const stat = (nodeFs as any).lstatSync(path) as { isSymbolicLink(): boolean; isDirectory(): boolean; isFile(): boolean };
    if (stat.isSymbolicLink()) throw new Error(`Box package contains a symlink: ${path}`);
    if (stat.isDirectory()) output.push(...walkFiles(path));
    else if (stat.isFile()) output.push(path);
  }
  return output;
}

function artifactIdentity(path: string): { path: string; size: number; sha256: string } {
  return { path, size: nodeFs.statSync(path).size, sha256: `sha256:${sha256File(path)}` };
}

function sha256File(path: string): string {
  return createHash("sha256").update(nodeFs.readFileSync(path)).digest("hex");
}

function readJson(path: string): Json {
  return JSON.parse(nodeFs.readFileSync(path, "utf8")) as Json;
}

function writeJson(path: string, value: unknown): void {
  nodeFs.mkdirSync(dirname(path), { recursive: true });
  nodeFs.writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function run(command: string, args: string[], cwd: string): string {
  const result = spawnSync(command, args, { cwd, env: process.env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr || result.stdout}`.trim());
  return result.stdout;
}

function expect(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function chmod(path: string, mode: number): void {
  (nodeFs as any).chmodSync(path, mode);
}

function rename(from: string, to: string): void {
  (nodeFs as any).renameSync(from, to);
}

function appendFile(path: string, text: string): void {
  (nodeFs as any).appendFileSync(path, text);
}
