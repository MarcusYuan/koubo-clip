import { expect, test } from "bun:test";
import { assertResolvedCaptionLayout, renderAssCaptionFile, resolveCaptionLayout } from "./caption-layout";

test("caption layout resolves aspect-ratio safe defaults", () => {
  expect(resolveCaptionLayout({ width: 1080, height: 1920, source_mode: "talking_head_avatar" })).toEqual({
    placement: "center_lower", size: "medium", anchor_x_ratio: 0.5, anchor_y_ratio: 0.7, font_size_px: 46,
  });
  expect(resolveCaptionLayout({ width: 1080, height: 1920, source_mode: "screen_recording" }).font_size_px).toBe(42);
  expect(resolveCaptionLayout({ width: 1080, height: 1350, source_mode: "talking_head_avatar" }).anchor_y_ratio).toBe(0.76);
  expect(resolveCaptionLayout({ width: 1920, height: 1080, source_mode: "talking_head_avatar" }).anchor_y_ratio).toBe(0.9);
});

test("caption layout keeps presets inside their safe areas", () => {
  const small = resolveCaptionLayout({ width: 1080, height: 1920, source_mode: "talking_head_avatar", intent: { placement: "bottom_safe", size: "small" } });
  const large = resolveCaptionLayout({ width: 1080, height: 1920, source_mode: "talking_head_avatar", intent: { placement: "center_lower", size: "large" } });
  expect(small.anchor_y_ratio).toBe(0.82);
  expect(large.font_size_px > small.font_size_px).toBe(true);
  expect(() => assertResolvedCaptionLayout({ ...small, anchor_y_ratio: 0.91 })).toThrow("safe area");
  expect(() => resolveCaptionLayout({ width: 0, height: 1920, source_mode: "mixed" })).toThrow("dimensions");
});

test("ASS fallback materializes the frozen caption anchor and size", () => {
  const layout = resolveCaptionLayout({ width: 1080, height: 1920, source_mode: "talking_head_avatar" });
  const ass = renderAssCaptionFile([{ start: 0.1, end: 1.25, text: "Line {one}\\two\nnext" }], layout, 1080, 1920);
  expect(ass).toContain("PlayResX: 1080");
  expect(ass).toContain("PlayResY: 1920");
  expect(ass).toContain("Style: Default,Arial,46,");
  expect(ass).toContain("{\\an5\\pos(540,1344)}");
  expect(ass).toContain("Line \\{one\\}\\\\two\\Nnext");
});
