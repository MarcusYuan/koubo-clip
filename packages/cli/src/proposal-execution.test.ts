import { expect, test } from "bun:test";
import { productionProposalExample } from "./artifact-contracts";
import type { AnalysisCandidate, EdlArtifact, EnrichmentPlanArtifact, ProductionProposalOption, SourcesManifest } from "./artifacts";
import {
  applyConfirmedTextOverlays,
  assertConfirmedAssetSlots,
  compileCandidateCleanupEdl,
  evaluateProposalExecution,
  evaluateResolvedProposalExecution,
  ProposalExecutionError,
  assertProposalExecution,
  resolveRetainedSourceRange,
} from "./proposal-execution";

test("candidate cleanup compiler and overlay resolver share exact padded boundaries", () => {
  const manifest: SourcesManifest = {
    contract_version: "2.0",
    sources: [{
      source_id: "src-001",
      order: 0,
      original_filename: "raw.mp4",
      local_media_ref: "opaque",
      duration_seconds: 5,
      identity: {
        sha256: `sha256:${"a".repeat(64)}`,
        size_bytes: 1,
        duration_seconds: 5,
        video: { codec_name: "h264", width: 160, height: 90, display_width: 160, display_height: 90, rotation: 0, avg_frame_rate: "30/1", pixel_format: "yuv420p" },
      },
    }],
  };
  const cut: AnalysisCandidate = { id: "cut", source_id: "src-001", start: 1, end: 2, text: "um", type: "filler", reason: "filler", confidence: 0.7 };

  const compiled = compileCandidateCleanupEdl(manifest, [cut]);

  expect(compiled.edl.entries.map(({ start, end }) => ({ start, end }))).toEqual([{ start: 0, end: 1.05 }, { start: 1.95, end: 5 }]);
  expect(resolveRetainedSourceRange(compiled.edl, { source_id: "src-001", start: 0.5, end: 1.05 }).matches.length).toBe(1);
  expect(resolveRetainedSourceRange(compiled.edl, { source_id: "src-001", start: 1.95, end: 2.5 }).matches.length).toBe(1);
  const crossing = resolveRetainedSourceRange(compiled.edl, { source_id: "src-001", start: 0.5, end: 2.5 });
  expect(crossing.matches.length).toBe(0);
  expect(crossing.retained_subranges).toEqual([{ start: 0.5, end: 1.05 }, { start: 1.95, end: 2.5 }]);
});

test("fails business duration target when EDL is 108.166667s but confirmed target is 45-65s", () => {
  const option = proposalOption({
    duration: { min_seconds: 45, max_seconds: 65, target_seconds: 55, tolerance_frames: 2 },
  });
  const conformance = evaluateProposalExecution(option, edl([{ id: "long", start: 0, end: 108.166667 }]));

  expect(conformance.status).toBe("failed");
  expect(conformance.checks.find((check) => check.id === "target-duration")?.status).toBe("blocker");
  expect(Math.abs(conformance.actual_duration_seconds - 108.166667) < 0.000001).toBe(true);
});

test("passes when explicit segments exactly match EDL order and ranges", () => {
  const option = proposalOption({
    mode: "explicit_segments",
    segments: [
      { id: "later", source_id: "src-001", start: 6, end: 8, reason: "Open on payoff." },
      { id: "earlier", source_id: "src-001", start: 0, end: 2, reason: "Then show setup." },
    ],
    duration: { min_seconds: 3.9, max_seconds: 4.1, target_seconds: 4, tolerance_frames: 2 },
  });
  const conformance = evaluateProposalExecution(option, edl([
    { id: "later", start: 6, end: 8, order: 0 },
    { id: "earlier", start: 0, end: 2, order: 1 },
  ]));

  expect(conformance.status).toBe("passed");
  expect(conformance.checks.find((check) => check.id === "timeline")?.status).toBe("passed");
});

test("fails when explicit segment is missing from EDL", () => {
  const option = proposalOption({
    mode: "explicit_segments",
    segments: [
      { id: "first", source_id: "src-001", start: 0, end: 2, reason: "Keep setup." },
      { id: "second", source_id: "src-001", start: 4, end: 6, reason: "Keep proof." },
    ],
    duration: { min_seconds: 1.9, max_seconds: 2.1, target_seconds: 2, tolerance_frames: 2 },
  });

  const conformance = evaluateProposalExecution(option, edl([{ id: "first", start: 0, end: 2 }]));

  expect(conformance.checks.find((check) => check.id === "timeline")?.status).toBe("blocker");
});

test("fails when explicit EDL order does not match confirmed order", () => {
  const option = proposalOption({
    mode: "explicit_segments",
    segments: [
      { id: "later", source_id: "src-001", start: 6, end: 8, reason: "Open on payoff." },
      { id: "earlier", source_id: "src-001", start: 0, end: 2, reason: "Then show setup." },
    ],
    duration: { min_seconds: 3.9, max_seconds: 4.1, target_seconds: 4, tolerance_frames: 2 },
  });

  const conformance = evaluateProposalExecution(option, edl([
    { id: "earlier", start: 0, end: 2, order: 0 },
    { id: "later", start: 6, end: 8, order: 1 },
  ]));

  expect(conformance.checks.find((check) => check.id === "timeline")?.status).toBe("blocker");
});

