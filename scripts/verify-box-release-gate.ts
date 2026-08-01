import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import * as nodeFs from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Json = Record<string, any>;
type LicenseEntry = { path: string; size_bytes: number; sha256: string; mode: "0644" };

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const version = String(readJson(join(root, "package.json")).version);
const lock = readJson(join(root, "box-runtime.lock.json"));
const releaseMode = process.argv.includes("--release");
const runtimeInput = lock.inputs?.ffmpeg_runtime as Json | undefined;
const runtimeRoot = resolve(process.env.KOUBO_BOX_FFMPEG_RUNTIME_ROOT ?? join(root, "dist", "box-runtime", "macos-aarch64"));
const ffmpegPath = join(runtimeRoot, "bin", "ffmpeg");
const ffprobePath = join(runtimeRoot, "bin", "ffprobe");
const evidenceRoot = join(runtimeRoot, "evidence");
const evidencePath = join(evidenceRoot, "build-evidence.json");
const sourceBundlePath = resolve(process.env.KOUBO_BOX_FFMPEG_SOURCE_BUNDLE ?? join(root, "dist", "box", `koubo-clip-ffmpeg-sources-${version}.tar.xz`));

try {
  expect(lock.schema_version === "1.0", "box-runtime.lock.json schema_version must be 1.0");
  expect(lock.target?.os === "macos" && lock.target?.arch === "aarch64" && lock.target?.status === "supported", "Box runtime lock target must be supported macos/aarch64");
  expect(runtimeInput && typeof runtimeInput === "object", "box-runtime.lock.json is missing inputs.ffmpeg_runtime");

  const gate = lock.public_distribution_gate as Json | undefined;
  expect(gate && typeof gate === "object", "box-runtime.lock.json is missing public_distribution_gate");
  expect(gate.status === "ready", "public_distribution_gate.status must be ready before public Box distribution");
  expect(gate.release_policy === "gpl-corresponding-source", "public distribution gate must select the auditable GPL corresponding-source policy");
  expect(typeof gate.policy_reference === "string" && gate.policy_reference.startsWith("https://"), "public distribution gate needs an HTTPS policy_reference");
  expect(gate.legal_assessment === "not_provided", "public distribution gate must not claim a legal assessment");
  const requiredEvidence = gate.required_evidence;
  expect(Array.isArray(requiredEvidence) && requiredEvidence.length >= 6 && requiredEvidence.every((entry: unknown) => typeof entry === "string" && entry.length > 0), "public distribution gate must enumerate its auditable evidence requirements");

  const sourceLockPath = resolveLockedPath(runtimeInput.source_lock, "FFmpeg source lock");
  const buildRecipePath = resolveLockedPath(runtimeInput.build_recipe, "FFmpeg build recipe");
  verifyLockedFile(sourceLockPath, runtimeInput.source_lock_sha256, "FFmpeg source lock");
  verifyLockedFile(buildRecipePath, runtimeInput.build_recipe_sha256, "FFmpeg build recipe");
  verifyLockedFile(join(evidenceRoot, "source-lock.json"), runtimeInput.source_lock_sha256, "generated FFmpeg source lock evidence");
  verifyLockedFile(join(evidenceRoot, "build-box-ffmpeg-runtime.sh"), runtimeInput.build_recipe_sha256, "generated FFmpeg build recipe evidence");

  const sourceLock = readJson(sourceLockPath);
  const evidence = readJson(evidencePath);
  verifySourceLock(sourceLock);
  const cleanEvidence = verifyBuildEvidence(evidence, sourceLock);
  if (releaseMode) expect(cleanEvidence, "release mode requires FFmpeg evidence built from a clean release commit");
  verifyBinary(ffmpegPath, "bin/ffmpeg", "media-runtime", evidence, runtimeInput.ffmpeg_sha256);
  verifyBinary(ffprobePath, "bin/ffprobe", "media-inspector", evidence, runtimeInput.ffprobe_sha256);
  verifyRuntimeCapabilities(ffmpegPath, sourceLock);
  verifyOnlySystemDynamicDependencies(ffmpegPath);
  verifyOnlySystemDynamicDependencies(ffprobePath);
  verifyCapturedEvidence(ffmpegPath, ffprobePath);
  const licenses = verifyLicenseEvidence(evidence, sourceLock);
  verifySourceBundle(sourceBundlePath, sourceLock, evidence, buildRecipePath, licenses);

  const result = {
    schema_version: "1",
    ok: true,
    status: cleanEvidence ? gate.status : "preview",
    release_allowed: cleanEvidence,
    release_mode: releaseMode,
    release_policy: gate.release_policy,
    legal_assessment: gate.legal_assessment,
    policy_reference: gate.policy_reference,
    forbidden_flags_present: [],
    ffmpeg_sha256: sha256File(ffmpegPath),
    ffprobe_sha256: sha256File(ffprobePath),
    source_lock_sha256: sha256File(sourceLockPath),
    build_recipe_sha256: sha256File(buildRecipePath),
    build_evidence_sha256: sha256File(evidencePath),
    corresponding_source: { ...artifactIdentity(sourceBundlePath), url: ffmpegSourceBundleUrl() },
    source_revision: gitRevision(),
  };

  const outputPath = process.env.BOX_RELEASE_GATE_OUTPUT;
  if (outputPath) writeJson(resolve(outputPath), result);
  console.log(JSON.stringify(result));
} catch (error) {
  const result = {
    schema_version: "1",
    ok: false,
    status: "invalid",
    release_allowed: false,
    blocker_code: "BOX_RELEASE_GATE_INVALID",
    message: error instanceof Error ? error.message : String(error),
  };
  const outputPath = process.env.BOX_RELEASE_GATE_OUTPUT;
  if (outputPath) writeJson(resolve(outputPath), result);
  console.log(JSON.stringify(result));
  process.exitCode = 1;
}

