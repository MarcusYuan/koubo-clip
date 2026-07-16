import { existsSync, cpSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { resolveHyperframesRoot } from "./bundle-paths";

export type VendoredRegistryItemType = "hyperframes:block" | "hyperframes:component" | "hyperframes:example";
export type VendoredRegistryFileType =
  | "hyperframes:composition"
  | "hyperframes:asset"
  | "hyperframes:snippet"
  | "hyperframes:style"
  | "hyperframes:timeline"
  | "asset"
  | "registry:asset";
export type VendoredElementType = "registry_block" | "registry_component" | "animation_rule" | "caption_identity" | "sfx";

export type VendoredRegistryFile = {
  path: string;
  target: string;
  type: VendoredRegistryFileType;
};

export type VendoredRegistryItem = {
  name: string;
  type: VendoredRegistryItemType;
  title?: string;
  description?: string;
  dimensions?: { width: number; height: number };
  duration?: number;
  tags?: string[];
  files: VendoredRegistryFile[];
  registryDependencies?: string[];
  preview?: { video?: string; poster?: string };
};

export type VendoredRegistryManifest = {
  name?: string;
  homepage?: string;
  items: Array<{ name: string; type: VendoredRegistryItemType }>;
};

export type VendoredInstalledFile = {
  source: string;
  target: string;
  type: VendoredRegistryFileType;
};

export type VendoredInstallResult = {
  items: VendoredRegistryItem[];
  files: VendoredInstalledFile[];
};

export type VendoredElementCatalogItem = {
  element_id: string;
  element_type: VendoredElementType;
  source: string;
  title: string;
  description?: string;
  tags: string[];
  renderable: boolean;
  guidance_only: boolean;
  registry_type?: VendoredRegistryItemType;
  dependencies: string[];
  file_count: number;
  source_path: string;
  duration_seconds?: number;
  dimensions?: { width: number; height: number };
  preview?: { video?: string; poster?: string };
};

export type VendoredHyperframesStats = {
  registry: {
    blocks: number;
    components: number;
    examples: number;
    registry_items: number;
  };
  resources: {
    caption_themes: number;
    caption_dna: number;
    animation_rules: number;
    animation_blueprints: number;
    sfx: number;
    motion_categories: number;
    talking_head_references: number;
    frame_presets: number;
  };
};

export const VENDORED_HYPERFRAMES_ROOT = resolveHyperframesRoot();
export const VENDORED_REGISTRY_ROOT = join(VENDORED_HYPERFRAMES_ROOT, "registry");
export const VENDORED_HYPERFRAMES_RESOURCES_ROOT = join(VENDORED_HYPERFRAMES_ROOT, "resources");

const ITEM_TYPE_DIRS: Record<VendoredRegistryItemType, string> = {
  "hyperframes:block": "blocks",
  "hyperframes:component": "components",
  "hyperframes:example": "examples",
};

const ELEMENT_TYPE_TO_REGISTRY_TYPE: Partial<Record<VendoredElementType, VendoredRegistryItemType>> = {
  registry_block: "hyperframes:block",
  registry_component: "hyperframes:component",
};

export function loadVendoredRegistryManifest(): VendoredRegistryManifest {
  const manifestPath = join(VENDORED_REGISTRY_ROOT, "registry.json");
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as VendoredRegistryManifest;
    return {
      name: manifest.name,
      homepage: manifest.homepage,
      items: manifest.items.map((item) => ({ name: item.name, type: registryItemType(item.type, `${item.name}.type`) })),
    };
  }
  return {
    name: "vendored-hyperframes",
    items: (Object.keys(ITEM_TYPE_DIRS) as VendoredRegistryItemType[]).flatMap((type) =>
      safeDirEntries(join(VENDORED_REGISTRY_ROOT, ITEM_TYPE_DIRS[type])).map((name) => ({ name, type })),
    ),
  };
}

export function listVendoredRegistryItems(type?: VendoredRegistryItemType): VendoredRegistryItem[] {
  return loadVendoredRegistryManifest().items
    .filter((entry) => !type || entry.type === type)
    .map((entry) => loadVendoredRegistryItem(entry.name, entry.type))
    .filter((item): item is VendoredRegistryItem => Boolean(item));
}

