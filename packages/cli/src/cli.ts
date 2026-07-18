#!/usr/bin/env bun

import * as nodeFs from "node:fs";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { bundleInfo, cliVersion, resolveKouboClipSkillRoot } from "./bundle-paths";
import { parseProjectMetadata, projectArtifacts, type CapabilitiesArtifact, type ProviderExecutionMode } from "./artifacts";
import { projectStatus } from "./project-status";
import { bindRenderContract, exportRenderContract, inspectBoundContract, renderBoundContract, verifyRenderContractBundle } from "./render-contract-commands";
import { verifyInstalledDelivery, verifyInstalledSkill } from "./delivery-runtime";
import { artifactContractIndex, getArtifactContract } from "./artifact-contracts";
import {
  commandExists,
  compileEdlProject,
  createProject,
  elementCatalogProject,
  enrichPlanProject,
  exploreProject,
  sourceFramesProject,
  focusCandidatesProject,
  focusFramesProject,
  focusGroundingProject,
  focusReviewProject,
  inspectProject,
  musicAcquireProject,
  musicCatalogProject,
  musicReviewProject,
  proposalProject,
  renderProject,
  reviewProject,
  visualAcquireProject,
  visualCatalogProject,
  visualReviewProject,
  visualSearchProject,
  type AsrMode,
  type AsrProvider,
} from "./project";

type Io = {
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
};

const help = `koubo-clip

Usage:
  koubo-clip --version
  koubo-clip capabilities --json
  koubo-clip artifact contract <artifact-id> --json
  koubo-clip doctor [--provider-mode standalone|platform]
  koubo-clip delivery verify --json
  koubo-clip skills path [--json]
  koubo-clip skills verify [--path <installed-skill>] --json
  koubo-clip skills install --target codex|claude|hermes [--dest <dir>] [--force]
  koubo-clip render-contract export <project> --output <bundle-dir>
  koubo-clip render-contract verify <bundle-dir>
  koubo-clip render-contract bind <bundle-dir> --source-map <json> --output <bindings.json>
  koubo-clip render-contract render <bundle-dir> --bindings <bindings.json> --output <run-dir>
  koubo-clip render-contract inspect <bundle-dir> --result <run-dir/render-contract-result.json>
  koubo-clip project create <video...> [--project <dir>] [--provider-mode standalone|platform]
  koubo-clip project create --source-manifest <sources-v2.json> --project <dir> [--provider-mode standalone|platform]
  koubo-clip project explore <project> [--provider-mode standalone|platform] [--asr auto|off|external] [--asr-provider cloudflare-whisper|whisper-cli]
  koubo-clip project source-frames <project> [--import <evidence-dir>] [--provider-mode standalone|platform] [--json]
  koubo-clip project review <project>
  koubo-clip project proposal <project>
  koubo-clip project element-catalog <project>
  koubo-clip project focus-candidates <project>
  koubo-clip project focus-frames <project> [--import <evidence-dir>]
  koubo-clip project focus-grounding <project>
  koubo-clip project focus-review <project>
  koubo-clip project music-catalog <project>
  koubo-clip project music-acquire <project>
  koubo-clip project music-review <project>
  koubo-clip project visual-catalog <project>
  koubo-clip project visual-search <project>
  koubo-clip project visual-acquire <project>
  koubo-clip project visual-review <project>
  koubo-clip project enrich-plan <project>
  koubo-clip project compile-edl <project>
  koubo-clip project render <project>
  koubo-clip project inspect <project>
  koubo-clip project status <project> [--json]
`;

