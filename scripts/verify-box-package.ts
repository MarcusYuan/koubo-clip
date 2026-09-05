import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import * as nodeFs from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { verifySkillManifestV3, verifySkillPayloadDirectory } from "./box-skill-manifest";

type Json = Record<string, any>;
type LicenseEntry = { path: string; size_bytes: number; sha256: string; mode: "0644" };

const root = resolve(dirname(new URL(import.meta.url).pathname), "..");
const packageJson = readJson(join(root, "package.json"));
const version = String(packageJson.version);
const boxDist = join(root, "dist", "box");
const cliTarball = resolve(process.argv[2] ?? join(boxDist, `koubo-clip-box-cli-${version}-macos-aarch64.tgz`));
const skillTarball = resolve(process.argv[3] ?? join(boxDist, `koubo-clip-box-skill-${version}.tgz`));
const ffmpegSourceBundle = resolve(process.argv[4] ?? join(dirname(cliTarball), `koubo-clip-ffmpeg-sources-${version}.tar.xz`));
const tmp = nodeFs.mkdtempSync(join(tmpdir(), "koubo-box-acceptance-"));

try {
  const cliDescriptor = readJson(join(dirname(cliTarball), "cli-package.box.json"));
  const skillDescriptor = readJson(join(dirname(skillTarball), "skill.box.json"));
  verifyCliDescriptorStrict(cliDescriptor, cliTarball);
  verifySkillDescriptorStrict(skillDescriptor);

  const unpackRoot = join(tmp, "解包 path 'single' \"double\"");
  nodeFs.mkdirSync(unpackRoot, { recursive: true });
  run("tar", ["-xzf", cliTarball, "-C", unpackRoot], root);
  run("tar", ["-xzf", skillTarball, "-C", unpackRoot], root);
  const cliRoot = singleDir(unpackRoot, `koubo-clip-box-cli-${version}-`);
  const skillRoot = singleDir(unpackRoot, `koubo-clip-box-skill-${version}`);
  const cli = join(cliRoot, "bin", "koubo-clip");
  const arbitraryCwd = join(tmp, "arbitrary-cwd");
  nodeFs.mkdirSync(arbitraryCwd, { recursive: true });
  const packageOnlyPathEnv = { PATH: join(cliRoot, "runtime", "bin") };

  expect(nodeFs.existsSync(join(cliRoot, "cli-package.box.json")), "Box CLI package is missing root cli-package.box.json");
  expect(JSON.stringify(readJson(join(cliRoot, "cli-package.box.json"))) === JSON.stringify(cliDescriptor), "packaged cli-package.box.json must match the external descriptor");
  expect(!nodeFs.existsSync(join(cliRoot, "skills", "koubo-clip")), "Box CLI package contains the Skill payload");
  verifyNoCliSkillPayload(cliRoot);
  expect(nodeFs.existsSync(cli), "Box CLI package is missing bin/koubo-clip");
  expect(nodeFs.existsSync(join(cliRoot, "runtime", "bin", "bun")), "Box CLI package is missing managed Bun");
  expect(nodeFs.existsSync(join(cliRoot, "runtime", "bin", "ffmpeg")), "Box CLI package is missing managed ffmpeg");
  expect(nodeFs.existsSync(join(cliRoot, "runtime", "bin", "ffprobe")), "Box CLI package is missing managed ffprobe");
  expect(nodeFs.existsSync(join(cliRoot, "runtime", "bin", "hyperframes")), "Box CLI package is missing managed HyperFrames launcher");
  expect(nodeFs.existsSync(join(cliRoot, "resources", "hyperframes", "registry")), "Box CLI package is missing HyperFrames registry resources");
  expect(nodeFs.existsSync(join(cliRoot, "runtime", "browser", "chrome-headless-shell", "mac_arm-131.0.6778.85", "chrome-headless-shell-mac-arm64", "chrome-headless-shell")), "Box CLI package is missing managed Chrome Headless Shell");
  expect(nodeFs.existsSync(join(cliRoot, "licenses", "ffmpeg-runtime", "build-evidence.json")), "Box CLI package is missing FFmpeg build evidence");
  expect(nodeFs.existsSync(join(cliRoot, "licenses", "ffmpeg-runtime", "source-lock.json")), "Box CLI package is missing FFmpeg source lock evidence");
  expect(nodeFs.existsSync(join(cliRoot, "licenses", "ffmpeg-runtime", "licenses")), "Box CLI package is missing FFmpeg runtime license texts");
  expect(nodeFs.existsSync(join(cliRoot, "licenses", "ffmpeg-runtime", "SOURCE_OFFER.json")), "Box CLI package is missing the versioned FFmpeg source offer");
  expect(nodeFs.existsSync(join(cliRoot, "THIRD_PARTY_NOTICES.md")), "Box CLI package is missing THIRD_PARTY_NOTICES.md");

  verifyRuntimeLock(cliRoot);
  verifyFfmpegRuntimeEvidence(cliRoot, cliDescriptor, ffmpegSourceBundle);
  verifyNoBareManagedToolSpawns();
  verifyPackageFiles(cliRoot, cliDescriptor.files, "cli-package.box.json", ["cli-package.box.json"]);
  verifySkillDescriptor(skillRoot, skillDescriptor);

  const versionOutput = runCli(cli, ["--version"], arbitraryCwd, packageOnlyPathEnv).stdout.trim();
  expect(versionOutput === version, `Box CLI --version mismatch: ${versionOutput}`);
  const delivery = runCliJson(cli, ["delivery", "verify", "--json"], arbitraryCwd, {
    ...packageOnlyPathEnv,
    KOUBO_CLIP_SKILL_ROOT: skillRoot,
  });
  expect(delivery.status === 0, `delivery verify --json failed: ${delivery.stderr || delivery.stdout}`);
  expect(delivery.json.ok === true && delivery.json.data?.distribution_kind === "box-cli", "delivery verify did not accept the split Box CLI/Skill identity");
  expect(delivery.json.data?.capability_ids?.includes("external_asr.handoff.v1"), "delivery manifest is missing external_asr.handoff.v1");
  expect(delivery.json.data?.capability_ids?.includes("box_managed_cli.v1"), "delivery manifest is missing box_managed_cli.v1");
  const doctor = runCliJson(cli, ["doctor", "--json"], arbitraryCwd, packageOnlyPathEnv);
  expect(doctor.status === 0, `doctor --json failed: ${doctor.stderr || doctor.stdout}`);
  expect(doctor.json.contract_version === "1", "doctor --json is missing contract_version 1");
  expect(doctor.json.ok === true, "doctor --json did not report ok=true");
  expect(doctor.json.result?.id === "koubo-clip", "doctor result id mismatch");
  expect(doctor.json.result?.version === version, "doctor result version mismatch");
  expect(["healthy", "degraded", "needs_configuration"].includes(doctor.json.result?.status), "doctor status is outside the Box contract");

  const smoke = runCliJson(cli, ["test", "--json"], arbitraryCwd, packageOnlyPathEnv);
  expect(smoke.status === 0, `test --json failed: ${smoke.stderr || smoke.stdout}`);
  expect(smoke.json.contract_version === "1", "test --json is missing contract_version 1");
  expect(smoke.json.ok === true, "test --json did not report ok=true");
  expect(smoke.json.result?.status === "passed", "test --json result.status must be passed");
  const packagedRuntimeSmoke = verifyFinalPackagedBrowserRuntime(cliRoot, arbitraryCwd);
  verifyNoHostFallbackForRenderAndAsr(cliRoot, cli, arbitraryCwd);
  verifyDoctorTamperClassifications(cliRoot, cli, arbitraryCwd);

  const acceptance = {
    schema_version: "1",
    ok: true,
    version,
    source_revision: cliDescriptor.artifact_generation.source_revision,
    cli_package: artifactIdentity(cliTarball),
    skill_package: artifactIdentity(skillTarball),
    cli_root: cliRoot,
    skill_root: skillRoot,
    doctor_status: doctor.json.result.status,
    test_status: smoke.json.result.status,
    packaged_runtime_smoke: packagedRuntimeSmoke,
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
  for (const required of ["bin/koubo-clip", "bin/koubo-clip-runtime", "runtime/bin/bun", "runtime/bin/ffmpeg", "runtime/bin/ffprobe", "runtime/bin/hyperframes", "runtime/bin/chrome-headless-shell", "runtime/hyperframes.js", "runtime/hyperframe.manifest.json", "runtime/hyperframe.runtime.iife.js", "runtime/hyperframe-runtime.js", "runtime/hyperframes-player.global.js", "runtime/hyperframes-slideshow.global.js", "runtime/shaderTransitionWorker.js"]) {
    expect(locked.has(required), `runtime-lock does not list ${required}`);
  }
  for (const required of ["licenses/ffmpeg-runtime/build-evidence.json", "licenses/ffmpeg-runtime/source-lock.json", "licenses/ffmpeg-runtime/build-box-ffmpeg-runtime.sh", "licenses/ffmpeg-runtime/ffmpeg-version.txt", "licenses/ffmpeg-runtime/ffprobe-version.txt", "licenses/ffmpeg-runtime/otool-ffmpeg.txt", "licenses/ffmpeg-runtime/otool-ffprobe.txt", "licenses/ffmpeg-runtime/SOURCE_OFFER.json", "THIRD_PARTY_NOTICES.md"]) {
    expect(locked.has(required), `runtime-lock does not list ${required}`);
  }
  expect([...locked.keys()].some((path) => path.startsWith("licenses/ffmpeg-runtime/licenses/")), "runtime-lock does not list FFmpeg runtime license texts");
}

function verifyFfmpegRuntimeEvidence(cliRoot: string, descriptor: Json, sourceBundlePath: string): void {
  const evidenceRoot = join(cliRoot, "licenses", "ffmpeg-runtime");
  const evidence = readJson(join(evidenceRoot, "build-evidence.json"));
  const sourceOffer = readJson(join(evidenceRoot, "SOURCE_OFFER.json"));
  expect(evidence.contract_version === "1", "FFmpeg build evidence contract_version must be 1");
  expect(evidence.target?.os === "macos" && evidence.target?.arch === "aarch64", "FFmpeg build evidence target mismatch");
  const descriptorRevision = descriptor.artifact_generation?.source_revision;
  expect(evidence.source_revision === descriptorRevision || evidence.source_revision === `${descriptorRevision}-dirty`, "FFmpeg build evidence source_revision must match the Box descriptor provenance");
  expect(Array.isArray(evidence.build?.configure_args) && evidence.build.configure_args.length > 0, "FFmpeg build evidence must record configure arguments");
  const configure = evidence.build.configure_args.join(" ");
  for (const flag of ["--enable-gpl", "--enable-libx264", "--enable-libfreetype", "--enable-libharfbuzz"]) {
    expect(evidence.build.configure_args.includes(flag), `FFmpeg build evidence is missing ${flag}`);
  }
  expect(!configure.includes("--enable-nonfree"), "FFmpeg build evidence contains --enable-nonfree");
  for (const [key, label] of [
    ["gpl_enabled", "GPL mode"],
    ["nonfree_disabled", "nonfree-disabled mode"],
    ["libx264_enabled", "libx264"],
    ["libfreetype_enabled", "libfreetype"],
    ["libharfbuzz_enabled", "libharfbuzz"],
    ["drawtext_available", "drawtext"],
    ["only_system_dynamic_dependencies", "system-only dynamic dependencies"],
  ] as const) {
    expect(evidence.assertions?.[key] === true, `FFmpeg build evidence did not assert ${label}`);
  }

  const binaries = new Map((evidence.binaries ?? []).map((entry: Json) => [entry.path, entry]));
  for (const relativePath of ["bin/ffmpeg", "bin/ffprobe"]) {
    const path = join(cliRoot, "runtime", relativePath);
    const entry = binaries.get(relativePath) as Json | undefined;
    expect(Boolean(entry), `FFmpeg build evidence does not list ${relativePath}`);
    expect(entry!.size_bytes === nodeFs.statSync(path).size, `FFmpeg build evidence size mismatch for ${relativePath}`);
    expect(entry!.sha256 === sha256File(path), `FFmpeg build evidence digest mismatch for ${relativePath}`);
    expect(entry!.mode === "0755", `FFmpeg build evidence executable mode mismatch for ${relativePath}`);
    verifyOnlySystemDynamicDependencies(path);
  }
  const ffmpegPath = join(cliRoot, "runtime", "bin", "ffmpeg");
  expect(runtimeLockEntry(cliRoot, "runtime/bin/ffmpeg")?.sha256 === sha256File(ffmpegPath), "runtime lock ffmpeg digest does not match the packaged binary");
  expect(runtimeLockEntry(cliRoot, "runtime/bin/ffprobe")?.sha256 === sha256File(join(cliRoot, "runtime", "bin", "ffprobe")), "runtime lock ffprobe digest does not match the packaged binary");
  const versionOutput = run(ffmpegPath, ["-version"], cliRoot);
  for (const flag of ["--enable-gpl", "--disable-nonfree", "--enable-libx264", "--enable-libfreetype", "--enable-libharfbuzz"]) {
    expect(versionOutput.includes(flag), `packaged ffmpeg is missing ${flag}`);
  }
  expect(!versionOutput.includes("--enable-nonfree"), "packaged ffmpeg contains --enable-nonfree");
  const filters = run(ffmpegPath, ["-hide_banner", "-filters"], cliRoot);
  expect(/\bdrawtext\b/.test(filters), "packaged ffmpeg is missing drawtext");
  const encoders = run(ffmpegPath, ["-hide_banner", "-encoders"], cliRoot);
  for (const encoder of ["aac", "libx264"]) expect(new RegExp(`\\b${encoder}\\b`).test(encoders), `packaged ffmpeg is missing ${encoder}`);

  expect(nodeFs.existsSync(sourceBundlePath), `FFmpeg corresponding-source bundle is missing: ${sourceBundlePath}`);
  expect(evidence.source_bundle?.size_bytes === nodeFs.statSync(sourceBundlePath).size, "FFmpeg source bundle size does not match build evidence");
  expect(evidence.source_bundle?.sha256 === sha256File(sourceBundlePath), "FFmpeg source bundle digest does not match build evidence");
  expect(sourceOffer.artifact?.sha256 === evidence.source_bundle.sha256, "source offer does not bind the FFmpeg source bundle digest");
  const canonicalSourceUrl = `https://github.com/MarcusYuan/koubo-clip/releases/download/v${version}/koubo-clip-ffmpeg-sources-${version}.tar.xz`;
  expect(evidence.source_bundle?.url === canonicalSourceUrl, "FFmpeg build evidence does not identify the canonical same-release corresponding-source URL");
  expect(sourceOffer.artifact?.url === canonicalSourceUrl, "source offer does not bind the corresponding-source URL");
  expect(sourceOffer.artifact?.size_bytes === evidence.source_bundle.size_bytes, "source offer does not bind the corresponding-source size");
  expect(sourceOffer.contract_version === "1" && sourceOffer.version === version && sourceOffer.source_revision === descriptorRevision, "FFmpeg source offer delivery identity mismatch");
  expect(canonicalJson(sourceOffer.artifact) === canonicalJson({ url: canonicalSourceUrl, size_bytes: evidence.source_bundle.size_bytes, sha256: evidence.source_bundle.sha256 }), "FFmpeg source offer does not bind the exact corresponding-source asset");
  const licenses = licenseEntriesFromEvidence(evidence, readJson(join(evidenceRoot, "source-lock.json")));
  verifyExactLicensePayload(evidenceRoot, sourceBundlePath, licenses);
  verifyLicenseMutationFailures(join(evidenceRoot, "licenses"), sourceBundlePath, licenses);
}

function licenseEntriesFromEvidence(evidence: Json, sourceLock: Json): Map<string, LicenseEntry> {
  const declaredPaths = new Set<string>();
  expect(Array.isArray(sourceLock.sources), "packaged FFmpeg source lock is missing sources[]");
  for (const source of sourceLock.sources as Json[]) {
    expect(typeof source.id === "string" && Array.isArray(source.license_files), "packaged FFmpeg source lock has incomplete license declarations");
    for (const path of source.license_files) {
      expect(isSafeBoxRelativePath(`${source.id}/${path}`), `packaged FFmpeg source lock has unsafe license path ${source.id}/${path}`);
      const declaredPath = `${source.id}/${path}`;
      expect(!declaredPaths.has(declaredPath), `packaged FFmpeg source lock contains duplicate license path ${declaredPath}`);
      declaredPaths.add(declaredPath);
    }
  }
  expect(Array.isArray(evidence.license_evidence), "FFmpeg build evidence is missing license_evidence[]");
  const entries = new Map<string, LicenseEntry>();
  for (const raw of evidence.license_evidence as Json[]) {
    expectExactKeys(raw, ["path", "size_bytes", "sha256", "mode"], "FFmpeg license evidence entry");
    expect(typeof raw.path === "string" && raw.path.startsWith("evidence/licenses/"), "FFmpeg license evidence path must be below evidence/licenses/");
    const path = raw.path.slice("evidence/licenses/".length);
    expect(isSafeBoxRelativePath(path) && raw.path === `evidence/licenses/${path}`, `FFmpeg license evidence contains unsafe or non-normalized path ${raw.path}`);
    expect(!entries.has(path), `FFmpeg license evidence contains duplicate path ${path}`);
    expect(Number.isInteger(raw.size_bytes) && raw.size_bytes > 0, `FFmpeg license evidence size is invalid for ${path}`);
    expect(/^[a-f0-9]{64}$/.test(raw.sha256), `FFmpeg license evidence SHA-256 is invalid for ${path}`);
    expect(raw.mode === "0644", `FFmpeg license evidence mode must be 0644 for ${path}`);
    entries.set(path, raw as LicenseEntry);
  }
  expect(entries.size === declaredPaths.size && [...declaredPaths].every((path) => entries.has(path)), "FFmpeg license evidence must exactly match the source-lock license paths");
  return entries;
}

function verifyExactLicensePayload(evidenceRoot: string, sourceBundlePath: string, expected: Map<string, LicenseEntry>): void {
  const unpack = nodeFs.mkdtempSync(join(tmpdir(), "koubo-box-license-source-"));
  try {
    const listing = run("tar", ["-tJf", sourceBundlePath], root).split(/\r?\n/).filter(Boolean);
    expect(listing.length > 0 && listing.every(isSafeArchiveEntry), "FFmpeg source bundle contains an unsafe path");
    expect(new Set(listing).size === listing.length, "FFmpeg source bundle contains duplicate paths");
    const verbose = run("tar", ["-tvJf", sourceBundlePath], root).split(/\r?\n/).filter(Boolean);
    expect(verbose.length === listing.length && verbose.every((line) => line.startsWith("-") || line.startsWith("d")), "FFmpeg source bundle may contain only regular files and directories");
    run("tar", ["-xJf", sourceBundlePath, "-C", unpack], root);
    const bundleRoot = singleDir(unpack, "koubo-clip-ffmpeg-sources-");
    const runtimeLicenses = join(evidenceRoot, "licenses");
    const sourceLicenses = join(bundleRoot, "licenses");
    verifyLicenseDirectory(runtimeLicenses, expected, "CLI runtime license payload");
    verifyLicenseDirectory(sourceLicenses, expected, "corresponding-source license payload");
    verifyLicenseBytesMatch(runtimeLicenses, sourceLicenses, expected);
  } finally {
    nodeFs.rmSync(unpack, { recursive: true, force: true });
  }
}

function verifyLicenseMutationFailures(runtimeLicenses: string, sourceBundlePath: string, expected: Map<string, LicenseEntry>): void {
  const sourceUnpack = nodeFs.mkdtempSync(join(tmpdir(), "koubo-box-license-mutations-source-"));
  try {
    run("tar", ["-xJf", sourceBundlePath, "-C", sourceUnpack], root);
    const sourceLicenses = join(singleDir(sourceUnpack, "koubo-clip-ffmpeg-sources-"), "licenses");
    const firstPath = expected.keys().next().value as string | undefined;
    expect(Boolean(firstPath), "license mutation tests require at least one license file");
    const cases: Array<{ label: string; mutate(runtime: string, source: string): void }> = [
      { label: "extra CLI license", mutate: (runtime) => nodeFs.writeFileSync(join(runtime, "unexpected-license.txt"), "unexpected\n") },
      { label: "missing CLI license", mutate: (runtime) => nodeFs.rmSync(join(runtime, firstPath!)) },
      { label: "tampered CLI license", mutate: (runtime) => appendFile(join(runtime, firstPath!), "\ntampered\n") },
      { label: "extra source license", mutate: (_runtime, source) => nodeFs.writeFileSync(join(source, "unexpected-license.txt"), "unexpected\n") },
      { label: "missing source license", mutate: (_runtime, source) => nodeFs.rmSync(join(source, firstPath!)) },
      { label: "tampered source license", mutate: (_runtime, source) => appendFile(join(source, firstPath!), "\ntampered\n") },
    ];
    for (const testCase of cases) {
      const caseRoot = nodeFs.mkdtempSync(join(tmpdir(), "koubo-box-license-mutation-"));
      try {
        const runtimeCopy = join(caseRoot, "runtime");
        const sourceCopy = join(caseRoot, "source");
        nodeFs.cpSync(runtimeLicenses, runtimeCopy, { recursive: true });
        nodeFs.cpSync(sourceLicenses, sourceCopy, { recursive: true });
        testCase.mutate(runtimeCopy, sourceCopy);
        expectThrows(() => {
          verifyLicenseDirectory(runtimeCopy, expected, "mutated CLI runtime license payload");
          verifyLicenseDirectory(sourceCopy, expected, "mutated corresponding-source license payload");
          verifyLicenseBytesMatch(runtimeCopy, sourceCopy, expected);
        }, `license mutation was not rejected: ${testCase.label}`);
      } finally {
        nodeFs.rmSync(caseRoot, { recursive: true, force: true });
      }
    }
  } finally {
    nodeFs.rmSync(sourceUnpack, { recursive: true, force: true });
  }
}

function verifyLicenseDirectory(directory: string, expected: Map<string, LicenseEntry>, label: string): void {
  expect(nodeFs.existsSync(directory) && nodeFs.statSync(directory).isDirectory(), `${label} directory is missing`);
  const files = walkFiles(directory);
  expect(files.length === expected.size, `${label} has an extra or missing file`);
  const actual = new Set<string>();
  for (const file of files) {
    const path = relative(directory, file).replaceAll("\\", "/");
    expect(isSafeBoxRelativePath(path) && !actual.has(path), `${label} contains unsafe or duplicate path ${path}`);
    actual.add(path);
    const entry = expected.get(path);
    expect(Boolean(entry), `${label} contains undeclared file ${path}`);
    expect(nodeFs.statSync(file).size === entry!.size_bytes, `${label} size mismatch for ${path}`);
    expect(sha256File(file) === entry!.sha256, `${label} SHA-256 mismatch for ${path}`);
    expect((((nodeFs as any).statSync(file).mode as number) & 0o777) === 0o644, `${label} mode mismatch for ${path}`);
  }
  expect([...expected.keys()].every((path) => actual.has(path)), `${label} is missing a declared license file`);
}

function verifyLicenseBytesMatch(runtimeLicenses: string, sourceLicenses: string, expected: Map<string, LicenseEntry>): void {
  for (const path of expected.keys()) {
    expect(sha256File(join(runtimeLicenses, path)) === sha256File(join(sourceLicenses, path)), `CLI runtime and corresponding-source license bytes differ for ${path}`);
  }
}

function expectThrows(action: () => void, message: string): void {
  let threw = false;
  try { action(); } catch { threw = true; }
  expect(threw, message);
}

function isSafeArchiveEntry(path: string): boolean {
  const normalized = path.endsWith("/") ? path.slice(0, -1) : path;
  return normalized.length > 0 && isSafeBoxRelativePath(normalized);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function verifyOnlySystemDynamicDependencies(binaryPath: string): void {
  const output = run("otool", ["-L", binaryPath], root);
  const dependencies = output.split(/\r?\n/).slice(1).map((line) => line.trim().split(" (")[0]).filter(Boolean);
  expect(dependencies.length > 0, `otool did not report dynamic dependencies for ${binaryPath}`);
  for (const dependency of dependencies) {
    expect(dependency.startsWith("/usr/lib/") || dependency.startsWith("/System/Library/"), `FFmpeg runtime has a non-system dynamic dependency: ${dependency}`);
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

function verifyFinalPackagedBrowserRuntime(cliRoot: string, cwd: string): Json {
  const runtimeBin = join(cliRoot, "runtime", "bin");
  const hyperframes = join(runtimeBin, "hyperframes");
  const browserLauncher = join(runtimeBin, "chrome-headless-shell");
  const browserBinary = join(cliRoot, "runtime", "browser", "chrome-headless-shell", "mac_arm-131.0.6778.85", "chrome-headless-shell-mac-arm64", "chrome-headless-shell");
  const ffprobe = join(runtimeBin, "ffprobe");
  const workspace = join(cwd, "真实 render 'single' \"double\" 中文");
  const output = join(workspace, "smoke.mp4");
  nodeFs.mkdirSync(workspace, { recursive: true });
  nodeFs.writeFileSync(join(workspace, "index.html"), packagedHyperframesSmokeHtml());

  const browserVersion = runPackageRuntime(browserLauncher, ["--version"], cwd, runtimeBin);
  expect(browserVersion.status === 0 && /HeadlessChrome|Chrome/i.test(browserVersion.stdout), `packaged browser wrapper failed from a special-character install path with package-only PATH: ${browserVersion.stderr || browserVersion.stdout}`);
  const fromPath = runPackageRuntime("/bin/sh", ["-c", "exec hyperframes --help"], cwd, runtimeBin);
  expect(fromPath.status === 0 && fromPath.stdout.includes("hyperframes"), "packaged HyperFrames lookup via package-only PATH failed");
  const fromRelativePath = runPackageRuntime(join(".", relative(cwd, browserLauncher)), ["--version"], cwd, runtimeBin);
  expect(fromRelativePath.status === 0, "packaged browser relative-path invocation failed");

  const lint = runPackageRuntime(hyperframes, ["lint", "."], workspace, runtimeBin);
  expect(lint.status === 0, `packaged HyperFrames lint failed: ${lint.stderr || lint.stdout}`);
  const validate = runPackageRuntime(hyperframes, ["validate", ".", "--json", "--no-contrast", "--timeout", "1000"], workspace, runtimeBin);
  expect(validate.status === 0, `packaged HyperFrames validate failed: ${validate.stderr || validate.stdout}`);
  expectValidJsonOutput(validate.stdout, "packaged HyperFrames validate");
  const render = runPackageRuntime(hyperframes, ["render", ".", "--format", "mp4", "--output", output, "--fps", "10", "--quality", "draft", "--workers", "1", "--no-browser-gpu"], workspace, runtimeBin, 180_000);
  expect(render.status === 0, `packaged HyperFrames render failed: ${render.stderr || render.stdout}`);
  expect(nodeFs.existsSync(output) && nodeFs.statSync(output).size > 0, "packaged HyperFrames render did not create an MP4 artifact");
  const inspect = runPackageRuntime(hyperframes, ["inspect", ".", "--json", "--strict", "--at", "0,0.1,0.2"], workspace, runtimeBin);
  expect(inspect.status === 0, `packaged HyperFrames inspect failed: ${inspect.stderr || inspect.stdout}`);
  expectValidJsonOutput(inspect.stdout, "packaged HyperFrames inspect");

  const probe = runPackageRuntime(ffprobe, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,width,height", "-show_entries", "format=duration", "-of", "json", output], workspace, runtimeBin);
  expect(probe.status === 0, `packaged ffprobe could not inspect the HyperFrames artifact: ${probe.stderr || probe.stdout}`);
  const probeJson = expectValidJsonOutput(probe.stdout, "packaged ffprobe");
  expect(probeJson.streams?.[0]?.codec_name === "h264", "packaged HyperFrames smoke output is not H.264");
  expect(probeJson.streams?.[0]?.width === 160 && probeJson.streams?.[0]?.height === 90, "packaged HyperFrames smoke dimensions are not 160x90");
  expect(Number(probeJson.format?.duration) > 0, "packaged HyperFrames smoke duration is not positive");

  const browserBackup = `${browserBinary}.missing-test`;
  rename(browserBinary, browserBackup);
  try {
    const missing = runPackageRuntime(browserLauncher, ["--version"], cwd, runtimeBin);
    expect(missing.status === 126, `missing packaged browser runtime must fail with exit 126, got ${missing.status}`);
    expect(missing.stderr.trim() === "koubo-clip: managed Chrome Headless Shell runtime is missing or not executable", "missing packaged browser runtime did not produce the stable fail-closed diagnostic");
  } finally {
    rename(browserBackup, browserBinary);
  }
  const runtimeManifest = join(cliRoot, "runtime", "hyperframe.manifest.json");
  rename(runtimeManifest, `${runtimeManifest}.missing-test`);
  try {
    const missing = runPackageRuntime(hyperframes, ["render", ".", "--output", join(workspace, "must-not-exist.mp4")], workspace, runtimeBin);
    expect(missing.status === 126 && missing.stderr.trim() === "koubo-clip: managed HyperFrames manifest is missing", "missing packaged HyperFrames manifest must fail before cwd lookup or rendering");
    expect(!nodeFs.existsSync(join(workspace, "must-not-exist.mp4")), "missing runtime manifest unexpectedly created an output");
  } finally {
    rename(`${runtimeManifest}.missing-test`, runtimeManifest);
  }

  return {
    status: "passed",
    package_only_path: true,
    arbitrary_cwd: true,
    special_character_install_path: true,
    browser_version: browserVersion.stdout.trim(),
    hyperframes_lint: "passed",
    hyperframes_validate: "passed",
    hyperframes_render: "passed",
    hyperframes_inspect: "passed",
    missing_browser_exit_code: 126,
    missing_hyperframes_manifest_exit_code: 126,
    artifact: {
      format: "mp4",
      codec: "h264",
      width: 160,
      height: 90,
      duration_seconds: Number(probeJson.format.duration),
      size_bytes: nodeFs.statSync(output).size,
      sha256: sha256File(output),
    },
  };
}

function packagedHyperframesSmokeHtml(): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body { margin: 0; width: 160px; height: 90px; overflow: hidden; background: #111827; }
      #stage { position: relative; width: 160px; height: 90px; overflow: hidden; color: #ffffff; background: #111827; }
      #label { position: absolute; inset: 18px 12px; display: grid; place-items: center; border: 2px solid #38bdf8; font: 700 12px system-ui, sans-serif; }
    </style>
  </head>
  <body>
    <main id="stage" data-composition-id="smoke" data-start="0" data-duration="0.3" data-width="160" data-height="90">
      <div id="label" class="clip" data-start="0" data-duration="0.3" data-track-index="1">Koubo Clip</div>
    </main>
    <script>
      window.__timelines = window.__timelines || {};
      const duration = 0.3;
      let currentTime = 0;
      const timeline = {
        seek(value) { currentTime = Math.max(0, Math.min(duration, Number(value) || 0)); return timeline; },
        pause() { return timeline; },
        play() { return timeline; },
        time() { return currentTime; },
        duration() { return duration; },
        totalDuration() { return duration; },
        progress(value) { return timeline.seek((Number(value) || 0) * duration); }
      };
      window.__timelines.smoke = timeline;
    </script>
  </body>
</html>
`;
}

function runPackageRuntime(command: string, args: string[], cwd: string, runtimeBin: string, timeout = 60_000): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, PATH: runtimeBin, HYPERFRAMES_NO_TELEMETRY: "1", DO_NOT_TRACK: "1", PRODUCER_HEADLESS_SHELL_PATH: join(runtimeBin, "chrome-headless-shell"), HYPERFRAMES_BROWSER_PATH: join(runtimeBin, "chrome-headless-shell") },
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout,
  });
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "runtime process did not complete" };
}

function expectValidJsonOutput(output: string, label: string): Json {
  try {
    return JSON.parse(output.trim()) as Json;
  } catch {
    throw new Error(`${label} did not write valid JSON: ${output.slice(0, 300)}`);
  }
}

function verifyNoHostFallbackForRenderAndAsr(cliRoot: string, cli: string, cwd: string): void {
  const hostileBin = join(cwd, "host-runtime-sentinels");
  nodeFs.mkdirSync(hostileBin, { recursive: true });
  for (const name of ["ffmpeg", "ffprobe"]) {
    const sentinel = join(hostileBin, name);
    nodeFs.writeFileSync(sentinel, "#!/bin/sh\nexit 0\n");
    chmod(sentinel, 0o755);
  }
  const hostileEnv = { PATH: `${hostileBin}:${process.env.PATH ?? ""}` };
  const source = join(cwd, "asr-source.mp4");
  const project = join(cwd, "asr-project");
  makeVideo(source, join(cliRoot, "runtime", "bin", "ffmpeg"));
  const created = runCliJson(cli, ["project", "create", source, "--project", project, "--json"], cwd, hostileEnv);
  expect(created.status === 0 && created.json.ok === true, "failed to create Box fallback-test project while runtime was healthy");

  const ffmpeg = join(cliRoot, "runtime", "bin", "ffmpeg");
  const backup = `${ffmpeg}.bak`;
  rename(ffmpeg, backup);
  try {
    const renderSmoke = runCliJson(cli, ["test", "--json"], cwd, hostileEnv);
    expect(renderSmoke.status !== 0 && renderSmoke.json.ok === false, "Box render smoke unexpectedly succeeded after managed ffmpeg was removed");
    expect(renderSmoke.json.error?.code === "MANAGED_RUNTIME_FILE_MISSING", "Box render smoke did not fail at the managed runtime guard after ffmpeg removal");

    const asrPrepare = runCliJsonResult(cli, ["project", "asr-prepare", project, "--output", "asr-upload", "--json"], cwd, hostileEnv);
    expect(asrPrepare.status !== 0 && asrPrepare.json.ok === false, "Box external ASR prepare unexpectedly succeeded after managed ffmpeg was removed");
    expect(asrPrepare.json.error?.code === "MANAGED_RUNTIME_FILE_MISSING", "Box external ASR prepare did not fail at the managed runtime guard after ffmpeg removal");
  } finally {
    rename(backup, ffmpeg);
  }

  const original = nodeFs.readFileSync(ffmpeg);
  appendFile(ffmpeg, "\n# digest tamper\n");
  try {
    const asrPrepare = runCliJsonResult(cli, ["project", "asr-prepare", project, "--output", "asr-upload-tampered", "--json"], cwd, hostileEnv);
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

function makeVideo(path: string, ffmpeg = "ffmpeg"): void {
  const result = spawnSync(ffmpeg, [
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
  verifySkillPayloadDirectory(payloadRoot, descriptor.files);
  verifySkillPayloadSet(payloadRoot, descriptor.files);
  const listed = new Set((descriptor.files ?? []).map((entry: Json) => entry.path));
  for (const required of ["SKILL.md"]) expect(listed.has(required), `skill.box.json does not list ${required}`);
  for (const topLevel of ["agents", "references"]) {
    expect((descriptor.files ?? []).some((entry: Json) => String(entry.path).startsWith(`${topLevel}/`)), `skill.box.json does not list ${topLevel}/ payload files`);
  }
  const dependency = descriptor.cli_dependencies?.[0];
  expect(dependency?.id === "koubo-clip" && dependency.version === version, `Box Skill must depend on koubo-clip ${version}`);
  for (const command of ["doctor", "test", "render-contract render"]) {
    expect(dependency.commands.includes(command), `Box Skill dependency is missing ${command}`);
  }
}

function verifyCliDescriptorStrict(descriptor: Json, cliTarballPath: string): void {
  expect(descriptor.manifest_version === "3", "CLI manifest_version must be 3");
  expect(descriptor.id === "koubo-clip", "CLI id must be koubo-clip");
  expect(typeof descriptor.name === "string" && descriptor.name.length > 0, "CLI name is required");
  expect(descriptor.version === version, "CLI version mismatch");
  expect(descriptor.publisher === "MarcusYuan", "CLI publisher must be MarcusYuan");
  expect(descriptor.target?.os === "darwin" && descriptor.target?.arch === "arm64" && descriptor.target?.minimum_os_version === "14.0", "CLI target must be darwin/arm64 with minimum macOS 14.0");
  expect(descriptor.executable === "bin/koubo-clip", "CLI executable must be bin/koubo-clip");
  expect(descriptor.artifact_generation?.profile === "verified-upstream-runtime-bundle.v1", "CLI artifact generation profile mismatch");
  expect(descriptor.artifact_generation?.source_revision && /^[a-f0-9]{40}$/.test(descriptor.artifact_generation.source_revision), "CLI artifact generation must bind an exact source revision");
  expectPresentation(descriptor.presentation, "CLI presentation");
  expect(JSON.stringify(descriptor.machine_output) === JSON.stringify({ format: "json", encoding: "utf-8" }), "CLI machine_output shape mismatch");
  expect(JSON.stringify(descriptor.health_check) === JSON.stringify({ args: ["doctor", "--json"] }), "CLI health_check shape mismatch");
  expectPermissionShape(descriptor.permissions, "CLI permissions");
  expectDataPolicyShape(descriptor.data_policy, "CLI data_policy");
  expect(!("artifacts" in descriptor), "CLI manifest v3 must not embed outer artifact identity");
  expect(nodeFs.statSync(cliTarballPath).size > 0, "Box CLI archive must not be empty");
}

function verifySkillDescriptorStrict(descriptor: Json): void {
  verifySkillManifestV3(descriptor);
  expect(descriptor.manifest_version === "3", "Skill manifest_version must be 3");
  expect(descriptor.id === "koubo-clip", "Skill id must be koubo-clip");
  expect(typeof descriptor.name === "string" && descriptor.name.length > 0, "Skill name is required");
  expect(typeof descriptor.description === "string" && descriptor.description.length > 0, "Skill description is required");
  expect(descriptor.entrypoint === "SKILL.md", "Skill entrypoint must be SKILL.md");
  expect(descriptor.version === version, "Skill version mismatch");
  expect(descriptor.managed_cli_entry_contract === "box-home-bin.v1", "Skill must use box-home-bin.v1");
  expectPresentation(descriptor.presentation, "Skill presentation");
  expectPermissionShape(descriptor.permissions, "Skill permissions");
  expectDataPolicyShape(descriptor.data_policy, "Skill data_policy");
  expect(descriptor.source?.kind === "box_cloud" && descriptor.source?.publisher === "MarcusYuan", "Skill source must identify Box Cloud and the upstream publisher");
  const dependency = descriptor.cli_dependencies?.[0];
  expect(dependency?.id === "koubo-clip" && dependency.version === version && dependency.required === true, `Box Skill must require koubo-clip ${version}`);
  for (const key of ["artifacts", "root", "publisher"]) {
    expect(!(key in descriptor), `Skill descriptor must not include legacy key ${key}`);
  }
  for (const command of dependency.commands) {
    expect(!command.startsWith("koubo-clip ") && !command.includes(" --"), `Skill dependency command must be a bare subcommand or command prefix: ${command}`);
  }
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

function expectPresentation(value: Json | undefined, label: string): void {
  expect(value?.default_locale === "en", `${label}.default_locale must be en`);
  for (const locale of ["en", "zh-CN"]) {
    expect(typeof value?.localizations?.[locale]?.display_name === "string" && value.localizations[locale].display_name.length > 0, `${label} is missing ${locale} display_name`);
    expect(typeof value?.localizations?.[locale]?.short_description === "string" && value.localizations[locale].short_description.length > 0, `${label} is missing ${locale} short_description`);
  }
}

function runtimeLockEntry(cliRoot: string, path: string): Json | undefined {
  const lock = readJson(join(cliRoot, "runtime-lock.json"));
  return Array.isArray(lock.files) ? lock.files.find((entry: Json) => entry.path === path) : undefined;
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
