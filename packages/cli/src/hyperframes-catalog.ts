import type { EnrichmentCardKind, EnrichmentSourceMode } from "./artifacts";

export type HyperframesCatalogEntryKind = "visual_block" | "motion_primitive" | "asset_governance" | "audio_governance" | "qa_governance";
export type HyperframesMigrationDecision = "adapt" | "reimplement";
export type HyperframesDependencyKind = "script" | "module" | "style" | "font" | "tool" | "local";
export type HyperframesBlockId = (typeof HYPERFRAMES_BLOCK_CATALOG)[number]["id"];

export type HyperframesDependency = {
  id: string;
  kind: HyperframesDependencyKind;
  url?: string;
  domain?: string;
  package_name?: string;
  version?: string;
  versionless?: boolean;
  reason: string;
};

export type HyperframesCatalogEntry = {
  id: string;
  source: string;
  decision: HyperframesMigrationDecision;
  entry_kind: HyperframesCatalogEntryKind;
  visual_role: string;
  viewer_job: string;
  source_modes: readonly EnrichmentSourceMode[];
  card_kinds: readonly EnrichmentCardKind[];
  dependencies: readonly string[];
  template_family: string;
  motion: readonly string[];
  needs_assets?: boolean;
  asset_requirements?: readonly string[];
  test_coverage: readonly string[];
};

export type HyperframesDependencySummary = {
  id: string;
  kind: HyperframesDependencyKind;
  domain?: string;
  package_name?: string;
  version?: string;
  versionless_exception?: string;
  url?: string;
};

export const HYPERFRAMES_ALLOWED_CDN_DOMAINS = [
  "cdn.jsdelivr.net",
  "cdnjs.cloudflare.com",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
] as const;

export const HYPERFRAMES_ALLOWED_CDN_PACKAGES = ["gsap", "three", "d3", "topojson-client", "google-fonts", "bodymovin", "@lottiefiles/dotlottie-web", "animejs"] as const;

export const HYPERFRAMES_DEPENDENCIES = [
  {
    id: "gsap_3_14_2",
    kind: "script",
    url: "https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js",
    domain: "cdn.jsdelivr.net",
    package_name: "gsap",
    version: "3.15.0",
    reason: "seekable HyperFrames-compatible timelines",
  },
  {
    id: "lottie_web_5_12_2",
    kind: "script",
    url: "https://cdnjs.cloudflare.com/ajax/libs/bodymovin/5.12.2/lottie.min.js",
    domain: "cdnjs.cloudflare.com",
    package_name: "bodymovin",
    version: "5.12.2",
    reason: "seekable local Lottie JSON rendering for acquired animated icons",
  },
  {
    id: "dotlottie_web_0_76_0",
    kind: "module",
    url: "https://cdn.jsdelivr.net/npm/@lottiefiles/dotlottie-web@0.76.0/+esm",
    domain: "cdn.jsdelivr.net",
    package_name: "@lottiefiles/dotlottie-web",
    version: "0.76.0",
    reason: "seekable local .lottie rendering for acquired animated assets",
  },
  {
    id: "animejs_3_2_2",
    kind: "script",
    url: "https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.2/anime.min.js",
    domain: "cdnjs.cloudflare.com",
    package_name: "animejs",
    version: "3.2.2",
    reason: "HyperFrames-compatible runtime found in upstream motion graphics references",
  },
  {
    id: "font_inter",
    kind: "style",
    url: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=block",
    domain: "fonts.googleapis.com",
    package_name: "google-fonts",
    versionless: true,
    reason: "HyperFrames flowchart, notification, and social insert typography",
  },
  {
    id: "font_dm_sans",
    kind: "style",
    url: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=block",
    domain: "fonts.googleapis.com",
    package_name: "google-fonts",
    versionless: true,
    reason: "HyperFrames follow/social/app showcase typography",
  },
  {
    id: "font_code_combo",
    kind: "style",
    url: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Space+Mono:wght@400;700&display=block",
    domain: "fonts.googleapis.com",
    package_name: "google-fonts",
    versionless: true,
    reason: "code, terminal, and transition typography",
  },
  { id: "ffmpeg", kind: "tool", reason: "final mux, music mix, subtitle fallback, inspection frames" },
  { id: "ffprobe", kind: "tool", reason: "media duration, stream, and size validation" },
  { id: "bun_stdlib", kind: "tool", reason: "local manifest validation and deterministic file handling" },
  { id: "bundled_sfx_audio", kind: "local", reason: "local packaged cue sounds for future SFX mixing" },
] as const satisfies readonly HyperframesDependency[];

