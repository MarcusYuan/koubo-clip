import { createHash } from "node:crypto";

export type ArtifactValidationIssue = {
  path: string;
  keyword: string;
  message: string;
};

export type ArtifactContract = {
  artifact_id: string;
  filename: string;
  schema_version: string;
  schema_digest: `sha256:${string}`;
  contract_digest: `sha256:${string}`;
  ownership: "agent_authored" | "host_authored" | "cli_owned";
  role: "authoritative_input" | "command_request" | "evidence" | "derived" | "execution_result";
  external_writes_allowed: boolean;
  validator?: string;
  producer?: string;
  prerequisites: string[];
  schema: JsonSchema;
  template?: unknown;
  template_requires_filling?: boolean;
  example?: unknown;
  skill_reference?: string;
};

type JsonSchema = Record<string, unknown>;

export class ArtifactValidationError extends Error {
  readonly code = "ARTIFACT_VALIDATION_FAILED";
  readonly artifact: string;
  readonly schema_version: string;
  readonly schema_digest: string;
  readonly issues: ArtifactValidationIssue[];

  constructor(artifact: string, schemaVersion: string, schemaDigest: string, issues: ArtifactValidationIssue[]) {
    const sorted = sortIssues(issues).slice(0, 100);
    super(`${artifact} failed validation${sorted[0] ? `: ${sorted[0].path || "/"} ${sorted[0].message}` : ""}`);
    this.artifact = artifact;
    this.schema_version = schemaVersion;
    this.schema_digest = schemaDigest;
    this.issues = sorted;
  }
}

export class ContractSchemaUnsupportedError extends Error {
  readonly code = "CONTRACT_SCHEMA_UNSUPPORTED";
  readonly artifact: string;
  readonly schema_version: string;
  readonly schema_digest: string;

  constructor(artifact: string, actualVersion: unknown, expectedVersion: string, schemaDigest: string) {
    super(`${artifact} version ${JSON.stringify(actualVersion)} is unsupported; expected ${JSON.stringify(expectedVersion)}`);
    this.artifact = artifact;
    this.schema_version = expectedVersion;
    this.schema_digest = schemaDigest;
  }
}

const stringArray = {
  type: "array",
  items: { type: "string", minLength: 1 },
} satisfies JsonSchema;

const closed = (required: string[], properties: Record<string, JsonSchema>): JsonSchema => ({
  type: "object",
  required,
  properties,
  additionalProperties: false,
});

const assetSlotProperties: Record<string, JsonSchema> = {
  slot_id: { type: "string", minLength: 1, pattern: "^[^/:\\\\]+$" },
  kind: { type: "string" },
  purpose: { type: "string", minLength: 1 },
  query: { type: "string", minLength: 1 },
  prompt: { type: "string", minLength: 1 },
  required: { type: "boolean" },
  suggested_time: { type: ["number", "string", "null"], minimum: 0 },
  duration_hint: { type: ["number", "string", "null"], minimum: 0 },
  placement_hint: { type: "string", minLength: 1 },
  provider_hint: { type: "string", minLength: 1 },
  license_constraints: { type: "string", minLength: 1 },
  cost_constraints: { type: "string", minLength: 1 },
  source_risk: { type: "string", minLength: 1 },
};

const assetSlot = (kind: "visual_asset" | "music" | "sfx" | "image"): JsonSchema =>
  closed(["slot_id", "kind", "purpose", "required"], {
    ...assetSlotProperties,
    kind: { const: kind },
  });

export const productionProposalSchema: JsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://koubo-clip.dev/schema/production-proposal/3.0",
  title: "Koubo Clip Production Proposal",
  ...closed(
    ["version", "source_mode", "presentation_intent", "goal_summary", "material_summary", "recommended_option_id", "options"],
    {
      version: { const: "3.0" },
      source_mode: { enum: ["talking_head_avatar", "screen_recording", "mixed"] },
      presentation_intent: { enum: ["internal_tutorial", "product_demo", "course_lesson", "knowledge_explainer", "short_form"] },
      goal_summary: { type: "string", minLength: 1 },
      material_summary: { type: "string", minLength: 1 },
      recommended_option_id: { type: "string", minLength: 1, pattern: "^[^/:\\\\]+$" },
      options: { type: "array", minItems: 2, maxItems: 4, items: { $ref: "#/$defs/option" } },
    },
  ),
  $defs: {
    option: closed(
      [
        "id",
        "label",
        "reason",
        "cleanup",
        "subtitles",
        "visuals",
        "images",
        "music",
        "sfx",
        "requires_confirmation",
        "business_direction",
        "edit_execution_plan",
        "asset_requirements",
      ],
      {
        id: { type: "string", minLength: 1, pattern: "^[^/:\\\\]+$" },
        label: { type: "string", minLength: 1 },
        reason: { type: "string", minLength: 1 },
        cleanup: closed(["cut_candidate_ids", "keep_strategy", "risks"], {
          cut_candidate_ids: { type: "array", items: { type: "string", minLength: 1, pattern: "^[^/:\\\\]+$" } },
          keep_strategy: { type: "string", minLength: 1 },
          risks: stringArray,
        }),
        subtitles: closed(["enabled", "style", "conflict_notes"], {
          enabled: { type: "boolean" },
          style: { enum: ["none", "plain", "anchor"] },
          conflict_notes: stringArray,
        }),
        visuals: closed(["direction", "viewer_job", "requires_grounding", "notes"], {
          direction: { type: "string", minLength: 1 },
          viewer_job: { type: "string", minLength: 1 },
          requires_grounding: { type: "boolean" },
          notes: stringArray,
        }),
        images: closed(["needed", "reason", "missing_assets"], {
          needed: { type: "boolean" },
          reason: { type: "string", minLength: 1 },
          missing_assets: stringArray,
        }),
        music: closed(["source", "ducking", "notes"], {
          source: { enum: ["none", "local", "minimax", "freesound", "pixabay"] },
          mood: { type: "string", minLength: 1 },
          ducking: { type: "boolean" },
          notes: stringArray,
        }),
        sfx: closed(["enabled", "usage", "restraint"], {
          enabled: { type: "boolean" },
          usage: { type: "string", minLength: 1 },
          restraint: { type: "string", minLength: 1 },
        }),
        requires_confirmation: stringArray,
        business_direction: closed(["title", "suitable_for", "editing_strategy", "asset_style", "risks"], {
          title: { type: "string", minLength: 1 },
          suitable_for: { type: "string", minLength: 1 },
          editing_strategy: { type: "string", minLength: 1 },
          asset_style: { type: "string", minLength: 1 },
          risks: stringArray,
          tradeoffs: stringArray,
        }),
        edit_execution_plan: closed(
          [
            "objective",
            "target_audience",
            "duration_target",
            "narrative_structure",
            "timeline",
            "text_overlays",
            "user_confirmation_summary",
          ],
          {
            objective: { type: "string", minLength: 1 },
            target_audience: { type: "string", minLength: 1 },
            duration_target: { $ref: "#/$defs/durationTarget" },
            narrative_structure: { type: "array", items: { $ref: "#/$defs/narrativeBeat" } },
            timeline: { $ref: "#/$defs/executionTimeline" },
            text_overlays: { type: "array", items: { $ref: "#/$defs/textOverlay" } },
            user_confirmation_summary: { type: "string", minLength: 1 },
          },
        ),
        asset_requirements: closed(["visual_asset_slots", "music_slots", "sfx_slots", "image_slots"], {
          visual_asset_slots: { type: "array", items: { $ref: "#/$defs/visualAssetSlot" } },
          music_slots: { type: "array", items: { $ref: "#/$defs/musicSlot" } },
          sfx_slots: { type: "array", items: { $ref: "#/$defs/sfxSlot" } },
          image_slots: { type: "array", items: { $ref: "#/$defs/imageSlot" } },
        }),
      },
    ),
    narrativeBeat: closed(["beat", "purpose"], {
      beat: { type: "string", minLength: 1 },
      purpose: { type: "string", minLength: 1 },
      source_hint: { type: "string", minLength: 1 },
    }),
    durationTarget: closed(["min_seconds", "max_seconds", "tolerance_frames"], {
      min_seconds: { type: "number", minimum: 0 },
      max_seconds: { type: "number", minimum: 0 },
      target_seconds: { type: "number", minimum: 0 },
      tolerance_frames: { type: "integer", minimum: 0 },
    }),
    executionTimeline: closed(["mode", "segments"], {
      mode: { enum: ["candidate_cleanup", "explicit_segments"] },
      segments: { type: "array", items: { $ref: "#/$defs/timelineSegment" } },
    }),
    timelineSegment: closed(["id", "source_id", "start", "end", "reason"], {
      id: { type: "string", minLength: 1, pattern: "^[^/:\\\\]+$" },
      source_id: { type: "string", minLength: 1, pattern: "^[^/:\\\\]+$" },
      start: { type: "number", minimum: 0 },
      end: { type: "number", minimum: 0 },
      label: { type: "string", minLength: 1 },
      reason: { type: "string", minLength: 1 },
    }),
    textOverlay: closed(["id", "source_id", "start", "end", "element_id", "text", "purpose"], {
      id: { type: "string", minLength: 1, pattern: "^[^/:\\\\]+$" },
      source_id: { type: "string", minLength: 1, pattern: "^[^/:\\\\]+$" },
      segment_id: { type: "string", minLength: 1, pattern: "^[^/:\\\\]+$" },
      start: { type: "number", minimum: 0 },
      end: { type: "number", minimum: 0 },
      element_id: { enum: ["caption-highlight", "caption-editorial-emphasis", "caption-pill-karaoke"] },
      text: { type: "string", minLength: 1 },
      purpose: { type: "string", minLength: 1 },
    }),
    visualAssetSlot: assetSlot("visual_asset"),
    musicSlot: assetSlot("music"),
    sfxSlot: assetSlot("sfx"),
    imageSlot: assetSlot("image"),
  },
};

