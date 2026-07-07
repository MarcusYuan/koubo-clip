import type { EnrichmentElement, EnrichmentPosition, EnrichmentSourceMode } from "./artifacts";
import type { VendoredElementCatalogItem, VendoredElementType } from "./hyperframes-registry";

export type HyperframesElementFamily =
  | "caption"
  | "lower_third"
  | "code"
  | "screen_focus"
  | "notification"
  | "social"
  | "app_showcase"
  | "flowchart"
  | "chart_map"
  | "transition"
  | "vfx_texture"
  | "liquid_glass"
  | "device"
  | "sfx"
  | "guidance";

export type HyperframesRenderStrategy =
  | "native_composition"
  | "component_caption"
  | "component_anchor_chip"
  | "cli_overlay"
  | "caption_rail"
  | "sfx_mix"
  | "asset_overlay"
  | "guidance_only";

export type HyperframesElementAdapter = {
  family: HyperframesElementFamily;
  render_strategy: HyperframesRenderStrategy;
  source_modes: EnrichmentSourceMode[];
  screen_safe: boolean;
  default_zone: EnrichmentPosition;
  required_params: string[];
  requires_target_rect: boolean;
  requires_anchor_point: boolean;
  asset_requirements: string[];
  known_limitations: string[];
};

export type HyperframesElementRecommendation = {
  element_id: string;
  element_type: VendoredElementType;
  family: HyperframesElementFamily;
  reason: string;
};

export type HyperframesElementRecommendations = Record<EnrichmentSourceMode, HyperframesElementRecommendation[]>;
export type HyperframesPresentationIntent = "internal_tutorial" | "short_form" | "course_lesson" | "product_demo" | "knowledge_explainer";
export type HyperframesPurposeRecommendations = Record<EnrichmentSourceMode, Record<HyperframesPresentationIntent, HyperframesElementRecommendation[]>>;

const sourceModes: EnrichmentSourceMode[] = ["talking_head_avatar", "screen_recording", "mixed"];
const presentationIntents: HyperframesPresentationIntent[] = ["internal_tutorial", "short_form", "course_lesson", "product_demo", "knowledge_explainer"];

const modeFamilyPriority: Record<EnrichmentSourceMode, HyperframesElementFamily[]> = {
  screen_recording: ["screen_focus", "caption", "code", "lower_third", "notification", "sfx"],
  talking_head_avatar: ["caption", "lower_third", "flowchart", "chart_map", "social", "app_showcase", "transition", "sfx"],
  mixed: ["screen_focus", "caption", "lower_third", "flowchart", "notification", "code", "sfx"],
};

const intentFamilyPriority: Record<HyperframesPresentationIntent, HyperframesElementFamily[]> = {
  internal_tutorial: ["screen_focus", "caption", "code", "notification", "lower_third", "sfx"],
  short_form: ["caption", "lower_third", "screen_focus", "social", "transition", "app_showcase", "sfx", "vfx_texture"],
  course_lesson: ["caption", "flowchart", "chart_map", "screen_focus", "code", "lower_third", "sfx"],
  product_demo: ["screen_focus", "caption", "code", "notification", "app_showcase", "device", "lower_third", "sfx"],
  knowledge_explainer: ["caption", "lower_third", "flowchart", "chart_map", "social", "transition", "sfx"],
};

const preferredElementIds = [
  "anchor",
  "caption-highlight",
  "caption-editorial-emphasis",
  "caption-pill-karaoke",
  "shimmer-sweep",
  "cinematic-zoom",
  "animation-rule:coordinate-target-zoom",
  "animation-rule:cursor-click-ripple",
  "animation-rule:asr-keyword-glow",
  "code-highlight",
  "code-scroll",
  "macos-notification",
  "lt-accent-underline",
  "lt-clean-bar",
  "lt-soft-pill",
  "flowchart",
  "data-chart",
  "app-showcase",
  "x-post",
  "instagram-follow",
  "click",
  "pop",
  "whoosh-short",
];

