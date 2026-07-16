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
  role: "authoritative_input" | "command_request" | "derived" | "execution_result";
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
  readonly schema_version = "2.0";
  readonly schema_digest: string;

  constructor(actualVersion: unknown, schemaDigest: string) {
    super(`production-proposal.json version ${JSON.stringify(actualVersion)} is unsupported; expected "2.0"`);
    this.artifact = "production-proposal.json";
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
  $id: "https://koubo-clip.dev/schema/production-proposal/2.0",
  title: "Koubo Clip Production Proposal",
  ...closed(
    ["version", "source_mode", "presentation_intent", "goal_summary", "material_summary", "recommended_option_id", "options"],
    {
      version: { const: "2.0" },
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
          style: { type: "string", minLength: 1 },
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
        business_direction: closed(["title", "suitable_for", "editing_strategy", "expected_duration", "asset_style", "risks"], {
          title: { type: "string", minLength: 1 },
          suitable_for: { type: "string", minLength: 1 },
          editing_strategy: { type: "string", minLength: 1 },
          expected_duration: { type: "string", minLength: 1 },
          asset_style: { type: "string", minLength: 1 },
          risks: stringArray,
          tradeoffs: stringArray,
        }),
        edit_execution_plan: closed(
          [
            "objective",
            "target_audience",
            "final_duration",
            "narrative_structure",
            "keep_segments",
            "remove_segments",
            "reorder_segments",
            "text_overlays",
            "user_confirmation_summary",
          ],
          {
            objective: { type: "string", minLength: 1 },
            target_audience: { type: "string", minLength: 1 },
            final_duration: { type: "string", minLength: 1 },
            narrative_structure: { type: "array", items: { $ref: "#/$defs/narrativeBeat" } },
            keep_segments: { type: "array", items: { $ref: "#/$defs/keepSegment" } },
            remove_segments: { type: "array", items: { $ref: "#/$defs/removeSegment" } },
            reorder_segments: { type: "array", items: { $ref: "#/$defs/reorderSegment" } },
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
    keepSegment: closed(["source_id", "start", "end", "reason"], {
      source_id: { type: "string", minLength: 1, pattern: "^[^/:\\\\]+$" },
      start: { type: "number", minimum: 0 },
      end: { type: "number", minimum: 0 },
      reason: { type: "string", minLength: 1 },
    }),
    removeSegment: closed(["candidate_id", "reason"], {
      candidate_id: { type: "string", minLength: 1, pattern: "^[^/:\\\\]+$" },
      reason: { type: "string", minLength: 1 },
    }),
    reorderSegment: closed(["from", "to", "reason"], {
      from: { type: "string", minLength: 1 },
      to: { type: "string", minLength: 1 },
      reason: { type: "string", minLength: 1 },
    }),
    textOverlay: closed(["start", "end", "text", "purpose"], {
      start: { type: "number", minimum: 0 },
      end: { type: "number", minimum: 0 },
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
  subtitles: { enabled: true, style: "", conflict_notes: [] },
  visuals: { direction: "", viewer_job: "", requires_grounding: false, notes: [] },
  images: { needed: false, reason: "", missing_assets: [] },
  music: { source: "none", ducking: true, notes: [] },
  sfx: { enabled: false, usage: "", restraint: "" },
  requires_confirmation: [],
  business_direction: { title: "", suitable_for: "", editing_strategy: "", expected_duration: "", asset_style: "", risks: [] },
  edit_execution_plan: {
    objective: "",
    target_audience: "",
    final_duration: "",
    narrative_structure: [],
    keep_segments: [],
    remove_segments: [],
    reorder_segments: [],
    text_overlays: [],
    user_confirmation_summary: "",
  },
  asset_requirements: { visual_asset_slots: [], music_slots: [], sfx_slots: [], image_slots: [] },
});

export const productionProposalTemplate = {
  version: "2.0",
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
    expected_duration: "30-45 seconds",
    asset_style: enhanced ? "Minimal transparent UI cues." : "Source-first with readable subtitles.",
    risks: [],
  },
  edit_execution_plan: {
    objective: enhanced ? "Explain the payoff quickly and credibly." : "Improve pacing without changing the message.",
    target_audience: "Viewers evaluating the demonstrated product.",
    final_duration: "30-45 seconds",
    narrative_structure: [{ beat: "proof", purpose: "Show the strongest source evidence.", source_hint: "Use the clearest retained segment." }],
    keep_segments: [],
    remove_segments: cutCandidateIds.map((candidate_id) => ({ candidate_id, reason: "Confirmed cleanup candidate." })),
    reorder_segments: [],
    text_overlays: [],
    user_confirmation_summary: enhanced ? "Clean the pauses and add restrained focus cues." : "Clean the pauses and keep the source presentation.",
  },
  asset_requirements: { visual_asset_slots: [], music_slots: [], sfx_slots: [], image_slots: [] },
});

export const productionProposalExample = {
  version: "2.0",
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
  schema_version: "2.0",
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
const number = { type: "number", minimum: 0 } satisfies JsonSchema;
const range = closed(["start", "end"], { start: number, end: number });
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
      source_mode: { enum: ["talking_head_avatar", "screen_recording", "mixed"] }, aspect_ratio: { enum: ["source", "16:9", "9:16", "4:5"] },
      caption_identity: { const: "anchor" }, layout: { enum: ["stack", "overlay", "split", "pip"] },
      style: { enum: ["whiteboard", "audit", "swiss", "terminal", "xhs", "editorial", "minimal"] }, frame: { enum: ["clean", "hairline", "polaroid"] },
    }),
    elements: { type: "array", items: closed(["id", "source", "element_id", "element_type", "start", "end", "reason"], {
      id, source: { type: "string", minLength: 1 }, element_id: id,
      element_type: { enum: ["registry_block", "registry_component", "animation_rule", "caption_identity", "visual_asset"] },
      start: number, end: number, reason: { type: "string", minLength: 1 }, zone: { enum: ["full_frame", "upper_third", "lower_third", "left_panel", "right_panel", "center"] },
      target_rect: { type: "object" }, anchor_point: { type: "object" }, params: { type: "object" }, asset_id: id, caption_identity: { const: "anchor" },
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
const writable = (artifact_id: string, filename: string, schema_version: string, schema: JsonSchema, template: unknown, validator: string, prerequisites: string[] = []): ArtifactContract => finalize({
  artifact_id, filename, schema_version, ownership: "agent_authored", role: "authoritative_input", external_writes_allowed: true,
  validator, prerequisites, schema, template, template_requires_filling: true,
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
  decisions: { type: "array", items: closed(["action"], { action: { enum: ["cut", "keep", "skip"] }, candidate_id: id, source_id: id, reason: { type: "string" } }) },
  source_order: { type: "array", items: id },
}) };
const assetUsageSchema = { $schema: "https://json-schema.org/draft/2020-12/schema", ...closed(["music", "sfx", "visual_assets"], {
  music: { type: "array", items: { type: "object" } }, sfx: { type: "array", items: { type: "object" } }, visual_assets: { type: "array", items: { type: "object" } },
}) };
const sourceMapSchema = { $schema: "https://json-schema.org/draft/2020-12/schema", type: "object", additionalProperties: { type: "string", minLength: 1 } };
const versionedRequest = (version: string, required: string[], properties: Record<string, JsonSchema>) => ({ $schema: "https://json-schema.org/draft/2020-12/schema", ...closed(["version", ...required], { version: { const: version }, ...properties }) });

const discoveredContracts: ArtifactContract[] = [
  productionProposalContract,
  writable("source-manifest", "sources.json", "2.0", sourceManifestSchema, { contract_version: "2.0", sources: [] }, "project create --source-manifest"),
  writable("transcript", "transcript.json", "1.0", transcriptSchema, { timing_granularity: "segment", segments: [] }, "project explore", ["sources"]),
  writable("edit-plan", "edit-plan.json", "1.0", editPlanSchema, { contract_version: "1.0", confirmed_option_id: "", proposal_selection_fingerprint: "", decisions: [] }, "project compile-edl", ["production-proposal"]),
  writable("enrichment-plan", "enrichment-plan.json", "2.0", enrichmentPlanSchema, { version: "2.0", profile: { source_mode: "talking_head_avatar", aspect_ratio: "source", caption_identity: "anchor", layout: "stack", style: "minimal", frame: "clean" }, elements: [], audio: { music: [], sfx: [] } }, "project enrich-plan", ["edl"]),
  writable("asset-usage-plan", "asset-usage-plan.json", "1.0", assetUsageSchema, { music: [], sfx: [], visual_assets: [] }, "project enrich-plan", ["edl"]),
  writable("source-frame-request", "source-frame-request.json", "1.0", versionedRequest("1.0", ["frames"], { frames: { type: "array", minItems: 1, maxItems: 20, items: { type: "object" } } }), { version: "1.0", frames: [] }, "project source-frames", ["sources"]),
  writable("focus-candidates", "focus-candidates.json", "1.0", versionedRequest("1.0", ["source_mode", "presentation_intent", "candidates"], { source_mode: { enum: ["talking_head_avatar", "screen_recording", "mixed"] }, presentation_intent: { type: "string" }, candidates: { type: "array", items: { type: "object" } } }), { version: "1.0", source_mode: "talking_head_avatar", presentation_intent: "knowledge_explainer", candidates: [] }, "project focus-candidates", ["edl"]),
  writable("focus-grounding", "focus-grounding.json", "1.0", versionedRequest("1.0", ["groundings"], { groundings: { type: "array", items: { type: "object" } } }), { version: "1.0", groundings: [] }, "project focus-grounding", ["focus-frames"]),
  writable("music-request", "music-request.json", "1.0", versionedRequest("1.0", ["id", "source", "reason"], { id, source: { enum: ["none", "local", "minimax", "freesound", "pixabay"] }, reason: { type: "string", minLength: 1 } }), { version: "1.0", id: "", source: "none", reason: "" }, "project music-acquire"),
  writable("visual-request", "visual-request.json", "1.0", versionedRequest("1.0", ["source_mode", "presentation_intent", "requests"], { source_mode: { type: "string" }, presentation_intent: { type: "string" }, requests: { type: "array", items: { type: "object" } } }), { version: "1.0", source_mode: "talking_head_avatar", presentation_intent: "knowledge_explainer", requests: [] }, "project visual-acquire"),
  writable("evidence-import-manifest", "manifest.json", "1.0", versionedRequest("1.0", ["entries"], { entries: { type: "array", minItems: 1, items: { type: "object" } } }), { version: "1.0", entries: [] }, "project source-frames/focus-frames --import"),
  writable("source-map", "source-map.json", "1.0", sourceMapSchema, {}, "render-contract bind"),
  ...[
    ["project", "project.json", "1.0", "project create"], ["source-materialization", "source-materialization.json", "1.0", "project create"],
    ["analysis", "analysis.json", "1.0", "project explore"], ["review-package", "review-package.json", "1.0", "project review"],
    ["edl", "edl.json", "2.0", "project compile-edl"], ["source-frames", "source-frames.json", "1.0", "project source-frames"],
    ["focus-frames", "focus-frames.json", "1.0", "project focus-frames"], ["focus-review", "focus-review.json", "1.0", "project focus-review"],
    ["music-acquisition", "music-acquisition.json", "1.0", "project music-acquire"], ["music-review", "music-review.json", "1.0", "project music-review"],
    ["visual-candidates", "visual-candidates.json", "1.0", "project visual-search"], ["visual-acquisition", "visual-acquisition.json", "1.0", "project visual-acquire"],
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

export function assertProductionProposalContract(value: unknown): void {
  if (isRecord(value) && value.version !== "2.0") throw new ContractSchemaUnsupportedError(value.version, proposalSchemaDigest);
  const issues: ArtifactValidationIssue[] = [];
  validateJsonSchema(value, productionProposalSchema, "", productionProposalSchema, issues);
  addProposalSemanticIssues(value, issues);
  if (issues.length) throw new ArtifactValidationError("production-proposal.json", "2.0", proposalSchemaDigest, issues);
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
    addRangeIssues(execution.keep_segments, `/options/${optionIndex}/edit_execution_plan/keep_segments`, issues);
    addRangeIssues(execution.text_overlays, `/options/${optionIndex}/edit_execution_plan/text_overlays`, issues);
    const requirements = isRecord(option.asset_requirements) ? option.asset_requirements : {};
    for (const key of ["visual_asset_slots", "music_slots", "sfx_slots", "image_slots"] as const) {
      const slots = Array.isArray(requirements[key]) ? requirements[key].filter(isRecord) : [];
      addDuplicateIssues(slots.map((slot) => slot.slot_id), `/options/${optionIndex}/asset_requirements/${key}`, "slot_id", issues);
    }
  });
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
    }
    for (const [key, childSchema] of Object.entries(properties)) {
      if (key in value && value[key] !== undefined) validateJsonSchema(value[key], childSchema, pointer(path, key), root, issues);
    }
  }
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