const projectCommands = [
  "create <video...> [--project <dir>] [--provider-mode standalone|platform]",
  "create --source-manifest <sources-v2.json> --project <dir> [--provider-mode standalone|platform]",
  "explore <project> [--provider-mode standalone|platform] [--asr auto|off|external] [--asr-provider cloudflare-whisper|whisper-cli]",
  "source-frames <project> [--import <evidence-dir>] [--provider-mode standalone|platform] [--json]",
  "review <project> [--provider-mode standalone|platform]",
  "proposal <project> [--provider-mode standalone|platform]",
  "element-catalog <project> [--provider-mode standalone|platform]",
  "focus-candidates <project> [--provider-mode standalone|platform]",
  "focus-frames <project> [--import <evidence-dir>] [--provider-mode standalone|platform]",
  "focus-grounding <project> [--provider-mode standalone|platform]",
  "focus-review <project> [--provider-mode standalone|platform]",
  "music-catalog <project> [--provider-mode standalone|platform]",
  "music-acquire <project> [--provider-mode standalone|platform]",
  "music-review <project> [--provider-mode standalone|platform]",
  "visual-catalog <project> [--provider-mode standalone|platform]",
  "visual-search <project> [--provider-mode standalone|platform]",
  "visual-acquire <project> [--provider-mode standalone|platform]",
  "visual-review <project> [--provider-mode standalone|platform]",
  "enrich-plan <project> [--provider-mode standalone|platform]",
  "compile-edl <project>",
  "render <project> [--provider-mode standalone|platform]",
  "inspect <project> [--provider-mode standalone|platform]",
  "status <project> [--json]",
] as const;

export async function main(argv = process.argv.slice(2), io: Io = {}): Promise<number> {
  if (shouldLoadLocalEnv(argv)) loadLocalEnv();
  const out = io.stdout ?? console.log;
  const err = io.stderr ?? console.error;
  const [command] = argv;

  if (!command || command === "--help" || command === "-h") {
    out(help.trimEnd());
    return 0;
  }

  if (command === "--version" || command === "-v") {
    out(cliVersion());
    return 0;
  }

  if (command === "capabilities") {
    out(JSON.stringify(softwareCapabilities()));
    return 0;
  }

  if (command === "artifact") {
    const result = runArtifactCommand(argv.slice(1));
    (result.ok ? out : err)(JSON.stringify(result));
    return result.ok ? 0 : 1;
  }

  if (command === "doctor") {
    const { flags } = parseArgs(argv.slice(1));
    const mode = providerMode(flags["provider-mode"], "standalone") ?? "standalone";
    const bun = (globalThis as typeof globalThis & { Bun?: { version: string } }).Bun;
    out(
      JSON.stringify({
        ok: true,
        provider_mode: mode,
        runtime: "bun",
        bun: bun?.version ?? null,
        node: process.version,
        ffmpeg: commandExists("ffmpeg"),
        ffprobe: commandExists("ffprobe"),
        npx: commandExists("npx"),
        hyperframes: commandExists("hyperframes") || existsSync(join(process.cwd(), "node_modules", ".bin", "hyperframes")),
        whisper_cli: commandExists("whisper-cli"),
        bundle: bundleInfo(),
        providers: providerStatus(mode),
      }),
    );
    return 0;
  }

  if (command === "delivery") {
    const { positionals } = parseArgs(argv.slice(1));
    if (positionals[0] !== "verify") {
      err(JSON.stringify({ ok: false, command: "delivery", error: { code: "UNKNOWN_DELIVERY_COMMAND", message: `Unknown delivery command: ${positionals[0] ?? ""}` } }));
      return 1;
    }
    try {
      const manifest = verifyInstalledDelivery();
      out(JSON.stringify({ ok: true, command: "delivery.verify", data: manifest }));
      return 0;
    } catch (error) {
      err(JSON.stringify({ ok: false, command: "delivery.verify", error: { code: error && typeof error === "object" && "code" in error ? String(error.code) : "DELIVERY_MANIFEST_INVALID", message: error instanceof Error ? error.message : String(error) } }));
      return 1;
    }
  }

  if (command === "skills") {
    const result = runSkillsCommand(argv.slice(1));
    const write = result.ok ? out : err;
    if ("text" in result && typeof result.text === "string") write(result.text);
    else write(JSON.stringify(result));
    return result.ok ? 0 : 1;
  }

  if (command === "render-contract") {
    const result = runRenderContractCommand(argv.slice(1));
    const write = result.ok ? out : err;
    write(JSON.stringify(result));
    return result.ok ? 0 : 1;
  }

  if (command === "project") {
    if (argv.includes("--help") || argv.includes("-h")) {
      out(projectHelp());
      return 0;
    }
    const result = await safeProjectCommand(argv.slice(1));
    const write = result.ok ? out : err;
    write(JSON.stringify(result));
    return result.ok ? 0 : 1;
  }

  err(`Unknown command: ${command}`);
  return 1;
}