export const HYPERFRAMES_BLOCK_CATALOG = [
  visual("lt_clean_bar", "registry/blocks/lt-clean-bar", "adapt", "clean lower-third", "orient speaker or section", ["talking_head_avatar", "mixed"], ["lower_third"], ["gsap_3_14_2"], "lower_third_clean", ["clip_wipe", "accent_bar_grow", "stagger_text"], ["catalog", "generated_html"]),
  visual("lt_accent_underline", "registry/blocks/lt-accent-underline", "adapt", "underline lower-third", "emphasize spoken name or keyword", ["talking_head_avatar", "mixed"], ["lower_third"], ["gsap_3_14_2"], "lower_third_underline", ["underline_sweep", "text_rise"], ["catalog", "generated_html"]),
  visual("lt_soft_pill", "registry/blocks/lt-soft-pill", "adapt", "soft pill lower-third", "gentle identity or topic marker", ["talking_head_avatar", "mixed"], ["lower_third"], ["gsap_3_14_2"], "lower_third_pill", ["pill_scale", "text_rise"], ["catalog", "generated_html"]),
  visual("lt_bold_block", "registry/blocks/lt-bold-block", "adapt", "bold block lower-third", "high-energy topic packaging", ["talking_head_avatar"], ["title", "lower_third"], ["gsap_3_14_2"], "lower_third_bold", ["block_wipe", "text_pop"], ["catalog", "generated_html"]),
  visual("lt_mask_reveal", "registry/blocks/lt-mask-reveal", "adapt", "mask reveal lower-third", "premium reveal for speaker or payoff", ["talking_head_avatar", "mixed"], ["quote", "lower_third"], ["gsap_3_14_2"], "lower_third_mask", ["mask_reveal", "accent_sweep"], ["catalog", "motion_marker"]),
  visual("lt_side_rule", "registry/blocks/lt-side-rule", "adapt", "side-rule lower-third", "editorial side marker", ["talking_head_avatar", "mixed"], ["lower_third"], ["gsap_3_14_2"], "lower_third_side_rule", ["rule_draw", "text_slide"], ["catalog", "generated_html"]),
  visual("lt_stack_bars", "registry/blocks/lt-stack-bars", "adapt", "stacked bar lower-third", "structured multi-line identity", ["talking_head_avatar"], ["lower_third", "key_point"], ["gsap_3_14_2"], "lower_third_stack", ["bar_wipe", "stagger_text"], ["catalog", "generated_html"]),
  visual("yt_lower_third", "registry/blocks/yt-lower-third", "adapt", "YouTube subscribe lower-third", "publish CTA or channel identity", ["talking_head_avatar", "mixed"], ["lower_third"], ["gsap_3_14_2", "font_dm_sans"], "follow_card_youtube", ["slide_in", "button_state_flip"], ["catalog", "asset_requirement"], true, ["avatar_or_channel_image"]),
  visual("news_ticker", "registry/blocks/news-ticker", "adapt", "ticker and crawl", "create pace relief or headline packaging", ["talking_head_avatar", "mixed"], ["lower_third", "key_point"], ["gsap_3_14_2", "font_inter"], "ticker", ["ticker_scroll", "headline_reveal"], ["catalog", "generated_html"]),
  visual("instagram_follow", "registry/blocks/instagram-follow", "adapt", "Instagram follow card", "short-form follow CTA", ["talking_head_avatar"], ["lower_third", "image"], ["gsap_3_14_2", "font_dm_sans"], "follow_card_instagram", ["slide_in", "button_pop"], ["catalog", "asset_requirement"], true, ["avatar_asset"]),
  visual("tiktok_follow", "registry/blocks/tiktok-follow", "adapt", "TikTok follow card", "short-form follow CTA", ["talking_head_avatar"], ["lower_third", "image"], ["gsap_3_14_2", "font_dm_sans"], "follow_card_tiktok", ["slide_in", "button_pop"], ["catalog", "asset_requirement"], true, ["avatar_asset"]),
  visual("code_highlight", "registry/blocks/code-highlight", "adapt", "code or keyword highlight", "draw attention to one line or phrase", ["screen_recording", "mixed"], ["screenshot_focus", "key_point"], ["gsap_3_14_2", "font_code_combo"], "code_highlight", ["highlight_sweep", "context_dim"], ["catalog", "screen_html"]),
  visual("code_scroll", "registry/blocks/code-scroll", "adapt", "scroll and region focus", "guide a code walkthrough", ["screen_recording", "mixed"], ["screenshot_focus"], ["gsap_3_14_2", "font_code_combo"], "code_scroll", ["scroll_track", "region_focus"], ["catalog", "screen_html"]),
  visual("code_typing", "registry/blocks/code-typing", "adapt", "typewriter code reveal", "show an implementation appearing over time", ["screen_recording", "mixed"], ["key_point"], ["gsap_3_14_2", "font_code_combo"], "code_typing", ["typewriter", "caret_blink"], ["catalog", "motion_marker"]),
  visual("code_diff", "registry/blocks/code-diff", "adapt", "before/after code diff", "explain a change", ["screen_recording", "mixed"], ["key_point"], ["gsap_3_14_2", "font_code_combo"], "code_diff", ["diff_line_reveal", "add_del_glow"], ["catalog", "generated_html"]),
  visual("code_morph", "registry/blocks/code-morph", "adapt", "code morph", "show a code concept transforming", ["screen_recording", "mixed"], ["key_point"], ["gsap_3_14_2", "font_code_combo"], "code_morph", ["token_morph", "context_dim"], ["catalog", "generated_html"]),
  visual("flowchart_steps", "registry/blocks/flowchart", "adapt", "flow and cursor sequence", "explain a multi-step decision or process", ["talking_head_avatar", "screen_recording", "mixed"], ["flowchart"], ["gsap_3_14_2", "font_inter"], "flowchart", ["node_reveal", "edge_draw", "cursor_path", "selection_highlight"], ["catalog", "real_video_candidate"]),
  visual("zoom_focus", "registry/blocks/cinematic-zoom", "reimplement", "zoom-to-region transition", "focus attention without hiding UI", ["screen_recording", "mixed"], ["screenshot_focus"], ["gsap_3_14_2", "font_code_combo"], "zoom_focus", ["target_zoom", "spotlight_sweep"], ["screen_html", "inspection"]),
  visual("whip_pan_transition", "registry/blocks/whip-pan", "reimplement", "fast transition", "pace change between segments", ["mixed", "talking_head_avatar"], ["title", "key_point"], ["gsap_3_14_2", "font_code_combo"], "transition_whip_pan", ["directional_blur", "fast_pan"], ["generated_html"]),
  visual("macos_notification", "registry/blocks/macos-notification", "adapt", "small notification insert", "surface a lightweight contextual note", ["screen_recording", "mixed"], ["key_point", "quote", "image"], ["gsap_3_14_2", "font_inter"], "notification_macos", ["slide_down", "soft_blur"], ["catalog", "screen_html"]),
  visual("x_post", "registry/blocks/x-post", "adapt", "X post insert", "show social proof or quote", ["mixed", "talking_head_avatar"], ["quote", "image"], ["gsap_3_14_2", "font_inter"], "social_x_post", ["card_slide", "metric_reveal"], ["catalog", "text_escaping"]),
  visual("reddit_post", "registry/blocks/reddit-post", "adapt", "Reddit post insert", "show community quote or objection", ["mixed", "talking_head_avatar"], ["quote", "image"], ["gsap_3_14_2", "font_dm_sans"], "social_reddit_post", ["card_slide", "vote_reveal"], ["catalog", "text_escaping"]),
  visual("app_showcase", "registry/blocks/app-showcase", "adapt", "app or product showcase", "package app/product visual support", ["mixed", "talking_head_avatar"], ["image", "key_point"], ["gsap_3_14_2", "font_dm_sans"], "app_showcase", ["device_slide", "stat_reveal"], ["catalog", "asset_requirement"], true, ["product_or_screenshot_image"]),
  primitive("cursor_click_ripple", "HyperFrames animation rules cursor-click-ripple", "click ripple primitive", "make a UI click legible", ["screen_recording", "mixed"], ["screenshot_focus"], ["gsap_3_14_2"], "cursor_click", ["cursor_path", "click_ripple"], ["generated_html", "real_video_candidate"]),
  primitive("target_zoom", "HyperFrames animation rules coordinate-target-zoom", "target zoom primitive", "briefly focus a coordinate region", ["talking_head_avatar", "screen_recording", "mixed"], ["screenshot_focus"], ["gsap_3_14_2"], "target_zoom", ["coordinate_zoom", "spotlight_sweep"], ["coordinate_test"]),
  primitive("keyword_glow", "HyperFrames animation rules asr-keyword-glow", "ASR keyword emphasis", "sync a word or phrase payoff to speech", ["talking_head_avatar", "screen_recording", "mixed"], ["title", "lower_third", "key_point", "quote"], ["gsap_3_14_2"], "keyword_glow", ["word_glow", "underline_sweep"], ["cue_timing_test"]),
  governance("asset_manifest_adopt", "HyperFrames media-use scripts", "asset_governance", "reimplement", "asset adopt and provenance", "make generated/imported assets auditable", ["talking_head_avatar", "screen_recording", "mixed"], ["ffprobe", "bun_stdlib"], "asset_manifest", ["hash_probe", "provenance_record"], ["asset_manifest_tests"]),
  governance("bundled_sfx", "HyperFrames SFX manifest/assets", "audio_governance", "adapt", "bundled cue sounds", "support subtle audio punctuation", ["talking_head_avatar", "screen_recording", "mixed"], ["bundled_sfx_audio", "ffmpeg"], "sfx", ["cue_mix", "duck_under_speech"], ["manifest", "mix_tests"]),
  governance("visual_inspection_report", "HyperFrames QA practices", "qa_governance", "reimplement", "inspection frames and dependency report", "prove visual readability after render", ["talking_head_avatar", "screen_recording", "mixed"], ["ffmpeg", "ffprobe"], "inspection", ["midpoint_frame", "contact_sheet", "dependency_report"], ["inspect_tests"]),
] as const satisfies readonly HyperframesCatalogEntry[];

