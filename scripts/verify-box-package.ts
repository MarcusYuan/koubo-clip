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
const cliTarball = resolve(process.argv[2] ?? join(boxDist, `koubo-clip-box-cli-${version}-macos-aarch64.tgz`));
const skillTarball = resolve(process.argv[3] ?? join(boxDist, `koubo-clip-box-skill-${version}.tgz`));
const tmp = nodeFs.mkdtempSync(join(tmpdir(), "koubo-box-acceptance-"));

try {
  const cliDescriptor = readJson(join(dirname(cliTarball), "cli-package.box.json"));
  const skillDescriptor = readJson(join(dirname(skillTarball), "skill.box.json"));
  verifyCliDescriptorStrict(cliDescriptor, cliTarball);
  verifySkillDescriptorStrict(skillDescriptor);

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
  verifyNoCliSkillPayload(cliRoot);
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
  verifyPackageFiles(cliRoot, cliDescriptor.files, "cli-package.box.json");
  verifySkillDescriptor(skillRoot, skillDescriptor);
  verifyLinkedIdentity(cliDescriptor, skillDescriptor);

  const versionOutput = runCli(cli, ["--version"], arbitraryCwd).stdout.trim();
  expect(versionOutput === version, `Box CLI --version mismatch: ${versionOutput}`);
  const delivery = runCliJson(cli, ["delivery", "verify", "--json"], arbitraryCwd, {
    KOUBO_CLIP_SKILL_ROOT: skillRoot,
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
  expect(lock.target?.os === "macos" && lock.target?.arch === "aarch64", "installed runtime-lock target mismatch");
  expect(Array.isArray(lock.files) && lock.files.length > 0, "installed runtime-lock has no files");
  const locked = new Map<string, Json>();
  for (const entry of lock.files) {
    expect(typeof entry.path === "string" && isSafeBoxRelativePath(entry.path) && typeof entry.size === "number" && /^[a-f0-9]{64}$/.test(entry.sha256) && typeof entry.role === "string", "runtime-lock file entry is incomplete or unsafe");
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

function verifyNoCliSkillPayload(cliRoot: string): void {
  for (const path of walkFiles(cliRoot)) {
    const rel = relative(cliRoot, path).replaceAll("\\", "/");
    expect(!isCliSkillPayloadPath(rel), `Box CLI package contains user-visible Skill payload: ${rel}`);
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
  const payloadRoot = skillPackageRoot;
  expect(nodeFs.existsSync(join(payloadRoot, "SKILL.md")), "Box Skill package is missing SKILL.md");
  expect(nodeFs.existsSync(join(payloadRoot, "skill.box.json")), "Box Skill package is missing root skill.box.json");
  expect(JSON.stringify(readJson(join(payloadRoot, "skill.box.json"))) === JSON.stringify(descriptor), "packaged skill.box.json must match the external descriptor");
  expect(!nodeFs.existsSync(join(skillPackageRoot, "skills", "koubo-clip")), "Box Skill package must expose SKILL.md at package root, not nested skills/koubo-clip");
  verifyPackageFiles(payloadRoot, descriptor.files, "skill.box.json", ["skill.box.json"]);
  verifySkillPayloadSet(payloadRoot, descriptor.files);
  const listed = new Set((descriptor.files ?? []).map((entry: Json) => entry.path));
  for (const required of ["SKILL.md"]) expect(listed.has(required), `skill.box.json does not list ${required}`);
  for (const topLevel of ["agents", "references"]) {
    expect((descriptor.files ?? []).some((entry: Json) => String(entry.path).startsWith(`${topLevel}/`)), `skill.box.json does not list ${topLevel}/ payload files`);
  }
  const dependency = descriptor.cli_dependencies?.[0];
  expect(dependency?.id === "koubo-clip" && dependency.version === version, `Box Skill must depend on koubo-clip ${version}`);
  for (const command of ["koubo-clip doctor --json", "koubo-clip test --json", "koubo-clip render-contract render"]) {
    expect(dependency.commands.includes(command), `Box Skill dependency is missing ${command}`);
  }
}

function verifyCliDescriptorStrict(descriptor: Json, cliTarballPath: string): void {
  expect(descriptor.manifest_version === "1", "CLI manifest_version must be 1");
  expect(descriptor.id === "koubo-clip", "CLI id must be koubo-clip");
  expect(typeof descriptor.name === "string" && descriptor.name.length > 0, "CLI name is required");
  expect(descriptor.version === version, "CLI version mismatch");
  expect(descriptor.publisher === "MarcusYuan", "CLI publisher must be MarcusYuan");
  expect(/^[a-f0-9]{40}$/.test(descriptor.source_revision), "CLI source_revision must be exact 40-char lowercase commit SHA");
  expect(JSON.stringify(descriptor.machine_output) === JSON.stringify({ format: "json", encoding: "utf-8" }), "CLI machine_output shape mismatch");
  expect(JSON.stringify(descriptor.health_check) === JSON.stringify({ args: ["doctor", "--json"] }), "CLI health_check shape mismatch");
  expectPermissionShape(descriptor.permissions, "CLI permissions");
  expectDataPolicyShape(descriptor.data_policy, "CLI data_policy");
  expect(Array.isArray(descriptor.artifacts) && descriptor.artifacts.length === 1, "CLI descriptor must have exactly one artifact");
  expectExactKeys(descriptor.artifacts[0], ["os", "arch", "url", "size_bytes", "sha256", "executable"], "CLI artifact");
  expectArtifact(descriptor.artifacts[0], cliTarballPath, "Box CLI descriptor artifact");
  expect(descriptor.artifacts[0].os === "macos" && descriptor.artifacts[0].arch === "aarch64", "CLI artifact target must be macos/aarch64");
  expect(descriptor.artifacts[0].executable === "bin/koubo-clip", "CLI artifact executable must be bin/koubo-clip");
  expect(descriptor.release_urls?.cli === `https://github.com/MarcusYuan/koubo-clip/releases/download/v${version}/${basename(cliTarballPath)}`, "CLI release_urls.cli must use the canonical GitHub release URL");
  for (const key of ["path", "release_url", "entrypoint", "distribution_kind"]) {
    expect(!(key in descriptor.artifacts[0]), `CLI artifact must not include legacy key ${key}`);
  }
}

function verifySkillDescriptorStrict(descriptor: Json): void {
  expect(descriptor.manifest_version === "1", "Skill manifest_version must be 1");
  expect(descriptor.id === "koubo-clip", "Skill id must be koubo-clip");
  expect(typeof descriptor.name === "string" && descriptor.name.length > 0, "Skill name is required");
  expect(typeof descriptor.description === "string" && descriptor.description.length > 0, "Skill description is required");
  expect(descriptor.entrypoint === "SKILL.md", "Skill entrypoint must be SKILL.md");
  expect(descriptor.version === version, "Skill version mismatch");
  expect(/^[a-f0-9]{40}$/.test(descriptor.source_revision), "Skill source_revision must be exact 40-char lowercase commit SHA");
  expectPermissionShape(descriptor.permissions, "Skill permissions");
  expectDataPolicyShape(descriptor.data_policy, "Skill data_policy");
  expect(descriptor.source?.kind === "github" && descriptor.source?.publisher === "MarcusYuan", "Skill source must identify the GitHub publisher");
  expect(descriptor.release_urls?.skill === `https://github.com/MarcusYuan/koubo-clip/releases/download/v${version}/koubo-clip-box-skill-${version}.tgz`, "Skill release_urls.skill must use the canonical GitHub release URL");
  const dependency = descriptor.cli_dependencies?.[0];
  expect(dependency?.id === "koubo-clip" && dependency.version === version && dependency.required === true, `Box Skill must require koubo-clip ${version}`);
  for (const key of ["artifacts", "root", "publisher"]) {
    expect(!(key in descriptor), `Skill descriptor must not include legacy key ${key}`);
  }
  expect(!("skill_artifact_sha256" in (descriptor.delivery_identity ?? {})), "Skill descriptor must not include skill tarball hash and create a digest cycle");
}

function expectPermissionShape(value: Json | undefined, label: string): void {
  expectExactKeys(value, ["file_read", "file_write", "network", "credentials", "devices", "side_effects"], label);
  for (const key of ["file_read", "file_write", "network", "credentials", "devices", "side_effects"]) {
    expect(Array.isArray(value![key]), `${label}.${key} must be an array`);
  }
}

function expectDataPolicyShape(value: Json | undefined, label: string): void {
  expectExactKeys(value, ["preserve_on_update", "remove_on_uninstall"], label);
  expect(Array.isArray(value!.preserve_on_update), `${label}.preserve_on_update must be an array`);
  expect(Array.isArray(value!.remove_on_uninstall), `${label}.remove_on_uninstall must be an array`);
}

function expectExactKeys(value: Json | undefined, keys: string[], label: string): void {
  expect(Boolean(value) && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  const actual = Object.keys(value!).sort();
  const expected = [...keys].sort();
  expect(JSON.stringify(actual) === JSON.stringify(expected), `${label} keys mismatch: expected ${expected.join(",")}, got ${actual.join(",")}`);
}

function verifySkillPayloadSet(packageRoot: string, descriptorFiles: Json[]): void {
  const descriptorPaths = new Set(descriptorFiles.map((entry) => entry.path));
  expect(!descriptorPaths.has("skill.box.json"), "skill.box.json files[] must exclude itself");
  const actualPaths = walkFiles(packageRoot).map((path) => relative(packageRoot, path).replaceAll("\\", "/")).sort();
  const expectedPaths = [...descriptorPaths, "skill.box.json"].sort();
  expect(JSON.stringify(actualPaths) === JSON.stringify(expectedPaths), "Skill package payload must equal descriptor files plus root skill.box.json");
}

function verifyPackageFiles(packageRoot: string, descriptorFiles: Json[] | undefined, label: string, allowedExtraPaths: string[] = []): void {
  expect(Array.isArray(descriptorFiles), `${label} files must be a top-level array`);
  const expected = new Map<string, Json>();
  for (const entry of descriptorFiles) {
    expect(typeof entry.path === "string" && typeof entry.size_bytes === "number" && /^[a-f0-9]{64}$/.test(entry.sha256) && typeof entry.executable === "boolean", `${label} file entry is incomplete`);
    expect(isSafeBoxRelativePath(entry.path), `${label} contains unsafe path ${entry.path}`);
    expected.set(entry.path, entry);
  }
  const allowedExtras = new Set(allowedExtraPaths);
  const actual = listFileEntries(packageRoot).filter((entry) => !allowedExtras.has(entry.path));
  expect(expected.size === actual.length, `${label} file count does not match package`);
  for (const entry of actual) {
    const descriptorEntry = expected.get(entry.path);
    expect(Boolean(descriptorEntry), `${label} does not list ${entry.path}`);
    expect(descriptorEntry!.size_bytes === entry.size_bytes, `${label} size mismatch for ${entry.path}`);
    expect(descriptorEntry!.sha256 === entry.sha256, `${label} sha256 mismatch for ${entry.path}`);
    expect(descriptorEntry!.executable === entry.executable, `${label} executable mismatch for ${entry.path}`);
  }
}

function verifyLinkedIdentity(cliDescriptor: Json, skillDescriptor: Json): void {
  const cliSha = cliDescriptor.artifacts?.[0]?.sha256;
  expect(skillDescriptor.delivery_identity?.cli_artifact_sha256 === cliSha, "Box Skill descriptor is not linked to the CLI artifact sha256");
  expect(skillDescriptor.delivery_identity?.delivery_digest === cliDescriptor.runtime?.delivery_digest, "Box Skill descriptor delivery digest does not match the CLI descriptor");
  expect(skillDescriptor.delivery_identity?.official_skill_digest === cliDescriptor.runtime?.official_skill_digest, "Box descriptors disagree on official Skill digest");
}

function isSafeBoxRelativePath(path: string): boolean {
  if (!path || path.startsWith("/") || path.endsWith("/") || path.includes("\\") || /^[A-Za-z]:/.test(path)) return false;
  const parts = path.split("/");
  return parts.every((part) => part.length > 0 && part !== "." && part !== "..");
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
  expect(entry!.size_bytes === actual.size_bytes, `${label} size mismatch`);
  expect(entry!.sha256 === actual.sha256, `${label} sha256 mismatch`);
  expect(/^[a-f0-9]{64}$/.test(entry!.sha256), `${label} sha256 must be pure hex`);
  const canonicalReleaseUrl = `https://github.com/MarcusYuan/koubo-clip/releases/download/v${version}/${basename(path)}`;
  expect(
    typeof entry!.url === "string" && (entry!.url.startsWith("bundled://") || entry!.url === canonicalReleaseUrl),
    `${label} must use a bundled:// local URL or the canonical HTTPS Release asset URL`,
  );
}

function singleDir(parent: string, prefix: string): string {
  const matches = nodeFs.readdirSync(parent).filter((name) => name.startsWith(prefix)).map((name) => join(parent, name));
  expect(matches.length === 1, `expected one ${prefix} directory, found ${matches.length}`);
  return matches[0]!;
}

function listFileEntries(dir: string): Array<{ path: string; size_bytes: number; sha256: string; executable: boolean }> {
  return walkFiles(dir).map((path) => ({
    path: relative(dir, path).replaceAll("\\", "/"),
    size_bytes: nodeFs.statSync(path).size,
    sha256: sha256File(path),
    executable: ((((nodeFs as any).statSync(path).mode as number) & 0o111) !== 0),
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

function isCliSkillPayloadPath(path: string): boolean {
  const parts = path.split("/");
  const basename = parts[parts.length - 1];
  return basename === "SKILL.md"
    || basename === "skill.json"
    || basename === "skill.box.json"
    || parts.includes("skills")
    || parts.includes("agents");
}

function artifactIdentity(path: string): { path: string; size_bytes: number; sha256: string } {
  return { path, size_bytes: nodeFs.statSync(path).size, sha256: sha256File(path) };
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
