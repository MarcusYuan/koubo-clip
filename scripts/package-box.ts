import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import * as nodeFs from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeCliPayloadDigest,
  computeDeliveryDigest,
  computeDeliveryFileSetDigest,
  computeOfficialSkillDigest,
  computeRendererResourcesDigest,
  computeRuntimeCompatibilityDigest,
} from "../packages/cli/src/delivery-identity";
import { artifactContractsDigest } from "../packages/cli/src/artifact-contracts";

type Json = Record<string, any>;
type FileEntry = { path: string; size: number; sha256: string };
type Target = { os: "darwin"; arch: "arm64"; tag: "darwin-arm64" };

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const version = packageVersion();
const sourceRevision = process.env.KOUBO_CLIP_SOURCE_REVISION ?? gitRevision();
const outputDir = resolve(process.argv[2] ?? join(root, "dist", "box"));
const target = parseTarget(process.env.KOUBO_BOX_TARGET ?? `${(process as any).platform}-${(process as any).arch}`);
const lock = readJson(join(root, "box-runtime.lock.json"));
const staging = nodeFs.mkdtempSync(join(tmpdir(), "koubo-box-package-"));

try {
  assertVersion();
  assertLockTarget(lock, target);
  const inputs = resolveInputs(lock);
  const cliRoot = join(staging, `koubo-clip-box-cli-${version}-${target.tag}`);
  const skillRoot = join(staging, `koubo-clip-box-skill-${version}`);
  nodeFs.mkdirSync(cliRoot, { recursive: true });
  nodeFs.mkdirSync(skillRoot, { recursive: true });

  stageCliPackage(cliRoot, inputs);
  stageSkillPackage(skillRoot);

  writeInstalledRuntimeLock(cliRoot);
  const cliManifest = writeDeliveryManifest(cliRoot, "box-cli");
  const runtimeDigest = computeDeliveryFileSetDigest({ root: cliRoot, files: ["runtime-lock.json"] }).digest;
  const cliTarball = archive(cliRoot, join(outputDir, `koubo-clip-box-cli-${version}-${target.tag}.tgz`));
  const skillTarball = archive(skillRoot, join(outputDir, `koubo-clip-box-skill-${version}.tgz`));
  const skillDigest = computeOfficialSkillDigest({ root: join(root, "skills", "koubo-clip") }).digest;

  const cliDescriptor = makeCliDescriptor({
    cliTarball,
    cliManifest,
    runtimeDigest,
    inputs,
  });
  const skillDescriptor = makeSkillDescriptor({
    skillRoot,
    skillTarball,
    cliTarball,
    cliManifest,
    skillDigest,
  });
  writeJson(join(outputDir, "cli-package.box.json"), cliDescriptor);
  writeJson(join(outputDir, "skill.box.json"), skillDescriptor);
  writeJson(join(root, "cli-package.box.json"), cliDescriptor);
  writeJson(join(root, "skill.box.json"), skillDescriptor);

  const metadata = {
    ok: true,
    version,
    source_revision: sourceRevision,
    target: target.tag,
    cli_package: artifactIdentity(cliTarball),
    skill_package: artifactIdentity(skillTarball),
    cli_descriptor: artifactIdentity(join(outputDir, "cli-package.box.json")),
    skill_descriptor: artifactIdentity(join(outputDir, "skill.box.json")),
  };
  writeJson(join(outputDir, `koubo-clip-box-${version}.metadata.json`), metadata);
  console.log(JSON.stringify(metadata));
} finally {
  nodeFs.rmSync(staging, { recursive: true, force: true });
}