function runRenderContractCommand(argv: string[]) {
  const { positionals, flags } = parseArgs(argv);
  const [subcommand, target] = positionals;
  if (subcommand === "export") return exportRenderContract(required(target, "project path"), required(flags.output, "--output"));
  if (subcommand === "verify") return verifyRenderContractBundle(required(target, "bundle path"));
  if (subcommand === "bind") return bindRenderContract(required(target, "bundle path"), required(flags["source-map"], "--source-map"), required(flags.output, "--output"));
  if (subcommand === "render") return renderBoundContract(required(target, "bundle path"), required(flags.bindings, "--bindings"), required(flags.output, "--output"));
  if (subcommand === "inspect") return inspectBoundContract(required(target, "bundle path"), required(flags.result, "--result"));
  return { ok: false as const, command: "render-contract", error: { code: "UNKNOWN_RENDER_CONTRACT_COMMAND", message: `Unknown render-contract command: ${subcommand ?? ""}` } };
}

function runArtifactCommand(argv: string[]) {
  const { positionals, flags } = parseArgs(argv);
  const [subcommand, artifactId, ...extra] = positionals;
  if (subcommand !== "contract") {
    return { ok: false as const, command: "artifact", error: { code: "UNKNOWN_ARTIFACT_COMMAND", message: `Unknown artifact command: ${subcommand ?? ""}` } };
  }
  if (!artifactId || extra.length || Object.keys(flags).some((flag) => flag !== "json")) {
    return { ok: false as const, command: "artifact.contract", error: { code: "ARTIFACT_CONTRACT_ARGUMENT_INVALID", message: "Use: koubo-clip artifact contract <artifact-id> --json" } };
  }
  const contract = getArtifactContract(artifactId);
  if (!contract) {
    return { ok: false as const, command: "artifact.contract", error: { code: "ARTIFACT_CONTRACT_UNSUPPORTED", message: `No public artifact contract for: ${artifactId}` } };
  }
  return { ok: true as const, command: "artifact.contract", data: contract };
}

