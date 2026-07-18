import * as nodeFs from "node:fs";
import { existsSync, readFileSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import {
  parseAnalysis,
  parseArtifactManifest,
  parseAssetManifest,
  parseAssetUsagePlan,
  parseEditPlan,
  parseEdl,
  parseEnrichmentPlan,
  parseFocusCandidates,
  parseFocusFrames,
  parseFocusGrounding,
  parseFocusReview,
  parseInspection,
  parseMusicAcquisition,
  parseMusicRequest,
  parseMusicReview,
  parseProductionProposal,
  parseProjectMetadata,
  parseRenderResult,
  parseReviewPackage,
  parseSourceFrameRequest,
  parseSourceMaterialization,
  parseSourcesManifest,
  parseTranscript,
  parseVisualAcquisition,
  parseVisualCandidates,
  parseVisualRequest,
  parseVisualReview,
  projectArtifacts,
  type ArtifactFingerprint,
  type ArtifactFingerprintReference,
  type ArtifactManifest,
  type ArtifactRecord,
  type ArtifactRole,
  type ArtifactState,
  type EdlArtifact,
  type EnrichmentPlanArtifact,
  type InspectionArtifact,
  type ProductionProposalArtifact,
  type ProjectArtifactStatus,
  type ProjectAcceptanceStatus,
  type ProjectContractVersion,
  type ProjectStageStatus,
  type ProjectStatusArtifact,
  type ProviderExecutionMode,
  type RenderOutput,
  type RenderResult,
  type SourceFramesArtifact,
  type SourcesManifest,
  type StatusBlocker,
  type WorkflowStageState,
} from "./artifacts";
import { fileBytesFingerprint, semanticJsonFingerprint } from "./artifact-lifecycle";
import {
  assetManifestFingerprintProjection,
  editPlanFingerprintProjection,
  inputFingerprint,
  inspectionFingerprintProjection,
  musicAcquisitionFingerprintProjection,
  projectMetadataFingerprintProjection,
  proposalSelectionFingerprint,
  proposalSelectionVirtualPath,
  renderContractAuthoringKeys,
  renderResultFingerprintProjection,
  visualAcquisitionFingerprintProjection,
} from "./project-lineage";
import { sourceIdentityFingerprintProjection } from "./source-identity";
import { parseRenderContractV1 } from "./render-contract";
import {
  applyConfirmedTextOverlays,
  evaluateProposalExecution,
  evaluateResolvedProposalExecution,
  type ProposalExecutionConformance,
} from "./proposal-execution";

type ParsedArtifacts = {
  sources?: SourcesManifest;
  proposal?: ProductionProposalArtifact;
  editPlan?: ReturnType<typeof parseEditPlan>;
  edl?: EdlArtifact;
  enrichmentPlan?: EnrichmentPlanArtifact;
  renderResult?: RenderResult;
  inspection?: InspectionArtifact;
};

type ArtifactNode = {
  key: string;
  role: ArtifactRole;
  path: string;
  schemaVersion: string;
  exists: boolean;
  valid: boolean;
  fingerprint?: ArtifactFingerprint;
  fileFingerprint?: ArtifactFingerprint;
  record?: ArtifactRecord;
  reasonCode?: string;
  reason?: string;
  renderOutput?: RenderOutput;
};

type ArtifactEvaluation = {
  state: ArtifactState;
  fingerprint?: ArtifactFingerprint;
  reasonCode?: string;
  reason?: string;
};

type ArtifactDefinition = {
  key: string;
  path: string;
  role: ArtifactRole;
  schemaVersion: string;
  format: "json" | "bytes" | "human_view";
  parse?: (value: unknown, parsed: ParsedArtifacts) => unknown;
  capture?: (rawValue: unknown, parsed: ParsedArtifacts) => void;
};

type StageDefinition = {
  stage: string;
  attemptStage?: string;
  command: string;
  prerequisites: string[];
  outputs: string[];
  acceptsPending?: string[];
  notApplicable?: boolean;
};

const fsRuntime = nodeFs as unknown as {
  lstatSync(path: string): { isDirectory(): boolean; isSymbolicLink(): boolean };
  realpathSync(path: string): string;
};

const artifactDefinitions: readonly ArtifactDefinition[] = [
  {
    key: "project",
    path: projectArtifacts.project,
    role: "authoritative_input",
    schemaVersion: "1.0",
    format: "json",
    parse: (value) => projectMetadataFingerprintProjection(parseProjectMetadata(value)),
  },
  {
    key: "sources",
    path: projectArtifacts.sources,
    role: "authoritative_input",
    schemaVersion: "2.0",
    format: "json",
    parse: (value) => parseSourcesManifest(value),
    capture: (value, parsed) => {
      parsed.sources = parseSourcesManifest(value);
    },
  },
  {
    key: "source-materialization",
    path: projectArtifacts.sourceMaterialization,
    role: "authoritative_input",
    schemaVersion: "1.0",
    format: "json",
    parse: (value, parsed) => parseSourceMaterialization(value, parsed.sources),
  },
  {
    key: "transcript",
    path: projectArtifacts.transcriptJson,
    role: "authoritative_input",
    schemaVersion: "1.0",
    format: "json",
    parse: (value, parsed) => parseTranscript(value, parsed.sources),
  },
  {
    key: "transcript-view",
    path: projectArtifacts.transcriptMarkdown,
    role: "human_view",
    schemaVersion: "text",
    format: "human_view",
  },
  {
    key: "analysis",
    path: projectArtifacts.analysis,
    role: "derived",
    schemaVersion: "1.0",
    format: "json",
    parse: (value, parsed) => parseAnalysis(value, parsed.sources),
  },
  {
    key: "material-report",
    path: projectArtifacts.materialReport,
    role: "human_view",
    schemaVersion: "text",
    format: "human_view",
  },
  {
    key: "review-package",
    path: projectArtifacts.reviewJson,
    role: "derived",
    schemaVersion: "1.0",
    format: "json",
    parse: (value, parsed) => parseReviewPackage(value, parsed.sources),
  },
  {
    key: "review-package-view",
    path: projectArtifacts.reviewMarkdown,
    role: "human_view",
    schemaVersion: "text",
    format: "human_view",
  },
  {
    key: "production-proposal",
    path: projectArtifacts.productionProposal,
    role: "authoritative_input",
    schemaVersion: "3.0",
    format: "json",
    parse: (value) => parseProductionProposal(value),
    capture: (value, parsed) => {
      parsed.proposal = parseProductionProposal(value);
    },
  },
  {
    key: "production-proposal-view",
    path: projectArtifacts.productionProposalMarkdown,
    role: "human_view",
    schemaVersion: "text",
    format: "human_view",
  },
  {
    key: "edit-plan",
    path: projectArtifacts.editPlan,
    role: "authoritative_input",
    schemaVersion: "1.0",
    format: "json",
    parse: (value, parsed) => editPlanFingerprintProjection(parseEditPlan(value, parsed.sources)),
    capture: (value, parsed) => {
      parsed.editPlan = parseEditPlan(value, parsed.sources);
    },
  },
  {
    key: "asset-usage-plan",
    path: projectArtifacts.assetUsagePlan,
    role: "command_request",
    schemaVersion: "1.0",
    format: "json",
    parse: (value) => parseAssetUsagePlan(value),
  },
  {
    key: "edl",
    path: projectArtifacts.edl,
    role: "derived",
    schemaVersion: "2.0",
    format: "json",
    parse: (value, parsed) => parseEdl(value, parsed.sources),
    capture: (value, parsed) => {
      parsed.edl = parseEdl(value, parsed.sources);
    },
  },
  {
    key: "subtitles",
    path: projectArtifacts.subtitles,
    role: "derived",
    schemaVersion: "srt",
    format: "bytes",
  },
  {
    key: "source-frame-request",
    path: projectArtifacts.sourceFrameRequest,
    role: "command_request",
    schemaVersion: "1.0",
    format: "json",
    parse: (value) => parseSourceFrameRequest(value),
  },
  {
    key: "source-frames",
    path: projectArtifacts.sourceFrames,
    role: "evidence",
    schemaVersion: "1.0",
    format: "json",
    parse: parseSourceFrames,
  },
  {
    key: "focus-candidates",
    path: projectArtifacts.focusCandidates,
    role: "authoritative_input",
    schemaVersion: "1.0",
    format: "json",
    parse: (value) => parseFocusCandidates(value),
  },
  {
    key: "focus-candidates-view",
    path: projectArtifacts.focusCandidatesMarkdown,
    role: "human_view",
    schemaVersion: "text",
    format: "human_view",
  },
  {
    key: "focus-frames",
    path: projectArtifacts.focusFrames,
    role: "evidence",
    schemaVersion: "1.0",
    format: "json",
    parse: (value) => parseFocusFrames(value),
  },
  {
    key: "focus-grounding",
    path: projectArtifacts.focusGrounding,
    role: "authoritative_input",
    schemaVersion: "1.0",
    format: "json",
    parse: (value) => parseFocusGrounding(value),
  },
  {
    key: "focus-review",
    path: projectArtifacts.focusReview,
    role: "derived",
    schemaVersion: "1.0",
    format: "json",
    parse: (value) => parseFocusReview(value),
  },
  {
    key: "focus-review-view",
    path: projectArtifacts.focusReviewMarkdown,
    role: "human_view",
    schemaVersion: "text",
    format: "human_view",
  },
  {
    key: "visual-catalog",
    path: projectArtifacts.visualCatalog,
    role: "derived",
    schemaVersion: "1.0",
    format: "json",
    parse: genericJsonObject,
  },
  {
    key: "visual-catalog-view",
    path: projectArtifacts.visualCatalogMarkdown,
    role: "human_view",
    schemaVersion: "text",
    format: "human_view",
  },
  {
    key: "visual-request",
    path: projectArtifacts.visualRequest,
    role: "command_request",
    schemaVersion: "1.0",
    format: "json",
    parse: (value) => parseVisualRequest(value),
  },
  {
    key: "visual-candidates",
    path: projectArtifacts.visualCandidates,
    role: "evidence",
    schemaVersion: "1.0",
    format: "json",
    parse: (value) => parseVisualCandidates(value),
  },
  {
    key: "visual-candidates-view",
    path: projectArtifacts.visualCandidatesMarkdown,
    role: "human_view",
    schemaVersion: "text",
    format: "human_view",
  },
  {
    key: "visual-acquisition",
    path: projectArtifacts.visualAcquisition,
    role: "execution_result",
    schemaVersion: "1.0",
    format: "json",
    parse: (value) => visualAcquisitionFingerprintProjection(parseVisualAcquisition(value)),
  },
  {
    key: "visual-review",
    path: projectArtifacts.visualReview,
    role: "derived",
    schemaVersion: "1.0",
    format: "json",
    parse: (value) => parseVisualReview(value),
  },
  {
    key: "visual-review-view",
    path: projectArtifacts.visualReviewMarkdown,
    role: "human_view",
    schemaVersion: "text",
    format: "human_view",
  },
  {
    key: "music-catalog",
    path: projectArtifacts.musicCatalog,
    role: "derived",
    schemaVersion: "1.0",
    format: "json",
    parse: genericJsonObject,
  },
  {
    key: "music-catalog-view",
    path: projectArtifacts.musicCatalogMarkdown,
    role: "human_view",
    schemaVersion: "text",
    format: "human_view",
  },
  {
    key: "music-request",
    path: projectArtifacts.musicRequest,
    role: "command_request",
    schemaVersion: "1.0",
    format: "json",
    parse: (value) => parseMusicRequest(value),
  },
  {
    key: "music-acquisition",
    path: projectArtifacts.musicAcquisition,
    role: "execution_result",
    schemaVersion: "1.0",
    format: "json",
    parse: (value) => musicAcquisitionFingerprintProjection(parseMusicAcquisition(value)),
  },
  {
    key: "music-review",
    path: projectArtifacts.musicReview,
    role: "derived",
    schemaVersion: "1.0",
    format: "json",
    parse: (value) => parseMusicReview(value),
  },
  {
    key: "music-review-view",
    path: projectArtifacts.musicReviewMarkdown,
    role: "human_view",
    schemaVersion: "text",
    format: "human_view",
  },
  {
    key: "asset-manifest",
    path: projectArtifacts.assetManifest,
    role: "execution_result",
    schemaVersion: "1.0",
    format: "json",
    parse: (value) => assetManifestFingerprintProjection(parseAssetManifest(value)),
  },
  {
    key: "enrichment-plan",
    path: projectArtifacts.enrichmentPlan,
    role: "authoritative_input",
    schemaVersion: "2.0",
    format: "json",
    parse: (value) => parseEnrichmentPlan(value),
    capture: (value, parsed) => {
      parsed.enrichmentPlan = parseEnrichmentPlan(value);
    },
  },
  {
    key: "storyboard",
    path: projectArtifacts.storyboard,
    role: "derived",
    schemaVersion: "1.1",
    format: "json",
    parse: genericJsonObject,
  },
  {
    key: "render-contract",
    path: projectArtifacts.renderContract,
    role: "derived",
    schemaVersion: "1.0",
    format: "json",
    parse: (value) => parseRenderContractV1(value),
  },
  {
    key: "render-output:clean",
    path: projectArtifacts.cleanRender,
    role: "execution_result",
    schemaVersion: "bytes-v1",
    format: "bytes",
  },
  {
    key: "render-output:final",
    path: projectArtifacts.finalRender,
    role: "execution_result",
    schemaVersion: "bytes-v1",
    format: "bytes",
  },
  {
    key: "render-result",
    path: projectArtifacts.renderResult,
    role: "execution_result",
    schemaVersion: "1.0",
    format: "json",
    parse: (value) => renderResultFingerprintProjection(parseRenderResult(value)),
    capture: (value, parsed) => {
      parsed.renderResult = parseRenderResult(value);
    },
  },
  {
    key: "inspection",
    path: projectArtifacts.inspection,
    role: "execution_result",
    schemaVersion: "1.0",
    format: "json",
    parse: (value) => inspectionFingerprintProjection(parseInspection(value)),
    capture: (value, parsed) => {
      parsed.inspection = parseInspection(value);
    },
  },
  {
    key: "report",
    path: projectArtifacts.report,
    role: "human_view",
    schemaVersion: "text",
    format: "human_view",
  },
] as const;

export function projectStatus(projectPath: string): ProjectStatusArtifact {
  const rootPath = resolve(projectPath);
  const parsed: ParsedArtifacts = {};
  const blockers: StatusBlocker[] = [];
  const diagnosticCycleMembers = new Set<string>();
  let manifest: ArtifactManifest | undefined;
  let manifestState: ProjectStatusArtifact["manifest_state"] = "invalid";
  let manifestError: string | undefined;

  if (!existsSync(rootPath)) {
    blockers.push(blocker("PROJECT_NOT_FOUND", "Project directory does not exist.", undefined, "Create the project before requesting status."));
  } else if (safeLstat(rootPath)?.isSymbolicLink() || !safeLstat(rootPath)?.isDirectory()) {
    throwStatusError(targetOccupied(projectArtifacts.project));
  } else {
    const projectContractBlocker = currentProjectContractBlocker(rootPath);
    if (projectContractBlocker?.code === "PROJECT_METADATA_INVALID") blockers.push(projectContractBlocker);
    else if (projectContractBlocker) throwStatusError(projectContractBlocker);
  }

  const manifestPath = resolveManagedPath(rootPath, projectArtifacts.artifactManifest);
  if (manifestPath && existsSync(manifestPath)) {
    try {
      const rawManifest = readJson(manifestPath);
      try {
        manifest = parseArtifactManifest(rawManifest);
      } catch (error) {
        for (const key of diagnosticManifestCycleMembers(rawManifest)) diagnosticCycleMembers.add(key);
        throw error;
      }
      manifestState = "tracked";
    } catch (error) {
      manifestState = "invalid";
      manifestError = errorMessage(error);
      blockers.push(
        blocker(
          "ARTIFACT_MANIFEST_INVALID",
          `artifact-manifest.json is invalid: ${manifestError}`,
          projectArtifacts.artifactManifest,
          "Repair or regenerate the manifest through a supported project command.",
        ),
      );
    }
  }

  const nodes = new Map<string, ArtifactNode>();
  for (const definition of artifactDefinitions) {
    const node = readDefinition(rootPath, definition, parsed, manifest);
    nodes.set(node.key, node);
  }

  addSourceMembers(rootPath, nodes, parsed, manifest);
  addProposalSelections(nodes, parsed, manifest);
  addRequestAndCandidateMembers(rootPath, nodes, manifest);
  addFrameMembers(rootPath, nodes, manifest);
  addAssetMembers(rootPath, nodes, manifest);
  addRenderOutputMembers(rootPath, nodes, parsed.renderResult, manifest);
  addInspectionFrameMembers(rootPath, nodes, parsed.inspection, manifest);
  addManifestOnlyRecords(rootPath, nodes, manifest);

  const diagnosticOverrides = new Map<string, ArtifactEvaluation>();
  for (const key of diagnosticCycleMembers) {
    if (!nodes.has(key)) continue;
    diagnosticOverrides.set(key, dependencyCycleEvaluation(nodes.get(key)!, key));
  }

  let evaluations = evaluateNodes(nodes, diagnosticOverrides);
  const editPlanSelectionOverride = validateEditPlanSelection(rootPath, nodes, evaluations, parsed);
  if (editPlanSelectionOverride) {
    const overrides = new Map(diagnosticOverrides);
    if (!overrides.has("edit-plan")) overrides.set("edit-plan", editPlanSelectionOverride);
    evaluations = evaluateNodes(nodes, overrides);
  }
  validateRenderResult(rootPath, nodes, evaluations, parsed.renderResult);
  validateInspection(nodes, evaluations, parsed.inspection);

  const metadataNode = nodes.get("project");
  const metadata = readProjectIdentity(rootPath);
  if (existsSync(rootPath) && metadata.error && metadataNode?.reasonCode !== "ARTIFACT_MISSING" && !blockers.some((item) => item.code === "PROJECT_METADATA_INVALID" && item.artifact === projectArtifacts.project)) {
    blockers.push(blocker("PROJECT_METADATA_INVALID", metadata.error, projectArtifacts.project, "Repair project.json through a supported project command."));
  }

  const artifactStatuses = [...nodes.values()]
    .filter((node) => !node.path.startsWith(".virtual/"))
    .map((node) => artifactStatus(node, evaluations.get(node.key)))
    .sort((left, right) => left.key.localeCompare(right.key));

  const stages = buildStages(rootPath, nodes, evaluations, manifest, parsed);
  const detachedExecution = Boolean(parsed.sources?.sources.length)
    && parsed.sources!.sources.some((source) => evaluations.get(`source:${source.source_id}`)?.state !== "current");
  const proposalConformance = evaluateProjectProposalConformance(parsed);
  const contractStage = stages.find((stage) => stage.stage === "contract-export");
  if (proposalConformance?.status === "failed" && contractStage) {
    contractStage.state = "blocked";
    contractStage.blockers.push(blocker(
      "PROPOSAL_EXECUTION_MISMATCH",
      proposalConformance.checks.filter((check) => check.status === "blocker").map((check) => `${check.id}: ${check.message}`).join("; "),
      projectArtifacts.productionProposal,
      "Repair the confirmed proposal timeline, duration, overlays, or asset-slot bindings, then recompile the EDL.",
    ));
    contractStage.next_commands = [];
  }
  for (const stage of stages) blockers.push(...stage.blockers);

  const renderResultState = evaluations.get("render-result");
  const canonicalOutput = parsed.renderResult?.outputs.find((output) => output.key === parsed.renderResult?.canonical_output_key);
  const canonicalOutputState = canonicalOutput ? evaluations.get(canonicalOutput.key) : undefined;
  const canonicalDeliverable =
    renderResultState?.state === "current" && canonicalOutput && canonicalOutputState?.state === "current" && canonicalOutputState.fingerprint
      ? { key: canonicalOutput.key, path: canonicalOutput.path, fingerprint: canonicalOutputState.fingerprint }
      : undefined;

  const fingerprints: Record<string, ArtifactFingerprint> = {};
  for (const [key, evaluation] of evaluations) {
    if (evaluation.fingerprint) fingerprints[key] = evaluation.fingerprint;
  }

  const acceptance = projectAcceptanceStatus(parsed, evaluations, stages, detachedExecution, proposalConformance);
  const nextStage = stages.find((stage) => stage.state !== "complete" && stage.state !== "not_applicable");
  const exportReady = evaluations.get("edl")?.state === "current"
    && proposalConformance?.status === "passed"
    && (!nodes.get("enrichment-plan")?.exists || evaluations.get("enrichment-plan")?.state === "current");
  const currentContractDigest = nodes.get("render-contract")?.exists && nodes.get("render-contract")?.valid
    ? (readJson(resolve(rootPath, projectArtifacts.renderContract)) as { contract_digest?: string }).contract_digest
    : undefined;
  const exported = contractStage?.state === "complete" && typeof currentContractDigest === "string";
  const strictNextCommands = [
    "koubo-clip render-contract verify <bundle-dir>",
    "koubo-clip render-contract bind <bundle-dir> --source-map <source-map.json> --output <bindings.json>",
    "koubo-clip render-contract render <bundle-dir> --bindings <bindings.json> --output <run-dir>",
    "koubo-clip render-contract inspect <bundle-dir> --result <run-dir>/render-contract-result.json",
  ];
  const renderContractNextCommands = detachedExecution
    ? exported ? strictNextCommands : exportReady ? contractStage?.next_commands ?? [] : []
    : [];
  const nextCommands = detachedExecution && (exported || exportReady)
    ? renderContractNextCommands
    : nextStage?.next_commands ?? [];
  const authoringKeys = parsed.editPlan
    ? renderContractAuthoringKeys(
      parsed.editPlan.confirmed_option_id,
      Boolean(nodes.get("enrichment-plan")?.exists),
      Boolean(nodes.get("asset-manifest")?.exists),
    )
    : [];
  const authoringInputs = authoringKeys.flatMap((key) => {
    const evaluation = evaluations.get(key);
    return evaluation?.state === "current" && evaluation.fingerprint ? [{ key, fingerprint: evaluation.fingerprint }] : [];
  });
  const currentAuthoringFingerprint = authoringInputs.length === authoringKeys.length && authoringInputs.length > 0
    ? inputFingerprint(authoringInputs)
    : undefined;

  return {
    contract_version: "1.0",
    project_contract_version: metadata.contractVersion,
    provider_execution_mode: metadata.providerMode,
    manifest_state: manifestState,
    artifacts: artifactStatuses,
    stages,
    fingerprints,
    ...(canonicalDeliverable ? { canonical_deliverable: canonicalDeliverable } : {}),
    render_inputs: parsed.renderResult?.inputs ?? [],
    next_commands: uniqueStrings(nextCommands),
    blockers: uniqueBlockers(blockers),
    acceptance,
    ...(lastSuccessfulCheckpoint(manifest) ? { last_successful_checkpoint: lastSuccessfulCheckpoint(manifest)! } : {}),
    sources: (parsed.sources?.sources ?? []).map((source) => ({
      source_id: source.source_id,
      identity: "available" as const,
      materialization: evaluations.get(`source:${source.source_id}`)?.state === "current" ? "verified" as const : "unbound" as const,
    })),
    render_contract: {
      ready: exportReady,
      export_ready: exportReady,
      exported,
      execution_mode: detachedExecution ? "distributed" : "local",
      handoff_ready: detachedExecution && exported,
      next_commands: renderContractNextCommands,
      blockers: contractStage?.blockers ?? [],
      ...(currentAuthoringFingerprint ? { current_authoring_fingerprint: currentAuthoringFingerprint } : {}),
      ...(currentContractDigest ? { current_contract_digest: currentContractDigest } : {}),
    },
  };
}

function evaluateProjectProposalConformance(parsed: ParsedArtifacts): ProposalExecutionConformance | undefined {
  if (!parsed.proposal || !parsed.editPlan || !parsed.edl) return undefined;
  const option = parsed.proposal.options.find((candidate) => candidate.id === parsed.editPlan!.confirmed_option_id);
  if (!option) return failedProposalConformance(
    parsed.editPlan.confirmed_option_id,
    "candidate_cleanup",
    "proposal-selection",
    "confirmed option does not exist in production-proposal.json",
  );
  if (parsed.editPlan.proposal_selection_fingerprint !== proposalSelectionFingerprint(parsed.proposal, option.id)) {
    return failedProposalConformance(option.id, option.edit_execution_plan.timeline.mode, "proposal-selection", "edit plan selection fingerprint does not match the confirmed option");
  }
  const base = evaluateProposalExecution(option, parsed.edl);
  if (base.status === "failed") return base;
  try {
    const effectivePlan = applyConfirmedTextOverlays(option, parsed.edl, parsed.enrichmentPlan, parsed.proposal.source_mode);
    return evaluateResolvedProposalExecution(option, parsed.edl, effectivePlan, parsed.proposal.source_mode);
  } catch (error) {
    return {
      ...base,
      status: "failed",
      checks: [...base.checks, {
        id: "resolved-composition",
        status: "blocker",
        message: errorMessage(error),
      }],
    };
  }
}

function failedProposalConformance(
  optionId: string,
  executionMode: "candidate_cleanup" | "explicit_segments",
  checkId: string,
  message: string,
): ProposalExecutionConformance {
  return {
    status: "failed",
    option_id: optionId,
    execution_mode: executionMode,
    duration_target: { min_seconds: 0, max_seconds: 0, tolerance_frames: 0 },
    actual_duration_seconds: 0,
    actual_frame_count: 0,
    checks: [{ id: checkId, status: "blocker", message }],
    mapped_overlays: [],
  };
}

function projectAcceptanceStatus(
  parsed: ParsedArtifacts,
  evaluations: ReadonlyMap<string, ArtifactEvaluation>,
  stages: readonly ProjectStageStatus[],
  detachedExecution: boolean,
  proposalConformance: ProposalExecutionConformance | undefined,
): ProjectAcceptanceStatus {
  const proposalStatus = proposalConformance?.status ?? "pending";
  const edlCurrent = evaluations.get("edl")?.state === "current";
  const enrichmentCurrent = !parsed.enrichmentPlan || evaluations.get("enrichment-plan")?.state === "current";
  const authoringStatus = proposalStatus === "failed"
    ? "blocked"
    : proposalStatus === "passed" && edlCurrent && enrichmentCurrent
      ? "complete"
      : "in_progress";
  const renderStage = stages.find((stage) => stage.stage === "render");
  const inspectStage = stages.find((stage) => stage.stage === "inspect");
  const canonicalOutput = parsed.renderResult?.outputs.find((output) => output.key === parsed.renderResult?.canonical_output_key);
  const renderCurrent = evaluations.get("render-result")?.state === "current"
    && Boolean(canonicalOutput && evaluations.get(canonicalOutput.key)?.state === "current");
  const renderStatus: ProjectAcceptanceStatus["render_status"] = detachedExecution
    ? "not_applicable"
    : renderCurrent
      ? "success"
      : renderStage?.state === "failed" || evaluations.get("render-result")?.state === "invalid"
        ? "failed"
        : "pending";
  const inspectionCurrent = evaluations.get("inspection")?.state === "current";
  const technicalStatus: ProjectAcceptanceStatus["technical_inspection_status"] = detachedExecution
    ? "not_applicable"
    : inspectionCurrent
      ? parsed.inspection?.technical_inspection_status
        ?? ((parsed.inspection?.blockers.length ?? 0) === 0 ? "passed" : "failed")
      : inspectStage?.state === "failed" || evaluations.get("inspection")?.state === "invalid"
        ? "failed"
        : "pending";
  const businessStatus: ProjectAcceptanceStatus["business_acceptance_status"] = inspectionCurrent
    ? parsed.inspection?.business_acceptance_status
      ?? (proposalStatus === "failed" ? "failed" : proposalStatus === "passed" && technicalStatus === "passed" ? "passed" : "pending")
    : proposalStatus === "failed"
      ? "failed"
      : proposalStatus === "passed" && technicalStatus === "passed"
        ? "passed"
        : "pending";
  const overallStatus: ProjectAcceptanceStatus["overall_status"] = inspectionCurrent && parsed.inspection?.overall_status
    ? parsed.inspection.overall_status
    : businessStatus === "passed"
      ? "completed"
      : proposalStatus === "failed" && technicalStatus === "passed"
        ? "partial"
        : renderStatus === "failed" || technicalStatus === "failed"
          ? "failed"
          : proposalStatus === "failed"
            ? "blocked"
            : "in_progress";
  return {
    authoring_status: authoringStatus,
    proposal_conformance_status: proposalStatus,
    render_status: renderStatus,
    technical_inspection_status: technicalStatus,
    business_acceptance_status: businessStatus,
    overall_status: overallStatus,
    ...(proposalConformance ? {
      proposal_conformance: {
        option_id: proposalConformance.option_id,
        execution_mode: proposalConformance.execution_mode,
        actual_duration_seconds: proposalConformance.actual_duration_seconds,
        actual_frame_count: proposalConformance.actual_frame_count,
        checks: proposalConformance.checks,
      },
    } : {}),
  };
}

function readDefinition(
  rootPath: string,
  definition: ArtifactDefinition,
  parsed: ParsedArtifacts,
  manifest: ArtifactManifest | undefined,
): ArtifactNode {
  const node: ArtifactNode = {
    key: definition.key,
    role: definition.role,
    path: definition.path,
    schemaVersion: definition.schemaVersion,
    exists: false,
    valid: true,
    record: manifest?.artifacts[definition.key],
  };
  const fullPath = resolveManagedPath(rootPath, definition.path);
  if (!fullPath) {
    return { ...node, valid: false, reasonCode: "UNSAFE_ARTIFACT_PATH", reason: `${definition.path} is not project-relative.` };
  }
  if (!existsSync(fullPath)) return node;
  node.exists = true;
  if (!safeStat(fullPath)?.isFile()) {
    return { ...node, valid: false, reasonCode: "ARTIFACT_NOT_FILE", reason: `${definition.path} is not a regular file.` };
  }
  if (!isPhysicalPathInsideProject(rootPath, fullPath)) {
    return { ...node, valid: false, reasonCode: "ARTIFACT_PATH_ESCAPE", reason: `${definition.path} resolves outside the project.` };
  }

  try {
    if (definition.format === "json") {
      const raw = readJson(fullPath);
      const normalized = definition.parse ? definition.parse(raw, parsed) : raw;
      definition.capture?.(raw, parsed);
      node.schemaVersion = normalizedSchemaVersion(normalized, node.schemaVersion);
      node.fingerprint = semanticJsonFingerprint(normalized) as ArtifactFingerprint;
      node.fileFingerprint = fileBytesFingerprint(fullPath) as ArtifactFingerprint;
    } else {
      node.fingerprint = fileBytesFingerprint(fullPath) as ArtifactFingerprint;
      node.fileFingerprint = node.fingerprint;
    }
  } catch (error) {
    node.valid = false;
    node.reasonCode = "ARTIFACT_INVALID";
    node.reason = errorMessage(error);
  }
  return node;
}

function addSourceMembers(
  rootPath: string,
  nodes: Map<string, ArtifactNode>,
  parsed: ParsedArtifacts,
  manifest: ArtifactManifest | undefined,
): void {
  for (const source of parsed.sources?.sources ?? []) {
    if (parsed.sources?.contract_version === "2.0" && source.identity) {
      const identityKey = `source-identity:${source.source_id}`;
      nodes.set(identityKey, {
        key: identityKey,
        path: `.virtual/source-identity/${source.source_id}`,
        role: "authoritative_input",
        schemaVersion: "2.0",
        exists: true,
        valid: true,
        fingerprint: semanticJsonFingerprint(sourceIdentityFingerprintProjection({
          source_id: source.source_id,
          order: source.order,
          original_filename: source.original_filename,
          local_media_ref: source.local_media_ref ?? "local-ref-not-fingerprinted",
          identity: source.identity,
        } as Parameters<typeof sourceIdentityFingerprintProjection>[0])) as ArtifactFingerprint,
        record: manifest?.artifacts[identityKey],
      });
      const materializationPath = resolveManagedPath(rootPath, projectArtifacts.sourceMaterialization);
      if (materializationPath && existsSync(materializationPath)) {
        try {
          const materialization = parseSourceMaterialization(readJson(materializationPath), parsed.sources);
          const member = materialization.sources.find((item) => item.source_id === source.source_id);
          if (member) {
            const mediaKey = `source:${source.source_id}`;
            const mediaRecord = manifest?.artifacts[mediaKey];
            nodes.set(mediaKey, readPhysicalNode(rootPath, mediaKey, member.project_path, "authoritative_input", mediaRecord?.schema_version ?? "bytes-v1", mediaRecord));
          }
        } catch {
          // The source-materialization artifact carries the parser failure.
        }
      }
      continue;
    }
  }
}

function addProposalSelections(
  nodes: Map<string, ArtifactNode>,
  parsed: ParsedArtifacts,
  manifest: ArtifactManifest | undefined,
): void {
  const proposal = parsed.proposal;
  if (!proposal) return;
  for (const option of proposal.options) {
    const key = `proposal-selection:${option.id}`;
    nodes.set(key, {
      key,
      path: proposalSelectionVirtualPath(option.id),
      role: "derived",
      schemaVersion: proposal.version,
      exists: true,
      valid: true,
      fingerprint: proposalSelectionFingerprint(proposal, option.id),
      record: manifest?.artifacts[key],
    });
  }
}

function addRequestAndCandidateMembers(
  rootPath: string,
  nodes: Map<string, ArtifactNode>,
  manifest: ArtifactManifest | undefined,
): void {
  addSemanticMembers(rootPath, nodes, manifest, "visual-request", projectArtifacts.visualRequest, (value) => {
    const request = parseVisualRequest(value);
    return request.requests.map((item) => ({ key: `visual-request:${item.id}`, value: item, role: "command_request" as const }));
  });
  addSemanticMembers(rootPath, nodes, manifest, "visual-candidates", projectArtifacts.visualCandidates, (value) => {
    const candidates = parseVisualCandidates(value);
    return candidates.candidates.map((item) => ({
      key: `visual-candidate:${item.request_id}:${item.id}`,
      value: item,
      role: "evidence" as const,
    }));
  });
  addSemanticMembers(rootPath, nodes, manifest, "music-request", projectArtifacts.musicRequest, (value) => {
    const request = parseMusicRequest(value);
    return [{ key: `music-request:${request.id}`, value: request, role: "command_request" as const }];
  });
}

function addSemanticMembers(
  rootPath: string,
  nodes: Map<string, ArtifactNode>,
  manifest: ArtifactManifest | undefined,
  containerKey: string,
  path: string,
  extract: (value: unknown) => Array<{ key: string; value: unknown; role: ArtifactRole }>,
): void {
  const fullPath = resolveManagedPath(rootPath, path);
  if (!fullPath || !existsSync(fullPath) || !nodes.get(containerKey)?.valid) return;
  try {
    for (const member of extract(readJson(fullPath))) {
      nodes.set(member.key, {
        key: member.key,
        path: `${path}#${member.key}`,
        role: member.role,
        schemaVersion: "1.0",
        exists: true,
        valid: true,
        fingerprint: semanticJsonFingerprint(member.value) as ArtifactFingerprint,
        record: manifest?.artifacts[member.key],
      });
    }
  } catch {
    // The container node already carries the parser failure.
  }
}

function addFrameMembers(rootPath: string, nodes: Map<string, ArtifactNode>, manifest: ArtifactManifest | undefined): void {
  const sourceFramesPath = resolveManagedPath(rootPath, projectArtifacts.sourceFrames);
  if (sourceFramesPath && existsSync(sourceFramesPath) && nodes.get("source-frames")?.valid) {
    try {
      const sourceFrames = parseSourceFrames(readJson(sourceFramesPath));
      for (const frame of sourceFrames.frames) {
        const key = `source-frame:${frame.id}`;
        const record = manifest?.artifacts[key];
        nodes.set(key, readPhysicalNode(rootPath, key, frame.path, "evidence", record?.schema_version ?? "image/jpeg", record));
      }
    } catch {
      // The inventory node already carries the parser failure.
    }
  }

  const focusFramesPath = resolveManagedPath(rootPath, projectArtifacts.focusFrames);
  if (focusFramesPath && existsSync(focusFramesPath) && nodes.get("focus-frames")?.valid) {
    try {
      const focusFrames = parseFocusFrames(readJson(focusFramesPath));
      for (const frame of focusFrames.frames) {
        const key = `focus-frame:${frame.id}`;
        const record = manifest?.artifacts[key];
        nodes.set(key, readPhysicalNode(rootPath, key, frame.path, "evidence", record?.schema_version ?? "image/jpeg", record));
      }
    } catch {
      // The inventory node already carries the parser failure.
    }
  }
}

function addAssetMembers(rootPath: string, nodes: Map<string, ArtifactNode>, manifest: ArtifactManifest | undefined): void {
  const assetManifestPath = resolveManagedPath(rootPath, projectArtifacts.assetManifest);
  if (!assetManifestPath || !existsSync(assetManifestPath) || !nodes.get("asset-manifest")?.valid) return;
  try {
    const assets = parseAssetManifest(readJson(assetManifestPath));
    for (const asset of assets.assets) {
      const key = `asset:${asset.id}`;
      const record = manifest?.artifacts[key];
      const role = record?.role ?? (asset.source === "bundled" || asset.source === "derived" ? "execution_result" : "authoritative_input");
      nodes.set(key, readPhysicalNode(rootPath, key, asset.path, role, record?.schema_version ?? "bytes-v1", record));
    }
  } catch {
    // The manifest node already carries the parser failure.
  }
}

function addRenderOutputMembers(
  rootPath: string,
  nodes: Map<string, ArtifactNode>,
  renderResult: RenderResult | undefined,
  manifest: ArtifactManifest | undefined,
): void {
  if (!renderResult) return;
  for (const output of renderResult.outputs) {
    const existing = nodes.get(output.key);
    if (existing && output.path.endsWith(".json") && existing.path === output.path) {
      existing.renderOutput = output;
      continue;
    }
    const record = manifest?.artifacts[output.key] ?? existing?.record;
    const node = readPhysicalNode(rootPath, output.key, output.path, output.role, record?.schema_version ?? "bytes-v1", record);
    node.renderOutput = output;
    nodes.set(output.key, node);
  }
}

function addInspectionFrameMembers(
  rootPath: string,
  nodes: Map<string, ArtifactNode>,
  inspection: InspectionArtifact | undefined,
  manifest: ArtifactManifest | undefined,
): void {
  if (!inspection) return;
  for (const check of inspection.checks) {
    check.frame_paths.forEach((path, index) => {
      const key = `inspection-frame:${check.id}:${index}`;
      const record = manifest?.artifacts[key];
      nodes.set(key, readPhysicalNode(rootPath, key, path, "evidence", record?.schema_version ?? "image/jpeg", record));
    });
  }
}

function addManifestOnlyRecords(rootPath: string, nodes: Map<string, ArtifactNode>, manifest: ArtifactManifest | undefined): void {
  if (!manifest) return;
  for (const record of Object.values(manifest.artifacts)) {
    if (nodes.has(record.key)) continue;
    const fullPath = resolveManagedPath(rootPath, record.path);
    if (!fullPath || !existsSync(fullPath)) {
      nodes.set(record.key, {
        key: record.key,
        path: record.path,
        role: record.role,
        schemaVersion: record.schema_version,
        exists: false,
        valid: Boolean(fullPath),
        record,
        ...(!fullPath ? { reasonCode: "UNSAFE_ARTIFACT_PATH", reason: `${record.path} is not project-relative.` } : {}),
      });
      continue;
    }
    const extension = record.path.toLowerCase();
    if (extension.endsWith(".json")) {
      const node: ArtifactNode = {
        key: record.key,
        path: record.path,
        role: record.role,
        schemaVersion: record.schema_version,
        exists: true,
        valid: true,
        record,
      };
      try {
        if (!isPhysicalPathInsideProject(rootPath, fullPath)) throw new Error(`${record.path} resolves outside the project.`);
        node.fingerprint = semanticJsonFingerprint(readJson(fullPath)) as ArtifactFingerprint;
        node.fileFingerprint = fileBytesFingerprint(fullPath) as ArtifactFingerprint;
      } catch (error) {
        node.valid = false;
        node.reasonCode = "ARTIFACT_INVALID";
        node.reason = errorMessage(error);
      }
      nodes.set(record.key, node);
      continue;
    }
    nodes.set(record.key, readPhysicalNode(rootPath, record.key, record.path, record.role, record.schema_version, record));
  }
}

function readPhysicalNode(
  rootPath: string,
  key: string,
  path: string,
  role: ArtifactRole,
  schemaVersion: string,
  record: ArtifactRecord | undefined,
): ArtifactNode {
  const node: ArtifactNode = { key, path, role, schemaVersion, exists: false, valid: true, record };
  const fullPath = resolveManagedPath(rootPath, path);
  if (!fullPath) return { ...node, valid: false, reasonCode: "UNSAFE_ARTIFACT_PATH", reason: `${path} is not project-relative.` };
  if (!existsSync(fullPath)) return node;
  node.exists = true;
  if (!safeStat(fullPath)?.isFile()) return { ...node, valid: false, reasonCode: "ARTIFACT_NOT_FILE", reason: `${path} is not a regular file.` };
  if (!isPhysicalPathInsideProject(rootPath, fullPath)) {
    return { ...node, valid: false, reasonCode: "ARTIFACT_PATH_ESCAPE", reason: `${path} resolves outside the project.` };
  }
  try {
    node.fingerprint = fileBytesFingerprint(fullPath) as ArtifactFingerprint;
    node.fileFingerprint = node.fingerprint;
  } catch (error) {
    node.valid = false;
    node.reasonCode = "ARTIFACT_INVALID";
    node.reason = errorMessage(error);
  }
  return node;
}

function evaluateNodes(
  nodes: ReadonlyMap<string, ArtifactNode>,
  overrides: ReadonlyMap<string, ArtifactEvaluation> = new Map(),
): Map<string, ArtifactEvaluation> {
  const evaluations = new Map<string, ArtifactEvaluation>();
  const visiting = new Set<string>();
  const cycleMembers = artifactDependencyCycleMembers(nodes);

  const evaluate = (key: string): ArtifactEvaluation => {
    const cached = evaluations.get(key);
    if (cached) return cached;
    const node = nodes.get(key);
    if (!node) return { state: "missing", reasonCode: "ARTIFACT_MISSING", reason: `${key} is missing.` };
    if (cycleMembers.has(key)) {
      const cycle = dependencyCycleEvaluation(node, key);
      evaluations.set(key, cycle);
      return cycle;
    }
    const override = overrides.get(key);
    if (override) {
      evaluations.set(key, override);
      return override;
    }
    if (visiting.has(key)) return dependencyCycleEvaluation(node, key);
    visiting.add(key);

    let result: ArtifactEvaluation;
    if (!node.exists) {
      result = { state: "missing", reasonCode: "ARTIFACT_MISSING", reason: `${node.path} is missing.` };
    } else if (!node.valid || !node.fingerprint) {
      result = {
        state: "invalid",
        ...(node.fingerprint ? { fingerprint: node.fingerprint } : {}),
        reasonCode: node.reasonCode ?? "ARTIFACT_INVALID",
        reason: node.reason ?? `${node.path} is invalid.`,
      };
    } else if (node.role === "human_view") {
      result = { state: "current", fingerprint: node.fingerprint };
    } else if (!node.record) {
      const externalInput = node.role === "authoritative_input" || node.role === "command_request";
      result = {
        state: externalInput ? "pending_validation" : "stale",
        fingerprint: node.fingerprint,
        reasonCode: externalInput ? "UNREGISTERED_INPUT" : "LINEAGE_UNPROVEN",
        reason: externalInput
          ? `${node.path} is schema-valid but has not been registered by its validator.`
          : `${node.path} exists but its lineage is unproven.`,
      };
    } else if (
      node.record.key !== node.key ||
      node.record.path !== node.path ||
      node.record.role !== node.role ||
      node.record.schema_version !== node.schemaVersion
    ) {
      result = {
        state: "invalid",
        fingerprint: node.fingerprint,
        reasonCode: "MANIFEST_RECORD_MISMATCH",
        reason: `Manifest record for ${node.key} does not match its public key, path, or role.`,
      };
    } else if (node.record.fingerprint !== node.fingerprint) {
      const immutableSource = node.key.startsWith("source:");
      const externalInput = !immutableSource && (node.role === "authoritative_input" || node.role === "command_request");
      result = {
        state: externalInput ? "pending_validation" : "invalid",
        fingerprint: node.fingerprint,
        reasonCode: immutableSource ? "SOURCE_CONTENT_CHANGED" : externalInput ? "CONTENT_CHANGED" : "CONTENT_FINGERPRINT_MISMATCH",
        reason: immutableSource
          ? `${node.path} changed after project creation; source media is immutable within a project.`
          : externalInput
          ? `${node.path} changed after its last validation.`
          : `${node.path} no longer matches its committed fingerprint.`,
      };
    } else {
      result = evaluateRecordDependencies(node, nodes, evaluate);
    }

    visiting.delete(key);
    evaluations.set(key, result);
    return result;
  };

  for (const key of nodes.keys()) evaluate(key);
  return evaluations;
}

function artifactDependencyCycleMembers(nodes: ReadonlyMap<string, ArtifactNode>): Set<string> {
  return stronglyConnectedCycleMembers(nodes.keys(), (key) => {
    const node = nodes.get(key);
    return (node?.record?.inputs ?? [])
      .map((input) => input.key)
      .filter((dependencyKey) => nodes.get(dependencyKey)?.role !== "human_view");
  });
}

function diagnosticManifestCycleMembers(value: unknown): Set<string> {
  if (!isRecord(value) || !isRecord(value.artifacts)) return new Set();
  const records = new Map<string, string[]>();
  for (const [key, rawRecord] of Object.entries(value.artifacts)) {
    if (!isRecord(rawRecord) || !Array.isArray(rawRecord.inputs)) {
      records.set(key, []);
      continue;
    }
    records.set(
      key,
      rawRecord.inputs.flatMap((rawInput) =>
        isRecord(rawInput) && typeof rawInput.key === "string" ? [rawInput.key] : []),
    );
  }
  return stronglyConnectedCycleMembers(records.keys(), (key) => records.get(key) ?? []);
}

function stronglyConnectedCycleMembers(
  keys: Iterable<string>,
  dependencies: (key: string) => readonly string[],
): Set<string> {
  const knownKeys = new Set(keys);
  const indices = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const cycleMembers = new Set<string>();
  let nextIndex = 0;

  const visit = (key: string): void => {
    indices.set(key, nextIndex);
    lowLinks.set(key, nextIndex);
    nextIndex += 1;
    stack.push(key);
    onStack.add(key);

    const edges = [...new Set(dependencies(key).filter((dependencyKey) => knownKeys.has(dependencyKey)))].sort();
    for (const dependencyKey of edges) {
      if (!indices.has(dependencyKey)) {
        visit(dependencyKey);
        lowLinks.set(key, Math.min(lowLinks.get(key)!, lowLinks.get(dependencyKey)!));
      } else if (onStack.has(dependencyKey)) {
        lowLinks.set(key, Math.min(lowLinks.get(key)!, indices.get(dependencyKey)!));
      }
    }

    if (lowLinks.get(key) !== indices.get(key)) return;
    const component: string[] = [];
    while (stack.length > 0) {
      const member = stack.pop()!;
      onStack.delete(member);
      component.push(member);
      if (member === key) break;
    }
    if (component.length > 1 || dependencies(key).includes(key)) {
      for (const member of component) cycleMembers.add(member);
    }
  };

  for (const key of [...knownKeys].sort()) {
    if (!indices.has(key)) visit(key);
  }
  return cycleMembers;
}

function dependencyCycleEvaluation(node: ArtifactNode, key: string): ArtifactEvaluation {
  return {
    state: "invalid",
    ...(node.fingerprint ? { fingerprint: node.fingerprint } : {}),
    reasonCode: "DEPENDENCY_CYCLE",
    reason: `${key} participates in cyclic artifact lineage.`,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function evaluateRecordDependencies(
  node: ArtifactNode,
  nodes: ReadonlyMap<string, ArtifactNode>,
  evaluate: (key: string) => ArtifactEvaluation,
): ArtifactEvaluation {
  for (const input of node.record?.inputs ?? []) {
    const dependencyNode = nodes.get(input.key);
    if (dependencyNode?.role === "human_view") continue;
    if (!dependencyNode) {
      return staleDependency(node, input.key, "DEPENDENCY_MISSING", `${input.key} is missing from the artifact registry.`);
    }
    const dependency = evaluate(input.key);
    if (dependency.state !== "current") {
      return staleDependency(
        node,
        input.key,
        `DEPENDENCY_${dependency.state.toUpperCase()}`,
        `${input.key} is ${dependency.state}.`,
      );
    }
    if (dependency.fingerprint !== input.fingerprint) {
      return staleDependency(node, input.key, "DEPENDENCY_FINGERPRINT_CHANGED", `${input.key} changed after ${node.key} was committed.`);
    }
    if (input.schema_version && dependencyNode.schemaVersion !== input.schema_version) {
      return staleDependency(node, input.key, "DEPENDENCY_SCHEMA_CHANGED", `${input.key} schema changed after ${node.key} was committed.`);
    }
  }
  return { state: "current", fingerprint: node.fingerprint };
}

function staleDependency(node: ArtifactNode, dependencyKey: string, reasonCode: string, reason: string): ArtifactEvaluation {
  return {
    state: "stale",
    fingerprint: node.fingerprint,
    reasonCode,
    reason: `${reason} ${node.key} depends on ${dependencyKey}.`,
  };
}

function validateEditPlanSelection(
  rootPath: string,
  nodes: ReadonlyMap<string, ArtifactNode>,
  evaluations: Map<string, ArtifactEvaluation>,
  parsed: ParsedArtifacts,
): ArtifactEvaluation | undefined {
  const editPlanNode = nodes.get("edit-plan");
  if (!editPlanNode?.exists || !editPlanNode.valid || !parsed.proposal) return undefined;
  try {
    const fullPath = resolveManagedPath(rootPath, editPlanNode.path);
    if (!fullPath) return undefined;
    const editPlan = parseEditPlan(readJson(fullPath), parsed.sources);
    if (!editPlan.confirmed_option_id || !editPlan.proposal_selection_fingerprint) return undefined;
    const selection = evaluations.get(`proposal-selection:${editPlan.confirmed_option_id}`);
    if (!selection?.fingerprint || selection.fingerprint !== editPlan.proposal_selection_fingerprint) {
      return {
        state: editPlanNode.record ? "stale" : "invalid",
        fingerprint: editPlanNode.fingerprint,
        reasonCode: "PROPOSAL_SELECTION_MISMATCH",
        reason: "edit-plan.json does not bind the current confirmed proposal option.",
      };
    }
  } catch {
    // The edit-plan node already carries parser failures.
  }
  return undefined;
}

function validateRenderResult(
  rootPath: string,
  nodes: ReadonlyMap<string, ArtifactNode>,
  evaluations: Map<string, ArtifactEvaluation>,
  renderResult: RenderResult | undefined,
): void {
  if (!renderResult) return;
  const renderNode = nodes.get("render-result");
  const renderEvaluation = evaluations.get("render-result");
  if (!renderNode || !renderEvaluation || renderEvaluation.state === "invalid" || renderEvaluation.state === "missing") return;

  const expectedInputFingerprint = compositePublicInputFingerprint(renderResult.inputs);
  if (expectedInputFingerprint !== renderResult.input_fingerprint) {
    evaluations.set("render-result", {
      state: "invalid",
      fingerprint: renderNode.fingerprint,
      reasonCode: "RENDER_INPUT_FINGERPRINT_MISMATCH",
      reason: "render-result.json input_fingerprint does not match its ordered inputs[].",
    });
    markRenderOutputsStale(evaluations, renderResult, "RENDER_RESULT_INVALID");
    return;
  }

  for (const input of renderResult.inputs) {
    const inputEvaluation = evaluations.get(input.key);
    if (inputEvaluation?.state !== "current" || inputEvaluation.fingerprint !== input.fingerprint) {
      evaluations.set("render-result", {
        state: "stale",
        fingerprint: renderNode.fingerprint,
        reasonCode: "RENDER_INPUT_CHANGED",
        reason: `Render input ${input.key} is not current at the recorded fingerprint.`,
      });
      markRenderOutputsStale(evaluations, renderResult, "RENDER_INPUT_CHANGED");
      return;
    }
  }

  for (const output of renderResult.outputs) {
    const outputNode = nodes.get(output.key);
    if (!outputNode?.exists) {
      evaluations.set(output.key, {
        state: "missing",
        reasonCode: "RENDER_OUTPUT_MISSING",
        reason: `${output.path} is missing.`,
      });
      evaluations.set("render-result", {
        state: "invalid",
        fingerprint: renderNode.fingerprint,
        reasonCode: "RENDER_OUTPUT_MISSING",
        reason: `Committed render output ${output.path} is missing.`,
      });
      return;
    }
    const outputEvaluation = evaluations.get(output.key);
    if (outputEvaluation?.state !== "current") {
      evaluations.set("render-result", {
        state: outputEvaluation?.state === "invalid" || outputEvaluation?.state === "missing" ? "invalid" : "stale",
        fingerprint: renderNode.fingerprint,
        reasonCode: "RENDER_OUTPUT_NOT_CURRENT",
        reason: `Committed render output ${output.path} is not current in artifact lineage.`,
      });
      return;
    }
    const outputPath = resolveManagedPath(rootPath, output.path);
    if (!outputPath || !isPhysicalPathInsideProject(rootPath, outputPath)) {
      evaluations.set(output.key, {
        state: "invalid",
        fingerprint: outputNode.fingerprint,
        reasonCode: "RENDER_OUTPUT_PATH_INVALID",
        reason: `${output.path} is not a safe project-local output.`,
      });
      evaluations.set("render-result", {
        state: "invalid",
        fingerprint: renderNode.fingerprint,
        reasonCode: "RENDER_OUTPUT_PATH_INVALID",
        reason: `Committed render output ${output.path} is not safe.`,
      });
      return;
    }
    if (outputNode.fileFingerprint !== output.sha256) {
      evaluations.set(output.key, {
        state: "invalid",
        fingerprint: outputNode.fingerprint,
        reasonCode: "RENDER_OUTPUT_HASH_MISMATCH",
        reason: `${output.path} bytes do not match render-result.json.`,
      });
      evaluations.set("render-result", {
        state: "invalid",
        fingerprint: renderNode.fingerprint,
        reasonCode: "RENDER_OUTPUT_HASH_MISMATCH",
        reason: `Committed render output ${output.path} was modified after render.`,
      });
      return;
    }
  }
}

function markRenderOutputsStale(
  evaluations: Map<string, ArtifactEvaluation>,
  renderResult: RenderResult,
  reasonCode: string,
): void {
  for (const output of renderResult.outputs) {
    const current = evaluations.get(output.key);
    evaluations.set(output.key, {
      state: current?.state === "missing" ? "missing" : "stale",
      ...(current?.fingerprint ? { fingerprint: current.fingerprint } : {}),
      reasonCode,
      reason: `${output.path} belongs to a non-current render result.`,
    });
  }
}

function validateInspection(
  nodes: ReadonlyMap<string, ArtifactNode>,
  evaluations: Map<string, ArtifactEvaluation>,
  inspection: InspectionArtifact | undefined,
): void {
  if (!inspection) return;
  const inspectionNode = nodes.get("inspection");
  const inspectionEvaluation = evaluations.get("inspection");
  if (!inspectionNode || !inspectionEvaluation || inspectionEvaluation.state === "invalid" || inspectionEvaluation.state === "missing") return;
  const renderEvaluation = evaluations.get("render-result");
  if (renderEvaluation?.state !== "current" || !renderEvaluation.fingerprint) {
    evaluations.set("inspection", {
      state: "stale",
      fingerprint: inspectionNode.fingerprint,
      reasonCode: "RENDER_RESULT_NOT_CURRENT",
      reason: "inspection.json depends on a render result that is not current.",
    });
    return;
  }
  if (inspection.render_result_fingerprint !== renderEvaluation.fingerprint) {
    evaluations.set("inspection", {
      state: "stale",
      fingerprint: inspectionNode.fingerprint,
      reasonCode: "RENDER_RESULT_FINGERPRINT_CHANGED",
      reason: "inspection.json references a different render-result fingerprint.",
    });
    return;
  }
  const outputEvaluation = evaluations.get(inspection.canonical_output_key);
  if (
    outputEvaluation?.state !== "current" ||
    outputEvaluation.fingerprint !== inspection.canonical_output_sha256
  ) {
    evaluations.set("inspection", {
      state: "stale",
      fingerprint: inspectionNode.fingerprint,
      reasonCode: "INSPECTION_OUTPUT_CHANGED",
      reason: "The inspected canonical output is no longer current at the recorded hash.",
    });
  }
}

function buildStages(
  rootPath: string,
  nodes: ReadonlyMap<string, ArtifactNode>,
  evaluations: ReadonlyMap<string, ArtifactEvaluation>,
  manifest: ArtifactManifest | undefined,
  parsed: ParsedArtifacts,
): ProjectStageStatus[] {
  const sourceMemberKeys = [...nodes.keys()].filter((key) => key.startsWith("source:"));
  const focusStarted = ["focus-candidates", "focus-frames", "focus-grounding", "focus-review"].some((key) => nodes.get(key)?.exists);
  const visualStarted = ["visual-request", "visual-candidates", "visual-acquisition", "visual-review"].some((key) => nodes.get(key)?.exists);
  const musicStarted = ["music-request", "music-acquisition", "music-review"].some((key) => nodes.get(key)?.exists);
  const enrichmentStarted = ["asset-usage-plan", "enrichment-plan", "asset-manifest", "storyboard"].some((key) => nodes.get(key)?.exists);
  const currentEditPlanRequiresProposal = parsed.editPlan?.contract_version === "1.0";
  const renderOutputKey = parsed.renderResult?.canonical_output_key;
  const detachedExecution = Boolean(parsed.sources?.sources.length)
    && parsed.sources!.sources.some((source) => evaluations.get(`source:${source.source_id}`)?.state !== "current");
  const definitions: StageDefinition[] = [
    {
      stage: "create",
      command: `koubo-clip project create <source> --project ${JSON.stringify(rootPath)}`,
      prerequisites: [],
      outputs: ["project", "sources", ...sourceMemberKeys],
      acceptsPending: ["project", "sources", ...sourceMemberKeys],
      notApplicable: !manifest?.stage_attempts["project.create"] && Boolean(nodes.get("project")?.exists && nodes.get("sources")?.exists),
    },
    {
      stage: "explore",
      command: command(rootPath, "explore", "--asr auto"),
      prerequisites: ["project", "sources", ...sourceMemberKeys],
      outputs: ["transcript", "analysis"],
      acceptsPending: ["project", "sources", ...sourceMemberKeys, "transcript"],
    },
    {
      stage: "source-frames",
      command: command(rootPath, "source-frames"),
      prerequisites: ["sources", "source-frame-request"],
      outputs: ["source-frames", ...[...nodes.keys()].filter((key) => key.startsWith("source-frame:"))],
      acceptsPending: ["source-frame-request"],
      notApplicable: !nodes.get("source-frame-request")?.exists && !nodes.get("source-frames")?.exists,
    },
    {
      stage: "review",
      command: command(rootPath, "review"),
      prerequisites: ["transcript", "analysis"],
      outputs: ["review-package"],
    },
    {
      stage: "proposal",
      command: command(rootPath, "proposal"),
      prerequisites: ["review-package"],
      outputs: ["production-proposal"],
      acceptsPending: ["production-proposal"],
      notApplicable: false,
    },
    {
      stage: "compile-edl",
      command: command(rootPath, "compile-edl"),
      prerequisites: [...(currentEditPlanRequiresProposal ? ["production-proposal"] : []), "edit-plan"],
      outputs: ["edl"],
      acceptsPending: ["edit-plan"],
    },
    {
      stage: "contract-export",
      attemptStage: "render-contract.export",
      command: `koubo-clip render-contract export ${JSON.stringify(rootPath)} --output <bundle-dir>`,
      prerequisites: ["edl", ...(nodes.get("enrichment-plan")?.exists ? ["enrichment-plan"] : [])],
      outputs: ["render-contract"],
      acceptsPending: ["render-contract"],
    },
    {
      stage: "focus-candidates",
      command: command(rootPath, "focus-candidates"),
      prerequisites: ["edl", "focus-candidates"],
      outputs: ["focus-candidates"],
      acceptsPending: ["focus-candidates"],
      notApplicable: !focusStarted,
    },
    {
      stage: "focus-frames",
      command: command(rootPath, "focus-frames"),
      prerequisites: ["edl", "focus-candidates"],
      outputs: ["focus-frames", ...[...nodes.keys()].filter((key) => key.startsWith("focus-frame:"))],
      notApplicable: !focusStarted,
    },
    {
      stage: "focus-grounding",
      command: command(rootPath, "focus-grounding"),
      prerequisites: ["focus-candidates", "focus-frames", "focus-grounding"],
      outputs: ["focus-grounding"],
      acceptsPending: ["focus-grounding"],
      notApplicable: !focusStarted,
    },
    {
      stage: "focus-review",
      command: command(rootPath, "focus-review"),
      prerequisites: ["focus-candidates", "focus-frames", "focus-grounding"],
      outputs: ["focus-review"],
      notApplicable: !focusStarted,
    },
    {
      stage: "visual-search",
      command: command(rootPath, "visual-search"),
      prerequisites: ["visual-request"],
      outputs: ["visual-candidates"],
      acceptsPending: ["visual-request"],
      notApplicable: !visualStarted,
    },
    {
      stage: "visual-acquire",
      command: command(rootPath, "visual-acquire"),
      prerequisites: ["visual-request", "visual-candidates"],
      outputs: ["visual-acquisition"],
      acceptsPending: ["visual-request", "visual-candidates"],
      notApplicable: !visualStarted,
    },
    {
      stage: "visual-review",
      command: command(rootPath, "visual-review"),
      prerequisites: ["visual-request", "visual-acquisition"],
      outputs: ["visual-review"],
      notApplicable: !visualStarted,
    },
    {
      stage: "music-acquire",
      command: command(rootPath, "music-acquire"),
      prerequisites: ["music-request"],
      outputs: ["music-acquisition"],
      acceptsPending: ["music-request"],
      notApplicable: !musicStarted,
    },
    {
      stage: "music-review",
      command: command(rootPath, "music-review"),
      prerequisites: ["music-request", "music-acquisition"],
      outputs: ["music-review"],
      notApplicable: !musicStarted,
    },
    {
      stage: "enrichment",
      attemptStage: "enrich-plan",
      command: command(rootPath, "enrich-plan"),
      prerequisites: [nodes.get("asset-usage-plan")?.exists ? "asset-usage-plan" : "edl"],
      outputs: ["enrichment-plan"],
      acceptsPending: ["asset-usage-plan", "enrichment-plan"],
      notApplicable: !enrichmentStarted,
    },
    {
      stage: "render",
      command: command(rootPath, "render"),
      prerequisites: ["edl", ...(parsed.sources?.contract_version === "2.0" ? ["source-materialization"] : []), ...(nodes.get("enrichment-plan")?.exists ? ["enrichment-plan"] : [])],
      outputs: ["render-result", ...(renderOutputKey ? [renderOutputKey] : [])],
      notApplicable: detachedExecution,
    },
    {
      stage: "inspect",
      command: command(rootPath, "inspect"),
      prerequisites: ["render-result", ...(renderOutputKey ? [renderOutputKey] : [])],
      outputs: ["inspection"],
      notApplicable: detachedExecution,
    },
  ];
  return definitions.map((definition) => calculateStage(definition, nodes, evaluations, manifest));
}

function calculateStage(
  definition: StageDefinition,
  nodes: ReadonlyMap<string, ArtifactNode>,
  evaluations: ReadonlyMap<string, ArtifactEvaluation>,
  manifest: ArtifactManifest | undefined,
): ProjectStageStatus {
  if (definition.notApplicable) {
    return { stage: definition.stage, state: "not_applicable", blockers: [], next_commands: [] };
  }

  const acceptedPending = new Set(definition.acceptsPending ?? []);
  const prerequisites = definition.prerequisites.map((key) => ({ key, node: nodes.get(key), evaluation: evaluations.get(key) }));
  const outputs = definition.outputs.map((key) => ({ key, node: nodes.get(key), evaluation: evaluations.get(key) }));
  const stageBlockers: StatusBlocker[] = [];

  for (const item of prerequisites) {
    const state = item.evaluation?.state ?? "missing";
    if (state === "current" || (state === "pending_validation" && acceptedPending.has(item.key))) continue;
    const code = state === "invalid" ? "ARTIFACT_INVALID" : state === "pending_validation" ? "ARTIFACT_PENDING_VALIDATION" : "ARTIFACT_REQUIRED";
    stageBlockers.push(
      blocker(
        code,
        `${item.key} is ${state} and blocks ${definition.stage}.`,
        item.node?.path ?? item.key,
        `Run ${definition.command} after repairing or providing ${item.node?.path ?? item.key}.`,
      ),
    );
  }

  const attemptStage = definition.attemptStage ?? definition.stage;
  const lastAttempt = manifest?.stage_attempts[`project.${attemptStage}`] ?? manifest?.stage_attempts[attemptStage];
  const inputFingerprint = lastAttempt?.inputs
    ? stageInputFingerprintFromReferences(lastAttempt.inputs, nodes, evaluations)
    : stageInputFingerprint(definition.prerequisites, nodes, evaluations);
  const attemptForCurrentInput = lastAttempt?.input_fingerprint === inputFingerprint ? lastAttempt : undefined;
  const outputsCurrent = outputs.length > 0 && outputs.every((item) => item.evaluation?.state === "current");
  const hasSuccessfulCommitEvidence = attemptForCurrentInput?.status === "success"
    || (attemptForCurrentInput?.status === "failed" && outputsCurrent && outputsBelongToStage(outputs, definition, manifest));
  let state: WorkflowStageState;

  if (stageBlockers.length > 0) {
    state = "blocked";
  } else if (outputsCurrent && hasSuccessfulCommitEvidence) {
    state = "complete";
  } else if (prerequisites.some((item) => item.evaluation?.state === "pending_validation" && acceptedPending.has(item.key)) || outputs.some((item) => item.evaluation?.state === "pending_validation")) {
    state = "ready";
  } else if (attemptForCurrentInput?.status === "failed") {
    state = "failed";
  } else if (outputs.some((item) => item.evaluation?.state === "stale" || item.evaluation?.state === "invalid")) {
    state = "stale";
    for (const item of outputs.filter((entry) => entry.evaluation?.state === "invalid")) {
      stageBlockers.push(
        blocker(
          item.evaluation?.reasonCode ?? "ARTIFACT_INVALID",
          item.evaluation?.reason ?? `${item.key} is invalid.`,
          item.node?.path ?? item.key,
          `Rerun ${definition.command} to replace the invalid output.`,
        ),
      );
    }
  } else if (prerequisites.every((item) => item.evaluation?.state === "current") || definition.prerequisites.length === 0) {
    state = "ready";
  } else {
    state = "not_started";
  }

  return {
    stage: definition.stage,
    state,
    ...(inputFingerprint ? { input_fingerprint: inputFingerprint } : {}),
    ...(lastAttempt ? { last_attempt: lastAttempt } : {}),
    blockers: stageBlockers,
    next_commands: state === "complete" ? [] : [definition.command],
  };
}

function outputsBelongToStage(
  outputs: ReadonlyArray<{ key: string }>,
  definition: StageDefinition,
  manifest: ArtifactManifest | undefined,
): boolean {
  const attemptStage = definition.attemptStage ?? definition.stage;
  const owner = attemptStage.includes(".") ? attemptStage : `project.${attemptStage}`;
  return outputs.every(({ key }) => {
    const record = manifest?.artifacts[key];
    return record?.produced_by_command === owner || record?.validated_by_command === owner;
  });
}

function stageInputFingerprintFromReferences(
  references: readonly ArtifactFingerprintReference[],
  nodes: ReadonlyMap<string, ArtifactNode>,
  evaluations: ReadonlyMap<string, ArtifactEvaluation>,
): ArtifactFingerprint | undefined {
  const current: ArtifactFingerprintReference[] = [];
  for (const reference of references) {
    const fingerprint = evaluations.get(reference.key)?.fingerprint;
    if (!fingerprint) return undefined;
    current.push({ key: reference.key, fingerprint, schema_version: nodes.get(reference.key)?.schemaVersion ?? reference.schema_version });
  }
  return compositePublicInputFingerprint(current);
}

function stageInputFingerprint(
  keys: readonly string[],
  nodes: ReadonlyMap<string, ArtifactNode>,
  evaluations: ReadonlyMap<string, ArtifactEvaluation>,
): ArtifactFingerprint | undefined {
  const inputs: ArtifactFingerprintReference[] = [];
  for (const key of keys) {
    const fingerprint = evaluations.get(key)?.fingerprint;
    if (!fingerprint) return undefined;
    inputs.push({ key, fingerprint, schema_version: nodes.get(key)?.schemaVersion });
  }
  return compositePublicInputFingerprint(inputs);
}

function artifactStatus(node: ArtifactNode, evaluation: ArtifactEvaluation | undefined): ProjectArtifactStatus {
  return {
    key: node.key,
    role: node.role,
    path: node.path,
    state: evaluation?.state ?? "missing",
    ...(evaluation?.fingerprint ? { fingerprint: evaluation.fingerprint } : {}),
    ...(evaluation?.reasonCode ? { reason_code: evaluation.reasonCode } : {}),
    ...(evaluation?.reason ? { reason: evaluation.reason } : {}),
  };
}

function readProjectIdentity(rootPath: string): {
  contractVersion: ProjectContractVersion;
  providerMode: ProviderExecutionMode;
  error?: string;
} {
  const path = resolveManagedPath(rootPath, projectArtifacts.project);
  if (!path || !existsSync(path)) {
    return { contractVersion: "1.0", providerMode: "standalone", error: "project.json is missing." };
  }
  try {
    const metadata = parseProjectMetadata(readJson(path));
    return {
      contractVersion: metadata.contract_version,
      providerMode: metadata.provider_execution_mode,
    };
  } catch (error) {
    return { contractVersion: "1.0", providerMode: "standalone", error: `project.json is invalid: ${errorMessage(error)}` };
  }
}

function currentProjectContractBlocker(rootPath: string): StatusBlocker | undefined {
  const projectPath = resolveManagedPath(rootPath, projectArtifacts.project);
  const sourcesPath = resolveManagedPath(rootPath, projectArtifacts.sources);
  const manifestPath = resolveManagedPath(rootPath, projectArtifacts.artifactManifest);
  if (!projectPath || !existsSync(projectPath)) return targetOccupied(projectArtifacts.project);
  try {
    const project = readJson(projectPath);
    if (!project || typeof project !== "object" || Array.isArray(project)) return metadataInvalid();
    const projectObject = project as Record<string, unknown>;
    if (projectObject.contract_version !== "1.0") return unsupported(projectArtifacts.project);
    if ("asset_usage_plan" in projectObject) return unsupported(projectArtifacts.project);
    try {
      parseProjectMetadata(projectObject);
    } catch {
      return metadataInvalid();
    }
  } catch {
    return metadataInvalid();
  }
  if (!sourcesPath || !existsSync(sourcesPath)) return targetOccupied(projectArtifacts.sources);
  if (!manifestPath || !existsSync(manifestPath)) return targetOccupied(projectArtifacts.artifactManifest);
  const sourcesBlocker = currentCoreArtifactBlocker(sourcesPath, projectArtifacts.sources, "2.0", parseSourcesManifest);
  if (sourcesBlocker) return sourcesBlocker;
  const manifestBlocker = currentCoreArtifactBlocker(manifestPath, projectArtifacts.artifactManifest, "1.0", parseArtifactManifest);
  if (manifestBlocker) return manifestBlocker;
  return optionalArtifactContractBlocker(rootPath, projectArtifacts.productionProposal, "version", "3.0")
    ?? optionalArtifactContractBlocker(rootPath, projectArtifacts.editPlan, "contract_version", "1.0", ["asset_usage_plan"])
    ?? optionalArtifactContractBlocker(rootPath, projectArtifacts.edl, "contract_version", "2.0")
    ?? optionalArtifactContractBlocker(rootPath, projectArtifacts.enrichmentPlan, "version", "2.0", ["cards", "slots", "captions", "music"]);
}

function targetOccupied(artifact: string): StatusBlocker {
  return blocker(
    "PROJECT_TARGET_OCCUPIED",
    "Target exists but is not a current Koubo Clip project.",
    artifact,
    "Use a valid Koubo Clip project directory, or create a new project in an empty target.",
  );
}

function metadataInvalid(): StatusBlocker {
  return blocker(
    "PROJECT_METADATA_INVALID",
    "project.json is invalid.",
    projectArtifacts.project,
    "Repair project.json through a supported project command.",
  );
}

function unsupported(artifact: string): StatusBlocker {
  return blocker(
    "CONTRACT_SCHEMA_UNSUPPORTED",
    "Project contains an unsupported artifact schema.",
    artifact,
    "Recreate the project with this CLI version or replace the artifact with the current schema.",
  );
}

function currentCoreArtifactBlocker(
  path: string,
  artifact: string,
  expectedVersion: string,
  parse: (value: unknown) => unknown,
): StatusBlocker | undefined {
  let value: unknown;
  try {
    value = readJson(path);
  } catch {
    return invalidArtifact(artifact);
  }
  const object = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  if (object?.contract_version !== expectedVersion) return unsupported(artifact);
  try {
    parse(value);
    return undefined;
  } catch {
    return invalidArtifact(artifact);
  }
}

function invalidArtifact(artifact: string): StatusBlocker {
  return blocker(
    "ARTIFACT_INVALID",
    "Artifact is invalid.",
    artifact,
    "Repair or regenerate the artifact through a supported project command.",
  );
}

function optionalArtifactContractBlocker(
  rootPath: string,
  filename: string,
  versionField: "version" | "contract_version",
  expected: string,
  removedFields: readonly string[] = [],
): StatusBlocker | undefined {
  const path = resolveManagedPath(rootPath, filename);
  if (!path || !existsSync(path)) return undefined;
  try {
    const value = readJson(path) as Record<string, unknown>;
    if (!value || typeof value !== "object" || Array.isArray(value) || value[versionField] !== expected) {
      return unsupportedArtifact(filename);
    }
    const removed = removedFields.find((field) => field in value);
    if (removed) return unsupportedArtifact(filename);
  } catch {
    return invalidArtifact(filename);
  }
  return undefined;
}

function unsupportedArtifact(artifact: string): StatusBlocker {
  return blocker(
    "CONTRACT_SCHEMA_UNSUPPORTED",
    "Project contains an unsupported artifact schema.",
    artifact,
    "Recreate the artifact with this CLI version.",
  );
}

function throwStatusError(blocker: StatusBlocker): never {
  const error = new Error(blocker.message) as Error & {
    code: string;
    artifact?: string;
    remediation: string;
    stage: string;
  };
  error.code = blocker.code;
  error.artifact = blocker.artifact;
  error.remediation = blocker.remediation;
  error.stage = "status";
  throw error;
}

function genericJsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("artifact must be a JSON object");
  return value as Record<string, unknown>;
}

function normalizedSchemaVersion(value: unknown, fallback: string): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const candidate = (value as Record<string, unknown>).contract_version ?? (value as Record<string, unknown>).version;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : fallback;
}

function parseSourceFrames(value: unknown): SourceFramesArtifact {
  const obj = genericJsonObject(value);
  if (obj.version !== "1.0") throw new Error('source frames version must be "1.0"');
  if (!Array.isArray(obj.frames)) throw new Error("source frames frames must be an array");
  const frames = obj.frames.map((value, index) => {
    const frame = genericJsonObject(value);
    const path = requiredText(frame.path, `frames[${index}].path`);
    const sha256 = requiredText(frame.sha256, `frames[${index}].sha256`);
    if (!resolveManagedPath("/project", path)) throw new Error(`frames[${index}].path must be project-relative`);
    if (!/^(sha256:)?[a-f0-9]{64}$/.test(sha256)) throw new Error(`frames[${index}].sha256 must be SHA-256`);
    if (frame.mime_type !== "image/jpeg") throw new Error(`frames[${index}].mime_type must be image/jpeg`);
    const parsedFrame: SourceFramesArtifact["frames"][number] = {
      id: requiredText(frame.id, `frames[${index}].id`),
      source_id: requiredText(frame.source_id, `frames[${index}].source_id`),
      time_seconds: nonNegativeFinite(frame.time_seconds, `frames[${index}].time_seconds`),
      transcript_quote: requiredText(frame.transcript_quote, `frames[${index}].transcript_quote`),
      reason: requiredText(frame.reason, `frames[${index}].reason`),
      index: nonNegativeInteger(frame.index, `frames[${index}].index`),
      path,
      mime_type: "image/jpeg",
      width: positiveInteger(frame.width, `frames[${index}].width`),
      height: positiveInteger(frame.height, `frames[${index}].height`),
      size_bytes: nonNegativeInteger(frame.size_bytes, `frames[${index}].size_bytes`),
      sha256,
    };
    if (frame.segment_id !== undefined) parsedFrame.segment_id = requiredText(frame.segment_id, `frames[${index}].segment_id`);
    return parsedFrame;
  });
  if (new Set(frames.map((frame) => frame.id)).size !== frames.length) throw new Error("source frame ids must be unique");
  if (new Set(frames.map((frame) => frame.index)).size !== frames.length) throw new Error("source frame indexes must be unique");
  const frameCount = nonNegativeInteger(obj.frame_count, "frame_count");
  const totalSizeBytes = nonNegativeInteger(obj.total_size_bytes, "total_size_bytes");
  if (frameCount !== frames.length) throw new Error("frame_count must match frames length");
  if (totalSizeBytes !== frames.reduce((sum, frame) => sum + frame.size_bytes, 0)) throw new Error("total_size_bytes must match frame sizes");
  return { version: "1.0", frames, frame_count: frameCount, total_size_bytes: totalSizeBytes };
}

function requiredText(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${name} must be non-empty`);
  return value;
}

function nonNegativeFinite(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative number`);
  return value;
}

