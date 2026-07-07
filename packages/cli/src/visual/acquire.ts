import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import {
  type AssetManifestArtifact,
  type AssetManifestEntry,
  type VisualAcquisitionArtifact,
  type VisualAcquisitionItem,
  type VisualAssetType,
  type VisualCandidate,
  type VisualCandidatesArtifact,
  type VisualProvider,
  type VisualRequestArtifact,
  type VisualReviewArtifact,
  parseAssetManifest,
  parseVisualCandidates,
  parseVisualRequest,
  projectArtifacts,
} from "../artifacts";
import { HYPERFRAMES_DEPENDENCIES, type HyperframesDependencySummary, validateHyperframesCdnDependency } from "../hyperframes-catalog";

export type VisualCatalogProvider = {
  id: VisualProvider | "rive";
  label: string;
  available: boolean;
  requires_network: boolean;
  requires_key: boolean;
  status: "available" | "missing_key" | "handoff" | "future" | "host-managed" | "disabled";
  supported_asset_types: VisualAssetType[];
  notes: string[];
};

export type VisualCatalogArtifact = {
  version: "1.0";
  providers: VisualCatalogProvider[];
  runtime_allowlist: HyperframesDependencySummary[];
  mcp_handoffs: Array<{ id: string; label: string; status: "host_required"; notes: string[] }>;
};

type IconifySearchResponse = {
  icons?: string[];
};

type IconifyCollectionInfo = {
  info?: {
    name?: string;
    license?: {
      title?: string;
      spdx?: string;
      url?: string;
    };
    author?: {
      name?: string;
    };
  };
};

type LordiconIcon = {
  family?: string;
  style?: string;
  index?: string | number;
  name?: string;
  title?: string;
  premium?: boolean;
  files?: {
    json?: string;
    svg?: string;
  };
};

const visualRuntimeDependencyIds = new Set(["lottie_web_5_12_2", "dotlottie_web_0_76_0", "gsap_3_14_2", "animejs_3_2_2"]);
type BinaryBuffer = ReturnType<typeof Buffer.from>;
const cliOwnedVisualProviders = new Set<VisualProvider>(["iconify", "lordicon"]);

export function buildVisualCatalog(): VisualCatalogArtifact {
  return {
    version: "1.0",
    providers: [
      {
        id: "iconify",
        label: "Iconify API",
        available: true,
        requires_network: true,
        requires_key: false,
        status: "available",
        supported_asset_types: ["icon"],
        notes: ["static semantic icons such as alarm, call, navigation, bluetooth, battery, message"],
      },
      {
        id: "lordicon",
        label: "Lordicon official API/export",
        available: Boolean(process.env.LORDICON_API_KEY),
        requires_network: true,
        requires_key: true,
        status: process.env.LORDICON_API_KEY ? "available" : "missing_key",
        supported_asset_types: ["animated_icon", "lottie"],
        notes: ["CLI-owned dynamic icon source; searches official API and freezes JSON/SVG locally"],
      },
      {
        id: "lottie",
        label: "Lottie/dotLottie import",
        available: true,
        requires_network: true,
        requires_key: false,
        status: "handoff",
        supported_asset_types: ["animated_icon", "lottie", "sticker"],
        notes: ["agent/MCP/API may provide .json or .lottie; render uses allowlisted Lottie runtimes"],
      },
      {
        id: "shadcn",
        label: "shadcn MCP / compatible registry handoff",
        available: true,
        requires_network: true,
        requires_key: false,
        status: "handoff",
        supported_asset_types: ["ui_component", "template"],
        notes: ["CLI does not execute React; only confirmed static export, screenshot, SVG, or safe fragment can render"],
      },
      {
        id: "21st",
        label: "21st.dev HTTP MCP handoff",
        available: true,
        requires_network: true,
        requires_key: false,
        status: "handoff",
        supported_asset_types: ["ui_component", "template"],
        notes: ["preferred for polished UI blocks after user confirms source/cost risk"],
      },
      {
        id: "rive",
        label: "Rive",
        available: false,
        requires_network: true,
        requires_key: false,
        status: "future",
        supported_asset_types: ["animated_icon", "template"],
        notes: ["future provider for complex interactive motion; no first-version render adapter"],
      },
    ],
    runtime_allowlist: HYPERFRAMES_DEPENDENCIES.filter((entry) => visualRuntimeDependencyIds.has(entry.id)).map(validateHyperframesCdnDependency),
    mcp_handoffs: [
      { id: "shadcn-mcp", label: "shadcn MCP", status: "host_required", notes: ["host agent searches and exports static candidate"] },
      { id: "21st-mcp", label: "21st.dev MCP", status: "host_required", notes: ["host agent supplies source, license/cost risk, and local static export"] },
    ],
  };
}