const optionTemplate = (id: string) => ({
  id,
  label: "",
  reason: "",
  cleanup: { cut_candidate_ids: [], keep_strategy: "", risks: [] },
  subtitles: { enabled: true, style: "plain", conflict_notes: [] },
  visuals: { direction: "", viewer_job: "", requires_grounding: false, notes: [] },
  images: { needed: false, reason: "", missing_assets: [] },
  music: { source: "none", ducking: true, notes: [] },
  sfx: { enabled: false, usage: "", restraint: "" },
  requires_confirmation: [],
  business_direction: { title: "", suitable_for: "", editing_strategy: "", asset_style: "", risks: [] },
  edit_execution_plan: {
    objective: "",
    target_audience: "",
    duration_target: { min_seconds: 0, max_seconds: 0, tolerance_frames: 2 },
    narrative_structure: [],
    timeline: { mode: "candidate_cleanup", segments: [] },
    text_overlays: [],
    user_confirmation_summary: "",
  },
  asset_requirements: { visual_asset_slots: [], music_slots: [], sfx_slots: [], image_slots: [] },
});

export const productionProposalTemplate = {
  version: "3.0",
  source_mode: "talking_head_avatar",
  presentation_intent: "knowledge_explainer",
  goal_summary: "",
  material_summary: "",
  recommended_option_id: "option-1",
  options: [optionTemplate("option-1"), optionTemplate("option-2")],
};

const exampleOption = (id: string, label: string, cutCandidateIds: string[], enhanced: boolean) => ({
  id,
  label,
  reason: enhanced ? "Retains the proof while adding restrained visual guidance." : "Provides the fastest clean delivery with minimal visual change.",
  cleanup: { cut_candidate_ids: cutCandidateIds, keep_strategy: "Keep all complete claims and product proof.", risks: [] },
  subtitles: { enabled: true, style: enhanced ? "anchor" : "plain", conflict_notes: [] },
  visuals: {
    direction: enhanced ? "Transparent focus cues and concise callouts." : "No decorative overlays.",
    viewer_job: enhanced ? "Follow the product payoff." : "Focus on the cleaned explanation.",
    requires_grounding: enhanced,
    notes: [],
  },
  images: { needed: false, reason: "The source already contains sufficient visual evidence.", missing_assets: [] },
  music: { source: "none", ducking: true, notes: [] },
  sfx: { enabled: false, usage: "No sound effects.", restraint: "Keep the original speech natural." },
  requires_confirmation: enhanced ? ["Confirm the restrained visual direction."] : [],
  business_direction: {
    title: label,
    suitable_for: enhanced ? "A concise product explainer." : "A quick clean publish.",
    editing_strategy: enhanced ? "Lead with the payoff, retain proof, then close clearly." : "Remove only confirmed cleanup candidates.",
    asset_style: enhanced ? "Minimal transparent UI cues." : "Source-first with readable subtitles.",
    risks: [],
  },
  edit_execution_plan: {
    objective: enhanced ? "Explain the payoff quickly and credibly." : "Improve pacing without changing the message.",
    target_audience: "Viewers evaluating the demonstrated product.",
    duration_target: { min_seconds: 0.5, max_seconds: 120, target_seconds: 45, tolerance_frames: 2 },
    narrative_structure: [{ beat: "proof", purpose: "Show the strongest source evidence.", source_hint: "Use the clearest retained segment." }],
    timeline: { mode: "candidate_cleanup", segments: [] },
    text_overlays: [],
    user_confirmation_summary: enhanced ? "Clean the pauses and add restrained focus cues." : "Clean the pauses and keep the source presentation.",
  },
  asset_requirements: { visual_asset_slots: [], music_slots: [], sfx_slots: [], image_slots: [] },
});

