import { assertKnownVendoredElement, type VendoredElementType } from "./hyperframes-registry";
import { assertArtifactContract, assertProductionProposalContract } from "./artifact-contracts";

export type TimingGranularity = "word" | "segment" | "text-only";

export type SourceAsset = {
  source_id: string;
  order: number;
  original_filename: string;
  local_media_ref: string;
  duration_seconds: number;
  identity: {
    sha256: string;
    size_bytes: number;
    duration_seconds: number;
    video: {
      codec_name: string;
      width: number;
      height: number;
      display_width: number;
      display_height: number;
      rotation: number;
      avg_frame_rate: string;
      pixel_format: string;
    };
    audio?: {
      codec_name: string;
      sample_rate: number;
      channels: number;
      channel_layout: string;
    };
  };
};

export type SourcesManifest = {
  contract_version: "2.0";
  sources: SourceAsset[];
};

export type SourceMaterializationArtifact = {
  contract_version: "1.0";
  sources: Array<{
    source_id: string;
    project_path: string;
    sha256: string;
    size_bytes: number;
  }>;
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
  contract_version: "1.0";
  confirmed_option_id: string;
  proposal_selection_fingerprint: ArtifactFingerprint;
  decisions: EditDecision[];
  source_order?: string[];
};

export type EdlEntry = {
  source_id: string;
  start: number;
  end: number;
  output_order: number;
  reason: string;
  quote?: string;
  label?: string;
};

export type EdlArtifact = {
  contract_version: "2.0";
  entries: EdlEntry[];
};

export type EnrichmentPosition = "full_frame" | "upper_third" | "lower_third" | "left_panel" | "right_panel" | "center";
export type EnrichmentSourceMode = "talking_head_avatar" | "screen_recording" | "mixed";
export type EnrichmentAspectRatio = "source" | "16:9" | "9:16" | "4:5";
export type EnrichmentCaptionIdentity = "anchor";
export type EnrichmentLayout = "stack" | "overlay" | "split" | "pip";
export type EnrichmentStyle = "whiteboard" | "audit" | "swiss" | "terminal" | "xhs" | "editorial" | "minimal";
export type EnrichmentFrame = "clean" | "hairline" | "polaroid";
export type EnrichmentCardKind = "title" | "key_point" | "quote" | "flowchart" | "image" | "screenshot_focus" | "lower_third";
export type EnrichmentPoint = { x: number; y: number };
export type EnrichmentRect = { x: number; y: number; width: number; height: number };
export type EnrichmentElementType = Exclude<VendoredElementType, "sfx"> | "visual_asset";
export type AssetUsagePosition = "top-left" | "top-right" | "bottom-left" | "bottom-right" | EnrichmentPosition;

export type AssetUsageMusic = {
  id?: string;
  asset_ref: string;
  start: number;
  end: number;
  volume: number;
  duck_original_audio: boolean;
  fade_in: number;
  fade_out: number;
  purpose: string;
};

export type AssetUsageSfx = {
  id?: string;
  asset_ref: string;
  time: number;
  duration: number;
  volume: number;
  fade_seconds: number;
  purpose: string;
};

export type AssetUsageVisual = {
  id?: string;
  asset_ref: string;
  start: number;
  end: number;
  position: AssetUsagePosition;
  size?: "small" | "medium" | "large";
  animation?: "none" | "fade-in";
  asset_type?: VisualAssetType;
  purpose: string;
};

export type AssetUsagePlanArtifact = {
  music: AssetUsageMusic[];
  sfx: AssetUsageSfx[];
  visual_assets: AssetUsageVisual[];
};
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
export type ProjectContractVersion = "1.0";

export type ProjectMetadataArtifact = {
  contract_version: ProjectContractVersion;
  provider_execution_mode: ProviderExecutionMode;
  created_at?: string;
  updated_at?: string;
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
  start: number;
  end: number;
  asset_id: string;
  volume: number;
  fade_seconds: number;
  ducking: boolean;
  reason: string;
};

export type EnrichmentSfx = {
  id: string;
  start: number;
  end: number;
  asset_id?: string;
  sfx_id?: string;
  volume: number;
  fade_seconds: number;
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
  version: "2.0";
  profile: EnrichmentProfile;
  elements: EnrichmentElement[];
  audio: {
    music: EnrichmentMusic[];
    sfx: EnrichmentSfx[];
  };
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
  selection_reason?: string;
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
  preview_path?: string;
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
  selection_reason?: string;
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
  reason: string;
  cleanup: ProductionProposalCleanup;
  subtitles: ProductionProposalSubtitles;
  visuals: ProductionProposalVisuals;
  images: ProductionProposalImages;
  music: ProductionProposalMusic;
  sfx: ProductionProposalSfx;
  requires_confirmation: string[];
  business_direction: ProductionBusinessDirection;
  edit_execution_plan: ProductionEditExecutionPlan;
  asset_requirements: ProductionAssetRequirements;
};

export type ProductionBusinessDirection = {
  title: string;
  suitable_for: string;
  editing_strategy: string;
  expected_duration: string;
  asset_style: string;
  risks: string[];
  tradeoffs?: string[];
};

export type ProductionNarrativeBeat = {
  beat: string;
  purpose: string;
  source_hint?: string;
};

export type ProductionKeepSegment = {
  source_id: string;
  start: number;
  end: number;
  reason: string;
};

export type ProductionRemoveSegment = {
  candidate_id: string;
  reason: string;
};

export type ProductionReorderSegment = {
  from: string;
  to: string;
  reason: string;
};

export type ProductionTextOverlay = {
  start: number;
  end: number;
  text: string;
  purpose: string;
};

export type ProductionAssetRequirementKind = "visual_asset" | "music" | "sfx" | "image";

export type ProductionAssetRequirementSlot = {
  slot_id: string;
  kind: ProductionAssetRequirementKind;
  purpose: string;
  query?: string;
  prompt?: string;
  required: boolean;
  suggested_time?: number | string | null;
  duration_hint?: number | string | null;
  placement_hint?: string;
  provider_hint?: string;
  license_constraints?: string;
  cost_constraints?: string;
  source_risk?: string;
};

export type ProductionAssetRequirements = {
  visual_asset_slots: ProductionAssetRequirementSlot[];
  music_slots: ProductionAssetRequirementSlot[];
  sfx_slots: ProductionAssetRequirementSlot[];
  image_slots: ProductionAssetRequirementSlot[];
};

export type ProductionEditExecutionPlan = {
  objective: string;
  target_audience: string;
  final_duration: string;
  narrative_structure: ProductionNarrativeBeat[];
  keep_segments: ProductionKeepSegment[];
  remove_segments: ProductionRemoveSegment[];
  reorder_segments: ProductionReorderSegment[];
  text_overlays: ProductionTextOverlay[];
  user_confirmation_summary: string;
};

export type ProductionProposalArtifact = {
  version: "2.0";
  source_mode: EnrichmentSourceMode;
  presentation_intent: FocusPresentationIntent;
  goal_summary: string;
  material_summary: string;
  recommended_option_id: string;
  options: ProductionProposalOption[];
};

export type ArtifactFingerprint = `sha256:${string}`;
export type ArtifactRole = "authoritative_input" | "command_request" | "evidence" | "derived" | "human_view" | "execution_result" | "temporary";
export type ArtifactAuthor = "cli" | "agent" | "host" | "user";
export type ArtifactState = "missing" | "pending_validation" | "current" | "stale" | "invalid";
export type WorkflowStageState = "not_started" | "ready" | "blocked" | "complete" | "stale" | "failed" | "not_applicable";
export type StageAttemptStatus = "success" | "failed";

export type ArtifactFingerprintReference = {
  key: string;
  fingerprint: ArtifactFingerprint;
  schema_version?: string;
};

export type ArtifactRecord = {
  key: string;
  path: string;
  role: ArtifactRole;
  schema_version: string;
  fingerprint: ArtifactFingerprint;
  file_sha256?: ArtifactFingerprint;
  authored_by: ArtifactAuthor;
  produced_by_command?: string;
  validated_by_command?: string;
  producer_cli_version: string;
  command_contract_version: string;
  inputs: ArtifactFingerprintReference[];
  produced_at?: string;
  validated_at?: string;
};

export type StageAttempt = {
  stage: string;
  command: string;
  input_fingerprint: ArtifactFingerprint;
  inputs?: ArtifactFingerprintReference[];
  status: StageAttemptStatus;
  started_at: string;
  completed_at: string;
  output_artifact_keys: string[];
  failure_code?: string;
  failure_message?: string;
  artifact?: string;
  remediation?: string;
};

export type ArtifactManifest = {
  contract_version: "1.0";
  artifacts: Record<string, ArtifactRecord>;
  stage_attempts: Record<string, StageAttempt>;
  updated_at: string;
};

export type RenderOutputRole = "derived" | "execution_result";

export type RenderOutput = {
  key: string;
  role: RenderOutputRole;
  path: string;
  sha256: ArtifactFingerprint;
  duration_seconds?: number;
  probe?: Record<string, unknown>;
};

export type RenderResult = {
  contract_version: "1.0";
  input_fingerprint: ArtifactFingerprint;
  inputs: ArtifactFingerprintReference[];
  outputs: RenderOutput[];
  canonical_output_key: string;
  enrichment_applied: boolean;
  clean_output_path: string;
  producer_cli_version: string;
  completed_at: string;
};