test("maps source-local text overlay to output-local time", () => {
  const option = proposalOption({
    mode: "explicit_segments",
    segments: [{ id: "payoff", source_id: "src-001", start: 6, end: 8, reason: "Open on payoff." }],
    overlays: [{ id: "hook-text", source_id: "src-001", segment_id: "payoff", start: 6.25, end: 6.75 }],
    duration: { min_seconds: 1.9, max_seconds: 2.1, target_seconds: 2, tolerance_frames: 2 },
  });

  const conformance = evaluateProposalExecution(option, edl([{ id: "payoff", start: 6, end: 8 }]));

  expect(conformance.mapped_overlays.length).toBe(1);
  expect(Math.abs(conformance.mapped_overlays[0]!.output_start - 0.25) < 0.000001).toBe(true);
  expect(Math.abs(conformance.mapped_overlays[0]!.output_end - 0.75) < 0.000001).toBe(true);
});

test("fails when text overlay is not covered by exactly one retained range", () => {
  const option = proposalOption({
    overlays: [{ id: "ambiguous", source_id: "src-001", start: 1.25, end: 1.5 }],
    duration: { min_seconds: 3.9, max_seconds: 4.1, target_seconds: 4, tolerance_frames: 2 },
  });

  const conformance = evaluateProposalExecution(option, edl([
    { id: "first", start: 0, end: 2, order: 0 },
    { id: "second", start: 1, end: 3, order: 1 },
  ]));

  expect(conformance.checks.find((check) => check.id === "text-overlay:ambiguous")?.status).toBe("blocker");
  expect(conformance.mapped_overlays.length).toBe(0);
});

test("materializes confirmed text overlays into enrichment elements", () => {
  const option = proposalOption({
    mode: "explicit_segments",
    segments: [{ id: "payoff", source_id: "src-001", start: 6, end: 8, reason: "Open on payoff." }],
    overlays: [{ id: "hook-text", source_id: "src-001", segment_id: "payoff", start: 6.25, end: 6.75 }],
    duration: { min_seconds: 1.9, max_seconds: 2.1, target_seconds: 2, tolerance_frames: 2 },
  });

  const plan = applyConfirmedTextOverlays(option, edl([{ id: "payoff", start: 6, end: 8 }]), undefined, "mixed");

  expect(plan?.elements.some((element) => element.element_type === "caption_identity")).toBe(true);
  expect(plan?.elements.find((element) => element.id === "hook-text")).toEqual({
    id: "hook-text",
    source: "confirmed-proposal",
    element_id: "caption-highlight",
    element_type: "registry_component",
    start: 0.25,
    end: 0.75,
    reason: "Call out the confirmed business hook.",
    params: { text: "Confirmed overlay" },
  });
});

test("asset slot checks fail when a required slot is missing", () => {
  const checks = assertConfirmedAssetSlots(optionWithSlots({ musicRequired: ["bgm"] }), enrichmentPlan());

  expect(checks.find((check) => check.id === "music-slots")).toEqual({
    id: "music-slots",
    status: "blocker",
    message: "missing=[bgm] unconfirmed=[]",
  });
});

test("asset slot checks fail when enrichment uses an unconfirmed item", () => {
  const checks = assertConfirmedAssetSlots(optionWithSlots({ musicRequired: ["bgm"] }), enrichmentPlan({ music: ["bgm", "extra"] }));

  expect(checks.find((check) => check.id === "music-slots")).toEqual({
    id: "music-slots",
    status: "blocker",
    message: "missing=[] unconfirmed=[extra]",
  });
});

test("asset slot checks pass when required slots exactly match and optional slots are unused", () => {
  const checks = assertConfirmedAssetSlots(
    optionWithSlots({ visualRequired: ["hero"], musicRequired: ["bgm"], sfxRequired: ["click"], musicOptional: ["unused"] }),
    enrichmentPlan({ visual: ["hero"], music: ["bgm"], sfx: ["click"] }),
  );

  expect(checks.every((check) => check.status === "passed")).toBe(true);
  expect(checks.find((check) => check.id === "music-slots")?.message).toContain("skipped_optional=[unused]");
});

test("resolved enrichment cannot change the confirmed source mode", () => {
  const plan = enrichmentPlan();
  plan.profile.source_mode = "talking_head_avatar";
  const conformance = evaluateResolvedProposalExecution(
    proposalOption({ duration: { min_seconds: 1.9, max_seconds: 2.1, target_seconds: 2, tolerance_frames: 2 } }),
    edl([{ id: "kept", start: 0, end: 2 }]),
    plan,
    "screen_recording",
  );

  expect(conformance.status).toBe("failed");
  expect(conformance.checks.find((check) => check.id === "source-mode")?.status).toBe("blocker");
});