export const productionProposalExample = {
  version: "3.0",
  source_mode: "mixed",
  presentation_intent: "product_demo",
  goal_summary: "Turn the source into a concise product explainer.",
  material_summary: "The source contains a spoken walkthrough, product proof, and one removable pause.",
  recommended_option_id: "restrained-enhancement",
  options: [
    exampleOption("restrained-enhancement", "Restrained enhancement", ["candidate-pause-1"], true),
    exampleOption("cleanup-only", "Cleanup only", ["candidate-pause-1"], false),
  ],
};

const proposalSchemaDigest = digest(productionProposalSchema);
const proposalMetadata = {
  artifact_id: "production-proposal",
  filename: "production-proposal.json",
  schema_version: "3.0",
  ownership: "agent_authored" as const,
  role: "authoritative_input" as const,
  external_writes_allowed: true,
  validator: "project proposal",
  prerequisites: ["review-package"],
  skill_reference: "references/business-planning.md",
};
const proposalContractDigest = digest({
  ...proposalMetadata,
  schema: productionProposalSchema,
  template: productionProposalTemplate,
  template_requires_filling: true,
  example: productionProposalExample,
});

const productionProposalContract: ArtifactContract = {
  ...proposalMetadata,
  schema_digest: proposalSchemaDigest,
  contract_digest: proposalContractDigest,
  schema: productionProposalSchema,
  template: productionProposalTemplate,
  template_requires_filling: true,
  example: productionProposalExample,
};

const id = { type: "string", minLength: 1, pattern: "^[^/:\\\\]+$" } satisfies JsonSchema;
const opaqueId = { type: "string", minLength: 1, pattern: "^(?!\\s*[A-Za-z][A-Za-z0-9+.-]*:)(?=.*\\S)[^/\\\\]+$" } satisfies JsonSchema;
const text = { type: "string", minLength: 1, pattern: "\\S" } satisfies JsonSchema;
const number = { type: "number", minimum: 0 } satisfies JsonSchema;
const range = closed(["start", "end"], { start: number, end: number });
const point = closed(["x", "y"], { x: { type: "number", minimum: 0, maximum: 1 }, y: { type: "number", minimum: 0, maximum: 1 } });
const rect = closed(["x", "y", "width", "height"], {
  x: { type: "number", minimum: 0, maximum: 1 }, y: { type: "number", minimum: 0, maximum: 1 },
  width: { type: "number", minimum: 0, maximum: 1 }, height: { type: "number", minimum: 0, maximum: 1 },
});
const params = { type: "object", additionalProperties: { type: ["string", "number", "boolean", "null"] } } satisfies JsonSchema;
const sourceMode = { enum: ["talking_head_avatar", "screen_recording", "mixed"] } satisfies JsonSchema;
const presentationIntent = { enum: ["internal_tutorial", "product_demo", "course_lesson", "knowledge_explainer", "short_form"] } satisfies JsonSchema;
const elementType = { enum: ["registry_block", "registry_component", "animation_rule", "caption_identity", "visual_asset"] } satisfies JsonSchema;
const zone = { enum: ["full_frame", "upper_third", "lower_third", "left_panel", "right_panel", "center"] } satisfies JsonSchema;
const visualAssetType = { enum: ["icon", "animated_icon", "lottie", "ui_component", "template", "sticker", "broll", "image"] } satisfies JsonSchema;
const visualProvider = { enum: ["iconify", "lordicon", "lottie", "shadcn", "21st", "mcp-handoff", "local", "url"] } satisfies JsonSchema;
const sourceIdentity = closed(["sha256", "size_bytes", "duration_seconds", "video"], {
  sha256: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" }, size_bytes: number, duration_seconds: number,
  video: closed(["codec_name", "width", "height", "display_width", "display_height", "rotation", "avg_frame_rate", "pixel_format"], {
    codec_name: { type: "string", minLength: 1 }, width: number, height: number, display_width: number, display_height: number,
    rotation: { type: "number" }, avg_frame_rate: { type: "string", minLength: 1 }, pixel_format: { type: "string", minLength: 1 },
  }),
  audio: closed(["codec_name", "sample_rate", "channels", "channel_layout"], {
    codec_name: { type: "string", minLength: 1 }, sample_rate: number, channels: number, channel_layout: { type: "string", minLength: 1 },
  }),
});

export const enrichmentPlanSchema: JsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema", $id: "https://koubo-clip.dev/schema/enrichment-plan/2.0",
  ...closed(["version", "profile", "elements", "audio"], {
    version: { const: "2.0" },
    profile: closed(["source_mode", "aspect_ratio", "caption_identity", "layout", "style", "frame"], {
      source_mode: sourceMode, aspect_ratio: { enum: ["source", "16:9", "9:16", "4:5"] },
      caption_identity: { const: "anchor" }, layout: { enum: ["stack", "overlay", "split", "pip"] },
      style: { enum: ["whiteboard", "audit", "swiss", "terminal", "xhs", "editorial", "minimal"] }, frame: { enum: ["clean", "hairline", "polaroid"] },
    }),
    elements: { type: "array", items: closed(["id", "source", "element_id", "element_type", "start", "end", "reason"], {
      id, source: { type: "string", minLength: 1 }, element_id: text,
      element_type: elementType,
      start: number, end: number, reason: { type: "string", minLength: 1 }, zone: { enum: ["full_frame", "upper_third", "lower_third", "left_panel", "right_panel", "center"] },
      target_rect: rect, anchor_point: point, params, asset_id: id, caption_identity: { const: "anchor" },
    }) },
    audio: closed(["music", "sfx"], {
      music: { type: "array", items: closed(["id", "asset_id", "start", "end", "volume", "fade_seconds", "ducking", "reason"], { id, asset_id: id, ...range.properties as Record<string, JsonSchema>, volume: number, fade_seconds: number, ducking: { type: "boolean" }, reason: { type: "string", minLength: 1 } }) },
      sfx: { type: "array", items: closed(["id", "start", "end", "volume", "fade_seconds", "reason"], { id, asset_id: id, sfx_id: id, ...range.properties as Record<string, JsonSchema>, volume: number, fade_seconds: number, reason: { type: "string", minLength: 1 } }) },
    }),
  }),
};

type ContractSeed = Omit<ArtifactContract, "schema_digest" | "contract_digest">;
const finalize = (seed: ContractSeed): ArtifactContract => {
  const schema_digest = digest(seed.schema);
  return { ...seed, schema_digest, contract_digest: digest(seed) };
};
const writable = (
  artifact_id: string,
  filename: string,
  schema_version: string,
  schema: JsonSchema,
  template: unknown,
  example: unknown,
  validator: string,
  prerequisites: string[] = [],
  ownership: ArtifactContract["ownership"] = "agent_authored",
  role: ArtifactContract["role"] = "authoritative_input",
): ArtifactContract => finalize({
  artifact_id, filename, schema_version, ownership, role, external_writes_allowed: true,
  validator, prerequisites, schema, template, template_requires_filling: true, example,
});
const readonly = (artifact_id: string, filename: string, schema_version: string, producer: string, role: ArtifactContract["role"] = "derived"): ArtifactContract => finalize({
  artifact_id, filename, schema_version, ownership: "cli_owned", role, external_writes_allowed: false, producer, prerequisites: [],
  schema: { $schema: "https://json-schema.org/draft/2020-12/schema", type: "object" },
});

