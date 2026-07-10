import { assertRenderableHyperframesBlockForCard } from "./hyperframes-catalog";
import { assertKnownVendoredElement, type VendoredElementType } from "./hyperframes-registry";

export type TimingGranularity = "word" | "segment" | "text-only";

export type SourceAsset = {
  source_id: string;
  order: number;
  original_filename: string;
  project_path: string;
  duration_seconds: number;
  probe?: Record<string, unknown>;
};

export type SourcesManifest = {
  sources: SourceAsset[];
};

export type TimedTextRange = {
  source_id: string;
  start: number;
  end: number;
  text: string;
};

export type TranscriptArtifact = {
  timing_granularity: TimingGranularity;
  segments: TimedTextRange[];
  provider?: string;
  language?: string;
  timing_validated?: boolean;
};

export type AnalysisCandidate = TimedTextRange & {
  id: string;
  type: string;
  reason: string;
  confidence: number;
};

export type AnalysisArtifact = {
  candidates: AnalysisCandidate[];
};

export type ReviewPackageArtifact = {
  original_ranges: TimedTextRange[];
  proposed_cuts: AnalysisCandidate[];
  unresolved_risks: string[];
};

export type EditDecision = {
  action: "cut" | "keep" | "skip";
  candidate_id?: string;
  source_id?: string;
  reason?: string;
};

export type EditPlanArtifact = {
  decisions: EditDecision[];
  source_order?: string[];
};

export type EdlEntry = {
  source_id: string;
  source_path: string;
  start: number;
  end: number;
  output_order: number;
  reason: string;
  quote?: string;
  label?: string;
};

export type EdlArtifact = {
  entries: EdlEntry[];
};

export type EnrichmentPosition = "full_frame" | "upper_third" | "lower_third" | "left_panel" | "right_panel" | "center";
export type EnrichmentSlotType = "title_card" | "keyword_callout" | "key_point_card" | "image_overlay" | "music_segment";
export type EnrichmentSourceMode = "talking_head_avatar" | "screen_recording" | "mixed";
export type EnrichmentAspectRatio = "source" | "16:9" | "9:16" | "4:5";
export type EnrichmentCaptionIdentity = "anchor";
export type EnrichmentLayout = "stack" | "overlay" | "split" | "pip";
export type EnrichmentStyle = "whiteboard" | "audit" | "swiss" | "terminal" | "xhs" | "editorial" | "minimal";
export type EnrichmentFrame = "clean" | "hairline" | "polaroid";
export type EnrichmentCardKind = "title" | "key_point" | "quote" | "flowchart" | "image" | "screenshot_focus" | "lower_third";
export type EnrichmentPoint = { x: number; y: number };
export type EnrichmentRect = { x: number; y: number; width: number; height: number };
export type EnrichmentElementType = VendoredElementType | "visual_asset";
export type EnrichmentElementParams = Record<string, string | number | boolean | null>;
export type FocusPresentationIntent = "internal_tutorial" | "product_demo" | "course_lesson" | "knowledge_explainer" | "short_form";
export type FocusSemanticIntent = "orient_viewer" | "guide_attention" | "explain_sequence" | "summarize_payoff" | "pacing_relief";
export type FocusRecommendedTreatment = "source_ui_component" | "generated_asset" | "text_or_caption" | "sfx_or_music" | "none";
export type FocusReviewStatus = "ready" | "needs_grounding" | "warning" | "invalid";
export type MusicRequestSource = "none" | "local" | "minimax" | "freesound" | "pixabay";
export type VisualAssetType = "icon" | "animated_icon" | "lottie" | "ui_component" | "template" | "sticker" | "broll" | "image";
export type VisualProvider = "iconify" | "lordicon" | "lottie" | "shadcn" | "21st" | "mcp-handoff" | "local" | "url";
export type VisualRequestStatus = "candidate" | "selected" | "rejected";
export type ProviderExecutionMode = "standalone" | "platform";

export type ProjectMetadataArtifact = {
  provider_execution_mode: ProviderExecutionMode;
  created_at?: string;
  updated_at?: string;
};

export type EnrichmentSlot = {
  id: string;
  type: EnrichmentSlotType;
  start: number;
  end: number;
  reason: string;
  text?: string;
  asset_id?: string;
  position?: EnrichmentPosition;
  volume?: number;
  fade_seconds?: number;
  ducking?: boolean;
};

export type EnrichmentProfile = {
  source_mode: EnrichmentSourceMode;
  aspect_ratio: EnrichmentAspectRatio;
  caption_identity: EnrichmentCaptionIdentity;
  layout: EnrichmentLayout;
  style: EnrichmentStyle;
  frame: EnrichmentFrame;
};

export type CaptionEmphasis = {
  start: number;
  end: number;
  text: string;
  reason: string;
};

export type EnrichmentCaptions = {
  enabled: boolean;
  identity: EnrichmentCaptionIdentity;
  emphasis: CaptionEmphasis[];
};

export type EnrichmentCard = {
  id: string;
  start: number;
  end: number;
  kind: EnrichmentCardKind;
  block_id?: string;
  visual_intent?: string;
  layout: EnrichmentLayout;
  style: EnrichmentStyle;
  frame: EnrichmentFrame;
  zone: EnrichmentPosition;
  kicker?: string;
  title: string;
  detail?: string;
  asset_id?: string;
  target_rect?: EnrichmentRect;
  anchor_point?: EnrichmentPoint;
  reason: string;
};

export type EnrichmentMusic = {
  id: string;
  type: "music_segment";
  start: number;
  end: number;
  asset_id: string;
  volume: number;
  fade_seconds: number;
  ducking: boolean;
  reason: string;
};

export type EnrichmentElement = {
  id: string;
  source: string;
  element_id: string;
  element_type: EnrichmentElementType;
  start: number;
  end: number;
  reason: string;
  zone?: EnrichmentPosition;
  target_rect?: EnrichmentRect;
  anchor_point?: EnrichmentPoint;
  params?: EnrichmentElementParams;
  asset_id?: string;
  sfx_id?: string;
  caption_identity?: EnrichmentCaptionIdentity;
};

export type FocusCandidate = {
  id: string;
  start: number;
  end: number;
  transcript_quote: string;
  semantic_intent: FocusSemanticIntent;
  business_role?: string;
  viewer_job?: string;
  visual_gap?: string;
  recommended_treatment?: FocusRecommendedTreatment;
  element_id: string;
  element_type: EnrichmentElementType;
  requires_grounding: boolean;
  asset_id?: string;
  sfx_id?: string;
  reason: string;
  params?: EnrichmentElementParams;
};

export type FocusCandidatesArtifact = {
  version: "1.0";
  source_mode: EnrichmentSourceMode;
  presentation_intent: FocusPresentationIntent;
  candidates: FocusCandidate[];
};

export type SourceFrameRequestItem = {
  id: string;
  source_id: string;
  time_seconds: number;
  segment_id?: string;
  transcript_quote: string;
  reason: string;
};

export type SourceFrameRequestArtifact = {
  version: "1.0";
  frames: SourceFrameRequestItem[];
};

export type SourceFrame = SourceFrameRequestItem & {
  index: number;
  path: string;
  mime_type: "image/jpeg";
  width: number;
  height: number;
  size_bytes: number;
  sha256: string;
};

export type SourceFramesArtifact = {
  version: "1.0";
  frames: SourceFrame[];
  frame_count: number;
  total_size_bytes: number;
};

export type FocusFrame = {
  id: string;
  candidate_id: string;
  timeline: "source" | "output";
  time_seconds: number;
  path: string;
  source_id?: string;
  width?: number;
  height?: number;
};

export type FocusFramesArtifact = {
  version: "1.0";
  frames: FocusFrame[];
};

export type FocusGrounding = {
  candidate_id: string;
  frame_id: string;
  confidence: number;
  evidence_note: string;
  target_rect?: EnrichmentRect;
  anchor_point?: EnrichmentPoint;
  params?: EnrichmentElementParams;
};

export type FocusGroundingArtifact = {
  version: "1.0";
  groundings: FocusGrounding[];
};

export type FocusReviewItem = {
  candidate_id: string;
  status: FocusReviewStatus;
  frame_paths: string[];
  warnings: string[];
  grounding?: FocusGrounding;
  proposed_element?: EnrichmentElement;
};

export type FocusReviewArtifact = {
  version: "1.0";
  items: FocusReviewItem[];
  proposed_elements: EnrichmentElement[];
  warnings: string[];
};

export type AssetManifestSource = "user" | "agent_generated" | "imported" | "bundled" | "derived";
export type AssetManifestDimensions = { width: number; height: number };

export type EnrichmentPlanArtifact = {
  version: string;
  profile: EnrichmentProfile;
  captions: EnrichmentCaptions;
  cards: EnrichmentCard[];
  music: EnrichmentMusic[];
  elements: EnrichmentElement[];
  slots: EnrichmentSlot[];
};

export type AssetManifestEntry = {
  id: string;
  path: string;
  type?: "image" | "music" | "video" | "sfx" | VisualAssetType;
  source?: AssetManifestSource;
  provenance?: string;
  provider?: string;
  model?: string;
  prompt?: string;
  query?: string;
  license?: string;
  license_url?: string;
  source_url?: string;
  original_url?: string;
  original_author?: string;
  acquired_at?: string;
  cost_usd?: number;
  reason?: string;
  used_by?: string[];
  runtime_dependencies?: string[];
  duration_seconds?: number;
  dimensions?: AssetManifestDimensions;
  hash?: string;
  mood?: string;
  loop?: boolean;
  volume?: number;
  fade_seconds?: number;
  ducking?: boolean;
};

export type AssetManifestArtifact = {
  assets: AssetManifestEntry[];
};