function verifySourceLock(sourceLock: Json): void {
  expect(sourceLock.contract_version === "1", "FFmpeg source lock contract_version must be 1");
  expect(sourceLock.delivery?.id === "koubo-clip" && sourceLock.delivery?.version === version, "FFmpeg source lock delivery identity mismatch");
  expect(sourceLock.target?.os === "macos" && sourceLock.target?.arch === "aarch64", "FFmpeg source lock target mismatch");
  expect(Array.isArray(sourceLock.runtime?.required_configure_flags) && sourceLock.runtime.required_configure_flags.length >= 6, "FFmpeg source lock has incomplete required configure flags");
  expect(Array.isArray(sourceLock.runtime?.forbidden_configure_flags) && sourceLock.runtime.forbidden_configure_flags.includes("--enable-nonfree"), "FFmpeg source lock must forbid --enable-nonfree");
  expect(sourceLock.runtime.required_capabilities?.filters?.includes("drawtext"), "FFmpeg source lock must require drawtext");
  for (const encoder of ["aac", "libx264"]) expect(sourceLock.runtime.required_capabilities?.encoders?.includes(encoder), `FFmpeg source lock must require the ${encoder} encoder`);
  expect(Array.isArray(sourceLock.sources) && sourceLock.sources.length === 7, "FFmpeg source lock must contain the seven audited runtime/build inputs");
  const ids = new Set<string>();
  for (const source of sourceLock.sources as Json[]) {
    expect(typeof source.id === "string" && /^[a-z0-9-]+$/.test(source.id) && !ids.has(source.id), "FFmpeg source lock contains an invalid or duplicate source id");
    ids.add(source.id);
    expect(typeof source.version === "string" && source.version.length > 0, `source ${source.id} is missing a version`);
    expect(source.kind === "source-archive" || source.kind === "python-wheel", `source ${source.id} has an unsupported input kind`);
    expect(isSafeRelativePath(source.archive), `source ${source.id} has an unsafe archive path`);
    expect(typeof source.url === "string" && source.url.startsWith("https://"), `source ${source.id} must use an HTTPS URL`);
    expect(/^[a-f0-9]{64}$/.test(source.sha256), `source ${source.id} has an invalid SHA-256`);
    expect(typeof source.license === "string" && source.license.length > 0, `source ${source.id} is missing its license declaration`);
    expect(Array.isArray(source.license_files) && source.license_files.length > 0 && source.license_files.every(isSafeRelativePath), `source ${source.id} has invalid license file paths`);
    expect(Array.isArray(source.patches), `source ${source.id} patches must be an array`);
    for (const patch of source.patches) {
      expect(isSafeRelativePath(patch.path) && /^[a-f0-9]{64}$/.test(patch.sha256), `source ${source.id} has an invalid patch record`);
      verifyLockedFile(join(dirname(sourceLockPathForValidation()), patch.path), patch.sha256, `source ${source.id} patch`);
    }
  }
  const requiredIds = ["ffmpeg", "x264", "freetype", "harfbuzz", "pkgconf", "meson", "ninja"];
  expect(requiredIds.every((id) => ids.has(id)), "FFmpeg source lock is missing a required audited input");
}