export function getHyperframesCatalogEntry(id: string): HyperframesCatalogEntry | undefined {
  return HYPERFRAMES_BLOCK_CATALOG.find((entry) => entry.id === id);
}

export function getHyperframesDependency(id: string): HyperframesDependency | undefined {
  return HYPERFRAMES_DEPENDENCIES.find((entry) => entry.id === id);
}

export function assertKnownHyperframesBlockId(value: string, name = "block_id"): HyperframesBlockId {
  if (getHyperframesCatalogEntry(value)) return value as HyperframesBlockId;
  throw new Error(`${name} must be a supported HyperFrames block id`);
}

export function assertRenderableHyperframesBlockForCard(
  value: string,
  kind: EnrichmentCardKind,
  sourceMode: EnrichmentSourceMode,
  name = "block_id",
): HyperframesBlockId {
  const entry = getHyperframesCatalogEntry(value);
  if (!entry) throw new Error(`${name} must be a supported HyperFrames block id`);
  if (entry.entry_kind !== "visual_block" && entry.entry_kind !== "motion_primitive") {
    throw new Error(`${name} must reference a renderable HyperFrames visual block`);
  }
  if (!entry.card_kinds.includes(kind)) throw new Error(`${name} is not compatible with ${kind} cards`);
  if (!entry.source_modes.includes(sourceMode)) throw new Error(`${name} is not compatible with ${sourceMode}`);
  return value as HyperframesBlockId;
}