export function loadVendoredRegistryItem(name: string, type?: VendoredRegistryItemType): VendoredRegistryItem {
  const searchTypes = type ? [type] : (Object.keys(ITEM_TYPE_DIRS) as VendoredRegistryItemType[]);
  for (const itemType of searchTypes) {
    const itemDir = join(VENDORED_REGISTRY_ROOT, ITEM_TYPE_DIRS[itemType], name);
    const itemPath = join(itemDir, "registry-item.json");
    if (!existsSync(itemPath)) continue;
    const raw = JSON.parse(readFileSync(itemPath, "utf8")) as Record<string, unknown>;
    const files = registryFiles(raw.files, `${name}.files`);
    return {
      name: string(raw.name ?? name, `${name}.name`),
      type: registryItemType(raw.type ?? itemType, `${name}.type`),
      title: raw.title === undefined ? undefined : string(raw.title, `${name}.title`),
      description: raw.description === undefined ? undefined : string(raw.description, `${name}.description`),
      dimensions: raw.dimensions === undefined ? undefined : dimensions(raw.dimensions, `${name}.dimensions`),
      duration: raw.duration === undefined ? undefined : number(raw.duration, `${name}.duration`),
      tags: stringArray(raw.tags ?? [], `${name}.tags`),
      files,
      registryDependencies: stringArray(raw.registryDependencies ?? [], `${name}.registryDependencies`),
      preview: raw.preview === undefined ? undefined : preview(raw.preview, `${name}.preview`),
    };
  }
  throw new Error(`unknown vendored HyperFrames registry item: ${name}`);
}