export type InspectionRemovedRange = {
  candidate_id: string;
  source_id: string;
  start: number;
  end: number;
  type: string;
  reason: string;
  text: string;
};

export type InspectionRetainedRisk = {
  candidate_id?: string;
  source_id?: string;
  start?: number;
  end?: number;
  reason: string;
};

export type InspectionCheckStatus = "sampled" | "warning" | "blocker";
export type InspectionCheckKind = "card" | "element" | "caption_emphasis" | "sfx" | "music";

export type InspectionCheck = {
  id: string;
  source_element_id: string;
  kind: InspectionCheckKind;
  start: number;
  end: number;
  expected: string;
  frame_times: number[];
  frame_paths: string[];
  status: InspectionCheckStatus;
  warnings: string[];
  needs_human_review: boolean;
  asset_id?: string;
  asset_path?: string;
  provider?: string;
  provenance?: string;
  runtime_dependencies?: string[];
};

export type InspectionSummaries = {
  enrichment: string[];
  blocks: string[];
  elements: string[];
  audio: string[];
  assets: string[];
};

export type StatusBlocker = {
  code: string;
  message: string;
  artifact?: string;
  remediation: string;
};

export type InspectionArtifact = {
  contract_version: "1.0";
  render_result_fingerprint: ArtifactFingerprint;
  canonical_output_key: string;
  canonical_output_path: string;
  canonical_output_sha256: ArtifactFingerprint;
  canonical_output_duration_seconds: number;
  canonical_output_probe: Record<string, unknown>;
  expected_duration_seconds: number;
  captions_present: boolean;
  enrichment_applied: boolean;
  source_mode?: EnrichmentSourceMode;
  removed_ranges: InspectionRemovedRange[];
  retained_risks: InspectionRetainedRisk[];
  summaries: InspectionSummaries;
  checks: InspectionCheck[];
  warnings: string[];
  blockers: StatusBlocker[];
  producer_cli_version: string;
  inspected_at: string;
};

export type MusicAcquisitionRecommendation = {
  start: number;
  end: number;
  volume: number;
  fade_seconds: number;
  ducking: boolean;
  offset_seconds: number;
  loop: boolean;
};

export type MusicAcquisitionArtifact = {
  version: "1.0";
  request: MusicRequestArtifact;
  acquired: boolean;
  asset?: AssetManifestEntry;
  recommendation?: MusicAcquisitionRecommendation;
  warnings: string[];
};

export type MusicReviewArtifact = {
  version: "1.0";
  request_id: string;
  status: "ready" | "skipped";
  asset_id?: string;
  provider?: string;
  path?: string;
  duration_seconds?: number;
  license?: string;
  warnings: string[];
  recommended_music_segment?: EnrichmentMusic & { type: "music_segment" };
};

export type ProjectManifestState = "tracked" | "invalid";

export type ProjectArtifactStatus = {
  key: string;
  role: ArtifactRole;
  path: string;
  state: ArtifactState;
  fingerprint?: ArtifactFingerprint;
  reason_code?: string;
  reason?: string;
};

export type ProjectStageStatus = {
  stage: string;
  state: WorkflowStageState;
  input_fingerprint?: ArtifactFingerprint;
  last_attempt?: StageAttempt;
  blockers: StatusBlocker[];
  next_commands: string[];
};

export type ProjectStatusArtifact = {
  contract_version: "1.0";
  project_contract_version: ProjectContractVersion;
  provider_execution_mode: ProviderExecutionMode;
  manifest_state: ProjectManifestState;
  artifacts: ProjectArtifactStatus[];
  stages: ProjectStageStatus[];
  fingerprints: Record<string, ArtifactFingerprint>;
  canonical_deliverable?: { key: string; path: string; fingerprint: ArtifactFingerprint };
  render_inputs: ArtifactFingerprintReference[];
  next_commands: string[];
  blockers: StatusBlocker[];
  last_successful_checkpoint?: { stage: string; completed_at: string; output_artifact_keys: string[] };
  sources?: Array<{ source_id: string; identity: "available"; materialization: "verified" | "unbound" | "invalid" }>;
  render_contract?: {
    ready: boolean;
    export_ready: boolean;
    exported: boolean;
    execution_mode: "local" | "distributed";
    handoff_ready: boolean;
    next_commands: string[];
    blockers: StatusBlocker[];
    current_authoring_fingerprint?: ArtifactFingerprint;
    current_contract_digest?: string;
  };
};

export type ProviderModeCapability = {
  providers: "cli-managed" | "host-managed";
  artifact_contract: "shared";
};

export type CapabilitiesArtifact = {
  contract_version: "1.0";
  cli_version: string;
  project_commands: string[];
  artifact_schema_versions: Record<string, string>;
  features: Record<string, boolean>;
  provider_modes: Record<ProviderExecutionMode, ProviderModeCapability>;
  render_inputs: string[];
  inspect_inputs: string[];
  error_codes: string[];
  capability_ids?: string[];
  delivery?: Record<string, unknown>;
  render_contract?: Record<string, unknown>;
  artifact_contracts?: Record<string, unknown>;
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
        schema_version?: string;
        schema_digest?: string;
        issues?: Array<{ path: string; keyword: string; message: string }>;
      };
    };

export const projectArtifacts = {
  project: "project.json",
  artifactManifest: "artifact-manifest.json",
  sources: "sources.json",
  sourceMaterialization: "source-materialization.json",
  materialReport: "material-report.md",
  transcriptJson: "transcript.json",
  transcriptMarkdown: "transcript.md",
  analysis: "analysis.json",
  reviewMarkdown: "review-package.md",
  reviewJson: "review-package.json",
  productionProposal: "production-proposal.json",
  productionProposalMarkdown: "production-proposal.md",
  editPlan: "edit-plan.json",
  assetUsagePlan: "asset-usage-plan.json",
  edl: "edl.json",
  renderContract: "render-contract.json",
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
  cleanRender: "renders/clean.mp4",
  finalRender: "renders/final.mp4",
  renderResult: "render-result.json",
  inspection: "inspection.json",
  report: "report.md",
} as const;

export function parseProjectMetadata(value: unknown): ProjectMetadataArtifact {
  const obj = strictRecord(value, "project metadata", ["contract_version", "provider_execution_mode", "created_at", "updated_at"]);
  return {
    contract_version: projectContractVersion(obj.contract_version, "contract_version"),
    provider_execution_mode: providerExecutionMode(obj.provider_execution_mode, "provider_execution_mode"),
    created_at: obj.created_at === undefined ? undefined : string(obj.created_at, "created_at"),
    updated_at: obj.updated_at === undefined ? undefined : string(obj.updated_at, "updated_at"),
  };
}

export function parseSourcesManifest(value: unknown): SourcesManifest {
  const obj = strictRecord(value, "sources manifest", ["contract_version", "sources"]);
  const contractVersion = literalVersion(obj.contract_version, "sources contract_version", "2.0");
  const sources = array(obj.sources, "sources").map((item, index): SourceAsset => {
    const source = strictRecord(item, `sources[${index}]`, ["source_id", "order", "original_filename", "local_media_ref", "identity"]);
      const identity = record(source.identity, `sources[${index}].identity`);
      const video = record(identity.video, `sources[${index}].identity.video`);
      const sha256 = string(identity.sha256, `sources[${index}].identity.sha256`);
      if (!/^sha256:[a-f0-9]{64}$/.test(sha256)) throw new Error(`sources[${index}].identity.sha256 must be sha256:<64 lowercase hex>`);
      const audio = identity.audio === undefined ? undefined : record(identity.audio, `sources[${index}].identity.audio`);
      const duration = nonNegativeNumber(identity.duration_seconds, `sources[${index}].identity.duration_seconds`);
      return {
        source_id: string(source.source_id, `sources[${index}].source_id`),
        order: integer(source.order, `sources[${index}].order`),
        original_filename: string(source.original_filename, `sources[${index}].original_filename`),
        local_media_ref: string(source.local_media_ref, `sources[${index}].local_media_ref`),
        duration_seconds: duration,
        identity: {
          sha256,
          size_bytes: integer(identity.size_bytes, `sources[${index}].identity.size_bytes`),
          duration_seconds: duration,
          video: {
            codec_name: string(video.codec_name, `sources[${index}].identity.video.codec_name`),
            width: integer(video.width, `sources[${index}].identity.video.width`),
            height: integer(video.height, `sources[${index}].identity.video.height`),
            display_width: integer(video.display_width, `sources[${index}].identity.video.display_width`),
            display_height: integer(video.display_height, `sources[${index}].identity.video.display_height`),
            rotation: integer(video.rotation, `sources[${index}].identity.video.rotation`),
            avg_frame_rate: string(video.avg_frame_rate, `sources[${index}].identity.video.avg_frame_rate`),
            pixel_format: string(video.pixel_format, `sources[${index}].identity.video.pixel_format`),
          },
          audio: audio === undefined ? undefined : {
            codec_name: string(audio.codec_name, `sources[${index}].identity.audio.codec_name`),
            sample_rate: integer(audio.sample_rate, `sources[${index}].identity.audio.sample_rate`),
            channels: integer(audio.channels, `sources[${index}].identity.audio.channels`),
            channel_layout: string(audio.channel_layout, `sources[${index}].identity.audio.channel_layout`),
          },
        },
      };
  });
  unique(sources.map((source) => source.source_id), "source_id");
  unique(sources.map((source) => String(source.order)), "source order");
  return { contract_version: contractVersion, sources };
}

