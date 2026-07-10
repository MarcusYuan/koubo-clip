import { expect, test } from "bun:test";
import * as artifacts from "./artifacts";
import { parseAssetManifest, parseEdl, parseEnrichmentPlan, parseMusicRequest, parseProductionProposal, parseSourcesManifest, parseTranscript, parseVisualAcquisition, parseVisualCandidates, parseVisualRequest, parseVisualReview } from "./artifacts";

const manifest = parseSourcesManifest({
  sources: [
    { source_id: "src-1", order: 0, original_filename: "a.mp4", project_path: "source/001-original.mp4", duration_seconds: 10 },
    { source_id: "src-2", order: 1, original_filename: "b.mp4", project_path: "source/002-original.mp4", duration_seconds: 20 },
  ],
});

test("source manifest rejects duplicate source ids", () => {
  expect(() =>
    parseSourcesManifest({
      sources: [
        { source_id: "src-1", order: 0, original_filename: "a.mp4", project_path: "source/a.mp4", duration_seconds: 1 },
        { source_id: "src-1", order: 1, original_filename: "b.mp4", project_path: "source/b.mp4", duration_seconds: 1 },
      ],
    }),
  ).toThrow("duplicate source_id");
});

test("transcript validates timing granularity and source ids", () => {
  const transcript = parseTranscript(
    {
      timing_granularity: "segment",
      segments: [{ source_id: "src-2", start: 1, end: 2, text: "hello" }],
    },
    manifest,
  );
  expect(transcript.segments[0]?.source_id).toBe("src-2");
  expect(() => parseTranscript({ timing_granularity: "frame", segments: [] }, manifest)).toThrow("timing_granularity");
  expect(() =>
    parseTranscript({ timing_granularity: "word", segments: [{ source_id: "missing", start: 0, end: 1, text: "x" }] }, manifest),
  ).toThrow("unknown source_id");
});

test("edl validates source references and output order", () => {
  const edl = parseEdl(
    {
      entries: [
        { source_id: "src-1", source_path: "source/001-original.mp4", start: 0, end: 2, output_order: 0, reason: "intro" },
        { source_id: "src-2", source_path: "source/002-original.mp4", start: 3, end: 4, output_order: 1, reason: "take two" },
      ],
    },
    manifest,
  );
  expect(edl.entries.map((entry) => entry.source_id)).toEqual(["src-1", "src-2"]);
  expect(() =>
    parseEdl({ entries: [{ source_id: "src-1", source_path: "source/a.mp4", start: 2, end: 1, output_order: 0, reason: "bad" }] }, manifest),
  ).toThrow("end must be greater");
  expect(() =>
    parseEdl(
      {
        entries: [
          { source_id: "src-1", source_path: "source/a.mp4", start: 0, end: 1, output_order: 0, reason: "a" },
          { source_id: "src-2", source_path: "source/b.mp4", start: 0, end: 1, output_order: 0, reason: "b" },
        ],
      },
      manifest,
    ),
  ).toThrow("duplicate output_order");
  expect(() =>
    parseEdl(
      {
        entries: [
          { source_id: "src-1", source_path: "source/a.mp4", start: 0, end: 2, output_order: 0, reason: "a" },
          { source_id: "src-1", source_path: "source/a.mp4", start: 1, end: 3, output_order: 1, reason: "b" },
        ],
      },
      manifest,
    ),
  ).toThrow("overlap");
});

test("enrichment artifacts validate slots and safe asset paths", () => {
  const plan = parseEnrichmentPlan({
    version: "1.0",
    slots: [
      { id: "title", type: "title_card", start: 0, end: 1, text: "Hello", reason: "open" },
      { id: "music", type: "music_segment", start: 0, end: 2, asset_id: "m1", volume: 0.2, fade_seconds: 0.2, ducking: true, reason: "bed" },
    ],
  });
  expect(plan.slots.length).toBe(2);
  expect(plan.profile.source_mode).toBe("talking_head_avatar");
  expect(() => parseEnrichmentPlan({ version: "1.0", cards: [], music: [] })).toThrow("require slots");
  expect(() =>
    parseEnrichmentPlan({
      version: "1.10",
      slots: [{ id: "title", type: "title_card", start: 0, end: 1, text: "Hello", reason: "open" }],
    }),
  ).toThrow("version");
  expect(() => parseEnrichmentPlan({ version: "1.0", slots: [{ id: "bad", type: "title_card", start: 1, end: 1, text: "x", reason: "bad" }] })).toThrow("end must be greater");
  expect(() =>
    parseEnrichmentPlan({
      version: "1.0",
      slots: [
        { id: "a", type: "keyword_callout", start: 0, end: 2, text: "A", reason: "a" },
        { id: "b", type: "key_point_card", start: 1, end: 3, text: "B", reason: "b" },
      ],
    }),
  ).toThrow("overlap");

  const assets = parseAssetManifest({
    assets: [
      {
        id: "img",
        path: "assets/images/a.png",
        type: "image",
        source: "agent_generated",
        provenance: "openai-image",
        reason: "concept art",
        used_by: ["image-1"],
        dimensions: { width: 1280, height: 720 },
        hash: "sha256-demo",
      },
      {
        id: "hit",
        path: "assets/music/hit.wav",
        type: "sfx",
        source: "bundled",
        provider: "local",
        license: "bundled",
        duration_seconds: 0.4,
        volume: 0.2,
        fade_seconds: 0.05,
        ducking: true,
      },
    ],
  });
  expect(assets.assets[0]?.path).toBe("assets/images/a.png");
  expect(assets.assets[0]?.source).toBe("agent_generated");
  expect(assets.assets[0]?.used_by).toEqual(["image-1"]);
  expect(assets.assets[0]?.dimensions).toEqual({ width: 1280, height: 720 });
  expect(assets.assets[1]?.type).toBe("sfx");
  expect(assets.assets[1]?.provider).toBe("local");
  expect(assets.assets[1]?.license).toBe("bundled");
  expect(() => parseAssetManifest({ assets: [{ id: "bad", path: "https://example.com/a.png" }] })).toThrow("project-relative");
  expect(() => parseAssetManifest({ assets: [{ id: "bad", path: "../a.png" }] })).toThrow("must not contain");
  expect(() => parseAssetManifest({ assets: [{ id: "bad", path: "assets/images/a.png", source: "provider_url" }] })).toThrow("source");
  expect(() => parseAssetManifest({ assets: [{ id: "bad", path: "assets/images/a.png", dimensions: { width: 0, height: 720 } }] })).toThrow("greater than 0");
});

