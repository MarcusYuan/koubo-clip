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
type FileEntry = { path: string; size_bytes: number; sha256: string; executable: boolean };
type Target = { os: "macos"; arch: "aarch64"; tag: "macos-aarch64" };

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const version = packageVersion();
const provenance = resolveProvenance();
const sourceRevision = provenance.source_revision;
const outputDir = resolve(process.argv[2] ?? join(root, "dist", "box"));
const target = parseTarget(process.env.KOUBO_BOX_TARGET ?? `${(process as any).platform}-${(process as any).arch}`);
const lock = readJson(join(root, "box-runtime.lock.json"));
const staging = nodeFs.mkdtempSync(join(tmpdir(), "koubo-box-package-"));

try {
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
  const skillDigest = computeOfficialSkillDigest({ root: join(root, "skills", "koubo-clip") }).digest;

  const cliDescriptor = makeCliDescriptor({
    cliRoot,
    cliTarball,
    cliManifest,
    runtimeDigest,
    inputs,
  });
  const skillDescriptor = makeSkillDescriptor({
    skillRoot,
    cliTarball,
    cliManifest,
    skillDigest,
  });
  writeJson(join(skillRoot, "skill.box.json"), skillDescriptor);
  const skillTarball = archive(skillRoot, join(outputDir, `koubo-clip-box-skill-${version}.tgz`));
  writeJson(join(outputDir, "cli-package.box.json"), cliDescriptor);
  writeJson(join(outputDir, "skill.box.json"), skillDescriptor);
  writeJson(join(root, "cli-package.box.json"), cliDescriptor);
  writeJson(join(root, "skill.box.json"), skillDescriptor);

  const ffmpegBuildEvidenceAsset = join(outputDir, `koubo-clip-ffmpeg-build-evidence-${version}.json`);
  const ffmpegSourceLockAsset = join(outputDir, `koubo-clip-ffmpeg-source-lock-${version}.json`);
  const ffmpegBuildRecipeAsset = join(outputDir, `koubo-clip-ffmpeg-build-recipe-${version}.sh`);
  nodeFs.copyFileSync(inputs.ffmpegBuildEvidence, ffmpegBuildEvidenceAsset);
  nodeFs.copyFileSync(inputs.ffmpegSourceLock, ffmpegSourceLockAsset);
  nodeFs.copyFileSync(join(inputs.ffmpegEvidenceRoot, "build-box-ffmpeg-runtime.sh"), ffmpegBuildRecipeAsset);

  const metadata = {
    ok: true,
    version,
    source_revision: sourceRevision,
    release_mode: provenance.release_mode,
    provenance,
    target: target.tag,
    cli_package: artifactIdentity(cliTarball),
    skill_package: artifactIdentity(skillTarball),
    cli_descriptor: artifactIdentity(join(outputDir, "cli-package.box.json")),
    skill_descriptor: artifactIdentity(join(outputDir, "skill.box.json")),
    ffmpeg_build_evidence: artifactIdentity(ffmpegBuildEvidenceAsset),
    ffmpeg_source_lock: artifactIdentity(ffmpegSourceLockAsset),
    ffmpeg_build_recipe: artifactIdentity(ffmpegBuildRecipeAsset),
    ffmpeg_corresponding_source: artifactIdentity(inputs.ffmpegSourceBundle),
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
  nodeFs.mkdirSync(join(packageRoot, "licenses", "ffmpeg-runtime"), { recursive: true });

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
  nodeFs.cpSync(inputs.ffmpegEvidenceRoot, join(packageRoot, "licenses", "ffmpeg-runtime"), { recursive: true });
  nodeFs.copyFileSync(join(root, "THIRD_PARTY_NOTICES.md"), join(packageRoot, "THIRD_PARTY_NOTICES.md"));
  const ffmpegEvidence = readJson(inputs.ffmpegBuildEvidence);
  writeJson(join(packageRoot, "licenses", "ffmpeg-runtime", "SOURCE_OFFER.json"), {
    contract_version: "1",
    id: "koubo-clip-ffmpeg-corresponding-source",
    version,
    source_revision: sourceRevision,
    artifact: {
      url: ffmpegEvidence.source_bundle.url,
      size_bytes: ffmpegEvidence.source_bundle.size_bytes,
      sha256: ffmpegEvidence.source_bundle.sha256,
    },
    notice: "This machine-readable offer identifies the corresponding-source asset for the packaged Box FFmpeg runtime. It is auditable engineering metadata, not a legal conclusion.",
  });

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
  copyCliResourceTree(join(root, "packages", "cli", "vendor", "hyperframes"), join(packageRoot, "resources", "hyperframes"));
  writeJson(join(packageRoot, "package.json"), {
    name: "koubo-clip-box-cli",
    version,
    private: true,
    type: "module",
    bin: { "koubo-clip": "bin/koubo-clip" },
  });

  assertNoPath(packageRoot, "skills/koubo-clip");
  assertNoCliSkillPayload(packageRoot);
  assertNoSymlinks(packageRoot);
}

function stageSkillPackage(packageRoot: string): void {
  nodeFs.cpSync(join(root, "skills", "koubo-clip"), packageRoot, { recursive: true });
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
    "export PATH=\"$RUNTIME_BIN\"",
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

function copyCliResourceTree(sourceRoot: string, targetRoot: string): void {
  nodeFs.mkdirSync(targetRoot, { recursive: true });
  for (const path of walkFiles(sourceRoot)) {
    const rel = relative(sourceRoot, path).replaceAll("\\", "/");
    if (isCliSkillPayloadPath(rel)) continue;
    const target = join(targetRoot, rel);
    nodeFs.mkdirSync(dirname(target), { recursive: true });
    nodeFs.copyFileSync(path, target);
    chmod(target, ((nodeFs as any).statSync(path).mode as number) & 0o777);
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
      || entry.path === "THIRD_PARTY_NOTICES.md"
    ))
    .map((entry) => ({
      path: entry.path,
      size: entry.size_bytes,
      sha256: entry.sha256,
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
  if (path === "THIRD_PARTY_NOTICES.md") return "runtime-license-notice";
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

function makeCliDescriptor(input: { cliRoot: string; cliTarball: string; cliManifest: Json; runtimeDigest: string; inputs: ReturnType<typeof resolveInputs> }): Json {
  const artifact = artifactIdentity(input.cliTarball);
  return {
    manifest_version: "1",
    id: "koubo-clip",
    name: "Koubo Clip",
    version,
    publisher: "MarcusYuan",
    source_revision: sourceRevision,
    release_mode: provenance.release_mode,
    provenance,
    managed_cli_contract_version: "1",
    machine_output: { format: "json", encoding: "utf-8" },
    artifacts: [
      {
        os: target.os,
        arch: target.arch,
        url: artifactUrl(input.cliTarball),
        size_bytes: artifact.size_bytes,
        sha256: artifact.sha256,
        executable: "bin/koubo-clip",
      },
    ],
    files: listFileEntries(input.cliRoot),
    health_check: { args: ["doctor", "--json"] },
    permissions: {
      file_read: ["packaged runtime/resources", "user-selected project/source media"],
      file_write: ["user-selected project/output directories"],
      network: ["optional HTTPS provider APIs only when explicitly invoked"],
      credentials: ["optional provider credentials supplied by the host at runtime"],
      devices: [],
      side_effects: ["local subprocess execution of packaged runtime binaries"],
    },
    data_policy: {
      preserve_on_update: ["user projects", "user media", "user outputs"],
      remove_on_uninstall: ["packaged CLI runtime", "packaged renderer resources", "packaged browser runtime"],
    },
    release_urls: {
      cli: `${repositoryReleaseBaseUrl()}/download/v${version}/${basename(input.cliTarball)}`,
      ffmpeg_corresponding_source: String(readJson(input.inputs.ffmpegBuildEvidence).source_bundle.url),
    },
    unsupported_targets: unsupportedTargets(lock.unsupported_targets),
    runtime: {
      lockfile: "runtime-lock.json",
      runtime_lock_digest: hexDigest(input.runtimeDigest),
      delivery_digest: hexDigest(input.cliManifest.delivery_digest),
      renderer_resources_digest: hexDigest(input.cliManifest.renderer_resources_digest),
      official_skill_digest: hexDigest(input.cliManifest.official_skill_digest),
      bun_sha256: sha256File(input.inputs.bun),
      ffmpeg_sha256: sha256File(input.inputs.ffmpeg),
      ffprobe_sha256: sha256File(input.inputs.ffprobe),
      ffmpeg_build_evidence_sha256: sha256File(input.inputs.ffmpegBuildEvidence),
      ffmpeg_source_lock_sha256: sha256File(input.inputs.ffmpegSourceLock),
      ffmpeg_source_bundle_sha256: sha256File(input.inputs.ffmpegSourceBundle),
      ffmpeg_source_bundle_size_bytes: nodeFs.statSync(input.inputs.ffmpegSourceBundle).size,
      ffmpeg_source_bundle_url: String(readJson(input.inputs.ffmpegBuildEvidence).source_bundle.url),
      browser_tree_sha256: input.inputs.browserTreeSha256,
    },
  };
}

function makeSkillDescriptor(input: { skillRoot: string; cliTarball: string; cliManifest: Json; skillDigest: string }): Json {
  const cliArtifact = artifactIdentity(input.cliTarball);
  return {
    manifest_version: "1",
    id: "koubo-clip",
    name: "Koubo Clip Skill",
    description: "Agent workflow skill for Koubo Clip talking-head video cleanup and enrichment.",
    version,
    source_revision: sourceRevision,
    release_mode: provenance.release_mode,
    provenance,
    entrypoint: "SKILL.md",
    files: listFileEntries(input.skillRoot),
    source: {
      kind: "github",
      publisher: "MarcusYuan",
    },
    cli_dependencies: [
      {
        id: "koubo-clip",
        version,
        required: true,
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
    permissions: {
      file_read: ["user-selected project artifacts and media metadata"],
      file_write: ["user-selected project plans and reports"],
      network: ["optional host/provider tools selected by the user"],
      credentials: [],
      devices: [],
      side_effects: [],
    },
    data_policy: {
      preserve_on_update: ["user projects", "user media", "user outputs"],
      remove_on_uninstall: ["packaged Skill files"],
    },
    release_urls: {
      skill: `${repositoryReleaseBaseUrl()}/download/v${version}/koubo-clip-box-skill-${version}.tgz`,
    },
    delivery_identity: {
      cli_artifact_sha256: cliArtifact.sha256,
      official_skill_digest: hexDigest(input.skillDigest),
      delivery_digest: hexDigest(input.cliManifest.delivery_digest),
      renderer_resources_digest: hexDigest(input.cliManifest.renderer_resources_digest),
    },
  };
}

function resolveInputs(lockJson: Json) {
  const bunPath = process.env.KOUBO_BOX_BUN_PATH ?? realpath(process.execPath);
  const ffmpegRuntimeRoot = resolve(process.env.KOUBO_BOX_FFMPEG_RUNTIME_ROOT ?? join(root, "dist", "box-runtime", "macos-aarch64"));
  const ffmpegPath = join(ffmpegRuntimeRoot, "bin", "ffmpeg");
  const ffprobePath = join(ffmpegRuntimeRoot, "bin", "ffprobe");
  const ffmpegEvidenceRoot = join(ffmpegRuntimeRoot, "evidence");
  const ffmpegBuildEvidence = join(ffmpegEvidenceRoot, "build-evidence.json");
  const ffmpegSourceLock = join(ffmpegEvidenceRoot, "source-lock.json");
  const ffmpegSourceBundle = resolve(process.env.KOUBO_BOX_FFMPEG_SOURCE_BUNDLE ?? join(root, "dist", "box", `koubo-clip-ffmpeg-sources-${version}.tar.xz`));
  const browserRoot = process.env.KOUBO_BOX_BROWSER_ROOT;
  if (!browserRoot) throw new Error("KOUBO_BOX_BROWSER_ROOT is required for Box packaging and must point to the pinned chrome-headless-shell tree");
  expectFileHash(bunPath, lockJson.inputs.bun.sha256, "Bun runtime");
  verifyBuiltFfmpegInput({ ffmpegRuntimeRoot, ffmpegPath, ffprobePath, ffmpegEvidenceRoot, ffmpegBuildEvidence, ffmpegSourceLock, ffmpegSourceBundle }, lockJson);
  const browserTree = computeDeliveryFileSetDigest({ root: browserRoot });
  const expectedBrowser = `sha256:${lockJson.inputs.chrome_headless_shell.tree_sha256}`;
  if (browserTree.digest !== expectedBrowser || browserTree.file_count !== lockJson.inputs.chrome_headless_shell.file_count || browserTree.byte_length !== lockJson.inputs.chrome_headless_shell.byte_length) {
    throw new Error(`Chrome Headless Shell tree does not match box-runtime.lock.json: ${browserTree.digest}`);
  }
  return {
    bun: bunPath,
    ffmpeg: ffmpegPath,
    ffprobe: ffprobePath,
    ffmpegEvidenceRoot,
    ffmpegBuildEvidence,
    ffmpegSourceLock,
    ffmpegSourceBundle,
    browserRoot,
    browserTreeSha256: lockJson.inputs.chrome_headless_shell.tree_sha256 as string,
  };
}

function verifyBuiltFfmpegInput(
  input: {
    ffmpegRuntimeRoot: string;
    ffmpegPath: string;
    ffprobePath: string;
    ffmpegEvidenceRoot: string;
    ffmpegBuildEvidence: string;
    ffmpegSourceLock: string;
    ffmpegSourceBundle: string;
  },
  lockJson: Json,
): void {
  for (const [path, label] of [
    [input.ffmpegPath, "ffmpeg runtime"],
    [input.ffprobePath, "ffprobe runtime"],
    [input.ffmpegBuildEvidence, "FFmpeg build evidence"],
    [input.ffmpegSourceLock, "FFmpeg source lock evidence"],
    [input.ffmpegSourceBundle, "FFmpeg corresponding-source bundle"],
  ] as const) {
    if (!nodeFs.existsSync(path) || !nodeFs.statSync(path).isFile()) throw new Error(`${label} is missing: ${path}`);
  }
  assertNoSymlinks(input.ffmpegRuntimeRoot);
  const evidence = readJson(input.ffmpegBuildEvidence);
  if (evidence.contract_version !== "1" || evidence.target?.os !== target.os || evidence.target?.arch !== target.arch) {
    throw new Error("FFmpeg build evidence target or contract version does not match the Box target");
  }
  const lockedSourcePath = resolve(root, String(lockJson.inputs?.ffmpeg_runtime?.source_lock ?? ""));
  if (lockedSourcePath !== resolve(root, "third_party", "ffmpeg-runtime", "macos-aarch64", "source-lock.json")) {
    throw new Error("box-runtime.lock.json must reference the canonical FFmpeg source lock");
  }
  expectFileHash(input.ffmpegSourceLock, sha256File(lockedSourcePath), "generated FFmpeg source lock evidence");
  const binaries = new Map((evidence.binaries ?? []).map((entry: Json) => [entry.path, entry]));
  for (const [path, relativePath, label] of [
    [input.ffmpegPath, "bin/ffmpeg", "ffmpeg runtime"],
    [input.ffprobePath, "bin/ffprobe", "ffprobe runtime"],
  ] as const) {
    const entry = binaries.get(relativePath) as Json | undefined;
    if (!entry || entry.size_bytes !== nodeFs.statSync(path).size || entry.sha256 !== sha256File(path)) {
      throw new Error(`${label} does not match build-evidence.json`);
    }
  }
  if (evidence.source_bundle?.size_bytes !== nodeFs.statSync(input.ffmpegSourceBundle).size || evidence.source_bundle?.sha256 !== sha256File(input.ffmpegSourceBundle)) {
    throw new Error("FFmpeg corresponding-source bundle does not match build-evidence.json");
  }
  if (evidence.source_bundle?.url !== ffmpegSourceBundleUrl()) {
    throw new Error("FFmpeg build evidence must use the canonical same-release corresponding-source URL");
  }
}

function ffmpegSourceBundleUrl(): string {
  return `${repositoryReleaseBaseUrl()}/download/v${version}/koubo-clip-ffmpeg-sources-${version}.tar.xz`;
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
    size_bytes: nodeFs.statSync(path).size,
    sha256: sha256File(path),
    executable: isExecutable(path),
  })).sort((left, right) => left.path.localeCompare(right.path));
}

function artifactIdentity(path: string): { path: string; size_bytes: number; sha256: string } {
  return { path, size_bytes: nodeFs.statSync(path).size, sha256: sha256File(path) };
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

function assertNoCliSkillPayload(base: string): void {
  for (const path of walkFiles(base)) {
    const rel = relative(base, path).replaceAll("\\", "/");
    if (isCliSkillPayloadPath(rel)) throw new Error(`Box CLI package must not contain Skill payload: ${rel}`);
  }
}

function assertLockTarget(lockJson: Json, selected: Target): void {
  const lockOs = normalizeOs(lockJson.target?.os);
  const lockArch = normalizeArch(lockJson.target?.arch);
  if (lockOs !== selected.os || lockArch !== selected.arch) {
    throw new Error(`Box runtime lock supports ${lockJson.target?.os}-${lockJson.target?.arch}; requested ${selected.tag}`);
  }
}

function parseTarget(raw: string): Target {
  if (raw === "macos-aarch64" || raw === "darwin-arm64") return { os: "macos", arch: "aarch64", tag: "macos-aarch64" };
  throw new Error(`Unsupported Box target ${raw}; this package script fails closed until runtime inputs are pinned for that platform`);
}

function packageVersion(): string {
  return (readJson(join(root, "package.json")) as { version: string }).version;
}

function resolveProvenance(): { source_revision: string; release_mode: "release" | "preview"; worktree_dirty: boolean } {
  const headRevision = run("git", ["rev-parse", "HEAD"], root).trim();
  const sourceRevision = process.env.KOUBO_CLIP_SOURCE_REVISION ?? headRevision;
  if (!/^[a-f0-9]{40}$/.test(sourceRevision)) {
    throw new Error("KOUBO_CLIP_SOURCE_REVISION must be an exact 40-character lowercase commit SHA");
  }
  if (sourceRevision !== headRevision) {
    throw new Error(`KOUBO_CLIP_SOURCE_REVISION must equal the checked-out commit ${headRevision}`);
  }
  const dirty = run("git", ["status", "--porcelain", "--untracked-files=all"], root).trim().length > 0;
  if (dirty && process.env.KOUBO_BOX_ALLOW_DIRTY_PREVIEW !== "1") {
    throw new Error("Refusing to build a release Box package from a dirty worktree; set KOUBO_BOX_ALLOW_DIRTY_PREVIEW=1 only for local preview artifacts");
  }
  return {
    source_revision: sourceRevision,
    release_mode: dirty ? "preview" : "release",
    worktree_dirty: dirty,
  };
}

function repositoryReleaseBaseUrl(): string {
  const packageJson = readJson(join(root, "package.json")) as { repository?: { url?: string } | string };
  const raw = typeof packageJson.repository === "string" ? packageJson.repository : packageJson.repository?.url;
  const normalized = String(raw ?? "").replace(/^git\+/, "").replace(/\.git$/, "");
  if (!normalized.startsWith("https://github.com/")) throw new Error(`package.json repository must be an HTTPS GitHub URL for Box release URLs: ${raw}`);
  return normalized.replace(/\/$/, "") + "/releases";
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

function isExecutable(path: string): boolean {
  return (((nodeFs as any).statSync(path).mode as number) & 0o111) !== 0;
}

function hexDigest(value: string): string {
  return value.replace(/^sha256:/, "");
}

function artifactUrl(path: string): string {
  const releaseBase = process.env.KOUBO_BOX_RELEASE_BASE_URL;
  if (releaseBase) {
    if (!/^https:\/\/[^/]+\/.+/.test(releaseBase)) throw new Error("KOUBO_BOX_RELEASE_BASE_URL must be an HTTPS URL");
    return `${releaseBase.replace(/\/$/, "")}/${basename(path)}`;
  }
  return `bundled://${relative(root, path).replaceAll("\\", "/")}`;
}

function normalizeOs(value: unknown): string {
  if (value === "darwin") return "macos";
  if (value === "win32") return "windows";
  return String(value);
}

function normalizeArch(value: unknown): string {
  return value === "arm64" ? "aarch64" : String(value);
}

function unsupportedTargets(value: unknown): Json[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => ({
    ...entry,
    os: normalizeOs(entry.os),
    arch: normalizeArch(entry.arch),
  }));
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

function lstat(path: string): { isSymbolicLink(): boolean; isDirectory(): boolean; isFile(): boolean } {
  return (nodeFs as any).lstatSync(path);
}

function realpath(path: string): string {
  return (nodeFs as any).realpathSync(path);
}
