import { spawnSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import {
  type AnalysisArtifact,
  type AnalysisCandidate,
  type AssetManifestArtifact,
  type CommandResult,
  type EdlArtifact,
  type EdlEntry,
  type EnrichmentCard,
  type EnrichmentElement,
  type EnrichmentPlanArtifact,
  type EnrichmentMusic,
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
  type SourcesManifest,
  type TranscriptArtifact,
  type VisualAcquisitionArtifact,
  type VisualCandidatesArtifact,
  type VisualRequestArtifact,
  type VisualReviewArtifact,
  parseAssetManifest,
  parseFocusCandidates,
  parseFocusFrames,
  parseFocusGrounding,
  parseFocusReview,
  parseEdl,
  parseEditPlan,
  parseEnrichmentPlan,
  parseAnalysis,
  parseProductionProposal,
  parseReviewPackage,
  parseSourcesManifest,
  parseTranscript,
  parseVisualAcquisition,
  parseVisualRequest,
  parseVisualReview,
  projectArtifacts,
} from "./artifacts";
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
import { buildMusicCatalog, renderMusicCatalogMarkdown, type MusicCatalogArtifact } from "./music/catalog";
import {
  acquireVisualAssets,
  buildVisualCatalog,
  buildVisualReview,
  renderVisualCandidatesMarkdown,
  renderVisualCatalogMarkdown,
  renderVisualReviewMarkdown,
  searchVisualAssets,
  type VisualCatalogArtifact,
} from "./visual/acquire";

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

type EnrichmentStoryboard = {
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
    emphasis: EnrichmentPlanArtifact["captions"]["emphasis"];
  };
  qa_checks: ProjectQaCheck[];
  cards: StoryboardCard[];
  elements: StoryboardElement[];
  music: EnrichmentMusic[];
};