test("music request validates sources and safe local paths", () => {
  const request = parseMusicRequest({
    version: "1.0",
    id: "bed",
    source: "minimax",
    reason: "short-form pacing",
    source_mode: "talking_head_avatar",
    presentation_intent: "short_form",
    prompt: "quiet upbeat tech tutorial instrumental",
    target_duration_seconds: 30,
    volume: 0.12,
    fade_seconds: 0.5,
    ducking: true,
  });
  expect(request.source).toBe("minimax");
  expect(request.volume).toBe(0.12);
  expect(() => parseMusicRequest({ version: "1.0", id: "bad", source: "spotify", reason: "bad" })).toThrow("source");
  expect(() => parseMusicRequest({ version: "1.0", id: "bad", source: "local", reason: "bad", local_path: "https://example.com/a.mp3" })).toThrow("project-relative");
  expect(() => parseMusicRequest({ version: "1.0", id: "bad", source: "local", reason: "bad", local_path: "../a.mp3" })).toThrow("must not contain");
});

test("visual acquisition artifacts validate metadata urls but keep final paths local", () => {
  const request = parseVisualRequest({
    version: "1.0",
    source_mode: "screen_recording",
    presentation_intent: "short_form",
    requests: [
      {
        id: "alarm",
        viewer_job: "make the deadline cue visible",
        semantic_query: "alarm clock",
        asset_type: "icon",
        preferred_sources: ["iconify"],
        reason: "spoken alarm should be visible as an icon",
        output_usage: "small upper-third icon",
        selected_candidate_id: "alarm-iconify-mdi-alarm",
        start: 1,
        end: 2,
        zone: "upper_third",
      },
    ],
  });
  expect(request.requests[0]?.semantic_query).toBe("alarm clock");

  const candidates = parseVisualCandidates({
    version: "1.0",
    candidates: [
      {
        id: "alarm-iconify-mdi-alarm",
        request_id: "alarm",
        provider: "iconify",
        asset_type: "icon",
        title: "mdi:alarm",
        semantic_query: "alarm clock",
        preview_url: "https://api.iconify.design/mdi/alarm.svg",
        source_url: "https://icon-sets.iconify.design/mdi/alarm/",
        download_url: "https://api.iconify.design/mdi/alarm.svg",
        license: "Apache-2.0",
        license_url: "https://example.com/license",
        renderable: true,
        recommended: true,
        reason: "semantic match",
        runtime_dependencies: [],
      },
    ],
    warnings: [],
  });
  expect(candidates.candidates[0]?.provider).toBe("iconify");

  const acquisition = parseVisualAcquisition({
    version: "1.0",
    assets: [
      {
        id: "visual-alarm-acquisition",
        request_id: "alarm",
        candidate_id: "alarm-iconify-mdi-alarm",
        asset_id: "visual-alarm",
        provider: "iconify",
        asset_type: "icon",
        path: "assets/icons/visual-alarm.svg",
        hash: "sha256-demo",
        source_url: "https://icon-sets.iconify.design/mdi/alarm/",
        license: "Apache-2.0",
        acquired_at: "2026-07-07T00:00:00.000Z",
        runtime_dependencies: [],
        warnings: [],
      },
    ],
    warnings: [],
  });
  expect(acquisition.assets[0]?.path).toBe("assets/icons/visual-alarm.svg");

  const review = parseVisualReview({
    version: "1.0",
    items: [
      {
        asset_id: "visual-alarm",
        request_id: "alarm",
        candidate_id: "alarm-iconify-mdi-alarm",
        provider: "iconify",
        asset_type: "icon",
        path: "assets/icons/visual-alarm.svg",
        source_url: "https://icon-sets.iconify.design/mdi/alarm/",
        license: "Apache-2.0",
        runtime_dependencies: [],
        usage_reason: "spoken alarm should be visible as an icon",
        warnings: [],
      },
    ],
    warnings: [],
  });
  expect(review.items[0]?.asset_id).toBe("visual-alarm");

  expect(() => parseVisualAcquisition({ version: "1.0", assets: [{ ...acquisition.assets[0], path: "https://example.com/alarm.svg" }], warnings: [] })).toThrow("project-relative");
  expect(() => parseVisualCandidates({ version: "1.0", candidates: [{ ...candidates.candidates[0], provider: "random" }], warnings: [] })).toThrow("provider");
});