function verifyBuildEvidence(evidence: Json, sourceLock: Json): boolean {
  expect(evidence.contract_version === "1", "FFmpeg build evidence contract_version must be 1");
  expect(evidence.target?.os === "macos" && evidence.target?.arch === "aarch64", "FFmpeg build evidence target mismatch");
  expect(typeof evidence.git_dirty === "boolean", "FFmpeg build evidence must record its Git dirty state");
  const revision = gitRevision();
  const expectedRevision = evidence.git_dirty ? `${revision}-dirty` : revision;
  expect(evidence.source_revision === expectedRevision, "FFmpeg build evidence source_revision must match the current checkout provenance");
  expect(Array.isArray(evidence.sources) && canonicalJson(evidence.sources) === canonicalJson(sourceLock.sources), "FFmpeg build evidence sources must exactly match the committed source lock");
  expect(typeof evidence.build?.compiler === "string" && evidence.build.compiler.length > 0, "FFmpeg build evidence is missing compiler provenance");
  expect(Array.isArray(evidence.build?.configure_args), "FFmpeg build evidence is missing configure arguments");
  expect(evidence.source_bundle?.url === ffmpegSourceBundleUrl(), "FFmpeg build evidence must identify the canonical same-release corresponding-source URL");
  expect(/^[a-f0-9]{64}$/.test(evidence.source_bundle?.sha256) && typeof evidence.source_bundle?.size_bytes === "number", "FFmpeg build evidence corresponding-source identity is incomplete");
  for (const flag of sourceLock.runtime.required_configure_flags) expect(evidence.build.configure_args.includes(flag), `FFmpeg build evidence is missing required flag ${flag}`);
  for (const flag of sourceLock.runtime.forbidden_configure_flags) expect(!evidence.build.configure_args.includes(flag), `FFmpeg build evidence contains forbidden flag ${flag}`);
  for (const assertion of ["gpl_enabled", "nonfree_disabled", "libx264_enabled", "libfreetype_enabled", "libharfbuzz_enabled", "drawtext_available", "only_system_dynamic_dependencies"]) {
    expect(evidence.assertions?.[assertion] === true, `FFmpeg build evidence assertion ${assertion} is not true`);
  }
  return !evidence.git_dirty;
}

function verifyBinary(path: string, evidencePathName: string, role: string, evidence: Json, lockedSha256: unknown): void {
  expect(nodeFs.existsSync(path) && nodeFs.statSync(path).isFile(), `${role} binary is missing`);
  expect((((nodeFs as any).statSync(path).mode as number) & 0o111) !== 0, `${role} binary is not executable`);
  const entry = (evidence.binaries ?? []).find((candidate: Json) => candidate.path === evidencePathName);
  expect(Boolean(entry) && entry.role === role && entry.mode === "0755", `${role} build evidence entry is incomplete`);
  expect(entry.size_bytes === nodeFs.statSync(path).size && entry.sha256 === sha256File(path), `${role} does not match build evidence`);
  if (lockedSha256 !== undefined) expect(lockedSha256 === entry.sha256, `${role} does not match box-runtime.lock.json`);
}

function verifyRuntimeCapabilities(path: string, sourceLock: Json): void {
  const versionOutput = run(path, ["-version"]);
  const configuration = versionOutput.split(/\r?\n/).find((line) => line.startsWith("configuration:"));
  expect(Boolean(configuration), "ffmpeg did not report its build configuration");
  for (const flag of sourceLock.runtime.required_configure_flags) expect(configuration!.includes(flag), `ffmpeg configuration is missing ${flag}`);
  for (const flag of sourceLock.runtime.forbidden_configure_flags) expect(!configuration!.includes(flag), `ffmpeg configuration contains forbidden flag ${flag}`);
  const filters = run(path, ["-hide_banner", "-filters"]);
  for (const filter of sourceLock.runtime.required_capabilities.filters) expect(new RegExp(`\\b${escapeRegExp(filter)}\\b`).test(filters), `ffmpeg is missing required filter ${filter}`);
  const encoders = run(path, ["-hide_banner", "-encoders"]);
  for (const encoder of sourceLock.runtime.required_capabilities.encoders) expect(new RegExp(`\\b${escapeRegExp(encoder)}\\b`).test(encoders), `ffmpeg is missing required encoder ${encoder}`);
}

