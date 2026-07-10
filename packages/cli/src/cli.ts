#!/usr/bin/env bun

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { bundleInfo, resolveKouboClipSkillRoot } from "./bundle-paths";
import { parseProjectMetadata, projectArtifacts, type ProviderExecutionMode } from "./artifacts";
import {
  commandExists,
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
  koubo-clip doctor [--provider-mode standalone|platform]
  koubo-clip skills path [--json]
  koubo-clip skills install --target codex|claude|hermes [--dest <dir>] [--force]
  koubo-clip project create <video...> [--provider-mode standalone|platform]
  koubo-clip project explore <project> [--provider-mode standalone|platform] [--asr auto|off|external] [--asr-provider cloudflare-whisper|whisper-cli]
  koubo-clip project source-frames <project> [--provider-mode standalone|platform] [--json]
  koubo-clip project review <project>
  koubo-clip project proposal <project>
  koubo-clip project element-catalog <project>
  koubo-clip project focus-candidates <project>
  koubo-clip project focus-frames <project>
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
  koubo-clip project render <project>
  koubo-clip project inspect <project>
`;

const projectCommands = [
  "create <video...> [--provider-mode standalone|platform]",
  "explore <project> [--provider-mode standalone|platform] [--asr auto|off|external] [--asr-provider cloudflare-whisper|whisper-cli]",
  "source-frames <project> [--provider-mode standalone|platform] [--json]",
  "review <project> [--provider-mode standalone|platform]",
  "proposal <project> [--provider-mode standalone|platform]",
  "element-catalog <project> [--provider-mode standalone|platform]",
  "focus-candidates <project> [--provider-mode standalone|platform]",
  "focus-frames <project> [--provider-mode standalone|platform]",
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
  "render <project> [--provider-mode standalone|platform]",
  "inspect <project> [--provider-mode standalone|platform]",
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
        whisper_cli: commandExists("whisper-cli"),
        bundle: bundleInfo(),
        providers: providerStatus(mode),
      }),
    );
    return 0;
  }

  if (command === "skills") {
    const result = runSkillsCommand(argv.slice(1));
    const write = result.ok ? out : err;
    if ("text" in result && typeof result.text === "string") write(result.text);
    else write(JSON.stringify(result));
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

function runSkillsCommand(argv: string[]) {
  const { positionals, flags } = parseArgs(argv);
  const [subcommand] = positionals;
  const skillPath = resolveKouboClipSkillRoot();
  if (subcommand === "path") {
    const data = { ok: true as const, skill: "koubo-clip", path: skillPath, exists: existsSync(join(skillPath, "SKILL.md")) };
    return flags.json ? data : { ok: true as const, text: skillPath };
  }
  if (subcommand === "install") {
    const installRoot = defaultSkillInstallRoot(flags.target);
    if (!installRoot) return { ok: false as const, error: { code: "INVALID_SKILLS_TARGET", message: "Use --target codex, claude, or hermes" } };
    if (!existsSync(join(skillPath, "SKILL.md"))) return { ok: false as const, error: { code: "SKILL_NOT_FOUND", message: `koubo-clip skill not found: ${skillPath}` } };
    const root = flags.dest ?? installRoot;
    const target = join(root, "koubo-clip");
    if (existsSync(target) && !flags.force) return { ok: false as const, error: { code: "SKILL_EXISTS", message: `${target} already exists; pass --force to overwrite` } };
    mkdirSync(root, { recursive: true });
    if (existsSync(target)) rmSync(target, { recursive: true, force: true });
    cpSync(skillPath, target, { recursive: true });
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
  const explicitMode = explicitProviderMode(argv);
  if (explicitMode) return explicitMode === "standalone";
  return projectProviderModeFromMetadata(argv) !== "platform";
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
    return {
      ok: false as const,
      command: "project",
      error: { code: "PROJECT_COMMAND_FAILED", message: error instanceof Error ? error.message : String(error) },
    };
  }
}

async function runProjectCommand(argv: string[]) {
  const { positionals, flags } = parseArgs(argv);
  const [subcommand, ...rest] = positionals;
  const mode = providerMode(flags["provider-mode"]);
  if (subcommand === "create") return createProject(rest, { projectPath: flags.project, providerMode: mode });
  if (subcommand === "explore") return await exploreProject(required(rest[0], "project path"), { asr: asrMode(flags.asr), asrProvider: asrProvider(flags["asr-provider"]), providerMode: mode });
  if (subcommand === "source-frames") return sourceFramesProject(required(rest[0], "project path"), { providerMode: mode });
  if (subcommand === "review") return reviewProject(required(rest[0], "project path"), { providerMode: mode });
  if (subcommand === "proposal") return proposalProject(required(rest[0], "project path"), { providerMode: mode });
  if (subcommand === "element-catalog") return elementCatalogProject(required(rest[0], "project path"), { providerMode: mode });
  if (subcommand === "focus-candidates") return focusCandidatesProject(required(rest[0], "project path"), { providerMode: mode });
  if (subcommand === "focus-frames") return focusFramesProject(required(rest[0], "project path"), { providerMode: mode });
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
  if (subcommand === "render") return renderProject(required(rest[0], "project path"), { providerMode: mode });
  if (subcommand === "inspect") return inspectProject(required(rest[0], "project path"), { providerMode: mode });
  return { ok: false as const, command: "project", error: { code: "UNKNOWN_PROJECT_COMMAND", message: `Unknown project command: ${subcommand ?? ""}` } };
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
