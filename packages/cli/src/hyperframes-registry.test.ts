import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { adapterForVendoredElement, buildHyperframesPurposeRecommendations, buildHyperframesRecommendations } from "./hyperframes-adapter";
import {
  assertKnownVendoredElement,
  assertSafeVendoredTarget,
  getVendoredHyperframesStats,
  getVendoredSfx,
  installVendoredRegistryItem,
  listVendoredElementCatalog,
  listVendoredRegistryItems,
  loadVendoredRegistryManifest,
  loadVendoredRegistryItem,
  resolveVendoredRegistryItemWithDependencies,
} from "./hyperframes-registry";

test("reads the vendored HyperFrames registry manifest and completeness counts", () => {
  const manifest = loadVendoredRegistryManifest();
  expect(manifest.items.filter((item) => item.type === "hyperframes:block").length).toBe(109);
  expect(manifest.items.filter((item) => item.type === "hyperframes:component").length).toBe(25);

  const stats = getVendoredHyperframesStats();
  expect(stats.registry.blocks).toBe(109);
  expect(stats.registry.components).toBe(25);
  expect(stats.registry.examples >= 8).toBe(true);
  expect(stats.registry.registry_items >= 142).toBe(true);
  expect(stats.resources.sfx).toBe(19);
  expect(stats.resources.animation_rules >= 30).toBe(true);
  expect(stats.resources.animation_blueprints >= 15).toBe(true);
  expect(stats.resources.caption_themes >= 26).toBe(true);
  expect(stats.resources.motion_categories >= 10).toBe(true);
  expect(stats.resources.frame_presets >= 10).toBe(true);
});

test("catalog exposes blocks, components, captions, SFX, rules, categories, and frame presets", () => {
  const catalog = listVendoredElementCatalog();
  expect(catalog.some((item) => item.element_type === "registry_block" && item.element_id === "code-highlight" && item.renderable)).toBe(true);
  expect(catalog.some((item) => item.element_type === "registry_component" && item.element_id === "shimmer-sweep" && item.renderable)).toBe(true);
  expect(catalog.some((item) => item.element_type === "caption_identity" && item.element_id === "anchor" && item.renderable)).toBe(true);
  expect(catalog.some((item) => item.element_type === "sfx" && item.element_id === "click" && item.renderable)).toBe(true);
  expect(catalog.some((item) => item.element_type === "animation_rule" && item.element_id === "animation-rule:coordinate-target-zoom" && item.guidance_only)).toBe(true);
  expect(catalog.some((item) => item.element_type === "animation_rule" && item.element_id === "motion-category:lower-thirds" && item.guidance_only)).toBe(true);
  expect(catalog.some((item) => item.element_type === "animation_rule" && item.element_id === "frame-preset:blue-professional" && item.guidance_only)).toBe(true);
  expect(catalog.find((item) => item.element_id === "animation-rule:coordinate-target-zoom")?.source_path).toContain("packages/cli/vendor/hyperframes/resources/");
  expect(assertKnownVendoredElement("code-highlight", "registry_block").title).toContain("Code");
  expect(getVendoredSfx("click").file).toBe("click.mp3");
});