function stageCliPackage(packageRoot: string, inputs: ReturnType<typeof resolveInputs>): void {
  nodeFs.mkdirSync(join(packageRoot, "bin"), { recursive: true });
  nodeFs.mkdirSync(join(packageRoot, "runtime", "bin"), { recursive: true });
  nodeFs.mkdirSync(join(packageRoot, "runtime", "node_modules"), { recursive: true });
  nodeFs.mkdirSync(join(packageRoot, "runtime", "browser", "chrome-headless-shell", "mac_arm-131.0.6778.85"), { recursive: true });
  nodeFs.mkdirSync(join(packageRoot, "resources"), { recursive: true });
  nodeFs.mkdirSync(join(packageRoot, "licenses", "ffmpeg-ffprobe-static"), { recursive: true });

  const launcher = join(packageRoot, ".box-launcher.ts");
  nodeFs.writeFileSync(launcher, boxLauncherSource());
  run("bun", [
    "build",
    launcher,
    "--compile",
    "--target=bun",
    "--define",
    `KOUBO_CLIP_BUILD_VERSION="${version}"`,
    "--define",
    'KOUBO_CLIP_DISTRIBUTION_KIND="box-cli"',
    "--outfile",
    join(packageRoot, "bin", "koubo-clip-runtime"),
  ], root);
  nodeFs.rmSync(launcher, { force: true });
  nodeFs.writeFileSync(join(packageRoot, "bin", "koubo-clip"), boxShellLauncherSource());
  chmod(join(packageRoot, "bin", "koubo-clip"), 0o755);
  chmod(join(packageRoot, "bin", "koubo-clip-runtime"), 0o755);

  nodeFs.copyFileSync(inputs.bun, join(packageRoot, "runtime", "bin", "bun"));
  nodeFs.copyFileSync(inputs.ffmpeg, join(packageRoot, "runtime", "bin", "ffmpeg"));
  nodeFs.copyFileSync(inputs.ffprobe, join(packageRoot, "runtime", "bin", "ffprobe"));
  for (const file of ["bun", "ffmpeg", "ffprobe"]) chmod(join(packageRoot, "runtime", "bin", file), 0o755);
  for (const file of ["LICENSE", "ffmpeg.README", "README.md"]) {
    nodeFs.copyFileSync(join(root, "node_modules", "ffmpeg-ffprobe-static", file), join(packageRoot, "licenses", "ffmpeg-ffprobe-static", file));
  }

  run("bun", [
    "build",
    join(root, "node_modules", "hyperframes", "dist", "cli.js"),
    "--target=bun",
    "--external=@hyperframes/aws-lambda/sdk",
    "--external=@hyperframes/gcp-cloud-run/sdk",
    "--external=sharp",
    "--external=detect-libc",
    "--external=semver",
    "--external=@img/colour",
    "--external=@img/sharp-darwin-arm64",
    "--external=@img/sharp-libvips-darwin-arm64",
    "--outfile",
    join(packageRoot, "runtime", "hyperframes.js"),
  ], root);
  nodeFs.writeFileSync(
    join(packageRoot, "runtime", "bin", "hyperframes"),
    [
      "#!/bin/sh",
      "set -eu",
      "DIR=$(CDPATH= cd -- \"$(dirname -- \"$0\")\" && pwd)",
      "ROOT=$(CDPATH= cd -- \"$DIR/..\" && pwd)",
      "export HYPERFRAMES_FFMPEG_PATH=\"$DIR/ffmpeg\"",
      "export HYPERFRAMES_FFPROBE_PATH=\"$DIR/ffprobe\"",
      "export PRODUCER_HEADLESS_SHELL_PATH=\"${PRODUCER_HEADLESS_SHELL_PATH:-$DIR/chrome-headless-shell}\"",
      "export HYPERFRAMES_BROWSER_PATH=\"${HYPERFRAMES_BROWSER_PATH:-$PRODUCER_HEADLESS_SHELL_PATH}\"",
      "exec \"$DIR/bun\" \"$ROOT/hyperframes.js\" \"$@\"",
      "",
    ].join("\n"),
  );
  chmod(join(packageRoot, "runtime", "bin", "hyperframes"), 0o755);

  copyRuntimeNodeModules(packageRoot, [
    "sharp",
    "detect-libc",
    "semver",
    "@img/colour",
    "@img/sharp-darwin-arm64",
    "@img/sharp-libvips-darwin-arm64",
  ]);
  nodeFs.cpSync(inputs.browserRoot, join(packageRoot, "runtime", "browser", "chrome-headless-shell", "mac_arm-131.0.6778.85", "chrome-headless-shell-mac-arm64"), { recursive: true });
  nodeFs.writeFileSync(
    join(packageRoot, "runtime", "bin", "chrome-headless-shell"),
    [
      "#!/bin/sh",
      "set -eu",
      "DIR=$(CDPATH= cd -- \"$(dirname -- \"$0\")\" && pwd)",
      "ROOT=$(CDPATH= cd -- \"$DIR/..\" && pwd)",
      "exec \"$ROOT/browser/chrome-headless-shell/mac_arm-131.0.6778.85/chrome-headless-shell-mac-arm64/chrome-headless-shell\" --disable-audio-output \"$@\"",
      "",
    ].join("\n"),
  );
  chmod(join(packageRoot, "runtime", "bin", "chrome-headless-shell"), 0o755);
  nodeFs.cpSync(join(root, "packages", "cli", "vendor", "hyperframes"), join(packageRoot, "resources", "hyperframes"), { recursive: true });
  writeJson(join(packageRoot, "package.json"), {
    name: "koubo-clip-box-cli",
    version,
    private: true,
    type: "module",
    bin: { "koubo-clip": "bin/koubo-clip" },
  });

  assertNoPath(packageRoot, "skills/koubo-clip");
  assertNoSymlinks(packageRoot);
}