export function resolveVendoredRegistryItemWithDependencies(name: string, type?: VendoredRegistryItemType): VendoredRegistryItem[] {
  const result: VendoredRegistryItem[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (itemName: string, itemType?: VendoredRegistryItemType) => {
    const item = loadVendoredRegistryItem(itemName, itemType);
    const key = `${item.type}:${item.name}`;
    if (visited.has(key)) return;
    if (visiting.has(key)) throw new Error(`cyclic HyperFrames registry dependency: ${item.name}`);
    visiting.add(key);
    for (const dependency of item.registryDependencies ?? []) visit(dependency);
    visiting.delete(key);
    visited.add(key);
    result.push(item);
  };

  visit(name, type);
  return result;
}

export function installVendoredRegistryItem(name: string, destinationRoot: string, type?: VendoredRegistryItemType): VendoredInstallResult {
  const items = resolveVendoredRegistryItemWithDependencies(name, type);
  const files: VendoredInstalledFile[] = [];
  for (const item of items) {
    const itemRoot = join(VENDORED_REGISTRY_ROOT, ITEM_TYPE_DIRS[item.type], item.name);
    for (const file of item.files) {
      const source = safeJoin(itemRoot, file.path, `${item.name}.files.path`);
      const target = safeJoin(destinationRoot, file.target, `${item.name}.files.target`);
      mkdirSync(dirname(target), { recursive: true });
      if (statSync(source).isDirectory()) {
        cpSync(source, target, { recursive: true });
      } else {
        cpSync(source, target);
      }
      if (file.type === "hyperframes:composition" && extname(target).toLowerCase() === ".html") {
        markInstalledComposition(target, item.name);
      }
      if (item.type === "hyperframes:component" && file.type === "hyperframes:snippet" && extname(target).toLowerCase() === ".html") {
        wrapInstalledComponentSnippet(target, item.name);
      }
      files.push({ source, target, type: file.type });
    }
  }
  return { items, files };
}

export function listVendoredElementCatalog(): VendoredElementCatalogItem[] {
  const registryItems = listVendoredRegistryItems().map(registryElement);
  return [
    ...registryItems,
    builtinCaptionIdentity(),
    ...captionJsonElements("embedded-captions/themes", join(VENDORED_HYPERFRAMES_RESOURCES_ROOT, "embedded-captions", "themes"), "caption-theme"),
    ...captionJsonElements("embedded-captions/dna", join(VENDORED_HYPERFRAMES_RESOURCES_ROOT, "embedded-captions", "dna"), "caption-dna"),
    ...markdownElements("animation_rule", "hyperframes-animation/rules", join(VENDORED_HYPERFRAMES_RESOURCES_ROOT, "hyperframes-animation", "rules"), "animation-rule"),
    ...markdownElements("animation_rule", "hyperframes-animation/blueprints", join(VENDORED_HYPERFRAMES_RESOURCES_ROOT, "hyperframes-animation", "blueprints"), "animation-blueprint"),
    ...motionCategoryElements(),
    ...talkingHeadReferenceElements(),
    ...framePresetElements(),
    ...sfxElements(),
  ].sort((a, b) => `${a.element_type}:${a.element_id}`.localeCompare(`${b.element_type}:${b.element_id}`));
}

export function getVendoredElement(elementId: string, elementType?: VendoredElementType): VendoredElementCatalogItem | undefined {
  return listVendoredElementCatalog().find((item) => item.element_id === elementId && (!elementType || item.element_type === elementType));
}

export function assertKnownVendoredElement(elementId: string, elementType: VendoredElementType, name = "element_id"): VendoredElementCatalogItem {
  const registryType = ELEMENT_TYPE_TO_REGISTRY_TYPE[elementType];
  if (registryType) {
    loadVendoredRegistryItem(elementId, registryType);
  }
  const item = getVendoredElement(elementId, elementType);
  if (item) return item;
  throw new Error(`${name} references unknown HyperFrames ${elementType}: ${elementId}`);
}

export function getVendoredSfx(sfxId: string): { id: string; file: string; path: string; duration: number; description: string } {
  const manifest = readSfxManifest();
  const entry = manifest[sfxId];
  if (!entry) throw new Error(`unknown bundled SFX: ${sfxId}`);
  const sfxPath = join(VENDORED_HYPERFRAMES_RESOURCES_ROOT, "hyperframes-media", "assets", "sfx", entry.file);
  return { id: sfxId, file: entry.file, path: sfxPath, duration: entry.duration, description: entry.description };
}

export function assertSafeVendoredTarget(root: string, target: string, name = "target"): string {
  return safeJoin(root, target, name);
}

export function getVendoredHyperframesStats(): VendoredHyperframesStats {
  return {
    registry: {
      blocks: countDirs(join(VENDORED_REGISTRY_ROOT, "blocks")),
      components: countDirs(join(VENDORED_REGISTRY_ROOT, "components")),
      examples: countDirs(join(VENDORED_REGISTRY_ROOT, "examples")),
      registry_items: countRegistryItemFiles(VENDORED_REGISTRY_ROOT),
    },
    resources: {
      caption_themes: countFiles(join(VENDORED_HYPERFRAMES_RESOURCES_ROOT, "embedded-captions", "themes"), ".json"),
      caption_dna: countFiles(join(VENDORED_HYPERFRAMES_RESOURCES_ROOT, "embedded-captions", "dna"), ".json"),
      animation_rules: countFiles(join(VENDORED_HYPERFRAMES_RESOURCES_ROOT, "hyperframes-animation", "rules"), ".md"),
      animation_blueprints: countFiles(join(VENDORED_HYPERFRAMES_RESOURCES_ROOT, "hyperframes-animation", "blueprints"), ".md"),
      sfx: Object.keys(readSfxManifest()).length,
      motion_categories: countModuleDirs(join(VENDORED_HYPERFRAMES_RESOURCES_ROOT, "motion-graphics", "categories")),
      talking_head_references: countFilesRecursive(join(VENDORED_HYPERFRAMES_RESOURCES_ROOT, "talking-head-recut", "references"), ".md"),
      frame_presets: countDirs(join(VENDORED_HYPERFRAMES_RESOURCES_ROOT, "hyperframes-creative", "frame-presets")),
    },
  };
}

function registryElement(item: VendoredRegistryItem): VendoredElementCatalogItem {
  const elementType = item.type === "hyperframes:block" ? "registry_block" : item.type === "hyperframes:component" ? "registry_component" : "animation_rule";
  return {
    element_id: item.name,
    element_type: elementType,
    source: `registry/${ITEM_TYPE_DIRS[item.type]}/${item.name}`,
    title: item.title ?? item.name,
    description: item.description,
    tags: item.tags ?? [],
    renderable: item.type === "hyperframes:block" || item.type === "hyperframes:component",
    guidance_only: item.type === "hyperframes:example",
    registry_type: item.type,
    dependencies: item.registryDependencies ?? [],
    file_count: item.files.length,
    source_path: join("packages/cli/vendor/hyperframes/registry", ITEM_TYPE_DIRS[item.type], item.name),
    duration_seconds: item.duration,
    dimensions: item.dimensions,
    preview: item.preview,
  };
}

function builtinCaptionIdentity(): VendoredElementCatalogItem {
  return {
    element_id: "anchor",
    element_type: "caption_identity",
    source: "koubo-clip/anchor-caption-rail",
    title: "Anchor caption rail",
    description: "Default embedded caption identity used by koubo-clip recuts.",
    tags: ["caption", "anchor", "embedded"],
    renderable: true,
    guidance_only: false,
    dependencies: [],
    file_count: 0,
    source_path: "packages/cli/src/project.ts",
  };
}

function markdownElements(
  elementType: VendoredElementType,
  source: string,
  dir: string,
  prefix: string,
): VendoredElementCatalogItem[] {
  return safeDirFiles(dir, ".md").map((file) => {
    const id = stem(file);
    const text = readFileSync(join(dir, file), "utf8");
    return {
      element_id: `${prefix}:${id}`,
      element_type: elementType,
      source,
      title: firstMarkdownHeading(text) ?? id,
      description: firstMarkdownParagraph(text),
      tags: [prefix, source.split("/")[0] ?? source],
      renderable: elementType === "caption_identity",
      guidance_only: elementType !== "caption_identity",
      dependencies: [],
      file_count: 1,
      source_path: join("packages/cli/vendor/hyperframes/resources", source, file),
    };
  });
}

function captionJsonElements(source: string, dir: string, prefix: string): VendoredElementCatalogItem[] {
  return safeDirFiles(dir, ".json").map((file) => {
    const id = stem(file);
    const raw = JSON.parse(readFileSync(join(dir, file), "utf8")) as Record<string, unknown>;
    return {
      element_id: `${prefix}:${id}`,
      element_type: "caption_identity",
      source,
      title: typeof raw.name === "string" ? raw.name : id,
      description: typeof raw.when === "string" ? raw.when : typeof raw.voice === "string" ? raw.voice : undefined,
      tags: [prefix, source.split("/")[0] ?? source],
      renderable: true,
      guidance_only: false,
      dependencies: [],
      file_count: 1,
      source_path: join("packages/cli/vendor/hyperframes/resources", source, file),
    };
  });
}

function motionCategoryElements(): VendoredElementCatalogItem[] {
  const categoriesDir = join(VENDORED_HYPERFRAMES_RESOURCES_ROOT, "motion-graphics", "categories");
  return safeDirEntries(categoriesDir).flatMap((name) => {
    const modulePath = join(categoriesDir, name, "module.md");
    if (!existsSync(modulePath)) return [];
    const text = readFileSync(modulePath, "utf8");
    return [{
      element_id: `motion-category:${name}`,
      element_type: "animation_rule" as const,
      source: "motion-graphics/categories",
      title: firstMarkdownHeading(text) ?? name,
      description: firstMarkdownParagraph(text),
      tags: ["motion-category", name],
      renderable: false,
      guidance_only: true,
      dependencies: [],
      file_count: 1,
      source_path: join("packages/cli/vendor/hyperframes/resources/motion-graphics/categories", name, "module.md"),
    }];
  });
}

function talkingHeadReferenceElements(): VendoredElementCatalogItem[] {
  const referencesDir = join(VENDORED_HYPERFRAMES_RESOURCES_ROOT, "talking-head-recut", "references");
  return safeDirFilesRecursive(referencesDir, ".md").map((filePath) => {
    const id = filePath.replaceAll(sep, ":").replace(/\.md$/i, "");
    const absolute = join(referencesDir, filePath);
    const text = readFileSync(absolute, "utf8");
    return {
      element_id: `talking-head-reference:${id}`,
      element_type: "animation_rule",
      source: "talking-head-recut/references",
      title: firstMarkdownHeading(text) ?? id,
      description: firstMarkdownParagraph(text),
      tags: ["talking-head", "reference"],
      renderable: false,
      guidance_only: true,
      dependencies: [],
      file_count: 1,
      source_path: join("packages/cli/vendor/hyperframes/resources/talking-head-recut/references", filePath),
    };
  });
}

function framePresetElements(): VendoredElementCatalogItem[] {
  const presetsDir = join(VENDORED_HYPERFRAMES_RESOURCES_ROOT, "hyperframes-creative", "frame-presets");
  return safeDirEntries(presetsDir).map((name) => {
    const files = countFilesRecursive(join(presetsDir, name));
    return {
      element_id: `frame-preset:${name}`,
      element_type: "animation_rule",
      source: "hyperframes-creative/frame-presets",
      title: name,
      tags: ["frame-preset", "creative"],
      renderable: false,
      guidance_only: true,
      dependencies: [],
      file_count: files,
      source_path: join("packages/cli/vendor/hyperframes/resources/hyperframes-creative/frame-presets", name),
    };
  });
}

function sfxElements(): VendoredElementCatalogItem[] {
  return Object.entries(readSfxManifest()).map(([id, entry]) => ({
    element_id: id,
    element_type: "sfx",
    source: "hyperframes-media/assets/sfx",
    title: id,
    description: entry.description,
    tags: ["sfx", "audio"],
    renderable: true,
    guidance_only: false,
    dependencies: [],
    file_count: 1,
    source_path: join("packages/cli/vendor/hyperframes/resources/hyperframes-media/assets/sfx", entry.file),
    duration_seconds: entry.duration,
  }));
}

function readSfxManifest(): Record<string, { file: string; duration: number; description: string }> {
  const manifestPath = join(VENDORED_HYPERFRAMES_RESOURCES_ROOT, "hyperframes-media", "assets", "sfx", "manifest.json");
  if (!existsSync(manifestPath)) return {};
  return JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, { file: string; duration: number; description: string }>;
}

function markInstalledComposition(path: string, itemName: string): void {
  const marker = `<!-- koubo-clip:vendored-hyperframes-item ${itemName} -->`;
  const content = readFileSync(path, "utf8");
  if (content.includes(marker)) return;
  writeFileSync(path, `${marker}\n${content}`);
}

function wrapInstalledComponentSnippet(path: string, itemName: string): void {
  const marker = `<!-- koubo-clip:vendored-hyperframes-component ${itemName} -->`;
  const content = readFileSync(path, "utf8");
  if (content.includes(marker)) return;
  writeFileSync(
    path,
    `${marker}
<div id="component-${itemName}" data-composition-id="component-${itemName}" data-width="1920" data-height="1080" data-duration="1">
${content}
</div>
`,
  );
}

function registryFiles(value: unknown, name: string): VendoredRegistryFile[] {
  if (!Array.isArray(value)) throw new Error(`${name} must be an array`);
  return value.map((item, index) => {
    const obj = object(item, `${name}[${index}]`);
    return {
      path: safeRelativePath(string(obj.path, `${name}[${index}].path`), `${name}[${index}].path`),
      target: safeRelativePath(string(obj.target, `${name}[${index}].target`), `${name}[${index}].target`),
      type: registryFileType(obj.type, `${name}[${index}].type`),
    };
  });
}

function registryItemType(value: unknown, name: string): VendoredRegistryItemType {
  if (value === "hyperframes:block" || value === "hyperframes:component" || value === "hyperframes:example") return value;
  throw new Error(`${name} must be a HyperFrames registry item type`);
}

function registryFileType(value: unknown, name: string): VendoredRegistryFileType {
  if (
    value === "hyperframes:composition" ||
    value === "hyperframes:asset" ||
    value === "hyperframes:snippet" ||
    value === "hyperframes:style" ||
    value === "hyperframes:timeline" ||
    value === "asset" ||
    value === "registry:asset"
  ) {
    return value;
  }
  throw new Error(`${name} must be a HyperFrames registry file type`);
}

function safeJoin(root: string, relativePath: string, name: string): string {
  const safe = safeRelativePath(relativePath, name);
  const target = resolve(root, safe);
  const rootResolved = resolve(root);
  if (target !== rootResolved && !target.startsWith(`${rootResolved}${sep}`)) throw new Error(`${name} must stay inside ${root}`);
  return target;
}

function safeRelativePath(value: string, name: string): string {
  if (value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value)) throw new Error(`${name} must be a relative path`);
  const parts = value.split(/[\\/]+/);
  if (parts.some((part) => part === "..")) throw new Error(`${name} must not contain ..`);
  return value;
}