const sourceManifestSchema = { $schema: "https://json-schema.org/draft/2020-12/schema", ...closed(["contract_version", "sources"], {
  contract_version: { const: "2.0" }, sources: { type: "array", minItems: 1, items: closed(["source_id", "order", "original_filename", "local_media_ref", "identity"], { source_id: id, order: number, original_filename: { type: "string", minLength: 1 }, local_media_ref: { type: "string" }, identity: sourceIdentity }) },
}) };
const transcriptSchema = { $schema: "https://json-schema.org/draft/2020-12/schema", ...closed(["timing_granularity", "segments"], {
  timing_granularity: { enum: ["word", "segment", "text-only"] }, provider: { type: "string" }, language: { type: "string" }, timing_validated: { type: "boolean" },
  segments: { type: "array", items: closed(["source_id", "start", "end", "text"], { source_id: id, start: number, end: number, text: { type: "string" } }) },
}) };
const editPlanSchema = { $schema: "https://json-schema.org/draft/2020-12/schema", ...closed(["contract_version", "confirmed_option_id", "proposal_selection_fingerprint", "decisions"], {
  contract_version: { const: "1.0" }, confirmed_option_id: id, proposal_selection_fingerprint: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
  decisions: { type: "array", items: closed(["action", "candidate_id"], { action: { enum: ["cut", "keep"] }, candidate_id: id, source_id: id, reason: { type: "string" } }) },
}) };
const assetUsageSchema = { $schema: "https://json-schema.org/draft/2020-12/schema", ...closed(["music", "sfx", "visual_assets"], {
  music: { type: "array", items: closed(["asset_ref", "start", "end", "purpose"], {
    id, asset_ref: text, start: number, end: number, volume: number, duck_original_audio: { type: "boolean" },
    fade_in: number, fade_out: number, fade_seconds: number, purpose: text,
  }) },
  sfx: { type: "array", items: closed(["asset_ref", "time", "purpose"], {
    id, asset_ref: text, time: number, duration: number, volume: number, fade_seconds: number, purpose: text,
  }) },
  visual_assets: { type: "array", items: closed(["asset_ref", "start", "end", "purpose"], {
    id, asset_ref: text, start: number, end: number,
    position: { enum: ["top-left", "top-right", "bottom-left", "bottom-right", "full_frame", "upper_third", "lower_third", "left_panel", "right_panel", "center"] },
    size: { enum: ["small", "medium", "large"] }, animation: { enum: ["none", "fade-in"] }, asset_type: visualAssetType, purpose: text,
  }) },
}) };
const sourceMapSchema = { $schema: "https://json-schema.org/draft/2020-12/schema", type: "object", additionalProperties: { type: "string", minLength: 1 } };
const versionedRequest = (version: string, required: string[], properties: Record<string, JsonSchema>) => ({ $schema: "https://json-schema.org/draft/2020-12/schema", ...closed(["version", ...required], { version: { const: version }, ...properties }) });

const sourceFrameItemSchema = closed(["id", "source_id", "time_seconds", "transcript_quote", "reason"], {
  id: opaqueId, source_id: opaqueId, time_seconds: number, segment_id: opaqueId, transcript_quote: text, reason: text,
});
const sourceFrameRequestSchema = versionedRequest("1.0", ["frames"], {
  frames: { type: "array", minItems: 1, maxItems: 20, items: sourceFrameItemSchema },
});
export const sourceFrameRequestExample = {
  version: "1.0",
  frames: [{ id: "frame-001", source_id: "src-001", time_seconds: 1.25, segment_id: "segment-001", transcript_quote: "A useful source moment", reason: "Verify the visible UI state" }],
};
const focusCandidateSchema = closed(["id", "start", "end", "transcript_quote", "semantic_intent", "element_id", "element_type", "requires_grounding", "reason"], {
  id, start: number, end: number, transcript_quote: text,
  semantic_intent: { enum: ["orient_viewer", "guide_attention", "explain_sequence", "summarize_payoff", "pacing_relief"] },
  business_role: text, viewer_job: text, visual_gap: text,
  recommended_treatment: { enum: ["source_ui_component", "generated_asset", "text_or_caption", "sfx_or_music", "none"] },
  element_id: text, element_type: elementType, requires_grounding: { type: "boolean" }, asset_id: id, sfx_id: id, reason: text, params,
});
const focusGroundingItemSchema = closed(["candidate_id", "frame_id", "confidence", "evidence_note"], {
  candidate_id: id, frame_id: id, confidence: { type: "number", minimum: 0, maximum: 1 }, evidence_note: text,
  target_rect: rect, anchor_point: point, params,
});
const visualRequestItemSchema = closed(["id", "viewer_job", "semantic_query", "asset_type", "reason"], {
  id, viewer_job: text, semantic_query: text, asset_type: visualAssetType,
  preferred_sources: { type: "array", items: visualProvider }, reason: text, output_usage: text,
  selected_candidate_id: id, selection_reason: text, start: number, end: number, zone,
});
const projectRelativeVisualPath = { type: "string", minLength: 1, pattern: "^(?![A-Za-z][A-Za-z0-9+.-]*:)(?!/)(?!.*(?:^|/)\\.\\.(?:/|$))[^\\\\]+$" } satisfies JsonSchema;
const httpUrl = { type: "string", minLength: 1, pattern: "^https?://" } satisfies JsonSchema;
const visualCandidateSchema = closed(["id", "request_id", "provider", "asset_type", "title", "semantic_query", "reason"], {
  id, request_id: id, provider: visualProvider, asset_type: visualAssetType, title: text, semantic_query: text,
  preview_url: httpUrl, preview_path: projectRelativeVisualPath, source_url: httpUrl, download_url: httpUrl,
  local_path: projectRelativeVisualPath, license: text, license_url: httpUrl, original_author: text, cost: text,
  source_risk: text, renderable: { type: "boolean" }, recommended: { type: "boolean" }, reason: text,
  runtime_dependencies: stringArray,
});
const visualCandidatesSchema = versionedRequest("1.0", ["candidates"], {
  candidates: { type: "array", minItems: 1, items: visualCandidateSchema }, warnings: stringArray,
});
const evidenceEntrySchema = closed(["id", "relative_path", "sha256", "size_bytes", "width", "height"], {
  id: opaqueId, relative_path: text, sha256: { type: "string", pattern: "^(?:sha256:)?[a-f0-9]{64}$" },
  size_bytes: { type: "number", minimum: 1 }, width: { type: "number", minimum: 1 }, height: { type: "number", minimum: 1 },
  source_id: opaqueId, source_time_seconds: number, request_id: opaqueId, candidate_id: opaqueId, output_time_seconds: number,
});