function stageSkillPackage(packageRoot: string): void {
  nodeFs.mkdirSync(join(packageRoot, "skills"), { recursive: true });
  nodeFs.cpSync(join(root, "skills", "koubo-clip"), join(packageRoot, "skills", "koubo-clip"), { recursive: true });
  assertNoSymlinks(packageRoot);
}

function boxLauncherSource(): string {
  const cliSource = JSON.stringify(join(root, "packages", "cli", "src", "cli.ts"));
  return [
    "import { dirname, join, resolve } from 'node:path';",
    "const packageRoot = resolve(dirname(process.execPath), '..');",
    "const runtimeBin = join(packageRoot, 'runtime', 'bin');",
    "const browser = join(runtimeBin, 'chrome-headless-shell');",
    "process.env.KOUBO_CLIP_DISTRIBUTION_ROOT = packageRoot;",
    "process.env.KOUBO_CLIP_HYPERFRAMES_ROOT = join(packageRoot, 'resources', 'hyperframes');",
    "process.env.KOUBO_CLIP_HYPERFRAMES_BIN = join(runtimeBin, 'hyperframes');",
    "process.env.HYPERFRAMES_FFMPEG_PATH = join(runtimeBin, 'ffmpeg');",
    "process.env.HYPERFRAMES_FFPROBE_PATH = join(runtimeBin, 'ffprobe');",
    "process.env.PRODUCER_HEADLESS_SHELL_PATH = browser;",
    "process.env.HYPERFRAMES_BROWSER_PATH = browser;",
    "process.env.PATH = runtimeBin;",
    `const { main } = await import(${cliSource});`,
    "try { process.exitCode = await main(); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }",
    "",
  ].join("\n");
}