test("candidate cleanup mode remains compatible with normal EDL output", () => {
  const conformance = assertProposalExecution(
    proposalOption({ duration: { min_seconds: 1.9, max_seconds: 2.1, target_seconds: 2, tolerance_frames: 2 } }),
    edl([{ id: "kept", start: 0, end: 2 }]),
  );

  expect(conformance.execution_mode).toBe("candidate_cleanup");
  expect(conformance.status).toBe("passed");
});

test("throws ProposalExecutionError when conformance has blockers", () => {
  const option = proposalOption({
    duration: { min_seconds: 45, max_seconds: 65, target_seconds: 55, tolerance_frames: 2 },
  });

  let thrown: unknown;
  try {
    assertProposalExecution(option, edl([{ id: "long", start: 0, end: 108.166667 }]));
  } catch (error) {
    thrown = error;
  }
  expect(thrown instanceof ProposalExecutionError).toBe(true);
});

function proposalOption(overrides: {
  mode?: "candidate_cleanup" | "explicit_segments";
  segments?: ProductionProposalOption["edit_execution_plan"]["timeline"]["segments"];
  overlays?: Array<Partial<ProductionProposalOption["edit_execution_plan"]["text_overlays"][number]> & { id: string; source_id: string; start: number; end: number }>;
  duration?: ProductionProposalOption["edit_execution_plan"]["duration_target"];
} = {}): ProductionProposalOption {
  const option = structuredClone(productionProposalExample.options[0]!) as ProductionProposalOption;
  option.id = "confirmed";
  option.cleanup.cut_candidate_ids = [];
  option.music.source = "none";
  option.sfx.enabled = false;
  option.images.needed = false;
  option.asset_requirements = { visual_asset_slots: [], music_slots: [], sfx_slots: [], image_slots: [] };
  option.edit_execution_plan.duration_target = overrides.duration ?? { min_seconds: 0.5, max_seconds: 120, target_seconds: 45, tolerance_frames: 2 };
  option.edit_execution_plan.timeline = {
    mode: overrides.mode ?? "candidate_cleanup",
    segments: overrides.segments ?? [],
  };
  option.edit_execution_plan.text_overlays = (overrides.overlays ?? []).map((overlay) => ({
    element_id: "caption-highlight",
    text: "Confirmed overlay",
    purpose: "Call out the confirmed business hook.",
    ...overlay,
  }));
  return option;
}

function optionWithSlots(slots: {
  visualRequired?: string[];
  musicRequired?: string[];
  sfxRequired?: string[];
  musicOptional?: string[];
}): ProductionProposalOption {
  const option = proposalOption();
  option.asset_requirements.visual_asset_slots = (slots.visualRequired ?? []).map((slot_id) => slot(slot_id, "visual_asset", true));
  option.asset_requirements.music_slots = [
    ...(slots.musicRequired ?? []).map((slot_id) => slot(slot_id, "music", true)),
    ...(slots.musicOptional ?? []).map((slot_id) => slot(slot_id, "music", false)),
  ];
  option.asset_requirements.sfx_slots = (slots.sfxRequired ?? []).map((slot_id) => slot(slot_id, "sfx", true));
  return option;
}

function slot(slot_id: string, kind: "visual_asset" | "music" | "sfx", required: boolean) {
  return { slot_id, kind, purpose: `Use ${slot_id}.`, required };
}

function edl(entries: Array<{ id: string; source?: string; start: number; end: number; order?: number }>): EdlArtifact {
  return {
    contract_version: "2.0",
    entries: entries.map((entry, index) => ({
      source_id: entry.source ?? "src-001",
      start: entry.start,
      end: entry.end,
      output_order: entry.order ?? index,
      reason: "Confirmed segment.",
      label: entry.id,
    })),
  };
}

function enrichmentPlan(bound: { visual?: string[]; music?: string[]; sfx?: string[] } = {}): EnrichmentPlanArtifact {
  return {
    version: "2.0",
    profile: { source_mode: "mixed", aspect_ratio: "source", caption_identity: "anchor", layout: "overlay", style: "minimal", frame: "clean" },
    elements: (bound.visual ?? []).map((id) => ({
      id,
      source: "agent",
      element_id: "visual-asset",
      element_type: "visual_asset",
      start: 0,
      end: 1,
      asset_id: `asset-${id}`,
      reason: "Bind confirmed visual slot.",
    })),
    audio: {
      music: (bound.music ?? []).map((id) => ({ id, asset_id: `asset-${id}`, start: 0, end: 1, volume: 0.2, fade_seconds: 0, ducking: true, reason: "Bind confirmed music slot." })),
      sfx: (bound.sfx ?? []).map((id) => ({ id, sfx_id: "click", start: 0.2, end: 0.3, volume: 0.15, fade_seconds: 0, reason: "Bind confirmed SFX slot." })),
    },
  };
}