test("production proposal validates options and forbids premature asset refs", () => {
  const proposal = parseProductionProposal({
    version: "1.0",
    source_mode: "mixed",
    presentation_intent: "knowledge_explainer",
    goal_summary: "make a concise explainer",
    material_summary: "screen recording with spoken explanation",
    recommended_option_id: "balanced",
    options: [
      {
        id: "balanced",
        label: "克制增强",
        recommended: true,
        reason: "keeps the screen readable",
        cleanup: { cut_candidate_ids: ["c-001-silence"], keep_strategy: "keep all semantic content", risks: [] },
        subtitles: { enabled: true, style: "anchor", conflict_notes: ["source has hard subtitles"] },
        visuals: { direction: "transparent focus cues", viewer_job: "follow the important UI step", requires_grounding: true, notes: ["avoid opaque cards"] },
        images: { needed: true, reason: "abstract concept is not visible", missing_assets: ["concept image"] },
        music: { source: "minimax", mood: "quiet tech bed", ducking: true, notes: ["review cost before acquisition"] },
        sfx: { enabled: true, usage: "click accents", restraint: "low volume only" },
        requires_confirmation: ["generate image", "acquire music"],
      },
    ],
  });
  expect(proposal.recommended_option_id).toBe("balanced");
  expect(proposal.options[0]?.music.source).toBe("minimax");

  expect(() =>
    parseProductionProposal({
      ...proposal,
      recommended_option_id: "missing",
    }),
  ).toThrow("recommended_option_id");
  expect(() =>
    parseProductionProposal({
      ...proposal,
      source_mode: "desktop",
    }),
  ).toThrow("source_mode");
  expect(() =>
    parseProductionProposal({
      ...proposal,
      options: [{ ...proposal.options[0], music: { source: "spotify", ducking: true, notes: [] } }],
    }),
  ).toThrow("music.source");
  expect(() =>
    parseProductionProposal({
      ...proposal,
      options: [
        { ...proposal.options[0], id: "same" },
        { ...proposal.options[0], id: "same" },
      ],
    }),
  ).toThrow("duplicate production proposal option id");
  expect(() =>
    parseProductionProposal({
      ...proposal,
      options: [{ ...proposal.options[0], images: { ...proposal.options[0]!.images, path: "assets/images/a.png" } }],
    }),
  ).toThrow("must not appear before confirmed asset acquisition");
});