function boxShellLauncherSource(): string {
  return [
    "#!/bin/sh",
    "set -eu",
    "BIN_DIR=$(CDPATH= cd -- \"$(dirname -- \"$0\")\" && pwd)",
    "PACKAGE_ROOT=$(CDPATH= cd -- \"$BIN_DIR/..\" && pwd)",
    "RUNTIME_BIN=\"$PACKAGE_ROOT/runtime/bin\"",
    "BROWSER=\"$RUNTIME_BIN/chrome-headless-shell\"",
    "export PATH=\"$RUNTIME_BIN:/usr/bin:/bin\"",
    "export KOUBO_CLIP_DISTRIBUTION_ROOT=\"$PACKAGE_ROOT\"",
    "export KOUBO_CLIP_HYPERFRAMES_ROOT=\"$PACKAGE_ROOT/resources/hyperframes\"",
    "export KOUBO_CLIP_HYPERFRAMES_BIN=\"$RUNTIME_BIN/hyperframes\"",
    "export HYPERFRAMES_FFMPEG_PATH=\"$RUNTIME_BIN/ffmpeg\"",
    "export HYPERFRAMES_FFPROBE_PATH=\"$RUNTIME_BIN/ffprobe\"",
    "export PRODUCER_HEADLESS_SHELL_PATH=\"$BROWSER\"",
    "export HYPERFRAMES_BROWSER_PATH=\"$BROWSER\"",
    "exec \"$BIN_DIR/koubo-clip-runtime\" \"$@\"",
    "",
  ].join("\n");
}

function copyRuntimeNodeModules(packageRoot: string, names: string[]): void {
  for (const name of names) {
    const source = join(root, "node_modules", ...name.split("/"));
  if (!nodeFs.existsSync(source)) throw new Error(`required HyperFrames runtime package is missing: ${name}`);
    const target = join(packageRoot, "runtime", "node_modules", ...name.split("/"));
    nodeFs.mkdirSync(dirname(target), { recursive: true });
    nodeFs.cpSync(source, target, { recursive: true });
  }
}

function writeInstalledRuntimeLock(packageRoot: string): void {
  const files = listFileEntries(packageRoot)
    .filter((entry) => (
      entry.path.startsWith("bin/")
      || entry.path.startsWith("runtime/")
      || entry.path.startsWith("licenses/")
      || entry.path.startsWith("resources/hyperframes/")
      || entry.path === "package.json"
    ))
    .map((entry) => ({
      path: entry.path,
      size: entry.size,
      sha256: entry.sha256.replace(/^sha256:/, ""),
      role: runtimeRole(entry.path),
      ...(isRuntimeExecutable(entry.path) ? { executable: true } : {}),
    }));
  writeJson(join(packageRoot, "runtime-lock.json"), {
    schema_version: "1",
    target: { os: target.os, arch: target.arch },
    generated_from: "box-runtime.lock.json",
    files,
  });
}

function runtimeRole(path: string): string {
  if (path === "bin/koubo-clip") return "koubo-cli";
  if (path === "bin/koubo-clip-runtime") return "koubo-cli-runtime";
  if (path === "runtime/bin/bun") return "bun-runtime";
  if (path === "runtime/bin/ffmpeg") return "ffmpeg";
  if (path === "runtime/bin/ffprobe") return "ffprobe";
  if (path === "runtime/bin/hyperframes" || path === "runtime/hyperframes.js") return "hyperframes-runtime";
  if (path === "runtime/bin/chrome-headless-shell") return "browser-runtime-launcher";
  if (path.startsWith("runtime/browser/")) return "browser-runtime";
  if (path.startsWith("runtime/node_modules/")) return "hyperframes-native-dependency";
  if (path.startsWith("resources/hyperframes/")) return "renderer-resource";
  if (path.startsWith("licenses/")) return "runtime-license";
  return "metadata";
}

function isRuntimeExecutable(path: string): boolean {
  return path === "bin/koubo-clip" || path === "bin/koubo-clip-runtime" || path === "runtime/bin/bun" || path === "runtime/bin/ffmpeg" || path === "runtime/bin/ffprobe" || path === "runtime/bin/hyperframes" || path === "runtime/bin/chrome-headless-shell" || path.endsWith("/chrome-headless-shell");
}