export function adapterForVendoredElement(item: VendoredElementCatalogItem): HyperframesElementAdapter {
  const family = familyFor(item);
  const component = item.element_type === "registry_component";
  const cliOverlay = item.element_type === "animation_rule" && isCliOverlay(item.element_id);
  const render_strategy: HyperframesRenderStrategy = cliOverlay
    ? "cli_overlay"
    : item.guidance_only
    ? "guidance_only"
    : item.element_type === "caption_identity"
      ? "caption_rail"
      : item.element_type === "sfx"
        ? "sfx_mix"
        : component && family === "caption"
          ? "component_caption"
      : component
        ? "component_anchor_chip"
        : item.element_type === "registry_block" && (family === "code" || family === "screen_focus")
          ? "cli_overlay"
          : item.element_type === "animation_rule" && isCliOverlay(item.element_id)
            ? "cli_overlay"
            : item.element_type === "animation_rule"
              ? "guidance_only"
                : "native_composition";
  const screenSafe = isScreenSafe(family, item);
  return {
    family,
    render_strategy,
    source_modes: modesFor(family, screenSafe),
    screen_safe: screenSafe,
    default_zone: defaultZoneFor(family),
    required_params: requiredParamsFor(family, item),
    requires_target_rect: family === "screen_focus" && render_strategy !== "component_anchor_chip",
    requires_anchor_point: render_strategy === "component_anchor_chip",
    asset_requirements: assetRequirementsFor(family, item),
    known_limitations: limitationsFor(family, item, render_strategy),
  };
}

export function adapterForElement(element: EnrichmentElement): HyperframesElementAdapter {
  if (element.element_type === "generated_asset" || element.element_type === "visual_asset") {
    return {
      family: "app_showcase",
      render_strategy: "asset_overlay",
      source_modes: sourceModes,
      screen_safe: element.element_type === "visual_asset",
      default_zone: element.element_type === "visual_asset" ? "upper_third" : "right_panel",
      required_params: [],
      requires_target_rect: false,
      requires_anchor_point: false,
      asset_requirements: element.element_type === "visual_asset" ? ["visual_asset"] : ["image"],
      known_limitations: ["uses local project asset only"],
    };
  }
  const fake: VendoredElementCatalogItem = {
    element_id: element.sfx_id ?? element.element_id,
    element_type: element.element_type,
    source: element.source,
    title: element.element_id,
    tags: [],
    renderable: true,
    guidance_only: false,
    dependencies: [],
    file_count: 0,
    source_path: "",
  };
  return adapterForVendoredElement(fake);
}

export function buildHyperframesRecommendations(items: readonly VendoredElementCatalogItem[]): HyperframesElementRecommendations {
  return {
    screen_recording: selectRecommendations(items, "screen_recording", modeFamilyPriority.screen_recording, 36),
    talking_head_avatar: selectRecommendations(items, "talking_head_avatar", modeFamilyPriority.talking_head_avatar, 36),
    mixed: selectRecommendations(items, "mixed", modeFamilyPriority.mixed, 36),
  };
}

export function buildHyperframesPurposeRecommendations(items: readonly VendoredElementCatalogItem[]): HyperframesPurposeRecommendations {
  return {
    screen_recording: buildPurposeRecommendationsForMode(items, "screen_recording"),
    talking_head_avatar: buildPurposeRecommendationsForMode(items, "talking_head_avatar"),
    mixed: buildPurposeRecommendationsForMode(items, "mixed"),
  };
}

function familyFor(item: VendoredElementCatalogItem): HyperframesElementFamily {
  const id = item.element_id.toLowerCase();
  const tags = item.tags.map((tag) => tag.toLowerCase());
  const text = `${id} ${tags.join(" ")} ${item.title.toLowerCase()} ${item.description?.toLowerCase() ?? ""}`;
  if (item.element_type === "sfx") return "sfx";
  if (item.element_type === "caption_identity" || id.startsWith("caption-") || tags.some((tag) => tag.includes("caption"))) return "caption";
  if (item.element_type === "animation_rule" && isCliOverlay(item.element_id)) {
    if (id.includes("asr-keyword") || id.includes("keyword")) return "caption";
    return "screen_focus";
  }
  if (item.guidance_only) return "guidance";
  if (id.startsWith("lt-") || id.includes("lower-third") || id === "news-ticker") return "lower_third";
  if (id.startsWith("code-") || text.includes("code") || text.includes("terminal")) return "code";
  if (item.element_type === "registry_component" && (id.includes("shimmer") || id.includes("highlight") || tags.includes("effect"))) return "screen_focus";
  if (id.includes("zoom") || id.includes("focus") || id.includes("cursor") || id.includes("spotlight") || id.includes("marker")) return "screen_focus";
  if (id.includes("notification")) return "notification";
  if (id.includes("post") || id.includes("follow") || id.includes("spotify")) return "social";
  if (id.includes("app-showcase") || id.includes("youtube-spot")) return "app_showcase";
  if (id.includes("iphone") || id.includes("device")) return "device";
  if (id.includes("flowchart")) return "flowchart";
  if (id.includes("chart") || id.includes("map") || text.includes("statistics")) return "chart_map";
  if (id.includes("transition") || id.includes("whip-pan") || text.includes("transition")) return "transition";
  if (id.includes("liquid-glass") || id.includes("ios26") || id.includes("macos-tahoe")) return "liquid_glass";
  if (id.includes("vfx") || id.includes("shader") || id.includes("glitch") || id.includes("warp") || id.includes("dissolve") || id.includes("distortion") || id.includes("vortex") || id.includes("ripple") || id.includes("iris") || id.includes("lens") || id.includes("shatter")) return "vfx_texture";
  return "guidance";
}