function verifyOnlySystemDynamicDependencies(path: string): void {
  const dependencies = parseOtoolDependencies(run("otool", ["-L", path]));
  expect(dependencies.length > 0, `otool did not report dependencies for ${basename(path)}`);
  for (const dependency of dependencies) expect(dependency.startsWith("/usr/lib/") || dependency.startsWith("/System/Library/"), `${basename(path)} has a non-system dynamic dependency: ${dependency}`);
}

function verifyCapturedEvidence(ffmpeg: string, ffprobe: string): void {
  for (const [binary, versionFile, otoolFile] of [
    [ffmpeg, "ffmpeg-version.txt", "otool-ffmpeg.txt"],
    [ffprobe, "ffprobe-version.txt", "otool-ffprobe.txt"],
  ] as const) {
    expect(nodeFs.readFileSync(join(evidenceRoot, versionFile), "utf8").trim() === run(binary, ["-version"]).trim(), `${versionFile} does not match the shipped binary`);
    const recorded = parseOtoolDependencies(nodeFs.readFileSync(join(evidenceRoot, otoolFile), "utf8"));
    const actual = parseOtoolDependencies(run("otool", ["-L", binary]));
    expect(JSON.stringify(recorded) === JSON.stringify(actual), `${otoolFile} does not match the shipped binary`);
  }
}

function verifyLicenseEvidence(evidence: Json, sourceLock: Json): Map<string, LicenseEntry> {
  const declaredPaths = new Set<string>();
  for (const source of sourceLock.sources as Json[]) {
    for (const relativeLicensePath of source.license_files) {
      const declaredPath = `${source.id}/${relativeLicensePath}`;
      expect(!declaredPaths.has(declaredPath), `FFmpeg source lock contains duplicate license path ${declaredPath}`);
      declaredPaths.add(declaredPath);
    }
  }
  expect(Array.isArray(evidence.license_evidence), "FFmpeg build evidence must contain license_evidence[]");
  const entries = new Map<string, LicenseEntry>();
  for (const raw of evidence.license_evidence as Json[]) {
    expectExactKeys(raw, ["path", "size_bytes", "sha256", "mode"], "FFmpeg license evidence entry");
    expect(typeof raw.path === "string" && raw.path.startsWith("evidence/licenses/"), "FFmpeg license evidence path must be below evidence/licenses/");
    const path = raw.path.slice("evidence/licenses/".length);
    expect(isSafeRelativePath(path) && raw.path === `evidence/licenses/${path}`, `FFmpeg license evidence has an unsafe or non-normalized path: ${raw.path}`);
    expect(!entries.has(path), `FFmpeg license evidence contains duplicate path ${path}`);
    expect(Number.isInteger(raw.size_bytes) && raw.size_bytes > 0, `FFmpeg license evidence has invalid size for ${path}`);
    expect(/^[a-f0-9]{64}$/.test(raw.sha256), `FFmpeg license evidence has invalid SHA-256 for ${path}`);
    expect(raw.mode === "0644", `FFmpeg license evidence mode must be 0644 for ${path}`);
    entries.set(path, raw as LicenseEntry);
  }
  expect(entries.size === declaredPaths.size && [...declaredPaths].every((path) => entries.has(path)), "FFmpeg license evidence paths must exactly match the source lock license payload");
  verifyLicenseDirectory(join(evidenceRoot, "licenses"), entries, "runtime evidence license payload");
  return entries;
}

