import type {
  AnalysisCandidate,
  EdlArtifact,
  EdlEntry,
  EnrichmentElement,
  EnrichmentPlanArtifact,
  EnrichmentSourceMode,
  ProductionDurationTarget,
  ProductionProposalOption,
  ProductionTextOverlay,
  SourcesManifest,
} from "./artifacts";
import { parseEdl } from "./artifacts";
import { compileOutputFrameSchedule } from "./render-contract";

export const CUT_PADDING_SECONDS = 0.05;

export type EffectiveCutRange = {
  candidate_id: string;
  source_id: string;
  start: number;
  end: number;
  effective_start: number;
  effective_end: number;
};

export type CandidateCleanupCompilation = {
  edl: EdlArtifact;
  cuts: EffectiveCutRange[];
};

export type RetainedRangeResolution = {
  matches: Array<{ entry: EdlEntry; output_start: number }>;
  retained_subranges: Array<{ start: number; end: number }>;
};

export type ProposalExecutionCheck = {
  id: string;
  status: "passed" | "blocker";
  message: string;
};

export type MappedProposalOverlay = ProductionTextOverlay & {
  output_start: number;
  output_end: number;
};

export type ProposalExecutionConformance = {
  status: "passed" | "failed";
  option_id: string;
  execution_mode: ProductionProposalOption["edit_execution_plan"]["timeline"]["mode"];
  duration_target: ProductionDurationTarget;
  actual_duration_seconds: number;
  actual_frame_count: number;
  checks: ProposalExecutionCheck[];
  mapped_overlays: MappedProposalOverlay[];
};

export class ProposalExecutionError extends Error {
  readonly code = "PROPOSAL_EXECUTION_MISMATCH";
  readonly conformance: ProposalExecutionConformance;

  constructor(conformance: ProposalExecutionConformance) {
    const blockers = conformance.checks.filter((check) => check.status === "blocker");
    super(blockers.map((check) => `${check.id}: ${check.message}`).join("; ") || "confirmed proposal execution does not conform");
    this.name = "ProposalExecutionError";
    this.conformance = conformance;
  }
}

export function compileCandidateCleanupEdl(
  manifest: SourcesManifest,
  selectedCuts: readonly AnalysisCandidate[],
): CandidateCleanupCompilation {
  const sourceIds = new Set(manifest.sources.map((source) => source.source_id));
  for (const cut of selectedCuts) {
    if (!sourceIds.has(cut.source_id)) throw new Error(`candidate ${cut.id} references unknown source_id: ${cut.source_id}`);
  }
  const entries: EdlEntry[] = [];
  const cuts: EffectiveCutRange[] = [];
  for (const source of manifest.sources) {
    const duration = source.duration_seconds;
    if (duration <= 0) throw new Error(`source duration is unavailable for ${source.source_id}`);
    const sourceCuts = selectedCuts
      .filter((candidate) => candidate.source_id === source.source_id)
      .sort((left, right) => left.start - right.start);
    for (let index = 1; index < sourceCuts.length; index += 1) {
      const previous = sourceCuts[index - 1]!;
      const current = sourceCuts[index]!;
      if (current.start < previous.end) throw new Error(`selected cut candidates overlap for ${source.source_id}: ${current.id}`);
    }
    let cursor = 0;
    for (const cut of sourceCuts) {
      if (cut.end > duration) throw new Error(`candidate ${cut.id} exceeds source duration`);
      if (cut.end - cut.start <= CUT_PADDING_SECONDS * 2) throw new Error(`candidate ${cut.id} is too short for boundary padding`);
      const effectiveStart = Math.min(duration, cut.start + CUT_PADDING_SECONDS);
      const effectiveEnd = Math.max(effectiveStart, cut.end - CUT_PADDING_SECONDS);
      cuts.push({
        candidate_id: cut.id,
        source_id: cut.source_id,
        start: cut.start,
        end: cut.end,
        effective_start: effectiveStart,
        effective_end: effectiveEnd,
      });
      if (effectiveStart > cursor) {
        entries.push({
          source_id: source.source_id,
          start: cursor,
          end: effectiveStart,
          output_order: entries.length,
          reason: `keep before ${cut.id}`,
        });
      }
      cursor = Math.max(cursor, effectiveEnd);
    }
    if (duration > cursor) {
      entries.push({
        source_id: source.source_id,
        start: cursor,
        end: duration,
        output_order: entries.length,
        reason: "keep source range",
      });
    }
  }
  if (entries.length === 0) throw new Error("EDL has no renderable entries");
  return { edl: parseEdl({ contract_version: "2.0", entries }, manifest), cuts };
}