test("adapter profiles classify every vendored element and keep screen recommendations safe", () => {
  const catalog = listVendoredElementCatalog();
  expect(catalog.every((item) => adapterForVendoredElement(item).family.length > 0)).toBe(true);
  expect(adapterForVendoredElement(catalog.find((item) => item.element_id === "lt-accent-underline")!).family).toBe("lower_third");
  expect(adapterForVendoredElement(catalog.find((item) => item.element_id === "caption-highlight")!).render_strategy).toBe("component_caption");
  expect(adapterForVendoredElement(catalog.find((item) => item.element_id === "code-snippet-dark-modern")!).family).toBe("code");
  expect(adapterForVendoredElement(catalog.find((item) => item.element_id === "transitions-scale")!).family).toBe("transition");
  expect(adapterForVendoredElement(catalog.find((item) => item.element_id === "vfx-iphone-device")!).family).toBe("device");
  expect(adapterForVendoredElement(catalog.find((item) => item.element_id === "data-chart")!).family).toBe("chart_map");

  const screen = buildHyperframesRecommendations(catalog).screen_recording;
  expect(screen.some((item) => item.family === "transition" || item.family === "vfx_texture" || item.family === "social" || item.family === "app_showcase")).toBe(false);
  expect(screen.slice(0, 18).some((item) => item.element_id === "animation-rule:coordinate-target-zoom")).toBe(true);
  expect(adapterForVendoredElement(catalog.find((item) => item.element_id === "animation-rule:coordinate-target-zoom")!).render_strategy).toBe("cli_overlay");
  expect(adapterForVendoredElement(catalog.find((item) => item.element_id === "animation-rule:cursor-click-ripple")!).family).toBe("screen_focus");
  expect(adapterForVendoredElement(catalog.find((item) => item.element_id === "animation-rule:asr-keyword-glow")!).family).toBe("caption");

  const purpose = buildHyperframesPurposeRecommendations(catalog);
  expect(purpose.screen_recording.internal_tutorial.some((item) => item.family === "screen_focus")).toBe(true);
  expect(purpose.screen_recording.internal_tutorial.some((item) => item.family === "sfx")).toBe(true);
  expect(purpose.screen_recording.internal_tutorial.some((item) => item.family === "transition" || item.family === "social" || item.family === "app_showcase")).toBe(false);
  expect(purpose.talking_head_avatar.short_form.some((item) => item.family === "transition" || item.family === "social" || item.family === "app_showcase")).toBe(true);
  expect(purpose.talking_head_avatar.product_demo.some((item) => item.family === "app_showcase")).toBe(true);
});

test("installs registry blocks and components into a local HyperFrames workspace", () => {
  const dir = mkdtempSync(join(tmpdir(), "koubo-clip-registry-"));
  const block = installVendoredRegistryItem("code-highlight", dir, "hyperframes:block");
  expect(block.items.map((item) => item.name)).toEqual(["code-highlight"]);
  const blockPath = join(dir, "compositions", "code-highlight.html");
  expect(existsSync(blockPath)).toBe(true);
  expect(readFileSync(blockPath, "utf8")).toContain("koubo-clip:vendored-hyperframes-item code-highlight");

  const component = installVendoredRegistryItem("shimmer-sweep", dir, "hyperframes:component");
  expect(component.items.map((item) => item.name)).toEqual(["shimmer-sweep"]);
  const componentPath = join(dir, "compositions", "components", "shimmer-sweep.html");
  expect(existsSync(componentPath)).toBe(true);
  expect(readFileSync(componentPath, "utf8")).toContain("shimmer-sweep-target");
});

test("resolver loads items and preserves dependency topology", () => {
  const item = loadVendoredRegistryItem("code-highlight", "hyperframes:block");
  expect(item.files[0]?.target).toBe("compositions/code-highlight.html");
  const resolved = resolveVendoredRegistryItemWithDependencies("code-highlight", "hyperframes:block");
  expect(resolved.at(-1)?.name).toBe("code-highlight");
  expect(listVendoredRegistryItems("hyperframes:block").length).toBe(109);
});

test("registry target safety rejects absolute paths, traversal, and Windows drive paths", () => {
  const root = mkdtempSync(join(tmpdir(), "koubo-clip-safe-"));
  expect(assertSafeVendoredTarget(root, "compositions/code-highlight.html")).toContain(root);
  expect(() => assertSafeVendoredTarget(root, "/tmp/out.html")).toThrow("relative path");
  expect(() => assertSafeVendoredTarget(root, "../out.html")).toThrow("must not contain");
  expect(() => assertSafeVendoredTarget(root, "C:\\temp\\out.html")).toThrow("relative path");
});