test("enrichment v1.1 validates profile, captions, cards, and music", () => {
  const plan = parseEnrichmentPlan({
    version: "1.1",
    profile: { source_mode: "talking_head_avatar", aspect_ratio: "source", caption_identity: "anchor", layout: "stack", style: "whiteboard", frame: "clean" },
    captions: { enabled: true, identity: "anchor", emphasis: [{ start: 0.4, end: 0.9, text: "关键点", reason: "highlight" }] },
    cards: [
      {
        id: "opening",
        start: 0,
        end: 1.2,
        kind: "title",
        block_id: "lt_bold_block",
        visual_intent: "opening hook",
        layout: "stack",
        style: "whiteboard",
        frame: "clean",
        zone: "full_frame",
        title: "开场标题",
        reason: "orient",
      },
      {
        id: "flow",
        start: 1.2,
        end: 2.5,
        kind: "flowchart",
        title: "三步流程",
        detail: "上传 -> 清理 -> 增强",
        reason: "explain process",
      },
    ],
    music: [{ id: "bed", type: "music_segment", start: 0, end: 2.5, asset_id: "m1", volume: 0.12, fade_seconds: 0.2, ducking: true, reason: "light bed" }],
  });
  expect(plan.profile.style).toBe("whiteboard");
  expect(plan.profile.source_mode).toBe("talking_head_avatar");
  expect(plan.captions.identity).toBe("anchor");
  expect(plan.cards.map((card) => card.kind)).toEqual(["title", "flowchart"]);
  expect(plan.cards[0]?.block_id).toBe("lt_bold_block");
  expect(plan.cards[0]?.visual_intent).toBe("opening hook");
  expect(plan.cards[1]?.style).toBe("whiteboard");
  expect(plan.music[0]?.asset_id).toBe("m1");
  expect(() =>
    parseEnrichmentPlan({
      version: "1.1",
      slots: [{ id: "legacy", type: "title_card", start: 0, end: 1, text: "Legacy", reason: "stale" }],
      captions: { enabled: true, identity: "anchor" },
      cards: [],
      music: [],
    }),
  ).toThrow("legacy slots");

  expect(() =>
    parseEnrichmentPlan({
      version: "1.1",
      profile: { layout: "grid" },
      captions: { enabled: true, identity: "anchor" },
      cards: [],
      music: [],
    }),
  ).toThrow("profile.layout");
  expect(() =>
    parseEnrichmentPlan({
      version: "1.1",
      captions: { enabled: true, identity: "anchor" },
      cards: [{ id: "bad", start: 0, end: 1, kind: "unknown", title: "Bad", reason: "bad" }],
      music: [],
    }),
  ).toThrow("cards[0].kind");
  expect(() =>
    parseEnrichmentPlan({
      version: "1.1",
      captions: { enabled: true, identity: "anchor" },
      cards: [{ id: "bad", start: 0, end: 1, kind: "key_point", block_id: "unknown_block", title: "Bad", reason: "bad" }],
      music: [],
    }),
  ).toThrow("block_id");
  expect(() =>
    parseEnrichmentPlan({
      version: "1.1",
      profile: { source_mode: "screen_recording" },
      captions: { enabled: true, identity: "anchor" },
      cards: [{ id: "bad", start: 0, end: 1, kind: "key_point", block_id: "visual_inspection_report", title: "Bad", reason: "bad" }],
      music: [],
    }),
  ).toThrow("renderable");
  expect(() =>
    parseEnrichmentPlan({
      version: "1.1",
      profile: { source_mode: "screen_recording" },
      captions: { enabled: true, identity: "anchor" },
      cards: [{ id: "bad", start: 0, end: 1, kind: "lower_third", block_id: "target_zoom", title: "Bad", reason: "bad" }],
      music: [],
    }),
  ).toThrow("lower_third");
  expect(() =>
    parseEnrichmentPlan({
      version: "1.1",
      profile: { source_mode: "screen_recording" },
      captions: { enabled: true, identity: "anchor" },
      cards: [{ id: "bad", start: 0, end: 1, kind: "title", block_id: "lt_bold_block", title: "Bad", reason: "bad" }],
      music: [],
    }),
  ).toThrow("screen_recording");
});

test("enrichment v1.2 accepts HyperFrames elements and rejects invalid element contracts", () => {
  const plan = parseEnrichmentPlan({
    version: "1.2",
    profile: { source_mode: "screen_recording" },
    captions: { enabled: false, identity: "anchor" },
    cards: [],
    music: [],
    elements: [
      {
        id: "focus",
        source: "agent",
        element_id: "code-highlight",
        element_type: "registry_block",
        start: 0,
        end: 1,
        target_rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.2 },
        reason: "highlight code region",
      },
      {
        id: "shimmer",
        source: "agent",
        element_id: "shimmer-sweep",
        element_type: "registry_component",
        start: 1,
        end: 2,
        anchor_point: { x: 0.2, y: 0.8 },
        params: { text: "关键步骤", volume: 0.2, enabled: true, optional: null },
        reason: "text accent",
      },
      {
        id: "caption-theme",
        source: "agent",
        element_id: "anchor",
        element_type: "caption_identity",
        start: 0,
        end: 2,
        caption_identity: "anchor",
        reason: "caption rail",
      },
      {
        id: "click",
        source: "agent",
        element_id: "click",
        element_type: "sfx",
        start: 1.2,
        end: 1.45,
        sfx_id: "click",
        reason: "sync click",
      },
      {
        id: "asset",
        source: "agent",
        element_id: "hero-image",
        element_type: "generated_asset",
        start: 1.5,
        end: 2,
        asset_id: "img",
        reason: "agent generated visual",
      },
      {
        id: "guidance",
        source: "agent",
        element_id: "animation-rule:coordinate-target-zoom",
        element_type: "animation_rule",
        start: 0,
        end: 1,
        reason: "motion guidance",
      },
    ],
  });
  expect(plan.version).toBe("1.2");
  expect(plan.profile.source_mode).toBe("screen_recording");
  expect(plan.elements.map((element) => element.element_type)).toEqual(["registry_block", "registry_component", "caption_identity", "sfx", "generated_asset", "animation_rule"]);
  expect(plan.elements[1]?.params?.text).toBe("关键步骤");
  expect(plan.elements[3]?.sfx_id).toBe("click");

  expect(() =>
    parseEnrichmentPlan({
      version: "1.2",
      profile: { source_mode: "screen_recording" },
      captions: { enabled: false, identity: "anchor" },
      elements: [{ id: "bad", source: "agent", element_id: "missing", element_type: "registry_block", start: 0, end: 1, reason: "bad" }],
    }),
  ).toThrow("unknown vendored HyperFrames registry item");
  expect(() =>
    parseEnrichmentPlan({
      version: "1.2",
      captions: { enabled: false, identity: "anchor" },
      elements: [{ id: "bad", source: "agent", element_id: "code-highlight", element_type: "block", start: 0, end: 1, reason: "bad" }],
    }),
  ).toThrow("element_type");
  expect(() =>
    parseEnrichmentPlan({
      version: "1.2",
      captions: { enabled: false, identity: "anchor" },
      elements: [{ id: "bad", source: "agent", element_id: "img", element_type: "generated_asset", start: 0, end: 1, reason: "bad" }],
    }),
  ).toThrow("asset_id");
  expect(() =>
    parseEnrichmentPlan({
      version: "1.2",
      captions: { enabled: false, identity: "anchor" },
      elements: [{ id: "bad", source: "agent", element_id: "click", element_type: "sfx", start: 0, end: 1, sfx_id: "missing", reason: "bad" }],
    }),
  ).toThrow("unknown HyperFrames sfx");
  expect(() =>
    parseEnrichmentPlan({
      version: "1.2",
      captions: { enabled: false, identity: "anchor" },
      elements: [{ id: "bad", source: "agent", element_id: "shimmer-sweep", element_type: "registry_component", start: 0, end: 1, params: { nested: { nope: true } }, reason: "bad" }],
    }),
  ).toThrow("params.nested");
});