export function buildPlatformVisualCatalog(): VisualCatalogArtifact {
  return {
    version: "1.0",
    providers: [
      {
        id: "iconify",
        label: "Iconify API",
        available: false,
        requires_network: true,
        requires_key: false,
        status: "host-managed",
        supported_asset_types: ["icon"],
        notes: ["Platform visual capability owns search, download, audit, and provenance"],
      },
      {
        id: "lordicon",
        label: "Lordicon official API/export",
        available: false,
        requires_network: true,
        requires_key: true,
        status: "host-managed",
        supported_asset_types: ["animated_icon", "lottie"],
        notes: ["Platform visual capability owns search, licensing, download/export, audit, and provenance"],
      },
      {
        id: "lottie",
        label: "Lottie/dotLottie import",
        available: false,
        requires_network: true,
        requires_key: false,
        status: "host-managed",
        supported_asset_types: ["animated_icon", "lottie", "sticker"],
        notes: ["Host/platform supplies a project-local .json or .lottie asset before CLI import"],
      },
      {
        id: "shadcn",
        label: "shadcn MCP / compatible registry handoff",
        available: false,
        requires_network: true,
        requires_key: false,
        status: "host-managed",
        supported_asset_types: ["ui_component", "template"],
        notes: ["Host/platform exports a project-local static candidate before CLI import"],
      },
      {
        id: "21st",
        label: "21st.dev HTTP MCP handoff",
        available: false,
        requires_network: true,
        requires_key: false,
        status: "host-managed",
        supported_asset_types: ["ui_component", "template"],
        notes: ["Host/platform supplies source, license/cost risk, and a project-local static export"],
      },
      {
        id: "rive",
        label: "Rive",
        available: false,
        requires_network: true,
        requires_key: false,
        status: "disabled",
        supported_asset_types: ["animated_icon", "template"],
        notes: ["future provider; not imported by CLI platform mode"],
      },
    ],
    runtime_allowlist: HYPERFRAMES_DEPENDENCIES.filter((entry) => visualRuntimeDependencyIds.has(entry.id)).map(validateHyperframesCdnDependency),
    mcp_handoffs: [
      { id: "shadcn-mcp", label: "shadcn MCP", status: "host_required", notes: ["host/platform searches and exports static candidate before CLI import"] },
      { id: "21st-mcp", label: "21st.dev MCP", status: "host_required", notes: ["host/platform supplies source, license/cost risk, and local static export"] },
    ],
  };
}

export function renderVisualCatalogMarkdown(catalog: VisualCatalogArtifact): string {
  const providers = catalog.providers
    .map((provider) => `- ${provider.id}: ${provider.status}; types=${provider.supported_asset_types.join(", ")}; ${provider.notes.join("; ")}`)
    .join("\n");
  const runtimes = catalog.runtime_allowlist.map((dependency) => `- ${dependency.id}: ${dependency.package_name ?? dependency.kind} ${dependency.version ?? dependency.versionless_exception ?? ""}`).join("\n");
  const handoffs = catalog.mcp_handoffs.map((handoff) => `- ${handoff.id}: ${handoff.notes.join("; ")}`).join("\n");
  return `# Visual Catalog\n\n## Providers\n${providers || "- none"}\n\n## Runtime Allowlist\n${runtimes || "- none"}\n\n## MCP Handoffs\n${handoffs || "- none"}\n`;
}