export type ProjectCreateData = {
  project_path: string;
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
  enrichment_applied: boolean;
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
  cdn_dependencies: HyperframesDependencySummary[];
  asset_summary: ProjectAssetSummary[];
  music_review?: MusicReviewArtifact;
  inspection_checks: ProjectInspectionCheck[];
  inspection_frames: string[];
  warnings: string[];
  report_path: string;
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

const CUT_PADDING_SECONDS = 0.05;

export function createProject(
  inputPaths: string[],
  options: { projectPath?: string } = {},
): CommandResult<"project.create", ProjectCreateData> {
  try {
    if (inputPaths.length === 0) throw new Error("project create requires at least one video");
    const projectPath = options.projectPath ?? defaultProjectPath(inputPaths[0]);
    if (existsSync(projectPath)) throw new Error(`project already exists: ${projectPath}`);
    mkdirSync(join(projectPath, "source"), { recursive: true });
    mkdirSync(join(projectPath, "assets", "images"), { recursive: true });
    mkdirSync(join(projectPath, "assets", "icons"), { recursive: true });
    mkdirSync(join(projectPath, "assets", "lottie"), { recursive: true });
    mkdirSync(join(projectPath, "assets", "visuals"), { recursive: true });
    mkdirSync(join(projectPath, "assets", "music"), { recursive: true });
    mkdirSync(join(projectPath, "assets", "overlays"), { recursive: true });
    mkdirSync(join(projectPath, "renders"), { recursive: true });

    const sources = inputPaths.map((inputPath, index) => {
      if (!existsSync(inputPath)) throw new Error(`source not found: ${inputPath}`);
      const sourceId = `src-${String(index + 1).padStart(3, "0")}`;
      const ext = extname(inputPath) || ".mp4";
      const projectRelativePath = join("source", `${String(index + 1).padStart(3, "0")}-original${ext}`);
      const destination = join(projectPath, projectRelativePath);
      copyFileSync(inputPath, destination);
      const probe = probeMedia(destination);
      return {
        source_id: sourceId,
        order: index,
        original_filename: basename(inputPath),
        project_path: projectRelativePath,
        duration_seconds: probe.duration_seconds,
        probe,
      };
    });

    const sourcesPath = join(projectPath, projectArtifacts.sources);
    writeJson(sourcesPath, { sources });
    return ok("project.create", { project_path: projectPath, sources_path: sourcesPath, source_count: sources.length });
  } catch (error) {
    return fail("project.create", "PROJECT_CREATE_FAILED", error);
  }
}

export function exploreProject(
  projectPath: string,
  options: { asr?: AsrMode; asrProvider?: AsrProvider } = {},
): Promise<CommandResult<"project.explore", ProjectExploreData>> {
  try {
    const asr = options.asr ?? "auto";
    const manifest = readManifest(projectPath);
    const transcriptPath = join(projectPath, projectArtifacts.transcriptJson);
    if (!existsSync(transcriptPath)) {
      if (asr === "off" || asr === "external") throw new Error(`missing transcript.json for --asr ${asr}`);
      return transcribeProject(projectPath, manifest, options.asrProvider).then((transcript) => {
        writeJson(transcriptPath, transcript);
        return finishExploreProject(projectPath, manifest, transcriptPath);
      }).catch((error) => fail("project.explore", "PROJECT_EXPLORE_FAILED", error));
    }

    return Promise.resolve(finishExploreProject(projectPath, manifest, transcriptPath));
  } catch (error) {
    return Promise.resolve(fail("project.explore", "PROJECT_EXPLORE_FAILED", error));
  }
}

function finishExploreProject(projectPath: string, manifest: SourcesManifest, transcriptPath: string): CommandResult<"project.explore", ProjectExploreData> {
  const transcript = clampTranscriptToSources(parseTranscript(readJson(transcriptPath), manifest), manifest);
  writeJson(transcriptPath, transcript);

  const analysis = detectCandidates(transcript);
  const analysisPath = join(projectPath, projectArtifacts.analysis);
  writeJson(analysisPath, analysis);

  const materialReportPath = join(projectPath, projectArtifacts.materialReport);
  writeFileSync(materialReportPath, renderMaterialReport(manifest, transcript, analysis));
  writeFileSync(join(projectPath, projectArtifacts.transcriptMarkdown), renderTranscriptMarkdown(transcript));

  return ok("project.explore", {
    project_path: projectPath,
    transcript_path: transcriptPath,
    analysis_path: analysisPath,
    material_report_path: materialReportPath,
    candidate_count: analysis.candidates.length,
    timing_granularity: transcript.timing_granularity,
  });
}

export function reviewProject(projectPath: string): CommandResult<"project.review", ProjectReviewData> {
  try {
    const manifest = readManifest(projectPath);
    const transcript = parseTranscript(readJson(join(projectPath, projectArtifacts.transcriptJson)), manifest);
    const analysis = parseAnalysis(readJson(join(projectPath, projectArtifacts.analysis)), manifest);
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
    writeFileSync(reviewMarkdownPath, renderReviewMarkdown(reviewPackage, transcript.timing_granularity));
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

export function proposalProject(projectPath: string): CommandResult<"project.proposal", ProjectProposalData> {
  try {
    const manifest = readManifest(projectPath);
    const review = parseReviewPackage(readJson(join(projectPath, projectArtifacts.reviewJson)), manifest);
    const proposalPath = join(projectPath, projectArtifacts.productionProposal);
    const proposal = parseProductionProposal(readJson(proposalPath));
    validateProductionProposalAgainstReview(proposal, review);
    const warnings = productionProposalWarnings(proposal);
    const markdownPath = join(projectPath, projectArtifacts.productionProposalMarkdown);
    writeFileSync(markdownPath, renderProductionProposalMarkdown(proposal, warnings));
    const summaries = proposal.options.map(productionProposalOptionSummary);
    const recommendedOption = proposal.options.find((option) => option.id === proposal.recommended_option_id)!;
    return ok("project.proposal", {
      project_path: projectPath,
      proposal_path: proposalPath,
      proposal_markdown_path: markdownPath,
      source_mode: proposal.source_mode,
      presentation_intent: proposal.presentation_intent,
      recommended_option_id: proposal.recommended_option_id,
      recommended_option: productionProposalOptionSummary(recommendedOption),
      options: summaries,
      warnings,
      next_required_artifacts: nextRequiredArtifactsForProposal(recommendedOption),
    });
  } catch (error) {
    return fail("project.proposal", "PROJECT_PROPOSAL_FAILED", error);
  }
}

export function enrichPlanProject(projectPath: string): CommandResult<"project.enrich-plan", ProjectEnrichPlanData> {
  try {
    const { plan, assets, duration, warnings } = validateEnrichmentPlan(projectPath);
    const visualCount = plan.cards.length;
    const musicCount = plan.music.length;
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
      cdn_dependencies: hyperframes.cdn_dependencies,
      asset_summary: summarizeAssets(projectPath, assets),
      qa_checks: qaChecks,
    });
  } catch (error) {
    return fail("project.enrich-plan", "PROJECT_ENRICH_PLAN_FAILED", error);
  }
}

export function elementCatalogProject(projectPath: string): CommandResult<"project.element-catalog", ProjectElementCatalogData> {
  try {
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

export function focusCandidatesProject(projectPath: string): CommandResult<"project.focus-candidates", ProjectFocusCandidatesData> {
  try {
    const edl = readOrBuildEdl(projectPath);
    const duration = edlDuration(edl);
    const candidatesPath = join(projectPath, projectArtifacts.focusCandidates);
    const candidates = parseFocusCandidates(readJson(candidatesPath));
    const warnings = validateFocusCandidates(candidates, duration);
    const markdownPath = join(projectPath, projectArtifacts.focusCandidatesMarkdown);
    writeFileSync(markdownPath, renderFocusCandidatesMarkdown(candidates, warnings));
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
    return fail("project.focus-candidates", "PROJECT_FOCUS_CANDIDATES_FAILED", error);
  }
}

export function focusFramesProject(projectPath: string): CommandResult<"project.focus-frames", ProjectFocusFramesData> {
  try {
    const edl = readOrBuildEdl(projectPath);
    const candidates = parseFocusCandidates(readJson(join(projectPath, projectArtifacts.focusCandidates)));
    const frames = extractFocusFrames(projectPath, candidates, edl);
    const framesPath = join(projectPath, projectArtifacts.focusFrames);
    writeJson(framesPath, { version: "1.0", frames } satisfies FocusFramesArtifact);
    return ok("project.focus-frames", {
      project_path: projectPath,
      focus_frames_path: framesPath,
      frame_count: frames.length,
      frames,
    });
  } catch (error) {
    return fail("project.focus-frames", "PROJECT_FOCUS_FRAMES_FAILED", error);
  }
}

export function focusGroundingProject(projectPath: string): CommandResult<"project.focus-grounding", ProjectFocusGroundingData> {
  try {
    const candidates = parseFocusCandidates(readJson(join(projectPath, projectArtifacts.focusCandidates)));
    const frames = parseFocusFrames(readJson(join(projectPath, projectArtifacts.focusFrames)));
    const groundingPath = join(projectPath, projectArtifacts.focusGrounding);
    const grounding = parseFocusGrounding(readJson(groundingPath));
    const review = buildFocusReview(projectPath, candidates, frames, grounding, false);
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
    return fail("project.focus-grounding", "PROJECT_FOCUS_GROUNDING_FAILED", error);
  }
}

export function focusReviewProject(projectPath: string): CommandResult<"project.focus-review", ProjectFocusReviewData> {
  try {
    const candidates = parseFocusCandidates(readJson(join(projectPath, projectArtifacts.focusCandidates)));
    const frames = parseFocusFrames(readJson(join(projectPath, projectArtifacts.focusFrames)));
    const grounding = parseFocusGrounding(readJson(join(projectPath, projectArtifacts.focusGrounding)));
    const review = buildFocusReview(projectPath, candidates, frames, grounding, true);
    const reviewPath = join(projectPath, projectArtifacts.focusReview);
    const markdownPath = join(projectPath, projectArtifacts.focusReviewMarkdown);
    writeJson(reviewPath, review);
    writeFileSync(markdownPath, renderFocusReviewMarkdown(candidates, review));
    return ok("project.focus-review", {
      project_path: projectPath,
      focus_review_path: reviewPath,
      focus_review_markdown_path: markdownPath,
      item_count: review.items.length,
      proposed_element_count: review.proposed_elements.length,
      proposed_elements: review.proposed_elements,
      warnings: review.warnings,
    });
  } catch (error) {
    return fail("project.focus-review", "PROJECT_FOCUS_REVIEW_FAILED", error);
  }
}

export function musicCatalogProject(projectPath: string): CommandResult<"project.music-catalog", ProjectMusicCatalogData> {
  try {
    const catalog = buildMusicCatalog();
    const catalogPath = join(projectPath, projectArtifacts.musicCatalog);
    const markdownPath = join(projectPath, projectArtifacts.musicCatalogMarkdown);
    writeJson(catalogPath, catalog);
    writeFileSync(markdownPath, renderMusicCatalogMarkdown(catalog));
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

export async function musicAcquireProject(projectPath: string): Promise<CommandResult<"project.music-acquire", ProjectMusicAcquireData>> {
  try {
    const acquisition = await acquireMusicAsset(projectPath);
    const review = buildMusicReview(acquisition);
    const acquisitionPath = join(projectPath, projectArtifacts.musicAcquisition);
    const reviewPath = join(projectPath, projectArtifacts.musicReview);
    const reviewMarkdownPath = join(projectPath, projectArtifacts.musicReviewMarkdown);
    writeJson(acquisitionPath, acquisition);
    writeJson(reviewPath, review);
    writeFileSync(reviewMarkdownPath, renderMusicReviewMarkdown(review));
    return ok("project.music-acquire", {
      project_path: projectPath,
      music_acquisition_path: acquisitionPath,
      music_review_path: reviewPath,
      asset_manifest_path: join(projectPath, projectArtifacts.assetManifest),
      acquired: acquisition.acquired,
      asset: acquisition.asset
        ? {
            id: acquisition.asset.id,
            path: acquisition.asset.path,
            type: acquisition.asset.type,
            source: acquisition.asset.source,
            provider: acquisition.asset.provider,
            license: acquisition.asset.license,
            duration_seconds: acquisition.asset.duration_seconds,
          }
        : undefined,
      warnings: acquisition.warnings,
    });
  } catch (error) {
    return fail("project.music-acquire", "PROJECT_MUSIC_ACQUIRE_FAILED", error);
  }
}

export async function musicReviewProject(projectPath: string): Promise<CommandResult<"project.music-review", ProjectMusicReviewData>> {
  try {
    const acquisitionPath = join(projectPath, projectArtifacts.musicAcquisition);
    const acquisition = existsSync(acquisitionPath) ? (readJson(acquisitionPath) as MusicAcquisitionArtifact) : await acquireMusicAsset(projectPath);
    const review = buildMusicReview(acquisition);
    const reviewPath = join(projectPath, projectArtifacts.musicReview);
    const reviewMarkdownPath = join(projectPath, projectArtifacts.musicReviewMarkdown);
    if (!existsSync(acquisitionPath)) writeJson(acquisitionPath, acquisition);
    writeJson(reviewPath, review);
    writeFileSync(reviewMarkdownPath, renderMusicReviewMarkdown(review));
    return ok("project.music-review", {
      project_path: projectPath,
      music_review_path: reviewPath,
      music_review_markdown_path: reviewMarkdownPath,
      review,
    });
  } catch (error) {
    return fail("project.music-review", "PROJECT_MUSIC_REVIEW_FAILED", error);
  }
}

export function visualCatalogProject(projectPath: string): CommandResult<"project.visual-catalog", ProjectVisualCatalogData> {
  try {
    const catalog = buildVisualCatalog();
    const catalogPath = join(projectPath, projectArtifacts.visualCatalog);
    const markdownPath = join(projectPath, projectArtifacts.visualCatalogMarkdown);
    writeJson(catalogPath, catalog);
    writeFileSync(markdownPath, renderVisualCatalogMarkdown(catalog));
    return ok("project.visual-catalog", {
      project_path: projectPath,
      visual_catalog_path: catalogPath,
      visual_catalog_markdown_path: markdownPath,
      providers: catalog.providers,
      runtime_allowlist: catalog.runtime_allowlist,
    });
  } catch (error) {
    return fail("project.visual-catalog", "PROJECT_VISUAL_CATALOG_FAILED", error);
  }
}

export async function visualSearchProject(projectPath: string): Promise<CommandResult<"project.visual-search", ProjectVisualSearchData>> {
  try {
    const requestPath = join(projectPath, projectArtifacts.visualRequest);
    const request = parseVisualRequest(readJson(requestPath));
    const candidates = await searchVisualAssets(projectPath);
    const candidatesPath = join(projectPath, projectArtifacts.visualCandidates);
    const markdownPath = join(projectPath, projectArtifacts.visualCandidatesMarkdown);
    writeJson(candidatesPath, candidates);
    writeFileSync(markdownPath, renderVisualCandidatesMarkdown(candidates));
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
    return fail("project.visual-search", "PROJECT_VISUAL_SEARCH_FAILED", error);
  }
}

export async function visualAcquireProject(projectPath: string): Promise<CommandResult<"project.visual-acquire", ProjectVisualAcquireData>> {
  try {
    const acquisition = await acquireVisualAssets(projectPath);
    const request = parseVisualRequest(readJson(join(projectPath, projectArtifacts.visualRequest)));
    const review = buildVisualReview(acquisition, request);
    const acquisitionPath = join(projectPath, projectArtifacts.visualAcquisition);
    const reviewPath = join(projectPath, projectArtifacts.visualReview);
    const reviewMarkdownPath = join(projectPath, projectArtifacts.visualReviewMarkdown);
    writeJson(acquisitionPath, acquisition);
    writeJson(reviewPath, review);
    writeFileSync(reviewMarkdownPath, renderVisualReviewMarkdown(review));
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
    return fail("project.visual-acquire", "PROJECT_VISUAL_ACQUIRE_FAILED", error);
  }
}

export function visualReviewProject(projectPath: string): CommandResult<"project.visual-review", ProjectVisualReviewData> {
  try {
    const acquisitionPath = join(projectPath, projectArtifacts.visualAcquisition);
    if (!existsSync(acquisitionPath)) throw new Error("visual-acquisition.json is required before visual-review");
    const acquisition = parseVisualAcquisition(readJson(acquisitionPath));
    const requestPath = join(projectPath, projectArtifacts.visualRequest);
    const request = existsSync(requestPath) ? parseVisualRequest(readJson(requestPath)) : undefined;
    const review = buildVisualReview(acquisition, request);
    const reviewPath = join(projectPath, projectArtifacts.visualReview);
    const reviewMarkdownPath = join(projectPath, projectArtifacts.visualReviewMarkdown);
    writeJson(reviewPath, review);
    writeFileSync(reviewMarkdownPath, renderVisualReviewMarkdown(review));
    return ok("project.visual-review", {
      project_path: projectPath,
      visual_review_path: reviewPath,
      visual_review_markdown_path: reviewMarkdownPath,
      review,
    });
  } catch (error) {
    return fail("project.visual-review", "PROJECT_VISUAL_REVIEW_FAILED", error);
  }
}

export function renderProject(projectPath: string): CommandResult<"project.render", ProjectRenderData> {
  try {
    const manifest = readManifest(projectPath);
    const transcript = parseTranscript(readJson(join(projectPath, projectArtifacts.transcriptJson)), manifest);
    const analysis = parseAnalysis(readJson(join(projectPath, projectArtifacts.analysis)), manifest);
    const editPlan = parseEditPlan(readJson(join(projectPath, projectArtifacts.editPlan)), manifest);
    const edl = buildEdl(projectPath, manifest, transcript, analysis, editPlan);
    const edlPath = join(projectPath, projectArtifacts.edl);
    writeJson(edlPath, edl);
    const subtitlesPath = join(projectPath, projectArtifacts.subtitles);
    writeFileSync(subtitlesPath, renderSrt(transcript, edl));
    const cleanRenderPath = resolve(projectPath, "renders", "clean.mp4");
    renderEdl(projectPath, edl, cleanRenderPath);
    const enrichment = existsSync(join(projectPath, projectArtifacts.enrichmentPlan)) ? validateEnrichmentPlan(projectPath, edl) : undefined;
    const finalRenderPath = enrichment ? renderEnrichedVideo(projectPath, cleanRenderPath, subtitlesPath, enrichment.plan, enrichment.assets) : undefined;
    return ok("project.render", {
      project_path: projectPath,
      edl_path: edlPath,
      subtitles_path: subtitlesPath,
      clean_render_path: cleanRenderPath,
      final_render_path: finalRenderPath,
      enrichment_applied: Boolean(finalRenderPath),
      expected_duration_seconds: edlDuration(edl),
    });
  } catch (error) {
    return fail("project.render", "PROJECT_RENDER_FAILED", error);
  }
}

export function inspectProject(projectPath: string): CommandResult<"project.inspect", ProjectInspectData> {
  try {
    const manifest = readManifest(projectPath);
    const edl = parseEdl(readJson(join(projectPath, projectArtifacts.edl)), manifest);
    const analysis = parseAnalysis(readJson(join(projectPath, projectArtifacts.analysis)), manifest);
    const editPlan = parseEditPlan(readJson(join(projectPath, projectArtifacts.editPlan)), manifest);
    const reviewPath = join(projectPath, projectArtifacts.reviewJson);
    const unresolvedRisks = existsSync(reviewPath) ? parseReviewPackage(readJson(reviewPath), manifest).unresolved_risks : [];
    const decisions = inspectDecisions(analysis, editPlan, unresolvedRisks);
    const outputPath = existsSync(join(projectPath, "renders", "final.mp4")) ? join(projectPath, "renders", "final.mp4") : join(projectPath, "renders", "clean.mp4");
    if (!existsSync(outputPath)) throw new Error("rendered MP4 is missing");
    const probe = probeMedia(outputPath);
    if (!probe.probe_ok) throw new Error(`rendered MP4 probe failed: ${probe.probe_error}`);
    const duration = probe.duration_seconds;
    const expected = edlDuration(edl);
    const subtitlesPath = join(projectPath, projectArtifacts.subtitles);
    const enrichmentPlanPath = join(projectPath, projectArtifacts.enrichmentPlan);
    const enrichmentPlan = existsSync(enrichmentPlanPath) ? parseEnrichmentPlan(readJson(enrichmentPlanPath)) : undefined;
    const assetManifestPath = join(projectPath, projectArtifacts.assetManifest);
    const assetManifest = existsSync(assetManifestPath) ? parseAssetManifest(readJson(assetManifestPath)) : { assets: [] };
    const hyperframes = enrichmentPlan ? summarizeHyperframesBlocks(enrichmentPlan, assetManifest) : { block_usage: [], cdn_dependencies: [] };
    const elementUsage = enrichmentPlan ? summarizeHyperframesElements(enrichmentPlan) : [];
    const assetSummary = summarizeAssets(projectPath, assetManifest);
    const musicReviewPath = join(projectPath, projectArtifacts.musicReview);
    const musicReview = existsSync(musicReviewPath) ? (readJson(musicReviewPath) as MusicReviewArtifact) : undefined;
    const enrichmentSummary = enrichmentPlan ? summarizeEnrichment(enrichmentPlan, hyperframes.block_usage, elementUsage) : [];
    const enrichmentApplied = outputPath.endsWith("final.mp4") && Boolean(enrichmentPlan);
    const warnings = inspectWarnings(duration, expected, subtitlesPath);
    if (enrichmentPlan) warnings.push(...enrichmentWarnings(enrichmentPlan));
    if (existsSync(enrichmentPlanPath) && !enrichmentApplied) warnings.push("enrichment-plan.json exists but renders/final.mp4 is missing");
    const subtitleWarningPath = join(projectPath, ".render", "enrichment", "subtitles-not-burned.txt");
    if (existsSync(subtitleWarningPath) && readFileSync(subtitleWarningPath, "utf8").trim()) warnings.push("ffmpeg subtitles filter unavailable; subtitles.srt was generated but not burned into final.mp4");
    const qaChecks = enrichmentPlan ? (readStoryboardQaChecks(projectPath) ?? buildQaChecks(projectPath, enrichmentPlan, assetManifest)) : [];
    const inspectionChecks = enrichmentApplied ? extractInspectionChecks(projectPath, outputPath, qaChecks) : [];
    const inspectionFrames = inspectionChecks.flatMap((check) => check.frame_paths);
    const reportPath = join(projectPath, projectArtifacts.report);
    writeFileSync(
      reportPath,
      renderInspectReport(
        outputPath,
        duration,
        expected,
        existsSync(subtitlesPath),
        enrichmentPlan?.profile.source_mode,
        enrichmentSummary,
        hyperframes.block_usage,
        elementUsage,
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
    return ok("project.inspect", {
      project_path: projectPath,
      output_path: outputPath,
      duration_seconds: duration,
      expected_duration_seconds: expected,
      captions_present: existsSync(subtitlesPath),
      removed_ranges: decisions.removed_ranges,
      retained_risks: decisions.retained_risks,
      enrichment_applied: enrichmentApplied,
      source_mode: enrichmentPlan?.profile.source_mode,
      enrichment_summary: enrichmentSummary,
      block_usage: hyperframes.block_usage,
      element_usage: elementUsage,
      cdn_dependencies: hyperframes.cdn_dependencies,
      asset_summary: assetSummary,
      music_review: musicReview,
      inspection_checks: inspectionChecks,
      inspection_frames: inspectionFrames,
      warnings,
      report_path: reportPath,
    });
  } catch (error) {
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

export function validateEnrichmentPlan(
  projectPath: string,
  edl?: EdlArtifact,
): { plan: EnrichmentPlanArtifact; assets: AssetManifestArtifact; duration: number; warnings: string[] } {
  const plan = parseEnrichmentPlan(readJson(join(projectPath, projectArtifacts.enrichmentPlan)));
  const assetPath = join(projectPath, projectArtifacts.assetManifest);
  const assets = existsSync(assetPath) ? parseAssetManifest(readJson(assetPath)) : { assets: [] };
  const visualReviewPath = join(projectPath, projectArtifacts.visualReview);
  const visualReview = existsSync(visualReviewPath) ? parseVisualReview(readJson(visualReviewPath)) : undefined;
  const duration = edlDuration(edl ?? readOrBuildEdl(projectPath));
  const assetIds = new Set(assets.assets.map((asset) => asset.id));
  for (const item of [...plan.cards, ...plan.music, ...plan.elements]) {
    if (item.end > duration + 0.05) throw new Error(`slot ${item.id} exceeds output duration`);
    if (item.asset_id) {
      if (!assetIds.has(item.asset_id)) throw new Error(`slot ${item.id} references missing asset_id: ${item.asset_id}`);
      const asset = assets.assets.find((assetItem) => assetItem.id === item.asset_id)!;
      if (!existsSync(projectAssetPath(projectPath, asset.path))) throw new Error(`asset file missing for ${item.asset_id}: ${asset.path}`);
      if ("element_type" in item && item.element_type === "visual_asset") validateVisualAssetForRender(item, asset, visualReview);
    }
    if ("element_type" in item && item.element_type === "sfx") getVendoredSfx(item.sfx_id ?? item.element_id);
  }
  for (const element of plan.elements) {
    validateElementAdapter(plan, element);
  }
  for (const emphasis of plan.captions.emphasis) {
    if (emphasis.end > duration + 0.05) throw new Error(`caption emphasis ${emphasis.text} exceeds output duration`);
  }
  return { plan, assets, duration, warnings: enrichmentWarnings(plan) };
}

type OutputTimelineSegment = {
  source_id: string;
  source_path: string;
  source_start: number;
  source_end: number;
  output_start: number;
  output_end: number;
  output_order: number;
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
    if (candidate.recommended_treatment === "generated_asset" && candidate.element_type !== "generated_asset" && candidate.element_type !== "visual_asset") {
      warnings.push(`${candidate.id}: recommended_treatment=generated_asset but element_type=${candidate.element_type}`);
    }
    if (candidate.recommended_treatment === "source_ui_component" && candidates.source_mode === "screen_recording" && !candidate.requires_grounding) {
      warnings.push(`${candidate.id}: source_ui_component in screen_recording should have frame grounding evidence`);
    }
  }
  return warnings;
}

function extractFocusFrames(projectPath: string, candidates: FocusCandidatesArtifact, edl: EdlArtifact): FocusFrame[] {
  if (!commandExists("ffmpeg")) throw new Error("ffmpeg not found for focus frames");
  const timeline = buildOutputTimeline(edl);
  const dir = join(projectPath, ".focus", "frames");
  mkdirSync(dir, { recursive: true });
  const frames: FocusFrame[] = [];
  for (const candidate of candidates.candidates.filter((item) => item.requires_grounding)) {
    focusSampleTimes(candidate).forEach((time, index) => {
      const mapped = mapOutputTime(timeline, time, candidate.id);
      const id = `${candidate.id}-source-${index + 1}`;
      const relativePath = join(".focus", "frames", `${safeFileName(id)}.jpg`);
      const framePath = join(projectPath, relativePath);
      const result = spawnSync("ffmpeg", ["-y", "-ss", formatSeconds(mapped.source_time), "-i", mapped.source_path, "-frames:v", "1", "-q:v", "3", framePath], { encoding: "utf8" });
      if (result.status !== 0) throw new Error(`ffmpeg focus frame failed for ${candidate.id}: ${result.stderr || result.stdout}`);
      frames.push({
        id,
        candidate_id: candidate.id,
        timeline: "source",
        time_seconds: mapped.source_time,
        path: relativePath,
        source_id: mapped.source_id,
      });
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
    if (!existsSync(join(projectPath, frame.path))) throw new Error(`focus grounding frame is missing: ${frame.path}`);
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
        source_path: entry.source_path,
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
  for (const option of proposal.options) {
    for (const candidateId of option.cleanup.cut_candidate_ids) {
      if (!candidateIds.has(candidateId)) throw new Error(`production proposal option ${option.id} references unknown cleanup candidate_id: ${candidateId}`);
    }
  }
}

function productionProposalWarnings(proposal: ProductionProposalArtifact): string[] {
  const warnings: string[] = [];
  const recommended = proposal.options.find((option) => option.id === proposal.recommended_option_id);
  if (recommended && !recommended.recommended) warnings.push(`recommended_option_id ${recommended.id} is not marked recommended=true`);
  const marked = proposal.options.filter((option) => option.recommended);
  if (marked.length === 0) warnings.push("no option is marked recommended=true");
  if (marked.length > 1) warnings.push(`multiple options are marked recommended=true: ${marked.map((option) => option.id).join(", ")}`);
  for (const option of proposal.options) {
    if (option.images.needed) warnings.push(`option ${option.id} needs image asset work after confirmation`);
    if (option.music.source !== "none") warnings.push(`option ${option.id} needs music acquisition after confirmation`);
    if (option.visuals.requires_grounding) warnings.push(`option ${option.id} needs focus grounding after confirmation`);
  }
  return warnings;
}

function productionProposalOptionSummary(option: ProductionProposalOption): ProjectProposalOptionSummary {
  return {
    id: option.id,
    label: option.label,
    recommended: option.recommended,
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
  const manifest = readManifest(projectPath);
  const edlPath = join(projectPath, projectArtifacts.edl);
  if (existsSync(edlPath)) return parseEdl(readJson(edlPath), manifest);
  const transcript = parseTranscript(readJson(join(projectPath, projectArtifacts.transcriptJson)), manifest);
  const analysis = parseAnalysis(readJson(join(projectPath, projectArtifacts.analysis)), manifest);
  const editPlan = parseEditPlan(readJson(join(projectPath, projectArtifacts.editPlan)), manifest);
  return buildEdl(projectPath, manifest, transcript, analysis, editPlan);
}

function projectAssetPath(projectPath: string, relativePath: string): string {
  return join(projectPath, relativePath);
}

function summarizeEnrichment(
  plan: EnrichmentPlanArtifact,
  blockUsage: ProjectEnrichmentBlockUsage[] = summarizeHyperframesBlocks(plan).block_usage,
  elementUsage: ProjectEnrichmentElementUsage[] = summarizeHyperframesElements(plan),
): string[] {
  const blockByCard = new Map(blockUsage.map((usage) => [usage.card_id, usage]));
  return [
    ...(plan.captions.enabled ? [`captions ${plan.captions.identity} emphasis=${plan.captions.emphasis.length}`] : []),
    ...plan.cards.map((card) => {
      const asset = card.asset_id ? ` asset=${card.asset_id}` : "";
      const block = blockByCard.get(card.id);
      const blockText = block ? ` block=${block.block_id} family=${block.template_family}` : "";
      return `${card.id} ${card.kind} ${card.start.toFixed(2)}-${card.end.toFixed(2)} ${card.title}${asset}${blockText}`;
    }),
    ...plan.music.map((slot) => `${slot.id} music_segment ${slot.start.toFixed(2)}-${slot.end.toFixed(2)} asset=${slot.asset_id}`),
    ...elementUsage.map((element) => `${element.id} ${element.element_type} ${element.element_id} ${element.start.toFixed(2)}-${element.end.toFixed(2)} renderable=${element.renderable ? "yes" : "no"} source=${element.source}`),
  ];
}

function summarizeHyperframesElements(plan: EnrichmentPlanArtifact): ProjectEnrichmentElementUsage[] {
  return plan.elements.map((element) => {
    const catalogType = vendoredElementType(element);
    const catalog = catalogType ? getVendoredElement(element.sfx_id ?? element.element_id, catalogType) : undefined;
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
      sfx_id: element.sfx_id,
      zone: element.zone,
      target_rect: element.target_rect,
      anchor_point: element.anchor_point,
      adapter,
    };
  });
}

function requiresHyperframesRecut(plan: EnrichmentPlanArtifact): boolean {
  if (plan.cards.length > 0 || plan.captions.enabled) return true;
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
  const block_usage = plan.cards.map((card) => {
    const blockId = assertRenderableHyperframesBlockForCard(card.block_id ?? defaultHyperframesBlockForCard(card.kind, plan.profile.source_mode), card.kind, plan.profile.source_mode, `${card.id}.block_id`);
    const block = getHyperframesCatalogEntry(blockId);
    if (!block) throw new Error(`unknown HyperFrames block id: ${blockId}`);
    return {
      card_id: card.id,
      block_id: block.id,
      source: block.source,
      visual_role: block.visual_role,
      template_family: block.template_family,
      dependencies: [...block.dependencies],
    };
  });
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
    exists: existsSync(projectAssetPath(projectPath, asset.path)),
    duration_seconds: asset.duration_seconds,
    dimensions: asset.dimensions,
  }));
}

function buildQaChecks(projectPath: string, plan: EnrichmentPlanArtifact, assets: AssetManifestArtifact): ProjectQaCheck[] {
  const visualReviewPath = join(projectPath, projectArtifacts.visualReview);
  const visualReview = existsSync(visualReviewPath) ? parseVisualReview(readJson(visualReviewPath)) : undefined;
  const musicReviewPath = join(projectPath, projectArtifacts.musicReview);
  const musicReview = existsSync(musicReviewPath) ? (readJson(musicReviewPath) as MusicReviewArtifact) : undefined;
  const checks: ProjectQaCheck[] = [];

  for (const card of plan.cards) {
    const asset = card.asset_id ? assets.assets.find((item) => item.id === card.asset_id) : undefined;
    checks.push(
      qaCheck({
        id: `card-${card.id}`,
        source_element_id: card.id,
        kind: "card",
        start: card.start,
        end: card.end,
        expected: `${card.kind}: ${card.title}. ${card.reason}`,
        frame_times: qaFrameTimes(card.start, card.end),
        warnings: [...assetWarnings(projectPath, asset, card.asset_id, false, visualReview), ...coordinateWarnings(plan.profile.source_mode, card)],
        asset,
      }),
    );
  }

  plan.captions.emphasis.forEach((emphasis, index) => {
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
    if (element.source.startsWith("compat:") || element.element_type === "caption_identity") continue;
    const asset = element.asset_id ? assets.assets.find((item) => item.id === element.asset_id) : undefined;
    const visualAsset = element.element_type === "visual_asset";
    const generatedAsset = element.element_type === "generated_asset";
    const warnings = [
      ...assetWarnings(projectPath, asset, element.asset_id, visualAsset || generatedAsset, visualReview),
      ...coordinateWarnings(plan.profile.source_mode, element),
    ];
    if (plan.profile.source_mode === "screen_recording" && element.element_type === "sfx" && !hasSubtleUiSfxReason(element)) {
      warnings.push(`${element.id}: SFX should be subtle and tied to a visible UI action`);
    }
    checks.push(
      qaCheck({
        id: `element-${element.id}`,
        source_element_id: element.id,
        kind: element.element_type === "sfx" ? "sfx" : "element",
        start: element.start,
        end: element.end,
        expected: `${element.element_type} ${element.element_id}: ${element.reason}`,
        frame_times: element.element_type === "sfx" ? [] : qaFrameTimes(element.start, element.end),
        warnings,
        asset,
      }),
    );
  }

  for (const music of plan.music) {
    const asset = assets.assets.find((item) => item.id === music.asset_id);
    const warnings = assetWarnings(projectPath, asset, music.asset_id, false, visualReview);
    if (musicReview?.status === "skipped") warnings.push(`${music.id}: music-review skipped acquisition`);
    if (musicReview?.asset_id && musicReview.asset_id !== music.asset_id) warnings.push(`${music.id}: music-review asset ${musicReview.asset_id} differs from plan asset ${music.asset_id}`);
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

function assetWarnings(projectPath: string, asset: AssetManifestArtifact["assets"][number] | undefined, assetId: string | undefined, requiresProvenance: boolean, visualReview?: VisualReviewArtifact): string[] {
  if (!assetId) return [];
  if (!asset) return [`missing asset ${assetId}`];
  const warnings: string[] = [];
  if (!existsSync(projectAssetPath(projectPath, asset.path))) warnings.push(`missing asset file ${asset.path}`);
  const reviewed = visualReview?.items.some((item) => item.asset_id === asset.id);
  if (requiresProvenance && !reviewed && !asset.provenance && !asset.source && !asset.provider) warnings.push(`${asset.id}: asset provenance is missing`);
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
  for (const card of plan.cards) {
    if (screenLike && card.zone === "full_frame" && card.kind !== "title") warnings.push(`${card.id}: full_frame ${card.kind} may hide source UI in ${sourceMode}`);
    if (sourceMode === "screen_recording" && heavyStyles.has(card.style) && !(card.kind === "title" && card.zone === "full_frame")) {
      warnings.push(`${card.id}: ${card.style} style may be too heavy for screen_recording`);
    }
    if (sourceMode === "screen_recording" && (card.kind === "image" || card.asset_id)) warnings.push(`${card.id}: image asset in screen_recording should be justified by the user goal`);
  }
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
    if (sourceMode === "screen_recording" && element.element_type === "sfx" && !hasSubtleUiSfxReason(element)) warnings.push(`${element.id}: SFX in screen_recording should be subtle and synced to an explicit UI action`);
    if (element.element_type === "animation_rule") {
      const catalog = getVendoredElement(element.element_id, "animation_rule");
      if (catalog?.guidance_only && adapter.render_strategy === "guidance_only") warnings.push(`${element.id}: ${element.element_id} is guidance_only and requires a renderable block/component adapter`);
    }
  }
  if (sourceMode === "screen_recording" && plan.music.length > 0) warnings.push("screen_recording includes music; keep it off unless short-form packaging needs it");
  return warnings;
}

function validateElementAdapter(plan: EnrichmentPlanArtifact, element: EnrichmentElement): void {
  if (element.source.startsWith("compat:")) return;
  const adapter = adapterForPlanElement(element);
  if (adapter.requires_target_rect && !element.target_rect) throw new Error(`${element.id}: ${element.element_id} requires target_rect`);
  if (adapter.requires_anchor_point && !element.anchor_point) throw new Error(`${element.id}: ${element.element_id} requires anchor_point`);
  if (adapter.asset_requirements.length > 0 && !element.asset_id && element.element_type !== "sfx") {
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
  return parseSourcesManifest(readJson(join(projectPath, projectArtifacts.sources)));
}

async function transcribeProject(projectPath: string, manifest: SourcesManifest, provider?: AsrProvider): Promise<TranscriptArtifact> {
  const selected = provider ?? (hasCloudflareWhisperEnv() ? "cloudflare-whisper" : "whisper-cli");
  if (selected === "cloudflare-whisper") return await transcribeWithCloudflareWhisper(projectPath, manifest);
  return transcribeWithWhisperCli(projectPath, manifest);
}

function transcribeWithWhisperCli(projectPath: string, manifest: SourcesManifest): TranscriptArtifact {
  if (!commandExists("whisper-cli")) throw new Error("whisper-cli not found for --asr auto");
  const segments = manifest.sources.flatMap((source) => {
    const audioPath = audioInputPath(projectPath, source.source_id, join(projectPath, source.project_path));
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
  for (const source of manifest.sources) {
    const audioPath = onlineAudioInputPath(projectPath, source.source_id, join(projectPath, source.project_path));
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
  projectPath: string,
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
      if (cutStart > cursor) entries.push(edlEntry(source.source_id, join(projectPath, source.project_path), cursor, cutStart, entries.length, `keep before ${cut.id}`));
      cursor = Math.max(cursor, cutEnd);
    }
    if (duration > cursor) entries.push(edlEntry(source.source_id, join(projectPath, source.project_path), cursor, duration, entries.length, "keep source range"));
  }
  if (entries.length === 0) throw new Error("EDL has no renderable entries");
  return parseEdl({ entries }, manifest);
}

function edlEntry(sourceId: string, sourcePath: string, start: number, end: number, outputOrder: number, reason: string): EdlEntry {
  return { source_id: sourceId, source_path: sourcePath, start, end, output_order: outputOrder, reason };
}

function renderEnrichedVideo(
  projectPath: string,
  cleanRenderPath: string,
  subtitlesPath: string,
  plan: EnrichmentPlanArtifact,
  assets: AssetManifestArtifact,
): string {
  const workDir = resolve(projectPath, ".render", "enrichment");
  mkdirSync(workDir, { recursive: true });
  let current = cleanRenderPath;
  const finalPath = resolve(projectPath, "renders", "final.mp4");
  const subtitleWarningPath = join(workDir, "subtitles-not-burned.txt");
  writeFileSync(subtitleWarningPath, "");

  const needsRecut = requiresHyperframesRecut(plan);
  if (needsRecut) {
    const visualPath = renderHyperframesRecut(projectPath, cleanRenderPath, subtitlesPath, plan, assets, workDir);
    const withAudioPath = join(workDir, "recut-with-audio.mp4");
    attachCleanAudio(visualPath, cleanRenderPath, withAudioPath);
    current = withAudioPath;
  }

  for (const slot of plan.music) {
    const asset = assetForSlot(assets, slot);
    const next = join(workDir, `${safeFileName(slot.id)}-music.mp4`);
    mixMusic(current, projectAssetPath(projectPath, asset.path), slot, next);
    current = next;
  }

  for (const element of plan.elements.filter((item) => item.element_type === "sfx")) {
    const next = join(workDir, `${safeFileName(element.id)}-sfx.mp4`);
    mixSfx(current, getVendoredSfx(element.sfx_id ?? element.element_id).path, element, next);
    current = next;
  }

  if (needsRecut) {
    ffmpeg(["-y", "-i", current, "-c", "copy", "-movflags", "+faststart", finalPath], "ffmpeg enriched final copy failed");
  } else {
    const subtitlesBurned = burnSubtitles(current, subtitlesPath, finalPath, workDir);
    if (!subtitlesBurned) writeFileSync(subtitleWarningPath, "ffmpeg subtitles/drawtext filters unavailable; subtitles.srt was generated but not burned into final.mp4\n");
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
): string {
  if (!commandExists("npx")) throw new Error("npx not found for HyperFrames recut render");
  const workspace = resolve(projectPath, ".hyperframes", "recut");
  const publicDir = join(workspace, "public");
  const cardsDir = join(publicDir, "cards");
  mkdirSync(publicDir, { recursive: true });
  if (existsSync(cardsDir)) for (const name of readdirSync(cardsDir)) unlinkSync(join(cardsDir, name));
  mkdirSync(cardsDir, { recursive: true });
  mkdirSync(join(publicDir, "assets"), { recursive: true });
  copyFileSync(cleanRenderPath, join(publicDir, "clean.mp4"));
  installStoryboardRegistryElements(plan, publicDir);

  const storyboard = buildEnrichmentStoryboard(projectPath, cleanRenderPath, subtitlesPath, plan, assets, publicDir);
  writeJson(join(projectPath, projectArtifacts.storyboard), storyboard);
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
  const cards = stageStoryboardAssets(projectPath, assets, plan.cards, publicDir).map((card) => resolveStoryboardCard(card, plan.profile.source_mode));
  const elements = stageStoryboardElements(projectPath, assets, plan.elements, publicDir);
  const hyperframes = summarizeHyperframesBlocks(plan, assets);
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
    captions: {
      enabled: plan.captions.enabled,
      identity: plan.captions.identity,
      cues: plan.captions.enabled && existsSync(subtitlesPath) ? parseSrtCues(readFileSync(subtitlesPath, "utf8")) : [],
      emphasis: plan.captions.emphasis,
    },
    qa_checks: buildQaChecks(projectPath, plan, assets),
    cards,
    elements,
    music: plan.music,
  };
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

function validateVisualAssetForRender(element: EnrichmentElement, asset: AssetManifestArtifact["assets"][number], review?: VisualReviewArtifact): void {
  if (!isVisualAssetManifestType(asset.type)) throw new Error(`${element.id}: visual_asset ${asset.id} must have a visual asset type`);
  const reviewed = review?.items.some((item) => item.asset_id === asset.id);
  const provenanceOk = reviewed || asset.provenance === "visual-acquisition" || asset.source === "agent_generated" || asset.source === "user";
  if (!provenanceOk) throw new Error(`${element.id}: visual_asset ${asset.id} must be present in visual-review.json or have explicit manifest provenance`);
  if (asset.source_url && !asset.provider) throw new Error(`${element.id}: visual_asset ${asset.id} has source_url but no provider`);
  if ((asset.type === "animated_icon" || asset.type === "lottie" || asset.type === "sticker") && !asset.path.endsWith(".json") && !asset.path.endsWith(".lottie") && !asset.path.endsWith(".svg")) {
    throw new Error(`${element.id}: animated visual asset ${asset.id} must be .json, .lottie, or .svg`);
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
  return element.element_type === "generated_asset" || element.element_type === "visual_asset";
}

function isVisualAssetElement(element: EnrichmentElement): boolean {
  return (element.element_type === "generated_asset" && element.params?.slot_type !== "music_segment") || element.element_type === "visual_asset";
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
  const result = spawnSync("npx", ["--yes", "hyperframes", ...args], { cwd, encoding: "utf8", timeout: timeout * 1000 });
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

function mixSfx(basePath: string, sfxPath: string, element: EnrichmentElement, outputPath: string): void {
  const duration = Math.max(0.01, element.end - element.start);
  const delay = Math.round(element.start * 1000);
  const volume = typeof element.params?.volume === "number" ? Math.max(0, Math.min(1, element.params.volume)) : 0.35;
  const fade = Math.min(typeof element.params?.fade_seconds === "number" ? element.params.fade_seconds : 0.03, duration / 2);
  const voice = "[0:a]aformat=sample_fmts=fltp:channel_layouts=stereo[voice]";
  const sfx = `[1:a]atrim=0:${duration},asetpts=PTS-STARTPTS,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${volume},afade=t=in:st=0:d=${fade},afade=t=out:st=${Math.max(0, duration - fade)}:d=${fade},adelay=${delay}|${delay}[sfx]`;
  const mix = `${voice};${sfx};[voice][sfx]amix=inputs=2:duration=first:dropout_transition=0[a]`;
  ffmpeg(["-y", "-i", basePath, "-i", sfxPath, "-filter_complex", mix, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-movflags", "+faststart", outputPath], "ffmpeg SFX mix failed");
}

function burnSubtitles(basePath: string, subtitlesPath: string, outputPath: string, workDir: string): boolean {
  if (!ffmpegFilterExists("subtitles")) {
    if (!ffmpegFilterExists("drawtext")) {
      ffmpeg(["-y", "-i", basePath, "-c", "copy", "-movflags", "+faststart", outputPath], "ffmpeg final copy failed");
      return false;
    }
    const cues = parseSrtCues(readFileSync(subtitlesPath, "utf8"));
    if (cues.length === 0) {
      ffmpeg(["-y", "-i", basePath, "-c", "copy", "-movflags", "+faststart", outputPath], "ffmpeg final copy failed");
      return false;
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

function renderEdl(projectPath: string, edl: EdlArtifact, outputPath: string) {
  if (!commandExists("ffmpeg")) throw new Error("ffmpeg not found for render");
  const workDir = resolve(projectPath, ".render");
  mkdirSync(workDir, { recursive: true });
  const partPaths = edl.entries.map((entry, index) => {
    const partPath = join(workDir, `part-${String(index).padStart(3, "0")}.mp4`);
    const result = spawnSync(
      "ffmpeg",
      ["-y", "-ss", String(entry.start), "-i", entry.source_path, "-t", String(entry.end - entry.start), "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", "-movflags", "+faststart", partPath],
      { encoding: "utf8" },
    );
    if (result.status !== 0) throw new Error(`ffmpeg segment render failed: ${result.stderr || result.stdout}`);
    return partPath;
  });
  const concatPath = join(workDir, "concat.txt");
  writeFileSync(concatPath, partPaths.map((partPath) => `file '${partPath.replaceAll("'", "'\\''")}'`).join("\n") + "\n");
  const result = spawnSync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", concatPath, "-c", "copy", outputPath], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`ffmpeg concat failed: ${result.stderr || result.stdout}`);
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

function readStoryboardQaChecks(projectPath: string): ProjectQaCheck[] | undefined {
  const storyboardPath = join(projectPath, projectArtifacts.storyboard);
  if (!existsSync(storyboardPath)) return undefined;
  const storyboard = readJson(storyboardPath) as { qa_checks?: ProjectQaCheck[] };
  return Array.isArray(storyboard.qa_checks) ? storyboard.qa_checks : undefined;
}

function extractInspectionChecks(projectPath: string, outputPath: string, checks: ProjectQaCheck[]): ProjectInspectionCheck[] {
  if (checks.length === 0) return [];
  if (checks.some((check) => check.frame_times.length > 0) && !commandExists("ffmpeg")) throw new Error("ffmpeg not found for inspection frames");
  const dir = join(projectPath, ".inspection");
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

function inspectWarnings(duration: number, expected: number, subtitlesPath: string): string[] {
  const warnings: string[] = [];
  if (Math.abs(duration - expected) > 0.75) warnings.push(`duration differs from EDL by ${(duration - expected).toFixed(2)}s`);
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

function probeVideoSize(path: string): { width: number; height: number } {
  const result = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=s=x:p=0", path], {
    encoding: "utf8",
  });
  const [width, height] = result.stdout.trim().split("x").map(Number);
  if (result.status !== 0 || !Number.isFinite(width) || !Number.isFinite(height)) throw new Error(`could not probe video size for ${path}`);
  return { width, height };
}

function writeJson(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
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
  return { ok: false, command, error: { code, message: error instanceof Error ? error.message : String(error) } };
}