export type MusicRequestArtifact = {
  version: "1.0";
  id: string;
  source: MusicRequestSource;
  reason: string;
  source_mode?: EnrichmentSourceMode;
  presentation_intent?: FocusPresentationIntent;
  mood?: string;
  target_duration_seconds?: number;
  local_path?: string;
  library_track?: string;
  prompt?: string;
  query?: string;
  model?: string;
  volume?: number;
  fade_seconds?: number;
  ducking?: boolean;
  min_duration_seconds?: number;
  max_duration_seconds?: number;
};

export type VisualRequestItem = {
  id: string;
  viewer_job: string;
  semantic_query: string;
  asset_type: VisualAssetType;
  preferred_sources: VisualProvider[];
  reason: string;
  output_usage?: string;
  selected_candidate_id?: string;
  start?: number;
  end?: number;
  zone?: EnrichmentPosition;
};

export type VisualRequestArtifact = {
  version: "1.0";
  source_mode: EnrichmentSourceMode;
  presentation_intent: FocusPresentationIntent;
  requests: VisualRequestItem[];
};

export type VisualCandidate = {
  id: string;
  request_id: string;
  provider: VisualProvider;
  asset_type: VisualAssetType;
  title: string;
  semantic_query: string;
  preview_url?: string;
  source_url?: string;
  download_url?: string;
  local_path?: string;
  license?: string;
  license_url?: string;
  original_author?: string;
  cost?: string;
  source_risk?: string;
  renderable: boolean;
  recommended: boolean;
  reason: string;
  runtime_dependencies: string[];
};

export type VisualCandidatesArtifact = {
  version: "1.0";
  candidates: VisualCandidate[];
  warnings: string[];
};

export type VisualAcquisitionItem = {
  id: string;
  request_id: string;
  candidate_id: string;
  asset_id: string;
  provider: VisualProvider;
  asset_type: VisualAssetType;
  path: string;
  hash: string;
  source_url?: string;
  license?: string;
  license_url?: string;
  original_author?: string;
  acquired_at: string;
  runtime_dependencies: string[];
  warnings: string[];
};

export type VisualAcquisitionArtifact = {
  version: "1.0";
  assets: VisualAcquisitionItem[];
  warnings: string[];
};

export type VisualReviewItem = {
  asset_id: string;
  request_id: string;
  candidate_id: string;
  provider: VisualProvider;
  asset_type: VisualAssetType;
  path: string;
  source_url?: string;
  license?: string;
  runtime_dependencies: string[];
  usage_reason: string;
  warnings: string[];
};

export type VisualReviewArtifact = {
  version: "1.0";
  items: VisualReviewItem[];
  warnings: string[];
};

export type ProductionProposalCleanup = {
  cut_candidate_ids: string[];
  keep_strategy: string;
  risks: string[];
};

export type ProductionProposalSubtitles = {
  enabled: boolean;
  style: string;
  conflict_notes: string[];
};

export type ProductionProposalVisuals = {
  direction: string;
  viewer_job: string;
  requires_grounding: boolean;
  notes: string[];
};

export type ProductionProposalImages = {
  needed: boolean;
  reason: string;
  missing_assets: string[];
};

export type ProductionProposalMusic = {
  source: MusicRequestSource;
  mood?: string;
  ducking: boolean;
  notes: string[];
};

export type ProductionProposalSfx = {
  enabled: boolean;
  usage: string;
  restraint: string;
};

export type ProductionProposalOption = {
  id: string;
  label: string;
  recommended: boolean;
  reason: string;
  cleanup: ProductionProposalCleanup;
  subtitles: ProductionProposalSubtitles;
  visuals: ProductionProposalVisuals;
  images: ProductionProposalImages;
  music: ProductionProposalMusic;
  sfx: ProductionProposalSfx;
  requires_confirmation: string[];
};

export type ProductionProposalArtifact = {
  version: "1.0";
  source_mode: EnrichmentSourceMode;
  presentation_intent: FocusPresentationIntent;
  goal_summary: string;
  material_summary: string;
  recommended_option_id: string;
  options: ProductionProposalOption[];
};

export type CommandResult<TCommand extends string, TData> =
  | { ok: true; command: TCommand; data: TData }
  | {
      ok: false;
      command: TCommand;
      error: {
        code: string;
        message: string;
        provider_execution_mode?: ProviderExecutionMode;
        stage?: string;
        artifact?: string;
        remediation?: string;
        request?: Record<string, unknown>;
      };
    };

export const projectArtifacts = {
  project: "project.json",
  sources: "sources.json",
  materialReport: "material-report.md",
  transcriptJson: "transcript.json",
  transcriptMarkdown: "transcript.md",
  analysis: "analysis.json",
  reviewMarkdown: "review-package.md",
  reviewJson: "review-package.json",
  productionProposal: "production-proposal.json",
  productionProposalMarkdown: "production-proposal.md",
  editPlan: "edit-plan.json",
  edl: "edl.json",
  sourceFrameRequest: "source-frame-request.json",
  sourceFrames: "source-frames.json",
  focusCandidates: "focus-candidates.json",
  focusCandidatesMarkdown: "focus-candidates.md",
  focusFrames: "focus-frames.json",
  focusGrounding: "focus-grounding.json",
  focusReview: "focus-review.json",
  focusReviewMarkdown: "focus-review.md",
  musicCatalog: "music-catalog.json",
  musicCatalogMarkdown: "music-catalog.md",
  musicRequest: "music-request.json",
  musicAcquisition: "music-acquisition.json",
  musicReview: "music-review.json",
  musicReviewMarkdown: "music-review.md",
  visualCatalog: "visual-catalog.json",
  visualCatalogMarkdown: "visual-catalog.md",
  visualRequest: "visual-request.json",
  visualCandidates: "visual-candidates.json",
  visualCandidatesMarkdown: "visual-candidates.md",
  visualAcquisition: "visual-acquisition.json",
  visualReview: "visual-review.json",
  visualReviewMarkdown: "visual-review.md",
  enrichmentPlan: "enrichment-plan.json",
  assetManifest: "asset-manifest.json",
  storyboard: "storyboard.json",
  subtitles: "subtitles.srt",
  report: "report.md",
} as const;

export function parseProjectMetadata(value: unknown): ProjectMetadataArtifact {
  const obj = record(value, "project metadata");
  return {
    provider_execution_mode: providerExecutionMode(obj.provider_execution_mode, "provider_execution_mode"),
    created_at: obj.created_at === undefined ? undefined : string(obj.created_at, "created_at"),
    updated_at: obj.updated_at === undefined ? undefined : string(obj.updated_at, "updated_at"),
  };
}

export function parseSourcesManifest(value: unknown): SourcesManifest {
  const obj = record(value, "sources manifest");
  const sources = array(obj.sources, "sources").map((item, index): SourceAsset => {
    const source = record(item, `sources[${index}]`);
    return {
      source_id: string(source.source_id, `sources[${index}].source_id`),
      order: integer(source.order, `sources[${index}].order`),
      original_filename: string(source.original_filename, `sources[${index}].original_filename`),
      project_path: string(source.project_path, `sources[${index}].project_path`),
      duration_seconds: nonNegativeNumber(source.duration_seconds, `sources[${index}].duration_seconds`),
      probe: source.probe === undefined ? undefined : record(source.probe, `sources[${index}].probe`),
    };
  });
  unique(sources.map((source) => source.source_id), "source_id");
  unique(sources.map((source) => String(source.order)), "source order");
  return { sources };
}

export function parseTranscript(value: unknown, manifest?: SourcesManifest): TranscriptArtifact {
  const obj = record(value, "transcript");
  const known = sourceIds(manifest);
  return {
    timing_granularity: timing(obj.timing_granularity),
    provider: obj.provider === undefined ? undefined : string(obj.provider, "provider"),
    language: obj.language === undefined ? undefined : string(obj.language, "language"),
    timing_validated: obj.timing_validated === undefined ? undefined : boolean(obj.timing_validated, "timing_validated"),
    segments: array(obj.segments, "segments").map((item, index) => timedText(item, `segments[${index}]`, known)),
  };
}

export function parseAnalysis(value: unknown, manifest?: SourcesManifest): AnalysisArtifact {
  const known = sourceIds(manifest);
  const obj = record(value, "analysis");
  return {
    candidates: array(obj.candidates, "candidates").map((item, index) => candidate(item, `candidates[${index}]`, known)),
  };
}

export function parseReviewPackage(value: unknown, manifest?: SourcesManifest): ReviewPackageArtifact {
  const known = sourceIds(manifest);
  const obj = record(value, "review package");
  return {
    original_ranges: array(obj.original_ranges, "original_ranges").map((item, index) =>
      timedText(item, `original_ranges[${index}]`, known),
    ),
    proposed_cuts: array(obj.proposed_cuts, "proposed_cuts").map((item, index) =>
      candidate(item, `proposed_cuts[${index}]`, known),
    ),
    unresolved_risks: optionalStringArray(obj.unresolved_risks, "unresolved_risks"),
  };
}

export function parseEditPlan(value: unknown, manifest?: SourcesManifest): EditPlanArtifact {
  const known = sourceIds(manifest);
  const obj = record(value, "edit plan");
  const source_order = obj.source_order === undefined ? undefined : array(obj.source_order, "source_order").map((item, index) => {
    const id = string(item, `source_order[${index}]`);
    requireKnownSource(id, known, `source_order[${index}]`);
    return id;
  });
  if (source_order) {
    unique(source_order, "source_order");
    if (manifest && source_order.length !== manifest.sources.length) throw new Error("source_order must include every source exactly once");
  }
  return {
    decisions: array(obj.decisions, "decisions").map((item, index) => {
      const decision = record(item, `decisions[${index}]`);
      const source_id = decision.source_id === undefined ? undefined : string(decision.source_id, `decisions[${index}].source_id`);
      if (source_id) requireKnownSource(source_id, known, `decisions[${index}].source_id`);
      return {
        action: action(decision.action, `decisions[${index}].action`),
        candidate_id: decision.candidate_id === undefined ? undefined : string(decision.candidate_id, `decisions[${index}].candidate_id`),
        source_id,
        reason: decision.reason === undefined ? undefined : string(decision.reason, `decisions[${index}].reason`),
      };
    }),
    source_order,
  };
}