export function defaultHyperframesBlockForCard(kind: EnrichmentCardKind, sourceMode: EnrichmentSourceMode): HyperframesBlockId {
  if (sourceMode === "screen_recording") {
    if (kind === "title") return "keyword_glow";
    if (kind === "screenshot_focus") return "target_zoom";
    if (kind === "flowchart") return "flowchart_steps";
    if (kind === "quote") return "macos_notification";
    if (kind === "lower_third") return "keyword_glow";
    if (kind === "image") return "macos_notification";
    return "code_highlight";
  }
  if (sourceMode === "mixed") {
    if (kind === "title") return "whip_pan_transition";
    if (kind === "screenshot_focus") return "target_zoom";
    if (kind === "flowchart") return "flowchart_steps";
    if (kind === "quote") return "x_post";
    if (kind === "image") return "app_showcase";
    if (kind === "lower_third") return "lt_accent_underline";
    return "macos_notification";
  }
  if (kind === "title") return "lt_bold_block";
  if (kind === "quote") return "lt_mask_reveal";
  if (kind === "flowchart") return "flowchart_steps";
  if (kind === "image") return "app_showcase";
  if (kind === "lower_third") return "lt_clean_bar";
  if (kind === "screenshot_focus") return "target_zoom";
  return "lt_stack_bars";
}

