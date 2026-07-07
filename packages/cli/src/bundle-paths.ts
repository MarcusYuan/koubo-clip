import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const sourceRoot = resolve(moduleDir, "..", "..", "..");
const binaryRoot = resolve(dirname(process.execPath), "..");

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