export function parseEdl(value: unknown, manifest?: SourcesManifest): EdlArtifact {
  const known = sourceIds(manifest);
  const obj = record(value, "edl");
  const entries = array(obj.entries, "entries").map((item, index): EdlEntry => {
    const entry = record(item, `entries[${index}]`);
    const source_id = string(entry.source_id, `entries[${index}].source_id`);
    requireKnownSource(source_id, known, `entries[${index}].source_id`);
    const start = nonNegativeNumber(entry.start, `entries[${index}].start`);
    const end = nonNegativeNumber(entry.end, `entries[${index}].end`);
    if (end <= start) throw new Error(`entries[${index}].end must be greater than start`);
    const source = manifest?.sources.find((item) => item.source_id === source_id);
    if (source && end > source.duration_seconds) throw new Error(`entries[${index}].end exceeds source duration`);
    return {
      source_id,
      source_path: string(entry.source_path, `entries[${index}].source_path`),
      start,
      end,
      output_order: integer(entry.output_order, `entries[${index}].output_order`),
      reason: string(entry.reason, `entries[${index}].reason`),
      quote: entry.quote === undefined ? undefined : string(entry.quote, `entries[${index}].quote`),
      label: entry.label === undefined ? undefined : string(entry.label, `entries[${index}].label`),
    };
  });
  unique(entries.map((entry) => String(entry.output_order)), "output_order");
  rejectOverlaps(entries, "EDL entries");
  return { entries };
}

export function parseEnrichmentPlan(value: unknown): EnrichmentPlanArtifact {
  const obj = record(value, "enrichment plan");
  const version = string(obj.version, "version");
  if (version === "1.0") {
    if (!Array.isArray(obj.slots)) throw new Error('version "1.0" enrichment plans require slots[]');
    return legacyEnrichmentPlan(version, obj.slots);
  }
  if (version !== "1.1" && version !== "1.2") throw new Error('version must be "1.0", "1.1", or "1.2"');
  if (Array.isArray(obj.slots)) throw new Error(`version "${version}" enrichment plans must not include legacy slots[]`);

  const profile = enrichmentProfile(obj.profile, "profile");
  const captions = enrichmentCaptions(obj.captions, "captions");
  const cards = array(obj.cards ?? [], "cards").map((item, index): EnrichmentCard => enrichmentCard(item, `cards[${index}]`, profile));
  const music = array(obj.music ?? [], "music").map((item, index): EnrichmentMusic => enrichmentMusic(item, `music[${index}]`));
  const explicitElements = version === "1.2" ? array(obj.elements ?? [], "elements").map((item, index): EnrichmentElement => enrichmentElement(item, `elements[${index}]`)) : [];
  const elements = explicitElements.length > 0 ? withImplicitCaptionElement(captions, cards, music, explicitElements) : compatibilityElements(profile, captions, cards, music);
  unique([...cards.map((card) => card.id), ...music.map((slot) => slot.id), ...explicitElements.map((element) => element.id)], "enrichment id");
  return { version, profile, captions, cards, music, elements, slots: [] };
}

function legacyEnrichmentPlan(version: string, values: unknown[]): EnrichmentPlanArtifact {
  const slots = values.map((item, index): EnrichmentSlot => enrichmentSlot(item, `slots[${index}]`));
  unique(slots.map((slot) => slot.id), "slot id");
  rejectTimelineOverlaps(slots.filter((slot) => slot.type !== "music_segment"), "enrichment visual slots");
  const profile = defaultEnrichmentProfile();
  const hasVisual = slots.some((slot) => slot.type !== "music_segment");
  const captions: EnrichmentCaptions = { enabled: hasVisual, identity: "anchor", emphasis: [] };
  const cards = slots.filter((slot) => slot.type !== "music_segment").map((slot) => legacySlotCard(slot, profile));
  const music = slots.filter((slot) => slot.type === "music_segment").map(legacySlotMusic);
  return {
    version,
    profile,
    captions,
    cards,
    music,
    elements: compatibilityElements(profile, captions, cards, music),
    slots,
  };
}

export function parseAssetManifest(value: unknown): AssetManifestArtifact {
  const obj = record(value, "asset manifest");
  const assets = array(obj.assets, "assets").map((item, index): AssetManifestEntry => {
    const asset = record(item, `assets[${index}]`);
    return {
      id: string(asset.id, `assets[${index}].id`),
      path: safeRelativePath(string(asset.path, `assets[${index}].path`), `assets[${index}].path`),
      type: asset.type === undefined ? undefined : assetType(asset.type, `assets[${index}].type`),
      source: asset.source === undefined ? undefined : assetSource(asset.source, `assets[${index}].source`),
      provenance: asset.provenance === undefined ? undefined : string(asset.provenance, `assets[${index}].provenance`),
      provider: asset.provider === undefined ? undefined : string(asset.provider, `assets[${index}].provider`),
      model: asset.model === undefined ? undefined : string(asset.model, `assets[${index}].model`),
      prompt: asset.prompt === undefined ? undefined : string(asset.prompt, `assets[${index}].prompt`),
      query: asset.query === undefined ? undefined : string(asset.query, `assets[${index}].query`),
      license: asset.license === undefined ? undefined : string(asset.license, `assets[${index}].license`),
      license_url: asset.license_url === undefined ? undefined : string(asset.license_url, `assets[${index}].license_url`),
      source_url: asset.source_url === undefined ? undefined : urlString(asset.source_url, `assets[${index}].source_url`),
      original_url: asset.original_url === undefined ? undefined : string(asset.original_url, `assets[${index}].original_url`),
      original_author: asset.original_author === undefined ? undefined : string(asset.original_author, `assets[${index}].original_author`),
      acquired_at: asset.acquired_at === undefined ? undefined : string(asset.acquired_at, `assets[${index}].acquired_at`),
      cost_usd: asset.cost_usd === undefined ? undefined : nonNegativeNumber(asset.cost_usd, `assets[${index}].cost_usd`),
      reason: asset.reason === undefined ? undefined : string(asset.reason, `assets[${index}].reason`),
      used_by: asset.used_by === undefined ? undefined : optionalStringArray(asset.used_by, `assets[${index}].used_by`),
      runtime_dependencies: asset.runtime_dependencies === undefined ? undefined : optionalStringArray(asset.runtime_dependencies, `assets[${index}].runtime_dependencies`),
      duration_seconds: asset.duration_seconds === undefined ? undefined : nonNegativeNumber(asset.duration_seconds, `assets[${index}].duration_seconds`),
      dimensions: asset.dimensions === undefined ? undefined : dimensions(asset.dimensions, `assets[${index}].dimensions`),
      hash: asset.hash === undefined ? undefined : string(asset.hash, `assets[${index}].hash`),
      mood: asset.mood === undefined ? undefined : string(asset.mood, `assets[${index}].mood`),
      loop: asset.loop === undefined ? undefined : boolean(asset.loop, `assets[${index}].loop`),
      volume: asset.volume === undefined ? undefined : bounded(asset.volume, `assets[${index}].volume`, 0, 1),
      fade_seconds: asset.fade_seconds === undefined ? undefined : nonNegativeNumber(asset.fade_seconds, `assets[${index}].fade_seconds`),
      ducking: asset.ducking === undefined ? undefined : boolean(asset.ducking, `assets[${index}].ducking`),
    };
  });
  unique(assets.map((asset) => asset.id), "asset id");
  return { assets };
}

export function parseProductionProposal(value: unknown): ProductionProposalArtifact {
  const obj = record(value, "production proposal");
  const version = string(obj.version, "version");
  if (version !== "1.0") throw new Error('production proposal version must be "1.0"');
  const options = array(obj.options, "options").map((item, index): ProductionProposalOption => productionProposalOption(item, `options[${index}]`));
  if (options.length === 0) throw new Error("options must include at least one option");
  unique(options.map((option) => option.id), "production proposal option id");
  const recommendedOptionId = string(obj.recommended_option_id, "recommended_option_id");
  if (!options.some((option) => option.id === recommendedOptionId)) throw new Error("recommended_option_id must match an option id");
  return {
    version,
    source_mode: sourceMode(obj.source_mode, "source_mode"),
    presentation_intent: focusPresentationIntent(obj.presentation_intent, "presentation_intent"),
    goal_summary: string(obj.goal_summary, "goal_summary"),
    material_summary: string(obj.material_summary, "material_summary"),
    recommended_option_id: recommendedOptionId,
    options,
  };
}

export function parseMusicRequest(value: unknown): MusicRequestArtifact {
  const obj = record(value, "music request");
  const version = string(obj.version, "version");
  if (version !== "1.0") throw new Error('music request version must be "1.0"');
  return {
    version,
    id: string(obj.id, "id"),
    source: musicRequestSource(obj.source, "source"),
    reason: string(obj.reason, "reason"),
    source_mode: obj.source_mode === undefined ? undefined : sourceMode(obj.source_mode, "source_mode"),
    presentation_intent: obj.presentation_intent === undefined ? undefined : focusPresentationIntent(obj.presentation_intent, "presentation_intent"),
    mood: obj.mood === undefined ? undefined : string(obj.mood, "mood"),
    target_duration_seconds: obj.target_duration_seconds === undefined ? undefined : nonNegativeNumber(obj.target_duration_seconds, "target_duration_seconds"),
    local_path: obj.local_path === undefined ? undefined : safeRelativePath(string(obj.local_path, "local_path"), "local_path"),
    library_track: obj.library_track === undefined ? undefined : string(obj.library_track, "library_track"),
    prompt: obj.prompt === undefined ? undefined : string(obj.prompt, "prompt"),
    query: obj.query === undefined ? undefined : string(obj.query, "query"),
    model: obj.model === undefined ? undefined : string(obj.model, "model"),
    volume: obj.volume === undefined ? undefined : bounded(obj.volume, "volume", 0, 1),
    fade_seconds: obj.fade_seconds === undefined ? undefined : nonNegativeNumber(obj.fade_seconds, "fade_seconds"),
    ducking: obj.ducking === undefined ? undefined : boolean(obj.ducking, "ducking"),
    min_duration_seconds: obj.min_duration_seconds === undefined ? undefined : nonNegativeNumber(obj.min_duration_seconds, "min_duration_seconds"),
    max_duration_seconds: obj.max_duration_seconds === undefined ? undefined : nonNegativeNumber(obj.max_duration_seconds, "max_duration_seconds"),
  };
}