function writeDeliveryManifest(packageRoot: string, distributionKind: string): Json {
  const schemaVersions = {
    "sources.json": "2.0",
    "source-materialization.json": "1.0",
    "edl.json": "2.0",
    "production-proposal.json": "3.0",
    "enrichment-plan.json": "2.0",
    "render-contract.json": "2.0",
    "bindings.json": "2.0",
    "render-contract-result.json": "2.0",
    "render-contract-inspection.json": "2.0",
    "delivery-manifest.json": "3.0",
  };
  const capabilityIds = ["detached_source.v1", "external_frame_evidence.v1", "portable_edl.v1", "artifact_contract.discovery.v1", "artifact_validation.aggregate.v1", "render_contract.export.v1", "render_contract.consume_strict.v1", "source_binding.v1", "caption_layout.safe_area.v1", "external_asr.handoff.v1", "box_managed_cli.v1"];
  const runtimeDependencies = ["gsap@3.15.0", "hyperframes@0.7.36", "bun@1.3.11", "ffmpeg@6.1.1", "ffprobe@6.1.1", "chrome-headless-shell@131.0.6778.85"];
  const cliPayloadDigest = computeCliPayloadDigest({ root: packageRoot, files: ["package.json", "bin/koubo-clip", "runtime-lock.json"].filter((path) => nodeFs.existsSync(join(packageRoot, path))) }).digest;
  const rendererResourcesDigest = computeRendererResourcesDigest({ root: join(packageRoot, "resources", "hyperframes") }).digest;
  const base = {
    schema_version: "3.0" as const,
    cli_version: version,
    source_revision: sourceRevision,
    distribution_kind: distributionKind,
    cli_payload_digest: cliPayloadDigest,
    renderer_resources_digest: rendererResourcesDigest,
    official_skill_digest: computeOfficialSkillDigest({ root: join(root, "skills", "koubo-clip") }).digest,
    artifact_contracts_digest: artifactContractsDigest(),
    runtime_compatibility_digest: computeRuntimeCompatibilityDigest({ cli_payload_digest: cliPayloadDigest, renderer_resources_digest: rendererResourcesDigest, schema_versions: schemaVersions, capability_ids: capabilityIds, runtime_dependencies: runtimeDependencies }),
    schema_versions: schemaVersions,
    capability_ids: capabilityIds,
    runtime_dependencies: runtimeDependencies,
  };
  const manifest = { ...base, delivery_digest: computeDeliveryDigest(base) };
  writeJson(join(packageRoot, "delivery-manifest.json"), manifest);
  return manifest;
}

function makeCliDescriptor(input: { cliTarball: string; cliManifest: Json; runtimeDigest: string; inputs: ReturnType<typeof resolveInputs> }): Json {
  const artifact = artifactIdentity(input.cliTarball);
  return {
    manifest_version: "1",
    id: "koubo-clip",
    version,
    publisher: "koubo-clip",
    managed_cli_contract_version: "1",
    machine_output: {
      format: "json",
      contract_version: "1",
      stdout: "single final JSON object for --json commands",
      stderr: "diagnostic logs only",
    },
    artifacts: [
      {
        os: target.os,
        arch: target.arch,
        path: relative(root, input.cliTarball).replaceAll("\\", "/"),
        size: artifact.size,
        sha256: artifact.sha256,
        entrypoint: "bin/koubo-clip",
        distribution_kind: "box-cli",
        unsupported_targets: lock.unsupported_targets,
      },
    ],
    health_check: {
      command: "bin/koubo-clip",
      args: ["doctor", "--json"],
      success_statuses: ["healthy", "degraded", "needs_configuration"],
      failure: { exit_code: "non-zero", error_contract_version: "1" },
    },
    permissions: {
      network: "none during doctor/test/render",
      filesystem: ["read packaged runtime/resources", "read/write user-selected project and output directories"],
      processes: ["packaged bun", "packaged ffmpeg", "packaged ffprobe", "packaged hyperframes", "packaged chrome-headless-shell"],
    },
    data_policy: {
      source_media: "processed locally",
      secrets: "not bundled and not printed",
      telemetry: "none",
      skill_payload: "excluded from the Box CLI package",
    },
    runtime: {
      lockfile: "runtime-lock.json",
      runtime_lock_digest: input.runtimeDigest,
      delivery_digest: input.cliManifest.delivery_digest,
      renderer_resources_digest: input.cliManifest.renderer_resources_digest,
      official_skill_digest: input.cliManifest.official_skill_digest,
      bun_sha256: `sha256:${sha256File(input.inputs.bun)}`,
      ffmpeg_sha256: `sha256:${sha256File(input.inputs.ffmpeg)}`,
      ffprobe_sha256: `sha256:${sha256File(input.inputs.ffprobe)}`,
      browser_tree_sha256: `sha256:${input.inputs.browserTreeSha256}`,
    },
  };
}

