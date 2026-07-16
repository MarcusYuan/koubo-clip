import { expect, test } from "bun:test";
import { parseEnrichmentPlan } from "./artifacts";

const currentPlan = {
  version: "2.0",
  profile: {
    source_mode: "screen_recording",
    aspect_ratio: "source",
    caption_identity: "anchor",
    layout: "overlay",
    style: "minimal",
    frame: "clean",
  },
  elements: [
    {
      id: "captions",
      source: "agent",
      element_id: "anchor",
      element_type: "caption_identity",
      start: 0,
      end: 2,
      caption_identity: "anchor",
      reason: "readable captions",
    },
    {
      id: "hero",
      source: "agent",
      element_id: "hero-image",
      element_type: "visual_asset",
      start: 0.5,
      end: 1.5,
      asset_id: "hero-image",
      reason: "show the approved visual",
    },
  ],
  audio: {
    music: [
      {
        id: "bed",
        asset_id: "music-bed",
        start: 0,
        end: 2,
        volume: 0.12,
        fade_seconds: 0.2,
        ducking: true,
        reason: "quiet background bed",
      },
    ],
    sfx: [
      {
        id: "click",
        sfx_id: "click",
        start: 1,
        end: 1.2,
        volume: 0.3,
        fade_seconds: 0,
        reason: "sync the UI action",
      },
    ],
  },
} as const;

test("enrichment plan accepts only the current profile, elements, and audio contract", () => {
  const plan = parseEnrichmentPlan(currentPlan);
  expect(plan.version).toBe("2.0");
  expect(plan.elements.map((element) => element.element_type)).toEqual(["caption_identity", "visual_asset"]);
  expect(plan.audio.music[0]?.asset_id).toBe("music-bed");
  expect(plan.audio.sfx[0]?.sfx_id).toBe("click");
  expect(parseEnrichmentPlan(JSON.parse(JSON.stringify(plan)))).toEqual(plan);
});

test("enrichment plan rejects old versions and removed compatibility fields", () => {
  for (const value of [
    { ...currentPlan, version: "1.0" },
    { ...currentPlan, version: "1.1" },
    { ...currentPlan, version: "1.2" },
    { ...currentPlan, cards: [] },
    { ...currentPlan, slots: [] },
    { ...currentPlan, captions: { enabled: true, identity: "anchor" } },
    { ...currentPlan, music: [] },
  ]) {
    expect(() => parseEnrichmentPlan(value)).toThrow();
  }
  expect(() => parseEnrichmentPlan({
    ...currentPlan,
    elements: [{ ...currentPlan.elements[1], element_type: "generated_asset" }],
  })).toThrow();
  expect(() => parseEnrichmentPlan({
    ...currentPlan,
    elements: [{ ...currentPlan.elements[1], element_type: "sfx", sfx_id: "click" }],
  })).toThrow();
});

test("enrichment audio requires exactly one SFX source and globally unique ids", () => {
  expect(() => parseEnrichmentPlan({
    ...currentPlan,
    audio: {
      ...currentPlan.audio,
      sfx: [{ ...currentPlan.audio.sfx[0], asset_id: "custom-click" }],
    },
  })).toThrow("exactly one");
  expect(() => parseEnrichmentPlan({
    ...currentPlan,
    audio: {
      ...currentPlan.audio,
      sfx: [{ ...currentPlan.audio.sfx[0], sfx_id: undefined }],
    },
  })).toThrow("exactly one");
  expect(() => parseEnrichmentPlan({
    ...currentPlan,
    audio: {
      ...currentPlan.audio,
      music: [{ ...currentPlan.audio.music[0], id: "hero" }],
    },
  })).toThrow("duplicate enrichment id");
});