export function resolveRetainedSourceRange(
  edl: EdlArtifact,
  range: Pick<ProductionTextOverlay, "source_id" | "start" | "end" | "segment_id">,
): RetainedRangeResolution {
  const ordered = [...edl.entries].sort((left, right) => left.output_order - right.output_order);
  let outputCursor = 0;
  const entries = ordered.map((entry) => {
    const output_start = outputCursor;
    outputCursor += entry.end - entry.start;
    return { entry, output_start };
  });
  const sameSource = entries.filter(({ entry }) => entry.source_id === range.source_id);
  const matches = sameSource.filter(({ entry }) => {
    const segmentMatches = range.segment_id ? entry.label === range.segment_id : true;
    return segmentMatches && range.start >= entry.start && range.end <= entry.end;
  });
  const retained_subranges = sameSource.flatMap(({ entry }) => {
    const start = Math.max(range.start, entry.start);
    const end = Math.min(range.end, entry.end);
    return end > start ? [{ start, end }] : [];
  });
  return { matches, retained_subranges };
}

export function evaluateProposalExecution(
  option: ProductionProposalOption,
  edl: EdlArtifact,
  fps = 30,
): ProposalExecutionConformance {
  const schedule = compileOutputFrameSchedule(edl.entries, fps);
  const checks: ProposalExecutionCheck[] = [];
  checks.push(durationCheck(option.edit_execution_plan.duration_target, schedule.expected_duration_seconds, fps));
  checks.push(timelineCheck(option, edl));
  const mapped = mapProposalOverlays(option, edl, checks);
  return {
    status: checks.some((check) => check.status === "blocker") ? "failed" : "passed",
    option_id: option.id,
    execution_mode: option.edit_execution_plan.timeline.mode,
    duration_target: option.edit_execution_plan.duration_target,
    actual_duration_seconds: schedule.expected_duration_seconds,
    actual_frame_count: schedule.total_frames,
    checks,
    mapped_overlays: mapped,
  };
}

export function assertProposalExecution(option: ProductionProposalOption, edl: EdlArtifact, fps = 30): ProposalExecutionConformance {
  const conformance = evaluateProposalExecution(option, edl, fps);
  if (conformance.status === "failed") throw new ProposalExecutionError(conformance);
  return conformance;
}

export function evaluateResolvedProposalExecution(
  option: ProductionProposalOption,
  edl: EdlArtifact,
  plan: EnrichmentPlanArtifact | undefined,
  sourceMode?: EnrichmentSourceMode,
  fps = 30,
): ProposalExecutionConformance {
  const base = evaluateProposalExecution(option, edl, fps);
  const checks = [...base.checks, ...assertConfirmedAssetSlots(option, plan)];
  if (sourceMode && plan) checks.push(confirmedSourceModeCheck(sourceMode, plan));
  const captionIdentityCount = plan?.elements.filter((element) => element.element_type === "caption_identity").length ?? 0;
  const captionStylePassed = option.subtitles.style === "anchor"
    ? captionIdentityCount === 1
    : captionIdentityCount === 0;
  checks.push({
    id: "subtitle-style",
    status: captionStylePassed ? "passed" : "blocker",
    message: captionStylePassed
      ? `resolved composition matches confirmed subtitle style ${option.subtitles.style}`
      : `confirmed subtitle style ${option.subtitles.style} requires ${option.subtitles.style === "anchor" ? "exactly one" : "no"} caption identity element; actual=${captionIdentityCount}`,
  });
  for (const overlay of base.mapped_overlays) {
    const element = plan?.elements.find((candidate) => candidate.id === overlay.id);
    const matches = Boolean(element
      && element.element_type === "registry_component"
      && element.element_id === overlay.element_id
      && element.start === overlay.output_start
      && element.end === overlay.output_end
      && element.params?.text === overlay.text);
    checks.push({
      id: `resolved-overlay:${overlay.id}`,
      status: matches ? "passed" : "blocker",
      message: matches ? "confirmed overlay is frozen in the resolved composition" : "confirmed overlay is missing or differs in the resolved composition",
    });
  }
  return {
    ...base,
    status: checks.some((check) => check.status === "blocker") ? "failed" : "passed",
    checks,
  };
}

