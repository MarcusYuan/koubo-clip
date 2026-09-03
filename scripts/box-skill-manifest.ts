import { createHash } from "node:crypto";
import * as nodeFs from "node:fs";
import { join, relative } from "node:path";

type Json = Record<string, any>;

export type SkillManifestFile = {
  path: string;
  sha256: string;
  size: number;
};

export function parseSkillManifestV3(json: string): Json {
  const manifest = JSON.parse(json) as Json;
  verifySkillManifestV3(manifest);
  return manifest;
}

export function verifySkillManifestV3(manifest: Json): void {
  expect(manifest && typeof manifest === "object" && !Array.isArray(manifest), "Skill manifest must be an object");
  expect(manifest.manifest_version === "3", "Skill manifest_version must be 3");
  expect(manifest.managed_cli_entry_contract === "box-home-bin.v1", "Skill manifest v3 must use managed_cli_entry_contract=box-home-bin.v1");
  expect(typeof manifest.id === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.id), "Skill id is invalid");
  expect(typeof manifest.version === "string" && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version), "Skill version must be SemVer");
  expect(manifest.entrypoint === "SKILL.md", "Skill entrypoint must be SKILL.md");
  verifyPresentation(manifest.presentation);
  verifySkillManifestFiles(manifest.files);
  verifyCliDependencies(manifest.cli_dependencies);
}

function verifyPresentation(value: unknown): void {
  expect(value && typeof value === "object" && !Array.isArray(value), "Skill presentation is required");
  const presentation = value as Json;
  expect(presentation.default_locale === "en", "Skill presentation.default_locale must be en");
  expect(presentation.localizations && typeof presentation.localizations === "object", "Skill presentation.localizations is required");
  for (const locale of ["en", "zh-CN"]) {
    const localized = presentation.localizations[locale];
    expect(localized && typeof localized.display_name === "string" && localized.display_name.length > 0, `Skill presentation ${locale} display_name is required`);
    expect(typeof localized.short_description === "string" && localized.short_description.length > 0, `Skill presentation ${locale} short_description is required`);
  }
}

export function verifySkillManifestFiles(files: unknown): asserts files is SkillManifestFile[] {
  expect(Array.isArray(files), "Skill files must be an array");
  const paths = new Set<string>();
  for (const raw of files) {
    expect(raw && typeof raw === "object" && !Array.isArray(raw), "Skill file entry must be an object");
    const entry = raw as Json;
    expectExactKeys(entry, ["path", "sha256", "size"], "Skill file entry");
    expect(isSafeRelativePath(entry.path), `Skill file path is unsafe: ${String(entry.path)}`);
    expect(entry.path !== "skill.box.json", "skill.box.json must not appear in files[]");
    expect(!paths.has(entry.path), `duplicate Skill file path: ${entry.path}`);
    expect(/^[a-f0-9]{64}$/.test(entry.sha256), `Skill file SHA-256 is invalid: ${entry.path}`);
    expect(Number.isInteger(entry.size) && entry.size >= 0, `Skill file size is invalid: ${entry.path}`);
    paths.add(entry.path);
  }
  expect(paths.has("SKILL.md"), "Skill files must list SKILL.md");
}

export function verifySkillPayloadDirectory(packageRoot: string, files: unknown): void {
  verifySkillManifestFiles(files);
  const declared = new Map((files as SkillManifestFile[]).map((entry) => [entry.path, entry]));
  const actualFiles = walkFiles(packageRoot)
    .map((path) => ({ path, relativePath: relative(packageRoot, path).replaceAll("\\", "/") }))
    .filter((entry) => entry.relativePath !== "skill.box.json");
  expect(actualFiles.length === declared.size, "Skill package payload count does not match files[]");
  for (const { path, relativePath } of actualFiles) {
    const entry = declared.get(relativePath);
    expect(Boolean(entry), `Skill package contains undeclared payload: ${relativePath}`);
    expect(nodeFs.statSync(path).size === entry!.size, `Skill payload size mismatch: ${relativePath}`);
    expect(sha256File(path) === entry!.sha256, `Skill payload SHA-256 mismatch: ${relativePath}`);
  }
  for (const path of declared.keys()) {
    expect(actualFiles.some((entry) => entry.relativePath === path), `Skill package is missing declared payload: ${path}`);
  }
}

function verifyCliDependencies(value: unknown): void {
  expect(Array.isArray(value) && value.length > 0, "Skill cli_dependencies must be a non-empty array");
  expect(value.some((dependency: Json) => dependency?.required === true), "Skill must have a required CLI dependency");
  for (const raw of value) {
    expect(raw && typeof raw === "object" && !Array.isArray(raw), "Skill CLI dependency must be an object");
    const dependency = raw as Json;
    expect(typeof dependency.id === "string" && dependency.id.length > 0, "Skill CLI dependency id is required");
    expect(typeof dependency.version === "string" && dependency.version.length > 0, "Skill CLI dependency version is required");
    expect(typeof dependency.required === "boolean", "Skill CLI dependency required must be boolean");
    expect(Array.isArray(dependency.commands) && dependency.commands.length > 0, "Skill CLI dependency commands must be a non-empty array");
    for (const command of dependency.commands) {
      expect(typeof command === "string" && /^[a-z0-9][a-z0-9-]*(?: [a-z0-9][a-z0-9-]*)*$/.test(command), `Skill CLI dependency command must be a bare subcommand or command prefix: ${String(command)}`);
    }
  }
}

function walkFiles(dir: string): string[] {
  const output: string[] = [];
  for (const name of nodeFs.readdirSync(dir).sort()) {
    const path = join(dir, name);
    const stat = (nodeFs as any).lstatSync(path) as { isSymbolicLink(): boolean; isDirectory(): boolean; isFile(): boolean };
    expect(!stat.isSymbolicLink(), `Skill package must not contain symlinks: ${relative(dir, path)}`);
    if (stat.isDirectory()) output.push(...walkFiles(path));
    else if (stat.isFile()) output.push(path);
  }
  return output;
}

function isSafeRelativePath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.startsWith("/") || value.endsWith("/") || value.includes("\\") || /^[A-Za-z]:/.test(value)) return false;
  return value.split("/").every((part) => part.length > 0 && part !== "." && part !== "..");
}

function expectExactKeys(value: Json, keys: string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  expect(JSON.stringify(actual) === JSON.stringify(expected), `${label} keys mismatch: expected ${expected.join(",")}, got ${actual.join(",")}`);
}

function sha256File(path: string): string {
  return createHash("sha256").update(nodeFs.readFileSync(path)).digest("hex");
}

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