const sourceManifestExample = { contract_version: "2.0", sources: [{ source_id: "src-001", order: 0, original_filename: "raw.mp4", local_media_ref: "opaque-reference", identity: { sha256: `sha256:${"0".repeat(64)}`, size_bytes: 1, duration_seconds: 1, video: { codec_name: "h264", width: 1920, height: 1080, display_width: 1920, display_height: 1080, rotation: 0, avg_frame_rate: "30/1", pixel_format: "yuv420p" } } }] };
const transcriptExample = { timing_granularity: "segment", segments: [{ source_id: "src-001", start: 0, end: 1, text: "Example transcript" }] };
const editPlanExample = { contract_version: "1.0", confirmed_option_id: "option-001", proposal_selection_fingerprint: `sha256:${"0".repeat(64)}`, decisions: [] };
const enrichmentExample = { version: "2.0", profile: { source_mode: "talking_head_avatar", aspect_ratio: "source", caption_identity: "anchor", layout: "stack", style: "minimal", frame: "clean" }, elements: [], audio: { music: [], sfx: [] } };
const assetUsageExample = { music: [], sfx: [], visual_assets: [] };
const focusCandidatesExample = { version: "1.0", source_mode: "talking_head_avatar", presentation_intent: "knowledge_explainer", candidates: [{ id: "focus-001", start: 0, end: 1, transcript_quote: "Example transcript", semantic_intent: "summarize_payoff", element_id: "anchor", element_type: "caption_identity", requires_grounding: false, reason: "Emphasize the key point" }] };
const focusGroundingExample = { version: "1.0", groundings: [{ candidate_id: "focus-001", frame_id: "frame-001", confidence: 1, evidence_note: "The target is visible" }] };
const musicRequestExample = { version: "1.0", id: "music-001", source: "none", reason: "Speech does not need background music" };
const visualRequestExample = { version: "1.0", source_mode: "talking_head_avatar", presentation_intent: "knowledge_explainer", requests: [{ id: "visual-001", viewer_job: "Orient the viewer", semantic_query: "simple orientation icon", asset_type: "icon", preferred_sources: ["iconify"], reason: "Clarify the section transition" }] };
const visualCandidatesExample = { version: "1.0", candidates: [{ id: "candidate-001", request_id: "visual-001", provider: "local", asset_type: "image", title: "Product proof", semantic_query: "product proof screenshot", preview_path: "previews/candidate-001.jpg", renderable: true, recommended: false, reason: "Matches the confirmed viewer job", runtime_dependencies: [] }], warnings: [] };
const evidenceManifestExample = { version: "1.0", entries: [{ id: "frame-001", relative_path: "frame-001.jpg", sha256: "0".repeat(64), size_bytes: 1, width: 224, height: 480, source_id: "src-001", source_time_seconds: 1.25, request_id: "frame-001" }] };
const sourceMapExample = { "src-001": "/authorized/raw.mp4" };

const discoveredContracts: ArtifactContract[] = [
  productionProposalContract,
  writable("source-manifest", "sources.json", "2.0", sourceManifestSchema, sourceManifestExample, sourceManifestExample, "project create --source-manifest", [], "host_authored", "command_request"),
  writable("transcript", "transcript.json", "1.0", transcriptSchema, transcriptExample, transcriptExample, "project explore", ["sources"], "host_authored"),
  writable("edit-plan", "edit-plan.json", "1.0", editPlanSchema, editPlanExample, editPlanExample, "project compile-edl", ["production-proposal"]),
  writable("enrichment-plan", "enrichment-plan.json", "2.0", enrichmentPlanSchema, enrichmentExample, enrichmentExample, "project enrich-plan", ["edl"]),
  writable("asset-usage-plan", "asset-usage-plan.json", "1.0", assetUsageSchema, assetUsageExample, assetUsageExample, "project enrich-plan", ["edl"], "host_authored", "command_request"),
  writable("source-frame-request", "source-frame-request.json", "1.0", sourceFrameRequestSchema, sourceFrameRequestExample, sourceFrameRequestExample, "project source-frames", ["sources"], "agent_authored", "command_request"),
  writable("focus-candidates", "focus-candidates.json", "1.0", versionedRequest("1.0", ["source_mode", "presentation_intent", "candidates"], { source_mode: sourceMode, presentation_intent: presentationIntent, candidates: { type: "array", items: focusCandidateSchema } }), focusCandidatesExample, focusCandidatesExample, "project focus-candidates", ["edl"]),
  writable("focus-grounding", "focus-grounding.json", "1.0", versionedRequest("1.0", ["groundings"], { groundings: { type: "array", items: focusGroundingItemSchema } }), focusGroundingExample, focusGroundingExample, "project focus-grounding", ["focus-frames"]),
  writable("music-request", "music-request.json", "1.0", versionedRequest("1.0", ["id", "source", "reason"], { id, source: { enum: ["none", "local", "minimax", "freesound", "pixabay"] }, reason: text, source_mode: sourceMode, presentation_intent: presentationIntent, mood: text, target_duration_seconds: number, local_path: text, library_track: text, prompt: text, query: text, model: text, volume: { type: "number", minimum: 0, maximum: 1 }, fade_seconds: number, ducking: { type: "boolean" }, min_duration_seconds: number, max_duration_seconds: number }), musicRequestExample, musicRequestExample, "project music-acquire", [], "agent_authored", "command_request"),
  writable("visual-request", "visual-request.json", "1.0", versionedRequest("1.0", ["source_mode", "presentation_intent", "requests"], { source_mode: sourceMode, presentation_intent: presentationIntent, requests: { type: "array", minItems: 1, items: visualRequestItemSchema } }), visualRequestExample, visualRequestExample, "project visual-acquire", [], "agent_authored", "command_request"),
  writable("visual-candidates", "visual-candidates.json", "1.0", visualCandidatesSchema, visualCandidatesExample, visualCandidatesExample, "project visual-search", ["visual-request"], "host_authored", "evidence"),
  writable("evidence-import-manifest", "manifest.json", "1.0", versionedRequest("1.0", ["entries"], { entries: { type: "array", minItems: 1, items: evidenceEntrySchema } }), evidenceManifestExample, evidenceManifestExample, "project source-frames/focus-frames --import", [], "host_authored", "command_request"),
  writable("source-map", "source-map.json", "1.0", sourceMapSchema, sourceMapExample, sourceMapExample, "render-contract bind", [], "host_authored", "command_request"),
  ...[
    ["project", "project.json", "1.0", "project create"], ["source-materialization", "source-materialization.json", "1.0", "project create"],
    ["analysis", "analysis.json", "1.0", "project explore"], ["review-package", "review-package.json", "1.0", "project review"],
    ["edl", "edl.json", "2.0", "project compile-edl"], ["source-frames", "source-frames.json", "1.0", "project source-frames"],
    ["focus-frames", "focus-frames.json", "1.0", "project focus-frames"], ["focus-review", "focus-review.json", "1.0", "project focus-review"],
    ["music-acquisition", "music-acquisition.json", "1.0", "project music-acquire"], ["music-review", "music-review.json", "1.0", "project music-review"],
    ["visual-acquisition", "visual-acquisition.json", "1.0", "project visual-acquire"],
    ["visual-review", "visual-review.json", "1.0", "project visual-review"], ["asset-manifest", "asset-manifest.json", "1.0", "project enrich-plan"],
    ["storyboard", "storyboard.json", "1.1", "project render"], ["render-result", "render-result.json", "1.0", "project render"],
    ["inspection", "inspection.json", "1.0", "project inspect"], ["render-contract", "render-contract.json", "1.0", "render-contract export"],
    ["source-binding", "bindings.json", "1.0", "render-contract bind"], ["render-contract-result", "render-contract-result.json", "1.0", "render-contract render"],
    ["render-contract-inspection", "render-contract-inspection.json", "1.0", "render-contract inspect"], ["delivery-manifest", "delivery-manifest.json", "3.0", "release packaging"],
  ].map(([artifactId, filename, version, producer]) => readonly(artifactId!, filename!, version!, producer!, artifactId === "render-result" || artifactId === "inspection" ? "execution_result" : "derived")),
];