export async function searchVisualAssets(projectPath: string): Promise<VisualCandidatesArtifact> {
  const request = parseVisualRequest(readJson(join(projectPath, projectArtifacts.visualRequest)));
  const existing = existsSync(join(projectPath, projectArtifacts.visualCandidates))
    ? parseVisualCandidates(readJson(join(projectPath, projectArtifacts.visualCandidates))).candidates
    : [];
  const warnings: string[] = [];
  const candidates: VisualCandidate[] = [];

  for (const item of request.requests) {
    const handoffCandidates = existing.filter((candidate) => candidate.request_id === item.id && !cliOwnedVisualProviders.has(candidate.provider));
    candidates.push(...handoffCandidates);
    const providers = item.preferred_sources.length > 0 ? item.preferred_sources : defaultProvidersFor(item.asset_type);
    if (providers.includes("iconify") && item.asset_type === "icon") {
      try {
        candidates.push(...(await searchIconify(item.id, item.semantic_query)));
      } catch (error) {
        warnings.push(`${item.id}: Iconify search failed: ${errorMessage(error)}`);
      }
    }
    if (providers.includes("lordicon") && (item.asset_type === "animated_icon" || item.asset_type === "lottie" || item.asset_type === "sticker")) {
      try {
        candidates.push(...(await searchLordicon(item.id, item.semantic_query, item.asset_type)));
      } catch (error) {
        warnings.push(`${item.id}: Lordicon search failed: ${errorMessage(error)}`);
      }
    }
    const handoffProviders = providers.filter((provider) => !cliOwnedVisualProviders.has(provider));
    const itemCandidateCount = candidates.filter((candidate) => candidate.request_id === item.id).length;
    if (handoffProviders.length > 0 && handoffCandidates.length === 0 && itemCandidateCount === 0) {
      warnings.push(`${item.id}: ${handoffProviders.join(", ")} requires host/MCP candidate handoff or official download metadata`);
    }
  }

  return { version: "1.0", candidates: dedupeCandidates(candidates), warnings };
}

export function renderVisualCandidatesMarkdown(artifact: VisualCandidatesArtifact): string {
  const rows = artifact.candidates.map((candidate) => {
    const license = candidate.license ? `license=${candidate.license}` : "license=unknown";
    const risk = candidate.source_risk ? ` risk=${candidate.source_risk}` : "";
    return `- ${candidate.id}: ${candidate.title} (${candidate.provider}/${candidate.asset_type}) ${license}${risk}; renderable=${candidate.renderable ? "yes" : "no"}; ${candidate.reason}`;
  });
  const warnings = artifact.warnings.map((warning) => `- ${warning}`);
  return `# Visual Candidates\n\n## Candidates\n${rows.join("\n") || "- none"}\n\n## Warnings\n${warnings.join("\n") || "- none"}\n`;
}

export async function acquireVisualAssets(projectPath: string): Promise<VisualAcquisitionArtifact> {
  const request = parseVisualRequest(readJson(join(projectPath, projectArtifacts.visualRequest)));
  const candidates = parseVisualCandidates(readJson(join(projectPath, projectArtifacts.visualCandidates)));
  const manifestPath = join(projectPath, projectArtifacts.assetManifest);
  const manifest = existsSync(manifestPath) ? parseAssetManifest(readJson(manifestPath)) : { assets: [] };
  const warnings: string[] = [];
  const assets: VisualAcquisitionItem[] = [];

  mkdirSync(join(projectPath, "assets", "icons"), { recursive: true });
  mkdirSync(join(projectPath, "assets", "lottie"), { recursive: true });
  mkdirSync(join(projectPath, "assets", "visuals"), { recursive: true });
  mkdirSync(join(projectPath, "assets", "images"), { recursive: true });

  for (const item of request.requests) {
    const candidate = selectCandidate(item.selected_candidate_id, candidates.candidates.filter((entry) => entry.request_id === item.id));
    if (!candidate) {
      warnings.push(`${item.id}: no renderable visual candidate selected`);
      continue;
    }
    const acquired = await acquireCandidate(projectPath, item, candidate);
    assets.push(acquired.item);
    upsertAsset(manifest, acquired.asset);
    warnings.push(...acquired.item.warnings);
  }

  writeJson(manifestPath, manifest);
  return { version: "1.0", assets, warnings };
}

export function buildVisualReview(acquisition: VisualAcquisitionArtifact, request?: VisualRequestArtifact): VisualReviewArtifact {
  const requests = new Map((request?.requests ?? []).map((item) => [item.id, item]));
  return {
    version: "1.0",
    items: acquisition.assets.map((asset) => ({
      asset_id: asset.asset_id,
      request_id: asset.request_id,
      candidate_id: asset.candidate_id,
      provider: asset.provider,
      asset_type: asset.asset_type,
      path: asset.path,
      source_url: asset.source_url,
      license: asset.license,
      runtime_dependencies: [...asset.runtime_dependencies],
      usage_reason: requests.get(asset.request_id)?.reason ?? "visual acquisition",
      warnings: [...asset.warnings],
    })),
    warnings: [...acquisition.warnings],
  };
}