export function parseVisualRequest(value: unknown): VisualRequestArtifact {
  const obj = record(value, "visual request");
  const version = string(obj.version, "version");
  if (version !== "1.0") throw new Error('visual request version must be "1.0"');
  const requests = array(obj.requests, "requests").map((item, index): VisualRequestItem => visualRequestItem(item, `requests[${index}]`));
  if (requests.length === 0) throw new Error("requests must include at least one visual request");
  unique(requests.map((request) => request.id), "visual request id");
  return {
    version,
    source_mode: sourceMode(obj.source_mode, "source_mode"),
    presentation_intent: focusPresentationIntent(obj.presentation_intent, "presentation_intent"),
    requests,
  };
}

export function parseVisualCandidates(value: unknown): VisualCandidatesArtifact {
  const obj = record(value, "visual candidates");
  const version = string(obj.version, "version");
  if (version !== "1.0") throw new Error('visual candidates version must be "1.0"');
  const candidates = array(obj.candidates, "candidates").map((item, index): VisualCandidate => visualCandidate(item, `candidates[${index}]`));
  unique(candidates.map((candidate) => candidate.id), "visual candidate id");
  return {
    version,
    candidates,
    warnings: optionalStringArray(obj.warnings, "warnings"),
  };
}

export function parseVisualAcquisition(value: unknown): VisualAcquisitionArtifact {
  const obj = record(value, "visual acquisition");
  const version = string(obj.version, "version");
  if (version !== "1.0") throw new Error('visual acquisition version must be "1.0"');
  const assets = array(obj.assets, "assets").map((item, index): VisualAcquisitionItem => visualAcquisitionItem(item, `assets[${index}]`));
  unique(assets.map((asset) => asset.id), "visual acquisition id");
  unique(assets.map((asset) => asset.asset_id), "visual acquired asset_id");
  return {
    version,
    assets,
    warnings: optionalStringArray(obj.warnings, "warnings"),
  };
}

export function parseVisualReview(value: unknown): VisualReviewArtifact {
  const obj = record(value, "visual review");
  const version = string(obj.version, "version");
  if (version !== "1.0") throw new Error('visual review version must be "1.0"');
  const items = array(obj.items, "items").map((item, index): VisualReviewItem => visualReviewItem(item, `items[${index}]`));
  unique(items.map((item) => item.asset_id), "visual review asset_id");
  return {
    version,
    items,
    warnings: optionalStringArray(obj.warnings, "warnings"),
  };
}

export function parseSourceFrameRequest(value: unknown): SourceFrameRequestArtifact {
  const obj = strictRecord(value, "source frame request", ["version", "frames"]);
  const version = string(obj.version, "version");
  if (version !== "1.0") throw new Error('source frame request version must be "1.0"');
  const values = array(obj.frames, "frames");
  if (values.length < 1 || values.length > 20) throw new Error("source frame request frames must contain between 1 and 20 items");
  const frames = values.map((item, index) => sourceFrameRequestItem(item, `frames[${index}]`));
  unique(frames.map((frame) => frame.id), "source frame request id");
  return { version, frames };
}

export function parseFocusCandidates(value: unknown): FocusCandidatesArtifact {
  const obj = record(value, "focus candidates");
  const version = string(obj.version, "version");
  if (version !== "1.0") throw new Error('focus candidates version must be "1.0"');
  const candidates = array(obj.candidates, "candidates").map((item, index): FocusCandidate => focusCandidate(item, `candidates[${index}]`));
  unique(candidates.map((candidate) => candidate.id), "focus candidate id");
  return {
    version,
    source_mode: sourceMode(obj.source_mode, "source_mode"),
    presentation_intent: focusPresentationIntent(obj.presentation_intent, "presentation_intent"),
    candidates,
  };
}

export function parseFocusFrames(value: unknown): FocusFramesArtifact {
  const obj = record(value, "focus frames");
  const version = string(obj.version, "version");
  if (version !== "1.0") throw new Error('focus frames version must be "1.0"');
  const frames = array(obj.frames, "frames").map((item, index): FocusFrame => focusFrame(item, `frames[${index}]`));
  unique(frames.map((frame) => frame.id), "focus frame id");
  return { version, frames };
}

export function parseFocusGrounding(value: unknown): FocusGroundingArtifact {
  const obj = record(value, "focus grounding");
  const version = string(obj.version, "version");
  if (version !== "1.0") throw new Error('focus grounding version must be "1.0"');
  return {
    version,
    groundings: array(obj.groundings, "groundings").map((item, index): FocusGrounding => focusGrounding(item, `groundings[${index}]`)),
  };
}

export function parseFocusReview(value: unknown): FocusReviewArtifact {
  const obj = record(value, "focus review");
  const version = string(obj.version, "version");
  if (version !== "1.0") throw new Error('focus review version must be "1.0"');
  const proposedElements = array(obj.proposed_elements ?? [], "proposed_elements").map((item, index): EnrichmentElement => {
    const element = enrichmentElement(item, `proposed_elements[${index}]`);
    validateFocusReviewProposedElement(element, `proposed_elements[${index}]`);
    return element;
  });
  return {
    version,
    items: array(obj.items, "items").map((item, index): FocusReviewItem => focusReviewItem(item, `items[${index}]`)),
    proposed_elements: proposedElements,
    warnings: optionalStringArray(obj.warnings, "warnings"),
  };
}

function productionProposalOption(value: unknown, name: string): ProductionProposalOption {
  const obj = record(value, name);
  return {
    id: string(obj.id, `${name}.id`),
    label: string(obj.label, `${name}.label`),
    recommended: obj.recommended === undefined ? false : boolean(obj.recommended, `${name}.recommended`),
    reason: string(obj.reason, `${name}.reason`),
    cleanup: productionProposalCleanup(obj.cleanup, `${name}.cleanup`),
    subtitles: productionProposalSubtitles(obj.subtitles, `${name}.subtitles`),
    visuals: productionProposalVisuals(obj.visuals, `${name}.visuals`),
    images: productionProposalImages(obj.images, `${name}.images`),
    music: productionProposalMusic(obj.music, `${name}.music`),
    sfx: productionProposalSfx(obj.sfx, `${name}.sfx`),
    requires_confirmation: optionalStringArray(obj.requires_confirmation, `${name}.requires_confirmation`),
  };
}

function productionProposalCleanup(value: unknown, name: string): ProductionProposalCleanup {
  const obj = record(value, name);
  return {
    cut_candidate_ids: array(obj.cut_candidate_ids ?? [], `${name}.cut_candidate_ids`).map((item, index) => string(item, `${name}.cut_candidate_ids[${index}]`)),
    keep_strategy: string(obj.keep_strategy, `${name}.keep_strategy`),
    risks: optionalStringArray(obj.risks, `${name}.risks`),
  };
}

function productionProposalSubtitles(value: unknown, name: string): ProductionProposalSubtitles {
  const obj = record(value, name);
  return {
    enabled: boolean(obj.enabled, `${name}.enabled`),
    style: string(obj.style, `${name}.style`),
    conflict_notes: optionalStringArray(obj.conflict_notes, `${name}.conflict_notes`),
  };
}

function productionProposalVisuals(value: unknown, name: string): ProductionProposalVisuals {
  const obj = record(value, name);
  return {
    direction: string(obj.direction, `${name}.direction`),
    viewer_job: string(obj.viewer_job, `${name}.viewer_job`),
    requires_grounding: boolean(obj.requires_grounding, `${name}.requires_grounding`),
    notes: optionalStringArray(obj.notes, `${name}.notes`),
  };
}

function productionProposalImages(value: unknown, name: string): ProductionProposalImages {
  const obj = record(value, name);
  rejectPrematureAssetRefs(obj, name);
  return {
    needed: boolean(obj.needed, `${name}.needed`),
    reason: string(obj.reason, `${name}.reason`),
    missing_assets: optionalStringArray(obj.missing_assets, `${name}.missing_assets`),
  };
}

function productionProposalMusic(value: unknown, name: string): ProductionProposalMusic {
  const obj = record(value, name);
  rejectPrematureAssetRefs(obj, name);
  return {
    source: musicRequestSource(obj.source, `${name}.source`),
    mood: obj.mood === undefined ? undefined : string(obj.mood, `${name}.mood`),
    ducking: boolean(obj.ducking, `${name}.ducking`),
    notes: optionalStringArray(obj.notes, `${name}.notes`),
  };
}

function productionProposalSfx(value: unknown, name: string): ProductionProposalSfx {
  const obj = record(value, name);
  return {
    enabled: boolean(obj.enabled, `${name}.enabled`),
    usage: string(obj.usage, `${name}.usage`),
    restraint: string(obj.restraint, `${name}.restraint`),
  };
}

function rejectPrematureAssetRefs(obj: Record<string, unknown>, name: string) {
  for (const key of ["asset_id", "path", "asset_path", "local_path", "url", "original_url"]) {
    if (obj[key] !== undefined) throw new Error(`${name}.${key} must not appear before confirmed asset acquisition`);
  }
}