function verifySourceBundle(path: string, sourceLock: Json, evidence: Json, buildRecipePath: string, licenses: Map<string, LicenseEntry>): void {
  expect(nodeFs.existsSync(path) && nodeFs.statSync(path).isFile(), `FFmpeg corresponding-source bundle is missing: ${path}`);
  expect(evidence.source_bundle?.size_bytes === nodeFs.statSync(path).size && evidence.source_bundle?.sha256 === sha256File(path), "FFmpeg corresponding-source bundle does not match build evidence");
  const listing = run("tar", ["-tJf", path]).split(/\r?\n/).filter(Boolean);
  expect(listing.length > 0 && listing.every(isSafeArchiveEntry), "FFmpeg source bundle contains an unsafe archive path");
  expect(new Set(listing).size === listing.length, "FFmpeg source bundle contains duplicate archive paths");
  const verboseListing = run("tar", ["-tvJf", path]).split(/\r?\n/).filter(Boolean);
  expect(verboseListing.length === listing.length && verboseListing.every((line) => line.startsWith("-") || line.startsWith("d")), "FFmpeg source bundle may contain only regular files and directories");
  const unpack = nodeFs.mkdtempSync(join(tmpdir(), "koubo-ffmpeg-source-verify-"));
  try {
    run("tar", ["-xJf", path, "-C", unpack]);
    const files = walkFiles(unpack);
    const manifestPath = uniqueBasename(files, "SOURCE_MANIFEST.json");
    const bundledManifest = readJson(manifestPath);
    expect(canonicalJson(bundledManifest) === canonicalJson(sourceLock), "source bundle manifest does not exactly match the committed source lock");
    const bundledRecipe = uniqueBasename(files, "BUILD.sh");
    expect(sha256File(bundledRecipe) === sha256File(buildRecipePath), "source bundle build recipe does not match the committed recipe");
    const bundleRoot = dirname(manifestPath);
    verifyLicenseDirectory(join(bundleRoot, "licenses"), licenses, "corresponding-source license payload");
    for (const source of sourceLock.sources as Json[]) {
      const archive = uniqueBasename(files, source.archive);
      expect(sha256File(archive) === source.sha256, `source bundle archive digest mismatch for ${source.id}`);
      for (const patch of source.patches) {
        const bundledPatch = uniqueRelativeSuffix(files, patch.path);
        expect(sha256File(bundledPatch) === patch.sha256, `source bundle patch digest mismatch for ${source.id}`);
      }
    }
    for (const [licensePath] of licenses) {
      const runtimeLicense = join(evidenceRoot, "licenses", licensePath);
      const bundledLicense = join(bundleRoot, "licenses", licensePath);
      expect(sha256File(runtimeLicense) === sha256File(bundledLicense), `runtime and corresponding-source license bytes differ for ${licensePath}`);
    }
    verifyLicenseMutationFailures(join(evidenceRoot, "licenses"), join(bundleRoot, "licenses"), licenses);
  } finally {
    nodeFs.rmSync(unpack, { recursive: true, force: true });
  }
}

function verifyLicenseMutationFailures(runtimeLicenses: string, sourceLicenses: string, expected: Map<string, LicenseEntry>): void {
  const firstPath = expected.keys().next().value as string | undefined;
  expect(Boolean(firstPath), "license mutation checks require at least one declared license");
  const cases: Array<{ label: string; mutate(runtime: string, source: string): void }> = [
    { label: "extra runtime license", mutate: (runtime) => nodeFs.writeFileSync(join(runtime, "unexpected-license.txt"), "unexpected\n") },
    { label: "missing runtime license", mutate: (runtime) => nodeFs.rmSync(join(runtime, firstPath!)) },
    { label: "tampered runtime license", mutate: (runtime) => (nodeFs as any).appendFileSync(join(runtime, firstPath!), "\ntampered\n") },
    { label: "extra source license", mutate: (_runtime, source) => nodeFs.writeFileSync(join(source, "unexpected-license.txt"), "unexpected\n") },
    { label: "missing source license", mutate: (_runtime, source) => nodeFs.rmSync(join(source, firstPath!)) },
    { label: "tampered source license", mutate: (_runtime, source) => (nodeFs as any).appendFileSync(join(source, firstPath!), "\ntampered\n") },
  ];
  for (const testCase of cases) {
    const caseRoot = nodeFs.mkdtempSync(join(tmpdir(), "koubo-ffmpeg-license-mutation-"));
    try {
      const runtimeCopy = join(caseRoot, "runtime");
      const sourceCopy = join(caseRoot, "source");
      nodeFs.cpSync(runtimeLicenses, runtimeCopy, { recursive: true });
      nodeFs.cpSync(sourceLicenses, sourceCopy, { recursive: true });
      testCase.mutate(runtimeCopy, sourceCopy);
      expectThrows(() => {
        verifyLicenseDirectory(runtimeCopy, expected, "mutated runtime license payload");
        verifyLicenseDirectory(sourceCopy, expected, "mutated source license payload");
        for (const path of expected.keys()) {
          expect(sha256File(join(runtimeCopy, path)) === sha256File(join(sourceCopy, path)), `mutated license bytes differ for ${path}`);
        }
      }, `license mutation was not rejected: ${testCase.label}`);
    } finally {
      nodeFs.rmSync(caseRoot, { recursive: true, force: true });
    }
  }
}

function expectThrows(action: () => void, message: string): void {
  let threw = false;
  try { action(); } catch { threw = true; }
  expect(threw, message);
}

