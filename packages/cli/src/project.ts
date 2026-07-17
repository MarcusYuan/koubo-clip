import { spawnSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import * as nodeFs from "node:fs";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import * as nodePath from "node:path";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import {
  type AnalysisArtifact,
  type AnalysisCandidate,
  type AssetUsagePlanArtifact,
  type AssetUsagePosition,
  type AssetManifestArtifact,
  type ArtifactFingerprintReference,
  type ArtifactManifest,
  type ArtifactRecord,
  type CommandResult,
  type CaptionEmphasis,
  type EdlArtifact,
  type EdlEntry,
  type EnrichmentCard,
  type EnrichmentElement,
  type EnrichmentPlanArtifact,
  type EnrichmentMusic,
  type EnrichmentSfx,
  type EnrichmentSourceMode,
  type FocusCandidate,
  type FocusCandidatesArtifact,
  type FocusFrame,
  type FocusFramesArtifact,
  type FocusGrounding,
  type FocusGroundingArtifact,
  type FocusReviewArtifact,
  type FocusReviewItem,
  type ProductionProposalArtifact,
  type ProductionProposalOption,
  type ProjectMetadataArtifact,
  type RenderResult,
  type InspectionArtifact,
  type ProviderExecutionMode,
  type SourceFrame,
  type SourceFrameRequestArtifact,
  type SourceFramesArtifact,
  type SourceAsset,
  type SourcesManifest,
  type TranscriptArtifact,
  type VisualAcquisitionArtifact,
  type VisualCandidate,
  type VisualCandidatesArtifact,
  type VisualRequestArtifact,
  type VisualReviewArtifact,
  parseAssetManifest,
  parseAssetUsagePlan,
  parseArtifactManifest,
  parseFocusCandidates,
  parseFocusFrames,
  parseFocusGrounding,
  parseFocusReview,
  parseEdl,
  parseEditPlan,
  parseEnrichmentPlan,
  parseAnalysis,
  parseMusicRequest,
  parseProductionProposal,
  parseProjectMetadata,
  parseRenderResult,
  parseInspection,
  parseMusicAcquisition,
  parseMusicReview,
  parseReviewPackage,
  parseSourceFrameRequest,
  parseSourceMaterialization,
  parseSourcesManifest,
  parseTranscript,
  parseVisualAcquisition,
  parseVisualCandidates,
  parseVisualRequest,
  parseVisualReview,
  defaultEnrichmentProfile,
  projectArtifacts,
} from "./artifacts";
import { ArtifactValidationError, productionProposalContractInfo, type ArtifactValidationIssue } from "./artifact-contracts";
import {
  artifactReference,
  assetManifestFingerprintProjection,
  atomicReplaceFile,
  commitProjectStage,
  commitProjectStageFailure,
  editPlanFingerprintProjection,
  inputFingerprint,
  manifestPath,
  proposalFingerprint,
  proposalSelectionFingerprint,
  proposalSelectionFingerprints,
  proposalSelectionProjection,
  proposalSelectionVirtualPath,
  projectMetadataFingerprintProjection,
  readProjectArtifactManifest,
  recordFileArtifact,
  recordArtifactValue,
  recordJsonArtifact,
  semanticFileFingerprint,
  renderResultFingerprintProjection,
  inspectionFingerprintProjection,
  musicAcquisitionFingerprintProjection,
  visualAcquisitionFingerprintProjection,
} from "./project-lineage";
import {
  atomicWriteJson,
  atomicWriteText,
  fileBytesFingerprint,
  semanticJsonFingerprint,
  type Fingerprint,
} from "./artifact-lifecycle";
import { resolveExistingProjectPath, resolveProjectOutputPath } from "./project-paths";
import { cliVersion, resolveHyperframesBinary } from "./bundle-paths";
import { compileOutputFrameSchedule, type OutputFrameSchedule } from "./render-contract";
import {
  assertRenderableHyperframesBlockForCard,
  defaultHyperframesBlockForCard,
  dependenciesForHyperframesBlocks,
  getHyperframesCatalogEntry,
  getHyperframesDependency,
  validateHyperframesCdnDependency,
  type HyperframesDependencySummary,
} from "./hyperframes-catalog";
import {
  adapterForElement,
  adapterForVendoredElement,
  buildHyperframesRecommendations,
  buildHyperframesPurposeRecommendations,
  type HyperframesElementAdapter,
  type HyperframesElementRecommendations,
  type HyperframesPurposeRecommendations,
} from "./hyperframes-adapter";
import {
  getVendoredElement,
  getVendoredHyperframesStats,
  getVendoredSfx,
  installVendoredRegistryItem,
  listVendoredElementCatalog,
  loadVendoredRegistryItem,
  type VendoredElementCatalogItem,
  type VendoredElementType,
  type VendoredHyperframesStats,
} from "./hyperframes-registry";
import { acquireMusicAsset, buildMusicReview, renderMusicReviewMarkdown, type MusicAcquisitionArtifact, type MusicReviewArtifact } from "./music/acquire";
import { buildMusicCatalog, buildPlatformMusicCatalog, renderMusicCatalogMarkdown, type MusicCatalogArtifact } from "./music/catalog";
import {
  buildPlatformVisualCatalog,
  buildVisualCatalog,
  buildVisualReview,
  prepareVisualAssets,
  renderVisualCandidatesMarkdown,
  renderVisualCatalogMarkdown,
  renderVisualReviewMarkdown,
  searchVisualAssets,
  type PreparedVisualAcquisition,
  type VisualCatalogArtifact,
} from "./visual/acquire";
import { sourceIdentityFingerprintProjection as portableSourceIdentityFingerprintProjection } from "./source-identity";
import { validateEvidenceDirectory } from "./evidence-import";

type StoryboardCard = Omit<EnrichmentCard, "block_id"> & {
  block_id: string;
  template_family: string;
  motion: string[];
  asset_path?: string;
};

type StoryboardElement = EnrichmentElement & {
  catalog_title: string;
  renderable: boolean;
  guidance_only: boolean;
  adapter: HyperframesElementAdapter;
  composition_src?: string;
  component_html?: string;
  asset_path?: string;
};

export type EnrichmentStoryboard = {
  version: "1.1";
  canvas: { width: number; height: number; aspect_ratio: "16:9" | "9:16" | "4:5" };
  clean_video: { path: string; duration_seconds: number };
  profile: EnrichmentPlanArtifact["profile"];
  dependencies: HyperframesDependencySummary[];
  block_usage: ProjectEnrichmentBlockUsage[];
  element_usage: ProjectEnrichmentElementUsage[];
  captions: {
    enabled: boolean;
    identity: "anchor";
    cues: Array<{ start: number; end: number; text: string }>;
    emphasis: CaptionEmphasis[];
  };
  qa_checks: ProjectQaCheck[];
  asset_summary: ProjectAssetSummary[];
  cards: StoryboardCard[];
  elements: StoryboardElement[];
  music: EnrichmentMusic[];
};

export type ProjectCreateData = {
  project_path: string;
  project_metadata_path: string;
  provider_mode: ProviderExecutionMode;
  sources_path: string;
  source_count: number;
};

export type ProjectExploreData = {
  project_path: string;
  transcript_path: string;
  analysis_path: string;
  material_report_path: string;
  candidate_count: number;
  timing_granularity: TranscriptArtifact["timing_granularity"];
};

export type ProjectReviewData = {
  project_path: string;
  review_package_path: string;
  review_package_json_path: string;
  proposed_cut_count: number;
  unresolved_risk_count: number;
};

export type ProjectProposalData = {
  project_path: string;
  proposal_path: string;
  proposal_markdown_path: string;
  source_mode: ProductionProposalArtifact["source_mode"];
  presentation_intent: ProductionProposalArtifact["presentation_intent"];
  recommended_option_id: string;
  recommended_option: ProjectProposalOptionSummary;
  options: ProjectProposalOptionSummary[];
  proposal_fingerprint: Fingerprint;
  option_selection_fingerprints: Record<string, Fingerprint>;
  warnings: string[];
  next_required_artifacts: string[];
};

export type ProjectProposalOptionSummary = {
  id: string;
  label: string;
  recommended: boolean;
  reason: string;
  cut_candidate_count: number;
  image_needed: boolean;
  music_source: ProductionProposalOption["music"]["source"];
  sfx_enabled: boolean;
  requires_grounding: boolean;
  confirmation_count: number;
};

export type ProjectEnrichPlanData = {
  project_path: string;
  enrichment_plan_path: string;
  asset_manifest_path: string;
  source_mode: EnrichmentSourceMode;
  slot_count: number;
  visual_slot_count: number;
  music_slot_count: number;
  element_count: number;
  requires_hyperframes: boolean;
  duration_seconds: number;
  warnings: string[];
  block_usage: ProjectEnrichmentBlockUsage[];
  element_usage: ProjectEnrichmentElementUsage[];
  audio_usage: ProjectAudioUsage;
  cdn_dependencies: HyperframesDependencySummary[];
  asset_summary: ProjectAssetSummary[];
  qa_checks: ProjectQaCheck[];
};

export type ProjectElementCatalogData = {
  project_path: string;
  stats: VendoredHyperframesStats;
  element_count: number;
  renderable_count: number;
  guidance_only_count: number;
  recommendations: HyperframesElementRecommendations;
  purpose_recommendations: HyperframesPurposeRecommendations;
  elements: ProjectElementCatalogItem[];
};

export type ProjectElementCatalogItem = VendoredElementCatalogItem & {
  adapter: HyperframesElementAdapter;
};

export type ProjectFocusCandidatesData = {
  project_path: string;
  focus_candidates_path: string;
  focus_candidates_markdown_path: string;
  source_mode: EnrichmentSourceMode;
  presentation_intent: FocusCandidatesArtifact["presentation_intent"];
  candidate_count: number;
  grounding_required_count: number;
  warnings: string[];
};

export type ProjectFocusFramesData = {
  project_path: string;
  focus_frames_path: string;
  frame_count: number;
  frames: FocusFrame[];
};

export type ProjectSourceFramesData = {
  project_path: string;
  source_frame_request_path: string;
  source_frames_path: string;
  frame_count: number;
  total_size_bytes: number;
  warnings: string[];
};

export type ProjectFocusGroundingData = {
  project_path: string;
  focus_grounding_path: string;
  grounding_count: number;
  ready_count: number;
  warning_count: number;
  invalid_count: number;
  warnings: string[];
};

export type ProjectFocusReviewData = {
  project_path: string;
  focus_review_path: string;
  focus_review_markdown_path: string;
  item_count: number;
  proposed_element_count: number;
  proposed_elements: EnrichmentElement[];
  warnings: string[];
};

export type ProjectMusicCatalogData = {
  project_path: string;
  music_catalog_path: string;
  music_catalog_markdown_path: string;
  library_track_count: number;
  providers: MusicCatalogArtifact["providers"];
};

export type ProjectMusicAcquireData = {
  project_path: string;
  music_acquisition_path: string;
  music_review_path: string;
  asset_manifest_path: string;
  acquired: boolean;
  asset?: AssetManifestEntrySummary;
  warnings: string[];
};

export type ProjectMusicReviewData = {
  project_path: string;
  music_review_path: string;
  music_review_markdown_path: string;
  review: MusicReviewArtifact;
};

export type ProjectVisualCatalogData = {
  project_path: string;
  visual_catalog_path: string;
  visual_catalog_markdown_path: string;
  providers: VisualCatalogArtifact["providers"];
  runtime_allowlist: VisualCatalogArtifact["runtime_allowlist"];
};

export type ProjectVisualSearchData = {
  project_path: string;
  visual_request_path: string;
  visual_candidates_path: string;
  visual_candidates_markdown_path: string;
  request_count: number;
  candidate_count: number;
  warnings: string[];
};

export type ProjectVisualAcquireData = {
  project_path: string;
  visual_acquisition_path: string;
  visual_review_path: string;
  asset_manifest_path: string;
  acquired_count: number;
  assets: AssetManifestEntrySummary[];
  warnings: string[];
};

export type ProjectVisualReviewData = {
  project_path: string;
  visual_review_path: string;
  visual_review_markdown_path: string;
  review: VisualReviewArtifact;
};

export type ProjectRenderData = {
  project_path: string;
  edl_path: string;
  subtitles_path: string;
  clean_render_path: string;
  final_render_path?: string;
  render_result_path: string;
  canonical_output_key: string;
  input_fingerprint: Fingerprint;
  enrichment_applied: boolean;
  asset_summary: ProjectAssetSummary[];
  element_usage: ProjectEnrichmentElementUsage[];
  audio_usage: ProjectAudioUsage;
  warnings: string[];
  expected_duration_seconds: number;
};

export type ProjectInspectData = {
  project_path: string;
  output_path: string;
  duration_seconds: number;
  expected_duration_seconds: number;
  captions_present: boolean;
  removed_ranges: InspectionRemovedRange[];
  retained_risks: InspectionRisk[];
  enrichment_applied: boolean;
  source_mode?: EnrichmentSourceMode;
  enrichment_summary: string[];
  block_usage: ProjectEnrichmentBlockUsage[];
  element_usage: ProjectEnrichmentElementUsage[];
  audio_usage: ProjectAudioUsage;
  cdn_dependencies: HyperframesDependencySummary[];
  asset_summary: ProjectAssetSummary[];
  music_review?: MusicReviewArtifact;
  inspection_checks: ProjectInspectionCheck[];
  inspection_frames: string[];
  warnings: string[];
  accepted: boolean;
  blockers: InspectionArtifact["blockers"];
  report_path: string;
  inspection_path: string;
  render_result_fingerprint: Fingerprint;
};

export type ProjectQaCheckStatus = "sampled" | "warning" | "blocker";

export type ProjectQaCheck = {
  id: string;
  source_element_id: string;
  kind: "card" | "element" | "caption_emphasis" | "sfx" | "music";
  start: number;
  end: number;
  expected: string;
  frame_times: number[];
  status: ProjectQaCheckStatus;
  warnings: string[];
  needs_human_review: boolean;
  asset_id?: string;
  asset_path?: string;
  provider?: string;
  provenance?: string;
  runtime_dependencies?: string[];
};

export type ProjectInspectionCheck = ProjectQaCheck & {
  frame_paths: string[];
};

export type ProjectEnrichmentBlockUsage = {
  card_id: string;
  block_id: string;
  source: string;
  visual_role: string;
  template_family: string;
  dependencies: string[];
};

export type ProjectEnrichmentElementUsage = {
  id: string;
  element_id: string;
  element_type: EnrichmentElement["element_type"];
  source: string;
  start: number;
  end: number;
  reason: string;
  renderable: boolean;
  guidance_only: boolean;
  title?: string;
  tags: string[];
  asset_id?: string;
  sfx_id?: string;
  zone?: string;
  target_rect?: EnrichmentElement["target_rect"];
  anchor_point?: EnrichmentElement["anchor_point"];
  adapter: HyperframesElementAdapter;
};

export type ProjectAssetSummary = {
  id: string;
  path: string;
  type?: string;
  source?: string;
  provenance?: string;
  provider?: string;
  license?: string;
  source_url?: string;
  runtime_dependencies?: string[];
  used_by: string[];
  exists: boolean;
  duration_seconds?: number;
  dimensions?: { width: number; height: number };
};

export type ProjectAudioUsage = {
  music: Array<{ id: string; asset_id: string; start: number; end: number; volume: number; ducking: boolean; fade_seconds: number; reason: string }>;
  sfx: Array<{ id: string; asset_id?: string; sfx_id?: string; start: number; end: number; volume: number; reason: string }>;
};

type AssetManifestEntrySummary = Pick<ProjectAssetSummary, "id" | "path" | "type" | "source" | "provider" | "license" | "duration_seconds">;

export type InspectionRemovedRange = {
  candidate_id: string;
  source_id: string;
  start: number;
  end: number;
  type: string;
  reason: string;
  text: string;
};

export type InspectionRisk = {
  candidate_id?: string;
  source_id?: string;
  start?: number;
  end?: number;
  reason: string;
};

export type AsrMode = "auto" | "off" | "external";
export type AsrProvider = "cloudflare-whisper" | "whisper-cli";
export type ProviderModeOption = { providerMode?: ProviderExecutionMode };

const CUT_PADDING_SECONDS = 0.05;
const fsRuntime = nodeFs as unknown as { accessSync(path: string, mode?: number): void; constants: { R_OK: number }; realpathSync(path: string): string };
const pathRuntime = nodePath as unknown as { isAbsolute(path: string): boolean };
const MAX_SOURCE_FRAME_BYTES = 1_500_000;
const MAX_SOURCE_FRAME_BATCH_BYTES = 30_000_000;
const SOURCE_FRAME_ATTEMPTS = [
  { maxEdge: 1280, quality: 4 },
  { maxEdge: 1280, quality: 6 },
  { maxEdge: 960, quality: 6 },
] as const;

export function validateSourceFrameByteLimits(
  frameSizes: readonly number[],
  limits = { maxFrameBytes: MAX_SOURCE_FRAME_BYTES, maxBatchBytes: MAX_SOURCE_FRAME_BATCH_BYTES },
): void {
  if (frameSizes.some((size) => size > limits.maxFrameBytes)) throw sourceFrameError("SOURCE_FRAME_IMAGE_TOO_LARGE", "source frame image exceeds byte limit");
  if (frameSizes.reduce((sum, size) => sum + size, 0) > limits.maxBatchBytes) throw sourceFrameError("SOURCE_FRAME_BATCH_TOO_LARGE", "source frame batch exceeds byte limit");
}

export function createProject(
  inputPaths: string[],
  options: { projectPath?: string; providerMode?: ProviderExecutionMode; sourceManifestPath?: string } = {},
): CommandResult<"project.create", ProjectCreateData> {
  const startedAt = new Date().toISOString();
  try {
    if (inputPaths.length > 0 && options.sourceManifestPath) throw commandError("SOURCE_INPUT_MODE_CONFLICT", "positional videos and --source-manifest are mutually exclusive");
    if (inputPaths.length === 0 && !options.sourceManifestPath) throw new Error("project create requires at least one video or --source-manifest");
    if (options.sourceManifestPath && !options.projectPath) throw commandError("SOURCE_MANIFEST_INVALID", "detached project create requires explicit --project");
    const providerMode = options.providerMode ?? "standalone";
    const projectPath = options.projectPath ?? defaultProjectPath(inputPaths[0]!);
    if (existsSync(projectPath)) throw new Error(`project already exists: ${projectPath}`);
    if (!options.sourceManifestPath) mkdirSync(join(projectPath, "source"), { recursive: true });
    mkdirSync(join(projectPath, "assets", "images"), { recursive: true });
    mkdirSync(join(projectPath, "assets", "icons"), { recursive: true });
    mkdirSync(join(projectPath, "assets", "lottie"), { recursive: true });
    mkdirSync(join(projectPath, "assets", "visuals"), { recursive: true });
    mkdirSync(join(projectPath, "assets", "music"), { recursive: true });
    mkdirSync(join(projectPath, "assets", "overlays"), { recursive: true });
    mkdirSync(join(projectPath, "renders"), { recursive: true });

    const detached = Boolean(options.sourceManifestPath);
    const materialized: Array<{ source_id: string; project_path: string; sha256: string; size_bytes: number }> = [];
    const portableManifest = detached
      ? parseSourcesManifest(readJson(resolve(options.sourceManifestPath!)))
      : parseSourcesManifest({
          contract_version: "2.0",
          sources: inputPaths.map((inputPath, index) => {
            if (!existsSync(inputPath)) throw new Error(`source not found: ${inputPath}`);
            const sourceId = `src-${String(index + 1).padStart(3, "0")}`;
            const ext = extname(inputPath) || ".mp4";
            const projectRelativePath = join("source", `${String(index + 1).padStart(3, "0")}-original${ext}`);
            const destination = join(projectPath, projectRelativePath);
            copyFileSync(inputPath, destination);
            const identity = probePortableSourceIdentity(destination);
            materialized.push({ source_id: sourceId, project_path: projectRelativePath, sha256: identity.sha256, size_bytes: identity.size_bytes });
            return {
              source_id: sourceId,
              order: index,
              original_filename: basename(inputPath),
              local_media_ref: `local:${sourceId}`,
              identity,
            };
          }),
        });
    if (portableManifest.contract_version !== "2.0") throw commandError("SOURCE_MANIFEST_INVALID", "--source-manifest requires sources.json contract_version 2.0");
    const sources = portableManifest.sources;

    const sourcesPath = join(projectPath, projectArtifacts.sources);
    const projectMetadataPath = writeProjectMetadata(projectPath, providerMode);
    writeJson(sourcesPath, portableSourcesForWrite(portableManifest));
    if (materialized.length > 0) writeJson(join(projectPath, projectArtifacts.sourceMaterialization), { contract_version: "1.0", sources: materialized });
    const recordedAt = new Date().toISOString();
    const projectMetadata = parseProjectMetadata(readProjectJson(projectPath, projectArtifacts.project, "project metadata"));
    const sourcesManifest = parseSourcesManifest(readProjectJson(projectPath, projectArtifacts.sources, "sources manifest"));
    const projectRecord = recordJsonArtifact({
      project_path: projectPath,
      key: "project",
      path: projectArtifacts.project,
      role: "authoritative_input",
      schema_version: projectMetadata.contract_version,
      authored_by: "cli",
      command: "project.create",
      mode: "produced",
      value: projectMetadataFingerprintProjection(projectMetadata),
      recorded_at: recordedAt,
    });
    const materialization = materialized.length > 0
      ? parseSourceMaterialization(readProjectJson(projectPath, projectArtifacts.sourceMaterialization, "source materialization"), sourcesManifest)
      : undefined;
    const sourceRecords = sourcesManifest.sources.map((source) => sourceIdentityRecord(projectPath, source, "project.create", recordedAt));
    const sourceMediaRecords = (materialization?.sources ?? []).map((source) => recordFileArtifact({
      project_path: projectPath,
      key: `source:${source.source_id}`,
      path: source.project_path,
      role: "authoritative_input",
      schema_version: "bytes-v1",
      authored_by: "cli",
      command: "project.create",
      mode: "produced",
      recorded_at: recordedAt,
    }));
    const sourceReferences = sourceRecords.map(artifactReference);
    const sourcesRecord = recordJsonArtifact({
      project_path: projectPath,
      key: "sources",
      path: projectArtifacts.sources,
      role: "authoritative_input",
      schema_version: "2.0",
      authored_by: "cli",
      command: "project.create",
      mode: "produced",
      inputs: sourceReferences,
      value: sourcesManifest,
      recorded_at: recordedAt,
    });
    commitProjectStage({
      project_path: projectPath,
      stage: "project.create",
      command: "project.create",
      input_fingerprint: inputFingerprint(sourceReferences),
      inputs: sourceReferences,
      records: [projectRecord, ...sourceRecords, ...sourceMediaRecords, sourcesRecord, ...(materialization ? [recordJsonArtifact({
        project_path: projectPath,
        key: "source-materialization",
        path: projectArtifacts.sourceMaterialization,
        role: "authoritative_input",
        schema_version: "1.0",
        authored_by: "cli",
        command: "project.create",
        mode: "produced",
        inputs: sourceReferences,
        value: materialization,
        recorded_at: recordedAt,
      })] : [])],
      started_at: startedAt,
      completed_at: recordedAt,
    });
    return ok("project.create", { project_path: projectPath, project_metadata_path: projectMetadataPath, provider_mode: providerMode, sources_path: sourcesPath, source_count: sources.length });
  } catch (error) {
    return fail("project.create", errorCode(error, "PROJECT_CREATE_FAILED"), error);
  }
}

export function exploreProject(
  projectPath: string,
  options: { asr?: AsrMode; asrProvider?: AsrProvider } & ProviderModeOption = {},
): Promise<CommandResult<"project.explore", ProjectExploreData>> {
  try {
    const providerMode = resolveProjectProviderMode(projectPath, options.providerMode);
    const asr = options.asr ?? "auto";
    const manifest = readManifest(projectPath);
    assertExploreSourceBoundary(projectPath, manifest);
    const transcriptPath = join(projectPath, projectArtifacts.transcriptJson);
    if (!existsSync(transcriptPath)) {
      if (providerMode === "platform" && asr === "auto") throw platformProviderBlocked("asr", projectArtifacts.transcriptJson, "platform mode requires transcript.json before project explore --asr auto", "Host/platform must write transcript.json into the TaskWorkspace/project before explore, or rerun with --asr external/off to avoid CLI-owned ASR.", { asr, accepted_asr: ["external", "off"], required_artifact: projectArtifacts.transcriptJson });
      if (asr === "off" || asr === "external") throw new Error(`missing transcript.json for --asr ${asr}`);
      return transcribeProject(projectPath, manifest, options.asrProvider).then((transcript) => {
        writeJson(transcriptPath, transcript);
        return finishExploreProject(projectPath, manifest, transcriptPath, "cli");
      }).catch((error) => fail("project.explore", "PROJECT_EXPLORE_FAILED", error));
    }

    return Promise.resolve(finishExploreProject(projectPath, manifest, transcriptPath, "agent"));
  } catch (error) {
    return Promise.resolve(fail("project.explore", "PROJECT_EXPLORE_FAILED", error));
  }
}

function finishExploreProject(
  projectPath: string,
  manifest: SourcesManifest,
  transcriptPath: string,
  transcriptAuthor: "cli" | "agent",
): CommandResult<"project.explore", ProjectExploreData> {
  const startedAt = new Date().toISOString();
  const recordedAt = new Date().toISOString();
  const lifecycleManifest = readProjectArtifactManifest(projectPath);
  const records: ArtifactRecord[] = [];
  const projectMetadata = readProjectMetadata(projectPath);
  if (!projectMetadata) {
    throw lifecycleCommandError(
      "PROJECT_METADATA_MISSING",
      "project.json is required before project explore",
      "project",
      "Restore project.json or create a new project from the source media.",
      "project.explore",
    );
  }

  let sourceRecords: ArtifactRecord[];
  let sourcesRecord: ArtifactRecord;
  if (lifecycleManifest) {
    const projectRecord = assertArtifactRecordCurrent(
      projectPath,
      lifecycleManifest,
      "project",
      semanticJsonFingerprint(projectMetadataFingerprintProjection(projectMetadata)),
      new Set(),
      new Set(),
      "project.explore",
    );
    assertArtifactRecordContract(
      projectRecord,
      {
        path: projectArtifacts.project,
        role: "authoritative_input",
        schema_version: projectMetadata.contract_version,
      },
      "project.explore",
    );
    ({ source_records: sourceRecords, sources_record: sourcesRecord } = assertCurrentSourceLineage(
      projectPath,
      manifest,
      lifecycleManifest,
      "project.explore",
    ));
  } else throw lifecycleCommandError("LINEAGE_UNPROVEN", "artifact-manifest.json is required", "artifact-manifest", "Create the project with the current CLI.", "project.explore");

  const transcript = clampTranscriptToSources(parseTranscript(readProjectJson(projectPath, projectArtifacts.transcriptJson, "transcript"), manifest), manifest);
  writeJson(transcriptPath, transcript);

  const analysis = detectCandidates(transcript);
  const analysisPath = join(projectPath, projectArtifacts.analysis);
  writeJson(analysisPath, analysis);

  const materialReportPath = join(projectPath, projectArtifacts.materialReport);
  const transcriptMarkdownPath = join(projectPath, projectArtifacts.transcriptMarkdown);
  atomicWriteText(materialReportPath, renderMaterialReport(manifest, transcript, analysis));
  atomicWriteText(transcriptMarkdownPath, renderTranscriptMarkdown(transcript));

  const sourceReferences = sourceRecords.map(artifactReference);
  const transcriptRecord = recordJsonArtifact({
    project_path: projectPath,
    key: "transcript",
    path: projectArtifacts.transcriptJson,
    role: "authoritative_input",
    schema_version: "1.0",
    authored_by: transcriptAuthor,
    command: "project.explore",
    mode: transcriptAuthor === "cli" ? "produced" : "validated",
    inputs: [artifactReference(sourcesRecord)],
    value: transcript,
    file_sha256: fileBytesFingerprint(transcriptPath),
    recorded_at: recordedAt,
  });
  const analysisRecord = recordJsonArtifact({
    project_path: projectPath,
    key: "analysis",
    path: projectArtifacts.analysis,
    role: "derived",
    schema_version: "1.0",
    authored_by: "cli",
    command: "project.explore",
    mode: "produced",
    inputs: [artifactReference(transcriptRecord)],
    value: analysis,
    file_sha256: fileBytesFingerprint(analysisPath),
    recorded_at: recordedAt,
  });
  const viewRecords = [
    recordFileArtifact({
      project_path: projectPath,
      key: "material-report",
      path: projectArtifacts.materialReport,
      role: "human_view",
      schema_version: "markdown-v1",
      authored_by: "cli",
      command: "project.explore",
      mode: "produced",
      inputs: [artifactReference(analysisRecord)],
      recorded_at: recordedAt,
    }),
    recordFileArtifact({
      project_path: projectPath,
      key: "transcript-view",
      path: projectArtifacts.transcriptMarkdown,
      role: "human_view",
      schema_version: "markdown-v1",
      authored_by: "cli",
      command: "project.explore",
      mode: "produced",
      inputs: [artifactReference(transcriptRecord)],
      recorded_at: recordedAt,
    }),
  ];
  const stageInputs = [artifactReference(sourcesRecord), ...sourceReferences, artifactReference(transcriptRecord)];
  commitProjectStage({
    project_path: projectPath,
    stage: "project.explore",
    command: "project.explore",
    input_fingerprint: inputFingerprint(stageInputs),
    inputs: stageInputs,
    records: [...records, transcriptRecord, analysisRecord, ...viewRecords],
    started_at: startedAt,
    completed_at: recordedAt,
  });

  return ok("project.explore", {
    project_path: projectPath,
    transcript_path: transcriptPath,
    analysis_path: analysisPath,
    material_report_path: materialReportPath,
    candidate_count: analysis.candidates.length,
    timing_granularity: transcript.timing_granularity,
  });
}

export function reviewProject(projectPath: string, options: ProviderModeOption = {}): CommandResult<"project.review", ProjectReviewData> {
  const startedAt = new Date().toISOString();
  try {
    resolveProjectProviderMode(projectPath, options.providerMode);
    const manifest = readManifest(projectPath);
    const transcript = parseTranscript(readProjectJson(projectPath, projectArtifacts.transcriptJson, "transcript"), manifest);
    const analysis = parseAnalysis(readProjectJson(projectPath, projectArtifacts.analysis, "analysis"), manifest);
    const { transcript_record: transcriptRecord, analysis_record: analysisRecord } = assertCurrentMaterialLineage(
      projectPath,
      manifest,
      transcript,
      analysis,
      "project.review",
    );
    const unresolved =
      transcript.timing_granularity === "word"
        ? isChinese(transcript.language) && transcript.timing_validated !== true
          ? ["unvalidated Chinese word timing needs review before precise cuts"]
          : []
        : [`${transcript.timing_granularity} timing needs review before precise cuts`];
    const reviewPackage = {
      original_ranges: transcript.segments,
      proposed_cuts: analysis.candidates,
      unresolved_risks: unresolved,
    };
    const reviewJsonPath = join(projectPath, projectArtifacts.reviewJson);
    const reviewMarkdownPath = join(projectPath, projectArtifacts.reviewMarkdown);
    writeJson(reviewJsonPath, reviewPackage);
    atomicWriteText(reviewMarkdownPath, renderReviewMarkdown(reviewPackage, transcript.timing_granularity));
    const recordedAt = new Date().toISOString();
    const inputs = [artifactReference(transcriptRecord), artifactReference(analysisRecord)];
    const reviewRecord = recordJsonArtifact({
      project_path: projectPath,
      key: "review-package",
      path: projectArtifacts.reviewJson,
      role: "derived",
      schema_version: "1.0",
      authored_by: "cli",
      command: "project.review",
      mode: "produced",
      inputs,
      value: reviewPackage,
      file_sha256: fileBytesFingerprint(reviewJsonPath),
      recorded_at: recordedAt,
    });
    const reviewViewRecord = recordFileArtifact({
      project_path: projectPath,
      key: "review-package-view",
      path: projectArtifacts.reviewMarkdown,
      role: "human_view",
      schema_version: "markdown-v1",
      authored_by: "cli",
      command: "project.review",
      mode: "produced",
      inputs: [artifactReference(reviewRecord)],
      recorded_at: recordedAt,
    });
    commitProjectStage({
      project_path: projectPath,
      stage: "project.review",
      command: "project.review",
      input_fingerprint: inputFingerprint(inputs),
      inputs,
      records: [reviewRecord, reviewViewRecord],
      started_at: startedAt,
      completed_at: recordedAt,
    });
    return ok("project.review", {
      project_path: projectPath,
      review_package_path: reviewMarkdownPath,
      review_package_json_path: reviewJsonPath,
      proposed_cut_count: reviewPackage.proposed_cuts.length,
      unresolved_risk_count: unresolved.length,
    });
  } catch (error) {
    return fail("project.review", "PROJECT_REVIEW_FAILED", error);
  }
}

export function proposalProject(projectPath: string, options: ProviderModeOption = {}): CommandResult<"project.proposal", ProjectProposalData> {
  const startedAt = new Date().toISOString();
  try {
    resolveProjectProviderMode(projectPath, options.providerMode);
    const manifest = readManifest(projectPath);
    const transcript = parseTranscript(readProjectJson(projectPath, projectArtifacts.transcriptJson, "transcript"), manifest);
    const analysis = parseAnalysis(readProjectJson(projectPath, projectArtifacts.analysis, "analysis"), manifest);
    const materialLineage = assertCurrentMaterialLineage(
      projectPath,
      manifest,
      transcript,
      analysis,
      "project.proposal",
    );
    const review = parseReviewPackage(readProjectJson(projectPath, projectArtifacts.reviewJson, "review package"), manifest);
    const reviewRecord = assertArtifactRecordCurrent(
      projectPath,
      materialLineage.manifest,
      "review-package",
      semanticJsonFingerprint(review),
      new Set(),
      new Set(),
      "project.proposal",
    );
    assertArtifactRecordContract(
      reviewRecord,
      { path: projectArtifacts.reviewJson, role: "derived", schema_version: "1.0" },
      "project.proposal",
    );
    assertArtifactInputs(
      reviewRecord,
      [artifactReference(materialLineage.transcript_record), artifactReference(materialLineage.analysis_record)],
      "project.proposal",
    );
    const proposalPath = join(projectPath, projectArtifacts.productionProposal);
    const proposal = parseProductionProposal(readProjectJson(projectPath, projectArtifacts.productionProposal, "production proposal"));
    validateProductionProposalAgainstReview(proposal, review);
    const warnings = productionProposalWarnings(proposal);
    const markdownPath = join(projectPath, projectArtifacts.productionProposalMarkdown);
    atomicWriteText(markdownPath, renderProductionProposalMarkdown(proposal, warnings));
    const summaries = proposal.options.map((option) => productionProposalOptionSummary(option, proposal.recommended_option_id));
    const recommendedOption = proposal.options.find((option) => option.id === proposal.recommended_option_id)!;
    const proposal_fingerprint = proposalFingerprint(proposal);
    const option_selection_fingerprints = proposalSelectionFingerprints(proposal);
    const reviewReference = artifactReference(reviewRecord);
    const recordedAt = new Date().toISOString();
    const proposalRecord = recordJsonArtifact({
      project_path: projectPath,
      key: "production-proposal",
      path: projectArtifacts.productionProposal,
      role: "authoritative_input",
      schema_version: proposal.version,
      authored_by: "agent",
      command: "project.proposal",
      mode: "validated",
      inputs: [reviewReference],
      value: proposal,
      file_sha256: fileBytesFingerprint(proposalPath),
      recorded_at: recordedAt,
    });
    const proposalReference = artifactReference(proposalRecord);
    const selectionRecords = proposal.options.map((option) =>
      recordJsonArtifact({
        project_path: projectPath,
        key: `proposal-selection:${option.id}`,
        path: proposalSelectionVirtualPath(option.id),
        role: "derived",
        schema_version: proposal.version,
        authored_by: "cli",
        command: "project.proposal",
        mode: "produced",
        inputs: [proposalReference],
        value: proposalSelectionProjection(proposal, option.id),
        recorded_at: recordedAt,
      }),
    );
    const markdownRecord = recordFileArtifact({
      project_path: projectPath,
      key: "production-proposal-view",
      path: projectArtifacts.productionProposalMarkdown,
      role: "human_view",
      schema_version: "markdown-v1",
      authored_by: "cli",
      command: "project.proposal",
      mode: "produced",
      inputs: [proposalReference],
      recorded_at: recordedAt,
    });
    commitProjectStage({
      project_path: projectPath,
      stage: "project.proposal",
      command: "project.proposal",
      input_fingerprint: inputFingerprint([reviewReference]),
      inputs: [reviewReference],
      records: [proposalRecord, ...selectionRecords, markdownRecord],
      replace_record_prefixes: ["proposal-selection:"],
      started_at: startedAt,
      completed_at: recordedAt,
    });
    return ok("project.proposal", {
      project_path: projectPath,
      proposal_path: proposalPath,
      proposal_markdown_path: markdownPath,
      source_mode: proposal.source_mode,
      presentation_intent: proposal.presentation_intent,
      recommended_option_id: proposal.recommended_option_id,
      recommended_option: productionProposalOptionSummary(recommendedOption, proposal.recommended_option_id),
      options: summaries,
      proposal_fingerprint,
      option_selection_fingerprints,
      warnings,
      next_required_artifacts: nextRequiredArtifactsForProposal(recommendedOption),
    });
  } catch (error) {
    return fail("project.proposal", "PROJECT_PROPOSAL_FAILED", error);
  }
}

export function enrichPlanProject(projectPath: string, options: ProviderModeOption = {}): CommandResult<"project.enrich-plan", ProjectEnrichPlanData> {
  try {
    resolveProjectProviderMode(projectPath, options.providerMode);
    const { plan, assets, duration, warnings, normalized } = validateEnrichmentPlan(projectPath, undefined, undefined, { normalizeUsage: true });
    if (!normalized) commitCanonicalEnrichmentValidation(projectPath, plan, assets);
    const visualCount = plan.elements.filter((element) => element.element_type !== "caption_identity").length;
    const musicCount = plan.audio.music.length;
    const hyperframes = summarizeHyperframesBlocks(plan, assets);
    const elementUsage = summarizeHyperframesElements(plan);
    const qaChecks = buildQaChecks(projectPath, plan, assets);
    return ok("project.enrich-plan", {
      project_path: projectPath,
      enrichment_plan_path: join(projectPath, projectArtifacts.enrichmentPlan),
      asset_manifest_path: join(projectPath, projectArtifacts.assetManifest),
      source_mode: plan.profile.source_mode,
      slot_count: visualCount + musicCount,
      visual_slot_count: visualCount,
      music_slot_count: musicCount,
      element_count: plan.elements.length,
      requires_hyperframes: requiresHyperframesRecut(plan),
      duration_seconds: duration,
      warnings,
      block_usage: hyperframes.block_usage,
      element_usage: elementUsage,
      audio_usage: summarizeAudioUsage(plan),
      cdn_dependencies: hyperframes.cdn_dependencies,
      asset_summary: summarizeAssets(projectPath, assets),
      qa_checks: qaChecks,
    });
  } catch (error) {
    return fail("project.enrich-plan", "PROJECT_ENRICH_PLAN_FAILED", error);
  }
}

export function elementCatalogProject(projectPath: string, options: ProviderModeOption = {}): CommandResult<"project.element-catalog", ProjectElementCatalogData> {
  try {
    resolveProjectProviderMode(projectPath, options.providerMode);
    const rawElements = listVendoredElementCatalog();
    const elements = rawElements.map((item) => ({ ...item, adapter: adapterForVendoredElement(item) }));
    return ok("project.element-catalog", {
      project_path: projectPath,
      stats: getVendoredHyperframesStats(),
      element_count: elements.length,
      renderable_count: elements.filter((item) => item.renderable).length,
      guidance_only_count: elements.filter((item) => item.guidance_only).length,
      recommendations: buildHyperframesRecommendations(rawElements),
      purpose_recommendations: buildHyperframesPurposeRecommendations(rawElements),
      elements,
    });
  } catch (error) {
    return fail("project.element-catalog", "PROJECT_ELEMENT_CATALOG_FAILED", error);
  }
}

export function focusCandidatesProject(projectPath: string, options: ProviderModeOption = {}): CommandResult<"project.focus-candidates", ProjectFocusCandidatesData> {
  const startedAt = new Date().toISOString();
  let stageInputFingerprint: Fingerprint | undefined;
  let stageInputs: ArtifactFingerprintReference[] | undefined;
  try {
    resolveProjectProviderMode(projectPath, options.providerMode);
    const compiledEdl = compileCurrentEdl(projectPath);
    const edl = compiledEdl.edl;
    const duration = edlDuration(edl);
    const candidatesPath = join(projectPath, projectArtifacts.focusCandidates);
    const candidates = parseFocusCandidates(readProjectJson(projectPath, projectArtifacts.focusCandidates, "focus candidates"));
    const edlReference = artifactReference(compiledEdl.edl_record);
    const candidatesReference: ArtifactFingerprintReference = {
      key: "focus-candidates",
      schema_version: candidates.version,
      fingerprint: semanticJsonFingerprint(candidates),
    };
    stageInputs = [edlReference, candidatesReference];
    stageInputFingerprint = inputFingerprint(stageInputs);
    const warnings = validateFocusCandidates(candidates, duration);
    const markdownPath = join(projectPath, projectArtifacts.focusCandidatesMarkdown);
    atomicWriteText(markdownPath, renderFocusCandidatesMarkdown(candidates, warnings));
    const recordedAt = new Date().toISOString();
    const candidatesRecord = recordJsonArtifact({
      project_path: projectPath,
      key: "focus-candidates",
      path: projectArtifacts.focusCandidates,
      role: "authoritative_input",
      schema_version: candidates.version,
      authored_by: "agent",
      command: "project.focus-candidates",
      mode: "validated",
      inputs: [edlReference],
      value: candidates,
      file_sha256: fileBytesFingerprint(candidatesPath),
      recorded_at: recordedAt,
    });
    const markdownRecord = recordFileArtifact({
      project_path: projectPath,
      key: "focus-candidates-view",
      path: projectArtifacts.focusCandidatesMarkdown,
      role: "human_view",
      schema_version: "markdown-v1",
      authored_by: "cli",
      command: "project.focus-candidates",
      mode: "produced",
      inputs: [artifactReference(candidatesRecord)],
      recorded_at: recordedAt,
    });
    commitProjectStage({
      project_path: projectPath,
      stage: "project.focus-candidates",
      command: "project.focus-candidates",
      input_fingerprint: stageInputFingerprint,
      inputs: stageInputs,
      records: [candidatesRecord, markdownRecord],
      started_at: startedAt,
      completed_at: recordedAt,
    });
    return ok("project.focus-candidates", {
      project_path: projectPath,
      focus_candidates_path: candidatesPath,
      focus_candidates_markdown_path: markdownPath,
      source_mode: candidates.source_mode,
      presentation_intent: candidates.presentation_intent,
      candidate_count: candidates.candidates.length,
      grounding_required_count: candidates.candidates.filter((candidate) => candidate.requires_grounding).length,
      warnings,
    });
  } catch (error) {
    if (stageInputFingerprint && existsSync(projectPath)) {
      try {
        commitProjectStageFailure({
          project_path: projectPath,
          stage: "project.focus-candidates",
          command: "project.focus-candidates",
          input_fingerprint: stageInputFingerprint,
          inputs: stageInputs,
          failure_code: errorCode(error, "PROJECT_FOCUS_CANDIDATES_FAILED"),
          failure_message: error instanceof Error ? error.message : String(error),
          artifact: "focus-candidates",
          remediation: errorRemediation(error, "Fix focus-candidates.json against the current EDL, then rerun project focus-candidates."),
          started_at: startedAt,
          completed_at: new Date().toISOString(),
        });
      } catch {
        // Preserve the original focus candidate validation failure.
      }
    }
    return fail("project.focus-candidates", "PROJECT_FOCUS_CANDIDATES_FAILED", error);
  }
}

export function focusFramesProject(projectPath: string, options: ProviderModeOption & { importPath?: string } = {}): CommandResult<"project.focus-frames", ProjectFocusFramesData> {
  if (options.importPath) return importFocusFrameEvidence(projectPath, options.importPath, options);
  const startedAt = new Date().toISOString();
  let stageInputFingerprint: Fingerprint | undefined;
  let stageInputs: ArtifactFingerprintReference[] | undefined;
  try {
    resolveProjectProviderMode(projectPath, options.providerMode);
    const compiledEdl = compileCurrentEdl(projectPath);
    const edl = compiledEdl.edl;
    const edlReference = artifactReference(compiledEdl.edl_record);
    const candidatesPath = join(projectPath, projectArtifacts.focusCandidates);
    const candidates = parseFocusCandidates(readProjectJson(projectPath, projectArtifacts.focusCandidates, "focus candidates"));
    const lifecycleManifest = readProjectArtifactManifest(projectPath);
    if (!lifecycleManifest) {
      throw lifecycleCommandError(
        "FOCUS_CANDIDATES_PENDING_VALIDATION",
        "focus-candidates.json must be validated before extracting focus frames",
        "focus-candidates",
        "Run project focus-candidates, then retry project focus-frames.",
        "project.focus-frames",
      );
    }
    const candidatesFingerprint = semanticJsonFingerprint(candidates);
    const candidatesReference: ArtifactFingerprintReference = {
      key: "focus-candidates",
      fingerprint: candidatesFingerprint,
      schema_version: candidates.version,
    };
    const materializedPathById = materializedSourcePaths(projectPath, readManifest(projectPath));
    const timeline = buildOutputTimeline({
      ...edl,
      entries: edl.entries.map((entry) => ({
        ...entry,
        source_path: readableProjectSource(projectPath, entry.source_id, materializedPathById.get(entry.source_id) || ""),
      })),
    });
    const samples: FocusFrameSample[] = candidates.candidates
      .filter((candidate) => candidate.requires_grounding)
      .flatMap((candidate) =>
        focusSampleTimes(candidate).map((time, index) => {
          const mapped = mapOutputTime(timeline, time, candidate.id);
          return { candidate, index, mapped };
        }),
      );
    const sourceReferences = [...new Set(samples.map((sample) => sample.mapped.source_id))].map((sourceId) => {
      const mediaRecord = lifecycleManifest.artifacts[`source:${sourceId}`];
      const reference = mediaRecord
        ? artifactReference(mediaRecord)
        : compiledEdl.input_references.find((input) => input.key === `source-identity:${sourceId}`);
      if (!reference) throw new Error(`artifact manifest is missing current source bytes: ${sourceId}`);
      return reference;
    });
    stageInputs = [edlReference, candidatesReference, ...sourceReferences];
    stageInputFingerprint = inputFingerprint(stageInputs);
    const candidatesRecord = requiredArtifactRecord(lifecycleManifest, "focus-candidates");
    assertArtifactRecordCurrent(
      projectPath,
      lifecycleManifest,
      "focus-candidates",
      candidatesFingerprint,
      new Set(),
      new Set(),
      "project.focus-frames",
    );
    if (!referencesEqual(candidatesRecord.inputs, [edlReference])) {
      throw lifecycleCommandError(
        "FOCUS_CANDIDATES_STALE",
        "focus-candidates.json was not validated against the current EDL",
        "focus-candidates",
        "Rerun project focus-candidates, then retry project focus-frames.",
        "project.focus-frames",
      );
    }

    const stagingId = Date.now().toString(36);
    const stagingDir = resolveProjectOutputPath(projectPath, `.focus-frames-staging-${stagingId}`, "focus frame staging directory");
    const frames = extractFocusFrames(samples, stagingDir);
    const framesPath = resolveProjectOutputPath(projectPath, projectArtifacts.focusFrames, "focus frames output");
    const framesTargetDir = resolveProjectOutputPath(projectPath, join(".focus", "frames"), "focus frame output directory");
    const artifact = parseFocusFrames({ version: "1.0", frames } satisfies FocusFramesArtifact);
    const stagedFramesPath = resolveProjectOutputPath(projectPath, `.focus-frames-${stagingId}.json`, "focus frames staged manifest");
    atomicWriteJson(stagedFramesPath, artifact);
    parseFocusFrames(readJson(stagedFramesPath));
    mkdirSync(dirname(framesTargetDir), { recursive: true });
    const recordedAt = new Date().toISOString();
    commitManagedPublications(
      [
        { staged_path: stagingDir, target_path: framesTargetDir },
        { staged_path: stagedFramesPath, target_path: framesPath },
      ],
      () => {
        const sourceReferenceById = new Map(sourceReferences.map((reference) => [reference.key.replace(/^source(?:-identity)?:/, ""), reference]));
        const frameRecords = frames.map((frame) =>
          recordFileArtifact({
            project_path: projectPath,
            key: `focus-frame:${frame.id}`,
            path: frame.path,
            role: "evidence",
            schema_version: "image/jpeg",
            authored_by: "cli",
            command: "project.focus-frames",
            mode: "produced",
            inputs: [edlReference, artifactReference(candidatesRecord), sourceReferenceById.get(frame.source_id!)!],
            recorded_at: recordedAt,
          }),
        );
        const framesRecord = recordJsonArtifact({
          project_path: projectPath,
          key: "focus-frames",
          path: projectArtifacts.focusFrames,
          role: "evidence",
          schema_version: artifact.version,
          authored_by: "cli",
          command: "project.focus-frames",
          mode: "produced",
          inputs: [edlReference, artifactReference(candidatesRecord), ...frameRecords.map(artifactReference)],
          value: artifact,
          file_sha256: projectFileBytesFingerprint(projectPath, projectArtifacts.focusFrames, "focus frames"),
          recorded_at: recordedAt,
        });
        commitProjectStage({
          project_path: projectPath,
          stage: "project.focus-frames",
          command: "project.focus-frames",
          input_fingerprint: stageInputFingerprint!,
          inputs: stageInputs,
          records: [...frameRecords, framesRecord],
          replace_record_prefixes: ["focus-frame:"],
          started_at: startedAt,
          completed_at: recordedAt,
        });
      },
    );
    return ok("project.focus-frames", {
      project_path: projectPath,
      focus_frames_path: framesPath,
      frame_count: frames.length,
      frames,
    });
  } catch (error) {
    if (stageInputFingerprint && existsSync(projectPath)) {
      try {
        commitProjectStageFailure({
          project_path: projectPath,
          stage: "project.focus-frames",
          command: "project.focus-frames",
          input_fingerprint: stageInputFingerprint,
          inputs: stageInputs,
          failure_code: errorCode(error, "PROJECT_FOCUS_FRAMES_FAILED"),
          failure_message: error instanceof Error ? error.message : String(error),
          artifact: "focus-frames",
          remediation: errorRemediation(error, "Fix current focus candidates or source media, then rerun project focus-frames."),
          started_at: startedAt,
          completed_at: new Date().toISOString(),
        });
      } catch {
        // Preserve the original focus frame extraction failure.
      }
    }
    return fail("project.focus-frames", "PROJECT_FOCUS_FRAMES_FAILED", error);
  }
}

function importFocusFrameEvidence(
  projectPath: string,
  evidenceDir: string,
  options: ProviderModeOption,
): CommandResult<"project.focus-frames", ProjectFocusFramesData> {
  const startedAt = new Date().toISOString();
  try {
    resolveProjectProviderMode(projectPath, options.providerMode);
    const compiled = compileCurrentEdl(projectPath);
    const edlReference = artifactReference(compiled.edl_record);
    const candidates = parseFocusCandidates(readProjectJson(projectPath, projectArtifacts.focusCandidates, "focus candidates"));
    const lifecycleManifest = requireProjectArtifactManifest(projectPath, "project.focus-frames");
    const candidatesRecord = requiredArtifactRecord(lifecycleManifest, "focus-candidates");
    const candidatesFingerprint = semanticJsonFingerprint(candidates);
    assertArtifactRecordCurrent(projectPath, lifecycleManifest, "focus-candidates", candidatesFingerprint, new Set(), new Set(), "project.focus-frames");
    if (!referencesEqual(candidatesRecord.inputs, [edlReference])) throw lifecycleCommandError("FOCUS_CANDIDATES_STALE", "focus candidates do not bind the current EDL", "focus-candidates", "Rerun project focus-candidates.", "project.focus-frames");
    const timeline = buildOutputTimeline(compiled.edl);
    const samples = candidates.candidates.filter((candidate) => candidate.requires_grounding).flatMap((candidate) =>
      focusSampleTimes(candidate).map((outputTime, index) => ({ candidate, index, outputTime, mapped: mapOutputTime(timeline, outputTime, candidate.id) })),
    );
    const expectedBindings = Object.fromEntries(samples.map(({ candidate, index, outputTime, mapped }) => [
      `${candidate.id}-source-${index + 1}`,
      { candidate_id: candidate.id, output_time_seconds: outputTime, source_id: mapped.source_id, source_time_seconds: mapped.source_time },
    ]));
    const members = validateEvidenceDirectory(evidenceDir, { expectedBindings });
    const memberById = new Map(members.map((member) => [member.id, member]));
    const stagingId = Date.now().toString(36);
    const stagingDir = resolveProjectOutputPath(projectPath, `.focus-frames-staging-${stagingId}`, "focus frame staging directory");
    mkdirSync(stagingDir, { recursive: true });
    const frames = samples.map(({ candidate, index, mapped }): FocusFrame => {
      const id = `${candidate.id}-source-${index + 1}`;
      const member = memberById.get(id)!;
      const fileName = `${safeFileName(id)}.jpg`;
      copyFileSync(member.absolute_path, join(stagingDir, fileName));
      return { id, candidate_id: candidate.id, timeline: "source", time_seconds: mapped.source_time, path: `.focus/frames/${fileName}`, source_id: mapped.source_id, width: member.width, height: member.height };
    });
    const artifact = parseFocusFrames({ version: "1.0", frames });
    const stagedFramesPath = resolveProjectOutputPath(projectPath, `.focus-frames-${stagingId}.json`, "focus frames staged manifest");
    atomicWriteJson(stagedFramesPath, artifact);
    const sourceReferences = [...new Set(samples.map((sample) => sample.mapped.source_id))].map((sourceId) => artifactReference(requiredArtifactRecord(lifecycleManifest, `source-identity:${sourceId}`)));
    const stageInputs = [edlReference, artifactReference(candidatesRecord), ...sourceReferences];
    const framesPath = resolveProjectOutputPath(projectPath, projectArtifacts.focusFrames, "focus frames output");
    const framesTargetDir = resolveProjectOutputPath(projectPath, join(".focus", "frames"), "focus frame output directory");
    mkdirSync(dirname(framesTargetDir), { recursive: true });
    const recordedAt = new Date().toISOString();
    commitManagedPublications([
      { staged_path: stagingDir, target_path: framesTargetDir },
      { staged_path: stagedFramesPath, target_path: framesPath },
    ], () => {
      const sourceReferenceById = new Map(sourceReferences.map((reference) => [reference.key.slice("source-identity:".length), reference]));
      const frameRecords = frames.map((frame) => recordFileArtifact({
        project_path: projectPath,
        key: `focus-frame:${frame.id}`,
        path: frame.path,
        role: "evidence",
        schema_version: "image/jpeg",
        authored_by: "host",
        command: "project.focus-frames",
        mode: "validated",
        inputs: [edlReference, artifactReference(candidatesRecord), sourceReferenceById.get(frame.source_id!)!],
        recorded_at: recordedAt,
      }));
      const framesRecord = recordJsonArtifact({ project_path: projectPath, key: "focus-frames", path: projectArtifacts.focusFrames, role: "evidence", schema_version: artifact.version, authored_by: "cli", command: "project.focus-frames", mode: "produced", inputs: [edlReference, artifactReference(candidatesRecord), ...frameRecords.map(artifactReference)], value: artifact, file_sha256: projectFileBytesFingerprint(projectPath, projectArtifacts.focusFrames, "focus frames"), recorded_at: recordedAt });
      commitProjectStage({ project_path: projectPath, stage: "project.focus-frames", command: "project.focus-frames", input_fingerprint: inputFingerprint(stageInputs), inputs: stageInputs, records: [...frameRecords, framesRecord], replace_record_prefixes: ["focus-frame:"], started_at: startedAt, completed_at: recordedAt });
    });
    return ok("project.focus-frames", { project_path: projectPath, focus_frames_path: framesPath, frame_count: frames.length, frames });
  } catch (error) {
    return fail("project.focus-frames", errorCode(error, "PROJECT_FOCUS_FRAMES_FAILED"), error);
  }
}

export function sourceFramesProject(projectPath: string, options: ProviderModeOption & { importPath?: string } = {}): CommandResult<"project.source-frames", ProjectSourceFramesData> {
  if (options.importPath) return importSourceFrameEvidence(projectPath, options.importPath, options);
  const startedAt = new Date().toISOString();
  let stageInputFingerprint: Fingerprint | undefined;
  let stageInputs: ArtifactFingerprintReference[] | undefined;
  try {
    resolveProjectProviderMode(projectPath, options.providerMode);
    const request = readSourceFrameRequest(projectPath);
    const sources = readSourcesForSourceFrames(projectPath);
    stageInputs = [
      {
        key: "source-frame-request",
        schema_version: request.version,
        fingerprint: semanticJsonFingerprint(request),
      },
      ...sources.sources.map((source) => ({
        key: `source:${source.source_id}`,
        schema_version: "bytes-v1",
        fingerprint: sourceFrameInputFingerprint(projectPath, source.source_id, materializedSourcePaths(projectPath, sources).get(source.source_id)!),
      } satisfies ArtifactFingerprintReference)),
    ];
    stageInputFingerprint = inputFingerprint(stageInputs);
    const lifecycleManifest = readProjectArtifactManifest(projectPath);
    const warnings = sourceFrameDuplicateWarnings(request);
    const stagingId = Date.now().toString(36);
    const stagingDir = resolveProjectOutputPath(projectPath, `.source-frames-staging-${stagingId}`, "source frame staging directory");
    const stagedManifestPath = resolveProjectOutputPath(projectPath, `.source-frames-${stagingId}.json`, "source frame staged manifest");
    const framesTargetPath = resolveProjectOutputPath(projectPath, ".source-frames", "source frame output directory");
    const manifestTargetPath = resolveProjectOutputPath(projectPath, projectArtifacts.sourceFrames, "source frames output");
    const frames = extractSourceFrames(projectPath, request, sources, stagingDir);
    validateSourceFrameByteLimits(frames.map((frame) => frame.size_bytes));
    const totalSizeBytes = frames.reduce((sum, frame) => sum + frame.size_bytes, 0);
    const artifact = {
      version: "1.0",
      frames,
      frame_count: frames.length,
      total_size_bytes: totalSizeBytes,
    } satisfies SourceFramesArtifact;
    atomicWriteJson(stagedManifestPath, artifact);

    const recordedAt = new Date().toISOString();
    const materialization = materializedSourcePaths(projectPath, sources);
    const sourceRecords = sources.sources.map((source) => {
      const existing = lifecycleManifest?.artifacts[`source:${source.source_id}`];
      const projectPathForSource = materialization.get(source.source_id)!;
      const currentFingerprint = fileBytesFingerprint(readableProjectSource(projectPath, source.source_id, projectPathForSource));
      if (existing && existing.fingerprint === currentFingerprint) return existing;
      if (existing) throw sourceFrameError("SOURCE_FRAME_SOURCE_CHANGED", `source ${source.source_id} changed after project creation`);
      return recordFileArtifact({
        project_path: projectPath,
        key: `source:${source.source_id}`,
        path: projectPathForSource,
        role: "authoritative_input",
        schema_version: "bytes-v1",
        authored_by: "cli",
        command: "project.source-frames",
        mode: "validated",
        recorded_at: recordedAt,
      });
    });
    const sourceReferences = sourceRecords.map(artifactReference);
    const requestRecord = recordJsonArtifact({
      project_path: projectPath,
      key: "source-frame-request",
      path: projectArtifacts.sourceFrameRequest,
      role: "command_request",
      schema_version: request.version,
      authored_by: "agent",
      command: "project.source-frames",
      mode: "validated",
      inputs: sourceReferences,
      value: request,
      file_sha256: projectFileBytesFingerprint(projectPath, projectArtifacts.sourceFrameRequest, "source frame request"),
      recorded_at: recordedAt,
    });
    const requestReference = artifactReference(requestRecord);
    const frameRecords = frames.map((frame) => {
      const fingerprint = `sha256:${frame.sha256}` as Fingerprint;
      return recordArtifactValue({
        project_path: projectPath,
        key: `source-frame:${frame.id}`,
        path: frame.path,
        role: "evidence",
        schema_version: "image/jpeg",
        authored_by: "cli",
        command: "project.source-frames",
        mode: "produced",
        inputs: [requestReference, artifactReference(sourceRecords.find((record) => record.key === `source:${frame.source_id}`)!)],
        fingerprint,
        file_sha256: fingerprint,
        recorded_at: recordedAt,
      });
    });
    const sourceFramesRecord = recordJsonArtifact({
      project_path: projectPath,
      key: "source-frames",
      path: projectArtifacts.sourceFrames,
      role: "evidence",
      schema_version: artifact.version,
      authored_by: "cli",
      command: "project.source-frames",
      mode: "produced",
      inputs: [requestReference, ...frameRecords.map(artifactReference)],
      value: artifact,
      file_sha256: fileBytesFingerprint(stagedManifestPath),
      recorded_at: recordedAt,
    });
    stageInputs = [requestReference, ...sourceReferences];
    stageInputFingerprint = inputFingerprint(stageInputs);
    commitManagedPublications(
      [
        { staged_path: stagingDir, target_path: framesTargetPath },
        { staged_path: stagedManifestPath, target_path: manifestTargetPath },
      ],
      () => {
        commitProjectStage({
          project_path: projectPath,
          stage: "project.source-frames",
          command: "project.source-frames",
          input_fingerprint: stageInputFingerprint!,
          inputs: stageInputs,
          records: [...sourceRecords.filter((record) => !lifecycleManifest?.artifacts[record.key]), requestRecord, ...frameRecords, sourceFramesRecord],
          replace_record_prefixes: ["source-frame:"],
          started_at: startedAt,
          completed_at: recordedAt,
        });
      },
    );
    return ok("project.source-frames", {
      project_path: projectPath,
      source_frame_request_path: projectArtifacts.sourceFrameRequest,
      source_frames_path: projectArtifacts.sourceFrames,
      frame_count: frames.length,
      total_size_bytes: totalSizeBytes,
      warnings,
    });
  } catch (error) {
    if (stageInputFingerprint && existsSync(projectPath)) {
      try {
        commitProjectStageFailure({
          project_path: projectPath,
          stage: "project.source-frames",
          command: "project.source-frames",
          input_fingerprint: stageInputFingerprint,
          inputs: stageInputs,
          failure_code: errorCode(error, "PROJECT_SOURCE_FRAMES_FAILED"),
          failure_message: error instanceof Error ? error.message : String(error),
          artifact: "source-frames",
          remediation: errorRemediation(error, "Fix source-frame-request.json or source media, then rerun project source-frames."),
          started_at: startedAt,
          completed_at: new Date().toISOString(),
        });
      } catch {
        // Preserve the original extraction failure.
      }
    }
    if (isSourceFrameError(error) || isProviderModeError(error) || isArtifactContractError(error)) return fail("project.source-frames", "PROJECT_SOURCE_FRAMES_FAILED", error);
    return fail("project.source-frames", "PROJECT_SOURCE_FRAMES_FAILED", new Error("source frames command failed"));
  }
}

function importSourceFrameEvidence(
  projectPath: string,
  evidenceDir: string,
  options: ProviderModeOption,
): CommandResult<"project.source-frames", ProjectSourceFramesData> {
  const startedAt = new Date().toISOString();
  try {
    resolveProjectProviderMode(projectPath, options.providerMode);
    const request = readSourceFrameRequest(projectPath);
    const sources = readManifest(projectPath);
    const sourceById = new Map(sources.sources.map((source) => [source.source_id, source]));
    for (const frame of request.frames) {
      const source = sourceById.get(frame.source_id);
      if (!source) throw sourceFrameError("SOURCE_FRAME_SOURCE_NOT_FOUND", `source frame ${frame.id} references an unknown source`);
      if (frame.time_seconds >= source.duration_seconds) throw sourceFrameError("SOURCE_FRAME_TIME_OUT_OF_RANGE", `source frame ${frame.id} time is outside its source`);
    }
    const members = validateEvidenceDirectory(evidenceDir, {
      expectedBindings: Object.fromEntries(request.frames.map((frame) => [frame.id, {
        source_id: frame.source_id,
        source_time_seconds: frame.time_seconds,
        request_id: frame.id,
      }])),
    });
    const memberById = new Map(members.map((member) => [member.id, member]));
    const stagingId = Date.now().toString(36);
    const stagingDir = resolveProjectOutputPath(projectPath, `.source-frames-staging-${stagingId}`, "source frame staging directory");
    const stagedManifestPath = resolveProjectOutputPath(projectPath, `.source-frames-${stagingId}.json`, "source frame staged manifest");
    mkdirSync(stagingDir, { recursive: true });
    const frames = request.frames.map((frame, index): SourceFrame => {
      const member = memberById.get(frame.id)!;
      const fileName = `frame-${String(index + 1).padStart(4, "0")}.jpg`;
      copyFileSync(member.absolute_path, join(stagingDir, fileName));
      return { ...frame, index, path: `.source-frames/${fileName}`, mime_type: "image/jpeg", width: member.width, height: member.height, size_bytes: member.size_bytes, sha256: member.sha256 };
    });
    validateSourceFrameByteLimits(frames.map((frame) => frame.size_bytes));
    const artifact = parseSourceFramesArtifactForImport({
      version: "1.0",
      frames,
      frame_count: frames.length,
      total_size_bytes: frames.reduce((sum, frame) => sum + frame.size_bytes, 0),
    });
    atomicWriteJson(stagedManifestPath, artifact);
    const lifecycleManifest = requireProjectArtifactManifest(projectPath, "project.source-frames");
    const sourceReferences = [...new Set(request.frames.map((frame) => frame.source_id))].map((sourceId) => artifactReference(requiredArtifactRecord(lifecycleManifest, `source-identity:${sourceId}`)));
    const recordedAt = new Date().toISOString();
    const requestRecord = recordJsonArtifact({
      project_path: projectPath,
      key: "source-frame-request",
      path: projectArtifacts.sourceFrameRequest,
      role: "command_request",
      schema_version: request.version,
      authored_by: "agent",
      command: "project.source-frames",
      mode: "validated",
      inputs: sourceReferences,
      value: request,
      file_sha256: projectFileBytesFingerprint(projectPath, projectArtifacts.sourceFrameRequest, "source frame request"),
      recorded_at: recordedAt,
    });
    const requestReference = artifactReference(requestRecord);
    const framesTargetPath = resolveProjectOutputPath(projectPath, ".source-frames", "source frame output directory");
    const manifestTargetPath = resolveProjectOutputPath(projectPath, projectArtifacts.sourceFrames, "source frames output");
    commitManagedPublications([
      { staged_path: stagingDir, target_path: framesTargetPath },
      { staged_path: stagedManifestPath, target_path: manifestTargetPath },
    ], () => {
      const frameRecords = frames.map((frame) => recordFileArtifact({
        project_path: projectPath,
        key: `source-frame:${frame.id}`,
        path: frame.path,
        role: "evidence",
        schema_version: "image/jpeg",
        authored_by: "host",
        command: "project.source-frames",
        mode: "validated",
        inputs: [requestReference, sourceReferences.find((reference) => reference.key.endsWith(`:${frame.source_id}`))!],
        recorded_at: recordedAt,
      }));
      const sourceFramesRecord = recordJsonArtifact({
        project_path: projectPath,
        key: "source-frames",
        path: projectArtifacts.sourceFrames,
        role: "evidence",
        schema_version: artifact.version,
        authored_by: "cli",
        command: "project.source-frames",
        mode: "produced",
        inputs: [requestReference, ...frameRecords.map(artifactReference)],
        value: artifact,
        file_sha256: projectFileBytesFingerprint(projectPath, projectArtifacts.sourceFrames, "source frames"),
        recorded_at: recordedAt,
      });
      const stageInputs = [requestReference, ...sourceReferences];
      commitProjectStage({ project_path: projectPath, stage: "project.source-frames", command: "project.source-frames", input_fingerprint: inputFingerprint(stageInputs), inputs: stageInputs, records: [requestRecord, ...frameRecords, sourceFramesRecord], replace_record_prefixes: ["source-frame:"], started_at: startedAt, completed_at: recordedAt });
    });
    return ok("project.source-frames", { project_path: projectPath, source_frame_request_path: projectArtifacts.sourceFrameRequest, source_frames_path: projectArtifacts.sourceFrames, frame_count: frames.length, total_size_bytes: artifact.total_size_bytes, warnings: sourceFrameDuplicateWarnings(request) });
  } catch (error) {
    return fail("project.source-frames", errorCode(error, "PROJECT_SOURCE_FRAMES_FAILED"), error);
  }
}

function parseSourceFramesArtifactForImport(value: SourceFramesArtifact): SourceFramesArtifact {
  // The same parser contract is exercised by read/status; constructing through
  // the typed shape here avoids trusting any external manifest fields.
  return value;
}

function sourceFrameInputFingerprint(projectPath: string, _sourceId: string, projectRelativePath: string): Fingerprint {
  try {
    return projectFileBytesFingerprint(projectPath, projectRelativePath, "source media");
  } catch {
    throw sourceFrameError("SOURCE_FRAME_SOURCE_NOT_FOUND", "source media is not readable");
  }
}

export function focusGroundingProject(projectPath: string, options: ProviderModeOption = {}): CommandResult<"project.focus-grounding", ProjectFocusGroundingData> {
  const startedAt = new Date().toISOString();
  let stageInputFingerprint: Fingerprint | undefined;
  let stageInputs: ArtifactFingerprintReference[] | undefined;
  try {
    resolveProjectProviderMode(projectPath, options.providerMode);
    compileCurrentEdl(projectPath);
    const candidatesPath = join(projectPath, projectArtifacts.focusCandidates);
    const framesPath = join(projectPath, projectArtifacts.focusFrames);
    const candidates = parseFocusCandidates(readProjectJson(projectPath, projectArtifacts.focusCandidates, "focus candidates"));
    const frames = parseFocusFrames(readProjectJson(projectPath, projectArtifacts.focusFrames, "focus frames"));
    const groundingPath = join(projectPath, projectArtifacts.focusGrounding);
    const grounding = parseFocusGrounding(readProjectJson(projectPath, projectArtifacts.focusGrounding, "focus grounding"));
    const lifecycleManifest = readProjectArtifactManifest(projectPath);
    if (!lifecycleManifest) throw new Error("artifact manifest is required for focus grounding validation");
    const candidateReference: ArtifactFingerprintReference = {
      key: "focus-candidates",
      fingerprint: semanticJsonFingerprint(candidates),
      schema_version: candidates.version,
    };
    const framesReference: ArtifactFingerprintReference = {
      key: "focus-frames",
      fingerprint: semanticJsonFingerprint(frames),
      schema_version: frames.version,
    };
    const groundingReference: ArtifactFingerprintReference = {
      key: "focus-grounding",
      fingerprint: semanticJsonFingerprint(grounding),
      schema_version: grounding.version,
    };
    stageInputs = [candidateReference, framesReference, groundingReference];
    stageInputFingerprint = inputFingerprint(stageInputs);
    const groundingFrameReferences = [...new Set(grounding.groundings.map((item) => item.frame_id))].map((frameId) => {
      const frame = frames.frames.find((item) => item.id === frameId);
      if (!frame) throw new Error(`focus grounding references unknown frame_id: ${frameId}`);
      return {
        key: `focus-frame:${frameId}`,
        fingerprint: projectFileBytesFingerprint(projectPath, frame.path, `focus frame ${frame.id}`),
        schema_version: "image/jpeg",
      } satisfies ArtifactFingerprintReference;
    });
    stageInputs = [candidateReference, framesReference, ...groundingFrameReferences, groundingReference];
    stageInputFingerprint = inputFingerprint(stageInputs);
    const candidatesRecord = assertArtifactRecordCurrent(
      projectPath,
      lifecycleManifest,
      "focus-candidates",
      candidateReference.fingerprint,
      new Set(),
      new Set(),
      "project.focus-grounding",
    );
    const framesRecord = assertArtifactRecordCurrent(
      projectPath,
      lifecycleManifest,
      "focus-frames",
      framesReference.fingerprint,
      new Set(),
      new Set(),
      "project.focus-grounding",
    );
    const groundingFrameRecords = groundingFrameReferences.map((reference) => {
      return assertArtifactRecordCurrent(
        projectPath,
        lifecycleManifest,
        reference.key,
        reference.fingerprint,
        new Set(),
        new Set(),
        "project.focus-grounding",
      );
    });
    stageInputs = [
      artifactReference(candidatesRecord),
      artifactReference(framesRecord),
      ...groundingFrameRecords.map(artifactReference),
      groundingReference,
    ];
    stageInputFingerprint = inputFingerprint(stageInputs);
    const review = buildFocusReview(projectPath, candidates, frames, grounding, false);
    const recordedAt = new Date().toISOString();
    const groundingRecord = recordJsonArtifact({
      project_path: projectPath,
      key: "focus-grounding",
      path: projectArtifacts.focusGrounding,
      role: "authoritative_input",
      schema_version: grounding.version,
      authored_by: "agent",
      command: "project.focus-grounding",
      mode: "validated",
      inputs: [artifactReference(candidatesRecord), artifactReference(framesRecord), ...groundingFrameRecords.map(artifactReference)],
      value: grounding,
      file_sha256: fileBytesFingerprint(groundingPath),
      recorded_at: recordedAt,
    });
    commitProjectStage({
      project_path: projectPath,
      stage: "project.focus-grounding",
      command: "project.focus-grounding",
      input_fingerprint: stageInputFingerprint,
      inputs: stageInputs,
      records: [groundingRecord],
      started_at: startedAt,
      completed_at: recordedAt,
    });
    return ok("project.focus-grounding", {
      project_path: projectPath,
      focus_grounding_path: groundingPath,
      grounding_count: grounding.groundings.length,
      ready_count: review.items.filter((item) => item.status === "ready").length,
      warning_count: review.items.filter((item) => item.status === "warning").length,
      invalid_count: review.items.filter((item) => item.status === "invalid").length,
      warnings: review.warnings,
    });
  } catch (error) {
    if (stageInputFingerprint && existsSync(projectPath)) {
      try {
        commitProjectStageFailure({
          project_path: projectPath,
          stage: "project.focus-grounding",
          command: "project.focus-grounding",
          input_fingerprint: stageInputFingerprint,
          inputs: stageInputs,
          failure_code: errorCode(error, "PROJECT_FOCUS_GROUNDING_FAILED"),
          failure_message: error instanceof Error ? error.message : String(error),
          artifact: "focus-grounding",
          remediation: errorRemediation(error, "Fix focus-grounding.json against current frame evidence, then rerun project focus-grounding."),
          started_at: startedAt,
          completed_at: new Date().toISOString(),
        });
      } catch {
        // Preserve the original focus grounding validation failure.
      }
    }
    return fail("project.focus-grounding", "PROJECT_FOCUS_GROUNDING_FAILED", error);
  }
}

export function focusReviewProject(projectPath: string, options: ProviderModeOption = {}): CommandResult<"project.focus-review", ProjectFocusReviewData> {
  const startedAt = new Date().toISOString();
  let stageInputFingerprint: Fingerprint | undefined;
  let stageInputs: ArtifactFingerprintReference[] | undefined;
  try {
    resolveProjectProviderMode(projectPath, options.providerMode);
    compileCurrentEdl(projectPath);
    const candidates = parseFocusCandidates(readProjectJson(projectPath, projectArtifacts.focusCandidates, "focus candidates"));
    const frames = parseFocusFrames(readProjectJson(projectPath, projectArtifacts.focusFrames, "focus frames"));
    const grounding = parseFocusGrounding(readProjectJson(projectPath, projectArtifacts.focusGrounding, "focus grounding"));
    const lifecycleManifest = readProjectArtifactManifest(projectPath);
    if (!lifecycleManifest) throw new Error("artifact manifest is required for focus review");
    const candidatesReference: ArtifactFingerprintReference = {
      key: "focus-candidates",
      fingerprint: semanticJsonFingerprint(candidates),
      schema_version: candidates.version,
    };
    const framesReference: ArtifactFingerprintReference = {
      key: "focus-frames",
      fingerprint: semanticJsonFingerprint(frames),
      schema_version: frames.version,
    };
    const groundingReference: ArtifactFingerprintReference = {
      key: "focus-grounding",
      fingerprint: semanticJsonFingerprint(grounding),
      schema_version: grounding.version,
    };
    stageInputs = [candidatesReference, framesReference, groundingReference];
    stageInputFingerprint = inputFingerprint(stageInputs);
    const candidatesRecord = assertArtifactRecordCurrent(
      projectPath,
      lifecycleManifest,
      "focus-candidates",
      candidatesReference.fingerprint,
      new Set(),
      new Set(),
      "project.focus-review",
    );
    const framesRecord = assertArtifactRecordCurrent(
      projectPath,
      lifecycleManifest,
      "focus-frames",
      framesReference.fingerprint,
      new Set(),
      new Set(),
      "project.focus-review",
    );
    const groundingRecord = assertArtifactRecordCurrent(
      projectPath,
      lifecycleManifest,
      "focus-grounding",
      groundingReference.fingerprint,
      new Set(),
      new Set(),
      "project.focus-review",
    );
    const review = buildFocusReview(projectPath, candidates, frames, grounding, true);
    const reviewPath = join(projectPath, projectArtifacts.focusReview);
    const markdownPath = join(projectPath, projectArtifacts.focusReviewMarkdown);
    const stagedReviewPath = join(projectPath, `.focus-review-${Date.now().toString(36)}.json`);
    const stagedMarkdownPath = join(projectPath, `.focus-review-${Date.now().toString(36)}.md`);
    atomicWriteJson(stagedReviewPath, review);
    const parsedReview = parseFocusReview(readJson(stagedReviewPath));
    atomicWriteText(stagedMarkdownPath, renderFocusReviewMarkdown(candidates, parsedReview));
    atomicReplaceFile(stagedReviewPath, reviewPath);
    atomicReplaceFile(stagedMarkdownPath, markdownPath);

    const recordedAt = new Date().toISOString();
    const reviewRecord = recordJsonArtifact({
      project_path: projectPath,
      key: "focus-review",
      path: projectArtifacts.focusReview,
      role: "derived",
      schema_version: parsedReview.version,
      authored_by: "cli",
      command: "project.focus-review",
      mode: "produced",
      inputs: [artifactReference(candidatesRecord), artifactReference(framesRecord), artifactReference(groundingRecord)],
      value: parsedReview,
      file_sha256: fileBytesFingerprint(reviewPath),
      recorded_at: recordedAt,
    });
    const reviewViewRecord = recordFileArtifact({
      project_path: projectPath,
      key: "focus-review-view",
      path: projectArtifacts.focusReviewMarkdown,
      role: "human_view",
      schema_version: "markdown-v1",
      authored_by: "cli",
      command: "project.focus-review",
      mode: "produced",
      inputs: [artifactReference(candidatesRecord), artifactReference(reviewRecord)],
      recorded_at: recordedAt,
    });
    commitProjectStage({
      project_path: projectPath,
      stage: "project.focus-review",
      command: "project.focus-review",
      input_fingerprint: stageInputFingerprint,
      inputs: stageInputs,
      records: [reviewRecord, reviewViewRecord],
      started_at: startedAt,
      completed_at: recordedAt,
    });
    return ok("project.focus-review", {
      project_path: projectPath,
      focus_review_path: reviewPath,
      focus_review_markdown_path: markdownPath,
      item_count: parsedReview.items.length,
      proposed_element_count: parsedReview.proposed_elements.length,
      proposed_elements: parsedReview.proposed_elements,
      warnings: parsedReview.warnings,
    });
  } catch (error) {
    if (stageInputFingerprint && existsSync(projectPath)) {
      try {
        commitProjectStageFailure({
          project_path: projectPath,
          stage: "project.focus-review",
          command: "project.focus-review",
          input_fingerprint: stageInputFingerprint,
          inputs: stageInputs,
          failure_code: errorCode(error, "PROJECT_FOCUS_REVIEW_FAILED"),
          failure_message: error instanceof Error ? error.message : String(error),
          artifact: "focus-review",
          remediation: errorRemediation(error, "Repair current focus grounding evidence, then rerun project focus-review."),
          started_at: startedAt,
          completed_at: new Date().toISOString(),
        });
      } catch {
        // Preserve the original focus review failure.
      }
    }
    return fail("project.focus-review", "PROJECT_FOCUS_REVIEW_FAILED", error);
  }
}

export function musicCatalogProject(projectPath: string, options: ProviderModeOption = {}): CommandResult<"project.music-catalog", ProjectMusicCatalogData> {
  const startedAt = new Date().toISOString();
  try {
    const providerMode = resolveProjectProviderMode(projectPath, options.providerMode);
    const catalog = providerMode === "platform" ? buildPlatformMusicCatalog() : buildMusicCatalog();
    const catalogPath = join(projectPath, projectArtifacts.musicCatalog);
    const markdownPath = join(projectPath, projectArtifacts.musicCatalogMarkdown);
    atomicWriteJson(catalogPath, catalog);
    atomicWriteText(markdownPath, renderMusicCatalogMarkdown(catalog));
    const recordedAt = new Date().toISOString();
    const catalogRecord = recordJsonArtifact({
      project_path: projectPath,
      key: "music-catalog",
      path: projectArtifacts.musicCatalog,
      role: "derived",
      schema_version: "1.0",
      authored_by: "cli",
      command: "project.music-catalog",
      mode: "produced",
      value: catalog,
      file_sha256: fileBytesFingerprint(catalogPath),
      recorded_at: recordedAt,
    });
    const viewRecord = recordFileArtifact({
      project_path: projectPath,
      key: "music-catalog-view",
      path: projectArtifacts.musicCatalogMarkdown,
      role: "human_view",
      schema_version: "markdown-v1",
      authored_by: "cli",
      command: "project.music-catalog",
      mode: "produced",
      inputs: [artifactReference(catalogRecord)],
      recorded_at: recordedAt,
    });
    const stageInputs: ArtifactFingerprintReference[] = [];
    commitProjectStage({
      project_path: projectPath,
      stage: "project.music-catalog",
      command: "project.music-catalog",
      input_fingerprint: inputFingerprint(stageInputs),
      inputs: stageInputs,
      records: [catalogRecord, viewRecord],
      started_at: startedAt,
      completed_at: recordedAt,
    });
    return ok("project.music-catalog", {
      project_path: projectPath,
      music_catalog_path: catalogPath,
      music_catalog_markdown_path: markdownPath,
      library_track_count: catalog.library.track_count,
      providers: catalog.providers,
    });
  } catch (error) {
    return fail("project.music-catalog", "PROJECT_MUSIC_CATALOG_FAILED", error);
  }
}

type MusicPublishRuntime = {
  renameSync(sourcePath: string, targetPath: string): void;
};

type StagedMusicCommitEvidence = {
  request_file_sha256: Fingerprint;
  asset_file_sha256?: Fingerprint;
  asset_manifest?: AssetManifestArtifact;
  asset_manifest_file_sha256?: Fingerprint;
  acquisition_file_sha256: Fingerprint;
  review_file_sha256: Fingerprint;
  review_view_file_sha256: Fingerprint;
};

let musicStagingSequence = 0;

export async function musicAcquireProject(
  projectPath: string,
  options: ProviderModeOption = {},
  publishRuntime: MusicPublishRuntime = nodeFs as unknown as MusicPublishRuntime,
): Promise<CommandResult<"project.music-acquire", ProjectMusicAcquireData>> {
  const startedAt = new Date().toISOString();
  let stageInputs: ArtifactFingerprintReference[] | undefined;
  let stageInputFingerprint: Fingerprint | undefined;
  try {
    const providerMode = resolveProjectProviderMode(projectPath, options.providerMode);
    const requestPath = join(projectPath, projectArtifacts.musicRequest);
    const request = parseMusicRequest(readProjectJson(projectPath, projectArtifacts.musicRequest, "music request"));
    const requestReference = musicRequestMemberReference(request);
    stageInputs = [requestReference];
    stageInputFingerprint = inputFingerprint(stageInputs);
    if (providerMode === "platform") assertPlatformMusicAcquisitionAllowed(projectPath, "music-acquire");
    const stagingRoot = resolveProjectOutputPath(
      projectPath,
      join(
        ".koubo-clip",
        "staging",
        "music-acquire",
        `${Date.now().toString(36)}-${musicStagingSequence++}-${safeFileName(request.id)}`,
      ),
      "music acquisition staging directory",
    );
    const prepared = await acquireMusicAsset(projectPath, request, join(stagingRoot, "asset"));
    const acquisition = parseMusicAcquisition(prepared.acquisition);
    const review = parseMusicReview(buildMusicReview(acquisition));
    const acquisitionPath = join(projectPath, projectArtifacts.musicAcquisition);
    const reviewPath = join(projectPath, projectArtifacts.musicReview);
    const reviewMarkdownPath = join(projectPath, projectArtifacts.musicReviewMarkdown);
    const stagedAcquisitionPath = join(stagingRoot, projectArtifacts.musicAcquisition);
    const stagedReviewPath = join(stagingRoot, projectArtifacts.musicReview);
    const stagedReviewMarkdownPath = join(stagingRoot, projectArtifacts.musicReviewMarkdown);
    atomicWriteJson(stagedAcquisitionPath, acquisition);
    atomicWriteJson(stagedReviewPath, review);
    atomicWriteText(stagedReviewMarkdownPath, renderMusicReviewMarkdown(review));
    const validatedAcquisition = parseMusicAcquisition(readJson(stagedAcquisitionPath));
    const validatedReview = parseMusicReview(readJson(stagedReviewPath));
    if (semanticJsonFingerprint(validatedAcquisition.request) !== semanticJsonFingerprint(request)) {
      throw new Error("staged music acquisition does not match music-request.json");
    }
    if (validatedReview.request_id !== request.id) throw new Error("staged music review does not match music-request.json");

    const publications: Array<{ staged_path: string; target_path: string }> = [];
    let stagedAssetManifestPath: string | undefined;
    let assetFileSha256: Fingerprint | undefined;
    let assetManifestFileSha256: Fingerprint | undefined;
    if (validatedAcquisition.asset) {
      if (!prepared.staged_asset_path || !prepared.final_asset_path || !prepared.asset_manifest) {
        throw new Error("staged music acquisition is missing asset publication data");
      }
      const safeFinalAssetPath = resolveProjectOutputPath(projectPath, validatedAcquisition.asset.path, "music asset output");
      if (resolve(prepared.final_asset_path) !== resolve(safeFinalAssetPath)) {
        throw new Error("staged music asset target does not match music acquisition");
      }
      const manifestAsset = prepared.asset_manifest.assets.find((asset) => asset.id === validatedAcquisition.asset?.id);
      if (!manifestAsset || semanticJsonFingerprint(manifestAsset) !== semanticJsonFingerprint(validatedAcquisition.asset)) {
        throw new Error("staged asset-manifest does not match music acquisition");
      }
      assetFileSha256 = fileBytesFingerprint(prepared.staged_asset_path);
      if (validatedAcquisition.asset.hash !== `sha256-${assetFileSha256.slice("sha256:".length)}`) {
        throw new Error("staged music asset hash does not match acquisition metadata");
      }
      stagedAssetManifestPath = join(stagingRoot, projectArtifacts.assetManifest);
      atomicWriteJson(stagedAssetManifestPath, prepared.asset_manifest);
      const validatedAssetManifest = parseAssetManifest(readJson(stagedAssetManifestPath));
      if (semanticJsonFingerprint(assetManifestFingerprintProjection(validatedAssetManifest))
        !== semanticJsonFingerprint(assetManifestFingerprintProjection(prepared.asset_manifest))) {
        throw new Error("staged asset-manifest changed during validation");
      }
      assetManifestFileSha256 = fileBytesFingerprint(stagedAssetManifestPath);
      publications.push(
        { staged_path: prepared.staged_asset_path, target_path: prepared.final_asset_path },
        { staged_path: stagedAssetManifestPath, target_path: join(projectPath, projectArtifacts.assetManifest) },
      );
    } else if (prepared.staged_asset_path || prepared.final_asset_path || prepared.asset_manifest) {
      throw new Error("skipped music acquisition must not publish asset data");
    }

    const currentRequest = parseMusicRequest(readProjectJson(projectPath, projectArtifacts.musicRequest, "music request"));
    if (semanticJsonFingerprint(currentRequest) !== semanticJsonFingerprint(request)) {
      throw new Error("music-request.json changed while acquisition was running");
    }
    readProjectArtifactManifest(projectPath);
    const evidence: StagedMusicCommitEvidence = {
      request_file_sha256: fileBytesFingerprint(requestPath),
      asset_file_sha256: assetFileSha256,
      asset_manifest: prepared.asset_manifest,
      asset_manifest_file_sha256: assetManifestFileSha256,
      acquisition_file_sha256: fileBytesFingerprint(stagedAcquisitionPath),
      review_file_sha256: fileBytesFingerprint(stagedReviewPath),
      review_view_file_sha256: fileBytesFingerprint(stagedReviewMarkdownPath),
    };
    publications.push(
      { staged_path: stagedAcquisitionPath, target_path: acquisitionPath },
      { staged_path: stagedReviewPath, target_path: reviewPath },
      { staged_path: stagedReviewMarkdownPath, target_path: reviewMarkdownPath },
    );
    publishMusicCheckpoint(
      projectPath,
      publications,
      () => commitMusicArtifacts(projectPath, "project.music-acquire", startedAt, request, validatedAcquisition, validatedReview, stageInputs!, evidence),
      publishRuntime,
    );
    try {
      rmSync(stagingRoot, { recursive: true, force: true });
    } catch {
      // The public checkpoint and lineage are already committed; stale staging is non-authoritative.
    }
    return ok("project.music-acquire", {
      project_path: projectPath,
      music_acquisition_path: acquisitionPath,
      music_review_path: reviewPath,
      asset_manifest_path: join(projectPath, projectArtifacts.assetManifest),
      acquired: validatedAcquisition.acquired,
      asset: validatedAcquisition.asset
        ? {
            id: validatedAcquisition.asset.id,
            path: validatedAcquisition.asset.path,
            type: validatedAcquisition.asset.type,
            source: validatedAcquisition.asset.source,
            provider: validatedAcquisition.asset.provider,
            license: validatedAcquisition.asset.license,
            duration_seconds: validatedAcquisition.asset.duration_seconds,
          }
        : undefined,
      warnings: validatedAcquisition.warnings,
    });
  } catch (error) {
    if (stageInputFingerprint && existsSync(projectPath)) {
      try {
        commitProjectStageFailure({
          project_path: projectPath,
          stage: "project.music-acquire",
          command: "project.music-acquire",
          input_fingerprint: stageInputFingerprint,
          inputs: stageInputs,
          failure_code: errorCode(error, "PROJECT_MUSIC_ACQUIRE_FAILED"),
          failure_message: error instanceof Error ? error.message : String(error),
          artifact: "music-acquisition",
          remediation: errorRemediation(error, "Fix music-request.json or provider fulfillment, then rerun project music-acquire."),
          started_at: startedAt,
          completed_at: new Date().toISOString(),
        });
      } catch {
        // Preserve the acquisition failure.
      }
    }
    return fail("project.music-acquire", "PROJECT_MUSIC_ACQUIRE_FAILED", error);
  }
}

function publishMusicCheckpoint(
  projectPath: string,
  publications: Array<{ staged_path: string; target_path: string }>,
  commitLineage: () => void,
  runtime: MusicPublishRuntime,
): void {
  const stagedPaths = new Set<string>();
  const targetPaths = new Set<string>();
  for (const publication of publications) {
    const stagedPath = resolveExistingProjectPath(
      projectPath,
      publication.staged_path,
      "music checkpoint staged file",
    );
    const targetPath = resolveProjectOutputPath(
      projectPath,
      publication.target_path,
      "music checkpoint target",
    );
    if (stagedPaths.has(stagedPath) || targetPaths.has(targetPath)) throw new Error("music checkpoint contains duplicate publication paths");
    stagedPaths.add(stagedPath);
    targetPaths.add(targetPath);
    if (!existsSync(stagedPath) || !statSync(stagedPath).isFile()) throw new Error("music checkpoint staged file is missing");
    if (existsSync(targetPath) && !statSync(targetPath).isFile()) throw new Error("music checkpoint target must be a regular file");
    mkdirSync(dirname(targetPath), { recursive: true });
  }

  const published: Array<{ staged_path: string; target_path: string; backup_path?: string }> = [];
  try {
    for (const publication of publications) {
      const stagedPath = resolveExistingProjectPath(
        projectPath,
        publication.staged_path,
        "music checkpoint staged file",
      );
      const targetPath = resolveProjectOutputPath(
        projectPath,
        publication.target_path,
        "music checkpoint target",
      );
      let backupPath: string | undefined;
      if (existsSync(targetPath)) {
        backupPath = musicPublicationBackupPath(targetPath);
        runtime.renameSync(targetPath, backupPath);
      }
      published.push({ staged_path: stagedPath, target_path: targetPath, backup_path: backupPath });
      runtime.renameSync(stagedPath, targetPath);
    }
    commitLineage();
  } catch (error) {
    for (const publication of [...published].reverse()) {
      if (existsSync(publication.target_path)) {
        try {
          runtime.renameSync(publication.target_path, publication.staged_path);
        } catch {
          try {
            unlinkSync(publication.target_path);
          } catch {
            // Continue restoring the last committed checkpoint.
          }
        }
      }
      if (publication.backup_path && existsSync(publication.backup_path)) {
        try {
          runtime.renameSync(publication.backup_path, publication.target_path);
        } catch {
          // Preserve the original publication failure; status can expose an incomplete rollback.
        }
      }
    }
    throw error;
  }

  for (const publication of published) {
    if (!publication.backup_path || !existsSync(publication.backup_path)) continue;
    try {
      unlinkSync(publication.backup_path);
    } catch {
      // The committed checkpoint is authoritative; a leftover backup is diagnostic only.
    }
  }
}

function musicPublicationBackupPath(targetPath: string): string {
  let sequence = 0;
  let candidate = `${targetPath}.previous-music-${Date.now().toString(36)}-${sequence}`;
  while (existsSync(candidate)) candidate = `${targetPath}.previous-music-${Date.now().toString(36)}-${++sequence}`;
  return candidate;
}

export async function musicReviewProject(projectPath: string, options: ProviderModeOption = {}): Promise<CommandResult<"project.music-review", ProjectMusicReviewData>> {
  const startedAt = new Date().toISOString();
  let stageInputs: ArtifactFingerprintReference[] | undefined;
  let stageInputFingerprint: Fingerprint | undefined;
  try {
    const providerMode = resolveProjectProviderMode(projectPath, options.providerMode);
    const request = parseMusicRequest(readProjectJson(projectPath, projectArtifacts.musicRequest, "music request"));
    const requestReference = musicRequestMemberReference(request);
    stageInputs = [requestReference];
    stageInputFingerprint = inputFingerprint(stageInputs);
    const acquisitionPath = join(projectPath, projectArtifacts.musicAcquisition);
    if (providerMode === "platform" && !existsSync(acquisitionPath)) assertPlatformMusicAcquisitionAllowed(projectPath, "music-review");
    if (!existsSync(acquisitionPath)) {
      throw lifecycleCommandError(
        "MUSIC_ACQUISITION_MISSING",
        `${projectArtifacts.musicAcquisition} is missing`,
        projectArtifacts.musicAcquisition,
        "Run project music-acquire before project music-review.",
        "project.music-review",
      );
    }
    const acquisition = parseMusicAcquisition(readProjectJson(projectPath, projectArtifacts.musicAcquisition, "music acquisition"));
    if (semanticJsonFingerprint(acquisition.request) !== semanticJsonFingerprint(request)) throw new Error("music-acquisition.json does not match current music-request.json");
    const acquisitionReference: ArtifactFingerprintReference = {
      key: "music-acquisition",
      schema_version: acquisition.version,
      fingerprint: semanticJsonFingerprint(musicAcquisitionFingerprintProjection(acquisition)),
    };
    stageInputs = [requestReference, acquisitionReference];
    stageInputFingerprint = inputFingerprint(stageInputs);
    const review = parseMusicReview(buildMusicReview(acquisition));
    const reviewPath = join(projectPath, projectArtifacts.musicReview);
    const reviewMarkdownPath = join(projectPath, projectArtifacts.musicReviewMarkdown);
    atomicWriteJson(reviewPath, review);
    atomicWriteText(reviewMarkdownPath, renderMusicReviewMarkdown(review));
    commitMusicArtifacts(projectPath, "project.music-review", startedAt, request, acquisition, review, stageInputs);
    return ok("project.music-review", {
      project_path: projectPath,
      music_review_path: reviewPath,
      music_review_markdown_path: reviewMarkdownPath,
      review,
    });
  } catch (error) {
    if (stageInputFingerprint && existsSync(projectPath)) {
      try {
        commitProjectStageFailure({
          project_path: projectPath,
          stage: "project.music-review",
          command: "project.music-review",
          input_fingerprint: stageInputFingerprint,
          inputs: stageInputs,
          failure_code: errorCode(error, "PROJECT_MUSIC_REVIEW_FAILED"),
          failure_message: error instanceof Error ? error.message : String(error),
          artifact: "music-review",
          remediation: errorRemediation(error, "Repair the current music acquisition, then rerun project music-review."),
          started_at: startedAt,
          completed_at: new Date().toISOString(),
        });
      } catch {
        // Preserve the review failure.
      }
    }
    return fail("project.music-review", "PROJECT_MUSIC_REVIEW_FAILED", error);
  }
}

function musicRequestMemberReference(request: ReturnType<typeof parseMusicRequest>): ArtifactFingerprintReference {
  return {
    key: `music-request:${request.id}`,
    schema_version: request.version,
    fingerprint: semanticJsonFingerprint(request),
  };
}

function commitMusicArtifacts(
  projectPath: string,
  command: "project.music-acquire" | "project.music-review",
  startedAt: string,
  request: ReturnType<typeof parseMusicRequest>,
  acquisition: ReturnType<typeof parseMusicAcquisition>,
  review: ReturnType<typeof parseMusicReview>,
  stageInputs: ArtifactFingerprintReference[],
  evidence?: StagedMusicCommitEvidence,
): void {
  const recordedAt = new Date().toISOString();
  const requestPath = join(projectPath, projectArtifacts.musicRequest);
  const requestMemberRecord = recordJsonArtifact({
    project_path: projectPath,
    key: `music-request:${request.id}`,
    path: `${projectArtifacts.musicRequest}#music-request:${request.id}`,
    role: "command_request",
    schema_version: request.version,
    authored_by: "agent",
    command,
    mode: "validated",
    value: request,
    recorded_at: recordedAt,
  });
  const requestRecord = recordJsonArtifact({
    project_path: projectPath,
    key: "music-request",
    path: projectArtifacts.musicRequest,
    role: "command_request",
    schema_version: request.version,
    authored_by: "agent",
    command,
    mode: "validated",
    value: request,
    file_sha256: evidence?.request_file_sha256 ?? fileBytesFingerprint(requestPath),
    recorded_at: recordedAt,
  });
  const assetRecords: ArtifactRecord[] = acquisition.asset
    ? [evidence?.asset_file_sha256
        ? recordArtifactValue({
          project_path: projectPath,
          key: `asset:${acquisition.asset.id}`,
          path: acquisition.asset.path,
          role: "execution_result",
          schema_version: "bytes-v1",
          authored_by: "cli",
          command,
          mode: "produced",
          inputs: [artifactReference(requestMemberRecord)],
          fingerprint: evidence.asset_file_sha256,
          file_sha256: evidence.asset_file_sha256,
          recorded_at: recordedAt,
        })
        : (() => {
          const fingerprint = fileBytesFingerprint(projectAssetPath(projectPath, acquisition.asset!.path));
          return recordArtifactValue({
            project_path: projectPath,
            key: `asset:${acquisition.asset!.id}`,
            path: acquisition.asset!.path,
            role: "execution_result",
            schema_version: "bytes-v1",
            authored_by: "cli",
            command,
            mode: "produced",
            inputs: [artifactReference(requestMemberRecord)],
            fingerprint,
            file_sha256: fingerprint,
            recorded_at: recordedAt,
          });
        })()]
    : [];
  const assetManifestPath = join(projectPath, projectArtifacts.assetManifest);
  const assetManifest = evidence?.asset_manifest
    ?? (acquisition.asset && existsSync(assetManifestPath) ? parseAssetManifest(readProjectJson(projectPath, projectArtifacts.assetManifest, "asset manifest")) : undefined);
  const assetManifestRecord = acquisition.asset && assetManifest
    ? recordJsonArtifact({
        project_path: projectPath,
        key: "asset-manifest",
        path: projectArtifacts.assetManifest,
        role: "execution_result",
        schema_version: "1.0",
        authored_by: "cli",
        command,
        mode: "produced",
        inputs: assetRecords.map(artifactReference),
        value: assetManifestFingerprintProjection(assetManifest),
        file_sha256: evidence?.asset_manifest_file_sha256 ?? fileBytesFingerprint(assetManifestPath),
        recorded_at: recordedAt,
      })
    : undefined;
  const acquisitionPath = join(projectPath, projectArtifacts.musicAcquisition);
  const acquisitionRecord = recordJsonArtifact({
    project_path: projectPath,
    key: "music-acquisition",
    path: projectArtifacts.musicAcquisition,
    role: "execution_result",
    schema_version: acquisition.version,
    authored_by: "cli",
    command,
    mode: "produced",
    inputs: [artifactReference(requestMemberRecord), ...assetRecords.map(artifactReference)],
    value: musicAcquisitionFingerprintProjection(acquisition),
    file_sha256: evidence?.acquisition_file_sha256 ?? fileBytesFingerprint(acquisitionPath),
    recorded_at: recordedAt,
  });
  const reviewPath = join(projectPath, projectArtifacts.musicReview);
  const reviewRecord = recordJsonArtifact({
    project_path: projectPath,
    key: "music-review",
    path: projectArtifacts.musicReview,
    role: "derived",
    schema_version: review.version,
    authored_by: "cli",
    command,
    mode: "produced",
    inputs: [artifactReference(acquisitionRecord)],
    value: review,
    file_sha256: evidence?.review_file_sha256 ?? fileBytesFingerprint(reviewPath),
    recorded_at: recordedAt,
  });
  const viewRecord = evidence?.review_view_file_sha256
    ? recordArtifactValue({
      project_path: projectPath,
      key: "music-review-view",
      path: projectArtifacts.musicReviewMarkdown,
      role: "human_view",
      schema_version: "markdown-v1",
      authored_by: "cli",
      command,
      mode: "produced",
      inputs: [artifactReference(reviewRecord)],
      fingerprint: evidence.review_view_file_sha256,
      file_sha256: evidence.review_view_file_sha256,
      recorded_at: recordedAt,
    })
    : recordFileArtifact({
      project_path: projectPath,
      key: "music-review-view",
      path: projectArtifacts.musicReviewMarkdown,
      role: "human_view",
      schema_version: "markdown-v1",
      authored_by: "cli",
      command,
      mode: "produced",
      inputs: [artifactReference(reviewRecord)],
      recorded_at: recordedAt,
    });
  commitProjectStage({
    project_path: projectPath,
    stage: command,
    command,
    input_fingerprint: inputFingerprint(stageInputs),
    inputs: stageInputs,
    records: [requestRecord, requestMemberRecord, ...assetRecords, ...(assetManifestRecord ? [assetManifestRecord] : []), acquisitionRecord, reviewRecord, viewRecord],
    replace_record_prefixes: [`music-request:`],
    started_at: startedAt,
    completed_at: recordedAt,
  });
}

export function visualCatalogProject(projectPath: string, options: ProviderModeOption = {}): CommandResult<"project.visual-catalog", ProjectVisualCatalogData> {
  const startedAt = new Date().toISOString();
  const stageInputs: ArtifactFingerprintReference[] = [];
  const stageInputFingerprint = inputFingerprint(stageInputs);
  try {
    const providerMode = resolveProjectProviderMode(projectPath, options.providerMode);
    const catalog = providerMode === "platform" ? buildPlatformVisualCatalog() : buildVisualCatalog();
    const catalogPath = join(projectPath, projectArtifacts.visualCatalog);
    const markdownPath = join(projectPath, projectArtifacts.visualCatalogMarkdown);
    const stagingId = Date.now().toString(36);
    const stagedCatalogPath = join(projectPath, `.visual-catalog-${stagingId}.json`);
    const stagedMarkdownPath = join(projectPath, `.visual-catalog-${stagingId}.md`);
    atomicWriteJson(stagedCatalogPath, catalog);
    atomicWriteText(stagedMarkdownPath, renderVisualCatalogMarkdown(catalog));
    atomicReplaceFile(stagedCatalogPath, catalogPath);
    atomicReplaceFile(stagedMarkdownPath, markdownPath);

    const recordedAt = new Date().toISOString();
    const catalogRecord = recordJsonArtifact({
      project_path: projectPath,
      key: "visual-catalog",
      path: projectArtifacts.visualCatalog,
      role: "derived",
      schema_version: catalog.version,
      authored_by: "cli",
      command: "project.visual-catalog",
      mode: "produced",
      value: catalog,
      file_sha256: fileBytesFingerprint(catalogPath),
      recorded_at: recordedAt,
    });
    const viewRecord = recordFileArtifact({
      project_path: projectPath,
      key: "visual-catalog-view",
      path: projectArtifacts.visualCatalogMarkdown,
      role: "human_view",
      schema_version: "markdown-v1",
      authored_by: "cli",
      command: "project.visual-catalog",
      mode: "produced",
      inputs: [artifactReference(catalogRecord)],
      recorded_at: recordedAt,
    });
    commitProjectStage({
      project_path: projectPath,
      stage: "project.visual-catalog",
      command: "project.visual-catalog",
      input_fingerprint: stageInputFingerprint,
      inputs: stageInputs,
      records: [catalogRecord, viewRecord],
      started_at: startedAt,
      completed_at: recordedAt,
    });
    return ok("project.visual-catalog", {
      project_path: projectPath,
      visual_catalog_path: catalogPath,
      visual_catalog_markdown_path: markdownPath,
      providers: catalog.providers,
      runtime_allowlist: catalog.runtime_allowlist,
    });
  } catch (error) {
    if (existsSync(projectPath)) {
      try {
        commitProjectStageFailure({
          project_path: projectPath,
          stage: "project.visual-catalog",
          command: "project.visual-catalog",
          input_fingerprint: stageInputFingerprint,
          inputs: stageInputs,
          failure_code: errorCode(error, "PROJECT_VISUAL_CATALOG_FAILED"),
          failure_message: error instanceof Error ? error.message : String(error),
          artifact: "visual-catalog",
          remediation: errorRemediation(error, "Repair the project provider mode, then rerun project visual-catalog."),
          started_at: startedAt,
          completed_at: new Date().toISOString(),
        });
      } catch {
        // Preserve the original catalog failure.
      }
    }
    return fail("project.visual-catalog", "PROJECT_VISUAL_CATALOG_FAILED", error);
  }
}

export async function visualSearchProject(projectPath: string, options: ProviderModeOption = {}): Promise<CommandResult<"project.visual-search", ProjectVisualSearchData>> {
  const startedAt = new Date().toISOString();
  let stageInputs: ArtifactFingerprintReference[] | undefined;
  let stageInputFingerprint: Fingerprint | undefined;
  try {
    const providerMode = resolveProjectProviderMode(projectPath, options.providerMode);
    const requestPath = join(projectPath, projectArtifacts.visualRequest);
    const requestValue = readProjectJson(projectPath, projectArtifacts.visualRequest, "visual request");
    stageInputs = [{ key: "visual-request", schema_version: "1.0", fingerprint: semanticJsonFingerprint(requestValue) }];
    stageInputFingerprint = inputFingerprint(stageInputs);
    const request = parseVisualRequest(requestValue);
    const inputRecords = visualInputRecords(projectPath, request, undefined, "project.visual-search", providerMode, startedAt);
    stageInputs = [artifactReference(inputRecords.request), ...inputRecords.request_members.map(artifactReference)];
    stageInputFingerprint = inputFingerprint(stageInputs);
    const candidates = parseVisualCandidates(
      providerMode === "platform" ? readPlatformVisualCandidatesOrBlock(projectPath, "visual-search") : await searchVisualAssets(projectPath),
    );
    const candidatesPath = join(projectPath, projectArtifacts.visualCandidates);
    const markdownPath = join(projectPath, projectArtifacts.visualCandidatesMarkdown);
    const stagingId = Date.now().toString(36);
    const stagedCandidatesPath = join(projectPath, `.visual-candidates-${stagingId}.json`);
    const stagedMarkdownPath = join(projectPath, `.visual-candidates-${stagingId}.md`);
    atomicWriteJson(stagedCandidatesPath, candidates);
    atomicWriteText(stagedMarkdownPath, renderVisualCandidatesMarkdown(candidates));
    atomicReplaceFile(stagedCandidatesPath, candidatesPath);
    atomicReplaceFile(stagedMarkdownPath, markdownPath);

    const recordedAt = new Date().toISOString();
    const outputRecords = visualInputRecords(projectPath, request, candidates, "project.visual-search", providerMode, recordedAt, true);
    const candidatesRecord = outputRecords.candidates!;
    const viewRecord = recordFileArtifact({
      project_path: projectPath,
      key: "visual-candidates-view",
      path: projectArtifacts.visualCandidatesMarkdown,
      role: "human_view",
      schema_version: "markdown-v1",
      authored_by: "cli",
      command: "project.visual-search",
      mode: "produced",
      inputs: [artifactReference(candidatesRecord)],
      recorded_at: recordedAt,
    });
    commitProjectStage({
      project_path: projectPath,
      stage: "project.visual-search",
      command: "project.visual-search",
      input_fingerprint: stageInputFingerprint,
      inputs: stageInputs,
      records: [
        outputRecords.request,
        ...outputRecords.request_members,
        candidatesRecord,
        ...outputRecords.candidate_members,
        viewRecord,
      ],
      replace_record_prefixes: ["visual-request:", "visual-candidate:"],
      started_at: startedAt,
      completed_at: recordedAt,
    });
    return ok("project.visual-search", {
      project_path: projectPath,
      visual_request_path: requestPath,
      visual_candidates_path: candidatesPath,
      visual_candidates_markdown_path: markdownPath,
      request_count: request.requests.length,
      candidate_count: candidates.candidates.length,
      warnings: candidates.warnings,
    });
  } catch (error) {
    if (stageInputFingerprint && existsSync(projectPath)) {
      try {
        commitProjectStageFailure({
          project_path: projectPath,
          stage: "project.visual-search",
          command: "project.visual-search",
          input_fingerprint: stageInputFingerprint,
          inputs: stageInputs,
          failure_code: errorCode(error, "PROJECT_VISUAL_SEARCH_FAILED"),
          failure_message: error instanceof Error ? error.message : String(error),
          artifact: "visual-candidates",
          remediation: errorRemediation(error, "Fix visual-request.json or host/provider candidates, then rerun project visual-search."),
          started_at: startedAt,
          completed_at: new Date().toISOString(),
        });
      } catch {
        // Preserve the original search failure.
      }
    }
    return fail("project.visual-search", "PROJECT_VISUAL_SEARCH_FAILED", error);
  }
}

export async function visualAcquireProject(projectPath: string, options: ProviderModeOption = {}): Promise<CommandResult<"project.visual-acquire", ProjectVisualAcquireData>> {
  const startedAt = new Date().toISOString();
  let stageInputs: ArtifactFingerprintReference[] | undefined;
  let stageInputFingerprint: Fingerprint | undefined;
  let prepared: PreparedVisualAcquisition | undefined;
  try {
    const providerMode = resolveProjectProviderMode(projectPath, options.providerMode);
    const requestPath = join(projectPath, projectArtifacts.visualRequest);
    const candidatesPath = join(projectPath, projectArtifacts.visualCandidates);
    const requestValue = readProjectJson(projectPath, projectArtifacts.visualRequest, "visual request");
    stageInputs = [{ key: "visual-request", schema_version: "1.0", fingerprint: semanticJsonFingerprint(requestValue) }];
    stageInputFingerprint = inputFingerprint(stageInputs);
    if (providerMode === "platform") assertPlatformVisualAcquisitionAllowed(projectPath);
    const request = parseVisualRequest(requestValue);
    const candidates = parseVisualCandidates(readProjectJson(projectPath, projectArtifacts.visualCandidates, "visual candidates"));
    const preflightRecords = visualInputRecords(projectPath, request, candidates, "project.visual-acquire", providerMode, startedAt);
    stageInputs = [artifactReference(preflightRecords.request), artifactReference(preflightRecords.candidates!)];
    stageInputFingerprint = inputFingerprint(stageInputs);
    const selections = selectedVisualRecords(request, candidates, preflightRecords.request_members, preflightRecords.candidate_members);
    stageInputs = selections.flatMap((selection) => [artifactReference(selection.request_record), artifactReference(selection.candidate_record)]);
    stageInputFingerprint = inputFingerprint(stageInputs);
    prepared = await prepareVisualAssets(projectPath);
    const acquisition = parseVisualAcquisition(prepared.acquisition);
    const review = parseVisualReview(buildVisualReview(acquisition, request));
    const recordedAt = new Date().toISOString();
    const committedInputs = visualInputRecords(projectPath, request, candidates, "project.visual-acquire", providerMode, recordedAt);
    const committedSelections = selectedVisualRecords(
      request,
      candidates,
      committedInputs.request_members,
      committedInputs.candidate_members,
    );
    const assetManifestPath = join(projectPath, projectArtifacts.assetManifest);
    const assetManifest = parseAssetManifest(prepared.asset_manifest);
    const acquisitionByAssetId = new Map(acquisition.assets.map((asset) => [asset.asset_id, asset]));
    const lifecycleManifest = readProjectArtifactManifest(projectPath);
    const assetRecords = assetManifest.assets.map((asset) => {
      const acquired = acquisitionByAssetId.get(asset.id);
      const key = `asset:${asset.id}`;
      if (!acquired) {
        if (!lifecycleManifest?.artifacts[key]) {
          throw lifecycleCommandError(
            "LINEAGE_UNPROVEN",
            `${key} exists in asset-manifest.json without a committed asset record`,
            key,
            "Validate or reacquire the existing asset before visual acquisition.",
            "project.visual-acquire",
          );
        }
        if (lifecycleManifest.artifacts[key]!.path !== asset.path) {
          throw lifecycleCommandError(
            "ARTIFACT_INVALID",
            `${key} path does not match asset-manifest.json`,
            key,
            "Repair asset-manifest.json or reacquire the existing asset.",
            "project.visual-acquire",
          );
        }
        return assertArtifactRecordCurrent(
          projectPath,
          lifecycleManifest,
          key,
          fileBytesFingerprint(projectAssetPath(projectPath, asset.path)),
          new Set(),
          new Set(),
          "project.visual-acquire",
        );
      }
      const selected = committedSelections.find(
        (selection) =>
          selection.request.id === acquired.request_id && selection.candidate.id === acquired.candidate_id,
      );
      if (!selected) throw new Error(`${key} does not match a current selected visual candidate`);
      const fingerprint = fileBytesFingerprint(prepared!.stagedPath(asset.path));
      return recordArtifactValue({
        project_path: projectPath,
        key,
        path: asset.path,
        role: "execution_result",
        schema_version: "bytes-v1",
        authored_by: "cli",
        command: "project.visual-acquire",
        mode: "produced",
        inputs: [artifactReference(selected.request_record), artifactReference(selected.candidate_record)],
        fingerprint,
        file_sha256: fingerprint,
        recorded_at: recordedAt,
      });
    });
    const assetManifestRecord = recordJsonArtifact({
      project_path: projectPath,
      key: "asset-manifest",
      path: projectArtifacts.assetManifest,
      role: "execution_result",
      schema_version: "1.0",
      authored_by: "cli",
      command: "project.visual-acquire",
      mode: "produced",
      inputs: assetRecords.map(artifactReference),
      value: assetManifestFingerprintProjection(assetManifest),
      file_sha256: fileBytesFingerprint(prepared.stagedPath(projectArtifacts.assetManifest)),
      recorded_at: recordedAt,
    });
    const acquisitionPath = join(projectPath, projectArtifacts.visualAcquisition);
    const reviewPath = join(projectPath, projectArtifacts.visualReview);
    const reviewMarkdownPath = join(projectPath, projectArtifacts.visualReviewMarkdown);
    prepared.stageJson(projectArtifacts.visualAcquisition, acquisition);
    prepared.stageJson(projectArtifacts.visualReview, review);
    prepared.stageText(projectArtifacts.visualReviewMarkdown, renderVisualReviewMarkdown(review));

    const acquisitionRecord = recordJsonArtifact({
      project_path: projectPath,
      key: "visual-acquisition",
      path: projectArtifacts.visualAcquisition,
      role: "execution_result",
      schema_version: acquisition.version,
      authored_by: "cli",
      command: "project.visual-acquire",
      mode: "produced",
      inputs: [
        ...committedSelections.flatMap((selection) => [artifactReference(selection.request_record), artifactReference(selection.candidate_record)]),
        ...acquisition.assets.map((asset) => artifactReference(assetRecords.find((record) => record.key === `asset:${asset.asset_id}`)!)),
      ],
      value: visualAcquisitionFingerprintProjection(acquisition),
      file_sha256: fileBytesFingerprint(prepared.stagedPath(projectArtifacts.visualAcquisition)),
      recorded_at: recordedAt,
    });
    const reviewRecord = recordJsonArtifact({
      project_path: projectPath,
      key: "visual-review",
      path: projectArtifacts.visualReview,
      role: "derived",
      schema_version: review.version,
      authored_by: "cli",
      command: "project.visual-acquire",
      mode: "produced",
      inputs: [artifactReference(acquisitionRecord), ...committedSelections.map((selection) => artifactReference(selection.request_record))],
      value: review,
      file_sha256: fileBytesFingerprint(prepared.stagedPath(projectArtifacts.visualReview)),
      recorded_at: recordedAt,
    });
    const reviewViewFingerprint = fileBytesFingerprint(prepared.stagedPath(projectArtifacts.visualReviewMarkdown));
    const viewRecord = recordArtifactValue({
      project_path: projectPath,
      key: "visual-review-view",
      path: projectArtifacts.visualReviewMarkdown,
      role: "human_view",
      schema_version: "markdown-v1",
      authored_by: "cli",
      command: "project.visual-acquire",
      mode: "produced",
      inputs: [artifactReference(reviewRecord)],
      fingerprint: reviewViewFingerprint,
      file_sha256: reviewViewFingerprint,
      recorded_at: recordedAt,
    });
    prepared.publish();
    commitProjectStage({
      project_path: projectPath,
      stage: "project.visual-acquire",
      command: "project.visual-acquire",
      input_fingerprint: stageInputFingerprint,
      inputs: stageInputs,
      records: [
        committedInputs.request,
        ...committedInputs.request_members,
        committedInputs.candidates!,
        ...committedInputs.candidate_members,
        ...assetRecords,
        assetManifestRecord,
        acquisitionRecord,
        reviewRecord,
        viewRecord,
      ],
      replace_record_prefixes: ["visual-request:", "visual-candidate:", "asset:"],
      started_at: startedAt,
      completed_at: recordedAt,
    });
    prepared.finalize();
    prepared = undefined;
    return ok("project.visual-acquire", {
      project_path: projectPath,
      visual_acquisition_path: acquisitionPath,
      visual_review_path: reviewPath,
      asset_manifest_path: join(projectPath, projectArtifacts.assetManifest),
      acquired_count: acquisition.assets.length,
      assets: acquisition.assets.map((asset) => ({
        id: asset.asset_id,
        path: asset.path,
        type: asset.asset_type,
        source: "imported",
        provider: asset.provider,
        license: asset.license,
      })),
      warnings: acquisition.warnings,
    });
  } catch (error) {
    if (prepared) {
      try {
        prepared.rollback();
      } catch {
        // Preserve the original acquisition failure.
      }
      prepared = undefined;
    }
    if (stageInputFingerprint && existsSync(projectPath)) {
      try {
        commitProjectStageFailure({
          project_path: projectPath,
          stage: "project.visual-acquire",
          command: "project.visual-acquire",
          input_fingerprint: stageInputFingerprint,
          inputs: stageInputs,
          failure_code: errorCode(error, "PROJECT_VISUAL_ACQUIRE_FAILED"),
          failure_message: error instanceof Error ? error.message : String(error),
          artifact: "visual-acquisition",
          remediation: errorRemediation(error, "Fix the reviewed visual selection or local asset, then rerun project visual-acquire."),
          started_at: startedAt,
          completed_at: new Date().toISOString(),
        });
      } catch {
        // Preserve the original acquisition failure.
      }
    }
    return fail("project.visual-acquire", "PROJECT_VISUAL_ACQUIRE_FAILED", error);
  }
}

export function visualReviewProject(projectPath: string, options: ProviderModeOption = {}): CommandResult<"project.visual-review", ProjectVisualReviewData> {
  const startedAt = new Date().toISOString();
  let stageInputs: ArtifactFingerprintReference[] | undefined;
  let stageInputFingerprint: Fingerprint | undefined;
  try {
    const providerMode = resolveProjectProviderMode(projectPath, options.providerMode);
    const acquisitionPath = join(projectPath, projectArtifacts.visualAcquisition);
    if (!existsSync(acquisitionPath)) throw new Error("visual-acquisition.json is required before visual-review");
    const acquisitionValue = readProjectJson(projectPath, projectArtifacts.visualAcquisition, "visual acquisition");
    stageInputs = [{ key: "visual-acquisition", schema_version: "1.0", fingerprint: semanticJsonFingerprint(acquisitionValue) }];
    stageInputFingerprint = inputFingerprint(stageInputs);
    const acquisition = parseVisualAcquisition(acquisitionValue);
    const requestPath = join(projectPath, projectArtifacts.visualRequest);
    if (!existsSync(requestPath)) throw new Error("visual-request.json is required before visual-review");
    const request = parseVisualRequest(readProjectJson(projectPath, projectArtifacts.visualRequest, "visual request"));
    const candidatesPath = join(projectPath, projectArtifacts.visualCandidates);
    if (!existsSync(candidatesPath)) throw new Error("visual-candidates.json is required before visual-review");
    const candidates = parseVisualCandidates(readProjectJson(projectPath, projectArtifacts.visualCandidates, "visual candidates"));
    const acquisitionReference: ArtifactFingerprintReference = {
      key: "visual-acquisition",
      schema_version: acquisition.version,
      fingerprint: semanticJsonFingerprint(visualAcquisitionFingerprintProjection(acquisition)),
    };
    stageInputs = [acquisitionReference];
    stageInputFingerprint = inputFingerprint(stageInputs);
    const lifecycleManifest = readProjectArtifactManifest(projectPath);
    if (!lifecycleManifest) throw lifecycleCommandError(
      "LINEAGE_UNPROVEN",
      "artifact manifest is required for visual review",
      "visual-acquisition",
      "Rerun project visual-acquire before project visual-review.",
      "project.visual-review",
    );
    const acquisitionRecord = assertArtifactRecordCurrent(
      projectPath,
      lifecycleManifest,
      "visual-acquisition",
      acquisitionReference.fingerprint,
      new Set(),
      new Set(),
      "project.visual-review",
    );
    const currentInputRecords = visualInputRecords(
      projectPath,
      request,
      candidates,
      "project.visual-review",
      providerMode,
      startedAt,
    );
    const acquisitionMemberRecords = acquisition.assets.flatMap((asset) => {
      const requestRecord = currentInputRecords.request_members.find((record) => record.key === `visual-request:${asset.request_id}`);
      const candidateRecord = currentInputRecords.candidate_members.find(
        (record) => record.key === `visual-candidate:${asset.request_id}:${asset.candidate_id}`,
      );
      const requestItem = request.requests.find((item) => item.id === asset.request_id);
      if (!requestRecord || !candidateRecord || !requestItem) {
        throw lifecycleCommandError(
          "ARTIFACT_STALE",
          `${asset.request_id} or selected candidate ${asset.candidate_id} is missing from current visual inputs`,
          "visual-acquisition",
          "Rerun project visual-acquire for the current request and candidate set.",
          "project.visual-review",
        );
      }
      if (requestItem.selected_candidate_id !== asset.candidate_id) {
        throw lifecycleCommandError(
          "ARTIFACT_STALE",
          `${asset.request_id} no longer selects acquisition candidate ${asset.candidate_id}`,
          `visual-request:${asset.request_id}`,
          "Rerun project visual-acquire for the current selected candidate.",
          "project.visual-review",
        );
      }
      const currentRequestRecord = assertArtifactRecordCurrent(
        projectPath,
        lifecycleManifest,
        requestRecord.key,
        requestRecord.fingerprint,
        new Set(),
        new Set(),
        "project.visual-review",
      );
      const currentCandidateRecord = assertArtifactRecordCurrent(
        projectPath,
        lifecycleManifest,
        candidateRecord.key,
        candidateRecord.fingerprint,
        new Set(),
        new Set(),
        "project.visual-review",
      );
      return [currentRequestRecord, currentCandidateRecord];
    });
    stageInputs = [artifactReference(acquisitionRecord), ...acquisitionMemberRecords.map(artifactReference)];
    stageInputFingerprint = inputFingerprint(stageInputs);
    const review = parseVisualReview(buildVisualReview(acquisition, request));
    const reviewPath = join(projectPath, projectArtifacts.visualReview);
    const reviewMarkdownPath = join(projectPath, projectArtifacts.visualReviewMarkdown);
    const stagingId = Date.now().toString(36);
    const stagedReviewPath = join(projectPath, `.visual-review-${stagingId}.json`);
    const stagedMarkdownPath = join(projectPath, `.visual-review-${stagingId}.md`);
    atomicWriteJson(stagedReviewPath, review);
    atomicWriteText(stagedMarkdownPath, renderVisualReviewMarkdown(review));
    atomicReplaceFile(stagedReviewPath, reviewPath);
    atomicReplaceFile(stagedMarkdownPath, reviewMarkdownPath);

    const recordedAt = new Date().toISOString();
    const reviewRecord = recordJsonArtifact({
      project_path: projectPath,
      key: "visual-review",
      path: projectArtifacts.visualReview,
      role: "derived",
      schema_version: review.version,
      authored_by: "cli",
      command: "project.visual-review",
      mode: "produced",
      inputs: stageInputs,
      value: review,
      file_sha256: fileBytesFingerprint(reviewPath),
      recorded_at: recordedAt,
    });
    const viewRecord = recordFileArtifact({
      project_path: projectPath,
      key: "visual-review-view",
      path: projectArtifacts.visualReviewMarkdown,
      role: "human_view",
      schema_version: "markdown-v1",
      authored_by: "cli",
      command: "project.visual-review",
      mode: "produced",
      inputs: [artifactReference(reviewRecord)],
      recorded_at: recordedAt,
    });
    commitProjectStage({
      project_path: projectPath,
      stage: "project.visual-review",
      command: "project.visual-review",
      input_fingerprint: stageInputFingerprint,
      inputs: stageInputs,
      records: [reviewRecord, viewRecord],
      started_at: startedAt,
      completed_at: recordedAt,
    });
    return ok("project.visual-review", {
      project_path: projectPath,
      visual_review_path: reviewPath,
      visual_review_markdown_path: reviewMarkdownPath,
      review,
    });
  } catch (error) {
    if (stageInputFingerprint && existsSync(projectPath)) {
      try {
        commitProjectStageFailure({
          project_path: projectPath,
          stage: "project.visual-review",
          command: "project.visual-review",
          input_fingerprint: stageInputFingerprint,
          inputs: stageInputs,
          failure_code: errorCode(error, "PROJECT_VISUAL_REVIEW_FAILED"),
          failure_message: error instanceof Error ? error.message : String(error),
          artifact: "visual-review",
          remediation: errorRemediation(error, "Rerun project visual-acquire for current inputs, then retry project visual-review."),
          started_at: startedAt,
          completed_at: new Date().toISOString(),
        });
      } catch {
        // Preserve the original review failure.
      }
    }
    return fail("project.visual-review", "PROJECT_VISUAL_REVIEW_FAILED", error);
  }
}

function visualInputRecords(
  projectPath: string,
  request: VisualRequestArtifact,
  candidates: VisualCandidatesArtifact | undefined,
  command: "project.visual-search" | "project.visual-acquire" | "project.visual-review",
  providerMode: ProviderExecutionMode,
  recordedAt: string,
  candidatesProduced = false,
): {
  request: ArtifactRecord;
  request_members: ArtifactRecord[];
  candidates?: ArtifactRecord;
  candidate_members: ArtifactRecord[];
} {
  const requestRecord = recordJsonArtifact({
    project_path: projectPath,
    key: "visual-request",
    path: projectArtifacts.visualRequest,
    role: "command_request",
    schema_version: request.version,
    authored_by: "agent",
    command,
    mode: "validated",
    value: request,
    file_sha256: projectFileBytesFingerprint(projectPath, projectArtifacts.visualRequest, "visual request"),
    recorded_at: recordedAt,
  });
  const requestMembers = request.requests.map((item) =>
    recordJsonArtifact({
      project_path: projectPath,
      key: `visual-request:${item.id}`,
      path: `${projectArtifacts.visualRequest}#visual-request:${item.id}`,
      role: "command_request",
      schema_version: request.version,
      authored_by: "agent",
      command,
      mode: "validated",
      value: item,
      recorded_at: recordedAt,
    }),
  );
  if (!candidates) return { request: requestRecord, request_members: requestMembers, candidate_members: [] };
  const candidateMode = candidatesProduced && providerMode === "standalone" ? "produced" : "validated";
  const candidateAuthor = candidatesProduced && providerMode === "standalone" ? "cli" : providerMode === "platform" ? "host" : "agent";
  const candidateMembers = candidates.candidates.map((candidate) => {
    const requestMember = requestMembers.find((record) => record.key === `visual-request:${candidate.request_id}`);
    if (!requestMember) throw new Error(`visual candidate ${candidate.id} references unknown request_id: ${candidate.request_id}`);
    return recordJsonArtifact({
      project_path: projectPath,
      key: `visual-candidate:${candidate.request_id}:${candidate.id}`,
      path: `${projectArtifacts.visualCandidates}#visual-candidate:${candidate.request_id}:${candidate.id}`,
      role: "evidence",
      schema_version: candidates.version,
      authored_by: candidateAuthor,
      command,
      mode: candidateMode,
      inputs: [artifactReference(requestMember)],
      value: candidate,
      recorded_at: recordedAt,
    });
  });
  const candidatesRecord = recordJsonArtifact({
    project_path: projectPath,
    key: "visual-candidates",
    path: projectArtifacts.visualCandidates,
    role: "evidence",
    schema_version: candidates.version,
    authored_by: candidateAuthor,
    command,
    mode: candidateMode,
    inputs: [artifactReference(requestRecord), ...requestMembers.map(artifactReference)],
    value: candidates,
    file_sha256: projectFileBytesFingerprint(projectPath, projectArtifacts.visualCandidates, "visual candidates"),
    recorded_at: recordedAt,
  });
  return {
    request: requestRecord,
    request_members: requestMembers,
    candidates: candidatesRecord,
    candidate_members: candidateMembers,
  };
}

function selectedVisualRecords(
  request: VisualRequestArtifact,
  candidates: VisualCandidatesArtifact,
  requestRecords: ArtifactRecord[],
  candidateRecords: ArtifactRecord[],
): Array<{
  request: VisualRequestArtifact["requests"][number];
  candidate: VisualCandidate;
  request_record: ArtifactRecord;
  candidate_record: ArtifactRecord;
}> {
  return request.requests.map((item) => {
    if (!item.selected_candidate_id) throw new Error(`${item.id}: selected_candidate_id is required`);
    const candidate = candidates.candidates.find(
      (entry) => entry.request_id === item.id && entry.id === item.selected_candidate_id,
    );
    if (!candidate) throw new Error(`${item.id}: selected candidate ${item.selected_candidate_id} was not found for this request`);
    if (!candidate.renderable) throw new Error(`${item.id}: selected candidate ${candidate.id} is not renderable`);
    const requestRecord = requestRecords.find((record) => record.key === `visual-request:${item.id}`)!;
    const candidateRecord = candidateRecords.find(
      (record) => record.key === `visual-candidate:${item.id}:${candidate.id}`,
    )!;
    return { request: item, candidate, request_record: requestRecord, candidate_record: candidateRecord };
  });
}

export function renderProject(projectPath: string, options: ProviderModeOption = {}): CommandResult<"project.render", ProjectRenderData> {
  const startedAt = new Date().toISOString();
  let renderInputFingerprint: Fingerprint | undefined;
  let renderStageInputs: ArtifactFingerprintReference[] | undefined;
  try {
    resolveProjectProviderMode(projectPath, options.providerMode);
    const manifest = readManifest(projectPath);
    const transcript = parseTranscript(readProjectJson(projectPath, projectArtifacts.transcriptJson, "transcript"), manifest);
    const editPlan = readEditPlan(projectPath, manifest);
    const compiledEdl = compileCurrentEdl(projectPath);
    const edl = compiledEdl.edl;
    const edlPath = join(projectPath, projectArtifacts.edl);
    const enrichment = hasEnrichmentInputs(projectPath, editPlan) ? validateEnrichmentPlan(projectPath, edl, editPlan) : undefined;
    const selectedOption = validateProjectAuthoringConformance(projectPath, enrichment?.plan);
    const captionsEnabled = selectedOption?.subtitles.enabled ?? true;
    const preparedLineage = prepareRenderLineage(projectPath, compiledEdl, transcript, enrichment);
    renderStageInputs = preparedLineage.inputs;
    renderInputFingerprint = inputFingerprint(renderStageInputs);

    const stagingRoot = resolveProjectOutputPath(
      projectPath,
      join(
        ".render",
        "staging",
        `render-${renderInputFingerprint.slice("sha256:".length, "sha256:".length + 16)}-${Date.now().toString(36)}`,
      ),
      "render staging directory",
    );
    mkdirSync(stagingRoot, { recursive: true });
    const stagedSubtitlesPath = join(stagingRoot, "subtitles.srt");
    const stagedCleanPath = join(stagingRoot, "clean.mp4");
    const stagedTimelinePath = enrichment ? stagedCleanPath : join(stagingRoot, "timeline.mp4");
    const stagedFinalPath = enrichment ? join(stagingRoot, "final.mp4") : undefined;
    const stagedStoryboardPath = enrichment ? join(stagingRoot, "storyboard.json") : undefined;
    atomicWriteText(stagedSubtitlesPath, captionsEnabled ? renderSrt(transcript, edl) : "");
    const frameSchedule = renderEdl(projectPath, edl, stagedTimelinePath, enrichment?.plan.profile.aspect_ratio ?? "source");
    if (!enrichment) {
      if (captionsEnabled) burnSubtitles(stagedTimelinePath, stagedSubtitlesPath, stagedCleanPath, stagingRoot);
      else copyFileSync(stagedTimelinePath, stagedCleanPath);
    }
    const stagedFinal = enrichment
      ? renderEnrichedVideo(projectPath, stagedCleanPath, stagedSubtitlesPath, enrichment.plan, enrichment.assets, {
          workDir: join(stagingRoot, "enrichment"),
          finalPath: stagedFinalPath!,
          storyboardPath: stagedStoryboardPath!,
        })
      : undefined;

    const durationToleranceSeconds = Math.max(0.05, 2 / frameSchedule.fps);
    assertStrictOutputTiming(stagedCleanPath, frameSchedule, durationToleranceSeconds);
    if (stagedFinal) assertStrictOutputTiming(stagedFinal, frameSchedule, durationToleranceSeconds);

    const cleanProbe = probeMedia(stagedCleanPath);
    if (!cleanProbe.probe_ok) throw new Error(`clean render probe failed: ${cleanProbe.probe_error}`);
    const finalProbe = stagedFinal ? probeMedia(stagedFinal) : undefined;
    if (finalProbe && !finalProbe.probe_ok) throw new Error(`final render probe failed: ${finalProbe.probe_error}`);

    const subtitlesPath = resolveProjectOutputPath(projectPath, projectArtifacts.subtitles, "subtitle output");
    const cleanRenderPath = resolveProjectOutputPath(projectPath, projectArtifacts.cleanRender, "clean render output");
    const finalRenderPath = stagedFinal ? resolveProjectOutputPath(projectPath, projectArtifacts.finalRender, "final render output") : undefined;
    const storyboardPath = stagedStoryboardPath ? resolveProjectOutputPath(projectPath, projectArtifacts.storyboard, "storyboard output") : undefined;
    const cleanHash = fileBytesFingerprint(stagedCleanPath);
    const finalHash = stagedFinal ? fileBytesFingerprint(stagedFinal) : undefined;
    const subtitlesHash = fileBytesFingerprint(stagedSubtitlesPath);
    const storyboardHash = stagedStoryboardPath ? fileBytesFingerprint(stagedStoryboardPath) : undefined;

    atomicReplaceFile(stagedSubtitlesPath, subtitlesPath);
    atomicReplaceFile(stagedCleanPath, cleanRenderPath);
    if (stagedStoryboardPath && storyboardPath) atomicReplaceFile(stagedStoryboardPath, storyboardPath);
    if (stagedFinal && finalRenderPath) atomicReplaceFile(stagedFinal, finalRenderPath);

    const completedAt = new Date().toISOString();
    const outputs: RenderResult["outputs"] = [
      { key: "subtitles", role: "derived", path: projectArtifacts.subtitles, sha256: subtitlesHash },
      {
        key: "render-output:clean",
        role: "execution_result",
        path: projectArtifacts.cleanRender,
        sha256: cleanHash,
        duration_seconds: cleanProbe.duration_seconds,
        probe: cleanProbe,
      },
      ...(storyboardHash
        ? [{ key: "storyboard", role: "derived" as const, path: projectArtifacts.storyboard, sha256: storyboardHash }]
        : []),
      ...(finalHash && finalProbe
        ? [
            {
              key: "render-output:final",
              role: "execution_result" as const,
              path: projectArtifacts.finalRender,
              sha256: finalHash,
              duration_seconds: finalProbe.duration_seconds,
              probe: finalProbe,
            },
          ]
        : []),
    ];
    const canonicalOutputKey = finalHash ? "render-output:final" : "render-output:clean";
    const renderResult = parseRenderResult({
      contract_version: "1.0",
      input_fingerprint: renderInputFingerprint,
      inputs: preparedLineage.inputs,
      outputs,
      canonical_output_key: canonicalOutputKey,
      enrichment_applied: Boolean(finalHash),
      clean_output_path: projectArtifacts.cleanRender,
      producer_cli_version: cliVersion(),
      completed_at: completedAt,
    });
    const renderResultPath = resolveProjectOutputPath(projectPath, projectArtifacts.renderResult, "render result output");
    atomicWriteJson(renderResultPath, renderResult);

    const outputRecords = renderOutputRecords(projectPath, renderResult, preparedLineage.inputs, completedAt);
    const renderResultRecord = recordJsonArtifact({
      project_path: projectPath,
      key: "render-result",
      path: projectArtifacts.renderResult,
      role: "execution_result",
      schema_version: "1.0",
      authored_by: "cli",
      command: "project.render",
      mode: "produced",
      inputs: [...preparedLineage.inputs, ...outputRecords.map(artifactReference)],
      value: renderResultFingerprintProjection(renderResult),
      file_sha256: fileBytesFingerprint(renderResultPath),
      recorded_at: completedAt,
    });
    commitProjectStage({
      project_path: projectPath,
      stage: "project.render",
      command: "project.render",
      input_fingerprint: renderInputFingerprint,
      inputs: preparedLineage.inputs,
      records: [...preparedLineage.records, ...outputRecords, renderResultRecord],
      started_at: startedAt,
      completed_at: completedAt,
    });
    return ok("project.render", {
      project_path: projectPath,
      edl_path: edlPath,
      subtitles_path: subtitlesPath,
      clean_render_path: cleanRenderPath,
      final_render_path: finalRenderPath,
      render_result_path: renderResultPath,
      canonical_output_key: canonicalOutputKey,
      input_fingerprint: renderInputFingerprint,
      enrichment_applied: Boolean(finalHash),
      asset_summary: enrichment ? summarizeAssets(projectPath, enrichment.assets) : [],
      element_usage: enrichment ? summarizeHyperframesElements(enrichment.plan) : [],
      audio_usage: enrichment ? summarizeAudioUsage(enrichment.plan) : emptyAudioUsage(),
      warnings: enrichment?.warnings ?? [],
      expected_duration_seconds: frameSchedule.expected_duration_seconds,
    });
  } catch (error) {
    if (renderInputFingerprint && existsSync(projectPath)) {
      try {
        commitProjectStageFailure({
          project_path: projectPath,
          stage: "project.render",
          command: "project.render",
          input_fingerprint: renderInputFingerprint,
          inputs: renderStageInputs,
          failure_code: errorCode(error, "PROJECT_RENDER_FAILED"),
          failure_message: error instanceof Error ? error.message : String(error),
          artifact: "render-result",
          remediation: errorRemediation(error, "Fix the reported render input or media failure, then rerun project render."),
          started_at: startedAt,
          completed_at: new Date().toISOString(),
        });
      } catch {
        // Preserve the original render failure even if the failure checkpoint cannot be committed.
      }
    }
    return fail("project.render", "PROJECT_RENDER_FAILED", error);
  }
}

function prepareRenderLineage(
  projectPath: string,
  compiledEdl: ReturnType<typeof compileCurrentEdl>,
  transcript: TranscriptArtifact,
  enrichment?: ReturnType<typeof validateEnrichmentPlan>,
): { inputs: ArtifactFingerprintReference[]; records: ArtifactRecord[] } {
  const manifest = readProjectArtifactManifest(projectPath);
  if (!manifest) throw new Error("artifact manifest is missing after EDL compilation");
  const records: ArtifactRecord[] = [];
  const inputs: ArtifactFingerprintReference[] = [artifactReference(compiledEdl.edl_record)];
  const transcriptRecord = requiredArtifactRecord(manifest, "transcript");
  inputs.push(artifactReference(transcriptRecord));
  const sourceIds = [...new Set(compiledEdl.edl.entries.map((entry) => entry.source_id))];
  for (const sourceId of sourceIds) inputs.push(artifactReference(requiredArtifactRecord(manifest, `source:${sourceId}`)));

  if (!enrichment) return { inputs, records };
  const recordedAt = new Date().toISOString();
  const referencedAssetIds = new Set([
    ...enrichment.plan.audio.music.map((item) => item.asset_id),
    ...enrichment.plan.audio.sfx.flatMap((item) => (item.asset_id ? [item.asset_id] : [])),
    ...enrichment.plan.elements.flatMap((item) => (item.asset_id ? [item.asset_id] : [])),
  ]);
  const assetRecords = enrichment.assets.assets
    .filter((asset) => referencedAssetIds.has(asset.id))
    .map((asset) => {
      const key = `asset:${asset.id}`;
      const existing = manifest.artifacts[key];
      if (existing) {
        if (existing.path !== asset.path) throw new Error(`${key} path does not match asset-manifest.json`);
        return assertArtifactRecordCurrent(projectPath, manifest, key, fileBytesFingerprint(projectAssetPath(projectPath, asset.path)), new Set(), new Set(), "project.render");
      }
      const candidate = recordFileArtifact({
        project_path: projectPath,
        key,
        path: asset.path,
        role: "authoritative_input",
        schema_version: "bytes-v1",
        authored_by: asset.source === "bundled" || asset.source === "derived" ? "cli" : asset.source === "imported" ? "host" : "agent",
        command: "project.render",
        mode: "validated",
        recorded_at: recordedAt,
      });
      return currentOrReplacementRecord(manifest, candidate, records);
    });
  const assetReferences = assetRecords.map(artifactReference);
  const edlReference = artifactReference(compiledEdl.edl_record);
  const planPath = join(projectPath, projectArtifacts.enrichmentPlan);
  const planCandidate = recordJsonArtifact({
    project_path: projectPath,
    key: "enrichment-plan",
    path: projectArtifacts.enrichmentPlan,
    role: "authoritative_input",
    schema_version: enrichment.plan.version,
    authored_by: "agent",
    command: "project.render",
    mode: "validated",
    inputs: [edlReference, ...assetReferences],
    value: enrichment.plan,
    file_sha256: fileBytesFingerprint(planPath),
    recorded_at: recordedAt,
  });
  const planRecord = currentOrReplacementRecord(manifest, planCandidate, records);
  const assetManifestPath = join(projectPath, projectArtifacts.assetManifest);
  if (existsSync(assetManifestPath)) {
    const assetManifestCandidate = recordJsonArtifact({
      project_path: projectPath,
      key: "asset-manifest",
      path: projectArtifacts.assetManifest,
      role: "execution_result",
      schema_version: "1.0",
      authored_by: "cli",
      command: "project.render",
      mode: "validated",
      inputs: assetReferences,
      value: assetManifestFingerprintProjection(enrichment.assets),
      file_sha256: fileBytesFingerprint(assetManifestPath),
      recorded_at: recordedAt,
    });
    currentOrReplacementRecord(manifest, assetManifestCandidate, records);
  }
  inputs.push(artifactReference(planRecord), ...assetReferences);
  return { inputs, records };
}

function requiredArtifactRecord(manifest: NonNullable<ReturnType<typeof readProjectArtifactManifest>>, key: string): ArtifactRecord {
  const record = manifest.artifacts[key];
  if (!record) throw new Error(`artifact manifest is missing current record: ${key}`);
  return record;
}

function renderOutputRecords(
  projectPath: string,
  result: RenderResult,
  renderInputs: ArtifactFingerprintReference[],
  recordedAt: string,
): ArtifactRecord[] {
  return result.outputs.map((output) => {
    if (output.path.endsWith(".json")) {
      const path = resolveExistingProjectPath(projectPath, output.path, `render output ${output.key}`);
      const value = readJson(path);
      return recordJsonArtifact({
        project_path: projectPath,
        key: output.key,
        path: output.path,
        role: output.role,
        schema_version:
          output.key === "storyboard" && typeof value === "object" && value !== null && "version" in value && typeof value.version === "string"
            ? value.version
            : "json-v1",
        authored_by: "cli",
        command: "project.render",
        mode: "produced",
        inputs: renderInputs,
        value,
        file_sha256: fileBytesFingerprint(path),
        recorded_at: recordedAt,
      });
    }
    return recordFileArtifact({
      project_path: projectPath,
      key: output.key,
      path: output.path,
      role: output.role,
      schema_version: output.key === "subtitles" ? "srt" : "bytes-v1",
      authored_by: "cli",
      command: "project.render",
      mode: "produced",
      inputs: renderInputs,
      recorded_at: recordedAt,
    });
  });
}

function assertArtifactRecordCurrent(
  projectPath: string,
  manifest: ArtifactManifest,
  key: string,
  expectedFingerprint?: Fingerprint,
  visiting = new Set<string>(),
  verified = new Set<string>(),
  stage = "project.inspect",
): ArtifactRecord {
  const record = manifest.artifacts[key];
  if (!record) {
    throw lifecycleCommandError("LINEAGE_UNPROVEN", `artifact manifest is missing ${key}`, key, "Rerun the command that produces or validates this artifact.", stage);
  }
  if (expectedFingerprint && record.fingerprint !== expectedFingerprint) {
    throw lifecycleCommandError("ARTIFACT_STALE", `${key} fingerprint no longer matches its consumer`, key, "Rerun the command that validates or produces this artifact.", stage);
  }
  if (verified.has(key)) return record;
  if (visiting.has(key)) {
    throw lifecycleCommandError("DEPENDENCY_CYCLE", `artifact lineage contains a cycle at ${key}`, key, "Regenerate the affected artifacts.", stage);
  }
  visiting.add(key);
  const actualFingerprint = currentArtifactFingerprint(projectPath, record, stage);
  if (actualFingerprint !== record.fingerprint) {
    throw lifecycleCommandError("ARTIFACT_INVALID", `${key} content does not match its committed fingerprint`, key, "Rerun the command that validates or produces this artifact.", stage);
  }
  for (const input of record.inputs) {
    const dependency = manifest.artifacts[input.key];
    if (dependency?.role === "human_view") continue;
    if (dependency && input.schema_version && dependency.schema_version !== input.schema_version) {
      throw lifecycleCommandError(
        "DEPENDENCY_SCHEMA_CHANGED",
        `${input.key} schema no longer matches ${record.key}`,
        input.key,
        "Regenerate the affected artifact chain with the current CLI.",
        stage,
      );
    }
    assertArtifactRecordCurrent(projectPath, manifest, input.key, input.fingerprint, visiting, verified, stage);
  }
  visiting.delete(key);
  verified.add(key);
  return record;
}

function assertExploreSourceBoundary(projectPath: string, sources: SourcesManifest): void {
  const projectMetadata = readProjectMetadata(projectPath);
  if (!projectMetadata) {
    throw lifecycleCommandError(
      "PROJECT_METADATA_MISSING",
      "project.json is required before project explore",
      "project",
      "Restore project.json or create a new project from the source media.",
      "project.explore",
    );
  }
  const manifest = readProjectArtifactManifest(projectPath);
  if (!manifest) throw lifecycleCommandError("LINEAGE_UNPROVEN", "artifact-manifest.json is required", "artifact-manifest", "Create the project with the current CLI.", "project.explore");
  const projectRecord = assertArtifactRecordCurrent(
    projectPath,
    manifest,
    "project",
    semanticJsonFingerprint(projectMetadataFingerprintProjection(projectMetadata)),
    new Set(),
    new Set(),
    "project.explore",
  );
  assertArtifactRecordContract(
    projectRecord,
    {
      path: projectArtifacts.project,
      role: "authoritative_input",
      schema_version: projectMetadata.contract_version,
    },
    "project.explore",
  );
  assertCurrentSourceLineage(projectPath, sources, manifest, "project.explore");
}

function requireProjectArtifactManifest(projectPath: string, stage: string): ArtifactManifest {
  const manifest = readProjectArtifactManifest(projectPath);
  if (manifest) return manifest;
  throw lifecycleCommandError(
    "LINEAGE_UNPROVEN",
    "artifact-manifest.json does not establish current upstream lineage",
    "artifact-manifest",
    "Run project explore to validate the project source, transcript, and analysis before continuing.",
    stage,
  );
}

function projectSourceFingerprint(
  projectPath: string,
  sourceId: string,
  projectRelativePath: string,
  stage: string,
): Fingerprint {
  try {
    return fileBytesFingerprint(readableProjectSource(projectPath, sourceId, projectRelativePath));
  } catch {
    throw lifecycleCommandError(
      "SOURCE_NOT_PROJECT_LOCAL",
      `source ${sourceId} is not a readable project-local file`,
      `source:${sourceId}`,
      "Restore the original project-local source or create a new project from the replacement media.",
      stage,
    );
  }
}

function assertCurrentSourceLineage(
  projectPath: string,
  sources: SourcesManifest,
  manifest: ArtifactManifest,
  stage: string,
): {
  source_records: ArtifactRecord[];
  sources_record: ArtifactRecord;
  verified: Set<string>;
} {
  const verified = new Set<string>();
  const paths = existsSync(join(projectPath, projectArtifacts.sourceMaterialization)) ? materializedSourcePaths(projectPath, sources) : new Map<string, string>();
  const sourceRecords = sources.sources.map((source) => {
      const key = `source-identity:${source.source_id}`;
      const expected = semanticJsonFingerprint(sourceIdentityProjection(source));
      const record = assertArtifactRecordCurrent(projectPath, manifest, key, expected, new Set(), verified, stage);
      assertArtifactRecordContract(record, {
        path: `.virtual/source-identity/${source.source_id}`,
        role: "authoritative_input",
        schema_version: "2.0",
      }, stage);
      const materializedPath = paths.get(source.source_id);
      if (materializedPath) {
        const mediaKey = `source:${source.source_id}`;
        const mediaRecord = manifest.artifacts[mediaKey];
        const currentMediaFingerprint = projectSourceFingerprint(projectPath, source.source_id, materializedPath, stage);
        if (!mediaRecord || mediaRecord.fingerprint !== currentMediaFingerprint || mediaRecord.path !== materializedPath) {
          throw lifecycleCommandError(
            "SOURCE_CONTENT_CHANGED",
            `source bytes changed after project creation: ${source.source_id}`,
            mediaKey,
            "Restore the original project source or create a new project from the replacement media.",
            stage,
          );
        }
      }
      return record;
    });
  const sourceReferences = sourceRecords.map(artifactReference);
  const rawSources = parseSourcesManifest(readProjectJson(projectPath, projectArtifacts.sources, "sources manifest"));
  const sourcesRecord = assertArtifactRecordCurrent(
    projectPath,
    manifest,
    "sources",
    semanticJsonFingerprint(rawSources),
    new Set(),
    verified,
    stage,
  );
  assertArtifactRecordContract(sourcesRecord, { path: projectArtifacts.sources, role: "authoritative_input", schema_version: "2.0" }, stage);
  assertArtifactInputs(sourcesRecord, sourceReferences, stage);
  return { source_records: sourceRecords, sources_record: sourcesRecord, verified };
}

function assertCurrentMaterialLineage(
  projectPath: string,
  sources: SourcesManifest,
  transcript: TranscriptArtifact,
  analysis: AnalysisArtifact,
  stage: string,
): {
  manifest: ArtifactManifest;
  source_records: ArtifactRecord[];
  sources_record: ArtifactRecord;
  transcript_record: ArtifactRecord;
  analysis_record: ArtifactRecord;
} {
  const manifest = requireProjectArtifactManifest(projectPath, stage);
  const sourceLineage = assertCurrentSourceLineage(projectPath, sources, manifest, stage);
  const sourcesReference = artifactReference(sourceLineage.sources_record);
  const transcriptRecord = assertArtifactRecordCurrent(
    projectPath,
    manifest,
    "transcript",
    semanticJsonFingerprint(transcript),
    new Set(),
    sourceLineage.verified,
    stage,
  );
  assertArtifactRecordContract(
    transcriptRecord,
    { path: projectArtifacts.transcriptJson, role: "authoritative_input", schema_version: "1.0" },
    stage,
  );
  assertArtifactInputs(transcriptRecord, [sourcesReference], stage);
  const analysisRecord = assertArtifactRecordCurrent(
    projectPath,
    manifest,
    "analysis",
    semanticJsonFingerprint(analysis),
    new Set(),
    sourceLineage.verified,
    stage,
  );
  assertArtifactRecordContract(
    analysisRecord,
    { path: projectArtifacts.analysis, role: "derived", schema_version: "1.0" },
    stage,
  );
  assertArtifactInputs(analysisRecord, [artifactReference(transcriptRecord)], stage);
  return {
    manifest,
    source_records: sourceLineage.source_records,
    sources_record: sourceLineage.sources_record,
    transcript_record: transcriptRecord,
    analysis_record: analysisRecord,
  };
}

function assertArtifactRecordContract(
  record: ArtifactRecord,
  expected: Pick<ArtifactRecord, "path" | "role" | "schema_version">,
  stage: string,
): void {
  if (
    record.path === expected.path
    && record.role === expected.role
    && record.schema_version === expected.schema_version
  ) return;
  throw lifecycleCommandError(
    "MANIFEST_RECORD_MISMATCH",
    `${record.key} manifest record does not match its artifact contract`,
    record.key,
    "Rerun the command that owns this artifact with the current CLI.",
    stage,
  );
}

function assertArtifactInputs(
  record: ArtifactRecord,
  expectedInputs: ArtifactFingerprintReference[],
  stage: string,
): void {
  if (referencesEqual(record.inputs, expectedInputs)) return;
  throw lifecycleCommandError(
    "ARTIFACT_STALE",
    `${record.key} does not bind the current upstream artifact set`,
    record.key,
    "Rerun the command that owns this artifact before continuing.",
    stage,
  );
}

function currentArtifactFingerprint(projectPath: string, record: ArtifactRecord, stage = "project.inspect"): Fingerprint {
  if (record.key.startsWith("proposal-selection:")) {
    const proposal = parseProductionProposal(readProjectJson(projectPath, projectArtifacts.productionProposal, "production proposal"));
    return proposalSelectionFingerprint(proposal, record.key.slice("proposal-selection:".length));
  }
  if (record.path.startsWith(".virtual/")) return record.fingerprint;
  if (record.path.includes("#")) return fragmentArtifactFingerprint(projectPath, record, stage);
  const path = currentProjectArtifactPath(projectPath, record.path, record.key, stage);
  if (record.schema_version === "bytes-v1" || record.schema_version === "image/jpeg" || !record.path.endsWith(".json")) {
    return fileBytesFingerprint(path);
  }
  const value = readJson(path);
  switch (record.key) {
    case "project":
      return semanticJsonFingerprint(projectMetadataFingerprintProjection(parseProjectMetadata(value)));
    case "sources":
      return semanticJsonFingerprint(parseSourcesManifest(value));
    case "transcript":
      return semanticJsonFingerprint(parseTranscript(value));
    case "analysis":
      return semanticJsonFingerprint(parseAnalysis(value));
    case "review-package":
      return semanticJsonFingerprint(parseReviewPackage(value));
    case "production-proposal":
      return proposalFingerprint(parseProductionProposal(value));
    case "edit-plan":
      return semanticJsonFingerprint(editPlanFingerprintProjection(parseEditPlan(value)));
    case "edl":
      return semanticJsonFingerprint(parseEdl(value));
    case "focus-candidates":
      return semanticJsonFingerprint(parseFocusCandidates(value));
    case "focus-frames":
      return semanticJsonFingerprint(parseFocusFrames(value));
    case "focus-grounding":
      return semanticJsonFingerprint(parseFocusGrounding(value));
    case "focus-review":
      return semanticJsonFingerprint(parseFocusReview(value));
    case "asset-usage-plan":
      return semanticJsonFingerprint(parseAssetUsagePlan(value));
    case "asset-manifest":
      return semanticJsonFingerprint(assetManifestFingerprintProjection(parseAssetManifest(value)));
    case "visual-acquisition":
      return semanticJsonFingerprint(visualAcquisitionFingerprintProjection(parseVisualAcquisition(value)));
    case "music-acquisition":
      return semanticJsonFingerprint(musicAcquisitionFingerprintProjection(parseMusicAcquisition(value)));
    case "enrichment-plan":
      return semanticJsonFingerprint(parseEnrichmentPlan(value));
    case "render-result":
      return semanticJsonFingerprint(renderResultFingerprintProjection(parseRenderResult(value)));
    case "inspection":
      return semanticJsonFingerprint(inspectionFingerprintProjection(parseInspection(value)));
    default:
      return semanticJsonFingerprint(value);
  }
}

function fragmentArtifactFingerprint(projectPath: string, record: ArtifactRecord, stage: string): Fingerprint {
  const [containerPath] = record.path.split("#", 1);
  const path = currentProjectArtifactPath(projectPath, containerPath!, record.key, stage);
  const value = readJson(path);
  if (record.key.startsWith("music-request:")) return semanticJsonFingerprint(parseMusicRequest(value));
  if (record.key.startsWith("visual-request:")) {
    const requestId = record.key.slice("visual-request:".length);
    const request = parseVisualRequest(value).requests.find((item) => item.id === requestId);
    if (!request) throw lifecycleCommandError("ARTIFACT_MISSING", `${record.key} is missing from visual-request.json`, record.key, "Rerun project visual-search.", stage);
    return semanticJsonFingerprint(request);
  }
  if (record.key.startsWith("visual-candidate:")) {
    const candidates = parseVisualCandidates(value);
    const candidate = candidates.candidates.find((item) => `visual-candidate:${item.request_id}:${item.id}` === record.key);
    if (!candidate) throw lifecycleCommandError("ARTIFACT_MISSING", `${record.key} is missing from visual-candidates.json`, record.key, "Rerun project visual-search.", stage);
    return semanticJsonFingerprint(candidate);
  }
  throw lifecycleCommandError("ARTIFACT_INVALID", `unsupported fragment artifact: ${record.key}`, record.key, "Regenerate the affected artifact with the current CLI.", stage);
}

function currentProjectArtifactPath(projectPath: string, projectRelativePath: string, key: string, stage: string): string {
  const lexicalPath = join(projectPath, projectRelativePath);
  if (!existsSync(lexicalPath)) {
    throw lifecycleCommandError("ARTIFACT_MISSING", `${key} is missing`, key, "Rerun the command that produces this artifact.", stage);
  }
  try {
    return resolveExistingProjectPath(projectPath, projectRelativePath, `artifact ${key}`);
  } catch {
    throw lifecycleCommandError(
      "ARTIFACT_INVALID",
      `${key} is not a readable project-local artifact`,
      key,
      "Restore the project-local artifact or rerun the command that produces it.",
      stage,
    );
  }
}

export function inspectProject(projectPath: string, options: ProviderModeOption = {}): CommandResult<"project.inspect", ProjectInspectData> {
  const startedAt = new Date().toISOString();
  let inspectionInputFingerprint: Fingerprint | undefined;
  let inspectionStageInputs: ArtifactFingerprintReference[] | undefined;
  try {
    resolveProjectProviderMode(projectPath, options.providerMode);
    const sources = readManifest(projectPath);
    const lifecycleManifest = readProjectArtifactManifest(projectPath);
    if (!lifecycleManifest) throw lifecycleCommandError("RENDER_RESULT_UNTRACKED", "artifact manifest is required before inspection", "render-result", "Rerun project render, then inspect.");
    const renderResultPath = currentProjectArtifactPath(projectPath, projectArtifacts.renderResult, "render-result", "project.inspect");
    const renderResult = parseRenderResult(readJson(renderResultPath));
    if (inputFingerprint(renderResult.inputs) !== renderResult.input_fingerprint) {
      throw lifecycleCommandError("RENDER_RESULT_INVALID", "render-result input fingerprint does not match its declared inputs", "render-result", "Rerun project render.");
    }
    const renderResultRecord = assertArtifactRecordCurrent(projectPath, lifecycleManifest, "render-result");
    const renderResultReference = artifactReference(renderResultRecord);
    inspectionStageInputs = [renderResultReference];
    inspectionInputFingerprint = inputFingerprint(inspectionStageInputs);
    const renderResultFingerprint = semanticJsonFingerprint(renderResultFingerprintProjection(renderResult));
    if (renderResultRecord.fingerprint !== renderResultFingerprint) {
      throw lifecycleCommandError("RENDER_RESULT_STALE", "render-result.json is not the current committed render result", "render-result", "Rerun project render.");
    }
    const canonicalOutput = renderResult.outputs.find((output) => output.key === renderResult.canonical_output_key)!;
    const outputPath = join(projectPath, canonicalOutput.path);
    const verifiedOutputPath = currentProjectArtifactPath(projectPath, canonicalOutput.path, canonicalOutput.key, "project.inspect");
    if (fileBytesFingerprint(verifiedOutputPath) !== canonicalOutput.sha256) {
      throw lifecycleCommandError("RENDER_OUTPUT_HASH_MISMATCH", "canonical render output bytes do not match render-result.json", canonicalOutput.key, "Rerun project render.");
    }
    const probe = probeMedia(verifiedOutputPath);
    if (!probe.probe_ok) throw new Error(`rendered MP4 probe failed: ${probe.probe_error}`);
    if (canonicalOutput.duration_seconds !== undefined && Math.abs(probe.duration_seconds - canonicalOutput.duration_seconds) > 0.05) {
      throw lifecycleCommandError("RENDER_OUTPUT_PROBE_MISMATCH", "canonical render duration no longer matches render-result.json", canonicalOutput.key, "Rerun project render.");
    }

    const edl = parseEdl(readProjectJson(projectPath, projectArtifacts.edl, "EDL"), sources);
    const transcript = parseTranscript(readProjectJson(projectPath, projectArtifacts.transcriptJson, "transcript"), sources);
    const analysis = parseAnalysis(readProjectJson(projectPath, projectArtifacts.analysis, "analysis"), sources);
    const editPlan = readEditPlan(projectPath, sources);
    const unresolvedRisks = transcriptTimingRisks(transcript);
    const decisions = inspectDecisions(analysis, editPlan, unresolvedRisks);
    const duration = probe.duration_seconds;
    const frameSchedule = compileOutputFrameSchedule(edl.entries, 30);
    const expected = frameSchedule.expected_duration_seconds;
    const durationTolerance = Math.max(0.05, 2 / frameSchedule.fps);
    const outputTiming = probeStrictOutputTiming(verifiedOutputPath);
    const subtitlesOutput = renderResult.outputs.find((output) => output.key === "subtitles");
    const subtitlesPath = subtitlesOutput
      ? currentProjectArtifactPath(projectPath, subtitlesOutput.path, subtitlesOutput.key, "project.inspect")
      : resolveProjectOutputPath(projectPath, projectArtifacts.subtitles, "subtitle output");
    const enrichmentPlan = renderResult.enrichment_applied
      ? parseEnrichmentPlan(readProjectJson(projectPath, projectArtifacts.enrichmentPlan, "enrichment plan"))
      : undefined;
    const selectedOption = validateProjectAuthoringConformance(projectPath, enrichmentPlan);
    const captionsExpected = selectedOption?.subtitles.enabled ?? true;
    const captionsPresent = existsSync(subtitlesPath) && parseSrtCues(readFileSync(subtitlesPath, "utf8")).length > 0;
    const storyboardOutput = renderResult.outputs.find((output) => output.key === "storyboard");
    const storyboard = storyboardOutput
      ? readJson(currentProjectArtifactPath(projectPath, storyboardOutput.path, storyboardOutput.key, "project.inspect")) as EnrichmentStoryboard
      : undefined;
    const hyperframes = storyboard
      ? { block_usage: storyboard.block_usage, cdn_dependencies: storyboard.dependencies }
      : { block_usage: [], cdn_dependencies: [] };
    const elementUsage = storyboard?.element_usage ?? [];
    const audioUsage = enrichmentPlan ? summarizeAudioUsage(enrichmentPlan) : emptyAudioUsage();
    const assetSummary = storyboard?.asset_summary ?? [];
    const musicReview = undefined;
    const enrichmentSummary = enrichmentPlan ? summarizeEnrichment(enrichmentPlan, hyperframes.block_usage, elementUsage) : [];
    const enrichmentApplied = renderResult.enrichment_applied;
    const warnings = inspectWarnings(duration, expected, subtitlesPath, captionsExpected, durationTolerance);
    if (enrichmentPlan) warnings.push(...enrichmentWarnings(enrichmentPlan));
    const qaChecks = enrichmentPlan ? (storyboard?.qa_checks ?? []) : [];
    const inspectionNamespace = renderResultFingerprint.slice("sha256:".length, "sha256:".length + 16);
    const inspectionChecks = enrichmentApplied ? extractInspectionChecks(projectPath, verifiedOutputPath, qaChecks, inspectionNamespace) : [];
    const inspectionFrames = inspectionChecks.flatMap((check) => check.frame_paths);
    const structuredChecks = inspectionChecks.map((check) => ({
      ...check,
      frame_paths: check.frame_paths.map((path) => relative(projectPath, path).split(sep).join("/")),
    }));
    const durationDelta = Math.abs(outputTiming.container_duration_seconds - expected);
    const blockers: InspectionArtifact["blockers"] = [];
    if (outputTiming.video_frame_count !== frameSchedule.total_frames) {
      blockers.push({
        code: "VIDEO_FRAME_COUNT_MISMATCH",
        message: `video frame count expected=${frameSchedule.total_frames} actual=${outputTiming.video_frame_count}`,
        artifact: canonicalOutput.key,
        remediation: "Rerun project render with the current CLI frame schedule.",
      });
    }
    if (durationDelta > durationTolerance) {
      blockers.push({
        code: "DURATION_MISMATCH",
        message: `output duration expected=${expected.toFixed(6)}s actual=${outputTiming.container_duration_seconds.toFixed(6)}s delta=${durationDelta.toFixed(6)}s tolerance=${durationTolerance.toFixed(6)}s`,
        artifact: canonicalOutput.key,
        remediation: "Rerun project render with the current CLI frame schedule.",
      });
    }
    if (captionsExpected && !captionsPresent) {
      blockers.push({
        code: "CAPTIONS_MISSING",
        message: "the confirmed proposal requires captions, but the canonical subtitle artifact has no timed cues",
        artifact: "subtitles",
        remediation: "Repair the transcript/EDL caption mapping and rerun project render.",
      });
    }
    for (const check of structuredChecks.filter((item) => item.status === "blocker")) {
      blockers.push({
        code: `QA_CHECK_BLOCKED:${check.id}`,
        message: `${check.id} failed: ${check.warnings.join("; ") || check.expected}`,
        artifact: "storyboard",
        remediation: "Repair the confirmed enrichment asset or placement, rerender, and inspect again.",
      });
    }
    const inspectedAt = new Date().toISOString();
    const inspection = parseInspection({
      contract_version: "1.0",
      render_result_fingerprint: renderResultFingerprint,
      canonical_output_key: renderResult.canonical_output_key,
      canonical_output_path: canonicalOutput.path,
      canonical_output_sha256: canonicalOutput.sha256,
      canonical_output_duration_seconds: duration,
      canonical_output_probe: probe,
      expected_duration_seconds: expected,
      captions_present: captionsPresent,
      enrichment_applied: enrichmentApplied,
      source_mode: enrichmentPlan?.profile.source_mode,
      removed_ranges: decisions.removed_ranges,
      retained_risks: decisions.retained_risks,
      summaries: {
        enrichment: enrichmentSummary,
        blocks: hyperframes.block_usage.map((item) => `${item.card_id}:${item.block_id}`),
        elements: elementUsage.map((item) => `${item.id}:${item.element_type}:${item.element_id}`),
        audio: [
          ...audioUsage.music.map((item) => `${item.id}:music:${item.asset_id}`),
          ...audioUsage.sfx.map((item) => `${item.id}:sfx:${item.asset_id ?? item.sfx_id ?? "unknown"}`),
        ],
        assets: assetSummary.map((item) => `${item.id}:${item.path}`),
      },
      checks: structuredChecks,
      warnings,
      blockers,
      producer_cli_version: cliVersion(),
      inspected_at: inspectedAt,
    });
    const inspectionPath = resolveProjectOutputPath(projectPath, projectArtifacts.inspection, "inspection output");
    atomicWriteJson(inspectionPath, inspection);
    const reportPath = resolveProjectOutputPath(projectPath, projectArtifacts.report, "inspection report output");
    let reportWritten = false;
    try {
      atomicWriteText(
        reportPath,
        renderInspectReport(
        outputPath,
        duration,
        expected,
        captionsPresent,
        enrichmentPlan?.profile.source_mode,
        enrichmentSummary,
        hyperframes.block_usage,
        elementUsage,
        audioUsage,
        hyperframes.cdn_dependencies,
        assetSummary,
        musicReview,
        inspectionChecks,
        inspectionFrames,
        warnings,
        decisions.removed_ranges,
        decisions.retained_risks,
        ),
      );
      reportWritten = true;
    } catch (error) {
      warnings.push(`report.md could not be written: ${error instanceof Error ? error.message : String(error)}`);
    }

    const frameRecords = structuredChecks.flatMap((check) =>
      check.frame_paths.map((path, index) =>
        recordFileArtifact({
          project_path: projectPath,
          key: `inspection-frame:${check.id}:${index}`,
          path,
          role: "evidence",
          schema_version: "image/jpeg",
          authored_by: "cli",
          command: "project.inspect",
          mode: "produced",
          inputs: [renderResultReference],
          recorded_at: inspectedAt,
        }),
      ),
    );
    const inspectionRecord = recordJsonArtifact({
      project_path: projectPath,
      key: "inspection",
      path: projectArtifacts.inspection,
      role: "execution_result",
      schema_version: "1.0",
      authored_by: "cli",
      command: "project.inspect",
      mode: "produced",
      inputs: [renderResultReference, ...frameRecords.map(artifactReference)],
      value: inspectionFingerprintProjection(inspection),
      file_sha256: fileBytesFingerprint(inspectionPath),
      recorded_at: inspectedAt,
    });
    const reportRecords = reportWritten
      ? [
          recordFileArtifact({
            project_path: projectPath,
            key: "report",
            path: projectArtifacts.report,
            role: "human_view",
            schema_version: "markdown-v1",
            authored_by: "cli",
            command: "project.inspect",
            mode: "produced",
            inputs: [artifactReference(inspectionRecord)],
            recorded_at: inspectedAt,
          }),
        ]
      : [];
    commitProjectStage({
      project_path: projectPath,
      stage: "project.inspect",
      command: "project.inspect",
      input_fingerprint: inspectionInputFingerprint,
      inputs: inspectionStageInputs,
      records: [...frameRecords, inspectionRecord, ...reportRecords],
      replace_record_prefixes: ["inspection-frame:"],
      started_at: startedAt,
      completed_at: inspectedAt,
    });
    if (blockers.length > 0) {
      return fail(
        "project.inspect",
        "INSPECTION_ACCEPTANCE_FAILED",
        commandError("INSPECTION_ACCEPTANCE_FAILED", `inspection rejected ${blockers.length} blocker(s); structured result: ${inspectionPath}`),
      );
    }
    return ok("project.inspect", {
      project_path: projectPath,
      output_path: outputPath,
      duration_seconds: duration,
      expected_duration_seconds: expected,
      captions_present: inspection.captions_present,
      removed_ranges: decisions.removed_ranges,
      retained_risks: decisions.retained_risks,
      enrichment_applied: enrichmentApplied,
      source_mode: enrichmentPlan?.profile.source_mode,
      enrichment_summary: enrichmentSummary,
      block_usage: hyperframes.block_usage,
      element_usage: elementUsage,
      audio_usage: audioUsage,
      cdn_dependencies: hyperframes.cdn_dependencies,
      asset_summary: assetSummary,
      music_review: musicReview,
      inspection_checks: inspectionChecks,
      inspection_frames: inspectionFrames,
      warnings,
      accepted: inspection.blockers.length === 0,
      blockers: inspection.blockers,
      report_path: reportPath,
      inspection_path: inspectionPath,
      render_result_fingerprint: renderResultFingerprint,
    });
  } catch (error) {
    if (inspectionInputFingerprint && existsSync(projectPath)) {
      try {
        commitProjectStageFailure({
          project_path: projectPath,
          stage: "project.inspect",
          command: "project.inspect",
          input_fingerprint: inspectionInputFingerprint,
          inputs: inspectionStageInputs,
          failure_code: errorCode(error, "PROJECT_INSPECT_FAILED"),
          failure_message: error instanceof Error ? error.message : String(error),
          artifact: "inspection",
          remediation: errorRemediation(error, "Rerun project render if stale, then retry project inspect."),
          started_at: startedAt,
          completed_at: new Date().toISOString(),
        });
      } catch {
        // Preserve the original inspection failure.
      }
    }
    return fail("project.inspect", "PROJECT_INSPECT_FAILED", error);
  }
}

function inspectDecisions(
  analysis: AnalysisArtifact,
  editPlan: ReturnType<typeof parseEditPlan>,
  unresolvedRisks: string[],
): { removed_ranges: InspectionRemovedRange[]; retained_risks: InspectionRisk[] } {
  const cutIds = new Set(editPlan.decisions.filter((decision) => decision.action === "cut" && decision.candidate_id).map((decision) => decision.candidate_id!));
  const removed_ranges = analysis.candidates
    .filter((candidate) => cutIds.has(candidate.id))
    .map((candidate) => ({
      candidate_id: candidate.id,
      source_id: candidate.source_id,
      start: candidate.start,
      end: candidate.end,
      type: candidate.type,
      reason: candidate.reason,
      text: candidate.text,
    }));
  const retained_risks: InspectionRisk[] = analysis.candidates
    .filter((candidate) => !cutIds.has(candidate.id))
    .map((candidate) => ({
      candidate_id: candidate.id,
      source_id: candidate.source_id,
      start: candidate.start,
      end: candidate.end,
      reason: `${candidate.type}: ${candidate.reason}`,
    }));
  retained_risks.push(...unresolvedRisks.map((reason) => ({ reason })));
  return { removed_ranges, retained_risks };
}

function transcriptTimingRisks(transcript: TranscriptArtifact): string[] {
  if (transcript.timing_granularity === "word") {
    return isChinese(transcript.language) && transcript.timing_validated !== true
      ? ["unvalidated Chinese word timing needs review before precise cuts"]
      : [];
  }
  return [`${transcript.timing_granularity} timing needs review before precise cuts`];
}

export function validateEnrichmentPlan(
  projectPath: string,
  edl?: EdlArtifact,
  editPlan?: ReturnType<typeof parseEditPlan>,
  options: { normalizeUsage?: boolean } = {},
): { plan: EnrichmentPlanArtifact; assets: AssetManifestArtifact; duration: number; warnings: string[]; normalized: boolean } {
  const { plan, assets, normalization } = readEffectiveEnrichment(projectPath, editPlan, options.normalizeUsage === true);
  const normalizedEdl = normalization ? compileCurrentEdl(projectPath) : undefined;
  const currentEdl = edl ?? normalizedEdl?.edl ?? readOrBuildEdl(projectPath);
  const duration = compileOutputFrameSchedule(currentEdl.entries, 30).expected_duration_seconds;
  const assetIds = new Set(assets.assets.map((asset) => asset.id));
  for (const item of [...plan.audio.music, ...plan.audio.sfx, ...plan.elements]) {
    if (item.end > duration + 0.05) throw new Error(`slot ${item.id} exceeds output duration`);
    if (item.asset_id) {
      if (!assetIds.has(item.asset_id)) throw new Error(`slot ${item.id} references missing asset_id: ${item.asset_id}`);
      const asset = assets.assets.find((assetItem) => assetItem.id === item.asset_id)!;
      projectAssetPath(projectPath, asset.path);
      if ("element_type" in item && item.element_type === "visual_asset") validateVisualAssetForRender(projectPath, item, asset);
      if (plan.audio.music.includes(item as EnrichmentMusic)) validateAudioAssetForRender(asset, "music", item.id);
      if (plan.audio.sfx.includes(item as never)) validateAudioAssetForRender(asset, "sfx", item.id);
    }
    if (plan.audio.sfx.includes(item as never) && !item.asset_id) getVendoredSfx((item as EnrichmentPlanArtifact["audio"]["sfx"][number]).sfx_id!);
  }
  for (const element of plan.elements) {
    validateElementAdapter(plan, element);
  }
  const selectedOption = selectedProposalOptionForCurrentEditPlan(projectPath, editPlan, "project.enrich-plan");
  if (selectedOption) assertEnrichmentConformsToSelectedProposalOption(projectPath, selectedOption, plan);
  for (const emphasis of compiledCaptionPlan(plan).emphasis) {
    if (emphasis.end > duration + 0.05) throw new Error(`caption emphasis ${emphasis.text} exceeds output duration`);
  }
  if (normalization) commitNormalizedAssetUsage(projectPath, normalization, plan, assets, normalizedEdl!.edl_record);
  return { plan, assets, duration, warnings: enrichmentWarnings(plan), normalized: Boolean(normalization) };
}

export function validateProjectAuthoringConformance(projectPath: string, plan?: EnrichmentPlanArtifact): ProductionProposalOption | undefined {
  const selectedOption = selectedProposalOptionForCurrentEditPlan(projectPath, undefined, "project.conformance");
  if (!selectedOption) return undefined;
  if (plan) {
    assertEnrichmentConformsToSelectedProposalOption(projectPath, selectedOption, plan);
    return selectedOption;
  }
  if (selectedOption.images.needed || requiredSlots(selectedOption, "visual").length > 0) {
    throw lifecycleCommandError("PROPOSAL_EXECUTION_MISMATCH", `proposal option ${selectedOption.id} requires visual/image assets, but no enrichment-plan.json is present`, "enrichment-plan", "Create enrichment-plan.json with reviewed visual assets before exporting a render contract.", "project.conformance");
  }
  if (selectedOption.music.source !== "none" || requiredSlots(selectedOption, "music").length > 0) {
    throw lifecycleCommandError("PROPOSAL_EXECUTION_MISMATCH", `proposal option ${selectedOption.id} requires music, but no enrichment-plan.json is present`, "enrichment-plan", "Create enrichment-plan.json with reviewed music before exporting a render contract.", "project.conformance");
  }
  if (selectedOption.sfx.enabled || requiredSlots(selectedOption, "sfx").length > 0) {
    throw lifecycleCommandError("PROPOSAL_EXECUTION_MISMATCH", `proposal option ${selectedOption.id} requires SFX, but no enrichment-plan.json is present`, "enrichment-plan", "Create enrichment-plan.json with reviewed SFX before exporting a render contract.", "project.conformance");
  }
  return selectedOption;
}

function commitCanonicalEnrichmentValidation(
  projectPath: string,
  plan: EnrichmentPlanArtifact,
  assets: AssetManifestArtifact,
): void {
  const startedAt = new Date().toISOString();
  const recordedAt = new Date().toISOString();
  const compiledEdl = compileCurrentEdl(projectPath);
  const manifest = readProjectArtifactManifest(projectPath);
  if (!manifest) throw new Error("artifact manifest is missing after EDL compilation");
  const recordsToCommit: ArtifactRecord[] = [];
  const referencedAssetIds = referencedEnrichmentAssetIds(plan);
  const assetRecords = assets.assets
    .filter((asset) => referencedAssetIds.has(asset.id))
    .map((asset) => {
      const key = `asset:${asset.id}`;
      const existing = manifest.artifacts[key];
      if (existing) {
        if (existing.path !== asset.path) throw new Error(`${key} path does not match asset-manifest.json`);
        return assertArtifactRecordCurrent(projectPath, manifest, key, fileBytesFingerprint(projectAssetPath(projectPath, asset.path)), new Set(), new Set(), "project.enrich-plan");
      }
      return currentOrReplacementRecord(
        manifest,
        recordFileArtifact({
          project_path: projectPath,
          key,
          path: asset.path,
          role: "authoritative_input",
          schema_version: "bytes-v1",
          authored_by: asset.source === "bundled" || asset.source === "derived" ? "cli" : asset.source === "imported" ? "host" : "agent",
          command: "project.enrich-plan",
          mode: "validated",
          recorded_at: recordedAt,
        }),
        recordsToCommit,
      );
    });
  const assetReferences = assetRecords.map(artifactReference);
  const focusReviewRecord = currentFocusReviewRecordForCoordinateElements(projectPath, plan, manifest);
  const focusReviewReferences = focusReviewRecord ? [artifactReference(focusReviewRecord)] : [];
  const assetManifestPath = join(projectPath, projectArtifacts.assetManifest);
  if (!existsSync(assetManifestPath)) atomicWriteJson(assetManifestPath, assets);
  const assetManifestRecord = currentOrReplacementRecord(
    manifest,
    recordJsonArtifact({
      project_path: projectPath,
      key: "asset-manifest",
      path: projectArtifacts.assetManifest,
      role: "execution_result",
      schema_version: "1.0",
      authored_by: "cli",
      command: "project.enrich-plan",
      mode: "validated",
      inputs: assetReferences,
      value: assetManifestFingerprintProjection(assets),
      file_sha256: fileBytesFingerprint(assetManifestPath),
      recorded_at: recordedAt,
    }),
    recordsToCommit,
  );
  const planPath = join(projectPath, projectArtifacts.enrichmentPlan);
  const planRecord = currentOrReplacementRecord(
    manifest,
    recordJsonArtifact({
      project_path: projectPath,
      key: "enrichment-plan",
      path: projectArtifacts.enrichmentPlan,
      role: "authoritative_input",
      schema_version: plan.version,
      authored_by: "agent",
      command: "project.enrich-plan",
      mode: "validated",
      inputs: [artifactReference(compiledEdl.edl_record), ...assetReferences, ...focusReviewReferences],
      value: plan,
      file_sha256: fileBytesFingerprint(planPath),
      recorded_at: recordedAt,
    }),
    recordsToCommit,
  );
  const stageInputs = [artifactReference(compiledEdl.edl_record), artifactReference(planRecord), artifactReference(assetManifestRecord), ...assetReferences, ...focusReviewReferences];
  commitProjectStage({
    project_path: projectPath,
    stage: "project.enrich-plan",
    command: "project.enrich-plan",
    input_fingerprint: inputFingerprint(stageInputs),
    inputs: stageInputs,
    records: recordsToCommit,
    started_at: startedAt,
    completed_at: recordedAt,
  });
}

function referencedEnrichmentAssetIds(plan: EnrichmentPlanArtifact): Set<string> {
  return new Set([
    ...plan.audio.music.map((item) => item.asset_id),
    ...plan.audio.sfx.flatMap((item) => (item.asset_id ? [item.asset_id] : [])),
    ...plan.elements.flatMap((item) => (item.asset_id ? [item.asset_id] : [])),
  ]);
}

function selectedProposalOptionForCurrentEditPlan(
  projectPath: string,
  editPlan: ReturnType<typeof parseEditPlan> | undefined,
  stage: string,
): ProductionProposalOption | undefined {
  const editPlanPath = join(projectPath, projectArtifacts.editPlan);
  const proposalPath = join(projectPath, projectArtifacts.productionProposal);
  if (!editPlan && !existsSync(editPlanPath)) return undefined;
  if (!existsSync(proposalPath)) {
    throw lifecycleCommandError("PROPOSAL_REQUIRED", "confirmed edit plan requires production-proposal.json", "production-proposal", "Run project proposal.", stage);
  }
  const currentEditPlan = editPlan ?? readEditPlan(projectPath, readManifest(projectPath));
  const proposal = parseProductionProposal(readProjectJson(projectPath, projectArtifacts.productionProposal, "production proposal"));
  const selected = proposal.options.find((option) => option.id === currentEditPlan.confirmed_option_id);
  if (!selected) {
    throw lifecycleCommandError("PROPOSAL_SELECTION_MISMATCH", `proposal option ${currentEditPlan.confirmed_option_id} does not exist`, "edit-plan", "Regenerate edit-plan.json from the selected proposal option.", stage);
  }
  if (currentEditPlan.proposal_selection_fingerprint !== proposalSelectionFingerprint(proposal, selected.id)) {
    throw lifecycleCommandError("PROPOSAL_SELECTION_MISMATCH", `edit plan selection fingerprint does not match proposal option ${selected.id}`, "edit-plan", "Regenerate edit-plan.json from the selected proposal option.", stage);
  }
  return selected;
}

function assertEnrichmentConformsToSelectedProposalOption(
  projectPath: string,
  option: ProductionProposalOption,
  plan: EnrichmentPlanArtifact,
): void {
  const captions = compiledCaptionPlan(plan);
  if (!option.subtitles.enabled && (captions.enabled || captions.emphasis.length > 0)) {
    throw lifecycleCommandError("PROPOSAL_EXECUTION_MISMATCH", `enrichment-plan enables captions, but proposal option ${option.id} disabled subtitles`, "enrichment-plan", "Remove caption elements or choose a subtitles-enabled proposal option.", "project.enrich-plan");
  }
  if (option.subtitles.enabled && requiresHyperframesRecut(plan) && !captions.enabled) {
    throw lifecycleCommandError("PROPOSAL_EXECUTION_MISMATCH", `enrichment-plan uses HyperFrames elements, but proposal option ${option.id} subtitles require a caption_identity element`, "enrichment-plan", "Add a caption_identity element or choose a subtitles-disabled proposal option.", "project.enrich-plan");
  }
  const visualRequired = option.images.needed || requiredSlots(option, "visual").length > 0;
  const hasVisualAsset = plan.elements.some((element) => isAssetElement(element) && element.asset_id);
  if (visualRequired && !hasVisualAsset) {
    throw lifecycleCommandError("PROPOSAL_EXECUTION_MISMATCH", `proposal option ${option.id} requires visual/image assets, but enrichment-plan uses none`, "enrichment-plan", "Add reviewed visual_asset elements or mark the proposal option as source-only.", "project.enrich-plan");
  }
  if (!visualRequired && hasVisualAsset) {
    throw lifecycleCommandError("PROPOSAL_EXECUTION_MISMATCH", `enrichment-plan adds visual assets, but proposal option ${option.id} did not request images or visual asset slots`, "enrichment-plan", "Remove visual_asset elements or confirm visual assets in the proposal option.", "project.enrich-plan");
  }
  const musicRequired = option.music.source !== "none" || requiredSlots(option, "music").length > 0;
  if (musicRequired && plan.audio.music.length === 0) {
    throw lifecycleCommandError("PROPOSAL_EXECUTION_MISMATCH", `proposal option ${option.id} requires music, but enrichment-plan.audio.music is empty`, "enrichment-plan", "Add the reviewed music segment or choose a no-music proposal option.", "project.enrich-plan");
  }
  if (!musicRequired && plan.audio.music.length > 0) {
    throw lifecycleCommandError("PROPOSAL_EXECUTION_MISMATCH", `enrichment-plan adds music, but proposal option ${option.id} did not request music`, "enrichment-plan", "Remove music or confirm music in the proposal option.", "project.enrich-plan");
  }
  const sfxRequired = option.sfx.enabled || requiredSlots(option, "sfx").length > 0;
  if (sfxRequired && plan.audio.sfx.length === 0) {
    throw lifecycleCommandError("PROPOSAL_EXECUTION_MISMATCH", `proposal option ${option.id} requires SFX, but enrichment-plan.audio.sfx is empty`, "enrichment-plan", "Add reviewed SFX or choose a no-SFX proposal option.", "project.enrich-plan");
  }
  if (!sfxRequired && plan.audio.sfx.length > 0) {
    throw lifecycleCommandError("PROPOSAL_EXECUTION_MISMATCH", `enrichment-plan adds SFX, but proposal option ${option.id} did not request SFX`, "enrichment-plan", "Remove SFX or confirm SFX in the proposal option.", "project.enrich-plan");
  }
  assertCoordinateElementsAreGrounded(projectPath, plan);
}

function requiredSlots(option: ProductionProposalOption, kind: "visual" | "music" | "sfx"): string[] {
  if (kind === "music") return option.asset_requirements.music_slots.filter((slot) => slot.required).map((slot) => slot.slot_id);
  if (kind === "sfx") return option.asset_requirements.sfx_slots.filter((slot) => slot.required).map((slot) => slot.slot_id);
  return [...option.asset_requirements.visual_asset_slots, ...option.asset_requirements.image_slots].filter((slot) => slot.required).map((slot) => slot.slot_id);
}

function assertCoordinateElementsAreGrounded(projectPath: string, plan: EnrichmentPlanArtifact): void {
  currentFocusReviewRecordForCoordinateElements(projectPath, plan);
}

function currentFocusReviewRecordForCoordinateElements(projectPath: string, plan: EnrichmentPlanArtifact, manifest = readProjectArtifactManifest(projectPath)): ArtifactRecord | undefined {
  const coordinateElements = plan.elements.filter((element) => !isAssetElement(element) && (element.target_rect || element.anchor_point));
  if (coordinateElements.length === 0) return undefined;
  if (!existsSync(join(projectPath, projectArtifacts.focusReview))) {
    throw lifecycleCommandError("FOCUS_GROUNDING_REQUIRED", "coordinate enrichment elements require current focus-review grounding", "focus-review", "Run project focus-candidates, focus-frames, focus-grounding, and focus-review.", "project.enrich-plan");
  }
  if (!manifest) throw lifecycleCommandError("LINEAGE_UNPROVEN", "artifact-manifest.json is required", "artifact-manifest", "Create the project with the current CLI.", "project.enrich-plan");
  const review = parseFocusReview(readProjectJson(projectPath, projectArtifacts.focusReview, "focus review"));
  const record = assertArtifactRecordCurrent(projectPath, manifest, "focus-review", semanticJsonFingerprint(review), new Set(), new Set(), "project.enrich-plan");
  const grounded = new Map(review.proposed_elements.map((element) => [element.id, element]));
  for (const element of coordinateElements) {
    const reviewed = grounded.get(element.id);
    if (!reviewed || !sameJson(reviewed.target_rect, element.target_rect) || !sameJson(reviewed.anchor_point, element.anchor_point) || elementParamText(reviewed, "coordinate_source_frame") !== elementParamText(element, "coordinate_source_frame")) {
      throw lifecycleCommandError("FOCUS_GROUNDING_REQUIRED", `${element.id} coordinates were not produced by the current focus-review`, "enrichment-plan", "Use focus-review proposed_elements without editing coordinates.", "project.enrich-plan");
    }
  }
  return record;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function hasEnrichmentInputs(projectPath: string, editPlan?: ReturnType<typeof parseEditPlan>): boolean {
  if (existsSync(join(projectPath, projectArtifacts.enrichmentPlan))) return true;
  if (assetUsageSources(projectPath, editPlan).length > 0) {
    throw assetUsageError(
      "ASSET_USAGE_PLAN_REQUIRES_NORMALIZATION",
      "asset usage handoff must be normalized with project enrich-plan before render",
    );
  }
  return false;
}

function readEffectiveEnrichment(
  projectPath: string,
  editPlan?: ReturnType<typeof parseEditPlan>,
  normalizeUsage = false,
): {
  plan: EnrichmentPlanArtifact;
  assets: AssetManifestArtifact;
  normalization?: { name: AssetUsageSourceName; plan: AssetUsagePlanArtifact };
} {
  const enrichmentPlanPath = join(projectPath, projectArtifacts.enrichmentPlan);
  const assetPath = join(projectPath, projectArtifacts.assetManifest);
  const basePlan = existsSync(enrichmentPlanPath)
    ? parseEnrichmentPlan(readProjectJson(projectPath, projectArtifacts.enrichmentPlan, "enrichment plan"))
    : undefined;
  const baseAssets = existsSync(assetPath)
    ? parseAssetManifest(readProjectJson(projectPath, projectArtifacts.assetManifest, "asset manifest"))
    : { assets: [] };
  const usageSources = assetUsageSources(projectPath, editPlan);
  if (basePlan && usageSources.length > 0) {
    throw assetUsageError("ASSET_USAGE_PLAN_CONFLICT", "canonical enrichment-plan.json conflicts with an asset usage handoff source");
  }
  if (usageSources.length > 1) {
    throw assetUsageError(
      "ASSET_USAGE_PLAN_CONFLICT",
      `multiple asset usage handoff sources are present: ${usageSources.map((source) => source.name).join(", ")}`,
    );
  }
  if (basePlan) return { plan: basePlan, assets: baseAssets };
  if (usageSources.length === 0) throw assetUsageError("asset_usage_plan_invalid", "missing enrichment-plan.json or asset usage handoff");
  if (!normalizeUsage) {
    throw assetUsageError(
      "ASSET_USAGE_PLAN_REQUIRES_NORMALIZATION",
      "asset usage handoff must be normalized with project enrich-plan before render",
    );
  }

  const usage = usageSources[0]!.plan;
  const usageEnrichment = assetUsagePlanToEnrichment(projectPath, usage, "talking_head_avatar");
  const assets = mergeAssetManifests(baseAssets, usageEnrichment.assets);
  return { plan: usageEnrichment.plan, assets, normalization: usageSources[0] };
}

type AssetUsageSourceName = "asset-usage-plan.json";

function assetUsageSources(
  projectPath: string,
  editPlan?: ReturnType<typeof parseEditPlan>,
): Array<{ name: AssetUsageSourceName; plan: AssetUsagePlanArtifact }> {
  const sources: Array<{
    name: AssetUsageSourceName;
    plan: AssetUsagePlanArtifact;
  }> = [];
  const handoffPath = join(projectPath, projectArtifacts.assetUsagePlan);
  if (existsSync(handoffPath)) {
    let plan: AssetUsagePlanArtifact;
    try {
      plan = parseAssetUsagePlan(readProjectJson(projectPath, projectArtifacts.assetUsagePlan, "asset usage plan"));
    } catch (error) {
      throw assetUsageError("asset_usage_plan_invalid", error instanceof Error ? error.message : String(error));
    }
    sources.push({
      name: "asset-usage-plan.json",
      plan,
    });
  }
  return sources;
}

function commitNormalizedAssetUsage(
  projectPath: string,
  source: { name: AssetUsageSourceName; plan: AssetUsagePlanArtifact },
  plan: EnrichmentPlanArtifact,
  assets: AssetManifestArtifact,
  edlRecord: ArtifactRecord,
): void {
  const startedAt = new Date().toISOString();
  const recordedAt = new Date().toISOString();
  const assetManifestPath = join(projectPath, projectArtifacts.assetManifest);
  const enrichmentPlanPath = join(projectPath, projectArtifacts.enrichmentPlan);
  const usageFingerprint = semanticJsonFingerprint(source.plan);
  const sourcePath = `.virtual/asset-usage-plan/${usageFingerprint.slice("sha256:".length)}`;
  const sourceOwnerPath = assetUsageSourceOwnerPath(projectPath, source.name);
  const pathsToRestore = new Map<string, string | undefined>(
    [assetManifestPath, enrichmentPlanPath, sourceOwnerPath].map((path) => [
      path,
      existsSync(path) ? readFileSync(path, "utf8") : undefined,
    ]),
  );

  try {
    atomicWriteJson(assetManifestPath, assets);
    atomicWriteJson(enrichmentPlanPath, plan);
    consumeAssetUsageSource(projectPath, source.name);

  const usageRecord = recordJsonArtifact({
    project_path: projectPath,
    key: `asset-usage-plan:${usageFingerprint.slice("sha256:".length)}`,
    path: sourcePath,
    role: "command_request",
    schema_version: "1.0",
    authored_by: "agent",
    command: "project.enrich-plan",
    mode: "validated",
    value: source.plan,
    recorded_at: recordedAt,
  });
  const referencedAssetIds = referencedEnrichmentAssetIds(plan);
  const lifecycleManifest = readProjectArtifactManifest(projectPath);
  const assetRecords = assets.assets.filter((asset) => referencedAssetIds.has(asset.id)).map((asset) => {
    const key = `asset:${asset.id}`;
    const existing = lifecycleManifest?.artifacts[key];
    if (existing) {
      if (existing.path !== asset.path) throw new Error(`${key} path does not match asset-manifest.json`);
      return assertArtifactRecordCurrent(projectPath, lifecycleManifest!, key, fileBytesFingerprint(projectAssetPath(projectPath, asset.path)), new Set(), new Set(), "project.enrich-plan");
    }
    return recordFileArtifact({
      project_path: projectPath,
      key,
      path: asset.path,
      role: "authoritative_input",
      schema_version: "bytes-v1",
      authored_by: "host",
      command: "project.enrich-plan",
      mode: "validated",
      inputs: [artifactReference(usageRecord)],
      recorded_at: recordedAt,
    });
  });
  const assetReferences = assetRecords.map(artifactReference);
  const assetManifestRecord = recordJsonArtifact({
    project_path: projectPath,
    key: "asset-manifest",
    path: projectArtifacts.assetManifest,
    role: "execution_result",
    schema_version: "1.0",
    authored_by: "cli",
    command: "project.enrich-plan",
    mode: "produced",
    inputs: [artifactReference(usageRecord), ...assetReferences],
    value: assetManifestFingerprintProjection(assets),
    file_sha256: fileBytesFingerprint(assetManifestPath),
    recorded_at: recordedAt,
  });
  const edlReference = artifactReference(edlRecord);
  const planRecord = recordJsonArtifact({
    project_path: projectPath,
    key: "enrichment-plan",
    path: projectArtifacts.enrichmentPlan,
    role: "authoritative_input",
    schema_version: plan.version,
    authored_by: "cli",
    command: "project.enrich-plan",
    mode: "produced",
    inputs: [edlReference, artifactReference(usageRecord), ...assetRecords.map(artifactReference)],
    value: plan,
    file_sha256: fileBytesFingerprint(enrichmentPlanPath),
    recorded_at: recordedAt,
  });
  const stageInputs = [edlReference, artifactReference(usageRecord), ...assetReferences];
  commitProjectStage({
    project_path: projectPath,
    stage: "project.enrich-plan",
    command: "project.enrich-plan",
    input_fingerprint: inputFingerprint(stageInputs),
    inputs: stageInputs,
    records: [usageRecord, ...assetRecords, assetManifestRecord, planRecord],
    started_at: startedAt,
    completed_at: recordedAt,
  });
  } catch (error) {
    for (const [path, previous] of pathsToRestore) {
      try {
        if (previous === undefined) {
          if (existsSync(path)) unlinkSync(path);
        } else {
          atomicWriteText(path, previous);
        }
      } catch {
        // Preserve the normalization failure; status can expose any incomplete rollback.
      }
    }
    throw error;
  }
}

function assetUsageSourceOwnerPath(projectPath: string, source: AssetUsageSourceName): string {
  return join(projectPath, projectArtifacts.assetUsagePlan);
}

function consumeAssetUsageSource(projectPath: string, source: AssetUsageSourceName): void {
  const ownerPath = assetUsageSourceOwnerPath(projectPath, source);
  unlinkSync(ownerPath);
}

function assetUsagePlanToEnrichment(
  projectPath: string,
  usage: AssetUsagePlanArtifact,
  sourceMode: EnrichmentSourceMode,
): { plan: EnrichmentPlanArtifact; assets: AssetManifestArtifact } {
  const assets: AssetManifestArtifact["assets"] = [];
  const music: EnrichmentMusic[] = usage.music.map((item, index) => {
    const id = usageId("music", index, item.id, item.asset_ref);
    assertUsableAssetRef(projectPath, item.asset_ref, "audio");
    assets.push({
      id,
      path: item.asset_ref,
      type: "music",
      source: "imported",
      provenance: "asset_usage_plan",
      reason: item.purpose,
      used_by: [id],
      volume: item.volume,
      fade_seconds: Math.max(item.fade_in, item.fade_out),
      ducking: item.duck_original_audio,
    });
    return {
      id,
      start: item.start,
      end: item.end,
      asset_id: id,
      volume: item.volume,
      fade_seconds: Math.max(item.fade_in, item.fade_out),
      ducking: item.duck_original_audio,
      reason: item.purpose,
    };
  });

  const sfx: EnrichmentPlanArtifact["audio"]["sfx"] = usage.sfx.map((item, index) => {
    const id = usageId("sfx", index, item.id, item.asset_ref);
    assertUsableAssetRef(projectPath, item.asset_ref, "audio");
    assets.push({
      id,
      path: item.asset_ref,
      type: "sfx",
      source: "imported",
      provenance: "asset_usage_plan",
      reason: item.purpose,
      used_by: [id],
      volume: item.volume,
      fade_seconds: item.fade_seconds,
    });
    return {
      id,
      start: item.time,
      end: item.time + item.duration,
      asset_id: id,
      volume: item.volume,
      fade_seconds: item.fade_seconds,
      reason: item.purpose,
    };
  });

  const visualAssets: EnrichmentElement[] = usage.visual_assets.map((item, index) => {
    const id = usageId("visual", index, item.id, item.asset_ref);
    assertUsableAssetRef(projectPath, item.asset_ref, "visual");
    const position = usagePosition(item.position);
    assets.push({
      id,
      path: item.asset_ref,
      type: item.asset_type ?? inferVisualAssetType(item.asset_ref),
      source: "imported",
      provenance: "asset_usage_plan",
      reason: item.purpose,
      used_by: [id],
    });
    return {
      id,
      source: "asset_usage_plan",
      element_id: "project-local-visual",
      element_type: "visual_asset",
      start: item.start,
      end: item.end,
      asset_id: id,
      zone: position.zone,
      anchor_point: position.anchor_point,
      reason: item.purpose,
      params: { title: item.purpose, size: item.size ?? null, animation: item.animation ?? "fade-in" },
    };
  });

  const plan = parseEnrichmentPlan({
    version: "2.0",
    profile: { ...defaultEnrichmentProfile(sourceMode) },
    elements: [
      ...(visualAssets.length > 0 ? [{
        id: "captions-anchor",
        source: "asset_usage_plan",
        element_id: "anchor",
        element_type: "caption_identity",
        start: 0,
        end: Math.max(...visualAssets.map((item) => item.end)),
        caption_identity: "anchor",
        reason: "Preserve subtitles while applying visual asset overlays.",
      }] : []),
      ...visualAssets,
    ],
    audio: { music, sfx },
  });
  return { plan, assets: parseAssetManifest({ assets }) };
}

function mergeAssetManifests(base: AssetManifestArtifact, extra: AssetManifestArtifact): AssetManifestArtifact {
  const assets = [...base.assets];
  const ids = new Set(assets.map((asset) => asset.id));
  for (const asset of extra.assets) {
    if (ids.has(asset.id)) throw assetUsageError("asset_usage_plan_invalid", `duplicate asset id from asset_usage_plan: ${asset.id}`);
    assets.push(asset);
    ids.add(asset.id);
  }
  return { assets };
}

function usageId(kind: "music" | "sfx" | "visual", index: number, explicitId: string | undefined, assetRef: string): string {
  return explicitId ? safeFileName(explicitId) : `${kind}-${index + 1}-${safeFileName(basename(assetRef, extname(assetRef)))}`;
}

function assertUsableAssetRef(projectPath: string, assetRef: string, kind: "audio" | "visual"): void {
  let path: string;
  try {
    path = projectAssetPath(projectPath, assetRef);
  } catch {
    throw assetUsageError("missing_asset_ref", `missing_asset_ref: ${assetRef}`);
  }
  const ext = extname(assetRef).toLowerCase();
  if (kind === "audio" && !isSupportedAudioExt(ext)) throw assetUsageError("unsupported_audio_asset_format", `unsupported_audio_asset_format: ${assetRef}`);
  if (kind === "visual" && !isSupportedVisualExt(ext)) throw assetUsageError("unsupported_visual_asset_format", `unsupported_visual_asset_format: ${assetRef}`);
  if (ext === ".svg") assertSafeSvgAsset(path, assetRef);
}

function isSupportedAudioExt(ext: string): boolean {
  return [".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg"].includes(ext);
}

function isSupportedVisualExt(ext: string): boolean {
  return [".png", ".jpg", ".jpeg", ".webp", ".svg", ".json", ".lottie"].includes(ext);
}

function assertSafeSvgAsset(path: string, assetRef: string): void {
  const text = readFileSync(path, "utf8");
  if (/<script\b|<foreignObject\b|\son[a-z]+\s*=|javascript:|https?:\/\/|url\(\s*['"]?https?:\/\//i.test(text)) {
    throw assetUsageError("unsupported_visual_asset_format", `unsupported_visual_asset_format: unsafe SVG ${assetRef}`);
  }
}

function inferVisualAssetType(assetRef: string): AssetManifestArtifact["assets"][number]["type"] {
  const lower = assetRef.toLowerCase();
  if (lower.endsWith(".json") || lower.endsWith(".lottie")) return "lottie";
  if (lower.includes("icon")) return "icon";
  return "image";
}

function usagePosition(position: AssetUsagePosition): { zone: EnrichmentElement["zone"]; anchor_point?: EnrichmentElement["anchor_point"] } {
  if (position === "top-left") return { zone: "upper_third", anchor_point: { x: 0.06, y: 0.08 } };
  if (position === "top-right") return { zone: "upper_third", anchor_point: { x: 0.78, y: 0.08 } };
  if (position === "bottom-left") return { zone: "lower_third", anchor_point: { x: 0.06, y: 0.72 } };
  if (position === "bottom-right") return { zone: "lower_third", anchor_point: { x: 0.78, y: 0.72 } };
  return { zone: position };
}

function validateAudioAssetForRender(asset: AssetManifestArtifact["assets"][number], kind: "music" | "sfx", id: string): void {
  if (kind === "music" && asset.type !== "music") throw new Error(`${id}: music asset ${asset.id} must have type=music`);
  if (kind === "sfx" && asset.type !== "sfx") throw new Error(`${id}: sfx asset ${asset.id} must have type=sfx`);
  if (!isSupportedAudioExt(extname(asset.path).toLowerCase())) {
    throw assetUsageError("unsupported_audio_asset_format", `unsupported_audio_asset_format: ${asset.path}`);
  }
}

function assetUsageError(
  code:
    | "missing_asset_ref"
    | "unsupported_visual_asset_format"
    | "unsupported_audio_asset_format"
    | "asset_usage_plan_invalid"
    | "ASSET_USAGE_PLAN_CONFLICT"
    | "ASSET_USAGE_PLAN_REQUIRES_NORMALIZATION",
  message: string,
): Error & { code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}

type OutputTimelineSegment = {
  source_id: string;
  source_path?: string;
  source_start: number;
  source_end: number;
  output_start: number;
  output_end: number;
  output_order: number;
};

type FocusFrameSample = {
  candidate: FocusCandidate;
  index: number;
  mapped: OutputTimelineSegment & { source_time: number };
};

function validateFocusCandidates(candidates: FocusCandidatesArtifact, duration: number): string[] {
  const warnings: string[] = [];
  for (const candidate of candidates.candidates) {
    if (candidate.end > duration + 0.05) throw new Error(`focus candidate ${candidate.id} exceeds output duration`);
    const element = focusCandidateElement(candidate);
    const adapter = adapterForElement(element);
    if ((adapter.requires_target_rect || adapter.requires_anchor_point) && !candidate.requires_grounding) {
      warnings.push(`${candidate.id}: ${candidate.element_id} should set requires_grounding=true`);
    }
    if (candidates.source_mode === "screen_recording" && !adapter.screen_safe && element.zone !== "full_frame") {
      warnings.push(`${candidate.id}: ${candidate.element_id} is not screen-safe outside full_frame`);
    }
    if (candidate.recommended_treatment === "generated_asset" && candidate.element_type !== "visual_asset") {
      warnings.push(`${candidate.id}: recommended_treatment=generated_asset but element_type=${candidate.element_type}`);
    }
    if (candidate.recommended_treatment === "source_ui_component" && candidates.source_mode === "screen_recording" && !candidate.requires_grounding) {
      warnings.push(`${candidate.id}: source_ui_component in screen_recording should have frame grounding evidence`);
    }
  }
  return warnings;
}

function readSourceFrameRequest(projectPath: string): SourceFrameRequestArtifact {
  const requestPath = join(projectPath, projectArtifacts.sourceFrameRequest);
  if (!existsSync(requestPath)) throw sourceFrameError("SOURCE_FRAME_REQUEST_MISSING", `${projectArtifacts.sourceFrameRequest} is missing`);
  try {
    return parseSourceFrameRequest(readProjectJson(projectPath, projectArtifacts.sourceFrameRequest, "source frame request"));
  } catch (error) {
    if (error && typeof error === "object" && ((error as { code?: unknown }).code === "ARTIFACT_VALIDATION_FAILED" || (error as { code?: unknown }).code === "CONTRACT_SCHEMA_UNSUPPORTED")) throw error;
    throw sourceFrameError("SOURCE_FRAME_REQUEST_INVALID", `${projectArtifacts.sourceFrameRequest} is invalid`);
  }
}

function readSourcesForSourceFrames(projectPath: string): SourcesManifest {
  try {
    const manifest = readManifest(projectPath);
    materializedSourcePaths(projectPath, manifest);
    return manifest;
  } catch (error) {
    if (isSourceFrameError(error) && (error as { code?: string }).code === "SOURCE_BINDING_REQUIRED") throw error;
    throw sourceFrameError("SOURCE_FRAME_SOURCE_NOT_FOUND", `${projectArtifacts.sources} is missing or invalid`);
  }
}

function sourceFrameDuplicateWarnings(request: SourceFrameRequestArtifact): string[] {
  const firstByTime = new Map<string, string>();
  const warnings: string[] = [];
  for (const frame of request.frames) {
    const key = `${frame.source_id}\0${String(frame.time_seconds)}`;
    const firstId = firstByTime.get(key);
    if (firstId) warnings.push(`SOURCE_FRAME_DUPLICATE_TIME: ${frame.id} duplicates ${firstId} at ${frame.source_id}@${String(frame.time_seconds)}s`);
    else firstByTime.set(key, frame.id);
  }
  return warnings;
}

function extractSourceFrames(projectPath: string, request: SourceFrameRequestArtifact, manifest: SourcesManifest, outputDir = join(projectPath, ".source-frames")): SourceFrame[] {
  const sourceById = new Map(manifest.sources.map((source) => [source.source_id, source]));
  const materialization = materializedSourcePaths(projectPath, manifest);
  const sourcePaths = new Map<string, string>();
  const dir = outputDir;
  mkdirSync(dir, { recursive: true });
  return request.frames.map((frame, index) => {
    const source = sourceById.get(frame.source_id);
    if (!source) throw sourceFrameError("SOURCE_FRAME_SOURCE_NOT_FOUND", `source frame ${frame.id} references unknown source_id ${frame.source_id}`);
    if (frame.time_seconds >= source.duration_seconds) {
      throw sourceFrameError("SOURCE_FRAME_TIME_OUT_OF_RANGE", `source frame ${frame.id} time is outside source ${frame.source_id}`);
    }
    let sourcePath = sourcePaths.get(source.source_id);
    if (!sourcePath) {
      sourcePath = readableProjectSource(projectPath, source.source_id, materialization.get(source.source_id)!);
      sourcePaths.set(source.source_id, sourcePath);
    }
    const relativePath = `.source-frames/frame-${String(index + 1).padStart(4, "0")}.jpg`;
    const targetPath = join(dir, `frame-${String(index + 1).padStart(4, "0")}.jpg`);
    const image = extractSourceFrameImage(sourcePath, frame.time_seconds, targetPath, frame.id);
    return {
      ...frame,
      index,
      path: relativePath,
      mime_type: "image/jpeg",
      ...image,
    };
  });
}

type ManagedPublication = {
  target_path: string;
  backup_path?: string;
};

let managedPublicationSequence = 0;

function commitManagedPublications(
  paths: Array<{ staged_path: string; target_path: string }>,
  commit: () => void,
): void {
  const publications: ManagedPublication[] = [];
  try {
    for (const path of paths) publications.push(beginManagedPublication(path.staged_path, path.target_path));
    commit();
  } catch (error) {
    for (const publication of publications.reverse()) {
      try {
        rollbackManagedPublication(publication);
      } catch {
        // Preserve the original publication or lifecycle commit failure.
      }
    }
    throw error;
  }
  for (const publication of publications) finishManagedPublication(publication);
}

function beginManagedPublication(stagedPath: string, targetPath: string): ManagedPublication {
  const rename = (nodeFs as unknown as { renameSync(source: string, target: string): void }).renameSync;
  const backupPath = `${targetPath}.previous-${Date.now().toString(36)}-${managedPublicationSequence++}`;
  const hadTarget = pathEntryExists(targetPath);
  if (hadTarget) rename(targetPath, backupPath);
  try {
    rename(stagedPath, targetPath);
  } catch (error) {
    if (hadTarget && pathEntryExists(backupPath) && !pathEntryExists(targetPath)) rename(backupPath, targetPath);
    throw error;
  }
  return { target_path: targetPath, backup_path: hadTarget ? backupPath : undefined };
}

function rollbackManagedPublication(publication: ManagedPublication): void {
  const rename = (nodeFs as unknown as { renameSync(source: string, target: string): void }).renameSync;
  rmSync(publication.target_path, { recursive: true, force: true });
  if (publication.backup_path && pathEntryExists(publication.backup_path)) rename(publication.backup_path, publication.target_path);
}

function finishManagedPublication(publication: ManagedPublication): void {
  if (!publication.backup_path) return;
  try {
    rmSync(publication.backup_path, { recursive: true, force: true });
  } catch {
    // The committed checkpoint is authoritative; an old backup is non-authoritative cleanup debt.
  }
}

function pathEntryExists(path: string): boolean {
  try {
    (nodeFs as unknown as { lstatSync(path: string): unknown }).lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

function readableProjectSource(projectPath: string, sourceId: string, projectRelativePath: string): string {
  if (
    /^[a-z][a-z0-9+.-]*:/i.test(projectRelativePath)
    || /^[a-z]:[\\/]/i.test(projectRelativePath)
    || /^[\\/]/.test(projectRelativePath)
    || projectRelativePath.split(/[\\/]+/).includes("..")
  ) {
    throw sourceFrameError("SOURCE_FRAME_SOURCE_NOT_FOUND", `source ${sourceId} has an unsafe project path`);
  }
  try {
    const projectRoot = fsRuntime.realpathSync(projectPath);
    const sourcePath = fsRuntime.realpathSync(join(projectPath, projectRelativePath));
    const fromRoot = relative(projectRoot, sourcePath);
    if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || pathRuntime.isAbsolute(fromRoot)) throw new Error("outside project");
    if (!statSync(sourcePath).isFile()) throw new Error("not a file");
    fsRuntime.accessSync(sourcePath, fsRuntime.constants.R_OK);
    return sourcePath;
  } catch {
    throw sourceFrameError("SOURCE_FRAME_SOURCE_NOT_FOUND", `source ${sourceId} is not a readable project-local file`);
  }
}

function extractSourceFrameImage(sourcePath: string, timeSeconds: number, targetPath: string, frameId: string): Pick<SourceFrame, "width" | "height" | "size_bytes" | "sha256"> {
  for (const [attemptIndex, attempt] of SOURCE_FRAME_ATTEMPTS.entries()) {
    rmSync(targetPath, { force: true });
    const result = extractJpegFrame(sourcePath, sourceFrameSeekText(timeSeconds), targetPath, attempt);
    if (result.status !== 0 || !existsSync(targetPath)) {
      rmSync(targetPath, { force: true });
      throw sourceFrameError("SOURCE_FRAME_FFMPEG_FAILED", `source frame ${frameId} extraction failed`);
    }
    let image: { width: number; height: number; size_bytes: number; sha256: string };
    try {
      const { width, height } = probeSourceFrame(targetPath, attempt.maxEdge);
      const stat = statSync(targetPath);
      if (!stat.isFile()) throw new Error("not a file");
      image = {
        width,
        height,
        size_bytes: stat.size,
        sha256: createHash("sha256").update(readFileSync(targetPath)).digest("hex"),
      };
    } catch {
      rmSync(targetPath, { force: true });
      throw sourceFrameError("SOURCE_FRAME_IMAGE_INVALID", `source frame ${frameId} image is invalid`);
    }
    if (image.size_bytes <= MAX_SOURCE_FRAME_BYTES) return image;
    rmSync(targetPath, { force: true });
    if (attemptIndex === SOURCE_FRAME_ATTEMPTS.length - 1) {
      throw sourceFrameError("SOURCE_FRAME_IMAGE_TOO_LARGE", `source frame ${frameId} image exceeds byte limit`);
    }
  }
  throw sourceFrameError("SOURCE_FRAME_IMAGE_TOO_LARGE", `source frame ${frameId} image exceeds byte limit`);
}

function extractJpegFrame(sourcePath: string, seekText: string, targetPath: string, options: { quality: number; maxEdge?: number }) {
  return spawnSync(
    "ffmpeg",
    [
      "-y",
      "-ss",
      seekText,
      "-i",
      sourcePath,
      "-frames:v",
      "1",
      ...(options.maxEdge ? ["-vf", `scale='min(iw,${options.maxEdge})':'min(ih,${options.maxEdge})':force_original_aspect_ratio=decrease`] : []),
      "-q:v",
      String(options.quality),
      targetPath,
    ],
    { encoding: "utf8" },
  );
}

function sourceFrameSeekText(timeSeconds: number): string {
  const text = String(timeSeconds);
  const scientific = /^(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/.exec(text);
  if (!scientific) return text;
  const whole = scientific[1]!;
  const fraction = scientific[2] ?? "";
  const digits = whole + fraction;
  const decimalIndex = whole.length + Number(scientific[3]);
  if (decimalIndex <= 0) return `0.${"0".repeat(-decimalIndex)}${digits}`;
  if (decimalIndex >= digits.length) return `${digits}${"0".repeat(decimalIndex - digits.length)}`;
  return `${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
}

function probeSourceFrame(path: string, maxEdge: number): { width: number; height: number } {
  const result = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,width,height", "-of", "json", path], { encoding: "utf8" });
  if (result.status !== 0) throw new Error("ffprobe failed");
  const value = JSON.parse(result.stdout) as { streams?: Array<{ codec_name?: unknown; width?: unknown; height?: unknown }> };
  const stream = value.streams?.[0];
  if (stream?.codec_name !== "mjpeg" || !Number.isInteger(stream.width) || !Number.isInteger(stream.height)) throw new Error("invalid jpeg stream");
  const width = stream.width as number;
  const height = stream.height as number;
  if (width <= 0 || height <= 0 || Math.max(width, height) > maxEdge) throw new Error("invalid jpeg dimensions");
  return { width, height };
}

function sourceFrameError(code: string, message: string): Error & { code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}

function isSourceFrameError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string" && (error as { code: string }).code.startsWith("SOURCE_FRAME_"));
}

function isProviderModeError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === "PROVIDER_MODE_MISMATCH");
}

function extractFocusFrames(samples: FocusFrameSample[], outputDir: string): FocusFrame[] {
  if (!commandExists("ffmpeg")) throw new Error("ffmpeg not found for focus frames");
  mkdirSync(outputDir, { recursive: true });
  const frames: FocusFrame[] = [];
  for (const { candidate, index, mapped } of samples) {
    const id = `${candidate.id}-source-${index + 1}`;
    const relativePath = join(".focus", "frames", `${safeFileName(id)}.jpg`);
    const framePath = join(outputDir, `${safeFileName(id)}.jpg`);
    if (!mapped.source_path) throw sourceFrameError("SOURCE_BINDING_REQUIRED", `source bytes are not materialized for ${mapped.source_id}`);
    const result = extractJpegFrame(mapped.source_path, formatSeconds(mapped.source_time), framePath, { quality: 3 });
    if (result.status !== 0) throw new Error(`ffmpeg focus frame failed for ${candidate.id}: ${result.stderr || result.stdout}`);
    probeVideoSize(framePath);
    frames.push({
      id,
      candidate_id: candidate.id,
      timeline: "source",
      time_seconds: mapped.source_time,
      path: relativePath,
      source_id: mapped.source_id,
    });
  }
  return frames;
}

function buildFocusReview(
  projectPath: string,
  candidates: FocusCandidatesArtifact,
  frames: FocusFramesArtifact,
  grounding: FocusGroundingArtifact,
  includeProposedElements: boolean,
): FocusReviewArtifact {
  const candidateById = new Map(candidates.candidates.map((candidate) => [candidate.id, candidate]));
  const frameById = new Map(frames.frames.map((frame) => [frame.id, frame]));
  const groundingByCandidate = new Map<string, FocusGrounding>();
  for (const item of grounding.groundings) {
    if (!candidateById.has(item.candidate_id)) throw new Error(`focus grounding references unknown candidate_id: ${item.candidate_id}`);
    const frame = frameById.get(item.frame_id);
    if (!frame) throw new Error(`focus grounding references unknown frame_id: ${item.frame_id}`);
    try {
      resolveExistingProjectPath(projectPath, frame.path, `focus grounding frame ${frame.id}`);
    } catch {
      throw new Error(`focus grounding frame is missing or not project-local: ${frame.path}`);
    }
    if (groundingByCandidate.has(item.candidate_id)) throw new Error(`duplicate focus grounding for candidate_id: ${item.candidate_id}`);
    groundingByCandidate.set(item.candidate_id, item);
  }

  const items = candidates.candidates.map((candidate): FocusReviewItem => {
    const candidateFrames = frames.frames.filter((frame) => frame.candidate_id === candidate.id);
    const itemWarnings: string[] = [];
    const grounded = groundingByCandidate.get(candidate.id);
    if (candidate.requires_grounding && !grounded) {
      itemWarnings.push(`${candidate.id}: needs visual grounding`);
      return { candidate_id: candidate.id, status: "needs_grounding", frame_paths: candidateFrames.map((frame) => frame.path), warnings: itemWarnings };
    }
    if (grounded && grounded.confidence < 0.4) {
      itemWarnings.push(`${candidate.id}: grounding confidence ${grounded.confidence.toFixed(2)} is below 0.40`);
      return { candidate_id: candidate.id, status: "invalid", frame_paths: candidateFrames.map((frame) => frame.path), warnings: itemWarnings, grounding: grounded };
    }
    const sourceFrame = grounded ? frameById.get(grounded.frame_id) : undefined;
    const proposed = focusCandidateElement(candidate, grounded, sourceFrame?.path);
    try {
      validateElementAdapter(focusPlanFor(candidates.source_mode), proposed);
    } catch (error) {
      itemWarnings.push(`${candidate.id}: ${error instanceof Error ? error.message : String(error)}`);
      return { candidate_id: candidate.id, status: "invalid", frame_paths: candidateFrames.map((frame) => frame.path), warnings: itemWarnings, grounding: grounded };
    }
    if (grounded && grounded.confidence < 0.65) itemWarnings.push(`${candidate.id}: grounding confidence ${grounded.confidence.toFixed(2)} needs review`);
    const status = itemWarnings.length ? "warning" : "ready";
    return {
      candidate_id: candidate.id,
      status,
      frame_paths: candidateFrames.map((frame) => frame.path),
      warnings: itemWarnings,
      grounding: grounded,
      proposed_element: includeProposedElements ? proposed : undefined,
    };
  });
  const proposedElements = items.flatMap((item) => (item.proposed_element && (item.status === "ready" || item.status === "warning") ? [item.proposed_element] : []));
  const warnings = items.flatMap((item) => item.warnings);
  return { version: "1.0", items, proposed_elements: proposedElements, warnings };
}

function buildOutputTimeline(edl: EdlArtifact): OutputTimelineSegment[] {
  let outputCursor = 0;
  return [...edl.entries]
    .sort((a, b) => a.output_order - b.output_order)
    .map((entry) => {
      const duration = entry.end - entry.start;
      const segment = {
        source_id: entry.source_id,
        source_path: (entry as EdlEntry & { source_path?: string }).source_path,
        source_start: entry.start,
        source_end: entry.end,
        output_start: outputCursor,
        output_end: outputCursor + duration,
        output_order: entry.output_order,
      };
      outputCursor += duration;
      return segment;
    });
}

function focusSampleTimes(candidate: FocusCandidate): number[] {
  const duration = candidate.end - candidate.start;
  return [candidate.start + duration * 0.2, (candidate.start + candidate.end) / 2, candidate.end - duration * 0.2];
}

function mapOutputTime(timeline: OutputTimelineSegment[], outputTime: number, candidateId: string): OutputTimelineSegment & { source_time: number } {
  const segment = timeline.find((item) => outputTime >= item.output_start - 0.001 && outputTime <= item.output_end + 0.001);
  if (!segment) throw new Error(`focus candidate ${candidateId} has no source frame at output ${outputTime.toFixed(2)}s`);
  const clamped = Math.min(Math.max(outputTime, segment.output_start), Math.max(segment.output_start, segment.output_end - 0.001));
  return { ...segment, source_time: segment.source_start + (clamped - segment.output_start) };
}

function focusCandidateElement(candidate: FocusCandidate, grounding?: FocusGrounding, coordinateSourceFrame?: string): EnrichmentElement {
  const params = {
    ...(candidate.params ?? {}),
    ...(grounding?.params ?? {}),
    ...(coordinateSourceFrame ? { coordinate_source_frame: coordinateSourceFrame } : {}),
  };
  return {
    id: candidate.id,
    source: "focus-review",
    element_id: candidate.element_id,
    element_type: candidate.element_type,
    start: candidate.start,
    end: candidate.end,
    reason: candidate.reason,
    asset_id: candidate.asset_id,
    sfx_id: candidate.sfx_id,
    target_rect: grounding?.target_rect,
    anchor_point: grounding?.anchor_point,
    params: Object.keys(params).length ? params : undefined,
  };
}

function focusPlanFor(sourceMode: EnrichmentSourceMode): EnrichmentPlanArtifact {
  return { profile: { source_mode: sourceMode } } as EnrichmentPlanArtifact;
}

function validateProductionProposalAgainstReview(proposal: ProductionProposalArtifact, review: { proposed_cuts: AnalysisCandidate[] }) {
  const candidateIds = new Set(review.proposed_cuts.map((candidate) => candidate.id));
  const issues: ArtifactValidationIssue[] = [];
  proposal.options.forEach((option, optionIndex) => {
    option.cleanup.cut_candidate_ids.forEach((candidateId, candidateIndex) => {
      if (!candidateIds.has(candidateId)) {
        issues.push({
          path: `/options/${optionIndex}/cleanup/cut_candidate_ids/${candidateIndex}`,
          keyword: "reference",
          message: `unknown cleanup candidate_id: ${candidateId}`,
        });
      }
    });
  });
  if (issues.length) {
    const contract = productionProposalContractInfo();
    throw new ArtifactValidationError("production-proposal.json", contract.schema_version, contract.schema_digest, issues);
  }
}

function productionProposalWarnings(proposal: ProductionProposalArtifact): string[] {
  const warnings: string[] = [];
  for (const option of proposal.options) {
    if (option.images.needed) warnings.push(`option ${option.id} needs image asset work after confirmation`);
    if (option.music.source !== "none") warnings.push(`option ${option.id} needs music acquisition after confirmation`);
    if (option.visuals.requires_grounding) warnings.push(`option ${option.id} needs focus grounding after confirmation`);
  }
  return warnings;
}

function productionProposalOptionSummary(option: ProductionProposalOption, recommendedOptionId: string): ProjectProposalOptionSummary {
  return {
    id: option.id,
    label: option.label,
    recommended: option.id === recommendedOptionId,
    reason: option.reason,
    cut_candidate_count: option.cleanup.cut_candidate_ids.length,
    image_needed: option.images.needed,
    music_source: option.music.source,
    sfx_enabled: option.sfx.enabled,
    requires_grounding: option.visuals.requires_grounding,
    confirmation_count: option.requires_confirmation.length,
  };
}

function nextRequiredArtifactsForProposal(option: ProductionProposalOption): string[] {
  const artifacts = new Set<string>([projectArtifacts.editPlan]);
  if (option.visuals.requires_grounding) {
    artifacts.add(projectArtifacts.focusCandidates);
    artifacts.add(projectArtifacts.focusFrames);
    artifacts.add(projectArtifacts.focusGrounding);
    artifacts.add(projectArtifacts.focusReview);
  }
  if (option.images.needed) artifacts.add(projectArtifacts.assetManifest);
  if (option.music.source !== "none") {
    artifacts.add(projectArtifacts.musicRequest);
    artifacts.add(projectArtifacts.musicAcquisition);
    artifacts.add(projectArtifacts.musicReview);
    artifacts.add(projectArtifacts.assetManifest);
  }
  if (option.visuals.requires_grounding || option.images.needed || option.music.source !== "none" || option.sfx.enabled) {
    artifacts.add(projectArtifacts.enrichmentPlan);
  }
  return [...artifacts];
}

function renderProductionProposalMarkdown(proposal: ProductionProposalArtifact, warnings: string[]): string {
  const recommended = proposal.options.find((option) => option.id === proposal.recommended_option_id)!;
  return [
    "# Production Proposal",
    "",
    `Goal: ${proposal.goal_summary}`,
    `Material: ${proposal.material_summary}`,
    `Source mode: ${proposal.source_mode}`,
    `Presentation intent: ${proposal.presentation_intent}`,
    `Recommended option: ${recommended.id} (${recommended.label})`,
    "",
    "## Options",
    ...proposal.options.flatMap((option) => renderProductionProposalOption(option, proposal.recommended_option_id)),
    "",
    "## Reply",
    `- OK: use ${recommended.id} (${recommended.label})`,
    ...proposal.options.map((option) => `- ${option.id}: use ${option.label}`),
    "- Or describe changes in natural language.",
    "",
    "## Warnings",
    ...(warnings.length ? warnings.map((warning) => `- ${warning}`) : ["- none"]),
    "",
  ].join("\n");
}

function renderProductionProposalOption(option: ProductionProposalOption, recommendedId: string): string[] {
  const prefix = option.id === recommendedId ? " (default)" : "";
  return [
    `### ${option.id}: ${option.label}${prefix}`,
    "",
    `Reason: ${option.reason}`,
    `Cleanup cuts: ${option.cleanup.cut_candidate_ids.length ? option.cleanup.cut_candidate_ids.join(", ") : "none"}`,
    `Keep strategy: ${option.cleanup.keep_strategy}`,
    `Cleanup risks: ${option.cleanup.risks.length ? option.cleanup.risks.join("; ") : "none"}`,
    `Subtitles: ${option.subtitles.enabled ? "on" : "off"} / ${option.subtitles.style}`,
    `Subtitle conflicts: ${option.subtitles.conflict_notes.length ? option.subtitles.conflict_notes.join("; ") : "none"}`,
    `Visuals: ${option.visuals.direction}`,
    `Viewer job: ${option.visuals.viewer_job}`,
    `Grounding needed: ${option.visuals.requires_grounding ? "yes" : "no"}`,
    `Images: ${option.images.needed ? "needed" : "not needed"} / ${option.images.reason}`,
    `Missing image assets: ${option.images.missing_assets.length ? option.images.missing_assets.join(", ") : "none"}`,
    `Music: ${option.music.source}${option.music.mood ? ` / ${option.music.mood}` : ""} / ducking=${option.music.ducking ? "yes" : "no"}`,
    `Music notes: ${option.music.notes.length ? option.music.notes.join("; ") : "none"}`,
    `SFX: ${option.sfx.enabled ? "on" : "off"} / ${option.sfx.usage} / ${option.sfx.restraint}`,
    `Needs confirmation: ${option.requires_confirmation.length ? option.requires_confirmation.join("; ") : "none"}`,
    "",
  ];
}

function renderFocusCandidatesMarkdown(candidates: FocusCandidatesArtifact, warnings: string[]): string {
  return [
    "# Focus Candidates",
    "",
    `Source mode: ${candidates.source_mode}`,
    `Presentation intent: ${candidates.presentation_intent}`,
    "",
    "## Candidates",
    ...candidates.candidates.map((candidate) => `- ${candidate.id} ${candidate.start.toFixed(2)}-${candidate.end.toFixed(2)} ${candidate.semantic_intent} ${candidate.element_type}:${candidate.element_id} grounding=${candidate.requires_grounding ? "yes" : "no"}${focusBusinessSummary(candidate)}: ${candidate.reason}`),
    "",
    "## Warnings",
    ...(warnings.length ? warnings.map((warning) => `- ${warning}`) : ["- none"]),
    "",
  ].join("\n");
}

function renderFocusReviewMarkdown(candidates: FocusCandidatesArtifact, review: FocusReviewArtifact): string {
  const candidateById = new Map(candidates.candidates.map((candidate) => [candidate.id, candidate]));
  return [
    "# Focus Review",
    "",
    `Source mode: ${candidates.source_mode}`,
    `Presentation intent: ${candidates.presentation_intent}`,
    "",
    "## Items",
    ...review.items.map((item) => {
      const candidate = candidateById.get(item.candidate_id);
      const element = item.proposed_element ? ` proposed=${item.proposed_element.element_type}:${item.proposed_element.element_id}` : "";
      const frames = item.frame_paths.length ? ` frames=${item.frame_paths.join(",")}` : "";
      return `- ${item.candidate_id} status=${item.status}${element}${frames}${candidate ? focusBusinessSummary(candidate) : ""}: ${candidate?.reason ?? ""}`;
    }),
    "",
    "## Proposed Elements",
    ...(review.proposed_elements.length ? review.proposed_elements.map((element) => `- ${element.id} ${element.element_type}:${element.element_id} ${element.start.toFixed(2)}-${element.end.toFixed(2)}: ${element.reason}`) : ["- none"]),
    "",
    "## Warnings",
    ...(review.warnings.length ? review.warnings.map((warning) => `- ${warning}`) : ["- none"]),
    "",
  ].join("\n");
}

function focusBusinessSummary(candidate: FocusCandidate): string {
  const parts = [
    candidate.business_role ? `role=${candidate.business_role}` : "",
    candidate.viewer_job ? `job=${candidate.viewer_job}` : "",
    candidate.visual_gap ? `gap=${candidate.visual_gap}` : "",
    candidate.recommended_treatment ? `treatment=${candidate.recommended_treatment}` : "",
  ].filter(Boolean);
  return parts.length ? ` [${parts.join("; ")}]` : "";
}

function readOrBuildEdl(projectPath: string): EdlArtifact {
  return compileCurrentEdl(projectPath).edl;
}

export function compileEdlProject(projectPath: string): CommandResult<"project.compile-edl", { project_path: string; edl_path: string; entry_count: number; contract_version: "2.0" }> {
  try {
    const compiled = compileCurrentEdl(projectPath);
    if (compiled.edl.contract_version !== "2.0") throw commandError("EDL_SCHEMA_UNSUPPORTED", "current EDL is not portable contract_version 2.0");
    return ok("project.compile-edl", {
      project_path: projectPath,
      edl_path: join(projectPath, projectArtifacts.edl),
      entry_count: compiled.edl.entries.length,
      contract_version: "2.0",
    });
  } catch (error) {
    return fail("project.compile-edl", errorCode(error, "EDL_COMPILE_FAILED"), error);
  }
}

function compileCurrentEdl(projectPath: string): {
  edl: EdlArtifact;
  input_references: ArtifactFingerprintReference[];
  input_fingerprint: Fingerprint;
  edl_record: ArtifactRecord;
} {
  const startedAt = new Date().toISOString();
  const sources = readManifest(projectPath);
  const transcriptPath = join(projectPath, projectArtifacts.transcriptJson);
  const analysisPath = join(projectPath, projectArtifacts.analysis);
  const editPlanPath = join(projectPath, projectArtifacts.editPlan);
  const transcript = parseTranscript(readProjectJson(projectPath, projectArtifacts.transcriptJson, "transcript"), sources);
  const analysis = parseAnalysis(readProjectJson(projectPath, projectArtifacts.analysis, "analysis"), sources);
  const materialLineage = assertCurrentMaterialLineage(
    projectPath,
    sources,
    transcript,
    analysis,
    "project.compile-edl",
  );
  const editPlan = readEditPlan(projectPath, sources);
  const lifecycleManifest = materialLineage.manifest;
  const recordedAt = new Date().toISOString();
  const recordsToCommit: ArtifactRecord[] = [];
  const sourceRecords = materialLineage.source_records;
  const sourceReferences = sourceRecords.map(artifactReference);
  const sourcesRecord = materialLineage.sources_record;
  const sourcesReference = artifactReference(sourcesRecord);
  const transcriptRecord = materialLineage.transcript_record;
  const transcriptReference = artifactReference(transcriptRecord);
  const analysisRecord = materialLineage.analysis_record;
  const analysisReference = artifactReference(analysisRecord);

  const selectionReferences: ArtifactFingerprintReference[] = [];
  if (editPlan.contract_version === "1.0") {
    const proposalPath = join(projectPath, projectArtifacts.productionProposal);
    if (!existsSync(proposalPath)) {
      throw lifecycleCommandError(
        "PROPOSAL_REQUIRED",
        "confirmed edit plan requires production-proposal.json",
        "production-proposal",
        "Write production-proposal.json, run project proposal, then write the confirmed edit plan.",
      );
    }
    const proposal = parseProductionProposal(readProjectJson(projectPath, projectArtifacts.productionProposal, "production proposal"));
    const proposalRecord = lifecycleManifest?.artifacts["production-proposal"];
    const currentProposalFingerprint = proposalFingerprint(proposal);
    if (!proposalRecord || proposalRecord.fingerprint !== currentProposalFingerprint) {
      throw lifecycleCommandError(
        "PROPOSAL_PENDING_VALIDATION",
        "production proposal must be validated by project proposal before compiling the EDL",
        "production-proposal",
        "Run project proposal, confirm one option, and retry.",
      );
    }
    assertArtifactRecordCurrent(
      projectPath,
      lifecycleManifest!,
      "production-proposal",
      currentProposalFingerprint,
      new Set(),
      new Set(),
      "project.compile-edl",
    );
    const selectedOptionId = editPlan.confirmed_option_id!;
    const selectedFingerprint = proposalSelectionFingerprint(proposal, selectedOptionId);
    if (editPlan.proposal_selection_fingerprint !== selectedFingerprint) {
      throw lifecycleCommandError(
        "PROPOSAL_SELECTION_MISMATCH",
        `edit plan selection fingerprint does not match proposal option ${selectedOptionId}`,
        "edit-plan",
        "Regenerate edit-plan.json from the selected option fingerprint returned by project proposal.",
      );
    }
    const selectionKey = `proposal-selection:${selectedOptionId}`;
    const selectionRecord = lifecycleManifest?.artifacts[selectionKey];
    if (!selectionRecord || selectionRecord.fingerprint !== selectedFingerprint) {
      throw lifecycleCommandError(
        "PROPOSAL_SELECTION_PENDING_VALIDATION",
        `proposal option ${selectedOptionId} has not been registered by project proposal`,
        selectionKey,
        "Run project proposal again and retry.",
      );
    }
    const currentSelectionRecord = assertArtifactRecordCurrent(
      projectPath,
      lifecycleManifest!,
      selectionKey,
      selectedFingerprint,
      new Set(),
      new Set(),
      "project.compile-edl",
    );
    selectionReferences.push(artifactReference(currentSelectionRecord));
    const selectedOption = proposal.options.find((option) => option.id === selectedOptionId)!;
    assertEditPlanConformsToSelectedProposalOption(selectedOption, editPlan, "project.compile-edl");
  }

  const editPlanCandidate = recordJsonArtifact({
    project_path: projectPath,
    key: "edit-plan",
    path: projectArtifacts.editPlan,
    role: "authoritative_input",
    schema_version: editPlan.contract_version,
    authored_by: "agent",
    command: "project.compile-edl",
    mode: "validated",
    inputs: selectionReferences,
    value: editPlanFingerprintProjection(editPlan),
    file_sha256: fileBytesFingerprint(editPlanPath),
    recorded_at: recordedAt,
  });
  const editPlanRecord = currentOrReplacementRecord(lifecycleManifest, editPlanCandidate, recordsToCommit);
  const editPlanReference = artifactReference(editPlanRecord);
  const inputReferences = [sourcesReference, ...sourceReferences, transcriptReference, analysisReference, ...selectionReferences, editPlanReference];
  const currentInputFingerprint = inputFingerprint(inputReferences);
  const edlPath = join(projectPath, projectArtifacts.edl);
  const existingEdlRecord = lifecycleManifest?.artifacts.edl;
  if (existingEdlRecord && existsSync(edlPath) && referencesEqual(existingEdlRecord.inputs, inputReferences)) {
    const existingEdl = parseEdl(readProjectJson(projectPath, projectArtifacts.edl, "EDL"), sources);
    if (existingEdlRecord.fingerprint === semanticJsonFingerprint(existingEdl)) {
      return { edl: existingEdl, input_references: inputReferences, input_fingerprint: currentInputFingerprint, edl_record: existingEdlRecord };
    }
  }

  try {
    const edl = buildEdl(projectPath, sources, transcript, analysis, editPlan);
    atomicWriteJson(edlPath, edl);
    const edlRecord = recordJsonArtifact({
      project_path: projectPath,
      key: "edl",
      path: projectArtifacts.edl,
      role: "derived",
      schema_version: "2.0",
      authored_by: "cli",
      command: "project.compile-edl",
      mode: "produced",
      inputs: inputReferences,
      value: edl,
      file_sha256: fileBytesFingerprint(edlPath),
      recorded_at: recordedAt,
    });
    commitProjectStage({
      project_path: projectPath,
      stage: "project.compile-edl",
      command: "project.compile-edl",
      input_fingerprint: currentInputFingerprint,
      inputs: inputReferences,
      records: [...recordsToCommit, edlRecord],
      started_at: startedAt,
      completed_at: recordedAt,
    });
    return { edl, input_references: inputReferences, input_fingerprint: currentInputFingerprint, edl_record: edlRecord };
  } catch (error) {
    commitProjectStageFailure({
      project_path: projectPath,
      stage: "project.compile-edl",
      command: "project.compile-edl",
      input_fingerprint: currentInputFingerprint,
      inputs: inputReferences,
      failure_code: errorCode(error, "EDL_COMPILE_FAILED"),
      failure_message: error instanceof Error ? error.message : String(error),
      artifact: "edl",
      remediation: errorRemediation(error, "Fix the current edit plan or timing artifacts, then retry."),
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    });
    throw error;
  }
}

function currentOrReplacementRecord(
  manifest: ReturnType<typeof readProjectArtifactManifest>,
  candidate: ArtifactRecord,
  recordsToCommit: ArtifactRecord[],
): ArtifactRecord {
  const existing = manifest?.artifacts[candidate.key];
  if (
    existing?.key === candidate.key &&
    existing.path === candidate.path &&
    existing.role === candidate.role &&
    existing.schema_version === candidate.schema_version &&
    existing.fingerprint === candidate.fingerprint &&
    existing.file_sha256 === candidate.file_sha256 &&
    referencesEqual(existing.inputs, candidate.inputs)
  ) return existing;
  recordsToCommit.push(candidate);
  return candidate;
}

function referencesEqual(left: readonly ArtifactFingerprintReference[], right: readonly ArtifactFingerprintReference[]): boolean {
  if (left.length !== right.length) return false;
  return left.every(
    (item, index) =>
      item.key === right[index]?.key && item.fingerprint === right[index]?.fingerprint && (item.schema_version ?? "") === (right[index]?.schema_version ?? ""),
  );
}

function projectAssetPath(projectPath: string, relativePath: string): string {
  return resolveExistingProjectPath(projectPath, relativePath, `asset ${relativePath}`);
}

function projectAssetExists(projectPath: string, relativePath: string): boolean {
  try {
    projectAssetPath(projectPath, relativePath);
    return true;
  } catch {
    return false;
  }
}

function compiledCaptionPlan(plan: EnrichmentPlanArtifact): { enabled: boolean; identity: "anchor"; emphasis: CaptionEmphasis[] } {
  const captionElements = plan.elements.filter((element) => element.element_type === "caption_identity");
  return {
    enabled: captionElements.length > 0,
    identity: captionElements[0]?.caption_identity ?? plan.profile.caption_identity,
    emphasis: captionElements.map((element) => ({
      start: element.start,
      end: element.end,
      text: elementParamText(element, "text") ?? element.element_id,
      reason: element.reason,
    })),
  };
}

function summarizeEnrichment(
  plan: EnrichmentPlanArtifact,
  blockUsage: ProjectEnrichmentBlockUsage[] = summarizeHyperframesBlocks(plan).block_usage,
  elementUsage: ProjectEnrichmentElementUsage[] = summarizeHyperframesElements(plan),
): string[] {
  const captions = compiledCaptionPlan(plan);
  return [
    ...(captions.enabled ? [`captions ${captions.identity} emphasis=${captions.emphasis.length}`] : []),
    ...plan.audio.music.map((slot) => `${slot.id} music_segment ${slot.start.toFixed(2)}-${slot.end.toFixed(2)} asset=${slot.asset_id}`),
    ...elementUsage.map((element) => `${element.id} ${element.element_type} ${element.element_id} ${element.start.toFixed(2)}-${element.end.toFixed(2)} renderable=${element.renderable ? "yes" : "no"} source=${element.source}`),
  ];
}

function emptyAudioUsage(): ProjectAudioUsage {
  return { music: [], sfx: [] };
}

function summarizeAudioUsage(plan: EnrichmentPlanArtifact): ProjectAudioUsage {
  return {
    music: plan.audio.music.map((slot) => ({
      id: slot.id,
      asset_id: slot.asset_id,
      start: slot.start,
      end: slot.end,
      volume: slot.volume,
      ducking: slot.ducking,
      fade_seconds: slot.fade_seconds,
      reason: slot.reason,
    })),
    sfx: plan.audio.sfx.map((item) => ({
        id: item.id,
        asset_id: item.asset_id,
        sfx_id: item.sfx_id,
        start: item.start,
        end: item.end,
        volume: item.volume,
        reason: item.reason,
      })),
  };
}

function summarizeHyperframesElements(plan: EnrichmentPlanArtifact): ProjectEnrichmentElementUsage[] {
  return plan.elements.map((element) => {
    const catalogType = vendoredElementType(element);
    const catalog = catalogType ? getVendoredElement(element.element_id, catalogType) : undefined;
    const adapter = catalog ? adapterForVendoredElement(catalog) : adapterForElement(element);
    const renderable = (catalog?.renderable ?? false) || adapter.render_strategy !== "guidance_only" || isAssetElement(element);
    const guidanceOnly = (catalog?.guidance_only ?? false) && adapter.render_strategy === "guidance_only";
    return {
      id: element.id,
      element_id: element.element_id,
      element_type: element.element_type,
      source: catalog?.source ?? element.source,
      start: element.start,
      end: element.end,
      reason: element.reason,
      renderable,
      guidance_only: guidanceOnly,
      title: catalog?.title,
      tags: catalog?.tags ?? [],
      asset_id: element.asset_id,
      zone: element.zone,
      target_rect: element.target_rect,
      anchor_point: element.anchor_point,
      adapter,
    };
  });
}

function requiresHyperframesRecut(plan: EnrichmentPlanArtifact): boolean {
  if (compiledCaptionPlan(plan).enabled) return true;
  return plan.elements.some((element) => {
    const strategy = adapterForPlanElement(element).render_strategy;
    return (
      element.element_type === "registry_block" ||
      element.element_type === "registry_component" ||
      element.element_type === "caption_identity" ||
      strategy === "cli_overlay" ||
      (strategy === "asset_overlay" && isVisualAssetElement(element))
    );
  });
}

function summarizeHyperframesBlocks(plan: EnrichmentPlanArtifact, assets?: AssetManifestArtifact): { block_usage: ProjectEnrichmentBlockUsage[]; cdn_dependencies: HyperframesDependencySummary[] } {
  const block_usage: ProjectEnrichmentBlockUsage[] = [];
  const dependencyIds = new Set<string>();
  for (const dependency of dependenciesForHyperframesBlocks(uniqueStrings(block_usage.map((usage) => usage.block_id)))) dependencyIds.add(dependency.id);
  if (requiresHyperframesRecut(plan)) dependencyIds.add("gsap_3_14_2");
  for (const element of plan.elements.filter(isVisualAssetElement)) {
    const asset = assets?.assets.find((entry) => entry.id === element.asset_id);
    for (const dependency of asset?.runtime_dependencies ?? []) dependencyIds.add(dependency);
    if (asset?.path.endsWith(".json") && (asset.type === "animated_icon" || asset.type === "lottie" || asset.type === "sticker")) dependencyIds.add("lottie_web_5_12_2");
    if (asset?.path.endsWith(".lottie")) dependencyIds.add("dotlottie_web_0_76_0");
  }
  const cdn_dependencies = [...dependencyIds].map((id) => validateHyperframesCdnDependency(requiredHyperframesDependency(id)));
  return { block_usage, cdn_dependencies };
}

function summarizeAssets(projectPath: string, assets: AssetManifestArtifact): ProjectAssetSummary[] {
  return assets.assets.map((asset) => ({
    id: asset.id,
    path: asset.path,
    type: asset.type,
    source: asset.source,
    provenance: asset.provenance,
    provider: asset.provider,
    license: asset.license,
    source_url: asset.source_url ?? asset.original_url,
    runtime_dependencies: asset.runtime_dependencies ? [...asset.runtime_dependencies] : [],
    used_by: asset.used_by ? [...asset.used_by] : [],
    exists: projectAssetExists(projectPath, asset.path),
    duration_seconds: asset.duration_seconds,
    dimensions: asset.dimensions,
  }));
}

function buildQaChecks(projectPath: string, plan: EnrichmentPlanArtifact, assets: AssetManifestArtifact): ProjectQaCheck[] {
  const checks: ProjectQaCheck[] = [];
  compiledCaptionPlan(plan).emphasis.forEach((emphasis, index) => {
    checks.push(
      qaCheck({
        id: `caption-${index + 1}`,
        source_element_id: `caption-${index + 1}`,
        kind: "caption_emphasis",
        start: emphasis.start,
        end: emphasis.end,
        expected: `caption emphasis: ${emphasis.text}. ${emphasis.reason}`,
        frame_times: qaFrameTimes(emphasis.start, emphasis.end),
        warnings: [],
      }),
    );
  });

  for (const element of plan.elements) {
    if (element.element_type === "caption_identity") continue;
    const asset = element.asset_id ? assets.assets.find((item) => item.id === element.asset_id) : undefined;
    const visualAsset = element.element_type === "visual_asset";
    const warnings = [
      ...assetWarnings(projectPath, asset, element.asset_id, visualAsset),
      ...coordinateWarnings(plan.profile.source_mode, element),
    ];
    checks.push(
      qaCheck({
        id: `element-${element.id}`,
        source_element_id: element.id,
        kind: "element",
        start: element.start,
        end: element.end,
        expected: `${element.element_type} ${element.element_id}: ${element.reason}`,
        frame_times: qaFrameTimes(element.start, element.end),
        warnings,
        asset,
      }),
    );
  }

  for (const music of plan.audio.music) {
    const asset = assets.assets.find((item) => item.id === music.asset_id);
    const warnings = assetWarnings(projectPath, asset, music.asset_id, false);
    if (music.volume > 0.18) warnings.push(`${music.id}: music volume may cover speech`);
    if (!music.ducking) warnings.push(`${music.id}: music ducking is disabled`);
    checks.push(
      qaCheck({
        id: `music-${music.id}`,
        source_element_id: music.id,
        kind: "music",
        start: music.start,
        end: music.end,
        expected: `music ${music.asset_id}: ${music.reason}`,
        frame_times: [],
        warnings,
        asset,
      }),
    );
  }

  for (const sfx of plan.audio.sfx) {
    const asset = sfx.asset_id ? assets.assets.find((item) => item.id === sfx.asset_id) : undefined;
    const warnings = sfx.asset_id ? assetWarnings(projectPath, asset, sfx.asset_id, false) : [];
    checks.push(
      qaCheck({
        id: `sfx-${sfx.id}`,
        source_element_id: sfx.id,
        kind: "sfx",
        start: sfx.start,
        end: sfx.end,
        expected: `SFX ${sfx.asset_id ?? sfx.sfx_id}: ${sfx.reason}`,
        frame_times: [],
        warnings,
        asset,
      }),
    );
  }

  return checks;
}

function qaCheck(input: Omit<ProjectQaCheck, "status" | "needs_human_review" | "asset_id" | "asset_path" | "provider" | "provenance" | "runtime_dependencies"> & { asset?: AssetManifestArtifact["assets"][number] }): ProjectQaCheck {
  const blocker = input.warnings.some((warning) => /missing|unsafe|invalid/i.test(warning));
  return {
    id: input.id,
    source_element_id: input.source_element_id,
    kind: input.kind,
    start: input.start,
    end: input.end,
    expected: input.expected,
    frame_times: input.frame_times,
    status: blocker ? "blocker" : input.warnings.length ? "warning" : "sampled",
    warnings: input.warnings,
    needs_human_review: input.frame_times.length > 0 || input.warnings.length > 0,
    asset_id: input.asset?.id,
    asset_path: input.asset?.path,
    provider: input.asset?.provider,
    provenance: input.asset?.provenance ?? input.asset?.source,
    runtime_dependencies: input.asset?.runtime_dependencies ? [...input.asset.runtime_dependencies] : undefined,
  };
}

function qaFrameTimes(start: number, end: number): number[] {
  if (end - start >= 6) return uniqueNumbers([start + 0.4, (start + end) / 2, Math.max(start, end - 0.4)]);
  return [Number(((start + end) / 2).toFixed(3))];
}

function assetWarnings(projectPath: string, asset: AssetManifestArtifact["assets"][number] | undefined, assetId: string | undefined, requiresProvenance: boolean): string[] {
  if (!assetId) return [];
  if (!asset) return [`missing asset ${assetId}`];
  const warnings: string[] = [];
  if (!projectAssetExists(projectPath, asset.path)) warnings.push(`missing or non-project-local asset file ${asset.path}`);
  if (requiresProvenance && !asset.provenance && !asset.source && !asset.provider) warnings.push(`${asset.id}: asset provenance is missing`);
  return warnings;
}

function coordinateWarnings(sourceMode: EnrichmentSourceMode, item: { id: string; target_rect?: unknown; anchor_point?: unknown; params?: EnrichmentElement["params"] }): string[] {
  if (sourceMode !== "screen_recording" || (!item.target_rect && !item.anchor_point)) return [];
  if (item.params && elementParamText({ params: item.params } as EnrichmentElement, "coordinate_source_frame")) return [];
  return [`${item.id}: screen_recording coordinates should include params.coordinate_source_frame or focus-grounding evidence`];
}

function enrichmentWarnings(plan: EnrichmentPlanArtifact): string[] {
  const warnings: string[] = [];
  const sourceMode = plan.profile.source_mode;
  const screenLike = sourceMode === "screen_recording" || sourceMode === "mixed";
  const heavyStyles = new Set(["whiteboard", "audit", "xhs", "editorial"]);
  for (const element of plan.elements) {
    const adapter = adapterForPlanElement(element);
    if (screenLike && element.zone === "full_frame" && element.element_type !== "caption_identity") warnings.push(`${element.id}: full_frame ${element.element_type} may hide source UI in ${sourceMode}`);
    if (!adapter.source_modes.includes(sourceMode)) warnings.push(`${element.id}: ${element.element_id} is not a default ${sourceMode} element`);
    if (sourceMode === "screen_recording" && !adapter.screen_safe && element.zone !== "full_frame") warnings.push(`${element.id}: ${element.element_id} is not screen-safe outside full_frame interstitials`);
    if (sourceMode === "screen_recording" && element.element_type === "registry_block" && !element.target_rect && !element.anchor_point && element.zone !== "lower_third") {
      warnings.push(`${element.id}: registry_block ${element.element_id} may be too large for screen_recording without target_rect or anchor_point`);
    }
    if (sourceMode === "screen_recording" && (element.target_rect || element.anchor_point) && !elementParamText(element, "coordinate_source_frame")) {
      warnings.push(`${element.id}: screen_recording coordinates should include params.coordinate_source_frame`);
    }
    if (sourceMode === "screen_recording" && (isVisualAssetElement(element) || element.asset_id)) warnings.push(`${element.id}: visual asset in screen_recording should be justified by the user goal`);
    if (element.element_type === "animation_rule") {
      const catalog = getVendoredElement(element.element_id, "animation_rule");
      if (catalog?.guidance_only && adapter.render_strategy === "guidance_only") warnings.push(`${element.id}: ${element.element_id} is guidance_only and requires a renderable block/component adapter`);
    }
  }
  if (sourceMode === "screen_recording" && plan.audio.music.length > 0) warnings.push("screen_recording includes music; keep it off unless short-form packaging needs it");
  return warnings;
}

function validateElementAdapter(plan: EnrichmentPlanArtifact, element: EnrichmentElement): void {
  const adapter = adapterForPlanElement(element);
  if (adapter.requires_target_rect && !element.target_rect) throw new Error(`${element.id}: ${element.element_id} requires target_rect`);
  if (adapter.requires_anchor_point && !element.anchor_point) throw new Error(`${element.id}: ${element.element_id} requires anchor_point`);
  if (adapter.asset_requirements.length > 0 && !element.asset_id) {
    throw new Error(`${element.id}: ${element.element_id} requires asset_id (${adapter.asset_requirements.join(", ")})`);
  }
  for (const param of adapter.required_params) {
    const value = element.params?.[param];
    if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${element.id}: ${element.element_id} requires params.${param}`);
  }
  if (plan.profile.source_mode === "screen_recording" && !adapter.screen_safe && !isAssetElement(element) && element.zone !== "full_frame") {
    throw new Error(`${element.id}: ${element.element_id} is not screen-safe outside full_frame`);
  }
}

function hasSubtleUiSfxReason(element: EnrichmentElement): boolean {
  const volume = elementParamNumber(element, "volume");
  const actionReason = /ui|click|tap|action|sync|button|toggle|selection|点击|操作|按钮|同步/.test(element.reason.toLowerCase());
  return actionReason && volume !== undefined && volume <= 0.12;
}

function adapterForPlanElement(element: EnrichmentElement): HyperframesElementAdapter {
  const catalogType = vendoredElementType(element);
  const catalog = catalogType ? getVendoredElement(element.sfx_id ?? element.element_id, catalogType) : undefined;
  return catalog ? adapterForVendoredElement(catalog) : adapterForElement(element);
}

export function commandExists(command: string): boolean {
  return spawnSync(command, ["-version"], { stdio: "ignore" }).status === 0;
}

export function normalizeWhisperJson(value: unknown, sourceId: string): TranscriptArtifact["segments"] {
  const obj = object(value);
  const rows = Array.isArray(obj.transcription) ? obj.transcription : Array.isArray(obj.segments) ? obj.segments : [];
  return rows.flatMap((row, index) => {
    const item = object(row);
    const start = whisperTime(item.start ?? object(item.offsets).from ?? object(item.timestamps).from);
    const end = whisperTime(item.end ?? object(item.offsets).to ?? object(item.timestamps).to);
    const text = typeof item.text === "string" ? item.text.trim() : "";
    if (!text) return [];
    if (end <= start) throw new Error(`whisper segment ${index} has invalid timestamps`);
    return [{ source_id: sourceId, start, end, text }];
  });
}

export function normalizeCloudflareWhisperResult(value: unknown, sourceId: string): TranscriptArtifact["segments"] {
  const obj = object(value);
  const rows = Array.isArray(obj.segments) ? obj.segments : [];
  const segments = rows.flatMap((row, index) => {
    const item = object(row);
    const start = optionalWhisperTime(item.start ?? object(item.offsets).from ?? object(item.timestamps).from);
    const end = optionalWhisperTime(item.end ?? object(item.offsets).to ?? object(item.timestamps).to);
    const text = typeof item.text === "string" ? item.text.trim() : "";
    if (!text || start === undefined || end === undefined) return [];
    if (end <= start) throw new Error(`cloudflare whisper segment ${index} has invalid timestamps`);
    return [{ source_id: sourceId, start, end, text }];
  });
  if (segments.length > 0) return segments;
  if (typeof obj.vtt === "string") return parseVttTranscript(obj.vtt, sourceId);
  throw new Error("Cloudflare Whisper response had no timed segments");
}

function readManifest(projectPath: string): SourcesManifest {
  return parseSourcesManifest(readProjectJson(projectPath, projectArtifacts.sources, "sources manifest"));
}

function materializedSourcePaths(projectPath: string, manifest: SourcesManifest): Map<string, string> {
  const materializationPath = join(projectPath, projectArtifacts.sourceMaterialization);
  if (!existsSync(materializationPath)) throw commandError("SOURCE_BINDING_REQUIRED", "source bytes must be materialized before this operation");
  const materialization = parseSourceMaterialization(readProjectJson(projectPath, projectArtifacts.sourceMaterialization, "source materialization"), manifest);
  const paths = new Map(materialization.sources.map((source) => [source.source_id, source.project_path]));
  if (manifest.sources.some((source) => !paths.has(source.source_id))) throw commandError("SOURCE_BINDING_REQUIRED", "all source bytes must be materialized before this operation");
  return paths;
}

function readEditPlan(projectPath: string, manifest: SourcesManifest): ReturnType<typeof parseEditPlan> {
  try {
    return parseEditPlan(readProjectJson(projectPath, projectArtifacts.editPlan, "edit plan"), manifest);
  } catch (error) {
    if (error instanceof Error && error.message.includes("asset_usage_plan")) {
      throw assetUsageError("asset_usage_plan_invalid", `asset_usage_plan_invalid: ${error.message}`);
    }
    throw error;
  }
}

async function transcribeProject(projectPath: string, manifest: SourcesManifest, provider?: AsrProvider): Promise<TranscriptArtifact> {
  const selected = provider ?? (hasCloudflareWhisperEnv() ? "cloudflare-whisper" : "whisper-cli");
  if (selected === "cloudflare-whisper") return await transcribeWithCloudflareWhisper(projectPath, manifest);
  return transcribeWithWhisperCli(projectPath, manifest);
}

function transcribeWithWhisperCli(projectPath: string, manifest: SourcesManifest): TranscriptArtifact {
  if (!commandExists("whisper-cli")) throw new Error("whisper-cli not found for --asr auto");
  const paths = materializedSourcePaths(projectPath, manifest);
  const segments = manifest.sources.flatMap((source) => {
    const audioPath = audioInputPath(projectPath, source.source_id, join(projectPath, paths.get(source.source_id)!));
    const outputBase = join(projectPath, ".asr", source.source_id);
    const modelArgs = process.env.WHISPER_MODEL ? ["-m", process.env.WHISPER_MODEL] : [];
    const result = spawnSync("whisper-cli", [...modelArgs, "-l", "auto", "-oj", "-of", outputBase, "-np", audioPath], { encoding: "utf8" });
    if (result.status !== 0) throw new Error(`whisper-cli failed for ${source.source_id}: ${result.stderr || result.stdout}`);
    return normalizeWhisperJson(readJson(`${outputBase}.json`), source.source_id);
  });
  return { timing_granularity: "segment", provider: "whisper-cli", segments };
}

async function transcribeWithCloudflareWhisper(projectPath: string, manifest: SourcesManifest): Promise<TranscriptArtifact> {
  const accountId = process.env.GATEWAY_CLOUDFLARE_AI_ACCOUNT_ID;
  const token = process.env.GATEWAY_CLOUDFLARE_AI_API_TOKEN;
  const model = process.env.GATEWAY_CLOUDFLARE_AI_TRANSCRIPTION_MODEL ?? "@cf/openai/whisper-large-v3-turbo";
  if (!accountId || !token) throw new Error("Cloudflare Whisper env is missing");
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
  const segments: TranscriptArtifact["segments"] = [];
  const paths = materializedSourcePaths(projectPath, manifest);
  for (const source of manifest.sources) {
    const audioPath = onlineAudioInputPath(projectPath, source.source_id, join(projectPath, paths.get(source.source_id)!));
    const payload: Record<string, unknown> = {
      audio: Buffer.from(readFileSync(audioPath)).toString("base64"),
      task: "transcribe",
      vad_filter: true,
    };
    if (process.env.GATEWAY_CLOUDFLARE_AI_LANGUAGE) payload.language = process.env.GATEWAY_CLOUDFLARE_AI_LANGUAGE;
    if (process.env.GATEWAY_CLOUDFLARE_AI_INITIAL_PROMPT) payload.initial_prompt = process.env.GATEWAY_CLOUDFLARE_AI_INITIAL_PROMPT;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Cloudflare Whisper failed for ${source.source_id}: HTTP ${response.status} ${text.slice(0, 500)}`);
    const json = JSON.parse(text) as { result?: unknown };
    segments.push(...normalizeCloudflareWhisperResult(json.result ?? json, source.source_id));
  }
  return { timing_granularity: "segment", provider: "cloudflare-whisper", segments };
}

function hasCloudflareWhisperEnv(): boolean {
  return Boolean(process.env.GATEWAY_CLOUDFLARE_AI_ACCOUNT_ID && process.env.GATEWAY_CLOUDFLARE_AI_API_TOKEN);
}

function audioInputPath(projectPath: string, sourceId: string, sourcePath: string): string {
  if ([".flac", ".mp3", ".ogg", ".wav"].includes(extname(sourcePath).toLowerCase())) return sourcePath;
  if (!commandExists("ffmpeg")) throw new Error("ffmpeg not found for video audio extraction");
  const asrDir = join(projectPath, ".asr");
  mkdirSync(asrDir, { recursive: true });
  const audioPath = join(asrDir, `${sourceId}.wav`);
  const result = spawnSync("ffmpeg", ["-y", "-i", sourcePath, "-vn", "-ac", "1", "-ar", "16000", audioPath], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`ffmpeg audio extraction failed for ${sourceId}: ${result.stderr || result.stdout}`);
  return audioPath;
}

function onlineAudioInputPath(projectPath: string, sourceId: string, sourcePath: string): string {
  if ([".flac", ".mp3", ".ogg", ".wav", ".m4a", ".aac"].includes(extname(sourcePath).toLowerCase())) return sourcePath;
  if (!commandExists("ffmpeg")) throw new Error("ffmpeg not found for video audio extraction");
  const asrDir = join(projectPath, ".asr");
  mkdirSync(asrDir, { recursive: true });
  const audioPath = join(asrDir, `${sourceId}-online.mp3`);
  const result = spawnSync("ffmpeg", ["-y", "-i", sourcePath, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", audioPath], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`ffmpeg online audio extraction failed for ${sourceId}: ${result.stderr || result.stdout}`);
  return audioPath;
}

function detectCandidates(transcript: TranscriptArtifact): AnalysisArtifact {
  const candidates: AnalysisCandidate[] = [];
  for (let index = 0; index < transcript.segments.length; index += 1) {
    const segment = transcript.segments[index]!;
    const text = segment.text.trim().toLowerCase();
    if (["um", "uh", "嗯", "呃"].includes(text)) {
      candidates.push(candidate(segment, "filler", "Common filler word", index));
    }
    const next = transcript.segments[index + 1];
    if (next?.source_id === segment.source_id) {
      if (next.start - segment.end >= 1) candidates.push(candidate({ ...segment, start: segment.end, end: next.start, text: "[silence]" }, "silence", "Long transcript gap", index));
      if (normalizeText(next.text) === normalizeText(segment.text)) candidates.push(candidate(next, "repeat", "Adjacent repeated phrase", index));
    }
  }
  return { candidates };
}

function clampTranscriptToSources(transcript: TranscriptArtifact, manifest: SourcesManifest): TranscriptArtifact {
  const durations = new Map(manifest.sources.map((source) => [source.source_id, source.duration_seconds]));
  return {
    ...transcript,
    segments: transcript.segments.flatMap((segment) => {
      const duration = durations.get(segment.source_id);
      if (!duration) return [segment];
      const end = Math.min(segment.end, duration);
      return end > segment.start ? [{ ...segment, end }] : [];
    }),
  };
}

function candidate(segment: TranscriptArtifact["segments"][number], type: string, reason: string, index: number): AnalysisCandidate {
  return { ...segment, id: `c-${String(index + 1).padStart(3, "0")}-${type}`, type, reason, confidence: type === "silence" ? 0.8 : 0.7 };
}

function renderMaterialReport(manifest: SourcesManifest, transcript: TranscriptArtifact, analysis: AnalysisArtifact): string {
  return [
    "# Material Report",
    "",
    `Sources: ${manifest.sources.length}`,
    `Timing granularity: ${transcript.timing_granularity}`,
    `Transcript segments: ${transcript.segments.length}`,
    `Cleanup candidates: ${analysis.candidates.length}`,
    "",
  ].join("\n");
}

function renderTranscriptMarkdown(transcript: TranscriptArtifact): string {
  return transcript.segments.map((segment) => `- ${segment.source_id} ${segment.start.toFixed(2)}-${segment.end.toFixed(2)}: ${segment.text}`).join("\n") + "\n";
}

function renderReviewMarkdown(reviewPackage: { original_ranges: TranscriptArtifact["segments"]; proposed_cuts: AnalysisCandidate[]; unresolved_risks: string[] }, timing: TranscriptArtifact["timing_granularity"]): string {
  const originals = reviewPackage.original_ranges.map((range) => `- ${range.source_id} ${range.start.toFixed(2)}-${range.end.toFixed(2)}: ${range.text}`);
  const cuts = reviewPackage.proposed_cuts.map((cut) => `- ${cut.id} ${cut.source_id} ${cut.start.toFixed(2)}-${cut.end.toFixed(2)} ${cut.type} confidence=${cut.confidence.toFixed(2)} timing=${timing}: ${cut.reason}`);
  const risks = reviewPackage.unresolved_risks.map((risk) => `- ${risk}`);
  return ["# Review Package", "", "## Original Ranges", ...originals, "", "## Proposed Cuts", ...cuts, "", "## Unresolved Risks", ...risks, ""].join("\n");
}

function buildEdl(
  _projectPath: string,
  manifest: SourcesManifest,
  transcript: TranscriptArtifact,
  analysis: AnalysisArtifact,
  editPlan: ReturnType<typeof parseEditPlan>,
): EdlArtifact {
  const candidateIds = new Set(analysis.candidates.map((candidate) => candidate.id));
  for (const decision of editPlan.decisions) {
    if ((decision.action === "cut" || decision.action === "keep") && !decision.candidate_id) throw new Error(`${decision.action} decisions require candidate_id`);
    if (decision.candidate_id && !candidateIds.has(decision.candidate_id)) throw new Error(`edit-plan references unknown candidate_id: ${decision.candidate_id}`);
  }
  const cutIds = new Set(editPlan.decisions.filter((decision) => decision.action === "cut" && decision.candidate_id).map((decision) => decision.candidate_id));
  const skippedSources = new Set(editPlan.decisions.filter((decision) => decision.action === "skip" && decision.source_id).map((decision) => decision.source_id));
  if (transcript.timing_granularity === "text-only" && cutIds.size > 0) throw new Error("text-only transcripts cannot drive precise cuts");
  if (transcript.timing_granularity === "word" && isChinese(transcript.language) && transcript.timing_validated !== true && cutIds.size > 0) {
    throw new Error("unvalidated Chinese word timing cannot drive precise cuts");
  }

  const entries: EdlEntry[] = [];
  const orderedSources = editPlan.source_order
    ? editPlan.source_order.map((sourceId) => manifest.sources.find((source) => source.source_id === sourceId)!)
    : manifest.sources;
  for (const source of orderedSources) {
    if (skippedSources.has(source.source_id)) continue;
    const duration = source.duration_seconds;
    if (duration <= 0) throw new Error(`source duration is unavailable for ${source.source_id}`);
    const cuts = analysis.candidates
      .filter((candidate) => candidate.source_id === source.source_id && cutIds.has(candidate.id))
      .sort((a, b) => a.start - b.start);
    for (let index = 1; index < cuts.length; index += 1) {
      const previous = cuts[index - 1]!;
      const current = cuts[index]!;
      if (current.start < previous.end) throw new Error(`selected cut candidates overlap for ${source.source_id}: ${current.id}`);
    }
    let cursor = 0;
    for (const cut of cuts) {
      if (cut.end > duration) throw new Error(`candidate ${cut.id} exceeds source duration`);
      if (cut.end - cut.start <= CUT_PADDING_SECONDS * 2) throw new Error(`candidate ${cut.id} is too short for boundary padding`);
      const cutStart = Math.min(duration, cut.start + CUT_PADDING_SECONDS);
      const cutEnd = Math.max(cutStart, cut.end - CUT_PADDING_SECONDS);
      if (cutStart > cursor) entries.push(edlEntry(source.source_id, cursor, cutStart, entries.length, `keep before ${cut.id}`));
      cursor = Math.max(cursor, cutEnd);
    }
    if (duration > cursor) entries.push(edlEntry(source.source_id, cursor, duration, entries.length, "keep source range"));
  }
  if (entries.length === 0) throw new Error("EDL has no renderable entries");
  return parseEdl({ contract_version: "2.0", entries }, manifest);
}

function assertEditPlanConformsToSelectedProposalOption(
  option: ProductionProposalOption,
  editPlan: ReturnType<typeof parseEditPlan>,
  stage: string,
): void {
  if (option.edit_execution_plan.reorder_segments.length > 0) {
    throw lifecycleCommandError(
      "PROPOSAL_EXECUTION_UNSUPPORTED",
      `proposal option ${option.id} requests segment reorder, but edit-plan v1 only supports whole-source source_order`,
      "edit-plan",
      "Choose an option without segment reorder, or add a supported source_order-only edit plan.",
      stage,
    );
  }
  const cutIds = new Set(editPlan.decisions.filter((decision) => decision.action === "cut").map((decision) => decision.candidate_id).filter((candidateId): candidateId is string => Boolean(candidateId)));
  const keepIds = new Set(editPlan.decisions.filter((decision) => decision.action === "keep").map((decision) => decision.candidate_id).filter((candidateId): candidateId is string => Boolean(candidateId)));
  const conflictingIds = [...cutIds].filter((candidateId) => keepIds.has(candidateId));
  if (conflictingIds.length > 0) {
    throw lifecycleCommandError(
      "PROPOSAL_EXECUTION_MISMATCH",
      `edit-plan.json cannot both cut and keep candidate IDs: ${conflictingIds.join(", ")}`,
      "edit-plan",
      "Regenerate edit-plan.json with exactly the selected proposal cleanup cuts.",
      stage,
    );
  }
  const expectedCuts = new Set(option.cleanup.cut_candidate_ids);
  const missingCuts = option.cleanup.cut_candidate_ids.filter((candidateId) => !cutIds.has(candidateId));
  const unexpectedCuts = [...cutIds].filter((candidateId) => !expectedCuts.has(candidateId));
  if (missingCuts.length > 0 || unexpectedCuts.length > 0) {
    throw lifecycleCommandError(
      "PROPOSAL_EXECUTION_MISMATCH",
      `edit-plan.json cuts must exactly match proposal option ${option.id} cleanup.cut_candidate_ids; missing=[${missingCuts.join(", ")}] unexpected=[${unexpectedCuts.join(", ")}]`,
      "edit-plan",
      "Regenerate edit-plan.json with exactly the selected proposal cleanup cuts.",
      stage,
    );
  }
  const skippedSources = editPlan.decisions.filter((decision) => decision.action === "skip");
  if (skippedSources.length > 0) {
    throw lifecycleCommandError(
      "PROPOSAL_EXECUTION_UNSUPPORTED",
      "edit-plan skip decisions are not confirmed by production proposal v2",
      "edit-plan",
      "Choose a proposal option/schema that explicitly confirms source skips, or remove skip decisions.",
      stage,
    );
  }
}

function edlEntry(sourceId: string, start: number, end: number, outputOrder: number, reason: string): EdlEntry {
  return { source_id: sourceId, start, end, output_order: outputOrder, reason };
}

function renderEnrichedVideo(
  projectPath: string,
  cleanRenderPath: string,
  subtitlesPath: string,
  plan: EnrichmentPlanArtifact,
  assets: AssetManifestArtifact,
  output: { workDir: string; finalPath: string; storyboardPath: string },
  resolvedStoryboard?: EnrichmentStoryboard,
): string {
  const workDir = output.workDir;
  mkdirSync(workDir, { recursive: true });
  let current = cleanRenderPath;
  const finalPath = output.finalPath;

  const needsRecut = requiresHyperframesRecut(plan);
  if (needsRecut) {
    const visualPath = renderHyperframesRecut(projectPath, cleanRenderPath, subtitlesPath, plan, assets, workDir, output.storyboardPath, resolvedStoryboard);
    const withAudioPath = join(workDir, "recut-with-audio.mp4");
    attachCleanAudio(visualPath, cleanRenderPath, withAudioPath);
    current = withAudioPath;
  } else {
    const storyboardPublicDir = join(workDir, "storyboard-public");
    mkdirSync(storyboardPublicDir, { recursive: true });
    atomicWriteJson(output.storyboardPath, resolvedStoryboard ?? buildEnrichmentStoryboard(projectPath, cleanRenderPath, subtitlesPath, plan, assets, storyboardPublicDir));
  }

  for (const slot of plan.audio.music) {
    const asset = assetForSlot(assets, slot);
    const next = join(workDir, `${safeFileName(slot.id)}-music.mp4`);
    mixMusic(current, projectAssetPath(projectPath, asset.path), slot, next);
    current = next;
  }

  for (const item of plan.audio.sfx) {
    const next = join(workDir, `${safeFileName(item.id)}-sfx.mp4`);
    const sfxPath = item.asset_id ? projectAssetPath(projectPath, assetForSlot(assets, item).path) : getVendoredSfx(item.sfx_id!).path;
    mixSfx(current, sfxPath, item, next);
    current = next;
  }

  if (needsRecut) {
    ffmpeg(["-y", "-i", current, "-c", "copy", "-movflags", "+faststart", finalPath], "ffmpeg enriched final copy failed");
  } else {
    burnSubtitles(current, subtitlesPath, finalPath, workDir);
  }
  return finalPath;
}

function renderHyperframesRecut(
  projectPath: string,
  cleanRenderPath: string,
  subtitlesPath: string,
  plan: EnrichmentPlanArtifact,
  assets: AssetManifestArtifact,
  workDir: string,
  storyboardPath: string,
  resolvedStoryboard?: EnrichmentStoryboard,
): string {
  const workspace = resolveProjectOutputPath(projectPath, join(".hyperframes", "recut"), "HyperFrames render workspace");
  const publicDir = join(workspace, "public");
  const cardsDir = join(publicDir, "cards");
  mkdirSync(publicDir, { recursive: true });
  if (existsSync(cardsDir)) for (const name of readdirSync(cardsDir)) unlinkSync(join(cardsDir, name));
  mkdirSync(cardsDir, { recursive: true });
  mkdirSync(join(publicDir, "assets"), { recursive: true });
  copyFileSync(cleanRenderPath, join(publicDir, "clean.mp4"));
  if (resolvedStoryboard) {
    for (const asset of assets.assets) {
      const source = projectAssetPath(projectPath, asset.path);
      const target = join(publicDir, asset.path);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(source, target);
    }
  }
  installStoryboardRegistryElements(plan, publicDir);

  const storyboard = resolvedStoryboard ?? buildEnrichmentStoryboard(projectPath, cleanRenderPath, subtitlesPath, plan, assets, publicDir);
  atomicWriteJson(storyboardPath, storyboard);
  writeJson(join(workspace, "hyperframes.json"), hyperframesConfig());
  writeJson(join(publicDir, "hyperframes.json"), hyperframesConfig());
  for (const card of storyboard.cards) {
    const fragment = renderCardFragment(card, storyboard.profile.source_mode);
    assertScopedCardFragment(fragment, card.id);
    writeFileSync(join(cardsDir, `${safeFileName(card.id)}.html`), fragment);
  }
  writeFileSync(join(publicDir, "index.html"), renderRecutHtml(storyboard));

  runHyperframes(["lint", "."], publicDir, "hyperframes recut lint failed");
  runHyperframes(["validate", "."], publicDir, "hyperframes recut validate failed");
  const visualPath = join(workDir, "recut-visual.mp4");
  runHyperframes(["render", ".", "--format", "mp4", "--output", visualPath, "--fps", "30", "--quality", "draft"], publicDir, "hyperframes recut render failed", 240);
  if (!existsSync(visualPath)) throw new Error(`hyperframes recut render did not create ${visualPath}`);
  return visualPath;
}

export function buildEnrichmentStoryboard(
  projectPath: string,
  cleanRenderPath: string,
  subtitlesPath: string,
  plan: EnrichmentPlanArtifact,
  assets: AssetManifestArtifact,
  publicDir: string,
): EnrichmentStoryboard {
  const size = probeVideoSize(cleanRenderPath);
  const probe = probeMedia(cleanRenderPath);
  const cards: StoryboardCard[] = [];
  const elements = stageStoryboardElements(projectPath, assets, plan.elements, publicDir);
  const hyperframes = summarizeHyperframesBlocks(plan, assets);
  const referencedAssetIds = referencedEnrichmentAssetIds(plan);
  return {
    version: "1.1",
    canvas: {
      width: size.width,
      height: size.height,
      aspect_ratio: resolveCanvasAspectRatio(plan.profile.aspect_ratio, size.width, size.height),
    },
    clean_video: {
      path: ".hyperframes/recut/public/clean.mp4",
      duration_seconds: probe.duration_seconds,
    },
    profile: plan.profile,
    dependencies: hyperframes.cdn_dependencies,
    block_usage: cards.map((card) => {
      const block = getHyperframesCatalogEntry(card.block_id);
      if (!block) throw new Error(`unknown HyperFrames block id: ${card.block_id}`);
      return {
        card_id: card.id,
        block_id: card.block_id,
        source: block.source,
        visual_role: block.visual_role,
        template_family: block.template_family,
        dependencies: [...block.dependencies],
      };
    }),
    element_usage: summarizeHyperframesElements(plan),
    captions: (() => {
      const captionPlan = compiledCaptionPlan(plan);
      return { ...captionPlan, cues: captionPlan.enabled && existsSync(subtitlesPath) ? parseSrtCues(readFileSync(subtitlesPath, "utf8")) : [] };
    })(),
    qa_checks: buildQaChecks(projectPath, plan, assets),
    asset_summary: summarizeAssets(projectPath, {
      assets: assets.assets.filter((asset) => referencedAssetIds.has(asset.id)),
    }),
    cards,
    elements,
    music: plan.audio.music,
  };
}

export function resolveRenderContractStoryboard(input: {
  projectPath: string;
  width: number;
  height: number;
  durationSeconds: number;
  captions: Array<{ start: number; end: number; text: string }>;
  plan: EnrichmentPlanArtifact;
  assets: AssetManifestArtifact;
  bundlePaths: Record<string, string>;
}): EnrichmentStoryboard {
  const { projectPath, width, height, durationSeconds, captions, plan, assets, bundlePaths } = input;
  const cards: StoryboardCard[] = [];
  const elements = plan.elements.map((element): StoryboardElement => {
    const catalogType = vendoredElementType(element);
    const catalog = catalogType ? getVendoredElement(element.element_id, catalogType) : undefined;
    const adapter = catalog ? adapterForVendoredElement(catalog) : adapterForElement(element);
    const resolved: StoryboardElement = {
      ...element,
      catalog_title: catalog?.title ?? element.element_id,
      renderable: (catalog?.renderable ?? false) || adapter.render_strategy !== "guidance_only" || isAssetElement(element),
      guidance_only: (catalog?.guidance_only ?? false) && adapter.render_strategy === "guidance_only",
      adapter,
    };
    if (element.element_type === "registry_block" && adapter.render_strategy === "native_composition") {
      const item = loadVendoredRegistryItem(element.element_id, "hyperframes:block");
      resolved.composition_src = item.files.find((file) => file.type === "hyperframes:composition")?.target;
    }
    if (isVisualAssetElement(element) && element.asset_id) resolved.asset_path = requiredBundleAssetPath(bundlePaths, element.asset_id);
    return resolved;
  });
  const hyperframes = summarizeHyperframesBlocks(plan, assets);
  const referencedAssetIds = referencedEnrichmentAssetIds(plan);
  return {
    version: "1.1",
    canvas: { width, height, aspect_ratio: resolveCanvasAspectRatio(plan.profile.aspect_ratio, width, height) },
    clean_video: { path: ".hyperframes/recut/public/clean.mp4", duration_seconds: durationSeconds },
    profile: plan.profile,
    dependencies: hyperframes.cdn_dependencies,
    block_usage: cards.map((card) => {
      const block = getHyperframesCatalogEntry(card.block_id)!;
      return { card_id: card.id, block_id: card.block_id, source: block.source, visual_role: block.visual_role, template_family: block.template_family, dependencies: [...block.dependencies] };
    }),
    element_usage: summarizeHyperframesElements(plan),
    captions: (() => {
      const captionPlan = compiledCaptionPlan(plan);
      return { ...captionPlan, cues: captionPlan.enabled ? captions : [] };
    })(),
    qa_checks: buildQaChecks(projectPath, plan, assets).map((check) => ({
      ...check,
      ...(check.asset_id ? { asset_path: requiredBundleAssetPath(bundlePaths, check.asset_id) } : {}),
    })),
    asset_summary: assets.assets.filter((asset) => referencedAssetIds.has(asset.id)).map((asset) => ({
      id: asset.id,
      path: requiredBundleAssetPath(bundlePaths, asset.id),
      type: asset.type,
      source: asset.source,
      provenance: asset.provenance,
      provider: asset.provider,
      license: asset.license,
      source_url: asset.source_url,
      runtime_dependencies: asset.runtime_dependencies,
      used_by: [],
      exists: true,
    })),
    cards,
    elements,
    music: plan.audio.music,
  };
}

function requiredBundleAssetPath(paths: Record<string, string>, assetId: string): string {
  const path = paths[assetId];
  if (!path) throw new Error(`missing bundled path for referenced asset ${assetId}`);
  return path;
}

export function executeResolvedRenderPlan(input: {
  runRoot: string;
  timeline: EdlArtifact;
  sourcePaths: Record<string, string>;
  captions: Array<{ start: number; end: number; text: string }>;
  output: { filename: string; width: number; height: number; fps: number };
  sourceHasAudio: Record<string, boolean>;
  durationToleranceSeconds: number;
  plan?: EnrichmentPlanArtifact;
  assets?: AssetManifestArtifact;
  storyboard?: EnrichmentStoryboard;
}): { outputPath: string; cleanPath: string; subtitlesPath: string; storyboardPath?: string } {
  const { runRoot } = input;
  mkdirSync(runRoot, { recursive: true });
  const workDir = join(runRoot, ".work");
  mkdirSync(workDir, { recursive: true });
  const cleanPath = join(workDir, "clean.mp4");
  const frameSchedule = compileOutputFrameSchedule(input.timeline.entries, input.output.fps);
  renderResolvedEdl(input.timeline, input.sourcePaths, input.sourceHasAudio, cleanPath, input.output, frameSchedule);
  const subtitlesPath = join(workDir, "subtitles.srt");
  atomicWriteText(subtitlesPath, renderCaptionCuesSrt(input.captions));
  const outputPath = join(runRoot, input.output.filename);
  let storyboardPath: string | undefined;
  if (input.plan) {
    if (!input.assets || !input.storyboard) throw commandError("CONTRACT_INVALID", "resolved enrichment requires frozen assets and storyboard");
    storyboardPath = join(workDir, "storyboard.json");
    renderEnrichedVideo(runRoot, cleanPath, subtitlesPath, input.plan, input.assets, { workDir, finalPath: outputPath, storyboardPath }, input.storyboard);
  } else if (input.captions.length === 0) {
    copyFileSync(cleanPath, outputPath);
  } else {
    burnSubtitles(cleanPath, subtitlesPath, outputPath, workDir);
  }
  assertStrictOutputTiming(outputPath, frameSchedule, input.durationToleranceSeconds);
  return { outputPath, cleanPath, subtitlesPath, ...(storyboardPath ? { storyboardPath } : {}) };
}

function renderCaptionCuesSrt(cues: Array<{ start: number; end: number; text: string }>): string {
  return cues.map((cue, index) => `${index + 1}\n${srtTime(cue.start)} --> ${srtTime(cue.end)}\n${cue.text}\n`).join("\n");
}

function renderResolvedEdl(
  edl: EdlArtifact,
  sourcePaths: Record<string, string>,
  sourceHasAudio: Record<string, boolean>,
  outputPath: string,
  output: { width: number; height: number; fps: number },
  schedule: OutputFrameSchedule,
): void {
  if (!commandExists("ffmpeg")) throw commandError("RENDER_PREFLIGHT_FAILED", "ffmpeg not found for strict render");
  const workDir = dirname(outputPath);
  const entries = [...edl.entries].sort((a, b) => a.output_order - b.output_order);
  const args: string[] = ["-y"];
  const filters: string[] = [];
  for (const [index, entry] of entries.entries()) {
    const sourcePath = sourcePaths[entry.source_id];
    if (!sourcePath) throw commandError("SOURCE_BINDING_MISSING", `missing bound source ${entry.source_id}`);
    args.push("-ss", String(entry.start), "-t", String(entry.end - entry.start), "-i", sourcePath);
    const segment = schedule.segments[index]!;
    filters.push(`[${index}:v:0]setpts=PTS-STARTPTS,scale=${output.width}:${output.height}:force_original_aspect_ratio=decrease,pad=${output.width}:${output.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${output.fps},tpad=stop_mode=clone:stop=-1,trim=end_frame=${segment.frame_count},setpts=N/${output.fps}/TB,format=yuv420p[v${index}]`);
    filters.push(sourceHasAudio[entry.source_id]
      ? `[${index}:a:0]asetpts=PTS-STARTPTS,aresample=${schedule.audio_sample_rate}:async=0:first_pts=0,aformat=sample_rates=${schedule.audio_sample_rate}:channel_layouts=stereo,apad,atrim=end_sample=${segment.audio_sample_count},asetpts=N/SR/TB[a${index}]`
      : `anullsrc=r=${schedule.audio_sample_rate}:cl=stereo,atrim=end_sample=${segment.audio_sample_count},asetpts=N/SR/TB[a${index}]`);
  }
  filters.push(`${entries.map((_, index) => `[v${index}][a${index}]`).join("")}concat=n=${entries.length}:v=1:a=1[v][a]`);
  const filterPath = join(workDir, "strict-render.ffmpeg");
  writeFileSync(filterPath, filters.join(";\n") + "\n");
  args.push("-filter_complex_threads", "1", "-filter_complex_script", filterPath, "-map", "[v]", "-map", "[a]", "-frames:v", String(schedule.total_frames), "-c:v", "libx264", "-preset", "medium", "-pix_fmt", "yuv420p", "-r", String(output.fps), "-vsync", "cfr", "-c:a", "aac", "-ar", String(schedule.audio_sample_rate), "-ac", "2", "-movflags", "+faststart", outputPath);
  const result = spawnSync("ffmpeg", args, { encoding: "utf8" });
  if (result.status !== 0) throw commandError("CONTRACT_RENDER_FAILED", `strict timeline render failed: ${result.stderr || result.stdout}`);
}

function assertStrictOutputTiming(path: string, schedule: OutputFrameSchedule, tolerance: number): void {
  const timing = probeStrictOutputTiming(path);
  const delta = Math.abs(timing.container_duration_seconds - schedule.expected_duration_seconds);
  if (timing.video_frame_count !== schedule.total_frames || Math.abs(parseFrameRate(timing.avg_frame_rate) - schedule.fps) > 0.001 || delta > tolerance) {
    throw commandError("RENDER_OUTPUT_INVALID", `strict output timing mismatch: frames expected=${schedule.total_frames} actual=${timing.video_frame_count}; duration expected=${schedule.expected_duration_seconds.toFixed(6)}s actual=${timing.container_duration_seconds.toFixed(6)}s delta=${delta.toFixed(6)}s tolerance=${tolerance.toFixed(6)}s`);
  }
}

function installStoryboardRegistryElements(plan: EnrichmentPlanArtifact, publicDir: string): void {
  const registryElements = plan.elements.filter(needsInstalledRegistryElement);
  const installed = new Set<string>();
  for (const element of registryElements) {
    const registryType = element.element_type === "registry_block" ? "hyperframes:block" : "hyperframes:component";
    const key = `${registryType}:${element.element_id}`;
    if (!installed.has(key)) {
      installVendoredRegistryItem(element.element_id, publicDir, registryType);
      installed.add(key);
    }
    adaptInstalledRegistryElement(element, publicDir);
  }
}

function needsInstalledRegistryElement(element: EnrichmentElement): boolean {
  const adapter = adapterForPlanElement(element);
  if (element.element_type === "registry_block") return adapter.render_strategy === "native_composition";
  if (element.element_type === "registry_component") return adapter.render_strategy === "component_anchor_chip";
  return false;
}

function stageStoryboardElements(projectPath: string, assets: AssetManifestArtifact, elements: EnrichmentElement[], publicDir: string): StoryboardElement[] {
  return elements.map((element) => {
    const catalogType = vendoredElementType(element);
    const catalog = catalogType ? getVendoredElement(element.sfx_id ?? element.element_id, catalogType) : undefined;
    const adapter = catalog ? adapterForVendoredElement(catalog) : adapterForElement(element);
    const renderable = (catalog?.renderable ?? false) || adapter.render_strategy !== "guidance_only" || isAssetElement(element);
    const guidanceOnly = (catalog?.guidance_only ?? false) && adapter.render_strategy === "guidance_only";
    const storyboardElement: StoryboardElement = {
      ...element,
      catalog_title: catalog?.title ?? element.element_id,
      renderable,
      guidance_only: guidanceOnly,
      adapter,
    };
    if (element.element_type === "registry_block") {
      const item = loadVendoredRegistryItem(element.element_id, "hyperframes:block");
      if (adapter.render_strategy === "native_composition") storyboardElement.composition_src = item.files.find((file) => file.type === "hyperframes:composition")?.target;
    }
    if (element.element_type === "registry_component") {
      const item = loadVendoredRegistryItem(element.element_id, "hyperframes:component");
      const snippetTarget = item.files.find((file) => file.type === "hyperframes:snippet")?.target;
      if (snippetTarget && existsSync(join(publicDir, snippetTarget)) && adapter.render_strategy !== "component_caption") storyboardElement.component_html = readFileSync(join(publicDir, snippetTarget), "utf8");
    }
    if (isVisualAssetElement(element)) {
      const asset = assetForSlot(assets, element);
      const stagedName = `${safeFileName(asset.id)}${extname(asset.path) || ".asset"}`;
      copyFileSync(projectAssetPath(projectPath, asset.path), join(publicDir, "assets", stagedName));
      storyboardElement.asset_path = `assets/${stagedName}`;
    }
    return storyboardElement;
  });
}

function adaptInstalledRegistryElement(element: EnrichmentElement, publicDir: string): void {
  const adapter = adapterForPlanElement(element);
  if (element.element_type !== "registry_block" || adapter.render_strategy !== "native_composition") return;
  const item = loadVendoredRegistryItem(element.element_id, "hyperframes:block");
  for (const file of item.files.filter((entry) => entry.type === "hyperframes:composition")) {
    const path = join(publicDir, file.target);
    if (!existsSync(path)) continue;
    writeFileSync(path, injectElementParams(readFileSync(path, "utf8"), element, adapter));
  }
}

function injectElementParams(html: string, element: EnrichmentElement, adapter: HyperframesElementAdapter): string {
  const title = elementParamText(element, "title") ?? elementParamText(element, "text") ?? " ";
  const subtitle = elementParamText(element, "subtitle") ?? elementParamText(element, "detail") ?? " ";
  const detail = elementParamText(element, "detail") ?? subtitle;
  const username = elementParamText(element, "username") ?? "creator";
  let output = html
    .replaceAll("Dr. Maya Chen", title)
    .replaceAll("Host · Neuroscientist", subtitle)
    .replaceAll("Prompt to replace this title", title)
    .replaceAll("Prompt to change this title to whatever you want", title)
    .replaceAll("Prompt to change this body text, the app icon, and the app name to match your content.", detail)
    .replaceAll("Prompt to change this body text, the subreddit, username, and vote count to match your\n          content.", detail)
    .replaceAll("Prompt to change this body text, the subreddit, username, and vote count to match your content.", detail)
    .replaceAll("u/placeholder_user", `u/${username}`)
    .replaceAll("r/hyperframes", `r/${username}`);
  if (adapter.family === "app_showcase") output = output.replaceAll("HyperFrames", title);
  return output;
}

function resolveStoryboardCard(card: EnrichmentCard & { asset_path?: string }, sourceMode: EnrichmentSourceMode): StoryboardCard {
  const blockId = assertRenderableHyperframesBlockForCard(card.block_id ?? defaultHyperframesBlockForCard(card.kind, sourceMode), card.kind, sourceMode, `${card.id}.block_id`);
  const block = getHyperframesCatalogEntry(blockId);
  if (!block) throw new Error(`unknown HyperFrames block id: ${blockId}`);
  return { ...card, block_id: blockId, template_family: block.template_family, motion: [...block.motion] };
}

function requiredHyperframesDependency(id: string) {
  const dependency = getHyperframesDependency(id);
  if (!dependency) throw new Error(`unknown HyperFrames dependency id: ${id}`);
  return dependency;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values.map((value) => Number(value.toFixed(3))))];
}

function stageStoryboardAssets(
  projectPath: string,
  assets: AssetManifestArtifact,
  cards: EnrichmentCard[],
  publicDir: string,
): Array<EnrichmentCard & { asset_path?: string }> {
  return cards.map((card) => {
    if (!card.asset_id) return card;
    const asset = assetForSlot(assets, card);
    const stagedName = `${safeFileName(asset.id)}${extname(asset.path) || ".asset"}`;
    copyFileSync(projectAssetPath(projectPath, asset.path), join(publicDir, "assets", stagedName));
    return { ...card, asset_path: `assets/${stagedName}` };
  });
}

function resolveCanvasAspectRatio(value: EnrichmentPlanArtifact["profile"]["aspect_ratio"], width: number, height: number): "16:9" | "9:16" | "4:5" {
  if (value !== "source") return value;
  const ratio = width / height;
  if (ratio >= 1.45) return "16:9";
  if (ratio <= 0.7) return "9:16";
  return "4:5";
}

function hyperframesConfig(): Record<string, unknown> {
  return {
    paths: { blocks: "compositions", components: "compositions/components", assets: "assets" },
  };
}

function attachCleanAudio(visualPath: string, cleanRenderPath: string, outputPath: string): void {
  ffmpeg(
    ["-y", "-i", visualPath, "-i", cleanRenderPath, "-map", "0:v:0", "-map", "1:a?", "-c:v", "copy", "-c:a", "aac", "-shortest", "-movflags", "+faststart", outputPath],
    "ffmpeg clean audio attach failed",
  );
}

function assetForSlot(assets: AssetManifestArtifact, slot: { id: string; asset_id?: string }) {
  const asset = assets.assets.find((item) => item.id === slot.asset_id);
  if (!asset) throw new Error(`missing asset for slot ${slot.id}`);
  return asset;
}

function validateVisualAssetForRender(projectPath: string, element: EnrichmentElement, asset: AssetManifestArtifact["assets"][number]): void {
  if (!isVisualAssetManifestType(asset.type)) throw new Error(`${element.id}: visual_asset ${asset.id} must have a visual asset type`);
  const provenanceOk = asset.provenance === "visual-acquisition" || asset.provenance === "asset_usage_plan" || asset.source === "agent_generated" || asset.source === "user";
  if (!provenanceOk) throw new Error(`${element.id}: visual_asset ${asset.id} must have explicit manifest provenance`);
  if (asset.source_url && !asset.provider) throw new Error(`${element.id}: visual_asset ${asset.id} has source_url but no provider`);
  const ext = extname(asset.path).toLowerCase();
  if (!isSupportedVisualExt(ext)) throw assetUsageError("unsupported_visual_asset_format", `unsupported_visual_asset_format: ${asset.path}`);
  if (ext === ".svg") assertSafeSvgAsset(projectAssetPath(projectPath, asset.path), asset.path);
  if ((asset.type === "animated_icon" || asset.type === "lottie" || asset.type === "sticker") && !asset.path.endsWith(".json") && !asset.path.endsWith(".lottie") && !asset.path.endsWith(".svg")) {
    throw assetUsageError("unsupported_visual_asset_format", `${element.id}: animated visual asset ${asset.id} must be .json, .lottie, or .svg`);
  }
}

function isVisualAssetManifestType(value: unknown): boolean {
  return value === "icon" || value === "animated_icon" || value === "lottie" || value === "ui_component" || value === "template" || value === "sticker" || value === "broll" || value === "image";
}

function renderRecutHtml(storyboard: EnrichmentStoryboard): string {
  const duration = storyboard.clean_video.duration_seconds;
  const sourceClass = `source-${storyboard.profile.source_mode}`;
  const cards = storyboard.cards
    .map((card, index) => {
      const domId = `card-${index}-${safeFileName(card.id)}`;
      const inlineStyle = cardInlineStyle(card, storyboard.profile.source_mode);
      const styleAttr = inlineStyle ? ` style="${inlineStyle}"` : "";
      return `<section
        id="${domId}"
        class="clip card-wrap zone-${card.zone} style-${card.style} frame-${card.frame} kind-${card.kind}"
        data-card-id="${escapeHtml(card.id)}"
        data-card-kind="${card.kind}"
        data-block-id="${escapeHtml(card.block_id)}"
        data-template-family="${escapeHtml(card.template_family)}"
        data-motion="${escapeHtml(card.motion.join(","))}"
        data-start="${formatSeconds(card.start)}"
        data-duration="${formatSeconds(card.end - card.start)}"
        data-track-index="${10 + index}"
        data-card-start="${formatSeconds(card.start)}"
        data-card-end="${formatSeconds(card.end)}"
      ${styleAttr}>${renderCardFragment(card, storyboard.profile.source_mode)}</section>`;
    })
    .join("\n");
  const registryBlocks = storyboard.elements
    .filter((element) => element.element_type === "registry_block" && element.composition_src)
    .map((element, index) => {
      const inlineStyle = elementInlineStyle(element, storyboard.profile.source_mode);
      const styleAttr = inlineStyle ? ` style="${inlineStyle}"` : "";
      return `<section
        id="element-${index}-${safeFileName(element.id)}"
        class="clip hf-registry-block zone-${element.zone ?? "center"}"
        data-element-id="${escapeHtml(element.id)}"
        data-element-type="${element.element_type}"
        data-vendored-element-id="${escapeHtml(element.element_id)}"
        data-adapter-family="${element.adapter.family}"
        data-render-strategy="${element.adapter.render_strategy}"
        data-composition-id="${escapeHtml(element.element_id)}"
        data-composition-src="${escapeHtml(element.composition_src!)}"
        data-start="${formatSeconds(element.start)}"
        data-duration="${formatSeconds(element.end - element.start)}"
        data-track-index="${40 + index}"
      ${styleAttr}></section>`;
    })
    .join("\n");
  const registryComponents = storyboard.elements
    .filter((element) => element.element_type === "registry_component" && (element.component_html || element.adapter.render_strategy === "component_caption"))
    .map((element, index) => {
      const inlineStyle = elementInlineStyle(element, storyboard.profile.source_mode);
      const styleAttr = inlineStyle ? ` style="${inlineStyle}"` : "";
      const label = captionComponentLabel(element, storyboard);
      const isCaption = element.adapter.render_strategy === "component_caption";
      const captionClass = isCaption ? " caption-component-host" : "";
      const zone = isCaption ? "caption" : element.zone ?? "lower_third";
      return `<section
        id="component-${index}-${safeFileName(element.id)}"
        class="clip hf-registry-component-host${captionClass} shimmer-sweep-target zone-${zone}"
        data-element-id="${escapeHtml(element.id)}"
        data-element-type="${element.element_type}"
        data-vendored-element-id="${escapeHtml(element.element_id)}"
        data-adapter-family="${element.adapter.family}"
        data-render-strategy="${element.adapter.render_strategy}"
        data-start="${formatSeconds(element.start)}"
        data-duration="${formatSeconds(element.end - element.start)}"
        data-track-index="${80 + index}"
        data-component-start="${formatSeconds(element.start)}"
        data-component-end="${formatSeconds(element.end)}"
      ${styleAttr}>
        <span>${escapeHtml(label)}</span>
        ${element.component_html ?? ""}
      </section>`;
    })
    .join("\n");
  const cliOverlays = storyboard.elements
    .filter((element) => element.adapter.render_strategy === "cli_overlay" || (element.adapter.render_strategy === "asset_overlay" && isVisualAssetElement(element)))
    .map((element, index) => {
      const inlineStyle = elementInlineStyle(element, storyboard.profile.source_mode);
      const styleAttr = inlineStyle ? ` style="${inlineStyle}"` : "";
      return `<section
        id="overlay-${index}-${safeFileName(element.id)}"
        class="clip cli-overlay adapter-${element.adapter.family} zone-${element.zone ?? element.adapter.default_zone}"
        data-element-id="${escapeHtml(element.id)}"
        data-element-type="${element.element_type}"
        data-vendored-element-id="${escapeHtml(element.element_id)}"
        data-adapter-family="${element.adapter.family}"
        data-render-strategy="${element.adapter.render_strategy}"
        data-start="${formatSeconds(element.start)}"
        data-duration="${formatSeconds(element.end - element.start)}"
        data-track-index="${120 + index}"
        data-overlay-start="${formatSeconds(element.start)}"
        data-overlay-end="${formatSeconds(element.end)}"
      ${styleAttr}>${renderCliOverlayFragment(element)}</section>`;
    })
    .join("\n");
  const emphasis = filteredCaptionEmphasis(storyboard)
    .map(
      (item, index) => `<div
        id="caption-emphasis-${index}"
        class="clip emphasis-chip"
        data-start="${formatSeconds(item.start)}"
        data-duration="${formatSeconds(item.end - item.start)}"
        data-track-index="${180 + index}"
        data-emphasis-start="${formatSeconds(item.start)}"
        data-emphasis-end="${formatSeconds(item.end)}"
      >${escapeHtml(item.text)}</div>`,
    )
    .join("\n");
  const cuesJson = scriptJson(storyboard.captions.cues);
  const dependencyTags = renderDependencyTags(storyboard.dependencies);
  const lottieRuntimeScript = renderLottieRuntimeScript(storyboard);
  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${storyboard.canvas.width}, height=${storyboard.canvas.height}" />
    <title>koubo-clip recut</title>
    ${dependencyTags}
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; width: ${storyboard.canvas.width}px; height: ${storyboard.canvas.height}px; overflow: hidden; background: #111; font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif; }
      #root { position: relative; width: ${storyboard.canvas.width}px; height: ${storyboard.canvas.height}px; overflow: hidden; isolation: isolate; background: #111; }
      #clean-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; background: #111; }
      .card-wrap { position: absolute; z-index: 4; opacity: 0; will-change: opacity, transform; color: #17201b; }
      .hf-registry-block { position: absolute; z-index: 5; opacity: 1; will-change: opacity, transform; }
      .hf-registry-component-host { position: absolute; z-index: 6; opacity: 0; will-change: opacity, transform; width: max-content; max-width: min(560px, 44vw); padding: 8px 12px; border-radius: 999px; color: #fff; font-size: clamp(15px, 1.8vw, 28px); line-height: 1.1; font-weight: 850; background: rgba(10, 14, 18, 0.46); border: 1px solid rgba(255,255,255,0.16); text-shadow: 0 2px 10px rgba(0,0,0,0.28); backdrop-filter: blur(2px); }
      .caption-component-host { left:50%; right:auto; bottom:12%; translate:-50% 0; width:max-content; max-width:min(820px, calc(100% - 160px)); min-width:0; padding:10px 16px; border-radius:14px; background:rgba(12,16,20,0.28); color:#fff; border:1px solid rgba(255,255,255,0.14); text-align:center; white-space:normal; overflow-wrap:anywhere; }
      .caption-component-host span { position:relative; z-index:1; }
      .caption-component-host span::before { content:""; position:absolute; z-index:-1; left:-6px; right:-6px; bottom:0.08em; height:0.42em; border-radius:999px; background:rgba(250,204,21,0.72); transform:scaleX(var(--caption-sweep, 0)); transform-origin:left center; }
      .cli-overlay { position:absolute; z-index:7; opacity:0; will-change:opacity, transform; color:#fff; }
      .card-inner { position: relative; overflow: hidden; width: 100%; height: 100%; padding: clamp(18px, 3.4vw, 54px); display: grid; gap: clamp(10px, 1.4vw, 22px); align-content: center; background: rgba(255, 254, 247, 0.94); border: 1px solid rgba(18, 25, 22, 0.16); box-shadow: 0 24px 60px rgba(12, 18, 16, 0.18); }
      .frame-clean .card-inner { border-radius: 14px; }
      .frame-hairline .card-inner { border-radius: 10px; border-color: rgba(18, 25, 22, 0.34); box-shadow: 0 18px 42px rgba(12, 18, 16, 0.12); }
      .frame-polaroid .card-inner { border: 10px solid #fffdf6; border-bottom-width: 34px; border-radius: 4px; box-shadow: 0 20px 48px rgba(12, 18, 16, 0.2); }
      .style-whiteboard .card-inner { background: rgba(255, 254, 247, 0.95); color: #162018; }
      .style-audit .card-inner { background: rgba(250, 249, 242, 0.96); color: #1b1c1a; border-left: 6px solid #2b5c88; }
      .style-minimal .card-inner, .style-swiss .card-inner, .style-editorial .card-inner { background: rgba(255, 255, 255, 0.94); color: #101214; }
      .style-terminal .card-inner { background: rgba(14, 17, 16, 0.9); color: #e8f6e3; border-color: rgba(146, 240, 164, 0.32); }
      .style-xhs .card-inner { background: rgba(255, 251, 253, 0.96); color: #161214; border-color: rgba(245, 96, 129, 0.26); }
      .hf-lower-third { position: relative; min-width: min(620px, 86vw); display: grid; grid-template-columns: 14px 1fr; overflow: hidden; border-radius: 18px; box-shadow: 0 18px 54px rgba(8, 12, 18, 0.20); background: rgba(255,255,255,0.96); }
      .hf-lower-third .hf-accent { background: #ff5a36; transform-origin: 50% 0%; }
      .hf-lower-third .hf-body { padding: clamp(18px,2.4vw,34px) clamp(24px,3vw,44px); display: grid; gap: 8px; }
      .hf-lower-third .card-title { font-size: clamp(28px, 4vw, 58px); }
      .hf-lower-third .card-detail { font-size: clamp(15px, 1.7vw, 26px); }
      .template-lower_third_underline .hf-lower-third { grid-template-columns: 1fr; background: transparent; box-shadow: none; color: #fff; }
      .template-lower_third_underline .hf-accent { height: 8px; width: 86%; align-self: end; background: #46e5b7; }
      .template-lower_third_underline .hf-body { padding-left: 0; text-shadow: 0 4px 24px rgba(0,0,0,0.32); }
      .template-lower_third_pill .hf-lower-third { grid-template-columns: 1fr; border-radius: 999px; background: rgba(255,255,255,0.94); }
      .template-lower_third_bold .hf-lower-third, .template-lower_third_stack .hf-lower-third { background: #141518; color: #fff; border-radius: 10px; }
      .template-lower_third_bold .hf-accent, .template-lower_third_stack .hf-accent { background: #ffd23f; }
      .template-lower_third_mask .hf-lower-third { grid-template-columns: 1fr; background: transparent; box-shadow: none; color: #fff; }
      .template-lower_third_side_rule .hf-lower-third { grid-template-columns: 8px 1fr; background: transparent; box-shadow: none; color: #fff; border-radius: 0; }
      .template-follow_card_youtube .hf-lower-third, .template-follow_card_instagram .hf-lower-third, .template-follow_card_tiktok .hf-lower-third { grid-template-columns: 1fr auto; align-items: center; background: rgba(18,18,18,0.92); color: #fff; }
      .hf-follow-button { align-self: center; margin-right: 18px; padding: 12px 20px; border-radius: 999px; background: #fff; color: #111; font-weight: 900; }
      .zone-full_frame { inset: 8%; display: grid; place-items: center; }
      .zone-center { left: 12%; right: 12%; top: 28%; min-height: 30%; }
      .zone-upper_third { left: 8%; right: 8%; top: 8%; min-height: 20%; }
      .zone-lower_third { left: 8%; right: 8%; bottom: 18%; min-height: 18%; }
      .zone-left_panel { left: 5%; top: 14%; bottom: 24%; width: 38%; }
      .zone-right_panel { right: 5%; top: 14%; bottom: 24%; width: 38%; }
      .card-kicker { font-size: clamp(12px, 1.5vw, 22px); line-height: 1.1; font-weight: 800; letter-spacing: 0; text-transform: uppercase; color: #2b5c88; }
      .card-title { margin: 0; font-size: clamp(24px, 4.2vw, 78px); line-height: 1.02; font-weight: 850; letter-spacing: 0; text-wrap: balance; }
      .kind-lower_third .card-title, .kind-quote .card-title { font-size: clamp(22px, 3.2vw, 54px); }
      .card-detail { margin: 0; max-width: 32em; font-size: clamp(15px, 2vw, 31px); line-height: 1.35; color: rgba(23, 32, 27, 0.78); }
      .style-terminal .card-detail { color: rgba(232, 246, 227, 0.72); }
      .card-image { width: 100%; max-height: 52vh; object-fit: contain; border-radius: 10px; background: rgba(255,255,255,0.72); }
      .flow { width: 100%; height: clamp(110px, 18vw, 210px); }
      .flow-arrow { stroke: #2b5c88; transform-box: fill-box; transform-origin: left center; }
      .flow-node { fill: #fffef7; stroke: #17201b; transform-box: fill-box; transform-origin: center; }
      .flow text { font: 700 16px system-ui, sans-serif; fill: #17201b; }
      .caption-rail { position: absolute; left: 8%; right: 8%; bottom: 5%; z-index: 8; min-height: 58px; display: grid; place-items: center; padding: 12px 20px; border-radius: 999px; background: rgba(16, 20, 18, 0.74); color: #fff; box-shadow: 0 16px 40px rgba(0,0,0,0.18); opacity: 0; will-change: opacity, transform; }
      #caption-text { max-width: 100%; font-size: clamp(18px, 2.7vw, 38px); line-height: 1.15; font-weight: 800; text-align: center; letter-spacing: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .emphasis-chip { position: absolute; left: 50%; bottom: 15%; z-index: 7; opacity: 0; padding: 10px 18px; border-radius: 999px; color: #132017; background: rgba(255, 243, 176, 0.96); border: 1px solid rgba(76, 63, 14, 0.18); box-shadow: 0 12px 34px rgba(20,18,10,0.16); font-weight: 850; font-size: clamp(16px, 2vw, 30px); will-change: opacity, transform; }
      .source-screen_recording .card-wrap, .source-mixed .card-wrap { color: #fff; }
      .source-screen_recording .zone-left_panel, .source-screen_recording .zone-right_panel, .source-mixed .zone-left_panel, .source-mixed .zone-right_panel { display: flex; align-items: center; }
      .source-screen_recording .caption-rail, .source-mixed .caption-rail { left: 50%; right: auto; bottom: 4.5%; width: max-content; min-width: min(360px, 42%); max-width: 72%; min-height: 44px; padding: 8px 16px; translate: -50% 0; background: rgba(12, 16, 20, 0.58); border: 1px solid rgba(255,255,255,0.12); box-shadow: 0 12px 30px rgba(0,0,0,0.16); }
      .source-screen_recording #caption-text, .source-mixed #caption-text { font-size: clamp(16px, 2.05vw, 30px); }
      .source-screen_recording .zone-lower_third, .source-mixed .zone-lower_third { left: 6%; right: auto; bottom: 18%; min-height: auto; width: max-content; max-width: min(440px, 42vw); }
      .source-screen_recording .screen-focus, .source-mixed .screen-focus { position: relative; width: 100%; height: 100%; color: #facc15; }
      .focus-corners { position: absolute; inset: 0; border: 2px solid rgba(250, 204, 21, 0.92); border-radius: 10px; background: rgba(250, 204, 21, 0.018); box-shadow: 0 0 0 1px rgba(12,14,18,0.18), 0 10px 28px rgba(250,204,21,0.10); transform-origin: center; }
      .focus-corners::before, .focus-corners::after { content: ""; position: absolute; width: 20%; height: 20%; border-color: #facc15; border-style: solid; }
      .focus-corners::before { left: -2px; top: -2px; border-width: 4px 0 0 4px; border-radius: 10px 0 0 0; }
      .focus-corners::after { right: -2px; bottom: -2px; border-width: 0 4px 4px 0; border-radius: 0 0 10px 0; }
      .focus-label { position: absolute; left: 0; bottom: calc(100% + 8px); max-width: min(320px, 34vw); padding: 6px 10px; border-radius: 999px; color: #fff; background: rgba(12, 16, 20, 0.62); border: 1px solid rgba(255,255,255,0.22); font-size: clamp(11px, 1.1vw, 15px); line-height: 1.1; font-weight: 800; box-shadow: 0 8px 20px rgba(0,0,0,0.14); backdrop-filter: blur(2px); }
      .focus-label .screen-title { font-size: clamp(12px, 1.2vw, 17px); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .focus-label .screen-detail { display: none; }
      .screen-callout, .screen-chip { position: relative; overflow: hidden; width: max-content; max-width: min(440px, 40vw); padding: 8px 12px; border: 1px solid rgba(255,255,255,0.18); border-left: 3px solid #facc15; border-radius: 12px; color: #fff; background: linear-gradient(90deg, rgba(10,14,18,0.48), rgba(10,14,18,0.24)); box-shadow: 0 8px 20px rgba(0,0,0,0.12); backdrop-filter: blur(2px); }
      .screen-code-callout { position: relative; overflow: hidden; width: min(520px, 40vw); padding: 9px 11px; border-radius: 12px; color: #d6e2f0; background: rgba(5,7,11,0.44); border: 1px solid rgba(88,166,255,0.24); box-shadow: 0 10px 24px rgba(0,0,0,0.14); backdrop-filter: blur(2px); }
      .screen-code-head { display:flex; align-items:center; gap:8px; margin-bottom:7px; color:#9fb3c8; font: 700 clamp(10px,1vw,13px)/1 "JetBrains Mono", monospace; }
      .screen-code-dot { width:7px; height:7px; border-radius:999px; background:#58a6ff; box-shadow:0 0 0 4px rgba(88,166,255,0.12); }
      .screen-code-line { position:relative; margin:0; padding:8px 10px 8px 14px; border-left:3px solid #58a6ff; border-radius:8px; background:rgba(88,166,255,0.13); font: 700 clamp(13px,1.45vw,22px)/1.25 "JetBrains Mono", monospace; white-space:pre-wrap; }
      .screen-code-line::after { content:""; position:absolute; inset:0; background:linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent); transform:translateX(var(--sweep-x, -120%)); }
      .adapter-code { width:min(560px,42vw); }
      .adapter-code .screen-code-callout { width:100%; }
      .adapter-screen_focus { color:#facc15; }
      .screen-callout > :not(.accent-sweep), .screen-chip > :not(.accent-sweep) { position: relative; z-index: 1; }
      .accent-sweep { position: absolute; inset: 0; z-index: 0; pointer-events: none; background: linear-gradient(100deg, transparent 0%, rgba(255,255,255,0.22) 42%, transparent 64%); transform: translateX(-120%); }
      .screen-chip { display: inline-flex; align-items: center; gap: 9px; max-width: min(440px, 42vw); border-left: 0; border-radius: 999px; padding: 7px 12px; background: linear-gradient(90deg, rgba(10,14,18,0.58), rgba(10,14,18,0.28)); }
      .screen-chip::before { content: ""; position: relative; z-index: 1; width: 7px; height: 7px; flex: 0 0 auto; border-radius: 999px; background: #facc15; box-shadow: 0 0 0 4px rgba(250,204,21,0.13); }
      .screen-kicker { margin-bottom: 4px; color: #facc15; font-size: clamp(10px, 1vw, 14px); line-height: 1; font-weight: 850; }
      .screen-title { margin: 0; font-size: clamp(15px, 1.7vw, 26px); line-height: 1.1; font-weight: 850; text-shadow: 0 2px 10px rgba(0,0,0,0.28); }
      .screen-detail { margin: 5px 0 0; font-size: clamp(12px, 1.25vw, 18px); line-height: 1.28; color: rgba(255,255,255,0.82); }
      .source-screen_recording .kind-flowchart .screen-callout, .source-mixed .kind-flowchart .screen-callout { background: rgba(10, 14, 18, 0.16); border-color: rgba(255,255,255,0.14); box-shadow: none; max-width: min(520px, 38vw); }
      .source-screen_recording .kind-image .screen-callout, .source-mixed .kind-image .screen-callout { padding: 8px; border-left-width: 1px; background: rgba(10,14,18,0.20); }
      .source-screen_recording .kind-image .card-inner, .source-mixed .kind-image .card-inner { min-width: 0; padding: 0; background: transparent; border: 0; backdrop-filter: none; }
      .source-screen_recording .card-title, .source-mixed .card-title { font-size: clamp(17px, 2.1vw, 34px); line-height: 1.08; text-shadow: 0 2px 10px rgba(0,0,0,0.32); }
      .source-screen_recording .kind-lower_third .card-title, .source-mixed .kind-lower_third .card-title { font-size: clamp(15px, 1.75vw, 26px); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .source-screen_recording .card-detail, .source-mixed .card-detail { font-size: clamp(13px, 1.5vw, 22px); color: rgba(255,255,255,0.84); }
      .source-screen_recording .card-kicker, .source-mixed .card-kicker { color: #ffda5c; font-size: clamp(10px, 1.1vw, 16px); }
      .source-screen_recording .card-image, .source-mixed .card-image { max-height: 30vh; background: transparent; border: 1px solid rgba(255,255,255,0.38); box-shadow: 0 14px 34px rgba(0,0,0,0.22); }
      .asset-overlay-card { position:relative; overflow:hidden; width:min(520px,38vw); padding:14px; border-radius:20px; color:#fff; background:rgba(13,18,26,0.72); border:1px solid rgba(255,255,255,0.16); box-shadow:0 20px 56px rgba(0,0,0,0.22); backdrop-filter:blur(6px); }
      .asset-overlay-image { display:block; width:100%; max-height:34vh; object-fit:contain; border-radius:14px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.14); }
      .visual-asset-card { width:max-content; min-width:min(300px,68vw); max-width:min(520px,76vw); padding:10px 14px; border-radius:20px; display:flex; align-items:center; gap:12px; background:rgba(12,16,20,0.52); }
      .visual-svg { width:clamp(58px,9vw,92px); height:clamp(58px,9vw,92px); flex:0 0 auto; margin:0; padding:12px; border-radius:20px; color:#111; background:rgba(255,255,255,0.92); }
      .asset-lottie { display:block; width:min(180px,18vw); height:min(180px,18vw); margin:auto; }
      .asset-overlay-copy { margin-top:10px; display:grid; gap:4px; min-width:0; }
      .visual-asset-card .asset-overlay-copy { margin-top:0; }
      .asset-overlay-card .screen-title { font-size:clamp(16px,1.9vw,30px); }
      .asset-overlay-card .screen-detail { margin:0; }
      .source-screen_recording .flow, .source-mixed .flow { height: clamp(74px, 10vw, 130px); }
      .source-screen_recording .flow-arrow, .source-mixed .flow-arrow { stroke: rgba(255, 218, 92, 0.95); }
      .source-screen_recording .flow-node, .source-mixed .flow-node { fill: rgba(10,14,18,0.30); stroke: rgba(255,255,255,0.52); }
      .source-screen_recording .flow text, .source-mixed .flow text { fill: #fff; font-size: 15px; }
      .cursor-ripple { position:absolute; left:50%; top:50%; width:18px; height:18px; margin:-9px 0 0 -9px; border-radius:999px; border:2px solid #facc15; box-shadow:0 0 0 0 rgba(250,204,21,0.32); opacity:0; }
      .keyword-glow { color:#fff7b1; text-shadow:0 0 16px rgba(250,204,21,0.34); }
      .social-card, .notification-card, .app-card { position:relative; overflow:hidden; width:min(680px,42vw); padding:24px; border-radius:22px; color:#fff; background:rgba(18,23,32,0.88); border:1px solid rgba(255,255,255,0.12); box-shadow:0 24px 70px rgba(0,0,0,0.24); }
      .notification-card { width:min(430px,36vw); padding:16px; border-radius:20px; background:rgba(30,30,30,0.78); backdrop-filter:blur(6px); }
      .social-meta { display:flex; align-items:center; gap:12px; margin-bottom:14px; color:rgba(255,255,255,0.72); font-weight:800; }
      .social-avatar { width:42px; height:42px; border-radius:999px; background:linear-gradient(135deg,#46e5b7,#58a6ff); }
      .app-card .card-image { max-height:36vh; border-radius:18px; border:0; background:rgba(255,255,255,0.08); }
    </style>
  </head>
  <body>
    <div id="root" class="${sourceClass}" data-source-mode="${storyboard.profile.source_mode}" data-composition-id="recut" data-start="0" data-duration="${formatSeconds(duration)}" data-width="${storyboard.canvas.width}" data-height="${storyboard.canvas.height}">
      <video id="clean-video" data-start="0" data-duration="${formatSeconds(duration)}" data-track-index="0" data-volume="0" src="clean.mp4" muted playsinline preload="auto"></video>
      ${registryBlocks}
      ${cards}
      ${registryComponents}
      ${cliOverlays}
      ${emphasis}
      <div id="caption-rail" class="clip caption-rail" data-start="0" data-duration="${formatSeconds(duration)}" data-track-index="200">
        <span id="caption-text"></span>
      </div>
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      const duration = ${JSON.stringify(duration)};
      const cues = ${cuesJson};
      const cards = Array.from(document.querySelectorAll("[data-card-start]")).map((el) => ({
        el,
        kind: el.getAttribute("data-card-kind"),
        start: Number(el.getAttribute("data-card-start")),
        end: Number(el.getAttribute("data-card-end"))
      }));
      const components = Array.from(document.querySelectorAll("[data-component-start]")).map((el) => ({
        el,
        start: Number(el.getAttribute("data-component-start")),
        end: Number(el.getAttribute("data-component-end"))
      }));
      const overlays = Array.from(document.querySelectorAll("[data-overlay-start]")).map((el) => ({
        el,
        family: el.getAttribute("data-adapter-family"),
        start: Number(el.getAttribute("data-overlay-start")),
        end: Number(el.getAttribute("data-overlay-end"))
      }));
      const emphasis = Array.from(document.querySelectorAll("[data-emphasis-start]")).map((el) => ({
        el,
        start: Number(el.getAttribute("data-emphasis-start")),
        end: Number(el.getAttribute("data-emphasis-end"))
      }));
      const rail = document.getElementById("caption-rail");
      const captionText = document.getElementById("caption-text");
      if (!window.gsap) throw new Error("allowlisted GSAP runtime failed to load");
      const motion = gsap.timeline({ paused: true, defaults: { duration: 0.38, ease: "power3.out" } });
      gsap.set(cards.map((card) => card.el), { autoAlpha: 0 });
      gsap.set(components.map((item) => item.el), { autoAlpha: 0, y: 10, scale: 0.98 });
      gsap.set(overlays.map((item) => item.el), { autoAlpha: 0, y: 10, scale: 0.98 });
      gsap.set(emphasis.map((item) => item.el), { autoAlpha: 0, y: 14 });
      const $ = (card, selector) => card.el.querySelector(selector);
      const $$ = (card, selector) => Array.from(card.el.querySelectorAll(selector));
      ${lottieRuntimeScript}
      const exitAt = (card) => Math.max(card.start, card.end - Math.min(0.28, Math.max(0.16, (card.end - card.start) * 0.18)));
      const sweep = (card) => {
        const el = $(card, ".accent-sweep");
        if (el) motion.fromTo(el, { xPercent: -120 }, { xPercent: 120, duration: 0.62, ease: "power2.out" }, card.start + 0.05);
      };
      function hide(card, vars = {}) {
        motion.to(card.el, { autoAlpha: 0, y: -6, scale: 0.99, duration: 0.22, ease: "power1.in", ...vars }, exitAt(card));
      }
      function animateLowerThird(card) {
        motion.fromTo(card.el, { autoAlpha: 0, x: -24, scale: 0.96 }, { autoAlpha: 1, x: 0, scale: 1, duration: 0.34, ease: "back.out(1.35)" }, card.start);
        sweep(card);
        hide(card, { x: -8, y: 0 });
      }
      function animateScreenFocus(card) {
        const corners = $(card, ".focus-corners");
        const label = $(card, ".focus-label");
        const ripple = $(card, ".cursor-ripple");
        if (corners) gsap.set(corners, { autoAlpha: 0, scale: 0.96 });
        if (label) gsap.set(label, { autoAlpha: 0, y: 8, scale: 0.98 });
        if (ripple) gsap.set(ripple, { autoAlpha: 0, scale: 0.4 });
        motion.fromTo(card.el, { autoAlpha: 0, scale: 1.01 }, { autoAlpha: 1, scale: 1, duration: 0.14, ease: "power2.out" }, card.start);
        if (corners) motion.to(corners, { autoAlpha: 1, scale: 1, duration: 0.34, ease: "power4.out" }, card.start + 0.02);
        if (label) motion.to(label, { autoAlpha: 1, y: 0, scale: 1, duration: 0.28, ease: "power3.out" }, card.start + 0.15);
        if (ripple) motion.to(ripple, { autoAlpha: 1, scale: 2.6, duration: 0.42, ease: "power2.out" }, card.start + 0.22).to(ripple, { autoAlpha: 0, duration: 0.18, ease: "power1.in" }, card.start + 0.52);
        if (corners) motion.to(corners, { scale: 1.018, duration: 0.32, repeat: 1, yoyo: true, ease: "sine.inOut" }, card.start + 0.48);
        hide(card, { y: 0, scale: 1.004 });
      }
      function animateFlow(card) {
        const nodes = $$(card, ".flow-node");
        const arrows = $$(card, ".flow-arrow");
        gsap.set(nodes, { autoAlpha: 0, scale: 0.88, transformOrigin: "50% 50%" });
        gsap.set(arrows, { autoAlpha: 0, scaleX: 0, transformOrigin: "left center" });
        motion.fromTo(card.el, { autoAlpha: 0, x: 18, y: 8, scale: 0.97 }, { autoAlpha: 1, x: 0, y: 0, scale: 1, duration: 0.36, ease: "power3.out" }, card.start);
        sweep(card);
        motion.to(nodes, { autoAlpha: 1, scale: 1, stagger: 0.1, duration: 0.34, ease: "back.out(1.45)" }, card.start + 0.16);
        motion.to(arrows, { autoAlpha: 1, scaleX: 1, stagger: 0.08, duration: 0.3, ease: "power3.out" }, card.start + 0.28);
        hide(card);
      }
      function animateImage(card) {
        const image = $(card, ".card-image");
        if (image) gsap.set(image, { autoAlpha: 0, scale: 0.94 });
        motion.fromTo(card.el, { autoAlpha: 0, x: 18, y: 8, scale: 0.97 }, { autoAlpha: 1, x: 0, y: 0, scale: 1, duration: 0.34, ease: "power3.out" }, card.start);
        sweep(card);
        if (image) motion.to(image, { autoAlpha: 1, scale: 1, duration: 0.42, ease: "power3.out" }, card.start + 0.08);
        hide(card);
      }
      function animateCallout(card) {
        motion.fromTo(card.el, { autoAlpha: 0, x: 18, y: 8, scale: 0.97 }, { autoAlpha: 1, x: 0, y: 0, scale: 1, duration: 0.34, ease: "power3.out" }, card.start);
        const codeSweep = $(card, ".screen-code-line");
        if (codeSweep) motion.to(codeSweep, { "--sweep-x": "120%", duration: 0.58, ease: "power2.out" }, card.start + 0.08);
        sweep(card);
        hide(card);
      }
      for (const card of cards) {
        if (card.kind === "screenshot_focus") animateScreenFocus(card);
        else if (card.kind === "lower_third") animateLowerThird(card);
        else if (card.kind === "flowchart") animateFlow(card);
        else if (card.kind === "image") animateImage(card);
        else animateCallout(card);
      }
      for (const item of components) {
        motion.fromTo(item.el, { autoAlpha: 0, y: 10, scale: 0.98 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.3, ease: "power3.out" }, item.start);
        if (item.el.classList.contains("caption-component-host")) motion.to(item.el, { "--caption-sweep": 1, duration: 0.46, ease: "power3.out" }, item.start + 0.08);
        const maskTargets = Array.from(item.el.querySelectorAll(".shimmer-sweep-target, .shimmer-mask"));
        if (maskTargets.length) motion.to(item.el, { "--shimmer-pos": "120%", duration: 0.72, ease: "power2.out" }, item.start + 0.04);
        motion.to(item.el, { autoAlpha: 0, y: -6, duration: 0.18, ease: "power1.in" }, Math.max(item.start, item.end - 0.18));
      }
      for (const item of overlays) {
        motion.fromTo(item.el, { autoAlpha: 0, y: 8, scale: 0.98 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.26, ease: "power3.out" }, item.start);
        const sweepTarget = item.el.querySelector(".screen-code-line");
        if (sweepTarget) motion.to(sweepTarget, { "--sweep-x": "120%", duration: 0.62, ease: "power2.out" }, item.start + 0.08);
        const ripple = item.el.querySelector(".cursor-ripple");
        if (ripple) motion.fromTo(ripple, { autoAlpha: 1, scale: 0.4 }, { autoAlpha: 0, scale: 2.6, duration: 0.46, ease: "power2.out" }, item.start + 0.12);
        motion.to(item.el, { autoAlpha: 0, y: -6, duration: 0.18, ease: "power1.in" }, Math.max(item.start, item.end - 0.18));
      }
      for (const item of emphasis) {
        motion.fromTo(item.el, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.28, ease: "back.out(1.4)" }, item.start);
        motion.to(item.el, { autoAlpha: 0, y: -8, duration: 0.18, ease: "power1.in" }, Math.max(item.start, item.end - 0.18));
      }
      let currentTime = 0;
      function paintCaptions(time) {
        const cue = cues.find((item) => time >= item.start && time <= item.end);
        if (cue) {
          captionText.textContent = cue.text;
          rail.style.opacity = "1";
          rail.style.transform = "translate3d(0,0,0)";
        } else {
          captionText.textContent = "";
          rail.style.opacity = "0";
          rail.style.transform = "translate3d(0,12px,0)";
        }
      }
      const timeline = {
        seek(t, suppressEvents) {
          const time = Math.max(0, Math.min(duration, Number(t) || 0));
          currentTime = time;
          motion.seek(Math.min(time, motion.duration()), suppressEvents);
          seekLottieAssets(time);
          paintCaptions(time);
          return timeline;
        },
        pause() { motion.pause(); return timeline; },
        play() { motion.play(); return timeline; },
        time() { return currentTime; },
        duration() { return duration; },
        totalDuration() { return duration; },
        progress(p) { return timeline.seek((Number(p) || 0) * duration); }
      };
      timeline.seek(0);
      window.__timelines.recut = timeline;
    </script>
  </body>
</html>
`;
}

function renderLottieRuntimeScript(storyboard: EnrichmentStoryboard): string {
  const usesLottie = storyboard.elements.some((element) => element.asset_path && /\.(json|lottie)$/i.test(element.asset_path));
  if (!usesLottie) return "function seekLottieAssets(_time) {}";
  return `const lottieAssets = Array.from(document.querySelectorAll("[data-lottie-src]")).map((el) => ({
        el,
        kind: el.getAttribute("data-lottie-kind"),
        src: el.getAttribute("data-lottie-src"),
        controller: null
      }));
      window.__hfLottie = window.__hfLottie || [];
      function initLottieAssets() {
        for (const item of lottieAssets) {
          if (item.controller || !item.src) continue;
          if (item.kind === "json") {
            if (!window.lottie) continue;
            item.controller = window.lottie.loadAnimation({ container: item.el, renderer: "svg", loop: false, autoplay: false, path: item.src });
            window.__hfLottie.push(item.controller);
          } else if (item.kind === "dotlottie") {
            if (!window.DotLottie || !(item.el instanceof HTMLCanvasElement)) continue;
            item.controller = new window.DotLottie({ canvas: item.el, src: item.src, autoplay: false, loop: false });
            window.__hfLottie.push(item.controller);
          }
        }
      }
      initLottieAssets();
      window.addEventListener("koubo:dotlottie-ready", initLottieAssets, { once: true });
      function seekLottieAssets(time) {
        initLottieAssets();
        for (const item of lottieAssets) {
          if (!item.controller) continue;
          const parent = item.el.closest("[data-overlay-start]");
          const start = Number(parent?.getAttribute("data-overlay-start") ?? 0);
          const end = Number(parent?.getAttribute("data-overlay-end") ?? duration);
          const local = Math.max(0, Math.min(1, (time - start) / Math.max(0.001, end - start)));
          if (item.kind === "json" && typeof item.controller.goToAndStop === "function") {
            const total = item.controller.totalFrames || 1;
            item.controller.goToAndStop(local * total, true);
          } else if (item.kind === "dotlottie" && typeof item.controller.setFrame === "function") {
            const total = item.controller.totalFrames || item.controller.duration || 60;
            item.controller.setFrame(local * total);
          }
        }
      }`;
}

function renderCardFragment(card: StoryboardCard, sourceMode: EnrichmentSourceMode): string {
  if (sourceMode === "screen_recording" || sourceMode === "mixed") return renderScreenCardFragment(card);
  if (card.template_family.startsWith("social_")) return renderSocialFragment(card);
  if (card.template_family === "app_showcase") return renderAppShowcaseFragment(card);
  if (card.template_family.startsWith("follow_card_") || card.template_family.startsWith("lower_third_") || card.template_family === "ticker") {
    return renderLowerThirdFragment(card);
  }
  const kicker = card.kicker ? `<div class="card-kicker">${escapeHtml(card.kicker)}</div>` : "";
  const detail = card.detail ? `<p class="card-detail">${escapeHtml(card.detail)}</p>` : "";
  const media = card.asset_path ? `<img class="card-image" src="${escapeHtml(card.asset_path)}" alt="" />` : "";
  const flow = card.kind === "flowchart" ? renderFlowchart(card) : "";
  return `<article class="card-inner">
  ${kicker}
  <h2 class="card-title">${escapeHtml(card.title)}</h2>
  ${flow || media}
  ${detail}
</article>`;
}

function renderScreenCardFragment(card: StoryboardCard): string {
  const kicker = card.kicker ? `<div class="screen-kicker">${escapeHtml(card.kicker)}</div>` : "";
  const detail = card.detail ? `<p class="screen-detail">${escapeHtml(card.detail)}</p>` : "";
  if (card.kind === "screenshot_focus") {
    return `<article class="screen-focus">
  <div class="focus-corners"></div>
  ${card.template_family === "cursor_click" ? '<div class="cursor-ripple"></div>' : ""}
  <div class="focus-label">${kicker}<h2 class="screen-title">${escapeHtml(card.title)}</h2>${detail}</div>
</article>`;
  }
  if (card.template_family.startsWith("code_")) {
    return `<article class="screen-code-callout">
  <span class="accent-sweep"></span>
  <div class="screen-code-head"><span class="screen-code-dot"></span>${escapeHtml(card.kicker ?? card.template_family.replaceAll("_", " "))}</div>
  <pre class="screen-code-line">${escapeHtml(card.title)}${card.detail ? `\n${escapeHtml(card.detail)}` : ""}</pre>
</article>`;
  }
  if (card.template_family === "notification_macos" && !card.asset_path) return renderNotificationFragment(card, kicker, detail);
  if (card.kind === "lower_third") {
    return `<article class="screen-chip"><span class="accent-sweep"></span>${kicker}<h2 class="screen-title"><span class="keyword-glow">${escapeHtml(card.title)}</span></h2>${detail}</article>`;
  }
  if (card.kind === "flowchart") {
    return `<article class="screen-callout"><span class="accent-sweep"></span>${kicker}<h2 class="screen-title">${escapeHtml(card.title)}</h2>${renderFlowchart(card)}${detail}</article>`;
  }
  const media = card.asset_path ? `<img class="card-image" src="${escapeHtml(card.asset_path)}" alt="" />` : "";
  return `<article class="screen-callout"><span class="accent-sweep"></span>${kicker}<h2 class="screen-title">${escapeHtml(card.title)}</h2>${media}${detail}</article>`;
}

function renderCliOverlayFragment(element: StoryboardElement): string {
  const title = elementParamText(element, "title") ?? elementParamText(element, "text") ?? element.catalog_title;
  const detail = elementParamText(element, "detail") ?? elementParamText(element, "subtitle");
  if (isVisualAssetElement(element)) {
    const media = renderVisualAssetMedia(element);
    return `<article class="asset-overlay-card visual-asset-card">
  ${media}
  <div class="asset-overlay-copy"><h2 class="screen-title">${escapeHtml(title)}</h2>${detail ? `<p class="screen-detail">${escapeHtml(detail)}</p>` : ""}</div>
</article>`;
  }
  if (element.adapter.family === "code") {
    const code = elementParamText(element, "code") ?? title;
    return `<article class="screen-code-callout">
  <span class="accent-sweep"></span>
  <div class="screen-code-head"><span class="screen-code-dot"></span>${escapeHtml(elementParamText(element, "language") ?? "code focus")}</div>
  <pre class="screen-code-line">${escapeHtml(code)}</pre>
</article>`;
  }
  if (element.adapter.family === "screen_focus") {
    return `<article class="screen-focus">
  <div class="focus-corners"></div>
  ${element.element_id.includes("cursor") ? '<div class="cursor-ripple"></div>' : ""}
  <div class="focus-label"><h2 class="screen-title">${escapeHtml(title)}</h2>${detail ? `<p class="screen-detail">${escapeHtml(detail)}</p>` : ""}</div>
</article>`;
  }
  return `<article class="screen-chip"><span class="accent-sweep"></span><h2 class="screen-title"><span class="keyword-glow">${escapeHtml(title)}</span></h2>${detail ? `<p class="screen-detail">${escapeHtml(detail)}</p>` : ""}</article>`;
}

function isAssetElement(element: EnrichmentElement): boolean {
  return element.element_type === "visual_asset";
}

function isVisualAssetElement(element: EnrichmentElement): boolean {
  return element.element_type === "visual_asset";
}

function vendoredElementType(element: EnrichmentElement): VendoredElementType | undefined {
  return isAssetElement(element) ? undefined : element.element_type as VendoredElementType;
}

function renderVisualAssetMedia(element: StoryboardElement): string {
  if (!element.asset_path) return "";
  const ext = extname(element.asset_path).toLowerCase();
  if (ext === ".json") {
    return `<div class="asset-lottie" data-lottie-kind="json" data-lottie-src="${escapeHtml(element.asset_path)}"></div>`;
  }
  if (ext === ".lottie") {
    return `<canvas class="asset-lottie" data-lottie-kind="dotlottie" data-lottie-src="${escapeHtml(element.asset_path)}"></canvas>`;
  }
  const className = ext === ".svg" ? "asset-overlay-image visual-svg" : "asset-overlay-image";
  return `<img class="${className}" src="${escapeHtml(element.asset_path)}" alt="" />`;
}

function renderLowerThirdFragment(card: StoryboardCard): string {
  const kicker = card.kicker ? `<div class="card-kicker">${escapeHtml(card.kicker)}</div>` : "";
  const detail = card.detail ? `<p class="card-detail">${escapeHtml(card.detail)}</p>` : "";
  const button =
    card.template_family.startsWith("follow_card_") || card.template_family === "ticker"
      ? `<div class="hf-follow-button">${card.template_family === "ticker" ? "LIVE" : "Follow"}</div>`
      : "";
  return `<article class="hf-lower-third">
  <div class="hf-accent"></div>
  <div class="hf-body">
    ${kicker}
    <h2 class="card-title">${escapeHtml(card.title)}</h2>
    ${detail}
  </div>
  ${button}
</article>`;
}

function renderNotificationFragment(card: StoryboardCard, kicker: string, detail: string): string {
  return `<article class="notification-card"><span class="accent-sweep"></span>
  <div class="screen-kicker">${escapeHtml(card.kicker ?? "通知")}</div>
  <h2 class="screen-title">${escapeHtml(card.title)}</h2>
  ${detail || "<p class=\"screen-detail\">继续看这里</p>"}
</article>`;
}

function renderSocialFragment(card: StoryboardCard): string {
  const detail = card.detail ? `<p class="card-detail">${escapeHtml(card.detail)}</p>` : "";
  return `<article class="social-card"><span class="accent-sweep"></span>
  <div class="social-meta"><span class="social-avatar"></span><span>${escapeHtml(card.kicker ?? (card.template_family === "social_reddit_post" ? "r/learn" : "@creator"))}</span></div>
  <h2 class="card-title">${escapeHtml(card.title)}</h2>
  ${detail}
</article>`;
}

function renderAppShowcaseFragment(card: StoryboardCard): string {
  const media = card.asset_path ? `<img class="card-image" src="${escapeHtml(card.asset_path)}" alt="" />` : "";
  const detail = card.detail ? `<p class="card-detail">${escapeHtml(card.detail)}</p>` : "";
  return `<article class="app-card"><span class="accent-sweep"></span>
  <div class="card-kicker">${escapeHtml(card.kicker ?? "产品演示")}</div>
  <h2 class="card-title">${escapeHtml(card.title)}</h2>
  ${media}
  ${detail}
</article>`;
}

function renderDependencyTags(dependencies: HyperframesDependencySummary[]): string {
  const preconnects = dependencies.some((dependency) => dependency.domain === "fonts.googleapis.com" || dependency.domain === "fonts.gstatic.com")
    ? '<link rel="preconnect" href="https://fonts.googleapis.com" />\n    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />'
    : "";
  const tags = dependencies
    .filter((dependency) => dependency.url && (dependency.kind === "script" || dependency.kind === "module" || dependency.kind === "style" || dependency.kind === "font"))
    .map((dependency) => {
      if (dependency.kind === "script") return `<script src="${escapeHtml(dependency.url!)}"></script>`;
      if (dependency.kind === "module" && dependency.package_name === "@lottiefiles/dotlottie-web") {
        return `<script type="module">import { DotLottie } from "${escapeHtml(dependency.url!)}"; window.DotLottie = DotLottie; window.dispatchEvent(new Event("koubo:dotlottie-ready"));</script>`;
      }
      if (dependency.kind === "module") return `<script type="module" src="${escapeHtml(dependency.url!)}"></script>`;
      return `<link href="${escapeHtml(dependency.url!)}" rel="stylesheet" />`;
    });
  return [preconnects, ...tags].filter(Boolean).join("\n    ");
}

function cardInlineStyle(card: StoryboardCard, sourceMode: EnrichmentSourceMode): string {
  const screenLike = sourceMode === "screen_recording" || sourceMode === "mixed";
  if (!screenLike) return "";
  if (card.kind === "screenshot_focus" && card.target_rect) {
    return `left:${percent(card.target_rect.x)};top:${percent(card.target_rect.y)};right:auto;bottom:auto;width:${percent(card.target_rect.width)};height:${percent(card.target_rect.height)};`;
  }
  if (card.anchor_point) return `left:${percent(card.anchor_point.x)};top:${percent(card.anchor_point.y)};right:auto;bottom:auto;min-height:auto;${anchoredCardSize(card.kind)}`;
  return "";
}

function elementInlineStyle(element: StoryboardElement, sourceMode: EnrichmentSourceMode): string {
  const screenLike = sourceMode === "screen_recording" || sourceMode === "mixed";
  if (element.adapter.render_strategy === "component_caption") return "";
  if (element.target_rect) {
    return `left:${percent(element.target_rect.x)};top:${percent(element.target_rect.y)};right:auto;bottom:auto;width:${percent(element.target_rect.width)};height:${percent(element.target_rect.height)};`;
  }
  if (element.anchor_point) {
    return `left:${percent(element.anchor_point.x)};top:${percent(element.anchor_point.y)};right:auto;bottom:auto;min-height:auto;width:max-content;`;
  }
  if (screenLike && element.element_type === "registry_component") return "left:6%;right:auto;bottom:18%;min-height:auto;";
  if (element.zone === "full_frame") return "inset:0;width:100%;height:100%;";
  return "";
}

function captionComponentLabel(element: StoryboardElement, storyboard: EnrichmentStoryboard): string {
  return elementParamText(element, "text") ?? elementParamText(element, "label") ?? storyboard.captions.emphasis[0]?.text ?? element.catalog_title;
}

function filteredCaptionEmphasis(storyboard: EnrichmentStoryboard): EnrichmentStoryboard["captions"]["emphasis"] {
  const captionElements = storyboard.elements.filter((element) => element.adapter.render_strategy === "component_caption");
  return storyboard.captions.emphasis.filter((item) =>
    !captionElements.some((element) => timeOverlap(item.start, item.end, element.start, element.end) > 0.25 && similarCaptionText(item.text, captionComponentLabel(element, storyboard))),
  );
}

function timeOverlap(startA: number, endA: number, startB: number, endB: number): number {
  return Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));
}

function similarCaptionText(a: string, b: string): boolean {
  const left = normalizeCaptionText(a);
  const right = normalizeCaptionText(b);
  return Boolean(left && right && (left === right || left.includes(right) || right.includes(left)));
}

function normalizeCaptionText(value: string): string {
  return value.toLowerCase().replace(/[\s,，.。!！?？:：;；'"“”‘’、\-—_]/g, "");
}

function elementParamText(element: EnrichmentElement, key: string): string | undefined {
  const value = element.params?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function elementParamNumber(element: EnrichmentElement, key: string): number | undefined {
  const value = element.params?.[key];
  if (typeof value === "number") return value;
  if (typeof value !== "string" || !value.trim()) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function anchoredCardSize(kind: StoryboardCard["kind"]): string {
  if (kind === "lower_third") return "width:max-content;max-width:min(440px,42vw);";
  if (kind === "flowchart") return "width:min(520px,38vw);";
  if (kind === "image") return "width:min(380px,32vw);";
  return "width:min(460px,38vw);";
}

function percent(value: number): string {
  return `${Number((value * 100).toFixed(3))}%`;
}

function renderFlowchart(card: StoryboardCard): string {
  const raw = [card.title, ...(card.detail ?? "").split(/(?:->|→|\||,|，)/)].map((item) => item.trim()).filter(Boolean);
  const nodes = raw.slice(0, 3);
  while (nodes.length < 3) nodes.push(nodes.length === 0 ? "Start" : nodes.length === 1 ? "Check" : "Next");
  return `<svg class="flow" viewBox="0 0 900 220" role="img" aria-label="${escapeHtml(card.title)}">
  <path class="flow-arrow" d="M220 110H360M540 110H680" stroke-width="8" stroke-linecap="round"/>
  <path class="flow-arrow" d="M344 91l31 19-31 19M664 91l31 19-31 19" fill="none" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
  ${nodes
    .map((node, index) => {
      const x = 80 + index * 320;
      return `<rect class="flow-node" x="${x}" y="45" width="190" height="130" rx="18" stroke-width="3"/><text x="${x + 95}" y="118" text-anchor="middle">${escapeHtml(node).slice(0, 24)}</text>`;
    })
    .join("")}
</svg>`;
}

function assertScopedCardFragment(fragment: string, id: string): void {
  if (/<script\b/i.test(fragment) || /\son[a-z]+\s*=/i.test(fragment) || /https?:\/\//i.test(fragment)) {
    throw new Error(`generated card fragment for ${id} contains forbidden script, handler, or external URL`);
  }
}

function scriptJson(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll(">", "\\u003e").replaceAll("&", "\\u0026");
}

function formatSeconds(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function runHyperframes(args: string[], cwd: string, message: string, timeout = 120): void {
  const result = spawnSync(resolveHyperframesBinary(), args, { cwd, encoding: "utf8", timeout: timeout * 1000 });
  if (result.status !== 0) throw new Error(`${message}: ${result.stderr || result.stdout}`);
}

function mixMusic(basePath: string, musicPath: string, slot: EnrichmentMusic, outputPath: string): void {
  const duration = slot.end - slot.start;
  const delay = Math.round(slot.start * 1000);
  const fade = Math.min(slot.fade_seconds ?? 0.5, duration / 2);
  const voice = "[0:a]aformat=sample_fmts=fltp:channel_layouts=stereo[voice]";
  const music = `[1:a]atrim=0:${duration},asetpts=PTS-STARTPTS,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${slot.volume ?? 0.18},afade=t=in:st=0:d=${fade},afade=t=out:st=${Math.max(0, duration - fade)}:d=${fade},adelay=${delay}|${delay}[music]`;
  const mix = slot.ducking === false
    ? `${voice};${music};[voice][music]amix=inputs=2:duration=first:dropout_transition=0[a]`
    : `${voice};[voice]asplit=2[voice_sc][voice_mix];${music};[music][voice_sc]sidechaincompress=threshold=0.04:ratio=8:attack=20:release=250[ducked];[voice_mix][ducked]amix=inputs=2:duration=first:dropout_transition=0[a]`;
  ffmpeg(["-y", "-i", basePath, "-i", musicPath, "-filter_complex", mix, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-movflags", "+faststart", outputPath], "ffmpeg music mix failed");
}

function mixSfx(basePath: string, sfxPath: string, element: EnrichmentSfx, outputPath: string): void {
  const duration = Math.max(0.01, element.end - element.start);
  const delay = Math.round(element.start * 1000);
  const volume = element.volume;
  const fade = Math.min(element.fade_seconds, duration / 2);
  const voice = "[0:a]aformat=sample_fmts=fltp:channel_layouts=stereo[voice]";
  const sfx = `[1:a]atrim=0:${duration},asetpts=PTS-STARTPTS,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${volume},afade=t=in:st=0:d=${fade},afade=t=out:st=${Math.max(0, duration - fade)}:d=${fade},adelay=${delay}|${delay}[sfx]`;
  const mix = `${voice};${sfx};[voice][sfx]amix=inputs=2:duration=first:dropout_transition=0[a]`;
  ffmpeg(["-y", "-i", basePath, "-i", sfxPath, "-filter_complex", mix, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-movflags", "+faststart", outputPath], "ffmpeg SFX mix failed");
}

function burnSubtitles(basePath: string, subtitlesPath: string, outputPath: string, workDir: string): boolean {
  const cues = parseSrtCues(readFileSync(subtitlesPath, "utf8"));
  if (cues.length === 0) {
    ffmpeg(["-y", "-i", basePath, "-c", "copy", "-movflags", "+faststart", outputPath], "ffmpeg final copy failed");
    return false;
  }
  if (!ffmpegFilterExists("subtitles")) {
    if (!ffmpegFilterExists("drawtext")) {
      throw commandError("RENDER_PREFLIGHT_FAILED", "captions are required, but ffmpeg provides neither subtitles nor drawtext filter");
    }
    const { height } = probeVideoSize(basePath);
    const fontSize = Math.max(18, Math.round(height * 0.045));
    const font = subtitleFontOption();
    const filters = cues.map((cue, index) => {
      const textPath = join(workDir, `subtitle-${String(index + 1).padStart(4, "0")}.txt`);
      writeFileSync(textPath, cue.text);
      const options = [
        font,
        `textfile='${escapeFfmpegFilterValue(textPath)}'`,
        `enable='between(t,${cue.start},${cue.end})'`,
        `fontsize=${fontSize}`,
        "fontcolor=white",
        "x=(w-text_w)/2",
        `y=h-text_h-${Math.round(fontSize * 1.4)}`,
        "box=1",
        "boxcolor=black@0.58",
        `boxborderw=${Math.round(fontSize * 0.35)}`,
      ]
        .filter(Boolean)
        .join(":");
      return `drawtext=${options}`;
    });
    ffmpeg(["-y", "-i", basePath, "-vf", filters.join(","), "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "copy", "-movflags", "+faststart", outputPath], "ffmpeg drawtext subtitle burn failed");
    return true;
  }
  ffmpeg(["-y", "-i", basePath, "-vf", `subtitles='${subtitlesPath.replaceAll("'", "\\'")}'`, "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "copy", "-movflags", "+faststart", outputPath], "ffmpeg subtitle burn failed");
  return true;
}

function parseSrtCues(srt: string): { start: number; end: number; text: string }[] {
  return srt
    .trim()
    .split(/\r?\n\s*\r?\n/)
    .flatMap((block) => {
      const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const timingIndex = lines.findIndex((line) => line.includes("-->"));
      if (timingIndex < 0) return [];
      const [startText, endText] = lines[timingIndex]!.split("-->").map((part) => part.trim());
      const text = lines.slice(timingIndex + 1).join(" ").trim();
      if (!startText || !endText || !text) return [];
      const start = srtTimestampSeconds(startText);
      const end = srtTimestampSeconds(endText);
      return end > start ? [{ start, end, text }] : [];
    });
}

function srtTimestampSeconds(value: string): number {
  const match = /^(\d+):(\d{2}):(\d{2}),(\d{3})$/.exec(value);
  if (!match) return 0;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
}

function subtitleFontOption(): string {
  const candidates = [
    "/System/Library/Fonts/STHeiti Medium.ttc",
    "/System/Library/Fonts/PingFang.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  ];
  const fontPath = candidates.find((path) => existsSync(path));
  return fontPath ? `fontfile='${escapeFfmpegFilterValue(fontPath)}'` : "";
}

function escapeFfmpegFilterValue(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

function ffmpeg(args: string[], message: string): void {
  if (!commandExists("ffmpeg")) throw new Error("ffmpeg not found for render");
  const result = spawnSync("ffmpeg", args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${message}: ${result.stderr || result.stdout}`);
}

function ffmpegFilterExists(name: string): boolean {
  const result = spawnSync("ffmpeg", ["-hide_banner", "-filters"], { encoding: "utf8" });
  return result.status === 0 && result.stdout.includes(` ${name} `);
}

function renderEdl(projectPath: string, edl: EdlArtifact, outputPath: string, aspectRatio: string): OutputFrameSchedule {
  const sources = readManifest(projectPath);
  const materialized = materializedSourcePaths(projectPath, sources);
  const sourcePaths = Object.fromEntries(sources.sources.map((source) => [
    source.source_id,
    readableProjectSource(projectPath, source.source_id, materialized.get(source.source_id) ?? ""),
  ]));
  const sourceHasAudio = Object.fromEntries(sources.sources.map((source) => [source.source_id, Boolean(source.identity.audio)]));
  const firstEntry = [...edl.entries].sort((a, b) => a.output_order - b.output_order)[0];
  if (!firstEntry) throw commandError("RENDER_PREFLIGHT_FAILED", "EDL has no renderable timeline entries");
  const firstSource = sources.sources.find((source) => source.source_id === firstEntry.source_id);
  if (!firstSource) throw commandError("RENDER_PREFLIGHT_FAILED", `EDL references unknown source ${firstEntry.source_id}`);
  const dimensions = resolveRenderOutputSpec(
    aspectRatio,
    firstSource.identity.video.display_width,
    firstSource.identity.video.display_height,
  );
  const output = { ...dimensions, fps: 30 };
  const schedule = compileOutputFrameSchedule(edl.entries, output.fps);
  renderResolvedEdl(edl, sourcePaths, sourceHasAudio, outputPath, output, schedule);
  assertStrictOutputTiming(outputPath, schedule, Math.max(0.05, 2 / output.fps));
  return schedule;
}

export function resolveRenderOutputSpec(aspect: string, sourceWidth: number, sourceHeight: number): { width: number; height: number } {
  if (aspect === "16:9") return { width: 1920, height: 1080 };
  if (aspect === "9:16") return { width: 1080, height: 1920 };
  if (aspect === "4:5") return { width: 1080, height: 1350 };
  return { width: sourceWidth, height: sourceHeight };
}

function renderSrt(transcript: TranscriptArtifact, edl: EdlArtifact): string {
  const lines: string[] = [];
  let index = 1;
  let outputCursor = 0;
  for (const entry of edl.entries) {
    const segments = transcript.segments.filter((segment) => segment.source_id === entry.source_id && segment.start >= entry.start && segment.end <= entry.end);
    for (const segment of segments) {
      const start = outputCursor + (segment.start - entry.start);
      const end = outputCursor + (segment.end - entry.start);
      lines.push(String(index), `${srtTime(start)} --> ${srtTime(end)}`, segment.text, "");
      index += 1;
    }
    outputCursor += entry.end - entry.start;
  }
  return lines.join("\n");
}

function renderInspectReport(
  outputPath: string,
  duration: number,
  expected: number,
  captionsPresent: boolean,
  sourceMode: EnrichmentSourceMode | undefined,
  enrichmentSummary: string[],
  blockUsage: ProjectEnrichmentBlockUsage[],
  elementUsage: ProjectEnrichmentElementUsage[],
  audioUsage: ProjectAudioUsage,
  cdnDependencies: HyperframesDependencySummary[],
  assetSummary: ProjectAssetSummary[],
  musicReview: MusicReviewArtifact | undefined,
  inspectionChecks: ProjectInspectionCheck[],
  inspectionFrames: string[],
  warnings: string[],
  removedRanges: InspectionRemovedRange[],
  retainedRisks: InspectionRisk[],
): string {
  const removed = removedRanges.map((range) => `- ${range.candidate_id} ${range.source_id} ${range.start.toFixed(2)}-${range.end.toFixed(2)} ${range.type}: ${range.reason}`);
  const retained = retainedRisks.map((risk) =>
    risk.candidate_id && risk.source_id && risk.start !== undefined && risk.end !== undefined
      ? `- ${risk.candidate_id} ${risk.source_id} ${risk.start.toFixed(2)}-${risk.end.toFixed(2)}: ${risk.reason}`
      : `- ${risk.reason}`,
  );
  const blocks = blockUsage.map((usage) => `- ${usage.card_id}: ${usage.block_id} (${usage.template_family}) from ${usage.source}; dependencies=${usage.dependencies.join(",") || "none"}`);
  const elements = elementUsage.map((usage) => {
    const asset = usage.asset_id ? ` asset=${usage.asset_id}` : "";
    const sfx = usage.sfx_id ? ` sfx=${usage.sfx_id}` : "";
    const mode = usage.guidance_only ? "guidance_only" : usage.renderable ? "renderable" : "not_renderable";
    return `- ${usage.id}: ${usage.element_type} ${usage.element_id} ${usage.start.toFixed(2)}-${usage.end.toFixed(2)} ${mode} family=${usage.adapter.family} strategy=${usage.adapter.render_strategy} screen_safe=${usage.adapter.screen_safe ? "yes" : "no"} from ${usage.source}${asset}${sfx}; reason=${usage.reason}`;
  });
  const dependencies = cdnDependencies.map((dependency) => {
    const version = dependency.version ? `@${dependency.version}` : dependency.versionless_exception ? ` (${dependency.versionless_exception})` : "";
    const packageName = dependency.package_name ? ` ${dependency.package_name}${version}` : "";
    const domain = dependency.domain ? ` ${dependency.domain}` : "";
    const url = dependency.url ? ` ${dependency.url}` : "";
    return `- ${dependency.id} ${dependency.kind}${packageName}${domain}${url}`;
  });
  const assets = assetSummary.map((asset) => {
    const source = asset.source ? ` source=${asset.source}` : "";
    const provenance = asset.provenance ? ` provenance=${asset.provenance}` : "";
    const provider = asset.provider ? ` provider=${asset.provider}` : "";
    const license = asset.license ? ` license=${asset.license}` : "";
    const sourceUrl = asset.source_url ? ` source_url=${asset.source_url}` : "";
    const runtimeDependencies = asset.runtime_dependencies?.length ? ` runtime_dependencies=${asset.runtime_dependencies.join(",")}` : "";
    const usedBy = asset.used_by.length ? ` used_by=${asset.used_by.join(",")}` : "";
    const dimensions = asset.dimensions ? ` ${asset.dimensions.width}x${asset.dimensions.height}` : "";
    const durationText = asset.duration_seconds !== undefined ? ` duration=${asset.duration_seconds.toFixed(2)}` : "";
    return `- ${asset.id} ${asset.type ?? "unknown"} ${asset.path} exists=${asset.exists ? "yes" : "no"}${source}${provenance}${provider}${license}${sourceUrl}${runtimeDependencies}${usedBy}${dimensions}${durationText}`;
  });
  const audio = [
    ...audioUsage.music.map((item) => `- music ${item.id} asset=${item.asset_id} ${item.start.toFixed(2)}-${item.end.toFixed(2)} volume=${item.volume} ducking=${item.ducking ? "yes" : "no"} fade=${item.fade_seconds}; reason=${item.reason}`),
    ...audioUsage.sfx.map((item) => {
      const ref = item.asset_id ? `asset=${item.asset_id}` : `sfx=${item.sfx_id ?? "unknown"}`;
      return `- sfx ${item.id} ${ref} ${item.start.toFixed(2)}-${item.end.toFixed(2)} volume=${item.volume}; reason=${item.reason}`;
    }),
  ];
  const music = musicReview
    ? [
        `- status=${musicReview.status}`,
        ...(musicReview.asset_id ? [`- asset=${musicReview.asset_id} provider=${musicReview.provider ?? "unknown"} path=${musicReview.path ?? "unknown"}`] : []),
      ...(musicReview.license ? [`- license=${musicReview.license}`] : []),
    ]
    : ["- none"];
  const qaChecks = inspectionChecks.flatMap((check) => {
    const asset = check.asset_id ? ` asset=${check.asset_id}` : "";
    const provider = check.provider ? ` provider=${check.provider}` : "";
    const frames = check.frame_paths.length ? ` frames=${check.frame_paths.join(",")}` : " frames=none";
    const warningsText = check.warnings.length ? ` warnings=${check.warnings.join(" | ")}` : "";
    return [`- ${check.id}: ${check.kind} ${check.start.toFixed(2)}-${check.end.toFixed(2)} status=${check.status}${asset}${provider}; expected=${check.expected};${frames}${warningsText}`];
  });
  return [
    "# Render Report",
    "",
    `Output: ${outputPath}`,
    `Duration: ${duration.toFixed(2)}`,
    `Expected duration: ${expected.toFixed(2)}`,
    `Captions present: ${captionsPresent ? "yes" : "no"}`,
    `Source mode: ${sourceMode ?? "none"}`,
    "",
    "## Enrichment",
    ...(enrichmentSummary.length ? enrichmentSummary.map((item) => `- ${item}`) : ["- none"]),
    "",
    "## HyperFrames Blocks",
    ...(blocks.length ? blocks : ["- none"]),
    "",
    "## HyperFrames Elements",
    ...(elements.length ? elements : ["- none"]),
    "",
    "## CDN Dependencies",
    ...(dependencies.length ? dependencies : ["- none"]),
    "",
    "## Assets",
    ...(assets.length ? assets : ["- none"]),
    "",
    "## Audio Usage",
    ...(audio.length ? audio : ["- none"]),
    "",
    "## Music Review",
    ...music,
    "",
    "## QA Checks",
    ...(qaChecks.length ? qaChecks : ["- none"]),
    "",
    "## Inspection Frames",
    ...(inspectionFrames.length ? inspectionFrames.map((frame) => `- ${frame}`) : ["- none"]),
    "",
    "## Warnings",
    ...(warnings.length ? warnings.map((warning) => `- ${warning}`) : ["- none"]),
    "",
    "## Removed Ranges",
    ...(removed.length ? removed : ["- none"]),
    "",
    "## Retained Risks",
    ...(retained.length ? retained : ["- none"]),
    "",
  ].join("\n");
}

function extractInspectionChecks(projectPath: string, outputPath: string, checks: ProjectQaCheck[], namespace = "latest"): ProjectInspectionCheck[] {
  if (checks.length === 0) return [];
  if (checks.some((check) => check.frame_times.length > 0) && !commandExists("ffmpeg")) throw new Error("ffmpeg not found for inspection frames");
  const dir = join(projectPath, ".inspection", namespace);
  mkdirSync(dir, { recursive: true });
  return checks.map((check) => {
    const framePaths = check.frame_times.map((time, index) => {
      const suffix = check.frame_times.length === 1 ? "" : `-${index + 1}`;
      const framePath = join(dir, `${safeFileName(check.id)}${suffix}.jpg`);
      const result = spawnSync("ffmpeg", ["-y", "-ss", formatSeconds(time), "-i", outputPath, "-frames:v", "1", "-q:v", "3", framePath], { encoding: "utf8" });
      if (result.status !== 0) throw new Error(`ffmpeg inspection frame failed for ${check.id}: ${result.stderr || result.stdout}`);
      return framePath;
    });
    return {
      ...check,
      status: check.status === "blocker" ? "blocker" : check.warnings.length ? "warning" : "sampled",
      frame_paths: framePaths,
      needs_human_review: check.needs_human_review || framePaths.length > 0 || check.warnings.length > 0,
    };
  });
}

function inspectWarnings(duration: number, expected: number, subtitlesPath: string, captionsExpected: boolean, tolerance: number): string[] {
  const warnings: string[] = [];
  const delta = Math.abs(duration - expected);
  if (delta > tolerance) warnings.push(`output duration expected=${expected.toFixed(6)}s actual=${duration.toFixed(6)}s delta=${delta.toFixed(6)}s tolerance=${tolerance.toFixed(6)}s`);
  if (!captionsExpected) return warnings;
  if (!existsSync(subtitlesPath)) {
    warnings.push("subtitles.srt is missing");
  } else {
    const subtitles = readFileSync(subtitlesPath, "utf8").trim();
    if (!subtitles.includes("-->")) warnings.push("subtitles.srt has no timestamp ranges");
  }
  return warnings;
}

function edlDuration(edl: EdlArtifact): number {
  return edl.entries.reduce((sum, entry) => sum + entry.end - entry.start, 0);
}

function srtTime(seconds: number): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const whole = Math.floor(totalMs / 1000);
  const ms = totalMs % 1000;
  const s = whole % 60;
  const m = Math.floor(whole / 60) % 60;
  const h = Math.floor(whole / 3600);
  return `${pad(h)}:${pad(m)}:${pad(s)},${String(ms).padStart(3, "0")}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function probeMedia(path: string): Record<string, unknown> & { duration_seconds: number; probe_ok: boolean; probe_error?: string } {
  const result = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path], {
    encoding: "utf8",
  });
  const duration = result.status === 0 ? Number.parseFloat(result.stdout.trim()) : Number.NaN;
  if (Number.isFinite(duration)) return { duration_seconds: duration, probe_ok: true };
  return { duration_seconds: 0, probe_ok: false, probe_error: (result.stderr || result.stdout || "unknown ffprobe error").trim() };
}

export function probeStrictOutputTiming(path: string): {
  video_frame_count: number;
  video_duration_seconds: number;
  audio_duration_seconds?: number;
  container_duration_seconds: number;
  video_start_time_seconds: number;
  avg_frame_rate: string;
} {
  const result = spawnSync("ffprobe", [
    "-v", "error", "-count_frames", "-show_entries",
    "stream=codec_type,nb_read_frames,nb_frames,duration,start_time,avg_frame_rate:format=duration",
    "-of", "json", path,
  ], { encoding: "utf8" });
  if (result.status !== 0) throw commandError("RENDER_OUTPUT_INVALID", "strict output ffprobe failed");
  let root: Record<string, unknown>;
  try {
    root = JSON.parse(result.stdout) as Record<string, unknown>;
  } catch {
    throw commandError("RENDER_OUTPUT_INVALID", "strict output ffprobe returned invalid JSON");
  }
  const streams = Array.isArray(root.streams) ? root.streams.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : [];
  const video = streams.find((stream) => stream.codec_type === "video");
  const audio = streams.find((stream) => stream.codec_type === "audio");
  const format = root.format && typeof root.format === "object" ? root.format as Record<string, unknown> : {};
  const frameCount = finiteNumber(video?.nb_read_frames) ?? finiteNumber(video?.nb_frames);
  const videoDuration = finiteNumber(video?.duration);
  const containerDuration = finiteNumber(format.duration);
  if (!video || frameCount === undefined || videoDuration === undefined || containerDuration === undefined) {
    throw commandError("RENDER_OUTPUT_INVALID", "strict output ffprobe is missing video timing facts");
  }
  return {
    video_frame_count: Math.trunc(frameCount),
    video_duration_seconds: videoDuration,
    ...(finiteNumber(audio?.duration) === undefined ? {} : { audio_duration_seconds: finiteNumber(audio?.duration)! }),
    container_duration_seconds: containerDuration,
    video_start_time_seconds: finiteNumber(video.start_time) ?? 0,
    avg_frame_rate: stringOr(video.avg_frame_rate, "0/0"),
  };
}

export function probePortableSourceIdentity(path: string): NonNullable<SourceAsset["identity"]> {
  const bytes = readFileSync(path);
  const sha256 = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  const sizeBytes = bytes.byteLength;
  const result = spawnSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", path], { encoding: "utf8" });
  let root: Record<string, unknown> = {};
  try {
    root = result.status === 0 ? JSON.parse(result.stdout) as Record<string, unknown> : {};
  } catch {
    root = {};
  }
  const streams = Array.isArray(root.streams) ? root.streams.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : [];
  const video = streams.find((stream) => stream.codec_type === "video") ?? {};
  const audio = streams.find((stream) => stream.codec_type === "audio");
  const format = root.format && typeof root.format === "object" ? root.format as Record<string, unknown> : {};
  const duration = finiteNumber(format.duration) ?? finiteNumber(video.duration) ?? 0;
  const width = Math.max(0, Math.trunc(finiteNumber(video.width) ?? 0));
  const height = Math.max(0, Math.trunc(finiteNumber(video.height) ?? 0));
  const rotation = streamRotation(video);
  const quarterTurn = Math.abs(rotation) % 180 === 90;
  return {
    sha256,
    size_bytes: sizeBytes,
    duration_seconds: duration,
    video: {
      codec_name: stringOr(video.codec_name, "unknown"),
      width,
      height,
      display_width: quarterTurn ? height : width,
      display_height: quarterTurn ? width : height,
      rotation,
      avg_frame_rate: stringOr(video.avg_frame_rate, "0/0"),
      pixel_format: stringOr(video.pix_fmt, "unknown"),
    },
    ...(audio ? { audio: {
      codec_name: stringOr(audio.codec_name, "unknown"),
      sample_rate: Math.max(0, Math.trunc(finiteNumber(audio.sample_rate) ?? 0)),
      channels: Math.max(0, Math.trunc(finiteNumber(audio.channels) ?? 0)),
      channel_layout: stringOr(audio.channel_layout, "unknown"),
    } } : {}),
  };
}

function streamRotation(stream: Record<string, unknown>): number {
  const tags = stream.tags && typeof stream.tags === "object" ? stream.tags as Record<string, unknown> : undefined;
  const tagRotation = finiteNumber(tags?.rotate);
  if (tagRotation !== undefined) return Math.trunc(tagRotation);
  const sideData = Array.isArray(stream.side_data_list) ? stream.side_data_list : [];
  for (const item of sideData) {
    if (!item || typeof item !== "object") continue;
    const rotation = finiteNumber((item as Record<string, unknown>).rotation);
    if (rotation !== undefined) return Math.trunc(rotation);
  }
  return 0;
}

function finiteNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseFloat(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function parseFrameRate(value: string): number {
  const [numerator, denominator = 1] = value.split("/").map(Number);
  const rate = numerator! / denominator!;
  return Number.isFinite(rate) ? rate : 0;
}

function portableSourcesForWrite(manifest: SourcesManifest): unknown {
  return {
    contract_version: "2.0",
    sources: manifest.sources.map((source) => ({
      source_id: source.source_id,
      order: source.order,
      original_filename: source.original_filename,
      local_media_ref: source.local_media_ref,
      identity: source.identity,
    })),
  };
}

function sourceIdentityProjection(source: SourceAsset): unknown {
  if (!source.identity) throw commandError("SOURCE_MANIFEST_INVALID", `source ${source.source_id} is missing portable identity`);
  return portableSourceIdentityFingerprintProjection({
    source_id: source.source_id,
    order: source.order,
    original_filename: source.original_filename,
    local_media_ref: source.local_media_ref ?? "local-ref-not-fingerprinted",
    identity: source.identity,
  } as Parameters<typeof portableSourceIdentityFingerprintProjection>[0]);
}

function sourceIdentityRecord(projectPath: string, source: SourceAsset, command: string, recordedAt: string): ArtifactRecord {
  return recordJsonArtifact({
    project_path: projectPath,
    key: `source-identity:${source.source_id}`,
    path: `.virtual/source-identity/${source.source_id}`,
    role: "authoritative_input",
    schema_version: "2.0",
    authored_by: "cli",
    command,
    mode: "produced",
    value: sourceIdentityProjection(source),
    recorded_at: recordedAt,
  });
}

function commandError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function probeVideoSize(path: string): { width: number; height: number } {
  const result = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=s=x:p=0", path], {
    encoding: "utf8",
  });
  const [width, height] = result.stdout.trim().split("x").map(Number);
  if (result.status !== 0 || !Number.isFinite(width) || !Number.isFinite(height)) throw new Error(`could not probe video size for ${path}`);
  return { width, height };
}

function writeJson(path: string, value: unknown) {
  atomicWriteJson(path, value);
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readProjectJson(projectPath: string, projectRelativePath: string, label: string): unknown {
  return readJson(resolveExistingProjectPath(projectPath, projectRelativePath, label));
}

function projectFileBytesFingerprint(projectPath: string, projectRelativePath: string, label: string): Fingerprint {
  return fileBytesFingerprint(resolveExistingProjectPath(projectPath, projectRelativePath, label));
}

function readProjectMetadata(projectPath: string): ProjectMetadataArtifact | undefined {
  const metadataPath = join(projectPath, projectArtifacts.project);
  if (!existsSync(metadataPath)) return undefined;
  return parseProjectMetadata(readProjectJson(projectPath, projectArtifacts.project, "project metadata"));
}

function writeProjectMetadata(projectPath: string, providerMode: ProviderExecutionMode, existing?: ProjectMetadataArtifact): string {
  const metadataPath = join(projectPath, projectArtifacts.project);
  const now = new Date().toISOString();
  writeJson(metadataPath, {
    contract_version: "1.0",
    provider_execution_mode: providerMode,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  } satisfies ProjectMetadataArtifact);
  return metadataPath;
}

function resolveProjectProviderMode(projectPath: string, explicitMode: ProviderExecutionMode | undefined): ProviderExecutionMode {
  const metadata = readProjectMetadata(projectPath);
  if (metadata) {
    if (explicitMode && explicitMode !== metadata.provider_execution_mode) throw providerModeMismatch(metadata.provider_execution_mode, explicitMode);
    return metadata.provider_execution_mode;
  }
  if (explicitMode) {
    writeProjectMetadata(projectPath, explicitMode);
    return explicitMode;
  }
  if (existsSync(projectPath)) writeProjectMetadata(projectPath, "standalone");
  return "standalone";
}

function providerModeMismatch(expected: ProviderExecutionMode, actual: ProviderExecutionMode): Error & {
  code: string;
  provider_execution_mode: ProviderExecutionMode;
  stage: string;
  artifact: string;
  remediation: string;
  request: Record<string, unknown>;
} {
  const error = new Error(`provider mode mismatch: project is ${expected}, command requested ${actual}`) as Error & {
    code: string;
    provider_execution_mode: ProviderExecutionMode;
    stage: string;
    artifact: string;
    remediation: string;
    request: Record<string, unknown>;
  };
  error.code = "PROVIDER_MODE_MISMATCH";
  error.provider_execution_mode = expected;
  error.stage = "provider-mode";
  error.artifact = projectArtifacts.project;
  error.remediation = `Rerun with --provider-mode ${expected}, or create a new project for ${actual} mode.`;
  error.request = { expected_provider_mode: expected, requested_provider_mode: actual };
  return error;
}

function assertPlatformMusicAcquisitionAllowed(projectPath: string, command: "music-acquire" | "music-review") {
  const request = parseMusicRequest(readProjectJson(projectPath, projectArtifacts.musicRequest, "music request"));
  if (request.source === "none") return;
  if (request.source === "local" && request.local_path && !request.library_track) return;
  throw platformProviderBlocked(
    command,
    projectArtifacts.musicRequest,
    `platform mode does not acquire music from ${request.source}`,
    "Host/platform must generate, search, download, or license music first, then write a project-local file and set music-request.json source=local with local_path.",
    {
      music_request_id: request.id,
      requested_source: request.source,
      local_path_present: Boolean(request.local_path),
      library_track_present: Boolean(request.library_track),
      allowed_sources: ["none", "local"],
      required_artifact: projectArtifacts.musicRequest,
    },
  );
}

function readPlatformVisualCandidatesOrBlock(projectPath: string, stage: string): VisualCandidatesArtifact {
  const candidatesPath = join(projectPath, projectArtifacts.visualCandidates);
  if (!existsSync(candidatesPath)) {
    throw platformProviderBlocked(
      stage,
      projectArtifacts.visualCandidates,
      "platform mode requires visual-candidates.json before visual-search",
      "Host/platform must perform visual provider search or MCP handoff first, then write visual-candidates.json with project-local candidates.",
      { required_artifact: projectArtifacts.visualCandidates },
    );
  }
  let candidates: VisualCandidatesArtifact;
  try {
    candidates = parseVisualCandidates(readJson(candidatesPath));
  } catch {
    throw platformProviderBlocked(
      stage,
      projectArtifacts.visualCandidates,
      "platform mode visual-candidates.json is invalid",
      platformVisualSelectionRemediation(),
      { required_artifact: projectArtifacts.visualCandidates },
    );
  }
  if (candidates.candidates.length === 0) {
    throw platformProviderBlocked(
      stage,
      projectArtifacts.visualCandidates,
      "platform mode visual-candidates.json has no candidates",
      "Host/platform must provide at least one selected or renderable project-local visual candidate before CLI visual acquisition.",
      { required_artifact: projectArtifacts.visualCandidates, candidate_count: 0 },
    );
  }
  const remoteUrl = platformCandidateProviderUrl(candidates.candidates);
  if (remoteUrl) {
    throw platformProviderBlocked(
      stage,
      projectArtifacts.visualCandidates,
      `${remoteUrl.candidate.id}: platform mode visual candidates must not include ${remoteUrl.field}`,
      "Host/platform must download/export provider assets into the project and write platform-safe attribution before CLI import; CLI platform mode will not keep or fetch provider URLs.",
      {
        candidate_id: remoteUrl.candidate.id,
        provider: remoteUrl.candidate.provider,
        forbidden_field: remoteUrl.field,
        required_field: "local_path",
      },
    );
  }
  for (const candidate of candidates.candidates) {
    if (candidate.preview_path) assertReadablePlatformVisualPath(projectPath, candidate, "preview_path", stage);
  }
  return candidates;
}

function assertPlatformVisualAcquisitionAllowed(projectPath: string) {
  const requestValue = readProjectJson(projectPath, projectArtifacts.visualRequest, "visual request");
  const rawRequests = object(requestValue).requests;
  if (Array.isArray(rawRequests)) {
    for (const value of rawRequests) {
      const item = object(value);
      const requestId = typeof item.id === "string" ? item.id : "unknown request";
      if (typeof item.selected_candidate_id !== "string" || item.selected_candidate_id.trim() === "") {
        throw platformVisualRequestBlocked(requestId, "selected_candidate_id");
      }
      if (typeof item.selection_reason !== "string" || item.selection_reason.trim() === "") {
        throw platformVisualRequestBlocked(requestId, "selection_reason");
      }
    }
  }
  const request = parseVisualRequest(requestValue);
  const candidates = readPlatformVisualCandidatesOrBlock(projectPath, "visual-acquire");
  for (const item of request.requests) {
    const candidate = candidates.candidates.find((entry) => entry.request_id === item.id && entry.id === item.selected_candidate_id);
    if (!candidate) {
      throw platformProviderBlocked(
        "visual-acquire",
        projectArtifacts.visualCandidates,
        `${item.id}: selected visual candidate does not belong to this request`,
        platformVisualSelectionRemediation(),
        { request_id: item.id, selected_candidate_id: item.selected_candidate_id, required_artifact: projectArtifacts.visualCandidates },
      );
    }
    if (!candidate.renderable) {
      throw platformProviderBlocked(
        "visual-acquire",
        projectArtifacts.visualCandidates,
        `${candidate.id}: selected visual candidate is not renderable`,
        platformVisualSelectionRemediation(),
        { request_id: item.id, candidate_id: candidate.id, required_field: "renderable" },
      );
    }
    if (!candidate.local_path) {
      throw platformProviderBlocked(
        "visual-acquire",
        projectArtifacts.visualCandidates,
        `${candidate.id}: platform mode visual acquisition requires local_path`,
        platformVisualSelectionRemediation(),
        {
          request_id: item.id,
          candidate_id: candidate.id,
          provider: candidate.provider,
          download_url_present: Boolean(candidate.download_url),
          required_field: "local_path",
        },
      );
    }
    assertReadablePlatformVisualPath(projectPath, candidate, "local_path", "visual-acquire");
  }
}

function platformVisualRequestBlocked(requestId: string, field: "selected_candidate_id" | "selection_reason") {
  return platformProviderBlocked(
    "visual-acquire",
    projectArtifacts.visualRequest,
    `${requestId}: platform mode visual acquisition requires nonblank ${field}`,
    platformVisualSelectionRemediation(),
    { request_id: requestId, required_field: field, required_artifact: projectArtifacts.visualRequest },
  );
}

function assertReadablePlatformVisualPath(projectPath: string, candidate: VisualCandidate, field: "preview_path" | "local_path", stage: string): void {
  try {
    const relativePath = candidate[field];
    if (!relativePath) throw new Error("missing path");
    const projectRoot = fsRuntime.realpathSync(projectPath);
    const filePath = fsRuntime.realpathSync(join(projectPath, relativePath));
    const fromRoot = relative(projectRoot, filePath);
    if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || pathRuntime.isAbsolute(fromRoot)) throw new Error("outside project");
    if (!statSync(filePath).isFile()) throw new Error("not a file");
    fsRuntime.accessSync(filePath, fsRuntime.constants.R_OK);
  } catch {
    throw platformProviderBlocked(
      stage,
      projectArtifacts.visualCandidates,
      `${candidate.id}: ${field} must reference a readable project-local file`,
      platformVisualSelectionRemediation(),
      { request_id: candidate.request_id, candidate_id: candidate.id, invalid_field: field, required_artifact: projectArtifacts.visualCandidates },
    );
  }
}

function platformVisualSelectionRemediation(): string {
  return "Host/agent must review visual candidates, write selected_candidate_id and selection_reason, and materialize only the selected candidate's complete project-local local_path before visual-acquire.";
}

function platformCandidateProviderUrl(candidates: VisualCandidate[]): { candidate: VisualCandidate; field: "download_url" | "preview_url" | "source_url" } | undefined {
  for (const candidate of candidates) {
    if (candidate.download_url) return { candidate, field: "download_url" };
    if (candidate.preview_url) return { candidate, field: "preview_url" };
    if (candidate.source_url) return { candidate, field: "source_url" };
  }
  return undefined;
}

function platformProviderBlocked(stage: string, artifact: string, message: string, remediation: string, request: Record<string, unknown>): Error & {
  code: string;
  provider_execution_mode: ProviderExecutionMode;
  stage: string;
  artifact: string;
  remediation: string;
  request: Record<string, unknown>;
} {
  const error = new Error(message) as Error & {
    code: string;
    provider_execution_mode: ProviderExecutionMode;
    stage: string;
    artifact: string;
    remediation: string;
    request: Record<string, unknown>;
  };
  error.code = "PLATFORM_PROVIDER_BLOCKED";
  error.provider_execution_mode = "platform";
  error.stage = stage;
  error.artifact = artifact;
  error.remediation = remediation;
  error.request = request;
  return error;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function optionalWhisperTime(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return whisperTime(value);
}

function whisperTime(value: unknown): number {
  if (typeof value === "number") return value > 1000 ? value / 1000 : value;
  if (typeof value !== "string") throw new Error("missing whisper timestamp");
  const parts = value.replace(",", ".").split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) throw new Error(`invalid whisper timestamp: ${value}`);
  return parts.reduce((seconds, part) => seconds * 60 + part, 0);
}

function parseVttTranscript(vtt: string, sourceId: string): TranscriptArtifact["segments"] {
  const segments: TranscriptArtifact["segments"] = [];
  const lines = vtt.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index]?.match(/^\s*(\d\d:\d\d:\d\d[.,]\d+|\d\d:\d\d[.,]\d+)\s+-->\s+(\d\d:\d\d:\d\d[.,]\d+|\d\d:\d\d[.,]\d+)/);
    if (!match) continue;
    const textLines: string[] = [];
    index += 1;
    while (index < lines.length && lines[index]?.trim()) {
      textLines.push(lines[index]!.trim());
      index += 1;
    }
    const text = textLines.join(" ").trim();
    if (!text) continue;
    segments.push({ source_id: sourceId, start: whisperTime(match[1]), end: whisperTime(match[2]), text });
  }
  if (segments.length === 0) throw new Error("Cloudflare Whisper VTT had no timed cues");
  return segments;
}

function defaultProjectPath(inputPath: string): string {
  const slug = basename(inputPath, extname(inputPath)).replace(/[^a-zA-Z0-9._-]+/g, "-") || "project";
  return join("koubo-clips", slug);
}

function normalizeText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function isChinese(language: string | undefined): boolean {
  return Boolean(language && /^(zh|cmn|yue)/i.test(language));
}

function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-") || "slot";
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function ok<TCommand extends string, TData>(command: TCommand, data: TData): CommandResult<TCommand, TData> {
  return { ok: true, command, data };
}

function fail<TCommand extends string, TData>(command: TCommand, code: string, error: unknown): CommandResult<TCommand, TData> {
  const details = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  const response = {
    code: typeof details.code === "string" ? details.code : code,
    message: error instanceof Error ? error.message : String(error),
  } as {
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
  if (details.provider_execution_mode === "standalone" || details.provider_execution_mode === "platform") response.provider_execution_mode = details.provider_execution_mode;
  if (typeof details.stage === "string") response.stage = details.stage;
  if (typeof details.artifact === "string") response.artifact = details.artifact;
  if (typeof details.remediation === "string") response.remediation = details.remediation;
  if (details.request && typeof details.request === "object" && !Array.isArray(details.request)) response.request = details.request as Record<string, unknown>;
  if (typeof details.schema_version === "string") response.schema_version = details.schema_version;
  if (typeof details.schema_digest === "string") response.schema_digest = details.schema_digest;
  if (Array.isArray(details.issues)) response.issues = details.issues as Array<{ path: string; keyword: string; message: string }>;
  return { ok: false, command, error: response };
}

function lifecycleCommandError(code: string, message: string, artifact: string, remediation: string, stage = "project.compile-edl"): Error & {
  code: string;
  stage: string;
  artifact: string;
  remediation: string;
} {
  const error = new Error(message) as Error & { code: string; stage: string; artifact: string; remediation: string };
  error.code = code;
  error.stage = stage;
  error.artifact = artifact;
  error.remediation = remediation;
  return error;
}

function errorCode(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string") return (error as { code: string }).code;
  return fallback;
}

function isArtifactContractError(error: unknown): boolean {
  const code = error && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
  return code === "ARTIFACT_VALIDATION_FAILED" || code === "CONTRACT_SCHEMA_UNSUPPORTED";
}

function errorRemediation(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && typeof (error as { remediation?: unknown }).remediation === "string") {
    return (error as { remediation: string }).remediation;
  }
  return fallback;
}