function defaultEnrichmentProfile(sourceMode: EnrichmentSourceMode = "talking_head_avatar"): EnrichmentProfile {
  const screenSafe = sourceMode === "screen_recording" || sourceMode === "mixed";
  return {
    source_mode: sourceMode,
    aspect_ratio: "source",
    caption_identity: "anchor",
    layout: screenSafe ? "overlay" : "stack",
    style: screenSafe ? "minimal" : "whiteboard",
    frame: "clean",
  };
}

function enrichmentProfile(value: unknown, name: string): EnrichmentProfile {
  const obj = value === undefined ? {} : record(value, name);
  const source_mode = obj.source_mode === undefined ? "talking_head_avatar" : sourceMode(obj.source_mode, `${name}.source_mode`);
  const defaults = defaultEnrichmentProfile(source_mode);
  return {
    source_mode,
    aspect_ratio: obj.aspect_ratio === undefined ? defaults.aspect_ratio : aspectRatio(obj.aspect_ratio, `${name}.aspect_ratio`),
    caption_identity: obj.caption_identity === undefined ? defaults.caption_identity : captionIdentity(obj.caption_identity, `${name}.caption_identity`),
    layout: obj.layout === undefined ? defaults.layout : enrichmentLayout(obj.layout, `${name}.layout`),
    style: obj.style === undefined ? defaults.style : enrichmentStyle(obj.style, `${name}.style`),
    frame: obj.frame === undefined ? defaults.frame : enrichmentFrame(obj.frame, `${name}.frame`),
  };
}

function enrichmentCaptions(value: unknown, name: string): EnrichmentCaptions {
  const obj = value === undefined ? {} : record(value, name);
  return {
    enabled: obj.enabled === undefined ? true : boolean(obj.enabled, `${name}.enabled`),
    identity: obj.identity === undefined ? "anchor" : captionIdentity(obj.identity, `${name}.identity`),
    emphasis: array(obj.emphasis ?? [], `${name}.emphasis`).map((item, index): CaptionEmphasis => {
      const emphasis = record(item, `${name}.emphasis[${index}]`);
      const start = nonNegativeNumber(emphasis.start, `${name}.emphasis[${index}].start`);
      const end = nonNegativeNumber(emphasis.end, `${name}.emphasis[${index}].end`);
      if (end <= start) throw new Error(`${name}.emphasis[${index}].end must be greater than start`);
      return {
        start,
        end,
        text: string(emphasis.text, `${name}.emphasis[${index}].text`),
        reason: string(emphasis.reason, `${name}.emphasis[${index}].reason`),
      };
    }),
  };
}

function enrichmentCard(value: unknown, name: string, profile: EnrichmentProfile): EnrichmentCard {
  const obj = record(value, name);
  const kind = cardKind(obj.kind, `${name}.kind`);
  const start = nonNegativeNumber(obj.start, `${name}.start`);
  const end = nonNegativeNumber(obj.end, `${name}.end`);
  if (end <= start) throw new Error(`${name}.end must be greater than start`);
  return {
    id: string(obj.id, `${name}.id`),
    start,
    end,
    kind,
    block_id: obj.block_id === undefined ? undefined : assertRenderableHyperframesBlockForCard(string(obj.block_id, `${name}.block_id`), kind, profile.source_mode, `${name}.block_id`),
    visual_intent: obj.visual_intent === undefined ? undefined : string(obj.visual_intent, `${name}.visual_intent`),
    layout: obj.layout === undefined ? profile.layout : enrichmentLayout(obj.layout, `${name}.layout`),
    style: obj.style === undefined ? profile.style : enrichmentStyle(obj.style, `${name}.style`),
    frame: obj.frame === undefined ? profile.frame : enrichmentFrame(obj.frame, `${name}.frame`),
    zone: obj.zone === undefined ? defaultCardZone(kind) : position(obj.zone, `${name}.zone`),
    kicker: obj.kicker === undefined ? undefined : string(obj.kicker, `${name}.kicker`),
    title: string(obj.title, `${name}.title`),
    detail: obj.detail === undefined ? undefined : string(obj.detail, `${name}.detail`),
    asset_id: obj.asset_id === undefined ? undefined : string(obj.asset_id, `${name}.asset_id`),
    target_rect: obj.target_rect === undefined ? undefined : normalizedRect(obj.target_rect, `${name}.target_rect`),
    anchor_point: obj.anchor_point === undefined ? undefined : normalizedPoint(obj.anchor_point, `${name}.anchor_point`),
    reason: string(obj.reason, `${name}.reason`),
  };
}

function enrichmentMusic(value: unknown, name: string): EnrichmentMusic {
  const obj = record(value, name);
  const type = obj.type === undefined ? "music_segment" : string(obj.type, `${name}.type`);
  if (type !== "music_segment") throw new Error(`${name}.type must be music_segment`);
  const start = nonNegativeNumber(obj.start, `${name}.start`);
  const end = nonNegativeNumber(obj.end, `${name}.end`);
  if (end <= start) throw new Error(`${name}.end must be greater than start`);
  return {
    id: string(obj.id, `${name}.id`),
    type: "music_segment",
    start,
    end,
    asset_id: string(obj.asset_id, `${name}.asset_id`),
    volume: bounded(obj.volume ?? 0.18, `${name}.volume`, 0, 1),
    fade_seconds: bounded(obj.fade_seconds ?? 0.5, `${name}.fade_seconds`, 0, end - start),
    ducking: obj.ducking === undefined ? true : boolean(obj.ducking, `${name}.ducking`),
    reason: string(obj.reason, `${name}.reason`),
  };
}

function enrichmentElement(value: unknown, name: string): EnrichmentElement {
  const obj = record(value, name);
  const type = enrichmentElementType(obj.element_type, `${name}.element_type`);
  const start = nonNegativeNumber(obj.start, `${name}.start`);
  const end = nonNegativeNumber(obj.end, `${name}.end`);
  if (end <= start) throw new Error(`${name}.end must be greater than start`);
  const elementId = string(obj.element_id, `${name}.element_id`);
  const sfxId = obj.sfx_id === undefined ? undefined : string(obj.sfx_id, `${name}.sfx_id`);
  if ((type === "generated_asset" || type === "visual_asset") && obj.asset_id === undefined) throw new Error(`${name}.asset_id is required for ${type} elements`);
  if (type === "sfx") {
    assertKnownVendoredElement(sfxId ?? elementId, "sfx", `${name}.sfx_id`);
  } else if (type !== "generated_asset" && type !== "visual_asset") {
    assertKnownVendoredElement(elementId, type, `${name}.element_id`);
  }
  return {
    id: string(obj.id, `${name}.id`),
    source: string(obj.source, `${name}.source`),
    element_id: elementId,
    element_type: type,
    start,
    end,
    reason: string(obj.reason, `${name}.reason`),
    zone: obj.zone === undefined ? undefined : position(obj.zone, `${name}.zone`),
    target_rect: obj.target_rect === undefined ? undefined : normalizedRect(obj.target_rect, `${name}.target_rect`),
    anchor_point: obj.anchor_point === undefined ? undefined : normalizedPoint(obj.anchor_point, `${name}.anchor_point`),
    params: obj.params === undefined ? undefined : elementParams(obj.params, `${name}.params`),
    asset_id: obj.asset_id === undefined ? undefined : string(obj.asset_id, `${name}.asset_id`),
    sfx_id: sfxId,
    caption_identity: obj.caption_identity === undefined ? undefined : captionIdentity(obj.caption_identity, `${name}.caption_identity`),
  };
}

function visualRequestItem(value: unknown, name: string): VisualRequestItem {
  const obj = record(value, name);
  const start = obj.start === undefined ? undefined : nonNegativeNumber(obj.start, `${name}.start`);
  const end = obj.end === undefined ? undefined : nonNegativeNumber(obj.end, `${name}.end`);
  if (start !== undefined && end !== undefined && end <= start) throw new Error(`${name}.end must be greater than start`);
  return {
    id: string(obj.id, `${name}.id`),
    viewer_job: string(obj.viewer_job, `${name}.viewer_job`),
    semantic_query: string(obj.semantic_query, `${name}.semantic_query`),
    asset_type: visualAssetType(obj.asset_type, `${name}.asset_type`),
    preferred_sources: obj.preferred_sources === undefined ? [] : array(obj.preferred_sources, `${name}.preferred_sources`).map((item, index) => visualProvider(item, `${name}.preferred_sources[${index}]`)),
    reason: string(obj.reason, `${name}.reason`),
    output_usage: obj.output_usage === undefined ? undefined : string(obj.output_usage, `${name}.output_usage`),
    selected_candidate_id: obj.selected_candidate_id === undefined ? undefined : string(obj.selected_candidate_id, `${name}.selected_candidate_id`),
    start,
    end,
    zone: obj.zone === undefined ? undefined : position(obj.zone, `${name}.zone`),
  };
}

function visualCandidate(value: unknown, name: string): VisualCandidate {
  const obj = record(value, name);
  return {
    id: string(obj.id, `${name}.id`),
    request_id: string(obj.request_id, `${name}.request_id`),
    provider: visualProvider(obj.provider, `${name}.provider`),
    asset_type: visualAssetType(obj.asset_type, `${name}.asset_type`),
    title: string(obj.title, `${name}.title`),
    semantic_query: string(obj.semantic_query, `${name}.semantic_query`),
    preview_url: obj.preview_url === undefined ? undefined : urlString(obj.preview_url, `${name}.preview_url`),
    source_url: obj.source_url === undefined ? undefined : urlString(obj.source_url, `${name}.source_url`),
    download_url: obj.download_url === undefined ? undefined : urlString(obj.download_url, `${name}.download_url`),
    local_path: obj.local_path === undefined ? undefined : safeRelativePath(string(obj.local_path, `${name}.local_path`), `${name}.local_path`),
    license: obj.license === undefined ? undefined : string(obj.license, `${name}.license`),
    license_url: obj.license_url === undefined ? undefined : urlString(obj.license_url, `${name}.license_url`),
    original_author: obj.original_author === undefined ? undefined : string(obj.original_author, `${name}.original_author`),
    cost: obj.cost === undefined ? undefined : string(obj.cost, `${name}.cost`),
    source_risk: obj.source_risk === undefined ? undefined : string(obj.source_risk, `${name}.source_risk`),
    renderable: obj.renderable === undefined ? true : boolean(obj.renderable, `${name}.renderable`),
    recommended: obj.recommended === undefined ? false : boolean(obj.recommended, `${name}.recommended`),
    reason: string(obj.reason, `${name}.reason`),
    runtime_dependencies: obj.runtime_dependencies === undefined ? [] : optionalStringArray(obj.runtime_dependencies, `${name}.runtime_dependencies`),
  };
}