function makeSkillDescriptor(input: { skillRoot: string; skillTarball: string; cliTarball: string; cliManifest: Json; skillDigest: string }): Json {
  const cliArtifact = artifactIdentity(input.cliTarball);
  const skillArtifact = artifactIdentity(input.skillTarball);
  return {
    manifest_version: "1",
    id: "koubo-clip-skill",
    version,
    publisher: "koubo-clip",
    payload: {
      root: "skills/koubo-clip",
      files: listFileEntries(join(input.skillRoot, "skills", "koubo-clip")),
    },
    cli_dependencies: [
      {
        id: "koubo-clip",
        version,
        commands: [
          "koubo-clip --version",
          "koubo-clip capabilities --json",
          "koubo-clip doctor --json",
          "koubo-clip test --json",
          "koubo-clip render-contract verify",
          "koubo-clip render-contract bind",
          "koubo-clip render-contract render",
          "koubo-clip render-contract inspect",
        ],
      },
    ],
    artifacts: [
      {
        os: "any",
        arch: "any",
        path: relative(root, input.skillTarball).replaceAll("\\", "/"),
        size: skillArtifact.size,
        sha256: skillArtifact.sha256,
      },
    ],
    delivery_identity: {
      cli_artifact_sha256: cliArtifact.sha256,
      skill_artifact_sha256: skillArtifact.sha256,
      official_skill_digest: input.skillDigest,
      delivery_digest: input.cliManifest.delivery_digest,
      renderer_resources_digest: input.cliManifest.renderer_resources_digest,
    },
  };
}

function resolveInputs(lockJson: Json) {
  const bunPath = process.env.KOUBO_BOX_BUN_PATH ?? realpath(process.execPath);
  const ffmpegPath = join(root, "node_modules", "ffmpeg-ffprobe-static", "ffmpeg");
  const ffprobePath = join(root, "node_modules", "ffmpeg-ffprobe-static", "ffprobe");
  const browserRoot = process.env.KOUBO_BOX_BROWSER_ROOT;
  if (!browserRoot) throw new Error("KOUBO_BOX_BROWSER_ROOT is required for Box packaging and must point to the pinned chrome-headless-shell tree");
  expectFileHash(bunPath, lockJson.inputs.bun.sha256, "Bun runtime");
  expectFileHash(ffmpegPath, lockJson.inputs.ffmpeg.sha256, "ffmpeg runtime");
  expectFileHash(ffprobePath, lockJson.inputs.ffprobe.sha256, "ffprobe runtime");
  const browserTree = computeDeliveryFileSetDigest({ root: browserRoot });
  const expectedBrowser = `sha256:${lockJson.inputs.chrome_headless_shell.tree_sha256}`;
  if (browserTree.digest !== expectedBrowser || browserTree.file_count !== lockJson.inputs.chrome_headless_shell.file_count || browserTree.byte_length !== lockJson.inputs.chrome_headless_shell.byte_length) {
    throw new Error(`Chrome Headless Shell tree does not match box-runtime.lock.json: ${browserTree.digest}`);
  }
  return {
    bun: bunPath,
    ffmpeg: ffmpegPath,
    ffprobe: ffprobePath,
    browserRoot,
    browserTreeSha256: lockJson.inputs.chrome_headless_shell.tree_sha256 as string,
  };
}