function runSkillsCommand(argv: string[]) {
  const { positionals, flags } = parseArgs(argv);
  const [subcommand] = positionals;
  const skillPath = resolveKouboClipSkillRoot();
  if (subcommand === "path") {
    const data = { ok: true as const, skill: "koubo-clip", path: skillPath, exists: existsSync(join(skillPath, "SKILL.md")) };
    return flags.json ? data : { ok: true as const, text: skillPath };
  }
  if (subcommand === "verify") {
    try {
      const verified = verifyInstalledSkill(flags.path ?? skillPath);
      return { ok: true as const, command: "skills.verify", skill: "koubo-clip", path: verified.path, digest: verified.digest, cli_version: verified.manifest.cli_version };
    } catch (error) {
      return { ok: false as const, error: { code: error && typeof error === "object" && "code" in error ? String(error.code) : "DELIVERY_MANIFEST_INVALID", message: error instanceof Error ? error.message : String(error) } };
    }
  }
  if (subcommand === "install") {
    const installRoot = defaultSkillInstallRoot(flags.target);
    if (!installRoot) return { ok: false as const, error: { code: "INVALID_SKILLS_TARGET", message: "Use --target codex, claude, or hermes" } };
    if (!existsSync(join(skillPath, "SKILL.md"))) return { ok: false as const, error: { code: "SKILL_NOT_FOUND", message: `koubo-clip skill not found: ${skillPath}` } };
    try {
      verifyInstalledSkill(skillPath);
    } catch (error) {
      return { ok: false as const, error: { code: error && typeof error === "object" && "code" in error ? String(error.code) : "DELIVERY_MANIFEST_INVALID", message: error instanceof Error ? error.message : String(error) } };
    }
    const root = flags.dest ?? installRoot;
    const target = join(root, "koubo-clip");
    if (existsSync(target) && !flags.force) return { ok: false as const, error: { code: "SKILL_EXISTS", message: `${target} already exists; pass --force to overwrite` } };
    mkdirSync(root, { recursive: true });
    const staging = join(root, `.koubo-clip-staging-${Date.now()}`);
    cpSync(skillPath, staging, { recursive: true });
    try {
      verifyInstalledSkill(staging);
      if (existsSync(target)) rmSync(target, { recursive: true, force: true });
      (nodeFs as unknown as { renameSync(from: string, to: string): void }).renameSync(staging, target);
      verifyInstalledSkill(target);
    } catch (error) {
      rmSync(staging, { recursive: true, force: true });
      return { ok: false as const, error: { code: error && typeof error === "object" && "code" in error ? String(error.code) : "DELIVERY_DIGEST_MISMATCH", message: error instanceof Error ? error.message : String(error) } };
    }
    return { ok: true as const, target: flags.target, skill: "koubo-clip", source: skillPath, installed_path: target };
  }
  return { ok: false as const, error: { code: "UNKNOWN_SKILLS_COMMAND", message: `Unknown skills command: ${subcommand ?? ""}` } };
}

function defaultSkillInstallRoot(target: string | undefined): string | undefined {
  const home = process.env.HOME ?? homedir();
  if (target === "codex") return join(home, ".agents", "skills");
  if (target === "claude") return join(home, ".claude", "skills");
  if (target === "hermes") return join(home, ".hermes", "skills");
  return undefined;
}

function projectHelp() {
  return `koubo-clip project

Usage:
${projectCommands.map((item) => `  koubo-clip project ${item}`).join("\n")}`;
}

function loadLocalEnv() {
  loadEnvFile(join(process.cwd(), ".env"));
  loadEnvFile(join(process.env.HOME ?? homedir(), ".koubo-clip", ".env"));
}

function shouldLoadLocalEnv(argv: string[]): boolean {
  if (argv[0] === "--version" || argv[0] === "-v" || argv[0] === "capabilities" || argv[0] === "artifact") return false;
  if (argv[0] === "project" && argv[1] === "status") return false;
  const explicitMode = explicitProviderMode(argv);
  if (explicitMode) return explicitMode === "standalone";
  return projectProviderModeFromMetadata(argv) !== "platform";
}