export function validateHyperframesCdnDependency(dependency: HyperframesDependency): HyperframesDependencySummary {
  if (dependency.kind === "tool" || dependency.kind === "local") return { id: dependency.id, kind: dependency.kind };
  if (!dependency.url) throw new Error(`dependency ${dependency.id} missing url`);
  const parsed = new URL(dependency.url);
  const domain = parsed.hostname;
  if (!isAllowedDomain(domain)) throw new Error(`dependency ${dependency.id} uses unallowlisted domain ${domain}`);
  if (dependency.domain && dependency.domain !== domain) throw new Error(`dependency ${dependency.id} domain metadata does not match url`);
  const extracted = extractCdnPackage(parsed);
  if (usesPackageVersionedCdn(domain) && (!extracted.package_name || !extracted.version)) {
    throw new Error(`dependency ${dependency.id} url must include a fixed CDN package version`);
  }
  if (dependency.package_name && extracted.package_name && dependency.package_name !== extracted.package_name) {
    throw new Error(`dependency ${dependency.id} package metadata does not match url`);
  }
  if (dependency.version && extracted.version && dependency.version !== extracted.version) {
    throw new Error(`dependency ${dependency.id} version metadata does not match url`);
  }
  const packageName = extracted.package_name ?? dependency.package_name;
  const version = extracted.version ?? dependency.version;
  if (packageName && !isAllowedPackage(packageName)) throw new Error(`dependency ${dependency.id} uses unapproved package ${packageName}`);
  if (dependency.versionless) {
    const exception = versionlessException(domain, packageName);
    if (!exception) throw new Error(`dependency ${dependency.id} is not allowed to be versionless`);
    return { id: dependency.id, kind: dependency.kind, domain, package_name: packageName, versionless_exception: exception, url: dependency.url };
  }
  if (!version) throw new Error(`dependency ${dependency.id} missing fixed version`);
  if (!isFixedVersion(version)) throw new Error(`dependency ${dependency.id} has floating version ${version}`);
  return { id: dependency.id, kind: dependency.kind, domain, package_name: packageName, version, url: dependency.url };
}

export function validateHyperframesCatalogDependencies(entries: readonly HyperframesCatalogEntry[] = HYPERFRAMES_BLOCK_CATALOG): HyperframesDependencySummary[] {
  const dependencies = dependenciesForHyperframesEntries(entries);
  return dependencies.map(validateHyperframesCdnDependency);
}

export function dependenciesForHyperframesBlocks(ids: readonly string[]): HyperframesDependency[] {
  return dependenciesForHyperframesEntries(
    ids.map((id) => {
      const entry = getHyperframesCatalogEntry(id);
      if (!entry) throw new Error(`unknown HyperFrames block id: ${id}`);
      return entry;
    }),
  );
}

export function dependenciesForHyperframesEntries(entries: readonly HyperframesCatalogEntry[]): HyperframesDependency[] {
  const dependencyIds = uniqueStrings(entries.flatMap((entry) => [...entry.dependencies]));
  return dependencyIds.map((id) => {
    const dependency = HYPERFRAMES_DEPENDENCIES.find((item) => item.id === id);
    if (!dependency) throw new Error(`unknown HyperFrames dependency id: ${id}`);
    return dependency;
  });
}

