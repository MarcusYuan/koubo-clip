import { expect, test } from "bun:test";
import {
  HYPERFRAMES_BLOCK_CATALOG,
  assertKnownHyperframesBlockId,
  assertRenderableHyperframesBlockForCard,
  defaultHyperframesBlockForCard,
  dependenciesForHyperframesBlocks,
  hyperframesCatalogCoverage,
  validateHyperframesCatalogDependencies,
  validateHyperframesCdnDependency,
} from "./hyperframes-catalog";

const inventoryIds = [
  "lt_clean_bar",
  "lt_accent_underline",
  "lt_soft_pill",
  "lt_bold_block",
  "lt_mask_reveal",
  "lt_side_rule",
  "lt_stack_bars",
  "yt_lower_third",
  "news_ticker",
  "instagram_follow",
  "tiktok_follow",
  "code_highlight",
  "code_scroll",
  "code_typing",
  "code_diff",
  "code_morph",
  "flowchart_steps",
  "zoom_focus",
  "whip_pan_transition",
  "macos_notification",
  "x_post",
  "reddit_post",
  "app_showcase",
  "cursor_click_ripple",
  "target_zoom",
  "keyword_glow",
  "asset_manifest_adopt",
  "bundled_sfx",
  "visual_inspection_report",
] as const;

test("HyperFrames catalog covers the current renderable inventory", () => {
  const ids = HYPERFRAMES_BLOCK_CATALOG.map((entry) => entry.id);
  for (const id of inventoryIds) expect(ids).toContain(id);
  for (const entry of HYPERFRAMES_BLOCK_CATALOG) {
    expect(entry.visual_role.length > 0).toBe(true);
    const legacyField = ["capa", "bility"].join("");
    expect(legacyField in entry).toBe(false);
    expect(entry.source_modes.length > 0).toBe(true);
    expect(entry.viewer_job.length > 0).toBe(true);
    expect(entry.test_coverage.length > 0).toBe(true);
    expect(entry.source.includes("Studio")).toBe(false);
    expect(entry.source.includes("cloud")).toBe(false);
    expect(entry.source.includes("provider")).toBe(false);
  }
});

test("HyperFrames catalog has first-wave source-mode coverage", () => {
  const coverage = hyperframesCatalogCoverage();
  expect(coverage.talking_head_avatar >= 5).toBe(true);
  expect(coverage.screen_recording >= 6).toBe(true);
  expect(coverage.mixed >= 2).toBe(true);
  expect(defaultHyperframesBlockForCard("screenshot_focus", "screen_recording")).toBe("target_zoom");
  expect(defaultHyperframesBlockForCard("lower_third", "talking_head_avatar")).toBe("lt_clean_bar");
  expect(defaultHyperframesBlockForCard("quote", "mixed")).toBe("x_post");
});

test("HyperFrames default card blocks are renderable for every source mode and card kind", () => {
  const sourceModes = ["talking_head_avatar", "screen_recording", "mixed"] as const;
  const cardKinds = ["title", "key_point", "quote", "flowchart", "image", "screenshot_focus", "lower_third"] as const;
  for (const sourceMode of sourceModes) {
    for (const kind of cardKinds) {
      const blockId = defaultHyperframesBlockForCard(kind, sourceMode);
      expect(assertRenderableHyperframesBlockForCard(blockId, kind, sourceMode)).toBe(blockId);
    }
  }
});

test("HyperFrames catalog validates allowlisted CDN dependencies", () => {
  const summaries = validateHyperframesCatalogDependencies();
  expect(summaries.some((item) => item.package_name === "gsap" && item.version === "3.14.2")).toBe(true);
  expect(summaries.some((item) => item.package_name === "google-fonts" && item.versionless_exception === "google-fonts-family-css")).toBe(true);
  expect(summaries.some((item) => item.package_name === "bodymovin" && item.version === "5.12.2")).toBe(false);
  const lottie = validateHyperframesCdnDependency({
    id: "dotlottie",
    kind: "module",
    url: "https://cdn.jsdelivr.net/npm/@lottiefiles/dotlottie-web@0.76.0/+esm",
    domain: "cdn.jsdelivr.net",
    package_name: "@lottiefiles/dotlottie-web",
    version: "0.76.0",
    reason: "test",
  });
  expect(lottie.package_name).toBe("@lottiefiles/dotlottie-web");
  expect(lottie.version).toBe("0.76.0");
  const codeDeps = dependenciesForHyperframesBlocks(["code_highlight"]).map((item) => item.id);
  expect(codeDeps).toContain("gsap_3_14_2");
  expect(codeDeps).toContain("font_code_combo");
});