export function renderVisualReviewMarkdown(review: VisualReviewArtifact): string {
  const rows = review.items.map((item) => {
    const deps = item.runtime_dependencies.length > 0 ? ` deps=${item.runtime_dependencies.join(",")}` : "";
    const license = item.license ? ` license=${item.license}` : " license=unknown";
    return `- ${item.asset_id}: ${item.path} (${item.provider}/${item.asset_type})${license}${deps}; ${item.usage_reason}`;
  });
  const warnings = review.warnings.map((warning) => `- ${warning}`);
  return `# Visual Review\n\n## Assets\n${rows.join("\n") || "- none"}\n\n## Warnings\n${warnings.join("\n") || "- none"}\n`;
}

export function sanitizeSvg(svg: string, name = "svg"): string {
  const checks: Array<[RegExp, string]> = [
    [/<\s*script\b/i, "script tags"],
    [/<\s*foreignObject\b/i, "foreignObject"],
    [/\son[a-z]+\s*=/i, "event handlers"],
    [/javascript\s*:/i, "javascript urls"],
    [/\b(?:href|xlink:href)\s*=\s*["'](?:https?:|\/\/)/i, "external href"],
    [/url\(\s*["']?(?:https?:|\/\/)/i, "external url()"],
  ];
  for (const [pattern, reason] of checks) {
    if (pattern.test(svg)) throw new Error(`${name} contains unsafe ${reason}`);
  }
  return svg;
}

async function searchIconify(requestId: string, query: string): Promise<VisualCandidate[]> {
  const searchUrl = `https://api.iconify.design/search?query=${encodeURIComponent(query)}&limit=8`;
  const search = (await fetchJson(searchUrl)) as IconifySearchResponse;
  const icons = (search.icons ?? []).slice(0, 8);
  const licenseCache = new Map<string, Awaited<ReturnType<typeof fetchIconifyCollectionInfo>>>();
  const results: VisualCandidate[] = [];
  for (const icon of icons) {
    const [prefix, name] = icon.split(":");
    if (!prefix || !name) continue;
    const info = licenseCache.get(prefix) ?? (await fetchIconifyCollectionInfo(prefix).catch(() => undefined));
    licenseCache.set(prefix, info);
    const license = info?.license;
    results.push({
      id: `${requestId}-iconify-${safeId(prefix)}-${safeId(name)}`,
      request_id: requestId,
      provider: "iconify",
      asset_type: "icon",
      title: `${prefix}:${name}`,
      semantic_query: query,
      preview_url: `https://api.iconify.design/${encodeURIComponent(prefix)}/${encodeURIComponent(name)}.svg`,
      source_url: `https://icon-sets.iconify.design/${encodeURIComponent(prefix)}/${encodeURIComponent(name)}/`,
      download_url: `https://api.iconify.design/${encodeURIComponent(prefix)}/${encodeURIComponent(name)}.svg`,
      license: license?.spdx ?? license?.title ?? "Iconify collection license",
      license_url: license?.url,
      original_author: info?.author,
      source_risk: license ? undefined : "license metadata unavailable from Iconify collection lookup",
      renderable: true,
      recommended: results.length === 0,
      reason: `Iconify semantic match for "${query}"`,
      runtime_dependencies: [],
    });
  }
  return results;
}

async function fetchIconifyCollectionInfo(prefix: string): Promise<{ license?: { title?: string; spdx?: string; url?: string }; author?: string } | undefined> {
  const data = (await fetchJson(`https://api.iconify.design/collection?prefix=${encodeURIComponent(prefix)}&info=1`)) as IconifyCollectionInfo;
  return {
    license: data.info?.license,
    author: data.info?.author?.name,
  };
}

async function searchLordicon(requestId: string, query: string, assetType: VisualAssetType): Promise<VisualCandidate[]> {
  const key = process.env.LORDICON_API_KEY;
  if (!key) throw new Error("LORDICON_API_KEY is missing");
  const results: VisualCandidate[] = [];
  const seen = new Set<string>();
  for (const term of lordiconQueries(query)) {
    const icons = await fetchLordiconIcons(term, key).catch(() => []);
    for (const icon of icons) {
      const name = icon.name ?? icon.title ?? "lordicon";
      const file = assetType === "icon" ? icon.files?.svg : icon.files?.json ?? icon.files?.svg;
      if (!file) continue;
      const id = `${requestId}-lordicon-${safeId(name)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const isJson = file.toLowerCase().includes(".json");
      results.push({
        id,
        request_id: requestId,
        provider: "lordicon",
        asset_type: isJson ? "animated_icon" : "icon",
        title: icon.title ?? name,
        semantic_query: term,
        preview_url: icon.files?.svg,
        source_url: `https://lordicon.com/icons/${safeId(name)}`,
        download_url: file,
        license: icon.premium ? undefined : "Lordicon Free",
        license_url: "https://lordicon.com/pricing",
        original_author: "Lordicon",
        cost: icon.premium ? "paid/pro" : "free",
        source_risk: icon.premium ? "premium Lordicon asset requires paid license confirmation" : "free Lordicon assets may require attribution",
        renderable: !icon.premium,
        recommended: results.length === 0 && !icon.premium,
        reason: `Lordicon animated icon match for "${term}"`,
        runtime_dependencies: isJson ? ["lottie_web_5_12_2"] : [],
      });
      if (results.length >= 8) return results;
    }
  }
  return results;
}

async function fetchLordiconIcons(query: string, key: string): Promise<LordiconIcon[]> {
  const url = `https://api.lordicon.com/v1/icons?search=${encodeURIComponent(query)}&premium=false&per_page=8`;
  const data = (await fetchJson(url, { Authorization: `Bearer ${key}` })) as unknown;
  if (Array.isArray(data)) return data as LordiconIcon[];
  if (data && typeof data === "object" && Array.isArray((data as { icons?: unknown[] }).icons)) return (data as { icons: LordiconIcon[] }).icons;
  return [];
}

function lordiconQueries(query: string): string[] {
  const lower = query.toLowerCase();
  const terms = [query];
  const expansions: Array<[RegExp, string[]]> = [
    [/(alarm|clock|timer|reminder|闹钟|提醒|时间)/, ["clock", "timer", "time"]],
    [/(phone|call|电话|拨打)/, ["phone", "call"]],
    [/(notification|bell|message|通知|消息)/, ["bell", "notification", "message"]],
    [/(success|check|done|完成|成功)/, ["check", "success"]],
    [/(error|warning|fail|错误|警告|失败)/, ["warning", "error"]],
    [/(share|分享)/, ["share"]],
  ];
  for (const [pattern, values] of expansions) {
    if (pattern.test(lower)) terms.push(...values);
  }
  return [...new Set(terms.map((term) => term.trim()).filter(Boolean))];
}

async function fetchJson(url: string, headers?: Record<string, string>): Promise<unknown> {
  const response = await fetch(url, headers ? { headers } : undefined);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function fetchBytes(url: string): Promise<BinaryBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function acquireCandidate(
  projectPath: string,
  request: VisualRequestArtifact["requests"][number],
  candidate: VisualCandidate,
): Promise<{ item: VisualAcquisitionItem; asset: AssetManifestEntry }> {
  if (!candidate.renderable) throw new Error(`${candidate.id} is not renderable`);
  if (candidate.cost && !/^free|unknown$/i.test(candidate.cost) && !candidate.license) {
    throw new Error(`${candidate.id} has paid/pro cost risk without confirmed license`);
  }
  const warnings: string[] = [];
  if (!candidate.license) warnings.push(`${candidate.id}: license missing or unconfirmed`);
  if (candidate.source_risk) warnings.push(`${candidate.id}: ${candidate.source_risk}`);
  const bytes = await candidateBytes(projectPath, candidate);
  const ext = extensionFor(candidate, bytes);
  const assetId = `visual-${safeId(request.id)}`;
  const relativePath = join(directoryFor(candidate.asset_type), `${assetId}${ext}`);
  const destination = join(projectPath, relativePath);
  mkdirSync(join(projectPath, directoryFor(candidate.asset_type)), { recursive: true });
  if (ext === ".svg") {
    writeFileSync(destination, sanitizeSvg(bytes.toString("utf8"), candidate.id));
  } else {
    writeFileSync(destination, bytes);
  }
  const hash = sha256(readFileSync(destination));
  const runtimeDependencies = runtimeDependenciesFor(candidate, ext);
  const acquiredAt = new Date().toISOString();
  return {
    item: {
      id: `${assetId}-acquisition`,
      request_id: request.id,
      candidate_id: candidate.id,
      asset_id: assetId,
      provider: candidate.provider,
      asset_type: candidate.asset_type,
      path: relativePath,
      hash,
      source_url: candidate.source_url,
      license: candidate.license,
      license_url: candidate.license_url,
      original_author: candidate.original_author,
      acquired_at: acquiredAt,
      runtime_dependencies: runtimeDependencies,
      warnings,
    },
    asset: {
      id: assetId,
      path: relativePath,
      type: candidate.asset_type,
      source: "imported",
      provenance: "visual-acquisition",
      provider: candidate.provider,
      query: request.semantic_query,
      license: candidate.license,
      license_url: candidate.license_url,
      source_url: candidate.source_url,
      original_url: candidate.source_url,
      original_author: candidate.original_author,
      acquired_at: acquiredAt,
      reason: request.reason,
      used_by: [request.id],
      runtime_dependencies: runtimeDependencies,
      hash,
    },
  };
}

async function candidateBytes(projectPath: string, candidate: VisualCandidate): Promise<BinaryBuffer> {
  if (candidate.local_path) {
    const source = join(projectPath, candidate.local_path);
    if (!existsSync(source)) throw new Error(`${candidate.id}.local_path is missing: ${candidate.local_path}`);
    const temp = readFileSync(source);
    return Buffer.from(temp);
  }
  if (candidate.download_url) return fetchBytes(candidate.download_url);
  throw new Error(`${candidate.id} needs download_url or local_path`);
}

function extensionFor(candidate: VisualCandidate, bytes: BinaryBuffer): string {
  const source = candidate.local_path ?? candidate.download_url ?? candidate.source_url ?? "";
  const ext = extname(new URL(source, "https://example.invalid").pathname).toLowerCase();
  if (ext === ".svg" || ext === ".json" || ext === ".lottie" || ext === ".png" || ext === ".jpg" || ext === ".jpeg" || ext === ".webp" || ext === ".mp4" || ext === ".mov" || ext === ".webm") return ext;
  const text = Buffer.from(bytes.subarray(0, 128)).toString("utf8").trimStart();
  if (text.startsWith("<svg")) return ".svg";
  if (text.startsWith("{") || text.startsWith("[")) return ".json";
  if (candidate.asset_type === "icon") return ".svg";
  if (candidate.asset_type === "lottie" || candidate.asset_type === "animated_icon") return ".json";
  return ".asset";
}

function directoryFor(type: VisualAssetType): string {
  if (type === "icon") return join("assets", "icons");
  if (type === "animated_icon" || type === "lottie" || type === "sticker") return join("assets", "lottie");
  if (type === "image") return join("assets", "images");
  return join("assets", "visuals");
}

function runtimeDependenciesFor(candidate: VisualCandidate, ext: string): string[] {
  const dependencies = new Set(candidate.runtime_dependencies);
  if ((candidate.asset_type === "animated_icon" || candidate.asset_type === "lottie" || candidate.asset_type === "sticker") && ext === ".json") dependencies.add("lottie_web_5_12_2");
  if (ext === ".lottie") dependencies.add("dotlottie_web_0_76_0");
  return [...dependencies];
}

function selectCandidate(selectedCandidateId: string | undefined, candidates: VisualCandidate[]): VisualCandidate | undefined {
  if (selectedCandidateId) return candidates.find((candidate) => candidate.id === selectedCandidateId);
  return candidates.find((candidate) => candidate.recommended && candidate.renderable) ?? candidates.find((candidate) => candidate.renderable);
}

function defaultProvidersFor(type: VisualAssetType): VisualProvider[] {
  if (type === "icon") return ["iconify"];
  if (type === "animated_icon" || type === "lottie" || type === "sticker") return ["lordicon", "lottie"];
  if (type === "ui_component" || type === "template") return ["shadcn", "21st"];
  return ["local", "url"];
}

function dedupeCandidates(candidates: VisualCandidate[]): VisualCandidate[] {
  const seen = new Set<string>();
  const result: VisualCandidate[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    result.push(candidate);
  }
  return result;
}

function upsertAsset(manifest: AssetManifestArtifact, asset: AssetManifestEntry) {
  const index = manifest.assets.findIndex((entry) => entry.id === asset.id);
  if (index >= 0) manifest.assets[index] = asset;
  else manifest.assets.push(asset);
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "asset";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