const contracts = new Map(discoveredContracts.map((contract) => [contract.artifact_id, contract]));

export function getArtifactContract(artifactId: string): ArtifactContract | undefined {
  return contracts.get(artifactId);
}

export function artifactContractIndex(): Record<string, Pick<ArtifactContract, "filename" | "schema_version" | "schema_digest" | "contract_digest" | "ownership" | "role" | "external_writes_allowed">> {
  return Object.fromEntries(
    [...contracts].map(([id, contract]) => [
      id,
      {
        filename: contract.filename,
        schema_version: contract.schema_version,
        schema_digest: contract.schema_digest,
        contract_digest: contract.contract_digest,
        ownership: contract.ownership,
        role: contract.role,
        external_writes_allowed: contract.external_writes_allowed,
      },
    ]),
  );
}

export function artifactContractsDigest(): `sha256:${string}` {
  return digest([...contracts].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([artifact_id, contract]) => ({ artifact_id, contract_digest: contract.contract_digest })));
}

export function assertArtifactContract(artifactId: string, value: unknown): void {
  const contract = contracts.get(artifactId);
  if (!contract || !contract.external_writes_allowed) throw unsupportedArtifactContract(artifactId);
  const versionField = contractVersionField(contract.schema);
  if (versionField && isRecord(value) && value[versionField.field] !== versionField.expected) {
    throw new ContractSchemaUnsupportedError(contract.filename, value[versionField.field], String(versionField.expected), contract.schema_digest);
  }
  const issues: ArtifactValidationIssue[] = [];
  validateJsonSchema(value, contract.schema, "", contract.schema, issues);
  if (artifactId === "production-proposal") addProposalSemanticIssues(value, issues);
  if (artifactId === "source-frame-request") addSourceFrameRequestSemanticIssues(value, issues);
  if (artifactId === "visual-candidates") addVisualCandidatesSemanticIssues(value, issues);
  if (issues.length) throw new ArtifactValidationError(contract.filename, contract.schema_version, contract.schema_digest, issues);
}

export function assertProductionProposalContract(value: unknown): void {
  assertArtifactContract("production-proposal", value);
}

export function productionProposalContractInfo(): Pick<ArtifactContract, "schema_version" | "schema_digest"> {
  return { schema_version: productionProposalContract.schema_version, schema_digest: productionProposalContract.schema_digest };
}

function addProposalSemanticIssues(value: unknown, issues: ArtifactValidationIssue[]): void {
  if (!isRecord(value) || !Array.isArray(value.options)) return;
  const options = value.options.filter(isRecord);
  addDuplicateIssues(options.map((option) => option.id), "/options", "id", issues);
  const ids = new Set(options.map((option) => option.id).filter((id): id is string => typeof id === "string"));
  if (typeof value.recommended_option_id === "string" && !ids.has(value.recommended_option_id)) {
    issues.push({ path: "/recommended_option_id", keyword: "reference", message: "must match an option id" });
  }
  options.forEach((option, optionIndex) => {
    const cleanup = isRecord(option.cleanup) && Array.isArray(option.cleanup.cut_candidate_ids) ? option.cleanup.cut_candidate_ids : [];
    addDuplicateIssues(cleanup, `/options/${optionIndex}/cleanup/cut_candidate_ids`, "value", issues);
    const execution = isRecord(option.edit_execution_plan) ? option.edit_execution_plan : {};
    addDurationTargetIssues(execution.duration_target, `/options/${optionIndex}/edit_execution_plan/duration_target`, issues);
    addExecutionTimelineIssues(execution.timeline, optionIndex, issues);
    addRangeIssues(execution.text_overlays, `/options/${optionIndex}/edit_execution_plan/text_overlays`, issues);
    addTextOverlayIssues(execution.timeline, execution.text_overlays, optionIndex, issues);
    addSubtitleExecutionIssues(option, execution.text_overlays, optionIndex, issues);
    const requirements = isRecord(option.asset_requirements) ? option.asset_requirements : {};
    const allSlots: Array<{ value: unknown; path: string }> = [];
    for (const key of ["visual_asset_slots", "music_slots", "sfx_slots", "image_slots"] as const) {
      const slots = Array.isArray(requirements[key]) ? requirements[key].filter(isRecord) : [];
      addDuplicateIssues(slots.map((slot) => slot.slot_id), `/options/${optionIndex}/asset_requirements/${key}`, "slot_id", issues);
      slots.forEach((slot, index) => allSlots.push({ value: slot.slot_id, path: `/options/${optionIndex}/asset_requirements/${key}/${index}/slot_id` }));
    }
    addGloballyUniqueSlotIssues(allSlots, issues);
    addMediaRequirementIssues(option, requirements, optionIndex, issues);
  });
}

function addGloballyUniqueSlotIssues(slots: Array<{ value: unknown; path: string }>, issues: ArtifactValidationIssue[]): void {
  const seen = new Set<unknown>();
  for (const slot of slots) {
    if (slot.value === undefined || !seen.has(slot.value)) seen.add(slot.value);
    else issues.push({ path: slot.path, keyword: "unique", message: `duplicate slot_id across asset requirement categories: ${String(slot.value)}` });
  }
}