test("HyperFrames CDN policy rejects unsafe domains, packages, and floating versions", () => {
  expect(() =>
    validateHyperframesCdnDependency({
      id: "bad-domain",
      kind: "script",
      url: "https://example.com/gsap.js",
      domain: "example.com",
      package_name: "gsap",
      version: "3.14.2",
      reason: "test",
    }),
  ).toThrow("unallowlisted domain");

  expect(() =>
    validateHyperframesCdnDependency({
      id: "bad-package",
      kind: "script",
      url: "https://cdn.jsdelivr.net/npm/left-pad@1.3.0/index.js",
      domain: "cdn.jsdelivr.net",
      reason: "test",
    }),
  ).toThrow("unapproved package");

  expect(() =>
    validateHyperframesCdnDependency({
      id: "floating",
      kind: "script",
      url: "https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js",
      domain: "cdn.jsdelivr.net",
      reason: "test",
    }),
  ).toThrow("floating version");

  expect(() =>
    validateHyperframesCdnDependency({
      id: "missing-version",
      kind: "script",
      url: "https://cdn.jsdelivr.net/npm/gsap/dist/gsap.min.js",
      domain: "cdn.jsdelivr.net",
      package_name: "gsap",
      reason: "test",
    }),
  ).toThrow("fixed CDN package version");

  expect(() =>
    validateHyperframesCdnDependency({
      id: "spoofed-package",
      kind: "script",
      url: "https://cdn.jsdelivr.net/npm/left-pad@1.3.0/index.js",
      domain: "cdn.jsdelivr.net",
      package_name: "gsap",
      version: "3.14.2",
      reason: "test",
    }),
  ).toThrow("package metadata does not match url");

  expect(() =>
    validateHyperframesCdnDependency({
      id: "spoofed-version",
      kind: "script",
      url: "https://cdn.jsdelivr.net/npm/gsap@3.14.1/dist/gsap.min.js",
      domain: "cdn.jsdelivr.net",
      package_name: "gsap",
      version: "3.14.2",
      reason: "test",
    }),
  ).toThrow("version metadata does not match url");
});

test("HyperFrames CDN policy parses cdnjs and allows Google Fonts as the explicit versionless exception", () => {
  const cdnjs = validateHyperframesCdnDependency({
    id: "cdnjs-gsap",
    kind: "script",
    url: "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.14.2/gsap.min.js",
    domain: "cdnjs.cloudflare.com",
    reason: "test",
  });
  expect(cdnjs.package_name).toBe("gsap");
  expect(cdnjs.version).toBe("3.14.2");

  const fonts = validateHyperframesCdnDependency({
    id: "fonts",
    kind: "style",
    url: "https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=block",
    domain: "fonts.googleapis.com",
    package_name: "google-fonts",
    versionless: true,
    reason: "test",
  });
  expect(fonts.versionless_exception).toBe("google-fonts-family-css");
});

test("HyperFrames catalog rejects unknown block ids", () => {
  expect(assertKnownHyperframesBlockId("lt_clean_bar")).toBe("lt_clean_bar");
  expect(() => assertKnownHyperframesBlockId("studio_cloud_provider")).toThrow("block id");
});

test("HyperFrames catalog rejects non-renderable or incompatible card blocks", () => {
  expect(assertRenderableHyperframesBlockForCard("target_zoom", "screenshot_focus", "screen_recording")).toBe("target_zoom");
  expect(() => assertRenderableHyperframesBlockForCard("visual_inspection_report", "key_point", "screen_recording")).toThrow("renderable");
  expect(() => assertRenderableHyperframesBlockForCard("target_zoom", "lower_third", "screen_recording")).toThrow("lower_third");
  expect(() => assertRenderableHyperframesBlockForCard("lt_bold_block", "title", "screen_recording")).toThrow("screen_recording");
});