function visualAcquisitionItem(value: unknown, name: string): VisualAcquisitionItem {
  const obj = record(value, name);
  return {
    id: string(obj.id, `${name}.id`),
    request_id: string(obj.request_id, `${name}.request_id`),
    candidate_id: string(obj.candidate_id, `${name}.candidate_id`),
    asset_id: string(obj.asset_id, `${name}.asset_id`),
    provider: visualProvider(obj.provider, `${name}.provider`),
    asset_type: visualAssetType(obj.asset_type, `${name}.asset_type`),
    path: safeRelativePath(string(obj.path, `${name}.path`), `${name}.path`),
    hash: string(obj.hash, `${name}.hash`),
    source_url: obj.source_url === undefined ? undefined : urlString(obj.source_url, `${name}.source_url`),
    license: obj.license === undefined ? undefined : string(obj.license, `${name}.license`),
    license_url: obj.license_url === undefined ? undefined : urlString(obj.license_url, `${name}.license_url`),
    original_author: obj.original_author === undefined ? undefined : string(obj.original_author, `${name}.original_author`),
    acquired_at: string(obj.acquired_at, `${name}.acquired_at`),
    runtime_dependencies: obj.runtime_dependencies === undefined ? [] : optionalStringArray(obj.runtime_dependencies, `${name}.runtime_dependencies`),
    warnings: optionalStringArray(obj.warnings, `${name}.warnings`),
  };
}

function visualReviewItem(value: unknown, name: string): VisualReviewItem {
  const obj = record(value, name);
  return {
    asset_id: string(obj.asset_id, `${name}.asset_id`),
    request_id: string(obj.request_id, `${name}.request_id`),
    candidate_id: string(obj.candidate_id, `${name}.candidate_id`),
    provider: visualProvider(obj.provider, `${name}.provider`),
    asset_type: visualAssetType(obj.asset_type, `${name}.asset_type`),
    path: safeRelativePath(string(obj.path, `${name}.path`), `${name}.path`),
    source_url: obj.source_url === undefined ? undefined : urlString(obj.source_url, `${name}.source_url`),
    license: obj.license === undefined ? undefined : string(obj.license, `${name}.license`),
    runtime_dependencies: obj.runtime_dependencies === undefined ? [] : optionalStringArray(obj.runtime_dependencies, `${name}.runtime_dependencies`),
    usage_reason: string(obj.usage_reason, `${name}.usage_reason`),
    warnings: optionalStringArray(obj.warnings, `${name}.warnings`),
  };
}

function focusCandidate(value: unknown, name: string): FocusCandidate {
  const obj = record(value, name);
  const start = nonNegativeNumber(obj.start, `${name}.start`);
  const end = nonNegativeNumber(obj.end, `${name}.end`);
  if (end <= start) throw new Error(`${name}.end must be greater than start`);
  const type = enrichmentElementType(obj.element_type, `${name}.element_type`);
  const elementId = string(obj.element_id, `${name}.element_id`);
  if (type !== "generated_asset" && type !== "visual_asset") assertKnownVendoredElement(elementId, type, `${name}.element_id`);
  return {
    id: string(obj.id, `${name}.id`),
    start,
    end,
    transcript_quote: string(obj.transcript_quote, `${name}.transcript_quote`),
    semantic_intent: focusSemanticIntent(obj.semantic_intent, `${name}.semantic_intent`),
    business_role: obj.business_role === undefined ? undefined : string(obj.business_role, `${name}.business_role`),
    viewer_job: obj.viewer_job === undefined ? undefined : string(obj.viewer_job, `${name}.viewer_job`),
    visual_gap: obj.visual_gap === undefined ? undefined : string(obj.visual_gap, `${name}.visual_gap`),
    recommended_treatment: obj.recommended_treatment === undefined ? undefined : focusRecommendedTreatment(obj.recommended_treatment, `${name}.recommended_treatment`),
    element_id: elementId,
    element_type: type,
    requires_grounding: boolean(obj.requires_grounding, `${name}.requires_grounding`),
    asset_id: obj.asset_id === undefined ? undefined : string(obj.asset_id, `${name}.asset_id`),
    sfx_id: obj.sfx_id === undefined ? undefined : string(obj.sfx_id, `${name}.sfx_id`),
    reason: string(obj.reason, `${name}.reason`),
    params: obj.params === undefined ? undefined : elementParams(obj.params, `${name}.params`),
  };
}

function sourceFrameRequestItem(value: unknown, name: string): SourceFrameRequestItem {
  const obj = strictRecord(value, name, ["id", "source_id", "time_seconds", "segment_id", "transcript_quote", "reason"]);
  return {
    id: opaqueIdentifier(obj.id, `${name}.id`),
    source_id: opaqueIdentifier(obj.source_id, `${name}.source_id`),
    time_seconds: nonNegativeNumber(obj.time_seconds, `${name}.time_seconds`),
    segment_id: obj.segment_id === undefined ? undefined : opaqueIdentifier(obj.segment_id, `${name}.segment_id`),
    transcript_quote: nonBlankString(obj.transcript_quote, `${name}.transcript_quote`),
    reason: nonBlankString(obj.reason, `${name}.reason`),
  };
}

function focusFrame(value: unknown, name: string): FocusFrame {
  const obj = record(value, name);
  return {
    id: string(obj.id, `${name}.id`),
    candidate_id: string(obj.candidate_id, `${name}.candidate_id`),
    timeline: focusTimeline(obj.timeline, `${name}.timeline`),
    time_seconds: nonNegativeNumber(obj.time_seconds, `${name}.time_seconds`),
    path: safeRelativePath(string(obj.path, `${name}.path`), `${name}.path`),
    source_id: obj.source_id === undefined ? undefined : string(obj.source_id, `${name}.source_id`),
    width: obj.width === undefined ? undefined : integer(obj.width, `${name}.width`),
    height: obj.height === undefined ? undefined : integer(obj.height, `${name}.height`),
  };
}

function focusGrounding(value: unknown, name: string): FocusGrounding {
  const obj = record(value, name);
  return {
    candidate_id: string(obj.candidate_id, `${name}.candidate_id`),
    frame_id: string(obj.frame_id, `${name}.frame_id`),
    confidence: bounded(obj.confidence, `${name}.confidence`, 0, 1),
    evidence_note: string(obj.evidence_note, `${name}.evidence_note`),
    target_rect: obj.target_rect === undefined ? undefined : normalizedRect(obj.target_rect, `${name}.target_rect`),
    anchor_point: obj.anchor_point === undefined ? undefined : normalizedPoint(obj.anchor_point, `${name}.anchor_point`),
    params: obj.params === undefined ? undefined : elementParams(obj.params, `${name}.params`),
  };
}

function focusReviewItem(value: unknown, name: string): FocusReviewItem {
  const obj = record(value, name);
  return {
    candidate_id: string(obj.candidate_id, `${name}.candidate_id`),
    status: focusReviewStatus(obj.status, `${name}.status`),
    frame_paths: array(obj.frame_paths, `${name}.frame_paths`).map((item, index) =>
      safeRelativePath(string(item, `${name}.frame_paths[${index}]`), `${name}.frame_paths[${index}]`),
    ),
    warnings: optionalStringArray(obj.warnings, `${name}.warnings`),
    grounding: obj.grounding === undefined ? undefined : focusGrounding(obj.grounding, `${name}.grounding`),
    proposed_element: obj.proposed_element === undefined ? undefined : enrichmentElement(obj.proposed_element, `${name}.proposed_element`),
  };
}

function validateFocusReviewProposedElement(element: EnrichmentElement, name: string) {
  const catalog = element.element_type === "generated_asset" || element.element_type === "visual_asset" ? undefined : assertKnownVendoredElement(element.sfx_id ?? element.element_id, element.element_type, `${name}.element_id`);
  const haystack = [element.element_id, catalog?.title ?? "", ...(catalog?.tags ?? [])].join(" ").toLowerCase();
  if ((element.element_type === "registry_block" || element.element_type === "animation_rule") && /zoom|focus|cursor|spotlight|marker/.test(haystack) && !element.target_rect) {
    throw new Error(`${name}.target_rect is required for focus proposed elements`);
  }
  if (element.element_type === "registry_component" && /shimmer|highlight|callout|effect/.test(haystack) && !haystack.includes("caption") && !element.anchor_point) {
    throw new Error(`${name}.anchor_point is required for anchored proposed elements`);
  }
}