function isScreenSafe(family: HyperframesElementFamily, item: VendoredElementCatalogItem): boolean {
  if (["caption", "code", "screen_focus", "notification", "sfx"].includes(family)) return true;
  if (family === "lower_third") return !item.element_id.includes("bold") && !item.element_id.includes("dark") && !item.element_id.includes("youtube");
  return false;
}

function modesFor(family: HyperframesElementFamily, screenSafe: boolean): EnrichmentSourceMode[] {
  if (family === "guidance") return sourceModes;
  if (screenSafe) return sourceModes;
  return ["talking_head_avatar", "mixed"];
}

function defaultZoneFor(family: HyperframesElementFamily): EnrichmentPosition {
  if (family === "screen_focus") return "center";
  if (family === "caption" || family === "lower_third" || family === "notification" || family === "sfx") return "lower_third";
  if (family === "code" || family === "flowchart" || family === "chart_map") return "right_panel";
  if (family === "transition" || family === "vfx_texture" || family === "liquid_glass") return "full_frame";
  return "right_panel";
}

function requiredParamsFor(family: HyperframesElementFamily, item: VendoredElementCatalogItem): string[] {
  if (item.element_type !== "registry_block") return [];
  if (family === "code") return ["code"];
  if (["lower_third", "notification", "social", "app_showcase", "flowchart", "chart_map"].includes(family)) return ["title"];
  return [];
}

function assetRequirementsFor(family: HyperframesElementFamily, item: VendoredElementCatalogItem): string[] {
  if (item.element_type === "generated_asset") return ["image"];
  if (item.element_id.includes("follow") || family === "app_showcase" || family === "device") return ["image"];
  return [];
}

function limitationsFor(family: HyperframesElementFamily, item: VendoredElementCatalogItem, strategy: HyperframesRenderStrategy): string[] {
  const limitations: string[] = [];
  if (strategy === "guidance_only") limitations.push("not directly renderable without a CLI adapter");
  if (["transition", "vfx_texture", "liquid_glass", "chart_map", "social", "app_showcase"].includes(family)) limitations.push("not default screen-recording overlay");
  if (item.element_type === "registry_block" && requiredParamsFor(family, item).length > 0) limitations.push("demo text must be replaced by params");
  return limitations;
}

function isCliOverlay(id: string): boolean {
  return id.includes("coordinate-target-zoom") || id.includes("cursor-click-ripple") || id.includes("asr-keyword-glow");
}

function recommendedForMode(item: VendoredElementCatalogItem, adapter: HyperframesElementAdapter, mode: EnrichmentSourceMode): boolean {
  if (mode === "screen_recording") {
    return adapter.screen_safe && ["caption", "code", "screen_focus", "notification", "lower_third", "sfx"].includes(adapter.family);
  }
  if (mode === "talking_head_avatar") {
    return ["caption", "lower_third", "social", "app_showcase", "flowchart", "chart_map", "transition", "sfx"].includes(adapter.family);
  }
  return adapter.screen_safe || ["lower_third", "flowchart", "notification", "sfx"].includes(adapter.family);
}

function buildPurposeRecommendationsForMode(items: readonly VendoredElementCatalogItem[], mode: EnrichmentSourceMode): Record<HyperframesPresentationIntent, HyperframesElementRecommendation[]> {
  return {
    internal_tutorial: selectRecommendations(items, mode, priorityFor(mode, "internal_tutorial"), 18, "internal_tutorial"),
    short_form: selectRecommendations(items, mode, priorityFor(mode, "short_form"), 18, "short_form"),
    course_lesson: selectRecommendations(items, mode, priorityFor(mode, "course_lesson"), 18, "course_lesson"),
    product_demo: selectRecommendations(items, mode, priorityFor(mode, "product_demo"), 18, "product_demo"),
    knowledge_explainer: selectRecommendations(items, mode, priorityFor(mode, "knowledge_explainer"), 18, "knowledge_explainer"),
  };
}

function priorityFor(mode: EnrichmentSourceMode, intent: HyperframesPresentationIntent): HyperframesElementFamily[] {
  return uniqueFamilies([...intentFamilyPriority[intent], ...modeFamilyPriority[mode]]);
}