function preview(value: unknown, name: string): VendoredRegistryItem["preview"] {
  const obj = object(value, name);
  return {
    video: obj.video === undefined ? undefined : string(obj.video, `${name}.video`),
    poster: obj.poster === undefined ? undefined : string(obj.poster, `${name}.poster`),
  };
}

function dimensions(value: unknown, name: string): { width: number; height: number } {
  const obj = object(value, name);
  return { width: number(obj.width, `${name}.width`), height: number(obj.height, `${name}.height`) };
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be an object`);
  return value as Record<string, unknown>;
}

function string(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${name} must be a non-empty string`);
  return value;
}

function number(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${name} must be a number`);
  return value;
}

function stringArray(value: unknown, name: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${name} must be an array`);
  return value.map((item, index) => string(item, `${name}[${index}]`));
}

function safeDirEntries(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => statSync(join(dir, name)).isDirectory()).sort();
}

function safeDirFiles(dir: string, extension: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => statSync(join(dir, name)).isFile() && name.endsWith(extension)).sort();
}

function safeDirFilesRecursive(dir: string, extension: string): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  const visit = (current: string) => {
    for (const name of readdirSync(current)) {
      const absolute = join(current, name);
      if (statSync(absolute).isDirectory()) {
        visit(absolute);
      } else if (name.endsWith(extension)) {
        files.push(relative(dir, absolute));
      }
    }
  };
  visit(dir);
  return files.sort();
}