export function assertResolvedProposalExecution(
  option: ProductionProposalOption,
  edl: EdlArtifact,
  plan: EnrichmentPlanArtifact | undefined,
  sourceMode?: EnrichmentSourceMode,
  fps = 30,
): ProposalExecutionConformance {
  const conformance = evaluateResolvedProposalExecution(option, edl, plan, sourceMode, fps);
  if (conformance.status === "failed") throw new ProposalExecutionError(conformance);
  return conformance;
}

export function applyConfirmedTextOverlays(
  option: ProductionProposalOption,
  edl: EdlArtifact,
  plan: EnrichmentPlanArtifact | undefined,
  sourceMode: EnrichmentSourceMode,
): EnrichmentPlanArtifact | undefined {
  const conformance = assertProposalExecution(option, edl);
  const needsCaptionIdentity = option.subtitles.enabled && option.subtitles.style === "anchor";
  if (conformance.mapped_overlays.length === 0 && !needsCaptionIdentity) return plan;
  const profile = plan?.profile ?? {
    source_mode: sourceMode,
    aspect_ratio: "source" as const,
    caption_identity: "anchor" as const,
    layout: "overlay" as const,
    style: "minimal" as const,
    frame: "clean" as const,
  };
  const existingIds = new Set(plan?.elements.map((element) => element.id) ?? []);
  const generated: EnrichmentElement[] = conformance.mapped_overlays.map((overlay) => {
    if (existingIds.has(overlay.id)) {
      throw conformanceError(conformance, `text-overlay:${overlay.id}`, `id conflicts with enrichment element ${overlay.id}`);
    }
    existingIds.add(overlay.id);
    return {
      id: overlay.id,
      source: "confirmed-proposal",
      element_id: overlay.element_id,
      element_type: "registry_component",
      start: overlay.output_start,
      end: overlay.output_end,
      reason: overlay.purpose,
      params: { text: overlay.text },
    };
  });
  const elements = [...(plan?.elements ?? [])];
  if (needsCaptionIdentity && !elements.some((element) => element.element_type === "caption_identity")) {
    if (existingIds.has("confirmed-caption-identity")) {
      throw conformanceError(conformance, "subtitle-style", "generated caption identity id conflicts with enrichment element confirmed-caption-identity");
    }
    existingIds.add("confirmed-caption-identity");
    elements.unshift({
      id: "confirmed-caption-identity",
      source: "confirmed-proposal",
      element_id: "anchor",
      element_type: "caption_identity",
      start: 0,
      end: conformance.actual_duration_seconds,
      reason: "Preserve the confirmed subtitle policy while rendering text overlays.",
      caption_identity: "anchor",
    });
  }
  elements.push(...generated);
  return { version: "2.0", profile, elements, audio: plan?.audio ?? { music: [], sfx: [] } };
}

function conformanceError(
  conformance: ProposalExecutionConformance,
  id: string,
  message: string,
): ProposalExecutionError {
  return new ProposalExecutionError({
    ...conformance,
    status: "failed",
    checks: [...conformance.checks, { id, status: "blocker", message }],
  });
}

