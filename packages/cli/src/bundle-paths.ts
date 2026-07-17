import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const sourceRoot = resolve(moduleDir, "..", "..", "..");
const binaryRoot = resolve(dirname(process.execPath), "..");
declare const KOUBO_CLIP_BUILD_VERSION: string | undefined;
let resolvedCliVersion: string | undefined;

export function cliVersion(): string {
  if (resolvedCliVersion) return resolvedCliVersion;
  if (typeof KOUBO_CLIP_BUILD_VERSION !== "undefined" && KOUBO_CLIP_BUILD_VERSION) {
    resolvedCliVersion = KOUBO_CLIP_BUILD_VERSION;
    return resolvedCliVersion;
  }
  try {
    const value = JSON.parse(readFileSync(join(sourceRoot, "package.json"), "utf8")) as { version?: unknown };
    if (typeof value.version === "string" && value.version) {
      resolvedCliVersion = value.version;
      return resolvedCliVersion;
    }
  } catch {
    // Compiled packages inject KOUBO_CLIP_BUILD_VERSION and do not need package.json.
  }
  resolvedCliVersion = "0.0.0-unknown";
  return resolvedCliVersion;
}

export function resolveHyperframesRoot(): string {
  return firstExisting(
    [
      process.env.KOUBO_CLIP_HYPERFRAMES_ROOT,
      join(binaryRoot, "resources", "hyperframes"),
      join(sourceRoot, "packages", "cli", "vendor", "hyperframes"),
    ],
    (path) => existsSync(join(path, "registry")) && existsSync(join(path, "resources")),
  );
}

export function resolveKouboClipSkillRoot(): string {
  return firstExisting(
    [
      process.env.KOUBO_CLIP_SKILL_ROOT,
      join(binaryRoot, "skills", "koubo-clip"),
      join(sourceRoot, "skills", "koubo-clip"),
    ],
    (path) => existsSync(join(path, "SKILL.md")),
  );
}

export function resolveDistributionRoot(): string {
  return firstExisting(
    [process.env.KOUBO_CLIP_DISTRIBUTION_ROOT, binaryRoot, sourceRoot],
    (path) => existsSync(join(path, "delivery-manifest.json")) || existsSync(join(path, "package.json")),
  );
}

export function resolveHyperframesBinary(): string {
  if (process.env.KOUBO_CLIP_HYPERFRAMES_BIN) return process.env.KOUBO_CLIP_HYPERFRAMES_BIN;
  const candidates = [
    join(sourceRoot, "node_modules", ".bin", "hyperframes"),
    join(dirname(sourceRoot), ".bin", "hyperframes"),
    join(binaryRoot, "runtime", "bin", "hyperframes"),
    join(process.cwd(), "node_modules", ".bin", "hyperframes"),
  ];
  return candidates.find((path) => existsSync(path)) ?? "hyperframes";
}

export function bundleInfo() {
  const skillPath = resolveKouboClipSkillRoot();
  const hyperframesRoot = resolveHyperframesRoot();
  return {
    hyperframes_resources: existsSync(join(hyperframesRoot, "registry")) && existsSync(join(hyperframesRoot, "resources")),
    koubo_clip_skill: existsSync(join(skillPath, "SKILL.md")),
    skill_path: skillPath,
    hyperframes_path: hyperframesRoot,
  };
}

function firstExisting(candidates: Array<string | undefined>, valid: (path: string) => boolean): string {
  for (const candidate of candidates) {
    if (candidate && valid(candidate)) return candidate;
  }
  return candidates.find(Boolean) ?? "";
}