function countDirs(dir: string): number {
  return safeDirEntries(dir).length;
}

function countFiles(dir: string, extension: string): number {
  return safeDirFiles(dir, extension).length;
}

function countFilesRecursive(dir: string, extension?: string): number {
  if (!existsSync(dir)) return 0;
  let count = 0;
  const visit = (current: string) => {
    for (const name of readdirSync(current)) {
      const absolute = join(current, name);
      if (statSync(absolute).isDirectory()) visit(absolute);
      else if (!extension || name.endsWith(extension)) count += 1;
    }
  };
  visit(dir);
  return count;
}

function countModuleDirs(dir: string): number {
  return safeDirEntries(dir).filter((name) => existsSync(join(dir, name, "module.md"))).length;
}

function countRegistryItemFiles(dir: string): number {
  if (!existsSync(dir)) return 0;
  let count = 0;
  const visit = (current: string) => {
    for (const name of readdirSync(current)) {
      const absolute = join(current, name);
      if (statSync(absolute).isDirectory()) visit(absolute);
      else if (name === "registry-item.json") count += 1;
    }
  };
  visit(dir);
  return count;
}

function firstMarkdownHeading(text: string): string | undefined {
  return text.split(/\r?\n/).find((line) => line.startsWith("# "))?.replace(/^#\s+/, "").trim();
}

function firstMarkdownParagraph(text: string): string | undefined {
  return text
    .split(/\r?\n\r?\n/)
    .map((part) => part.trim())
    .find((part) => part && !part.startsWith("#") && !part.startsWith("```"))
    ?.replace(/\s+/g, " ")
    .slice(0, 240);
}

function stem(file: string): string {
  return file.replace(/\.[^.]+$/, "");
}