export function assertConfirmedAssetSlots(option: ProductionProposalOption, plan: EnrichmentPlanArtifact | undefined): ProposalExecutionCheck[] {
  const declared = {
    visual: new Set([...option.asset_requirements.visual_asset_slots, ...option.asset_requirements.image_slots].map((slot) => slot.slot_id)),
    music: new Set(option.asset_requirements.music_slots.map((slot) => slot.slot_id)),
    sfx: new Set(option.asset_requirements.sfx_slots.map((slot) => slot.slot_id)),
  };
  const required = {
    visual: new Set([...option.asset_requirements.visual_asset_slots, ...option.asset_requirements.image_slots].filter((slot) => slot.required).map((slot) => slot.slot_id)),
    music: new Set(option.asset_requirements.music_slots.filter((slot) => slot.required).map((slot) => slot.slot_id)),
    sfx: new Set(option.asset_requirements.sfx_slots.filter((slot) => slot.required).map((slot) => slot.slot_id)),
  };
  const bound = {
    visual: new Set((plan?.elements ?? []).filter((element) => element.element_type === "visual_asset" && element.asset_id).map((element) => element.id)),
    music: new Set((plan?.audio.music ?? []).map((item) => item.id)),
    sfx: new Set((plan?.audio.sfx ?? []).map((item) => item.id)),
  };
  return (["visual", "music", "sfx"] as const).flatMap((kind) => {
    const missing = [...required[kind]].filter((slotId) => !bound[kind].has(slotId));
    const unknown = [...bound[kind]].filter((slotId) => !declared[kind].has(slotId));
    const skippedOptional = [...declared[kind]].filter((slotId) => !required[kind].has(slotId) && !bound[kind].has(slotId));
    return [
      {
        id: `${kind}-slots`,
        status: missing.length === 0 && unknown.length === 0 ? "passed" as const : "blocker" as const,
        message: missing.length === 0 && unknown.length === 0
          ? `${kind} slots match the confirmed option; skipped_optional=[${skippedOptional.join(", ")}]`
          : `missing=[${missing.join(", ")}] unconfirmed=[${unknown.join(", ")}]`,
      },
    ];
  });
}

export function confirmedSourceModeCheck(sourceMode: EnrichmentSourceMode, plan: EnrichmentPlanArtifact): ProposalExecutionCheck {
  const passed = plan.profile.source_mode === sourceMode;
  return {
    id: "source-mode",
    status: passed ? "passed" : "blocker",
    message: passed
      ? `enrichment source_mode matches confirmed proposal: ${sourceMode}`
      : `confirmed proposal source_mode=${sourceMode}; enrichment-plan profile.source_mode=${plan.profile.source_mode}`,
  };
}

function durationCheck(target: ProductionDurationTarget, actualSeconds: number, fps: number): ProposalExecutionCheck {
  const tolerance = target.tolerance_frames / fps;
  const passed = actualSeconds >= target.min_seconds - tolerance && actualSeconds <= target.max_seconds + tolerance;
  return {
    id: "target-duration",
    status: passed ? "passed" : "blocker",
    message: `target=[${target.min_seconds.toFixed(3)}, ${target.max_seconds.toFixed(3)}]s actual=${actualSeconds.toFixed(3)}s tolerance=${tolerance.toFixed(3)}s`,
  };
}

function timelineCheck(option: ProductionProposalOption, edl: EdlArtifact): ProposalExecutionCheck {
  const timeline = option.edit_execution_plan.timeline;
  if (timeline.mode === "candidate_cleanup") {
    return { id: "timeline", status: "passed", message: "EDL was compiled from the confirmed cleanup candidate set" };
  }
  const ordered = [...edl.entries].sort((left, right) => left.output_order - right.output_order);
  const passed = ordered.length === timeline.segments.length && ordered.every((entry, index) => {
    const segment = timeline.segments[index]!;
    return entry.source_id === segment.source_id
      && entry.start === segment.start
      && entry.end === segment.end
      && entry.label === segment.id;
  });
  return {
    id: "timeline",
    status: passed ? "passed" : "blocker",
    message: passed ? "EDL exactly matches the confirmed ordered source segments" : "EDL does not exactly match the confirmed ordered source segments",
  };
}

function mapProposalOverlays(
  option: ProductionProposalOption,
  edl: EdlArtifact,
  checks: ProposalExecutionCheck[],
): MappedProposalOverlay[] {
  const mapped: MappedProposalOverlay[] = [];
  for (const overlay of option.edit_execution_plan.text_overlays) {
    const { matches } = resolveRetainedSourceRange(edl, overlay);
    if (matches.length !== 1) {
      checks.push({
        id: `text-overlay:${overlay.id}`,
        status: "blocker",
        message: matches.length === 0 ? "source range is not retained by the EDL" : "source range maps to more than one output segment",
      });
      continue;
    }
    const { entry, output_start } = matches[0]!;
    mapped.push({
      ...overlay,
      output_start: output_start + overlay.start - entry.start,
      output_end: output_start + overlay.end - entry.start,
    });
    checks.push({ id: `text-overlay:${overlay.id}`, status: "passed", message: "overlay source range maps to one output range" });
  }
  return mapped;
}