test("source mode controls enrichment defaults without overriding explicit card choices", () => {
  const screen = parseEnrichmentPlan({
    version: "1.1",
    profile: { source_mode: "screen_recording" },
    captions: { enabled: true, identity: "anchor" },
    cards: [
      { id: "default", start: 0, end: 1, kind: "key_point", title: "Default", reason: "screen safe" },
      { id: "explicit", start: 1, end: 2, kind: "key_point", layout: "stack", style: "whiteboard", frame: "hairline", title: "Explicit", reason: "user approved" },
    ],
    music: [],
  });
  expect(screen.profile.source_mode).toBe("screen_recording");
  expect(screen.profile.layout).toBe("overlay");
  expect(screen.profile.style).toBe("minimal");
  expect(screen.cards[0]?.layout).toBe("overlay");
  expect(screen.cards[0]?.style).toBe("minimal");
  expect(screen.cards[1]?.layout).toBe("stack");
  expect(screen.cards[1]?.style).toBe("whiteboard");
  expect(screen.cards[1]?.frame).toBe("hairline");

  const mixed = parseEnrichmentPlan({ version: "1.1", profile: { source_mode: "mixed" }, captions: { enabled: true, identity: "anchor" }, cards: [], music: [] });
  expect(mixed.profile.layout).toBe("overlay");
  expect(() =>
    parseEnrichmentPlan({
      version: "1.1",
      profile: { source_mode: "screen" },
      captions: { enabled: true, identity: "anchor" },
      cards: [],
      music: [],
    }),
  ).toThrow("profile.source_mode");
});

test("enrichment cards validate normalized target coordinates", () => {
  const plan = parseEnrichmentPlan({
    version: "1.1",
    profile: { source_mode: "screen_recording" },
    captions: { enabled: true, identity: "anchor" },
    cards: [
      {
        id: "focus",
        start: 0,
        end: 1,
        kind: "screenshot_focus",
        title: "按钮位置",
        target_rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.2 },
        anchor_point: { x: 0.44, y: 0.3 },
        reason: "precise screen highlight",
      },
    ],
    music: [],
  });
  expect(plan.cards[0]?.target_rect).toEqual({ x: 0.1, y: 0.2, width: 0.3, height: 0.2 });
  expect(plan.cards[0]?.anchor_point).toEqual({ x: 0.44, y: 0.3 });

  expect(() =>
    parseEnrichmentPlan({
      version: "1.1",
      cards: [{ id: "bad", start: 0, end: 1, kind: "screenshot_focus", title: "Bad", target_rect: { x: -0.1, y: 0, width: 0.2, height: 0.2 }, reason: "bad" }],
      music: [],
    }),
  ).toThrow("target_rect.x");
  expect(() =>
    parseEnrichmentPlan({
      version: "1.1",
      cards: [{ id: "bad", start: 0, end: 1, kind: "screenshot_focus", title: "Bad", target_rect: { x: 0.9, y: 0, width: 0.2, height: 0.2 }, reason: "bad" }],
      music: [],
    }),
  ).toThrow("normalized canvas bounds");
  expect(() =>
    parseEnrichmentPlan({
      version: "1.1",
      cards: [{ id: "bad", start: 0, end: 1, kind: "screenshot_focus", title: "Bad", target_rect: { x: 0, y: 0, width: 0, height: 0.2 }, reason: "bad" }],
      music: [],
    }),
  ).toThrow("greater than 0");
  expect(() =>
    parseEnrichmentPlan({
      version: "1.1",
      cards: [{ id: "bad", start: 0, end: 1, kind: "key_point", title: "Bad", anchor_point: { x: 0.4, y: 1.1 }, reason: "bad" }],
      music: [],
    }),
  ).toThrow("anchor_point.y");
});