function addSubtitleExecutionIssues(
  option: Record<string, unknown>,
  overlaysValue: unknown,
  optionIndex: number,
  issues: ArtifactValidationIssue[],
): void {
  const subtitles = isRecord(option.subtitles) ? option.subtitles : {};
  const overlays = Array.isArray(overlaysValue) ? overlaysValue : [];
  if (subtitles.enabled === false && subtitles.style !== "none") {
    issues.push({ path: `/options/${optionIndex}/subtitles/style`, keyword: "confirmation", message: "must be none when subtitles are disabled" });
  }
  if (subtitles.enabled === true && subtitles.style === "none") {
    issues.push({ path: `/options/${optionIndex}/subtitles/style`, keyword: "confirmation", message: "must be plain or anchor when subtitles are enabled" });
  }
  if (overlays.length > 0 && (subtitles.enabled !== true || subtitles.style !== "anchor")) {
    issues.push({
      path: `/options/${optionIndex}/edit_execution_plan/text_overlays`,
      keyword: "confirmation",
      message: "requires subtitles.enabled=true with style=anchor",
    });
  }
}

function addDurationTargetIssues(value: unknown, path: string, issues: ArtifactValidationIssue[]): void {
  if (!isRecord(value)) return;
  const min = value.min_seconds;
  const max = value.max_seconds;
  const target = value.target_seconds;
  if (typeof min === "number" && typeof max === "number" && max < min) {
    issues.push({ path: `${path}/max_seconds`, keyword: "range", message: "must be greater than or equal to min_seconds" });
  }
  if (typeof target === "number" && typeof min === "number" && typeof max === "number" && (target < min || target > max)) {
    issues.push({ path: `${path}/target_seconds`, keyword: "range", message: "must be within min_seconds and max_seconds" });
  }
}

function addExecutionTimelineIssues(value: unknown, optionIndex: number, issues: ArtifactValidationIssue[]): void {
  if (!isRecord(value) || !Array.isArray(value.segments)) return;
  const path = `/options/${optionIndex}/edit_execution_plan/timeline`;
  const segments = value.segments.filter(isRecord);
  addDuplicateIssues(segments.map((segment) => segment.id), `${path}/segments`, "id", issues);
  addRangeIssues(value.segments, `${path}/segments`, issues);
  if (value.mode === "candidate_cleanup" && value.segments.length > 0) {
    issues.push({ path: `${path}/segments`, keyword: "mode", message: "must be empty when mode is candidate_cleanup" });
  }
  if (value.mode === "explicit_segments" && value.segments.length === 0) {
    issues.push({ path: `${path}/segments`, keyword: "minItems", message: "must contain at least one segment when mode is explicit_segments" });
  }
  const bySource = new Map<string, Array<{ start: number; end: number; index: number }>>();
  segments.forEach((segment, index) => {
    if (typeof segment.source_id !== "string" || typeof segment.start !== "number" || typeof segment.end !== "number") return;
    const ranges = bySource.get(segment.source_id) ?? [];
    ranges.push({ start: segment.start, end: segment.end, index });
    bySource.set(segment.source_id, ranges);
  });
  for (const ranges of bySource.values()) {
    const sorted = [...ranges].sort((left, right) => left.start - right.start);
    for (let index = 1; index < sorted.length; index += 1) {
      if (sorted[index]!.start < sorted[index - 1]!.end) {
        issues.push({ path: `${path}/segments/${sorted[index]!.index}/start`, keyword: "overlap", message: "must not overlap another segment from the same source" });
      }
    }
  }
}

function addTextOverlayIssues(timelineValue: unknown, overlaysValue: unknown, optionIndex: number, issues: ArtifactValidationIssue[]): void {
  if (!isRecord(timelineValue) || !Array.isArray(timelineValue.segments) || !Array.isArray(overlaysValue)) return;
  const path = `/options/${optionIndex}/edit_execution_plan/text_overlays`;
  const segments = timelineValue.segments.filter(isRecord);
  const segmentById = new Map(segments.map((segment) => [segment.id, segment]));
  const overlays = overlaysValue.filter(isRecord);
  addDuplicateIssues(overlays.map((overlay) => overlay.id), path, "id", issues);
  overlays.forEach((overlay, index) => {
    if (timelineValue.mode === "candidate_cleanup" && overlay.segment_id !== undefined) {
      issues.push({ path: `${path}/${index}/segment_id`, keyword: "mode", message: "is not allowed when timeline.mode is candidate_cleanup" });
      return;
    }
    if (timelineValue.mode !== "explicit_segments") return;
    if (typeof overlay.segment_id !== "string") {
      issues.push({ path: `${path}/${index}/segment_id`, keyword: "required", message: "segment_id is required for explicit_segments" });
      return;
    }
    const segment = segmentById.get(overlay.segment_id);
    if (!segment) {
      issues.push({ path: `${path}/${index}/segment_id`, keyword: "reference", message: "must match timeline.segments[].id" });
      return;
    }
    if (overlay.source_id !== segment.source_id) {
      issues.push({ path: `${path}/${index}/source_id`, keyword: "reference", message: "must match the referenced timeline segment source_id" });
    }
    if (typeof overlay.start === "number" && typeof overlay.end === "number" && typeof segment.start === "number" && typeof segment.end === "number"
      && (overlay.start < segment.start || overlay.end > segment.end)) {
      issues.push({ path: `${path}/${index}`, keyword: "containment", message: "must be contained by the referenced timeline segment" });
    }
  });
}

function addMediaRequirementIssues(option: Record<string, unknown>, requirements: Record<string, unknown>, optionIndex: number, issues: ArtifactValidationIssue[]): void {
  const requiredCount = (key: string) => Array.isArray(requirements[key])
    ? requirements[key].filter((slot) => isRecord(slot) && slot.required === true).length
    : 0;
  const music = isRecord(option.music) ? option.music : {};
  const sfx = isRecord(option.sfx) ? option.sfx : {};
  const images = isRecord(option.images) ? option.images : {};
  if (music.source !== "none" && requiredCount("music_slots") === 0) {
    issues.push({ path: `/options/${optionIndex}/asset_requirements/music_slots`, keyword: "requiredSlot", message: "must contain a required slot when music is enabled" });
  }
  if (music.source === "none" && Array.isArray(requirements.music_slots) && requirements.music_slots.length > 0) {
    issues.push({ path: `/options/${optionIndex}/asset_requirements/music_slots`, keyword: "confirmation", message: "must be empty when music.source is none" });
  }
  if (sfx.enabled === true && requiredCount("sfx_slots") === 0) {
    issues.push({ path: `/options/${optionIndex}/asset_requirements/sfx_slots`, keyword: "requiredSlot", message: "must contain a required slot when SFX is enabled" });
  }
  if (sfx.enabled === false && Array.isArray(requirements.sfx_slots) && requirements.sfx_slots.length > 0) {
    issues.push({ path: `/options/${optionIndex}/asset_requirements/sfx_slots`, keyword: "confirmation", message: "must be empty when SFX is disabled" });
  }
  if (images.needed === true && requiredCount("image_slots") === 0) {
    issues.push({ path: `/options/${optionIndex}/asset_requirements/image_slots`, keyword: "requiredSlot", message: "must contain a required slot when images are needed" });
  }
  if (images.needed === false && Array.isArray(requirements.image_slots) && requirements.image_slots.length > 0) {
    issues.push({ path: `/options/${optionIndex}/asset_requirements/image_slots`, keyword: "confirmation", message: "must be empty when images.needed is false" });
  }
}