export function parseSourceMaterialization(value: unknown, manifest?: SourcesManifest): SourceMaterializationArtifact {
  const obj = record(value, "source materialization");
  if (string(obj.contract_version, "contract_version") !== "1.0") throw new Error('source materialization contract_version must be "1.0"');
  const known = sourceIds(manifest);
  const sources = array(obj.sources, "sources").map((item, index) => {
    const source = record(item, `sources[${index}]`);
    const sourceId = string(source.source_id, `sources[${index}].source_id`);
    requireKnownSource(sourceId, known, `sources[${index}].source_id`);
    const projectPath = string(source.project_path, `sources[${index}].project_path`);
    if (projectPath.startsWith("/") || projectPath.split(/[\\/]+/).includes("..")) throw new Error(`sources[${index}].project_path must be project-relative`);
    const sha256 = string(source.sha256, `sources[${index}].sha256`);
    if (!/^sha256:[a-f0-9]{64}$/.test(sha256)) throw new Error(`sources[${index}].sha256 must be sha256:<64 lowercase hex>`);
    return {
      source_id: sourceId,
      project_path: projectPath,
      sha256,
      size_bytes: integer(source.size_bytes, `sources[${index}].size_bytes`),
    };
  });
  unique(sources.map((source) => source.source_id), "materialized source_id");
  return { contract_version: "1.0", sources };
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
  const obj = strictRecord(value, "edit plan", ["contract_version", "confirmed_option_id", "proposal_selection_fingerprint", "decisions", "source_order"]);
  const contract_version = projectContractVersion(obj.contract_version, "contract_version");
  const confirmed_option_id = nonBlankString(obj.confirmed_option_id, "confirmed_option_id");
  const proposal_selection_fingerprint = artifactFingerprint(obj.proposal_selection_fingerprint, "proposal_selection_fingerprint");
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
    contract_version,
    confirmed_option_id,
    proposal_selection_fingerprint,
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

export function parseAssetUsagePlan(value: unknown): AssetUsagePlanArtifact {
  const obj = record(value, "asset usage plan");
  return {
    music: array(obj.music ?? [], "asset_usage_plan.music").map((item, index) => assetUsageMusic(item, `asset_usage_plan.music[${index}]`)),
    sfx: array(obj.sfx ?? [], "asset_usage_plan.sfx").map((item, index) => assetUsageSfx(item, `asset_usage_plan.sfx[${index}]`)),
    visual_assets: array(obj.visual_assets ?? [], "asset_usage_plan.visual_assets").map((item, index) =>
      assetUsageVisual(item, `asset_usage_plan.visual_assets[${index}]`),
    ),
  };
}

export function parseEdl(value: unknown, manifest?: SourcesManifest): EdlArtifact {
  const known = sourceIds(manifest);
  const obj = strictRecord(value, "edl", ["contract_version", "entries"]);
  const contractVersion = literalVersion(obj.contract_version, "EDL contract_version", "2.0");
  const entries = array(obj.entries, "entries").map((item, index): EdlEntry => {
    const entry = strictRecord(item, `entries[${index}]`, ["source_id", "start", "end", "output_order", "reason", "quote", "label"]);
    const source_id = string(entry.source_id, `entries[${index}].source_id`);
    requireKnownSource(source_id, known, `entries[${index}].source_id`);
    const start = nonNegativeNumber(entry.start, `entries[${index}].start`);
    const end = nonNegativeNumber(entry.end, `entries[${index}].end`);
    if (end <= start) throw new Error(`entries[${index}].end must be greater than start`);
    const source = manifest?.sources.find((item) => item.source_id === source_id);
    if (source && end > source.duration_seconds) throw new Error(`entries[${index}].end exceeds source duration`);
    return {
      source_id,
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
  return { contract_version: contractVersion, entries };
}

export function parseEnrichmentPlan(value: unknown): EnrichmentPlanArtifact {
  const obj = strictRecord(value, "enrichment plan", ["version", "profile", "elements", "audio"]);
  const version = literalVersion(obj.version, "enrichment plan version", "2.0");
  const profile = enrichmentProfile(obj.profile, "profile");
  const elements = array(obj.elements, "elements").map((item, index): EnrichmentElement => enrichmentElement(item, `elements[${index}]`));
  const audio = strictRecord(obj.audio, "audio", ["music", "sfx"]);
  const music = array(audio.music, "audio.music").map((item, index) => enrichmentMusic(item, `audio.music[${index}]`));
  const sfx = array(audio.sfx, "audio.sfx").map((item, index) => enrichmentSfx(item, `audio.sfx[${index}]`));
  unique([...elements.map((item) => item.id), ...music.map((item) => item.id), ...sfx.map((item) => item.id)], "enrichment id");
  return { version, profile, elements, audio: { music, sfx } };
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
  assertProductionProposalContract(value);
  const obj = strictRecord(value, "production proposal", ["version", "source_mode", "presentation_intent", "goal_summary", "material_summary", "recommended_option_id", "options"]);
  const recommendedOptionId = string(obj.recommended_option_id, "recommended_option_id");
  return {
    version: "2.0",
    source_mode: sourceMode(obj.source_mode, "source_mode"),
    presentation_intent: focusPresentationIntent(obj.presentation_intent, "presentation_intent"),
    goal_summary: nonBlankString(obj.goal_summary, "goal_summary"),
    material_summary: nonBlankString(obj.material_summary, "material_summary"),
    recommended_option_id: recommendedOptionId,
    options: array(obj.options, "options").map((item, index): ProductionProposalOption => productionProposalOption(item, `options[${index}]`)),
  };
}

export function parseArtifactManifest(value: unknown): ArtifactManifest {
  const obj = strictRecord(value, "artifact manifest", ["contract_version", "artifacts", "stage_attempts", "updated_at"]);
  const contractVersion = literalVersion(obj.contract_version, "artifact manifest contract_version", "1.0");
  const artifactValues = record(obj.artifacts, "artifacts");
  const artifacts: Record<string, ArtifactRecord> = {};
  for (const [key, item] of Object.entries(artifactValues)) {
    const parsedKey = artifactKey(key, `artifacts.${key} key`);
    const artifact = artifactRecord(item, `artifacts.${key}`);
    if (artifact.key !== parsedKey) throw new Error(`artifacts.${key}.key must match manifest key ${key}`);
    artifacts[key] = artifact;
  }
  unique(Object.values(artifacts).map((artifact) => artifact.path), "artifact path");

  const attemptValues = record(obj.stage_attempts, "stage_attempts");
  const stage_attempts: Record<string, StageAttempt> = {};
  for (const [key, item] of Object.entries(attemptValues)) {
    const parsedKey = artifactKey(key, `stage_attempts.${key} key`);
    const attempt = stageAttempt(item, `stage_attempts.${key}`);
    if (attempt.stage !== parsedKey) throw new Error(`stage_attempts.${key}.stage must match stage key ${key}`);
    stage_attempts[key] = attempt;
  }

  validateArtifactManifestIntegrity(artifacts, stage_attempts);

  return {
    contract_version: contractVersion,
    artifacts,
    stage_attempts,
    updated_at: timestamp(obj.updated_at, "updated_at"),
  };
}

export function parseRenderResult(value: unknown): RenderResult {
  const obj = strictRecord(value, "render result", [
    "contract_version",
    "input_fingerprint",
    "inputs",
    "outputs",
    "canonical_output_key",
    "enrichment_applied",
    "clean_output_path",
    "producer_cli_version",
    "completed_at",
  ]);
  const inputs = fingerprintReferences(obj.inputs, "inputs");
  const outputs = array(obj.outputs, "outputs").map((item, index) => renderOutput(item, `outputs[${index}]`));
  if (outputs.length === 0) throw new Error("outputs must include at least one render output");
  unique(outputs.map((output) => output.key), "render output key");
  unique(outputs.map((output) => output.path), "render output path");
  const canonical_output_key = artifactKey(obj.canonical_output_key, "canonical_output_key");
  const canonicalOutput = outputs.find((output) => output.key === canonical_output_key);
  if (!canonicalOutput) throw new Error("canonical_output_key must match an output key");
  if (!canonicalOutput.path.toLowerCase().endsWith(".mp4")) throw new Error("canonical_output_key must reference an MP4 output");
  const clean_output_path = managedProjectPath(obj.clean_output_path, "clean_output_path");
  if (!outputs.some((output) => output.path === clean_output_path)) throw new Error("clean_output_path must match an output path");
  const enrichment_applied = boolean(obj.enrichment_applied, "enrichment_applied");
  if (!enrichment_applied && canonicalOutput.path !== clean_output_path) {
    throw new Error("canonical_output_key must reference clean_output_path when enrichment_applied is false");
  }
  return {
    contract_version: literalVersion(obj.contract_version, "render result contract_version", "1.0"),
    input_fingerprint: artifactFingerprint(obj.input_fingerprint, "input_fingerprint"),
    inputs,
    outputs,
    canonical_output_key,
    enrichment_applied,
    clean_output_path,
    producer_cli_version: nonBlankString(obj.producer_cli_version, "producer_cli_version"),
    completed_at: timestamp(obj.completed_at, "completed_at"),
  };
}

export function parseInspection(value: unknown): InspectionArtifact {
  const obj = strictRecord(value, "inspection", [
    "contract_version",
    "render_result_fingerprint",
    "canonical_output_key",
    "canonical_output_path",
    "canonical_output_sha256",
    "canonical_output_duration_seconds",
    "canonical_output_probe",
    "expected_duration_seconds",
    "captions_present",
    "enrichment_applied",
    "source_mode",
    "removed_ranges",
    "retained_risks",
    "summaries",
    "checks",
    "warnings",
    "blockers",
    "producer_cli_version",
    "inspected_at",
  ]);
  const canonical_output_path = managedProjectPath(obj.canonical_output_path, "canonical_output_path");
  if (!canonical_output_path.toLowerCase().endsWith(".mp4")) throw new Error("canonical_output_path must reference an MP4");
  return {
    contract_version: literalVersion(obj.contract_version, "inspection contract_version", "1.0"),
    render_result_fingerprint: artifactFingerprint(obj.render_result_fingerprint, "render_result_fingerprint"),
    canonical_output_key: artifactKey(obj.canonical_output_key, "canonical_output_key"),
    canonical_output_path,
    canonical_output_sha256: artifactFingerprint(obj.canonical_output_sha256, "canonical_output_sha256"),
    canonical_output_duration_seconds: nonNegativeNumber(obj.canonical_output_duration_seconds, "canonical_output_duration_seconds"),
    canonical_output_probe: record(obj.canonical_output_probe, "canonical_output_probe"),
    expected_duration_seconds: nonNegativeNumber(obj.expected_duration_seconds, "expected_duration_seconds"),
    captions_present: boolean(obj.captions_present, "captions_present"),
    enrichment_applied: boolean(obj.enrichment_applied, "enrichment_applied"),
    source_mode: obj.source_mode === undefined ? undefined : sourceMode(obj.source_mode, "source_mode"),
    removed_ranges: array(obj.removed_ranges, "removed_ranges").map((item, index) => inspectionRemovedRange(item, `removed_ranges[${index}]`)),
    retained_risks: array(obj.retained_risks, "retained_risks").map((item, index) => inspectionRetainedRisk(item, `retained_risks[${index}]`)),
    summaries: inspectionSummaries(obj.summaries, "summaries"),
    checks: array(obj.checks, "checks").map((item, index) => inspectionCheck(item, `checks[${index}]`)),
    warnings: optionalStringArray(obj.warnings, "warnings"),
    blockers: array(obj.blockers, "blockers").map((item, index) => statusBlocker(item, `blockers[${index}]`)),
    producer_cli_version: nonBlankString(obj.producer_cli_version, "producer_cli_version"),
    inspected_at: timestamp(obj.inspected_at, "inspected_at"),
  };
}

export function parseMusicAcquisition(value: unknown): MusicAcquisitionArtifact {
  const obj = strictRecord(value, "music acquisition", ["version", "request", "acquired", "asset", "recommendation", "warnings"]);
  const acquired = boolean(obj.acquired, "acquired");
  const asset = obj.asset === undefined ? undefined : parseAssetManifest({ assets: [obj.asset] }).assets[0];
  const recommendation = obj.recommendation === undefined ? undefined : musicAcquisitionRecommendation(obj.recommendation, "recommendation");
  if (acquired && !asset) throw new Error("asset is required when acquired is true");
  if (acquired && !recommendation) throw new Error("recommendation is required when acquired is true");
  if (!acquired && (asset || recommendation)) throw new Error("asset and recommendation must not appear when acquired is false");
  return {
    version: literalVersion(obj.version, "music acquisition version", "1.0"),
    request: parseMusicRequest(obj.request),
    acquired,
    asset,
    recommendation,
    warnings: optionalStringArray(obj.warnings, "warnings"),
  };
}

export function parseMusicReview(value: unknown): MusicReviewArtifact {
  const obj = strictRecord(value, "music review", [
    "version",
    "request_id",
    "status",
    "asset_id",
    "provider",
    "path",
    "duration_seconds",
    "license",
    "warnings",
    "recommended_music_segment",
  ]);
  const status = musicReviewStatus(obj.status, "status");
  const asset_id = obj.asset_id === undefined ? undefined : nonBlankString(obj.asset_id, "asset_id");
  const path = obj.path === undefined ? undefined : managedProjectPath(obj.path, "path");
  const recommended_music_segment = obj.recommended_music_segment === undefined
    ? undefined
    : musicReviewSegment(obj.recommended_music_segment);
  if (status === "ready" && (!asset_id || !path || !recommended_music_segment)) {
    throw new Error("ready music review requires asset_id, path, and recommended_music_segment");
  }
  if (status === "skipped" && (asset_id || path || recommended_music_segment)) {
    throw new Error("skipped music review must not include asset_id, path, or recommended_music_segment");
  }
  if (recommended_music_segment && recommended_music_segment.asset_id !== asset_id) {
    throw new Error("recommended_music_segment.asset_id must match asset_id");
  }
  return {
    version: literalVersion(obj.version, "music review version", "1.0"),
    request_id: nonBlankString(obj.request_id, "request_id"),
    status,
    asset_id,
    provider: obj.provider === undefined ? undefined : nonBlankString(obj.provider, "provider"),
    path,
    duration_seconds: obj.duration_seconds === undefined ? undefined : nonNegativeNumber(obj.duration_seconds, "duration_seconds"),
    license: obj.license === undefined ? undefined : nonBlankString(obj.license, "license"),
    warnings: optionalStringArray(obj.warnings, "warnings"),
    recommended_music_segment,
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
  assertArtifactContract("source-frame-request", value);
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
  const obj = strictRecord(value, name, [
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
  ]);
  return {
    id: opaqueIdentifier(obj.id, `${name}.id`),
    label: nonBlankString(obj.label, `${name}.label`),
    reason: nonBlankString(obj.reason, `${name}.reason`),
    cleanup: productionProposalCleanup(obj.cleanup, `${name}.cleanup`),
    subtitles: productionProposalSubtitles(obj.subtitles, `${name}.subtitles`),
    visuals: productionProposalVisuals(obj.visuals, `${name}.visuals`),
    images: productionProposalImages(obj.images, `${name}.images`),
    music: productionProposalMusic(obj.music, `${name}.music`),
    sfx: productionProposalSfx(obj.sfx, `${name}.sfx`),
    requires_confirmation: optionalStringArray(obj.requires_confirmation, `${name}.requires_confirmation`),
    business_direction: productionBusinessDirection(obj.business_direction, `${name}.business_direction`),
    edit_execution_plan: productionEditExecutionPlan(obj.edit_execution_plan, `${name}.edit_execution_plan`),
    asset_requirements: productionAssetRequirements(obj.asset_requirements, `${name}.asset_requirements`),
  };
}

function productionBusinessDirection(value: unknown, name: string): ProductionBusinessDirection {
  const obj = strictRecord(value, name, [
    "title",
    "suitable_for",
    "editing_strategy",
    "expected_duration",
    "asset_style",
    "risks",
    "tradeoffs",
  ]);
  return {
    title: nonBlankString(obj.title, `${name}.title`),
    suitable_for: nonBlankString(obj.suitable_for, `${name}.suitable_for`),
    editing_strategy: nonBlankString(obj.editing_strategy, `${name}.editing_strategy`),
    expected_duration: nonBlankString(obj.expected_duration, `${name}.expected_duration`),
    asset_style: nonBlankString(obj.asset_style, `${name}.asset_style`),
    risks: optionalStringArray(obj.risks, `${name}.risks`),
    tradeoffs: obj.tradeoffs === undefined ? undefined : optionalStringArray(obj.tradeoffs, `${name}.tradeoffs`),
  };
}

function productionEditExecutionPlan(value: unknown, name: string): ProductionEditExecutionPlan {
  const obj = strictRecord(value, name, [
    "objective",
    "target_audience",
    "final_duration",
    "narrative_structure",
    "keep_segments",
    "remove_segments",
    "reorder_segments",
    "text_overlays",
    "user_confirmation_summary",
  ]);
  return {
    objective: nonBlankString(obj.objective, `${name}.objective`),
    target_audience: nonBlankString(obj.target_audience, `${name}.target_audience`),
    final_duration: nonBlankString(obj.final_duration, `${name}.final_duration`),
    narrative_structure: array(obj.narrative_structure, `${name}.narrative_structure`).map((item, index) =>
      productionNarrativeBeat(item, `${name}.narrative_structure[${index}]`),
    ),
    keep_segments: array(obj.keep_segments, `${name}.keep_segments`).map((item, index) => productionKeepSegment(item, `${name}.keep_segments[${index}]`)),
    remove_segments: array(obj.remove_segments, `${name}.remove_segments`).map((item, index) => productionRemoveSegment(item, `${name}.remove_segments[${index}]`)),
    reorder_segments: array(obj.reorder_segments, `${name}.reorder_segments`).map((item, index) => productionReorderSegment(item, `${name}.reorder_segments[${index}]`)),
    text_overlays: array(obj.text_overlays, `${name}.text_overlays`).map((item, index) => productionTextOverlay(item, `${name}.text_overlays[${index}]`)),
    user_confirmation_summary: nonBlankString(obj.user_confirmation_summary, `${name}.user_confirmation_summary`),
  };
}

function productionAssetRequirements(value: unknown, name: string): ProductionAssetRequirements {
  const obj = strictRecord(value, name, ["visual_asset_slots", "music_slots", "sfx_slots", "image_slots"]);
  return {
    visual_asset_slots: productionAssetRequirementSlots(obj.visual_asset_slots, `${name}.visual_asset_slots`, "visual_asset"),
    music_slots: productionAssetRequirementSlots(obj.music_slots, `${name}.music_slots`, "music"),
    sfx_slots: productionAssetRequirementSlots(obj.sfx_slots, `${name}.sfx_slots`, "sfx"),
    image_slots: productionAssetRequirementSlots(obj.image_slots, `${name}.image_slots`, "image"),
  };
}

function productionNarrativeBeat(value: unknown, name: string): ProductionNarrativeBeat {
  const obj = strictRecord(value, name, ["beat", "purpose", "source_hint"]);
  return {
    beat: nonBlankString(obj.beat, `${name}.beat`),
    purpose: nonBlankString(obj.purpose, `${name}.purpose`),
    source_hint: obj.source_hint === undefined ? undefined : nonBlankString(obj.source_hint, `${name}.source_hint`),
  };
}

function productionKeepSegment(value: unknown, name: string): ProductionKeepSegment {
  const obj = strictRecord(value, name, ["source_id", "start", "end", "reason"]);
  const start = nonNegativeNumber(obj.start, `${name}.start`);
  const end = nonNegativeNumber(obj.end, `${name}.end`);
  if (end <= start) throw new Error(`${name}.end must be greater than start`);
  return {
    source_id: opaqueIdentifier(obj.source_id, `${name}.source_id`),
    start,
    end,
    reason: nonBlankString(obj.reason, `${name}.reason`),
  };
}

function productionRemoveSegment(value: unknown, name: string): ProductionRemoveSegment {
  const obj = strictRecord(value, name, ["candidate_id", "reason"]);
  return {
    candidate_id: opaqueIdentifier(obj.candidate_id, `${name}.candidate_id`),
    reason: nonBlankString(obj.reason, `${name}.reason`),
  };
}

function productionReorderSegment(value: unknown, name: string): ProductionReorderSegment {
  const obj = strictRecord(value, name, ["from", "to", "reason"]);
  return {
    from: nonBlankString(obj.from, `${name}.from`),
    to: nonBlankString(obj.to, `${name}.to`),
    reason: nonBlankString(obj.reason, `${name}.reason`),
  };
}

function productionTextOverlay(value: unknown, name: string): ProductionTextOverlay {
  const obj = strictRecord(value, name, ["start", "end", "text", "purpose"]);
  const start = nonNegativeNumber(obj.start, `${name}.start`);
  const end = nonNegativeNumber(obj.end, `${name}.end`);
  if (end <= start) throw new Error(`${name}.end must be greater than start`);
  return {
    start,
    end,
    text: nonBlankString(obj.text, `${name}.text`),
    purpose: nonBlankString(obj.purpose, `${name}.purpose`),
  };
}

function productionAssetRequirementSlots(value: unknown, name: string, expectedKind: ProductionAssetRequirementKind): ProductionAssetRequirementSlot[] {
  const slots = array(value, name).map((item, index) => productionAssetRequirementSlot(item, `${name}[${index}]`, expectedKind));
  unique(slots.map((slot) => slot.slot_id), `${name} slot_id`);
  return slots;
}

function productionAssetRequirementSlot(value: unknown, name: string, expectedKind: ProductionAssetRequirementKind): ProductionAssetRequirementSlot {
  const obj = strictRecord(value, name, [
    "slot_id",
    "kind",
    "purpose",
    "query",
    "prompt",
    "required",
    "suggested_time",
    "duration_hint",
    "placement_hint",
    "provider_hint",
    "license_constraints",
    "cost_constraints",
    "source_risk",
  ]);
  const kind = productionAssetRequirementKind(obj.kind, `${name}.kind`);
  if (kind !== expectedKind) throw new Error(`${name}.kind must be ${expectedKind}`);
  return {
    slot_id: opaqueIdentifier(obj.slot_id, `${name}.slot_id`),
    kind,
    purpose: nonBlankString(obj.purpose, `${name}.purpose`),
    query: obj.query === undefined ? undefined : nonBlankString(obj.query, `${name}.query`),
    prompt: obj.prompt === undefined ? undefined : nonBlankString(obj.prompt, `${name}.prompt`),
    required: boolean(obj.required, `${name}.required`),
    suggested_time: optionalStringNumberOrNull(obj.suggested_time, `${name}.suggested_time`),
    duration_hint: optionalStringNumberOrNull(obj.duration_hint, `${name}.duration_hint`),
    placement_hint: obj.placement_hint === undefined ? undefined : nonBlankString(obj.placement_hint, `${name}.placement_hint`),
    provider_hint: obj.provider_hint === undefined ? undefined : nonBlankString(obj.provider_hint, `${name}.provider_hint`),
    license_constraints: obj.license_constraints === undefined ? undefined : nonBlankString(obj.license_constraints, `${name}.license_constraints`),
    cost_constraints: obj.cost_constraints === undefined ? undefined : nonBlankString(obj.cost_constraints, `${name}.cost_constraints`),
    source_risk: obj.source_risk === undefined ? undefined : nonBlankString(obj.source_risk, `${name}.source_risk`),
  };
}

function productionProposalCleanup(value: unknown, name: string): ProductionProposalCleanup {
  const obj = strictRecord(value, name, ["cut_candidate_ids", "keep_strategy", "risks"]);
  return {
    cut_candidate_ids: array(obj.cut_candidate_ids ?? [], `${name}.cut_candidate_ids`).map((item, index) => string(item, `${name}.cut_candidate_ids[${index}]`)),
    keep_strategy: string(obj.keep_strategy, `${name}.keep_strategy`),
    risks: optionalStringArray(obj.risks, `${name}.risks`),
  };
}

function productionProposalSubtitles(value: unknown, name: string): ProductionProposalSubtitles {
  const obj = strictRecord(value, name, ["enabled", "style", "conflict_notes"]);
  return {
    enabled: boolean(obj.enabled, `${name}.enabled`),
    style: string(obj.style, `${name}.style`),
    conflict_notes: optionalStringArray(obj.conflict_notes, `${name}.conflict_notes`),
  };
}

function productionProposalVisuals(value: unknown, name: string): ProductionProposalVisuals {
  const obj = strictRecord(value, name, ["direction", "viewer_job", "requires_grounding", "notes"]);
  return {
    direction: string(obj.direction, `${name}.direction`),
    viewer_job: string(obj.viewer_job, `${name}.viewer_job`),
    requires_grounding: boolean(obj.requires_grounding, `${name}.requires_grounding`),
    notes: optionalStringArray(obj.notes, `${name}.notes`),
  };
}

function productionProposalImages(value: unknown, name: string): ProductionProposalImages {
  const obj = strictRecord(value, name, ["needed", "reason", "missing_assets"]);
  rejectPrematureAssetRefs(obj, name);
  return {
    needed: boolean(obj.needed, `${name}.needed`),
    reason: string(obj.reason, `${name}.reason`),
    missing_assets: optionalStringArray(obj.missing_assets, `${name}.missing_assets`),
  };
}

function productionProposalMusic(value: unknown, name: string): ProductionProposalMusic {
  const obj = strictRecord(value, name, ["source", "mood", "ducking", "notes"]);
  rejectPrematureAssetRefs(obj, name);
  return {
    source: musicRequestSource(obj.source, `${name}.source`),
    mood: obj.mood === undefined ? undefined : string(obj.mood, `${name}.mood`),
    ducking: boolean(obj.ducking, `${name}.ducking`),
    notes: optionalStringArray(obj.notes, `${name}.notes`),
  };
}

function productionProposalSfx(value: unknown, name: string): ProductionProposalSfx {
  const obj = strictRecord(value, name, ["enabled", "usage", "restraint"]);
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

export function defaultEnrichmentProfile(sourceMode: EnrichmentSourceMode = "talking_head_avatar"): EnrichmentProfile {
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
  const obj = strictRecord(value, name, ["source_mode", "aspect_ratio", "caption_identity", "layout", "style", "frame"]);
  const source_mode = sourceMode(obj.source_mode, `${name}.source_mode`);
  return {
    source_mode,
    aspect_ratio: aspectRatio(obj.aspect_ratio, `${name}.aspect_ratio`),
    caption_identity: captionIdentity(obj.caption_identity, `${name}.caption_identity`),
    layout: enrichmentLayout(obj.layout, `${name}.layout`),
    style: enrichmentStyle(obj.style, `${name}.style`),
    frame: enrichmentFrame(obj.frame, `${name}.frame`),
  };
}

function enrichmentMusic(value: unknown, name: string): EnrichmentMusic {
  const obj = strictRecord(value, name, ["id", "asset_id", "start", "end", "volume", "fade_seconds", "ducking", "reason"]);
  const start = nonNegativeNumber(obj.start, `${name}.start`);
  const end = nonNegativeNumber(obj.end, `${name}.end`);
  if (end <= start) throw new Error(`${name}.end must be greater than start`);
  return {
    id: string(obj.id, `${name}.id`),
    start,
    end,
    asset_id: string(obj.asset_id, `${name}.asset_id`),
    volume: bounded(obj.volume, `${name}.volume`, 0, 1),
    fade_seconds: bounded(obj.fade_seconds, `${name}.fade_seconds`, 0, end - start),
    ducking: boolean(obj.ducking, `${name}.ducking`),
    reason: string(obj.reason, `${name}.reason`),
  };
}

function musicReviewSegment(value: unknown): EnrichmentMusic & { type: "music_segment" } {
  const { type, ...segment } = record(value, "recommended_music_segment");
  if (type !== "music_segment") throw new Error("recommended_music_segment.type must be music_segment");
  return { ...enrichmentMusic(segment, "recommended_music_segment"), type };
}

function enrichmentSfx(value: unknown, name: string): EnrichmentSfx {
  const obj = strictRecord(value, name, ["id", "asset_id", "sfx_id", "start", "end", "volume", "fade_seconds", "reason"]);
  const start = nonNegativeNumber(obj.start, `${name}.start`);
  const end = nonNegativeNumber(obj.end, `${name}.end`);
  if (end <= start) throw new Error(`${name}.end must be greater than start`);
  const assetId = obj.asset_id === undefined ? undefined : string(obj.asset_id, `${name}.asset_id`);
  const sfxId = obj.sfx_id === undefined ? undefined : string(obj.sfx_id, `${name}.sfx_id`);
  if (Boolean(assetId) === Boolean(sfxId)) throw new Error(`${name} requires exactly one of asset_id or sfx_id`);
  if (sfxId) assertKnownVendoredElement(sfxId, "sfx", `${name}.sfx_id`);
  return {
    id: string(obj.id, `${name}.id`),
    start,
    end,
    asset_id: assetId,
    sfx_id: sfxId,
    volume: bounded(obj.volume, `${name}.volume`, 0, 1),
    fade_seconds: bounded(obj.fade_seconds, `${name}.fade_seconds`, 0, end - start),
    reason: string(obj.reason, `${name}.reason`),
  };
}

function assetUsageMusic(value: unknown, name: string): AssetUsageMusic {
  const obj = record(value, name);
  const start = nonNegativeNumber(obj.start, `${name}.start`);
  const end = nonNegativeNumber(obj.end, `${name}.end`);
  if (end <= start) throw new Error(`${name}.end must be greater than start`);
  return {
    id: obj.id === undefined ? undefined : string(obj.id, `${name}.id`),
    asset_ref: safeRelativePath(string(obj.asset_ref, `${name}.asset_ref`), `${name}.asset_ref`),
    start,
    end,
    volume: bounded(obj.volume ?? 0.18, `${name}.volume`, 0, 1),
    duck_original_audio: obj.duck_original_audio === undefined ? true : boolean(obj.duck_original_audio, `${name}.duck_original_audio`),
    fade_in: nonNegativeNumber(obj.fade_in ?? obj.fade_seconds ?? 0.5, `${name}.fade_in`),
    fade_out: nonNegativeNumber(obj.fade_out ?? obj.fade_seconds ?? 0.5, `${name}.fade_out`),
    purpose: string(obj.purpose, `${name}.purpose`),
  };
}

function assetUsageSfx(value: unknown, name: string): AssetUsageSfx {
  const obj = record(value, name);
  const duration = nonNegativeNumber(obj.duration ?? 0.25, `${name}.duration`);
  if (duration <= 0) throw new Error(`${name}.duration must be greater than 0`);
  return {
    id: obj.id === undefined ? undefined : string(obj.id, `${name}.id`),
    asset_ref: safeRelativePath(string(obj.asset_ref, `${name}.asset_ref`), `${name}.asset_ref`),
    time: nonNegativeNumber(obj.time, `${name}.time`),
    duration,
    volume: bounded(obj.volume ?? 0.35, `${name}.volume`, 0, 1),
    fade_seconds: nonNegativeNumber(obj.fade_seconds ?? 0.03, `${name}.fade_seconds`),
    purpose: string(obj.purpose, `${name}.purpose`),
  };
}

function assetUsageVisual(value: unknown, name: string): AssetUsageVisual {
  const obj = record(value, name);
  const start = nonNegativeNumber(obj.start, `${name}.start`);
  const end = nonNegativeNumber(obj.end, `${name}.end`);
  if (end <= start) throw new Error(`${name}.end must be greater than start`);
  return {
    id: obj.id === undefined ? undefined : string(obj.id, `${name}.id`),
    asset_ref: safeRelativePath(string(obj.asset_ref, `${name}.asset_ref`), `${name}.asset_ref`),
    start,
    end,
    position: obj.position === undefined ? "upper_third" : assetUsagePosition(obj.position, `${name}.position`),
    size: obj.size === undefined ? undefined : assetUsageSize(obj.size, `${name}.size`),
    animation: obj.animation === undefined ? undefined : assetUsageAnimation(obj.animation, `${name}.animation`),
    asset_type: obj.asset_type === undefined ? undefined : visualAssetType(obj.asset_type, `${name}.asset_type`),
    purpose: string(obj.purpose, `${name}.purpose`),
  };
}

function enrichmentElement(value: unknown, name: string): EnrichmentElement {
  const obj = strictRecord(value, name, ["id", "source", "element_id", "element_type", "start", "end", "reason", "zone", "target_rect", "anchor_point", "params", "asset_id", "caption_identity"]);
  const type = enrichmentElementType(obj.element_type, `${name}.element_type`);
  const start = nonNegativeNumber(obj.start, `${name}.start`);
  const end = nonNegativeNumber(obj.end, `${name}.end`);
  if (end <= start) throw new Error(`${name}.end must be greater than start`);
  const elementId = string(obj.element_id, `${name}.element_id`);
  if (type === "visual_asset" && obj.asset_id === undefined) throw new Error(`${name}.asset_id is required for visual_asset elements`);
  if (type !== "visual_asset") {
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
    selection_reason: obj.selection_reason === undefined ? undefined : nonBlankString(obj.selection_reason, `${name}.selection_reason`),
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
    preview_path: obj.preview_path === undefined ? undefined : visualCandidatePath(obj.preview_path, `${name}.preview_path`),
    source_url: obj.source_url === undefined ? undefined : urlString(obj.source_url, `${name}.source_url`),
    download_url: obj.download_url === undefined ? undefined : urlString(obj.download_url, `${name}.download_url`),
    local_path: obj.local_path === undefined ? undefined : visualCandidatePath(obj.local_path, `${name}.local_path`),
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
    selection_reason: obj.selection_reason === undefined ? undefined : nonBlankString(obj.selection_reason, `${name}.selection_reason`),
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
  if (type !== "visual_asset") assertKnownVendoredElement(elementId, type, `${name}.element_id`);
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
  const catalog = element.element_type === "visual_asset" ? undefined : assertKnownVendoredElement(element.element_id, element.element_type, `${name}.element_id`);
  const haystack = [element.element_id, catalog?.title ?? "", ...(catalog?.tags ?? [])].join(" ").toLowerCase();
  if ((element.element_type === "registry_block" || element.element_type === "animation_rule") && /zoom|focus|cursor|spotlight|marker/.test(haystack) && !element.target_rect) {
    throw new Error(`${name}.target_rect is required for focus proposed elements`);
  }
  if (element.element_type === "registry_component" && /shimmer|highlight|callout|effect/.test(haystack) && !haystack.includes("caption") && !element.anchor_point) {
    throw new Error(`${name}.anchor_point is required for anchored proposed elements`);
  }
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
  if (value === "registry_block" || value === "registry_component" || value === "animation_rule" || value === "caption_identity" || value === "visual_asset") {
    return value;
  }
  throw new Error(`${name} must be registry_block, registry_component, animation_rule, caption_identity, or visual_asset`);
}

function position(value: unknown, name: string): EnrichmentPosition {
  if (value === "full_frame" || value === "upper_third" || value === "lower_third" || value === "left_panel" || value === "right_panel" || value === "center") return value;
  throw new Error(`${name} must be a supported enrichment position`);
}

function assetUsagePosition(value: unknown, name: string): AssetUsagePosition {
  if (value === "top-left" || value === "top-right" || value === "bottom-left" || value === "bottom-right") return value;
  return position(value, name);
}

function assetUsageSize(value: unknown, name: string): AssetUsageVisual["size"] {
  if (value === "small" || value === "medium" || value === "large") return value;
  throw new Error(`${name} must be small, medium, or large`);
}

function assetUsageAnimation(value: unknown, name: string): AssetUsageVisual["animation"] {
  if (value === "none" || value === "fade-in") return value;
  throw new Error(`${name} must be none or fade-in`);
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

function projectContractVersion(value: unknown, name: string): ProjectContractVersion {
  if (value === "1.0") return value;
  throw new Error(`${name} must be "1.0"`);
}

function productionAssetRequirementKind(value: unknown, name: string): ProductionAssetRequirementKind {
  if (value === "visual_asset" || value === "music" || value === "sfx" || value === "image") return value;
  throw new Error(`${name} must be visual_asset, music, sfx, or image`);
}

function musicReviewStatus(value: unknown, name: string): MusicReviewArtifact["status"] {
  if (value === "ready" || value === "skipped") return value;
  throw new Error(`${name} must be ready or skipped`);
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

function literalVersion<TVersion extends string>(value: unknown, name: string, expected: TVersion): TVersion {
  if (value !== expected) throw new Error(`${name} must be "${expected}"`);
  return expected;
}

function artifactFingerprint(value: unknown, name: string): ArtifactFingerprint {
  const text = nonBlankString(value, name);
  if (!/^sha256:[a-f0-9]{64}$/.test(text)) throw new Error(`${name} must use sha256:<64 hex>`);
  return text as ArtifactFingerprint;
}

function artifactKey(value: unknown, name: string): string {
  const text = nonBlankString(value, name);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(text)) throw new Error(`${name} must be a stable artifact key`);
  return text;
}

function artifactRole(value: unknown, name: string): ArtifactRole {
  if (
    value === "authoritative_input" ||
    value === "command_request" ||
    value === "evidence" ||
    value === "derived" ||
    value === "human_view" ||
    value === "execution_result" ||
    value === "temporary"
  ) {
    return value;
  }
  throw new Error(`${name} must be a supported artifact role`);
}

function artifactAuthor(value: unknown, name: string): ArtifactAuthor {
  if (value === "cli" || value === "agent" || value === "host" || value === "user") return value;
  throw new Error(`${name} must be cli, agent, host, or user`);
}

function fingerprintReference(value: unknown, name: string): ArtifactFingerprintReference {
  const obj = strictRecord(value, name, ["key", "fingerprint", "schema_version"]);
  return {
    key: artifactKey(obj.key, `${name}.key`),
    fingerprint: artifactFingerprint(obj.fingerprint, `${name}.fingerprint`),
    schema_version: obj.schema_version === undefined ? undefined : nonBlankString(obj.schema_version, `${name}.schema_version`),
  };
}

function fingerprintReferences(value: unknown, name: string): ArtifactFingerprintReference[] {
  const references = array(value, name).map((item, index) => fingerprintReference(item, `${name}[${index}]`));
  unique(references.map((reference) => reference.key), `${name} key`);
  return references;
}

function artifactRecord(value: unknown, name: string): ArtifactRecord {
  const obj = strictRecord(value, name, [
    "key",
    "path",
    "role",
    "schema_version",
    "fingerprint",
    "file_sha256",
    "authored_by",
    "produced_by_command",
    "validated_by_command",
    "producer_cli_version",
    "command_contract_version",
    "inputs",
    "produced_at",
    "validated_at",
  ]);
  const produced_by_command = obj.produced_by_command === undefined ? undefined : nonBlankString(obj.produced_by_command, `${name}.produced_by_command`);
  const validated_by_command = obj.validated_by_command === undefined ? undefined : nonBlankString(obj.validated_by_command, `${name}.validated_by_command`);
  if (Boolean(produced_by_command) === Boolean(validated_by_command)) {
    throw new Error(`${name} must include exactly one of produced_by_command or validated_by_command`);
  }
  const produced_at = obj.produced_at === undefined ? undefined : timestamp(obj.produced_at, `${name}.produced_at`);
  const validated_at = obj.validated_at === undefined ? undefined : timestamp(obj.validated_at, `${name}.validated_at`);
  if (produced_by_command && (!produced_at || validated_at)) throw new Error(`${name} produced record requires only produced_at`);
  if (validated_by_command && (!validated_at || produced_at)) throw new Error(`${name} validated record requires only validated_at`);
  const key = artifactKey(obj.key, `${name}.key`);
  const inputs = fingerprintReferences(obj.inputs, `${name}.inputs`);
  if (inputs.some((input) => input.key === key)) throw new Error(`${name}.inputs must not reference the record itself`);
  const role = artifactRole(obj.role, `${name}.role`);
  const schema_version = nonBlankString(obj.schema_version, `${name}.schema_version`);
  const fingerprint = artifactFingerprint(obj.fingerprint, `${name}.fingerprint`);
  const file_sha256 = obj.file_sha256 === undefined ? undefined : artifactFingerprint(obj.file_sha256, `${name}.file_sha256`);
  if (role !== "human_view" && requiresMatchingPhysicalFileHash(schema_version)) {
    if (!file_sha256) throw new Error(`${name}.file_sha256 is required for physical schema ${schema_version}`);
    if (file_sha256 !== fingerprint) throw new Error(`${name}.file_sha256 must match fingerprint for physical schema ${schema_version}`);
  }
  return {
    key,
    path: managedProjectPath(obj.path, `${name}.path`),
    role,
    schema_version,
    fingerprint,
    file_sha256,
    authored_by: artifactAuthor(obj.authored_by, `${name}.authored_by`),
    produced_by_command,
    validated_by_command,
    producer_cli_version: nonBlankString(obj.producer_cli_version, `${name}.producer_cli_version`),
    command_contract_version: nonBlankString(obj.command_contract_version, `${name}.command_contract_version`),
    inputs,
    produced_at,
    validated_at,
  };
}

function stageAttempt(value: unknown, name: string): StageAttempt {
  const obj = strictRecord(value, name, [
    "stage",
    "command",
    "input_fingerprint",
    "inputs",
    "status",
    "started_at",
    "completed_at",
    "output_artifact_keys",
    "failure_code",
    "failure_message",
    "artifact",
    "remediation",
  ]);
  const status = stageAttemptStatus(obj.status, `${name}.status`);
  const failure_code = obj.failure_code === undefined ? undefined : artifactKey(obj.failure_code, `${name}.failure_code`);
  const failure_message = obj.failure_message === undefined ? undefined : nonBlankString(obj.failure_message, `${name}.failure_message`);
  const artifact = obj.artifact === undefined ? undefined : artifactKey(obj.artifact, `${name}.artifact`);
  const remediation = obj.remediation === undefined ? undefined : nonBlankString(obj.remediation, `${name}.remediation`);
  if (status === "failed" && (!failure_code || !remediation)) throw new Error(`${name} failed attempt requires failure_code and remediation`);
  if (status === "success" && (failure_code || failure_message || artifact || remediation)) {
    throw new Error(`${name} successful attempt must not include artifact or failure fields`);
  }
  const started_at = timestamp(obj.started_at, `${name}.started_at`);
  const completed_at = timestamp(obj.completed_at, `${name}.completed_at`);
  if (Date.parse(completed_at) < Date.parse(started_at)) throw new Error(`${name}.completed_at must not precede started_at`);
  const output_artifact_keys =
    obj.output_artifact_keys === undefined
      ? []
      : array(obj.output_artifact_keys, `${name}.output_artifact_keys`).map((item, index) => artifactKey(item, `${name}.output_artifact_keys[${index}]`));
  unique(output_artifact_keys, `${name} output_artifact_key`);
  if (status === "failed" && output_artifact_keys.length > 0) {
    throw new Error(`${name} failed attempt must not include output_artifact_keys`);
  }
  const inputs = obj.inputs === undefined
    ? undefined
    : fingerprintReferences(obj.inputs, `${name}.inputs`);
  return {
    stage: artifactKey(obj.stage, `${name}.stage`),
    command: artifactKey(obj.command, `${name}.command`),
    input_fingerprint: artifactFingerprint(obj.input_fingerprint, `${name}.input_fingerprint`),
    inputs,
    status,
    started_at,
    completed_at,
    output_artifact_keys,
    failure_code,
    failure_message,
    artifact,
    remediation,
  };
}

function stageAttemptStatus(value: unknown, name: string): StageAttemptStatus {
  if (value === "success" || value === "failed") return value;
  throw new Error(`${name} must be success or failed`);
}

function requiresMatchingPhysicalFileHash(schemaVersion: string): boolean {
  return (
    schemaVersion === "bytes-v1" ||
    schemaVersion === "media-v1" ||
    schemaVersion.startsWith("media/") ||
    schemaVersion.startsWith("image/") ||
    schemaVersion.startsWith("audio/") ||
    schemaVersion.startsWith("video/")
  );
}

function validateArtifactManifestIntegrity(
  artifacts: Record<string, ArtifactRecord>,
  stageAttempts: Record<string, StageAttempt>,
): void {
  const artifactKeys = new Set(Object.keys(artifacts));

  for (const artifact of Object.values(artifacts)) {
    for (const input of artifact.inputs) {
      if (!artifactKeys.has(input.key)) {
        throw new Error(`artifacts.${artifact.key}.inputs references missing artifact key ${input.key}`);
      }
    }
  }

  assertAcyclicArtifactDependencies(artifacts);

  for (const attempt of Object.values(stageAttempts)) {
    for (const outputKey of attempt.output_artifact_keys) {
      if (!artifactKeys.has(outputKey)) {
        throw new Error(`stage_attempts.${attempt.stage}.output_artifact_keys references missing artifact key ${outputKey}`);
      }
    }
  }
}

function assertAcyclicArtifactDependencies(artifacts: Record<string, ArtifactRecord>): void {
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const path: string[] = [];

  const visit = (key: string): void => {
    if (visited.has(key)) return;
    if (visiting.has(key)) {
      const cycleStart = path.indexOf(key);
      const cycle = [...path.slice(cycleStart), key];
      throw new Error(`artifact dependency cycle: ${cycle.join(" -> ")}`);
    }

    visiting.add(key);
    path.push(key);
    for (const input of artifacts[key]!.inputs) visit(input.key);
    path.pop();
    visiting.delete(key);
    visited.add(key);
  };

  for (const key of Object.keys(artifacts)) visit(key);
}

function renderOutput(value: unknown, name: string): RenderOutput {
  const obj = strictRecord(value, name, ["key", "role", "path", "sha256", "duration_seconds", "probe"]);
  return {
    key: artifactKey(obj.key, `${name}.key`),
    role: renderOutputRole(obj.role, `${name}.role`),
    path: managedProjectPath(obj.path, `${name}.path`),
    sha256: artifactFingerprint(obj.sha256, `${name}.sha256`),
    duration_seconds: obj.duration_seconds === undefined ? undefined : nonNegativeNumber(obj.duration_seconds, `${name}.duration_seconds`),
    probe: obj.probe === undefined ? undefined : record(obj.probe, `${name}.probe`),
  };
}

function renderOutputRole(value: unknown, name: string): RenderOutputRole {
  if (value === "derived" || value === "execution_result") return value;
  throw new Error(`${name} must be derived or execution_result`);
}

function inspectionRemovedRange(value: unknown, name: string): InspectionRemovedRange {
  const obj = strictRecord(value, name, ["candidate_id", "source_id", "start", "end", "type", "reason", "text"]);
  const start = nonNegativeNumber(obj.start, `${name}.start`);
  const end = nonNegativeNumber(obj.end, `${name}.end`);
  if (end <= start) throw new Error(`${name}.end must be greater than start`);
  return {
    candidate_id: opaqueIdentifier(obj.candidate_id, `${name}.candidate_id`),
    source_id: opaqueIdentifier(obj.source_id, `${name}.source_id`),
    start,
    end,
    type: nonBlankString(obj.type, `${name}.type`),
    reason: nonBlankString(obj.reason, `${name}.reason`),
    text: anyString(obj.text, `${name}.text`),
  };
}

function inspectionRetainedRisk(value: unknown, name: string): InspectionRetainedRisk {
  const obj = strictRecord(value, name, ["candidate_id", "source_id", "start", "end", "reason"]);
  const start = obj.start === undefined ? undefined : nonNegativeNumber(obj.start, `${name}.start`);
  const end = obj.end === undefined ? undefined : nonNegativeNumber(obj.end, `${name}.end`);
  if ((start === undefined) !== (end === undefined)) throw new Error(`${name}.start and ${name}.end must appear together`);
  if (start !== undefined && end !== undefined && end <= start) throw new Error(`${name}.end must be greater than start`);
  return {
    candidate_id: obj.candidate_id === undefined ? undefined : opaqueIdentifier(obj.candidate_id, `${name}.candidate_id`),
    source_id: obj.source_id === undefined ? undefined : opaqueIdentifier(obj.source_id, `${name}.source_id`),
    start,
    end,
    reason: nonBlankString(obj.reason, `${name}.reason`),
  };
}

function inspectionSummaries(value: unknown, name: string): InspectionSummaries {
  const obj = strictRecord(value, name, ["enrichment", "blocks", "elements", "audio", "assets"]);
  return {
    enrichment: requiredStringArray(obj.enrichment, `${name}.enrichment`),
    blocks: requiredStringArray(obj.blocks, `${name}.blocks`),
    elements: requiredStringArray(obj.elements, `${name}.elements`),
    audio: requiredStringArray(obj.audio, `${name}.audio`),
    assets: requiredStringArray(obj.assets, `${name}.assets`),
  };
}

function inspectionCheck(value: unknown, name: string): InspectionCheck {
  const obj = strictRecord(value, name, [
    "id",
    "source_element_id",
    "kind",
    "start",
    "end",
    "expected",
    "frame_times",
    "frame_paths",
    "status",
    "warnings",
    "needs_human_review",
    "asset_id",
    "asset_path",
    "provider",
    "provenance",
    "runtime_dependencies",
  ]);
  const start = nonNegativeNumber(obj.start, `${name}.start`);
  const end = nonNegativeNumber(obj.end, `${name}.end`);
  if (end <= start) throw new Error(`${name}.end must be greater than start`);
  const frame_times = array(obj.frame_times, `${name}.frame_times`).map((item, index) => nonNegativeNumber(item, `${name}.frame_times[${index}]`));
  const frame_paths = array(obj.frame_paths, `${name}.frame_paths`).map((item, index) => managedProjectPath(item, `${name}.frame_paths[${index}]`));
  if (frame_times.length !== frame_paths.length) throw new Error(`${name}.frame_times and frame_paths must have the same length`);
  return {
    id: artifactKey(obj.id, `${name}.id`),
    source_element_id: artifactKey(obj.source_element_id, `${name}.source_element_id`),
    kind: inspectionCheckKind(obj.kind, `${name}.kind`),
    start,
    end,
    expected: nonBlankString(obj.expected, `${name}.expected`),
    frame_times,
    frame_paths,
    status: inspectionCheckStatus(obj.status, `${name}.status`),
    warnings: optionalStringArray(obj.warnings, `${name}.warnings`),
    needs_human_review: boolean(obj.needs_human_review, `${name}.needs_human_review`),
    asset_id: obj.asset_id === undefined ? undefined : nonBlankString(obj.asset_id, `${name}.asset_id`),
    asset_path: obj.asset_path === undefined ? undefined : managedProjectPath(obj.asset_path, `${name}.asset_path`),
    provider: obj.provider === undefined ? undefined : nonBlankString(obj.provider, `${name}.provider`),
    provenance: obj.provenance === undefined ? undefined : nonBlankString(obj.provenance, `${name}.provenance`),
    runtime_dependencies: obj.runtime_dependencies === undefined ? undefined : optionalStringArray(obj.runtime_dependencies, `${name}.runtime_dependencies`),
  };
}

function inspectionCheckKind(value: unknown, name: string): InspectionCheckKind {
  if (value === "card" || value === "element" || value === "caption_emphasis" || value === "sfx" || value === "music") return value;
  throw new Error(`${name} must be card, element, caption_emphasis, sfx, or music`);
}

function inspectionCheckStatus(value: unknown, name: string): InspectionCheckStatus {
  if (value === "sampled" || value === "warning" || value === "blocker") return value;
  throw new Error(`${name} must be sampled, warning, or blocker`);
}

function statusBlocker(value: unknown, name: string): StatusBlocker {
  const obj = strictRecord(value, name, ["code", "message", "artifact", "remediation"]);
  return {
    code: artifactKey(obj.code, `${name}.code`),
    message: nonBlankString(obj.message, `${name}.message`),
    artifact: obj.artifact === undefined ? undefined : artifactKey(obj.artifact, `${name}.artifact`),
    remediation: nonBlankString(obj.remediation, `${name}.remediation`),
  };
}

function musicAcquisitionRecommendation(value: unknown, name: string): MusicAcquisitionRecommendation {
  const obj = strictRecord(value, name, ["start", "end", "volume", "fade_seconds", "ducking", "offset_seconds", "loop"]);
  const start = nonNegativeNumber(obj.start, `${name}.start`);
  const end = nonNegativeNumber(obj.end, `${name}.end`);
  if (end <= start) throw new Error(`${name}.end must be greater than start`);
  return {
    start,
    end,
    volume: bounded(obj.volume, `${name}.volume`, 0, 1),
    fade_seconds: nonNegativeNumber(obj.fade_seconds, `${name}.fade_seconds`),
    ducking: boolean(obj.ducking, `${name}.ducking`),
    offset_seconds: nonNegativeNumber(obj.offset_seconds, `${name}.offset_seconds`),
    loop: boolean(obj.loop, `${name}.loop`),
  };
}

function timestamp(value: unknown, name: string): string {
  const text = nonBlankString(value, name);
  if (Number.isNaN(Date.parse(text))) throw new Error(`${name} must be an ISO timestamp`);
  return text;
}

function managedProjectPath(value: unknown, name: string): string {
  const text = nonBlankString(value, name);
  const candidate = text.trim();
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(candidate) || candidate.startsWith("/") || /^[A-Za-z]:/.test(candidate)) {
    throw new Error(`${name} must be a project-relative path`);
  }
  if (candidate.includes("\\")) throw new Error(`${name} must not contain backslashes`);
  if (candidate.split("/").includes("..")) throw new Error(`${name} must not contain ..`);
  if (candidate.includes("\0")) throw new Error(`${name} must not contain null bytes`);
  return text;
}

function anyString(value: unknown, name: string): string {
  if (typeof value !== "string") throw new Error(`${name} must be a string`);
  return value;
}

function requiredStringArray(value: unknown, name: string): string[] {
  return array(value, name).map((item, index) => nonBlankString(item, `${name}[${index}]`));
}

function optionalStringNumberOrNull(value: unknown, name: string): string | number | null | undefined {
  if (value === undefined || value === null) return value;
  if (typeof value === "string") return nonBlankString(value, name);
  return nonNegativeNumber(value, name);
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

function visualCandidatePath(value: unknown, name: string): string {
  const text = nonBlankString(value, name);
  const candidate = text.trim();
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(candidate) || candidate.startsWith("/") || /^[A-Za-z]:/.test(candidate)) {
    throw new Error(`${name} must be a project-relative path`);
  }
  if (candidate.includes("\\")) throw new Error(`${name} must not contain backslashes`);
  if (candidate.split("/").includes("..")) throw new Error(`${name} must not contain ..`);
  return text;
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