function softwareCapabilities(): CapabilitiesArtifact {
  return {
    contract_version: "1.0",
    cli_version: cliVersion(),
    project_commands: projectCommands.map((item) => item.split(" ", 1)[0]),
    artifact_schema_versions: {
      "project.json": "1.0",
      "artifact-manifest.json": "1.0",
      "sources.json": "2.0",
      "source-materialization.json": "1.0",
      "edl.json": "2.0",
      "render-contract.json": "1.0",
      "production-proposal.json": "3.0",
      "edit-plan.json": "1.0",
      "asset-usage-plan.json": "1.0",
      "enrichment-plan.json": "2.0",
      "render-result.json": "1.0",
      "inspection.json": "1.0",
    },
    features: {
      source_frames: true,
      semantic_focus: true,
      visual_acquisition: true,
      music_acquisition: true,
      canonical_enrichment: true,
      hyperframes_recut: true,
      render_result: true,
      structured_inspection: true,
      structured_project_status: true,
      detached_source: true,
      external_frame_evidence: true,
      portable_edl: true,
      render_contract_export: true,
      render_contract_consume_strict: true,
      source_binding: true,
      artifact_contract_discovery: true,
      artifact_validation_aggregate: true,
    },
    provider_modes: {
      standalone: { providers: "cli-managed", artifact_contract: "shared" },
      platform: { providers: "host-managed", artifact_contract: "shared" },
    },
    render_inputs: ["edl", "transcript", "source:*", "enrichment-plan?", "asset:*?"],
    inspect_inputs: ["render-result"],
    error_codes: [
      "ASSET_USAGE_PLAN_CONFLICT",
      "LINEAGE_UNPROVEN",
      "ARTIFACT_PENDING_VALIDATION",
      "ARTIFACT_STALE",
      "ARTIFACT_INVALID",
      "RENDER_RESULT_STALE",
      "RENDER_OUTPUT_HASH_MISMATCH",
      "SOURCE_INPUT_MODE_CONFLICT",
      "SOURCE_MANIFEST_INVALID",
      "SOURCE_BINDING_REQUIRED",
      "SOURCE_IDENTITY_MISMATCH",
      "SOURCE_MATERIALIZATION_INVALID",
      "CONTRACT_SCHEMA_UNSUPPORTED",
      "CONTRACT_INVALID",
      "CONTRACT_DIGEST_MISMATCH",
      "CONTRACT_RUNTIME_MISMATCH",
      "CONTRACT_CAPABILITY_MISSING",
      "CONTRACT_ASSET_HASH_MISMATCH",
      "UNSAFE_CONTRACT_PATH",
      "SOURCE_BINDING_MISSING",
      "SOURCE_BINDING_UNKNOWN",
      "SOURCE_IDENTITY_HASH_MISMATCH",
      "SOURCE_IDENTITY_PROBE_MISMATCH",
      "RENDER_PREFLIGHT_FAILED",
      "CONTRACT_RENDER_FAILED",
      "RENDER_OUTPUT_INVALID",
      "INSPECTION_ACCEPTANCE_FAILED",
      "ARTIFACT_CONTRACT_UNSUPPORTED",
      "ARTIFACT_VALIDATION_FAILED",
      "PROPOSAL_REQUIRED",
      "PROPOSAL_SELECTION_PENDING_VALIDATION",
      "PROPOSAL_SELECTION_MISMATCH",
      "PROPOSAL_EXECUTION_MISMATCH",
      "EVIDENCE_PROBE_UNAVAILABLE",
      "EVIDENCE_PROBE_FAILED",
      "EVIDENCE_PROBE_OUTPUT_INVALID",
      "EVIDENCE_CODEC_MISMATCH",
      "EVIDENCE_DIMENSION_MISMATCH",
      "EVIDENCE_SIZE_MISMATCH",
      "EVIDENCE_HASH_MISMATCH",
      "EVIDENCE_BINDING_MISMATCH",
    ],
    capability_ids: ["detached_source.v1", "external_frame_evidence.v1", "portable_edl.v1", "render_contract.export.v1", "render_contract.consume_strict.v1", "source_binding.v1", "artifact_contract.discovery.v1", "artifact_validation.aggregate.v1"],
    delivery: { manifest_schema_version: "3.0", aggregate_delivery_digest: true, cli_version: cliVersion(), runtime_dependencies: ["gsap@3.15.0", "hyperframes@0.7.36"] },
    render_contract: { schema_version: "1.0", exact_runtime_compatibility: true, immutable_directory_bundle: true },
    artifact_contracts: artifactContractIndex(),
  };
}

function explicitProviderMode(argv: string[]): ProviderExecutionMode | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--provider-mode") continue;
    const value = argv[index + 1];
    if (value === "standalone" || value === "platform") return value;
    return undefined;
  }
  return undefined;
}