function verifyLicenseDirectory(directory: string, expected: Map<string, LicenseEntry>, label: string): void {
  expect(nodeFs.existsSync(directory) && nodeFs.statSync(directory).isDirectory(), `${label} directory is missing`);
  const files = walkFiles(directory);
  expect(files.length === expected.size, `${label} contains an extra or missing file`);
  const actualPaths = new Set<string>();
  for (const file of files) {
    const path = relative(directory, file).replaceAll("\\", "/");
    expect(isSafeRelativePath(path) && !actualPaths.has(path), `${label} contains an unsafe or duplicate path ${path}`);
    actualPaths.add(path);
    const entry = expected.get(path);
    expect(Boolean(entry), `${label} contains undeclared file ${path}`);
    expect(nodeFs.statSync(file).size === entry!.size_bytes, `${label} size mismatch for ${path}`);
    expect(sha256File(file) === entry!.sha256, `${label} SHA-256 mismatch for ${path}`);
    expect((((nodeFs as any).statSync(file).mode as number) & 0o777) === 0o644, `${label} mode mismatch for ${path}`);
  }
  expect([...expected.keys()].every((path) => actualPaths.has(path)), `${label} is missing a declared file`);
}

function resolveLockedPath(value: unknown, label: string): string {
  expect(typeof value === "string" && isSafeRelativePath(value), `${label} path is missing or unsafe`);
  return resolve(root, value);
}

function verifyLockedFile(path: string, sha256: unknown, label: string): void {
  expect(nodeFs.existsSync(path) && nodeFs.statSync(path).isFile(), `${label} is missing: ${path}`);
  expect(typeof sha256 === "string" && /^[a-f0-9]{64}$/.test(sha256), `${label} lock digest is invalid`);
  expect(sha256File(path) === sha256, `${label} does not match box-runtime.lock.json`);
}

function sourceLockPathForValidation(): string {
  return resolve(root, String(runtimeInput?.source_lock ?? ""));
}

function isSafeRelativePath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.startsWith("/") || value.endsWith("/") || value.includes("\\") || /^[A-Za-z]:/.test(value)) return false;
  return value.split("/").every((part) => part.length > 0 && part !== "." && part !== "..");
}

function isSafeArchiveEntry(value: string): boolean {
  const normalized = value.endsWith("/") ? value.slice(0, -1) : value;
  return normalized.length > 0 && isSafeRelativePath(normalized);
}

function walkFiles(dir: string): string[] {
  const output: string[] = [];
  for (const name of nodeFs.readdirSync(dir).sort()) {
    const path = join(dir, name);
    const stat = (nodeFs as any).lstatSync(path) as { isSymbolicLink(): boolean; isDirectory(): boolean; isFile(): boolean };
    expect(!stat.isSymbolicLink(), `source bundle contains a symlink: ${relative(dir, path)}`);
    if (stat.isDirectory()) output.push(...walkFiles(path));
    else if (stat.isFile()) output.push(path);
  }
  return output;
}

function uniqueBasename(files: string[], name: string): string {
  const matches = files.filter((path) => basename(path) === name);
  expect(matches.length === 1, `source bundle must contain exactly one ${name}`);
  return matches[0]!;
}

function uniqueRelativeSuffix(files: string[], suffix: string): string {
  const normalized = suffix.replaceAll("\\", "/");
  const matches = files.filter((path) => path.replaceAll("\\", "/").endsWith(`/${normalized}`));
  expect(matches.length === 1, `source bundle must contain exactly one ${normalized}`);
  return matches[0]!;
}

function parseOtoolDependencies(output: string): string[] {
  return output.split(/\r?\n/).slice(1).map((line) => line.trim().split(" (")[0]).filter(Boolean);
}

function gitRevision(): string {
  const revision = run("git", ["rev-parse", "HEAD"], root).trim();
  expect(/^[a-f0-9]{40}$/.test(revision), "source revision is not an exact commit SHA");
  return revision;
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

function run(command: string, args: string[], cwd = root): string {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  expect(result.status === 0, `${command} ${args.join(" ")} failed: ${result.stderr || result.stdout}`.trim());
  return result.stdout;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ffmpegSourceBundleUrl(): string {
  return `https://github.com/MarcusYuan/koubo-clip/releases/download/v${version}/koubo-clip-ffmpeg-sources-${version}.tar.xz`;
}

function expectExactKeys(value: Json, keys: string[], label: string): void {
  expect(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  expect(JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort()), `${label} keys are not exact`);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