function compatibilityElements(profile: EnrichmentProfile, captions: EnrichmentCaptions, cards: EnrichmentCard[], music: EnrichmentMusic[]): EnrichmentElement[] {
  const timelineEnd = Math.max(0.001, ...captions.emphasis.map((item) => item.end), ...cards.map((card) => card.end), ...music.map((slot) => slot.end));
  const elements: EnrichmentElement[] = [];
  if (captions.enabled) {
    elements.push(captionCompatibilityElement(captions, timelineEnd));
  }
  for (const card of cards) {
    const elementId = legacyCardRegistryElementId(card, profile.source_mode);
    assertKnownVendoredElement(elementId, "registry_block", `${card.id}.compat_element`);
    elements.push({
      id: `card-${card.id}`,
      source: "compat:v1.cards",
      element_id: elementId,
      element_type: "registry_block",
      start: card.start,
      end: card.end,
      reason: card.reason,
      zone: card.zone,
      target_rect: card.target_rect,
      anchor_point: card.anchor_point,
      asset_id: card.asset_id,
      params: {
        kind: card.kind,
        title: card.title,
        detail: card.detail ?? null,
        legacy_block_id: card.block_id ?? null,
        visual_intent: card.visual_intent ?? null,
      },
    });
  }
  for (const slot of music) {
    elements.push({
      id: `music-${slot.id}`,
      source: "compat:v1.music",
      element_id: slot.asset_id,
      element_type: "generated_asset",
      start: slot.start,
      end: slot.end,
      asset_id: slot.asset_id,
      reason: slot.reason,
      params: {
        slot_type: "music_segment",
        volume: slot.volume,
        fade_seconds: slot.fade_seconds,
        ducking: slot.ducking,
      },
    });
  }
  return elements;
}

function withImplicitCaptionElement(captions: EnrichmentCaptions, cards: EnrichmentCard[], music: EnrichmentMusic[], elements: EnrichmentElement[]): EnrichmentElement[] {
  if (!captions.enabled || elements.some((element) => element.element_type === "caption_identity")) return elements;
  const timelineEnd = Math.max(0.001, ...captions.emphasis.map((item) => item.end), ...cards.map((card) => card.end), ...music.map((slot) => slot.end), ...elements.map((element) => element.end));
  return [captionCompatibilityElement(captions, timelineEnd), ...elements];
}

function captionCompatibilityElement(captions: EnrichmentCaptions, timelineEnd: number): EnrichmentElement {
  return {
    id: "captions-anchor",
    source: "compat:v1.captions",
    element_id: captions.identity,
    element_type: "caption_identity",
    start: 0,
    end: timelineEnd,
    caption_identity: captions.identity,
    reason: "compatibility element generated from captions config",
  };
}

function legacyCardRegistryElementId(card: EnrichmentCard, sourceMode: EnrichmentSourceMode): string {
  if (card.block_id) return LEGACY_BLOCK_TO_REGISTRY_BLOCK[card.block_id] ?? card.block_id.replaceAll("_", "-");
  if (sourceMode === "screen_recording") {
    if (card.kind === "screenshot_focus") return "cinematic-zoom";
    if (card.kind === "flowchart") return "flowchart";
    if (card.kind === "quote" || card.kind === "image") return "macos-notification";
    if (card.kind === "title" || card.kind === "lower_third") return "lt-accent-underline";
    return "code-highlight";
  }
  if (sourceMode === "mixed") {
    if (card.kind === "screenshot_focus") return "cinematic-zoom";
    if (card.kind === "quote") return "x-post";
    if (card.kind === "image") return "app-showcase";
    if (card.kind === "flowchart") return "flowchart";
    return "lt-accent-underline";
  }
  if (card.kind === "title") return "lt-bold-block";
  if (card.kind === "quote") return "lt-mask-reveal";
  if (card.kind === "image") return "app-showcase";
  if (card.kind === "flowchart") return "flowchart";
  if (card.kind === "lower_third") return "lt-clean-bar";
  return "lt-stack-bars";
}

const LEGACY_BLOCK_TO_REGISTRY_BLOCK: Record<string, string> = {
  lt_clean_bar: "lt-clean-bar",
  lt_accent_underline: "lt-accent-underline",
  lt_soft_pill: "lt-soft-pill",
  lt_bold_block: "lt-bold-block",
  lt_mask_reveal: "lt-mask-reveal",
  lt_side_rule: "lt-side-rule",
  lt_stack_bars: "lt-stack-bars",
  yt_lower_third: "yt-lower-third",
  news_ticker: "news-ticker",
  instagram_follow: "instagram-follow",
  tiktok_follow: "tiktok-follow",
  code_highlight: "code-highlight",
  code_scroll: "code-scroll",
  code_typing: "code-typing",
  code_diff: "code-diff",
  code_morph: "code-morph",
  flowchart_steps: "flowchart",
  zoom_focus: "cinematic-zoom",
  target_zoom: "cinematic-zoom",
  whip_pan_transition: "whip-pan",
  macos_notification: "macos-notification",
  x_post: "x-post",
  reddit_post: "reddit-post",
  app_showcase: "app-showcase",
};

function legacySlotCard(slot: EnrichmentSlot, profile: EnrichmentProfile): EnrichmentCard {
  const kind: EnrichmentCardKind =
    slot.type === "title_card" ? "title" : slot.type === "keyword_callout" ? "lower_third" : slot.type === "image_overlay" ? "image" : "key_point";
  return {
    id: slot.id,
    start: slot.start,
    end: slot.end,
    kind,
    layout: slot.type === "image_overlay" ? "split" : profile.layout,
    style: profile.style,
    frame: profile.frame,
    zone: slot.position ?? defaultCardZone(kind),
    title: slot.text ?? (slot.type === "image_overlay" ? "Visual" : slot.id),
    asset_id: slot.asset_id,
    reason: slot.reason,
  };
}

function legacySlotMusic(slot: EnrichmentSlot): EnrichmentMusic {
  return {
    id: slot.id,
    type: "music_segment",
    start: slot.start,
    end: slot.end,
    asset_id: slot.asset_id!,
    volume: slot.volume ?? 0.18,
    fade_seconds: slot.fade_seconds ?? 0.5,
    ducking: slot.ducking ?? true,
    reason: slot.reason,
  };
}

function defaultCardZone(kind: EnrichmentCardKind): EnrichmentPosition {
  if (kind === "title") return "full_frame";
  if (kind === "lower_third" || kind === "quote") return "lower_third";
  if (kind === "image" || kind === "screenshot_focus" || kind === "flowchart") return "right_panel";
  return "right_panel";
}

function candidate(value: unknown, name: string, known?: Set<string>): AnalysisCandidate {
  const obj = record(value, name);
  const range = timedText(value, name, known);
  return {
    ...range,
    id: string(obj.id, `${name}.id`),
    type: string(obj.type, `${name}.type`),
    reason: string(obj.reason, `${name}.reason`),
    confidence: bounded(obj.confidence, `${name}.confidence`, 0, 1),
  };
}

function enrichmentSlot(value: unknown, name: string): EnrichmentSlot {
  const obj = record(value, name);
  const type = slotType(obj.type, `${name}.type`);
  const slot: EnrichmentSlot = {
    id: string(obj.id, `${name}.id`),
    type,
    start: nonNegativeNumber(obj.start, `${name}.start`),
    end: nonNegativeNumber(obj.end, `${name}.end`),
    reason: string(obj.reason, `${name}.reason`),
    position: obj.position === undefined ? undefined : position(obj.position, `${name}.position`),
  };
  if (slot.end <= slot.start) throw new Error(`${name}.end must be greater than start`);
  if (type === "music_segment") {
    slot.asset_id = string(obj.asset_id, `${name}.asset_id`);
    slot.volume = bounded(obj.volume ?? 0.18, `${name}.volume`, 0, 1);
    slot.fade_seconds = bounded(obj.fade_seconds ?? 0.5, `${name}.fade_seconds`, 0, slot.end - slot.start);
    slot.ducking = obj.ducking === undefined ? true : boolean(obj.ducking, `${name}.ducking`);
    return slot;
  }
  if (type === "image_overlay") {
    slot.asset_id = string(obj.asset_id, `${name}.asset_id`);
    slot.text = obj.text === undefined ? undefined : string(obj.text, `${name}.text`);
    return slot;
  }
  slot.text = string(obj.text, `${name}.text`);
  return slot;
}

function timedText(value: unknown, name: string, known?: Set<string>): TimedTextRange {
  const obj = record(value, name);
  const source_id = string(obj.source_id, `${name}.source_id`);
  requireKnownSource(source_id, known, `${name}.source_id`);
  const start = nonNegativeNumber(obj.start, `${name}.start`);
  const end = nonNegativeNumber(obj.end, `${name}.end`);
  if (end <= start) throw new Error(`${name}.end must be greater than start`);
  return { source_id, start, end, text: string(obj.text, `${name}.text`) };
}

function sourceIds(manifest?: SourcesManifest): Set<string> | undefined {
  return manifest ? new Set(manifest.sources.map((source) => source.source_id)) : undefined;
}

function requireKnownSource(sourceId: string, known: Set<string> | undefined, name: string) {
  if (known && !known.has(sourceId)) throw new Error(`${name} references unknown source_id: ${sourceId}`);
}

function timing(value: unknown): TimingGranularity {
  if (value === "word" || value === "segment" || value === "text-only") return value;
  throw new Error("timing_granularity must be word, segment, or text-only");
}

function action(value: unknown, name: string): EditDecision["action"] {
  if (value === "cut" || value === "keep" || value === "skip") return value;
  throw new Error(`${name} must be cut, keep, or skip`);
}

function slotType(value: unknown, name: string): EnrichmentSlotType {
  if (value === "title_card" || value === "keyword_callout" || value === "key_point_card" || value === "image_overlay" || value === "music_segment") return value;
  throw new Error(`${name} must be title_card, keyword_callout, key_point_card, image_overlay, or music_segment`);
}

function sourceMode(value: unknown, name: string): EnrichmentSourceMode {
  if (value === "talking_head_avatar" || value === "screen_recording" || value === "mixed") return value;
  throw new Error(`${name} must be talking_head_avatar, screen_recording, or mixed`);
}

function focusPresentationIntent(value: unknown, name: string): FocusPresentationIntent {
  if (value === "internal_tutorial" || value === "product_demo" || value === "course_lesson" || value === "knowledge_explainer" || value === "short_form") return value;
  throw new Error(`${name} must be internal_tutorial, product_demo, course_lesson, knowledge_explainer, or short_form`);
}