test("focus candidate parser accepts source-timeline focus candidates", () => {
  const parseFocusCandidates = requiredArtifactParser("parseFocusCandidates");
  const candidates = parseFocusCandidates(
    {
      version: "1.0",
      source_mode: "screen_recording",
      presentation_intent: "internal_tutorial",
      candidates: [
        {
          id: "focus-candidate-1",
          start: 1.2,
          end: 2.4,
          reason: "speaker points at the pricing button",
          transcript_quote: "click the pricing button",
          semantic_intent: "guide_attention",
          business_role: "operation_step",
          viewer_job: "find the exact UI control",
          visual_gap: "source_has_visible_target",
          recommended_treatment: "source_ui_component",
          element_id: "cinematic-zoom",
          element_type: "registry_block",
          requires_grounding: true,
          asset_id: "optional-asset",
          params: { title: "pricing button" },
        },
      ],
    },
  );

  expect(candidates.candidates[0]?.id).toBe("focus-candidate-1");
  expect(candidates.candidates[0]?.start).toBe(1.2);
  expect(candidates.candidates[0]?.end).toBe(2.4);
  expect(candidates.candidates[0]?.transcript_quote).toBe("click the pricing button");
  expect(candidates.candidates[0]?.semantic_intent).toBe("guide_attention");
  expect(candidates.candidates[0]?.business_role).toBe("operation_step");
  expect(candidates.candidates[0]?.viewer_job).toBe("find the exact UI control");
  expect(candidates.candidates[0]?.visual_gap).toBe("source_has_visible_target");
  expect(candidates.candidates[0]?.recommended_treatment).toBe("source_ui_component");
  expect(candidates.candidates[0]?.requires_grounding).toBe(true);
  expect(candidates.candidates[0]?.asset_id).toBe("optional-asset");
});

test("focus candidate parser rejects invalid semantic intent and timing", () => {
  const parseFocusCandidates = requiredArtifactParser("parseFocusCandidates");
  expect(() =>
    parseFocusCandidates({
      version: "1.0",
      source_mode: "screen_recording",
      presentation_intent: "internal_tutorial",
      candidates: [
        {
          id: "focus-candidate-1",
          start: 1,
          end: 2,
          reason: "bad intent",
          transcript_quote: "click the button",
          semantic_intent: "decorate_screen",
          element_id: "cinematic-zoom",
          element_type: "registry_block",
          requires_grounding: true,
        },
      ],
    }),
  ).toThrow("semantic_intent");
  expect(() =>
    parseFocusCandidates({
      version: "1.0",
      source_mode: "screen_recording",
      presentation_intent: "internal_tutorial",
      candidates: [
        {
          id: "focus-candidate-1",
          start: 1,
          end: 2,
          reason: "bad treatment",
          transcript_quote: "click the button",
          semantic_intent: "guide_attention",
          recommended_treatment: "decorative_picture",
          element_id: "cinematic-zoom",
          element_type: "registry_block",
          requires_grounding: true,
        },
      ],
    }),
  ).toThrow("recommended_treatment");
  expect(() =>
    parseFocusCandidates({
      version: "1.0",
      source_mode: "screen_recording",
      presentation_intent: "internal_tutorial",
      candidates: [
        {
          id: "focus-candidate-1",
          start: 2,
          end: 1,
          reason: "bad timing",
          transcript_quote: "click the button",
          semantic_intent: "guide_attention",
          element_id: "cinematic-zoom",
          element_type: "registry_block",
          requires_grounding: true,
        },
      ],
    }),
  ).toThrow("end must be greater");
});

test("focus frame parser accepts project-relative inspection frames", () => {
  const parseFocusCandidates = requiredArtifactParser("parseFocusCandidates");
  const parseFocusFrames = requiredArtifactParser("parseFocusFrames");
  const candidates = parseFocusCandidates({
    version: "1.0",
    source_mode: "screen_recording",
    presentation_intent: "internal_tutorial",
    candidates: [
      {
        id: "focus-candidate-1",
        start: 1,
        end: 2,
        reason: "needs visual grounding",
        transcript_quote: "click export",
        semantic_intent: "guide_attention",
        element_id: "cinematic-zoom",
        element_type: "registry_block",
        requires_grounding: true,
      },
    ],
  });

  const frames = parseFocusFrames(
    {
      version: "1.0",
      frames: [
        {
          id: "frame-1",
          candidate_id: "focus-candidate-1",
          timeline: "source",
          time_seconds: 1.5,
          source_id: "src-1",
          path: ".inspection/focus/frame-1.jpg",
          width: 1280,
          height: 720,
        },
      ],
    },
  );
  expect(candidates.candidates[0]?.id).toBe("focus-candidate-1");

  expect(frames.frames[0]?.id).toBe("frame-1");
  expect(frames.frames[0]?.candidate_id).toBe("focus-candidate-1");
  expect(frames.frames[0]?.source_id).toBe("src-1");
  expect(frames.frames[0]?.timeline).toBe("source");
  expect(frames.frames[0]?.time_seconds).toBe(1.5);
  expect(frames.frames[0]?.path).toBe(".inspection/focus/frame-1.jpg");
});