function addSourceFrameRequestSemanticIssues(value: unknown, issues: ArtifactValidationIssue[]): void {
  if (!isRecord(value) || !Array.isArray(value.frames)) return;
  const frames = value.frames.filter(isRecord);
  addDuplicateIssues(frames.map((frame) => frame.id), "/frames", "id", issues);
}

function addVisualCandidatesSemanticIssues(value: unknown, issues: ArtifactValidationIssue[]): void {
  if (!isRecord(value) || !Array.isArray(value.candidates)) return;
  const candidates = value.candidates.filter(isRecord);
  addDuplicateIssues(candidates.map((candidate) => candidate.id), "/candidates", "id", issues);
}

function addRangeIssues(value: unknown, path: string, issues: ArtifactValidationIssue[]): void {
  if (!Array.isArray(value)) return;
  value.forEach((item, index) => {
    if (!isRecord(item) || typeof item.start !== "number" || typeof item.end !== "number") return;
    if (item.end <= item.start) issues.push({ path: `${path}/${index}/end`, keyword: "range", message: "must be greater than start" });
  });
}

function addDuplicateIssues(values: unknown[], path: string, key: string, issues: ArtifactValidationIssue[]): void {
  const seen = new Set<unknown>();
  values.forEach((value, index) => {
    if (value === undefined || !seen.has(value)) seen.add(value);
    else issues.push({ path: `${path}/${index}/${key}`, keyword: "unique", message: `duplicate ${key}: ${String(value)}` });
  });
}

function validateJsonSchema(value: unknown, schema: JsonSchema, path: string, root: JsonSchema, issues: ArtifactValidationIssue[]): void {
  if (issues.length >= 100) return;
  if (typeof schema.$ref === "string") {
    const resolved = resolveRef(root, schema.$ref);
    if (resolved) validateJsonSchema(value, resolved, path, root, issues);
    return;
  }
  if ("const" in schema && value !== schema.const) issues.push({ path, keyword: "const", message: `must equal ${JSON.stringify(schema.const)}` });
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) issues.push({ path, keyword: "enum", message: `must be one of ${schema.enum.map(String).join(", ")}` });
  if (!matchesType(value, schema.type)) {
    issues.push({ path, keyword: "type", message: `must be ${Array.isArray(schema.type) ? schema.type.join(" or ") : String(schema.type)}` });
    return;
  }
  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) issues.push({ path, keyword: "minLength", message: `must contain at least ${schema.minLength} character` });
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) issues.push({ path, keyword: "pattern", message: "contains characters that are not allowed" });
  }
  if (typeof value === "number" && typeof schema.minimum === "number" && value < schema.minimum) issues.push({ path, keyword: "minimum", message: `must be >= ${schema.minimum}` });
  if (typeof value === "number" && typeof schema.maximum === "number" && value > schema.maximum) issues.push({ path, keyword: "maximum", message: `must be <= ${schema.maximum}` });
  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) issues.push({ path, keyword: "minItems", message: `must contain at least ${schema.minItems} items` });
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) issues.push({ path, keyword: "maxItems", message: `must contain at most ${schema.maxItems} items` });
    if (isRecord(schema.items)) value.forEach((item, index) => validateJsonSchema(item, schema.items as JsonSchema, `${path}/${index}`, root, issues));
  }
  if (isRecord(value)) {
    const properties = isRecord(schema.properties) ? (schema.properties as Record<string, JsonSchema>) : {};
    const required = Array.isArray(schema.required) ? schema.required.filter((key): key is string => typeof key === "string") : [];
    for (const key of required) if (!(key in value) || value[key] === undefined) issues.push({ path: pointer(path, key), keyword: "required", message: `${key} is required` });
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) if (value[key] !== undefined && !(key in properties)) issues.push({ path: pointer(path, key), keyword: "additionalProperties", message: `${key} is not allowed` });
    } else if (isRecord(schema.additionalProperties)) {
      for (const [key, childValue] of Object.entries(value)) {
        if (!(key in properties)) validateJsonSchema(childValue, schema.additionalProperties as JsonSchema, pointer(path, key), root, issues);
      }
    }
    for (const [key, childSchema] of Object.entries(properties)) {
      if (key in value && value[key] !== undefined) validateJsonSchema(value[key], childSchema, pointer(path, key), root, issues);
    }
  }
}

function contractVersionField(schema: JsonSchema): { field: "version" | "contract_version"; expected: unknown } | undefined {
  const properties = isRecord(schema.properties) ? schema.properties : undefined;
  if (!properties) return undefined;
  for (const field of ["version", "contract_version"] as const) {
    const fieldSchema = properties[field];
    if (isRecord(fieldSchema) && "const" in fieldSchema) return { field, expected: fieldSchema.const };
  }
  return undefined;
}

function unsupportedArtifactContract(artifactId: string): Error & { code: "ARTIFACT_CONTRACT_UNSUPPORTED" } {
  const error = new Error(`artifact contract is unavailable: ${artifactId}`) as Error & { code: "ARTIFACT_CONTRACT_UNSUPPORTED" };
  error.code = "ARTIFACT_CONTRACT_UNSUPPORTED";
  return error;
}

function resolveRef(root: JsonSchema, ref: string): JsonSchema | undefined {
  if (!ref.startsWith("#/")) return undefined;
  let value: unknown = root;
  for (const part of ref.slice(2).split("/")) {
    if (!isRecord(value)) return undefined;
    value = value[part.replaceAll("~1", "/").replaceAll("~0", "~")];
  }
  return isRecord(value) ? value : undefined;
}

function matchesType(value: unknown, type: unknown): boolean {
  if (type === undefined) return true;
  const types = Array.isArray(type) ? type : [type];
  return types.some((candidate) =>
    candidate === "null" ? value === null
      : candidate === "array" ? Array.isArray(value)
        : candidate === "object" ? isRecord(value)
          : candidate === "number" ? typeof value === "number" && Number.isFinite(value)
            : candidate === "integer" ? typeof value === "number" && Number.isSafeInteger(value)
            : typeof value === candidate,
  );
}

function pointer(path: string, key: string): string {
  return `${path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sortIssues(issues: ArtifactValidationIssue[]): ArtifactValidationIssue[] {
  const compare = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
  return [...issues].sort((left, right) => compare(left.path, right.path) || compare(left.keyword, right.keyword) || compare(left.message, right.message));
}

function digest(value: unknown): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