function selectRecommendations(
  items: readonly VendoredElementCatalogItem[],
  mode: EnrichmentSourceMode,
  familyPriority: HyperframesElementFamily[],
  limit: number,
  intent?: HyperframesPresentationIntent,
): HyperframesElementRecommendation[] {
  const buckets = new Map<HyperframesElementFamily, Array<{ item: VendoredElementCatalogItem; adapter: HyperframesElementAdapter }>>();
  for (const family of familyPriority) buckets.set(family, []);
  for (const item of items) {
    const adapter = adapterForVendoredElement(item);
    if (!familyPriority.includes(adapter.family)) continue;
    if (!isRecommendable(item, adapter, mode, intent)) continue;
    buckets.get(adapter.family)?.push({ item, adapter });
  }
  for (const bucket of buckets.values()) bucket.sort(compareRecommendationCandidates);

  const result: HyperframesElementRecommendation[] = [];
  const used = new Set<string>();
  while (result.length < limit) {
    let added = false;
    for (const family of familyPriority) {
      const bucket = buckets.get(family);
      const candidate = bucket?.shift();
      if (!candidate) continue;
      const key = `${candidate.item.element_type}:${candidate.item.element_id}`;
      if (used.has(key)) continue;
      used.add(key);
      result.push({
        element_id: candidate.item.element_id,
        element_type: candidate.item.element_type,
        family: candidate.adapter.family,
        reason: recommendationReason(candidate.adapter.family, mode, intent),
      });
      added = true;
      if (result.length >= limit) break;
    }
    if (!added) break;
  }
  return result;
}

function isRecommendable(item: VendoredElementCatalogItem, adapter: HyperframesElementAdapter, mode: EnrichmentSourceMode, intent?: HyperframesPresentationIntent): boolean {
  if (!item.renderable && adapter.render_strategy === "guidance_only") return false;
  if (!adapter.source_modes.includes(mode)) return false;
  if (!recommendedForMode(item, adapter, mode)) return false;
  if (!intent) return true;
  if (intent === "internal_tutorial") return ["screen_focus", "caption", "code", "notification", "lower_third", "sfx"].includes(adapter.family);
  if (intent === "product_demo") return ["screen_focus", "caption", "code", "notification", "app_showcase", "device", "lower_third", "sfx"].includes(adapter.family);
  if (intent === "course_lesson") return ["caption", "flowchart", "chart_map", "screen_focus", "code", "lower_third", "sfx"].includes(adapter.family);
  if (intent === "knowledge_explainer") return ["caption", "lower_third", "flowchart", "chart_map", "social", "transition", "sfx"].includes(adapter.family);
  if (intent === "short_form") return ["caption", "lower_third", "screen_focus", "social", "transition", "app_showcase", "sfx", "vfx_texture"].includes(adapter.family);
  return true;
}

function compareRecommendationCandidates(a: { item: VendoredElementCatalogItem; adapter: HyperframesElementAdapter }, b: { item: VendoredElementCatalogItem; adapter: HyperframesElementAdapter }): number {
  const score = recommendationRank(a.item, a.adapter) - recommendationRank(b.item, b.adapter);
  if (score !== 0) return score;
  return a.item.element_id.localeCompare(b.item.element_id);
}

function recommendationRank(item: VendoredElementCatalogItem, adapter: HyperframesElementAdapter): number {
  const preferred = preferredElementIds.indexOf(item.element_id);
  if (preferred >= 0) return preferred;
  let score = 100;
  if (item.element_type === "registry_component") score += 0;
  else if (item.element_type === "registry_block") score += 10;
  else if (item.element_type === "sfx") score += 20;
  else if (item.element_type === "caption_identity") score += 40;
  else score += 60;
  if (adapter.render_strategy === "guidance_only") score += 200;
  if (item.element_id.startsWith("caption-theme:") || item.element_id.startsWith("caption-dna:")) score += 30;
  return score;
}

function uniqueFamilies(families: HyperframesElementFamily[]): HyperframesElementFamily[] {
  return [...new Set(families)];
}

function recommendationReason(family: HyperframesElementFamily, mode: EnrichmentSourceMode, intent?: HyperframesPresentationIntent): string {
  const modeReason =
    mode === "screen_recording"
      ? `${family} keeps the source UI readable`
      : mode === "talking_head_avatar"
        ? `${family} supports packaged talking-head pacing`
        : `${family} is usable in mixed footage with review`;
  if (!intent) return modeReason;
  return `${modeReason}; ${intentReason(intent)}`;
}

function intentReason(intent: HyperframesPresentationIntent): string {
  if (intent === "internal_tutorial") return "best for quiet instructional guidance";
  if (intent === "short_form") return "best for high-retention short-form packaging";
  if (intent === "course_lesson") return "best for structured lesson beats";
  if (intent === "product_demo") return "best for UI path and feature demonstration";
  return "best for explaining concepts and takeaways";
}
