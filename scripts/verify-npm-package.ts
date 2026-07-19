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
  const capabilities = runCliJson(cli, ["capabilities", "--json"], packageRoot);
  expect(delivery.schema_version === "3.0", "installed package must use delivery manifest schema 3.0");
  expect(delivery.delivery_digest === manifest.delivery_digest, "delivery verify returned a different aggregate digest");
  expect(delivery.artifact_contracts_digest === manifest.artifact_contracts_digest, "delivery verify returned a different artifact contracts digest");
  expect(delivery.cli_version === version, "delivery CLI version does not match package version");
  expect(delivery.distribution_kind === "npm", "installed package distribution_kind must be npm");
  expect(capabilities.artifact_schema_versions["render-contract.json"] === "2.0", "installed CLI did not expose render contract 2.0");
  expect(capabilities.render_contract?.schema_version === "2.0", "installed render contract capability is not version 2.0");
  expect(capabilities.capability_ids.includes("caption_layout.safe_area.v1"), "installed CLI is missing caption safe-area capability");
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
  const skillText = readFileSync(join(packageRoot, "skills", "koubo-clip", "SKILL.md"), "utf8");
  expect(skillText.includes("source-manifest artifact contract") && skillText.includes("outside the project target"), "official Skill does not guide external source-manifest seeds");
  expect(skillText.includes("missing target -> create") && skillText.includes("existing valid project -> run") && skillText.includes("existing invalid target -> blocker"), "official Skill does not guide three-way project recovery");
  expect(skillText.includes("do not delete recursively, overwrite, migrate, or retry as a `-v2`/`-v3` parallel project"), "official Skill does not forbid parallel project retries");
  expect(skillText.includes("safe-layout presets") && skillText.includes("Never write CSS"), "official Skill does not enforce preset-only caption layout authoring");

  const catalog = runCliJson(cli, ["project", "element-catalog", packageRoot], packageRoot);
  expect(catalog.ok === true, "installed renderer resource catalog is unreadable");

  requireCommand("ffmpeg");
  requireCommand("ffprobe");
  const source = join(root, "raw.mp4");
  makeVideo(source);
  const identityProject = join(root, "identity-project");
  expect(runCliJson(cli, ["project", "create", source, "--project", identityProject], packageRoot).ok === true, "installed CLI could not derive a portable source identity");
  const sourceManifestContract = runCliJson(cli, ["artifact", "contract", "source-manifest", "--json"], packageRoot).data;
  expect(sourceManifestContract.ownership === "host_authored", "installed source-manifest contract is not host-authored");
  expect(sourceManifestContract.role === "command_request", "installed source-manifest contract is not a command request");
  expect(capabilities.artifact_contracts["source-manifest"]?.role === "command_request", "source-manifest command request role is not discoverable from capabilities");

  const invalidJsonTarget = join(root, "invalid-json-project");
  writeFileSync(join(root, "invalid-sources.json"), "{");
  const invalidJsonCreate = runCliJsonResult(cli, ["project", "create", "--source-manifest", join(root, "invalid-sources.json"), "--project", invalidJsonTarget, "--provider-mode", "platform", "--json"], packageRoot);
  expect(invalidJsonCreate.status !== 0, "invalid JSON source-manifest create unexpectedly succeeded");
  expect(invalidJsonCreate.json.error?.code === "SOURCE_MANIFEST_INVALID", "invalid JSON source-manifest create returned the wrong code");
  expect(!existsSync(invalidJsonTarget), "invalid JSON source-manifest create left a project target behind");

  const occupiedTarget = join(root, "occupied-project");
  mkdirSync(occupiedTarget);
  writeFileSync(join(occupiedTarget, "keep.txt"), "leave this target unchanged\n");
  const occupiedCreate = runCliJsonResult(cli, ["project", "create", "--source-manifest", join(identityProject, "sources.json"), "--project", occupiedTarget, "--provider-mode", "platform", "--json"], packageRoot);
  expect(occupiedCreate.status !== 0, "occupied target create unexpectedly succeeded");
  expect(occupiedCreate.json.error?.code === "PROJECT_TARGET_OCCUPIED", "occupied target create returned the wrong code");
  expect(readFileSync(join(occupiedTarget, "keep.txt"), "utf8") === "leave this target unchanged\n", "occupied target create changed existing target content");

  const project = join(root, "project");
  expect(runCliJson(cli, ["project", "create", "--source-manifest", join(identityProject, "sources.json"), "--project", project, "--provider-mode", "platform"], packageRoot).ok === true, "installed CLI could not create a detached platform project");
  expect(!existsSync(join(project, "source-materialization.json")), "detached authoring project unexpectedly materialized source bytes");
  const detachedStatus = runCliJson(cli, ["project", "status", project, "--json"], packageRoot).data;
  expect(detachedStatus.provider_execution_mode === "platform", "detached project status did not preserve platform mode");
  expect(detachedStatus.sources?.[0]?.materialization === "unbound", "detached project status unexpectedly reports materialized source bytes");
  writeFileSync(join(project, "transcript.json"), `${JSON.stringify({
    timing_granularity: "segment",
    segments: [{ source_id: "src-001", start: 0.1, end: 1.0, text: "installed package contract caption" }],
  })}\n`);
  expect(runCliJson(cli, ["project", "explore", project, "--asr", "external"], packageRoot).ok === true, "installed CLI explore failed");
  expect(runCliJson(cli, ["project", "review", project], packageRoot).ok === true, "installed CLI review failed");

  const proposalContract = runCliJson(cli, ["artifact", "contract", "production-proposal", "--json"], packageRoot).data;
  expect(proposalContract.schema_version === "3.0", "installed CLI did not expose production proposal 3.0");
  expect(proposalContract.schema_digest === capabilities.artifact_contracts["production-proposal"].schema_digest, "proposal schema digest is not exposed by capabilities");
  expect(proposalContract.contract_digest === capabilities.artifact_contracts["production-proposal"].contract_digest, "proposal contract digest is not exposed by capabilities");
  expect(proposalContract.example && proposalContract.template, "installed proposal authoring contract is incomplete");
  expect(capabilities.artifact_contracts["edit-plan"]?.external_writes_allowed === true, "installed edit-plan contract is not authorable");
  expect(capabilities.artifact_contracts["enrichment-plan"]?.external_writes_allowed === true, "installed enrichment-plan contract is not authorable");
  expect(capabilities.artifact_contracts["visual-candidates"]?.ownership === "host_authored", "installed visual-candidates contract is not host-authored");
  expect(capabilities.artifact_contracts["asset-manifest"]?.external_writes_allowed === false, "installed asset-manifest contract is externally writable");
  expect(capabilities.artifact_contracts["render-result"]?.external_writes_allowed === false, "installed render-result contract is externally writable");
  expect(capabilities.artifact_contracts["source-map"]?.ownership === "host_authored", "installed source-map contract is not host-authored");
  const proposal = structuredClone(proposalContract.example);
  for (const option of proposal.options) {
    option.cleanup.cut_candidate_ids = [];
  }
  const confirmedOption = proposal.options.find((option: Json) => option.id === proposal.recommended_option_id);
  expect(Boolean(confirmedOption), "proposal example is missing its recommended option");
  confirmedOption.sfx = { enabled: true, usage: "One restrained confirmation click.", restraint: "low volume, no speech masking" };
  confirmedOption.asset_requirements.sfx_slots = [{ slot_id: "click", kind: "sfx", purpose: "Confirm the selected action.", required: true }];
  writeFileSync(join(project, "production-proposal.json"), `${JSON.stringify(proposal)}\n`);
  const proposed = runCliJson(cli, ["project", "proposal", project], packageRoot);
  expect(proposed.ok === true, "installed CLI rejected its own production proposal contract example");
  const selectedOption = proposal.recommended_option_id;
  const selectionFingerprint = proposed.data.option_selection_fingerprints[selectedOption];
  expect(typeof selectionFingerprint === "string", "proposal validation did not produce a selection fingerprint");
  writeFileSync(join(project, "edit-plan.json"), `${JSON.stringify({
    contract_version: "1.0",
    confirmed_option_id: selectedOption,
    proposal_selection_fingerprint: selectionFingerprint,
    decisions: [],
  })}\n`);
  expect(runCliJson(cli, ["project", "compile-edl", project], packageRoot).ok === true, "installed CLI portable EDL compilation failed");
  writeFileSync(join(project, "enrichment-plan.json"), `${JSON.stringify({
    version: "2.0",
    profile: { source_mode: proposal.source_mode, aspect_ratio: "source", caption_identity: "anchor", layout: "overlay", style: "minimal", frame: "clean" },
    elements: [
      {
        id: "caption-identity",
        source: "agent",
        element_id: "anchor",
        element_type: "caption_identity",
        start: 0.1,
        end: 0.7,
        reason: "preserve confirmed captions",
        caption_identity: "anchor",
      },
      {
        id: "caption",
        source: "agent",
        element_id: "caption-editorial-emphasis",
        element_type: "registry_component",
        start: 0.1,
        end: 0.7,
        reason: "verify installed enrichment export",
        params: { text: "Installed package" },
      },
    ],
    audio: { music: [], sfx: [{ id: "click", sfx_id: "click", start: 0.4, end: 0.5, volume: 0.15, fade_seconds: 0, reason: "verify bundled SFX" }] },
  })}\n`);
  expect(runCliJson(cli, ["project", "enrich-plan", project], packageRoot).ok === true, "installed CLI enrichment validation failed");

  const bundle = join(root, "bundle");
  const exported = runCliJson(cli, ["render-contract", "export", project, "--output", bundle], packageRoot);
  expect(exported.ok === true, "installed CLI render contract export failed");
  expect(runCliJson(cli, ["render-contract", "verify", bundle], packageRoot).ok === true, "installed CLI render contract verification failed");
  const contract = readJson(join(bundle, "render-contract.json"));
  expect(contract.schema_version === "2.0", "installed package exported a non-current render contract");
  const expectedCaptionFont = proposal.source_mode === "talking_head_avatar" ? 24 : 22;
  const contractCaptionLayout = contract.payload.captions.layout;
  expect(contractCaptionLayout?.placement === "center_lower" && contractCaptionLayout?.size === "medium" && contractCaptionLayout?.anchor_x_ratio === 0.5 && contractCaptionLayout?.anchor_y_ratio === 0.7 && contractCaptionLayout?.font_size_px === expectedCaptionFont, "installed package did not freeze the portrait caption safe layout");
  const storyboardCaptionLayout = contract.payload.composition.storyboard.captions.layout;
  expect(["placement", "size", "anchor_x_ratio", "anchor_y_ratio", "font_size_px"].every((field) => storyboardCaptionLayout[field] === contractCaptionLayout[field]), "installed anchor storyboard layout drifted from the render contract");
  expect(contract.payload.runtime.cli_version === version, "render contract CLI version does not match delivery");
  expect(contract.payload.runtime.delivery_digest === manifest.delivery_digest, "render contract complete delivery digest does not match delivery");
  expect(contract.payload.runtime.renderer_resources_digest === manifest.renderer_resources_digest, "render contract renderer digest does not match delivery");
  expect(contract.payload.runtime.runtime_compatibility_digest === manifest.runtime_compatibility_digest, "render contract runtime digest does not match delivery");
  const frozenElement = contract.payload.composition.enrichment_plan.elements[1];
  const frozenSfx = contract.payload.audio.sfx[0];
  expect(!Object.hasOwn(frozenElement, "asset_id") && !Object.hasOwn(frozenElement, "anchor_point"), "installed contract retained absent element fields");
  expect(frozenSfx.sfx_id === "click" && !Object.hasOwn(frozenSfx, "asset_id"), "installed contract retained the unused SFX source");

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
  expect(inspection.checks.some((check: Json) => check.id === "caption-layout" && check.status === "passed"), "installed strict inspect did not validate caption layout");
  expect(inspection.frames.some((path: string) => path.includes("caption-layout")), "installed strict inspect did not emit the caption layout QA frame");
  writeFileSync(join(bundle, "render-contract.json"), `${JSON.stringify({ ...contract, schema_version: "1.0" }, null, 2)}\n`);
  const oldContractVerify = runCliJsonResult(cli, ["render-contract", "verify", bundle], packageRoot);
  expect(oldContractVerify.status !== 0 && oldContractVerify.json.error?.code === "CONTRACT_SCHEMA_UNSUPPORTED", "installed package did not fail closed on render contract 1.0");

  const acceptance = {
    schema_version: "1.0",
    ok: true,
    package: `koubo-clip@${version}`,
    delivery_digest: manifest.delivery_digest,
    renderer_resources_digest: manifest.renderer_resources_digest,
    official_skill_digest: manifest.official_skill_digest,
    artifact_contracts_digest: manifest.artifact_contracts_digest,
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

function runCliJsonResult(cli: string, args: string[], cwd: string): { status: number; json: Json } {
  const result = spawnSync("bun", [cli, ...args], {
    cwd,
    env: process.env,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  const output = (result.stdout || result.stderr).trim();
  return { status: result.status ?? 1, json: JSON.parse(output) as Json };
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
    "-y", "-f", "lavfi", "-i", "testsrc=size=180x320:rate=30",
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