test("source frame request parser accepts 1 to 20 ordered frames and URL text", () => {
  const parseSourceFrameRequest = requiredArtifactParser("parseSourceFrameRequest");
  const one = parseSourceFrameRequest({
    version: "1.0",
    frames: [
      {
        id: "source-frame-001",
        source_id: "src-1",
        time_seconds: 1.25,
        segment_id: "segment-1",
        transcript_quote: "  mailto:person@example.com, https://example.com/help, and /Users/private/source.mp4  ",
        reason: "  data:text/plain,x, https:example.com, ../outside, and C:\\secret  ",
      },
    ],
  });
  expect(one.frames[0]?.segment_id).toBe("segment-1");
  expect(one.frames[0]?.transcript_quote).toBe("  mailto:person@example.com, https://example.com/help, and /Users/private/source.mp4  ");
  expect(one.frames[0]?.reason).toBe("  data:text/plain,x, https:example.com, ../outside, and C:\\secret  ");

  const twenty = parseSourceFrameRequest({
    version: "1.0",
    frames: Array.from({ length: 20 }, (_, index) => ({
      id: `source-frame-${index + 1}`,
      source_id: "src-1",
      time_seconds: index,
      transcript_quote: `quote ${index}`,
      reason: `reason ${index}`,
    })),
  });
  expect(twenty.frames.map((frame: { id: string }) => frame.id)).toEqual(Array.from({ length: 20 }, (_, index) => `source-frame-${index + 1}`));
});

test("source frame request parser rejects invalid counts and duplicate ids", () => {
  const parseSourceFrameRequest = requiredArtifactParser("parseSourceFrameRequest");
  const frame = { id: "source-frame-1", source_id: "src-1", time_seconds: 0, transcript_quote: "quote", reason: "reason" };
  expect(() => parseSourceFrameRequest({ version: "1.0", frames: [] })).toThrow("between 1 and 20");
  expect(() => parseSourceFrameRequest({ version: "1.0", frames: Array.from({ length: 21 }, (_, index) => ({ ...frame, id: `frame-${index}` })) })).toThrow(
    "between 1 and 20",
  );
  expect(() => parseSourceFrameRequest({ version: "1.0", frames: [frame, frame] })).toThrow("duplicate source frame request id");
});

test("source frame request parser rejects unknown structured fields", () => {
  const parseSourceFrameRequest = requiredArtifactParser("parseSourceFrameRequest");
  const frame = { id: "source-frame-1", source_id: "src-1", time_seconds: 0, transcript_quote: "quote", reason: "reason" };
  expect(() => parseSourceFrameRequest({ version: "1.0", frames: [frame], provider: "local" })).toThrow("provider is not allowed");
  for (const key of ["path", "url", "absolute_path", "provider", "token"]) {
    expect(() => parseSourceFrameRequest({ version: "1.0", frames: [{ ...frame, [key]: "forbidden" }] })).toThrow(`${key} is not allowed`);
  }
});

test("source frame request parser rejects blank strings and invalid times", () => {
  const parseSourceFrameRequest = requiredArtifactParser("parseSourceFrameRequest");
  const frame = { id: "source-frame-1", source_id: "src-1", time_seconds: 0, segment_id: "segment-1", transcript_quote: "quote", reason: "reason" };
  for (const key of ["id", "source_id", "segment_id", "transcript_quote", "reason"]) {
    expect(() => parseSourceFrameRequest({ version: "1.0", frames: [{ ...frame, [key]: "   " }] })).toThrow("must not be blank");
  }
  expect(() => parseSourceFrameRequest({ version: "1.0", frames: [{ ...frame, time_seconds: -1 }] })).toThrow("non-negative number");
  expect(() => parseSourceFrameRequest({ version: "1.0", frames: [{ ...frame, time_seconds: Number.NaN }] })).toThrow("non-negative number");
});

test("source frame request parser rejects path-like identifiers", () => {
  const parseSourceFrameRequest = requiredArtifactParser("parseSourceFrameRequest");
  const frame = { id: "source-frame-1", source_id: "src-1", time_seconds: 0, segment_id: "segment-1", transcript_quote: "quote", reason: "reason" };
  for (const [key, value] of [
    ["id", "/Users/private/source.mp4"],
    ["source_id", "../outside"],
    ["segment_id", "https://bad.example"],
    ["id", "C:\\secret"],
    ["id", "mailto:private@example.com"],
    ["source_id", "data:text/plain,secret"],
    ["segment_id", "https:example.com"],
    ["id", "  mailto:private@example.com"],
    ["source_id", "data:text/plain,secret  "],
    ["segment_id", "  https:example.com  "],
    ["source_id", "  ../outside  "],
  ]) {
    expect(() => parseSourceFrameRequest({ version: "1.0", frames: [{ ...frame, [key]: value }] })).toThrow("opaque identifier");
  }
});

