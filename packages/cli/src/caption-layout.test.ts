import { expect, test } from "bun:test";
import {
  assertResolvedCaptionLayout,
  assertCaptionCuesFitLayout,
  isolatedTailCaptionWarning,
  layoutCaptionCues,
  renderAssCaptionFile,
  resolveCaptionLayout,
} from "./caption-layout";

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

test("narrow portrait captions split without losing text or timing", () => {
  const layout = {
    placement: "center_lower",
    size: "medium",
    anchor_x_ratio: 0.5,
    anchor_y_ratio: 0.7,
    font_size_px: 22,
  } as const;
  const text = "我们直接导航，然后我们这一款功能可以完整展示出来";
  const cues = layoutCaptionCues([{ start: 1.25, end: 4.75, text }], layout, 224, 480);
  expect(cues.length > 1).toBe(true);
  expect(cues[0]?.start).toBe(1.25);
  expect(cues.at(-1)?.end).toBe(4.75);
  expect(cues.map((cue) => cue.text.replaceAll("\n", "")).join("")).toBe(text);
  expect(cues.every((cue) => cue.text.split("\n").length <= 2)).toBe(true);
  expect(cues.every((cue) => cue.text.split("\n").every((line) => !/^[，。！？；：、,.!?;:]$/u.test(line)))).toBe(true);
  expect(cues.every((cue, index) => index === 0 || cue.start === cues[index - 1]?.end)).toBe(true);
  expect(cues.some((cue) => cue.text.includes("…"))).toBe(false);
  assertCaptionCuesFitLayout(cues, layout, 224, 480);
});

test("isolated tail cue is preserved and reported for transcript review", () => {
  const cues = [
    { start: 106.8, end: 107.5, text: "大约十" },
    { start: 107.56, end: 108.1, text: "秒钟" },
  ];
  const warning = isolatedTailCaptionWarning(cues, 108.166667);
  expect(warning).toContain("cue_index=2");
  expect(warning).toContain('text="秒钟"');
  expect(cues.at(-1)?.text).toBe("秒钟");
  expect(isolatedTailCaptionWarning([
    { start: 0, end: 0.5, text: "好的" },
    { start: 0.6, end: 1.4, text: "我们继续完整说明" },
  ], 1.5)).toBe(undefined);
});