function archive(sourceDir: string, outputPath: string): string {
  nodeFs.mkdirSync(dirname(outputPath), { recursive: true });
  nodeFs.rmSync(outputPath, { force: true });
  run("tar", ["-czf", outputPath, "-C", dirname(sourceDir), basename(sourceDir)], root);
  return outputPath;
}

function listFileEntries(dir: string): FileEntry[] {
  return walkFiles(dir).map((path) => ({
    path: relative(dir, path).replaceAll("\\", "/"),
    size: nodeFs.statSync(path).size,
    sha256: `sha256:${sha256File(path)}`,
  })).sort((left, right) => left.path.localeCompare(right.path));
}

function artifactIdentity(path: string): { path: string; size: number; sha256: string } {
  return { path, size: nodeFs.statSync(path).size, sha256: `sha256:${sha256File(path)}` };
}

function expectFileHash(path: string, expected: string, label: string): void {
  if (!nodeFs.existsSync(path)) throw new Error(`${label} is missing: ${path}`);
  const actual = sha256File(path);
  if (actual !== expected) throw new Error(`${label} sha256 mismatch: expected ${expected}, got ${actual}`);
}

function sha256File(path: string): string {
  return createHash("sha256").update(nodeFs.readFileSync(path)).digest("hex");
}

function walkFiles(dir: string): string[] {
  const entries = nodeFs.readdirSync(dir).sort();
  const output: string[] = [];
  for (const name of entries) {
    const path = join(dir, name);
    const stat = lstat(path);
    if (stat.isSymbolicLink()) throw new Error(`Box packages must not contain symlinks: ${path}`);
    if (stat.isDirectory()) output.push(...walkFiles(path));
    else if (stat.isFile()) output.push(path);
  }
  return output;
}

function assertNoSymlinks(dir: string): void {
  walkFiles(dir);
}

function assertNoPath(base: string, relativePath: string): void {
  if (nodeFs.existsSync(join(base, relativePath))) throw new Error(`Box CLI package must not contain ${relativePath}`);
}

function assertVersion(): void {
  if (version !== "0.0.17") throw new Error(`Box package target is 0.0.17; package.json is ${version}`);
}

function assertLockTarget(lockJson: Json, selected: Target): void {
  if (lockJson.target?.os !== selected.os || lockJson.target?.arch !== selected.arch) {
    throw new Error(`Box runtime lock supports ${lockJson.target?.os}-${lockJson.target?.arch}; requested ${selected.tag}`);
  }
}

function parseTarget(raw: string): Target {
  if (raw === "darwin-arm64") return { os: "darwin", arch: "arm64", tag: "darwin-arm64" };
  throw new Error(`Unsupported Box target ${raw}; this package script fails closed until runtime inputs are pinned for that platform`);
}

function packageVersion(): string {
  return (readJson(join(root, "package.json")) as { version: string }).version;
}

function gitRevision(): string {
  const revision = run("git", ["rev-parse", "HEAD"], root).trim();
  const dirty = run("git", ["status", "--porcelain", "--untracked-files=all"], root).trim();
  return dirty ? `${revision}-dirty` : revision;
}

function readJson(path: string): Json {
  return JSON.parse(nodeFs.readFileSync(path, "utf8")) as Json;
}

function writeJson(path: string, value: unknown): void {
  nodeFs.mkdirSync(dirname(path), { recursive: true });
  nodeFs.writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function run(command: string, args: string[], cwd: string): string {
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr || result.stdout}`.trim());
  return result.stdout;
}

function chmod(path: string, mode: number): void {
  (nodeFs as any).chmodSync(path, mode);
}

function lstat(path: string): { isSymbolicLink(): boolean; isDirectory(): boolean; isFile(): boolean } {
  return (nodeFs as any).lstatSync(path);
}

function realpath(path: string): string {
  return (nodeFs as any).realpathSync(path);
}