test("focus frame parser rejects duplicate ids and unsafe frame paths", () => {
  const parseFocusCandidates = requiredArtifactParser("parseFocusCandidates");
  const parseFocusFrames = requiredArtifactParser("parseFocusFrames");
  const candidates = parseFocusCandidates({ version: "1.0", source_mode: "screen_recording", presentation_intent: "internal_tutorial", candidates: [] });

  expect(() =>
    parseFocusFrames({
      version: "1.0",
      frames: [
        { id: "frame-1", candidate_id: "focus-candidate-1", timeline: "source", time_seconds: 1.5, path: ".inspection/focus/frame-1.jpg", width: 1280, height: 720 },
        { id: "frame-1", candidate_id: "focus-candidate-2", timeline: "source", time_seconds: 1.6, path: ".inspection/focus/frame-2.jpg", width: 1280, height: 720 },
      ],
    }),
  ).toThrow("duplicate focus frame id");
  expect(() =>
    parseFocusFrames({
      version: "1.0",
      frames: [{ id: "frame-1", candidate_id: "focus-candidate-1", timeline: "source", time_seconds: 1.5, path: "../frame-1.jpg", width: 1280, height: 720 }],
    }),
  ).toThrow("must not contain");
  expect(candidates.candidates).toEqual([]);
});

test("focus grounding parser accepts candidate-frame target grounding", () => {
  const parseFocusGrounding = requiredArtifactParser("parseFocusGrounding");
  const grounding = parseFocusGrounding({
    version: "1.0",
    groundings: [
      {
        candidate_id: "focus-candidate-1",
        frame_id: "frame-1",
        target_rect: { x: 0.42, y: 0.32, width: 0.14, height: 0.09 },
        anchor_point: { x: 0.49, y: 0.36 },
        evidence_note: "button visible in sampled frame",
        confidence: 0.86,
      },
    ],
  });

  expect(grounding.groundings[0]?.candidate_id).toBe("focus-candidate-1");
  expect(grounding.groundings[0]?.frame_id).toBe("frame-1");
  expect(grounding.groundings[0]?.target_rect).toEqual({ x: 0.42, y: 0.32, width: 0.14, height: 0.09 });
  expect(grounding.groundings[0]?.anchor_point).toEqual({ x: 0.49, y: 0.36 });
});

test("focus grounding parser rejects missing evidence and out-of-bounds targets", () => {
  const parseFocusGrounding = requiredArtifactParser("parseFocusGrounding");
  expect(() =>
    parseFocusGrounding({
      version: "1.0",
      groundings: [{ candidate_id: "focus-candidate-1", frame_id: "frame-1", target_rect: { x: 0.95, y: 0.32, width: 0.14, height: 0.09 }, evidence_note: "bad", confidence: 0.86 }],
    }),
  ).toThrow("normalized canvas bounds");
  expect(() =>
    parseFocusGrounding({
      version: "1.0",
      groundings: [{ candidate_id: "focus-candidate-1", frame_id: "frame-1", target_rect: { x: 0.42, y: 0.32, width: 0.14, height: 0.09 }, confidence: 0.86 }],
    }),
  ).toThrow("evidence_note");
});

test("focus review parser accepts proposed elements for enrichment", () => {
  const parseFocusReview = requiredArtifactParser("parseFocusReview");
  const review = parseFocusReview({
    version: "1.0",
    items: [
      {
        candidate_id: "focus-candidate-1",
        status: "ready",
        frame_paths: [".inspection/focus/frame-1.jpg"],
        warnings: [],
      },
    ],
    proposed_elements: [
      {
        id: "focus-element-1",
        source: "focus-review",
        element_id: "cinematic-zoom",
        element_type: "registry_block",
        start: 1.2,
        end: 2.4,
        target_rect: { x: 0.42, y: 0.32, width: 0.14, height: 0.09 },
        params: { title: "Pricing button", coordinate_source_frame: ".inspection/focus/frame-1.jpg" },
        reason: "guide attention to the grounded UI target",
        approved: true,
      },
    ],
    warnings: [],
  });

  expect(review.proposed_elements[0]?.id).toBe("focus-element-1");
  expect(review.proposed_elements[0]?.element_id).toBe("cinematic-zoom");
  expect(review.proposed_elements[0]?.element_type).toBe("registry_block");
  expect(review.proposed_elements[0]?.target_rect).toEqual({ x: 0.42, y: 0.32, width: 0.14, height: 0.09 });
});

test("focus review parser rejects ungrounded proposed elements", () => {
  const parseFocusReview = requiredArtifactParser("parseFocusReview");
  expect(() =>
    parseFocusReview({
      version: "1.0",
      items: [
        {
          candidate_id: "focus-candidate-1",
          status: "ready",
          frame_paths: [".inspection/focus/frame-1.jpg"],
          warnings: [],
        },
      ],
      proposed_elements: [
        {
          id: "focus-element-1",
          source: "focus-review",
          element_id: "cinematic-zoom",
          element_type: "registry_block",
          start: 1.2,
          end: 2.4,
          reason: "missing target",
        },
      ],
      warnings: [],
    }),
  ).toThrow("target_rect");
});

function requiredArtifactParser(name: string): (...args: unknown[]) => any {
  const parser = (artifacts as Record<string, unknown>)[name];
  expect(typeof parser).toBe("function");
  return parser as (...args: unknown[]) => any;
}