function projectProviderModeFromMetadata(argv: string[]): ProviderExecutionMode | undefined {
  if (argv[0] !== "project") return undefined;
  const { positionals } = parseArgs(argv.slice(1));
  const [subcommand, projectPath] = positionals;
  if (!subcommand || subcommand === "create" || !projectPath) return undefined;
  const metadataPath = join(projectPath, projectArtifacts.project);
  if (!existsSync(metadataPath)) return undefined;
  try {
    return parseProjectMetadata(JSON.parse(readFileSync(metadataPath, "utf8"))).provider_execution_mode;
  } catch {
    return undefined;
  }
}

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}

function providerStatus(mode: ProviderExecutionMode): Record<string, boolean | "host-managed" | "disabled"> {
  if (mode === "platform") {
    return {
      minimax_music: "host-managed",
      cloudflare_whisper: "host-managed",
      freesound: "host-managed",
      music_library_dir: "disabled",
      iconify: "host-managed",
      lordicon: "host-managed",
      shadcn_mcp_handoff: "host-managed",
      "21st_mcp_handoff": "host-managed",
    };
  }
  return {
    minimax_music: Boolean(process.env.MINIMAX_API_KEY),
    cloudflare_whisper: Boolean(process.env.GATEWAY_CLOUDFLARE_AI_ACCOUNT_ID && process.env.GATEWAY_CLOUDFLARE_AI_API_TOKEN && process.env.GATEWAY_CLOUDFLARE_AI_TRANSCRIPTION_MODEL),
    freesound: Boolean(process.env.FREESOUND_API_KEY),
    music_library_dir: Boolean(process.env.MUSIC_LIBRARY_DIR),
    iconify: true,
    lordicon: Boolean(process.env.LORDICON_API_KEY),
    shadcn_mcp_handoff: true,
    "21st_mcp_handoff": true,
  };
}

async function safeProjectCommand(argv: string[]) {
  try {
    return await runProjectCommand(argv);
  } catch (error) {
    const subcommand = argv[0];
    return {
      ok: false as const,
      command: subcommand ? `project.${subcommand}` : "project",
      error: projectError(error),
    };
  }
}

function projectError(error: unknown) {
  const source = error && typeof error === "object" ? error as Record<string, unknown> : {};
  return {
    code: typeof source.code === "string" ? source.code : "PROJECT_COMMAND_FAILED",
    message: error instanceof Error ? error.message : String(error),
    ...(typeof source.remediation === "string" ? { remediation: source.remediation } : {}),
    ...(typeof source.artifact === "string" ? { artifact: source.artifact } : {}),
    ...(typeof source.stage === "string" ? { stage: source.stage } : {}),
  };
}