function musicRequestSource(value: unknown, name: string): MusicRequestSource {
  if (value === "none" || value === "local" || value === "minimax" || value === "freesound" || value === "pixabay") return value;
  throw new Error(`${name} must be none, local, minimax, freesound, or pixabay`);
}

function focusSemanticIntent(value: unknown, name: string): FocusSemanticIntent {
  if (value === "orient_viewer" || value === "guide_attention" || value === "explain_sequence" || value === "summarize_payoff" || value === "pacing_relief") return value;
  throw new Error(`${name} must be orient_viewer, guide_attention, explain_sequence, summarize_payoff, or pacing_relief`);
}

function focusRecommendedTreatment(value: unknown, name: string): FocusRecommendedTreatment {
  if (value === "source_ui_component" || value === "generated_asset" || value === "text_or_caption" || value === "sfx_or_music" || value === "none") return value;
  throw new Error(`${name} must be source_ui_component, generated_asset, text_or_caption, sfx_or_music, or none`);
}

function focusTimeline(value: unknown, name: string): FocusFrame["timeline"] {
  if (value === "source" || value === "output") return value;
  throw new Error(`${name} must be source or output`);
}

function focusReviewStatus(value: unknown, name: string): FocusReviewStatus {
  if (value === "ready" || value === "needs_grounding" || value === "warning" || value === "invalid") return value;
  throw new Error(`${name} must be ready, needs_grounding, warning, or invalid`);
}

function aspectRatio(value: unknown, name: string): EnrichmentAspectRatio {
  if (value === "source" || value === "16:9" || value === "9:16" || value === "4:5") return value;
  throw new Error(`${name} must be source, 16:9, 9:16, or 4:5`);
}

function captionIdentity(value: unknown, name: string): EnrichmentCaptionIdentity {
  if (value === "anchor") return value;
  throw new Error(`${name} must be anchor`);
}

function enrichmentLayout(value: unknown, name: string): EnrichmentLayout {
  if (value === "stack" || value === "overlay" || value === "split" || value === "pip") return value;
  throw new Error(`${name} must be stack, overlay, split, or pip`);
}

function enrichmentStyle(value: unknown, name: string): EnrichmentStyle {
  if (value === "whiteboard" || value === "audit" || value === "swiss" || value === "terminal" || value === "xhs" || value === "editorial" || value === "minimal") return value;
  throw new Error(`${name} must be a supported enrichment style`);
}

function enrichmentFrame(value: unknown, name: string): EnrichmentFrame {
  if (value === "clean" || value === "hairline" || value === "polaroid") return value;
  throw new Error(`${name} must be clean, hairline, or polaroid`);
}

function cardKind(value: unknown, name: string): EnrichmentCardKind {
  if (value === "title" || value === "key_point" || value === "quote" || value === "flowchart" || value === "image" || value === "screenshot_focus" || value === "lower_third") return value;
  throw new Error(`${name} must be a supported card kind`);
}

function enrichmentElementType(value: unknown, name: string): EnrichmentElementType {
  if (value === "registry_block" || value === "registry_component" || value === "animation_rule" || value === "caption_identity" || value === "sfx" || value === "generated_asset" || value === "visual_asset") {
    return value;
  }
  throw new Error(`${name} must be registry_block, registry_component, animation_rule, caption_identity, sfx, generated_asset, or visual_asset`);
}

function position(value: unknown, name: string): EnrichmentPosition {
  if (value === "full_frame" || value === "upper_third" || value === "lower_third" || value === "left_panel" || value === "right_panel" || value === "center") return value;
  throw new Error(`${name} must be a supported enrichment position`);
}

function assetType(value: unknown, name: string): AssetManifestEntry["type"] {
  if (value === "image" || value === "music" || value === "video" || value === "sfx" || value === "icon" || value === "animated_icon" || value === "lottie" || value === "ui_component" || value === "template" || value === "sticker" || value === "broll") return value;
  throw new Error(`${name} must be image, music, video, sfx, icon, animated_icon, lottie, ui_component, template, sticker, or broll`);
}

function visualAssetType(value: unknown, name: string): VisualAssetType {
  if (value === "icon" || value === "animated_icon" || value === "lottie" || value === "ui_component" || value === "template" || value === "sticker" || value === "broll" || value === "image") return value;
  throw new Error(`${name} must be icon, animated_icon, lottie, ui_component, template, sticker, broll, or image`);
}

function visualProvider(value: unknown, name: string): VisualProvider {
  if (value === "iconify" || value === "lordicon" || value === "lottie" || value === "shadcn" || value === "21st" || value === "mcp-handoff" || value === "local" || value === "url") return value;
  throw new Error(`${name} must be iconify, lordicon, lottie, shadcn, 21st, mcp-handoff, local, or url`);
}

function providerExecutionMode(value: unknown, name: string): ProviderExecutionMode {
  if (value === "standalone" || value === "platform") return value;
  throw new Error(`${name} must be standalone or platform`);
}

function assetSource(value: unknown, name: string): AssetManifestSource {
  if (value === "user" || value === "agent_generated" || value === "imported" || value === "bundled" || value === "derived") return value;
  throw new Error(`${name} must be user, agent_generated, imported, bundled, or derived`);
}

function dimensions(value: unknown, name: string): AssetManifestDimensions {
  const obj = record(value, name);
  const size = {
    width: integer(obj.width, `${name}.width`),
    height: integer(obj.height, `${name}.height`),
  };
  if (size.width === 0 || size.height === 0) throw new Error(`${name}.width and ${name}.height must be greater than 0`);
  return size;
}

function normalizedPoint(value: unknown, name: string): EnrichmentPoint {
  const obj = record(value, name);
  return {
    x: bounded(obj.x, `${name}.x`, 0, 1),
    y: bounded(obj.y, `${name}.y`, 0, 1),
  };
}

function normalizedRect(value: unknown, name: string): EnrichmentRect {
  const obj = record(value, name);
  const rect = {
    x: bounded(obj.x, `${name}.x`, 0, 1),
    y: bounded(obj.y, `${name}.y`, 0, 1),
    width: bounded(obj.width, `${name}.width`, 0, 1),
    height: bounded(obj.height, `${name}.height`, 0, 1),
  };
  if (rect.width === 0 || rect.height === 0) throw new Error(`${name}.width and ${name}.height must be greater than 0`);
  if (rect.x + rect.width > 1 || rect.y + rect.height > 1) throw new Error(`${name} must stay inside normalized canvas bounds`);
  return rect;
}

function elementParams(value: unknown, name: string): EnrichmentElementParams {
  const obj = record(value, name);
  const result: EnrichmentElementParams = {};
  for (const [key, entry] of Object.entries(obj)) {
    if (entry === null || typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean") {
      result[key] = entry;
      continue;
    }
    throw new Error(`${name}.${key} must be a string, number, boolean, or null`);
  }
  return result;
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be an object`);
  return value as Record<string, unknown>;
}

function strictRecord(value: unknown, name: string, allowedKeys: readonly string[]): Record<string, unknown> {
  const obj = record(value, name);
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) throw new Error(`${name}.${key} is not allowed`);
  }
  return obj;
}

function array(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${name} must be an array`);
  return value;
}

function string(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${name} must be a non-empty string`);
  return value;
}

function nonBlankString(value: unknown, name: string): string {
  const text = string(value, name);
  if (text.trim().length === 0) throw new Error(`${name} must not be blank`);
  return text;
}

function opaqueIdentifier(value: unknown, name: string): string {
  const text = nonBlankString(value, name);
  const candidate = text.trim();
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(candidate) || candidate.includes("/") || candidate.includes("\\")) {
    throw new Error(`${name} must be an opaque identifier, not a path or URL`);
  }
  return text;
}

function urlString(value: unknown, name: string): string {
  const text = string(value, name);
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error(`${name} must be an http(s) URL`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error(`${name} must be an http(s) URL`);
  return text;
}

function integer(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  return value;
}

function boolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${name} must be a boolean`);
  return value;
}

function nonNegativeNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative number`);
  return value;
}

function bounded(value: unknown, name: string, min: number, max: number): number {
  const number = nonNegativeNumber(value, name);
  if (number < min || number > max) throw new Error(`${name} must be between ${min} and ${max}`);
  return number;
}

function safeRelativePath(value: string, name: string): string {
  if (value.includes("://") || value.startsWith("/") || /^[a-zA-Z]:/.test(value)) throw new Error(`${name} must be a project-relative path`);
  if (value.split(/[\\/]+/).includes("..")) throw new Error(`${name} must not contain ..`);
  return value;
}

function optionalStringArray(value: unknown, name: string): string[] {
  if (value === undefined) return [];
  return array(value, name).map((item, index) => string(item, `${name}[${index}]`));
}

function unique(values: string[], name: string) {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`duplicate ${name}: ${value}`);
    seen.add(value);
  }
}

function rejectOverlaps(ranges: Array<{ source_id: string; start: number; end: number }>, name: string) {
  const bySource = new Map<string, Array<{ start: number; end: number }>>();
  for (const range of ranges) {
    const sourceRanges = bySource.get(range.source_id) ?? [];
    sourceRanges.push({ start: range.start, end: range.end });
    bySource.set(range.source_id, sourceRanges);
  }
  for (const [sourceId, sourceRanges] of bySource) {
    const sorted = [...sourceRanges].sort((a, b) => a.start - b.start);
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1]!;
      const current = sorted[index]!;
      if (current.start < previous.end) throw new Error(`${name} overlap for ${sourceId}: ${current.start}-${current.end}`);
    }
  }
}

function rejectTimelineOverlaps(ranges: Array<{ start: number; end: number }>, name: string) {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]!;
    const current = sorted[index]!;
    if (current.start < previous.end) throw new Error(`${name} overlap: ${current.start}-${current.end}`);
  }
}