export function hyperframesCatalogCoverage() {
  return {
    talking_head_avatar: HYPERFRAMES_BLOCK_CATALOG.filter((entry) => entry.entry_kind === "visual_block" && entry.source_modes.includes("talking_head_avatar")).length,
    screen_recording: HYPERFRAMES_BLOCK_CATALOG.filter((entry) => entry.entry_kind === "visual_block" && entry.source_modes.includes("screen_recording")).length,
    mixed: HYPERFRAMES_BLOCK_CATALOG.filter((entry) => entry.entry_kind === "visual_block" && entry.source_modes.includes("mixed")).length,
  };
}

function visual(
  id: string,
  source: string,
  decision: HyperframesMigrationDecision,
  visualRole: string,
  viewerJob: string,
  sourceModes: readonly EnrichmentSourceMode[],
  cardKinds: readonly EnrichmentCardKind[],
  dependencies: readonly string[],
  templateFamily: string,
  motion: readonly string[],
  testCoverage: readonly string[],
  needsAssets = false,
  assetRequirements: readonly string[] = [],
): HyperframesCatalogEntry {
  return {
    id,
    source,
    decision,
    entry_kind: "visual_block",
    visual_role: visualRole,
    viewer_job: viewerJob,
    source_modes: sourceModes,
    card_kinds: cardKinds,
    dependencies,
    template_family: templateFamily,
    motion,
    needs_assets: needsAssets,
    asset_requirements: assetRequirements,
    test_coverage: testCoverage,
  };
}

function primitive(
  id: string,
  source: string,
  visualRole: string,
  viewerJob: string,
  sourceModes: readonly EnrichmentSourceMode[],
  cardKinds: readonly EnrichmentCardKind[],
  dependencies: readonly string[],
  templateFamily: string,
  motion: readonly string[],
  testCoverage: readonly string[],
): HyperframesCatalogEntry {
  return {
    id,
    source,
    decision: "reimplement",
    entry_kind: "motion_primitive",
    visual_role: visualRole,
    viewer_job: viewerJob,
    source_modes: sourceModes,
    card_kinds: cardKinds,
    dependencies,
    template_family: templateFamily,
    motion,
    test_coverage: testCoverage,
  };
}

function governance(
  id: string,
  source: string,
  kind: HyperframesCatalogEntryKind,
  decision: HyperframesMigrationDecision,
  visualRole: string,
  viewerJob: string,
  sourceModes: readonly EnrichmentSourceMode[],
  dependencies: readonly string[],
  templateFamily: string,
  motion: readonly string[],
  testCoverage: readonly string[],
): HyperframesCatalogEntry {
  return {
    id,
    source,
    decision,
    entry_kind: kind,
    visual_role: visualRole,
    viewer_job: viewerJob,
    source_modes: sourceModes,
    card_kinds: [],
    dependencies,
    template_family: templateFamily,
    motion,
    test_coverage: testCoverage,
  };
}

function extractCdnPackage(url: URL): { package_name?: string; version?: string } {
  if (url.hostname === "cdn.jsdelivr.net") {
    const match = /^\/npm\/((?:@[^/]+\/)?[^@/]+)@([^/]+)\//.exec(url.pathname);
    return match ? { package_name: match[1], version: match[2] } : {};
  }
  if (url.hostname === "cdnjs.cloudflare.com") {
    const match = /^\/ajax\/libs\/([^/]+)\/([^/]+)\//.exec(url.pathname);
    return match ? { package_name: match[1], version: match[2] } : {};
  }
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") return { package_name: "google-fonts" };
  return {};
}

function versionlessException(domain: string, packageName: string | undefined): string | undefined {
  if ((domain === "fonts.googleapis.com" || domain === "fonts.gstatic.com") && packageName === "google-fonts") return "google-fonts-family-css";
  return undefined;
}

function isAllowedDomain(value: string): boolean {
  return HYPERFRAMES_ALLOWED_CDN_DOMAINS.includes(value as (typeof HYPERFRAMES_ALLOWED_CDN_DOMAINS)[number]);
}

function isAllowedPackage(value: string): boolean {
  return HYPERFRAMES_ALLOWED_CDN_PACKAGES.includes(value as (typeof HYPERFRAMES_ALLOWED_CDN_PACKAGES)[number]);
}

function usesPackageVersionedCdn(domain: string): boolean {
  return domain === "cdn.jsdelivr.net" || domain === "cdnjs.cloudflare.com";
}

function isFixedVersion(value: string): boolean {
  return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(value);
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}