async function runProjectCommand(argv: string[]) {
  const { positionals, flags } = parseArgs(argv);
  const [subcommand, ...rest] = positionals;
  const mode = providerMode(flags["provider-mode"]);
  if (subcommand === "create") return createProject(rest, { projectPath: flags.project, providerMode: mode, sourceManifestPath: flags["source-manifest"] });
  if (subcommand === "explore") return await exploreProject(required(rest[0], "project path"), { asr: asrMode(flags.asr), asrProvider: asrProvider(flags["asr-provider"]), providerMode: mode });
  if (subcommand === "source-frames") return sourceFramesProject(required(rest[0], "project path"), { providerMode: mode, importPath: flags.import });
  if (subcommand === "review") return reviewProject(required(rest[0], "project path"), { providerMode: mode });
  if (subcommand === "proposal") return proposalProject(required(rest[0], "project path"), { providerMode: mode });
  if (subcommand === "element-catalog") return elementCatalogProject(required(rest[0], "project path"), { providerMode: mode });
  if (subcommand === "focus-candidates") return focusCandidatesProject(required(rest[0], "project path"), { providerMode: mode });
  if (subcommand === "focus-frames") return focusFramesProject(required(rest[0], "project path"), { providerMode: mode, importPath: flags.import });
  if (subcommand === "focus-grounding") return focusGroundingProject(required(rest[0], "project path"), { providerMode: mode });
  if (subcommand === "focus-review") return focusReviewProject(required(rest[0], "project path"), { providerMode: mode });
  if (subcommand === "music-catalog") return musicCatalogProject(required(rest[0], "project path"), { providerMode: mode });
  if (subcommand === "music-acquire") return await musicAcquireProject(required(rest[0], "project path"), { providerMode: mode });
  if (subcommand === "music-review") return await musicReviewProject(required(rest[0], "project path"), { providerMode: mode });
  if (subcommand === "visual-catalog") return visualCatalogProject(required(rest[0], "project path"), { providerMode: mode });
  if (subcommand === "visual-search") return await visualSearchProject(required(rest[0], "project path"), { providerMode: mode });
  if (subcommand === "visual-acquire") return await visualAcquireProject(required(rest[0], "project path"), { providerMode: mode });
  if (subcommand === "visual-review") return visualReviewProject(required(rest[0], "project path"), { providerMode: mode });
  if (subcommand === "enrich-plan") return enrichPlanProject(required(rest[0], "project path"), { providerMode: mode });
  if (subcommand === "compile-edl") return compileEdlProject(required(rest[0], "project path"));
  if (subcommand === "render") return renderProject(required(rest[0], "project path"), { providerMode: mode });
  if (subcommand === "inspect") return inspectProject(required(rest[0], "project path"), { providerMode: mode });
  if (subcommand === "status") {
    const data = projectStatus(required(rest[0], "project path"));
    const fatal = data.blockers.find((item) => item.code === "PROJECT_METADATA_INVALID" && item.artifact === projectArtifacts.project);
    if (fatal) throw projectStatusError(fatal);
    return { ok: true as const, command: "project.status" as const, data };
  }
  return { ok: false as const, command: "project", error: { code: "UNKNOWN_PROJECT_COMMAND", message: `Unknown project command: ${subcommand ?? ""}` } };
}

function projectStatusError(blocker: { code: string; message: string; artifact?: string; remediation: string }) {
  const error = new Error(blocker.message) as Error & {
    code: string;
    artifact?: string;
    remediation: string;
    stage: string;
  };
  error.code = blocker.code;
  error.artifact = blocker.artifact;
  error.remediation = blocker.remediation;
  error.stage = "status";
  return error;
}

function parseArgs(argv: string[]) {
  const positionals: string[] = [];
  const flags: Record<string, string | undefined> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg.startsWith("--")) {
      const name = arg.slice(2);
      const next = argv[index + 1];
      flags[name] = next && !next.startsWith("--") ? next : "true";
      if (flags[name] === next) index += 1;
    } else {
      positionals.push(arg);
    }
  }
  return { positionals, flags };
}

function asrMode(value: string | undefined): AsrMode {
  switch (value) {
    case undefined:
      return "auto";
    case "auto":
    case "off":
    case "external":
      return value;
    default:
      throw new Error(`Invalid --asr value: ${value}`);
  }
}

function asrProvider(value: string | undefined): AsrProvider | undefined {
  switch (value) {
    case undefined:
      return undefined;
    case "cloudflare-whisper":
    case "whisper-cli":
      return value;
    default:
      throw new Error(`Invalid --asr-provider value: ${value}`);
  }
}

function providerMode(value: string | undefined, defaultMode?: ProviderExecutionMode): ProviderExecutionMode | undefined {
  switch (value) {
    case undefined:
      return defaultMode;
    case "standalone":
    case "platform":
      return value;
    default:
      throw new Error(`Invalid --provider-mode value: ${value}`);
  }
}

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

if (import.meta.main) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