function nonNegativeInteger(value: unknown, name: string): number {
  const parsed = nonNegativeFinite(value, name);
  if (!Number.isInteger(parsed)) throw new Error(`${name} must be an integer`);
  return parsed;
}

function positiveInteger(value: unknown, name: string): number {
  const parsed = nonNegativeInteger(value, name);
  if (parsed <= 0) throw new Error(`${name} must be greater than zero`);
  return parsed;
}

function compositePublicInputFingerprint(inputs: readonly ArtifactFingerprintReference[]): ArtifactFingerprint {
  return inputFingerprint(inputs);
}

function resolveManagedPath(rootPath: string, projectRelativePath: string): string | undefined {
  if (!projectRelativePath || projectRelativePath.includes("\0") || projectRelativePath.includes("\\")) return undefined;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(projectRelativePath) || projectRelativePath.startsWith("/") || /^[A-Za-z]:/.test(projectRelativePath)) {
    return undefined;
  }
  if (projectRelativePath.split("/").includes("..")) return undefined;
  const root = resolve(rootPath);
  const candidate = resolve(root, projectRelativePath);
  const fromRoot = relative(root, candidate);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`)) return undefined;
  return candidate;
}

function isPhysicalPathInsideProject(rootPath: string, filePath: string): boolean {
  try {
    const realRoot = fsRuntime.realpathSync(rootPath);
    const realFile = fsRuntime.realpathSync(filePath);
    const fromRoot = relative(realRoot, realFile);
    return fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`);
  } catch {
    return false;
  }
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function safeStat(path: string): ReturnType<typeof statSync> | undefined {
  try {
    return statSync(path);
  } catch {
    return undefined;
  }
}

function safeLstat(path: string): ReturnType<typeof fsRuntime.lstatSync> | undefined {
  try {
    return fsRuntime.lstatSync(path);
  } catch {
    return undefined;
  }
}

function command(projectPath: string, subcommand: string, suffix = ""): string {
  const quotedPath = JSON.stringify(projectPath);
  return `koubo-clip project ${subcommand} ${quotedPath}${suffix ? ` ${suffix}` : ""}`;
}

function blocker(code: string, message: string, artifact: string | undefined, remediation: string): StatusBlocker {
  return { code, message, ...(artifact ? { artifact } : {}), remediation };
}

function uniqueBlockers(values: readonly StatusBlocker[]): StatusBlocker[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = `${value.code}\0${value.artifact ?? ""}\0${value.remediation}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function lastSuccessfulCheckpoint(manifest: ArtifactManifest | undefined): ProjectStatusArtifact["last_successful_checkpoint"] {
  if (!manifest) return undefined;
  const successful = Object.values(manifest.stage_attempts)
    .filter((attempt) => attempt.status === "success")
    .sort((left, right) => Date.parse(right.completed_at) - Date.parse(left.completed_at));
  const latest = successful[0];
  return latest
    ? { stage: latest.stage, completed_at: latest.completed_at, output_artifact_keys: latest.output_artifact_keys }
    : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
