import * as nodeFs from "node:fs";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  parseArtifactManifest,
  projectArtifacts,
  type ArtifactAuthor,
  type ArtifactFingerprintReference,
  type ArtifactManifest,
  type ArtifactRecord,
  type ArtifactRole,
  type AssetManifestArtifact,
  type EditPlanArtifact,
  type MusicAcquisitionArtifact,
  type ProductionProposalArtifact,
  type ProjectMetadataArtifact,
  type RenderResult,
  type InspectionArtifact,
  type VisualAcquisitionArtifact,
  type StageAttempt,
} from "./artifacts";
import {
  atomicWriteJson,
  compositeInputFingerprint,
  createArtifactManifest,
  fileBytesFingerprint,
  readArtifactManifest,
  semanticJsonFingerprint,
  writeArtifactManifest,
  type Fingerprint,
} from "./artifact-lifecycle";
import { cliVersion } from "./bundle-paths";
import { resolveExistingProjectPath } from "./project-paths";

export type RecordArtifactOptions = {
  project_path: string;
  key: string;
  path: string;
  role: ArtifactRole;
  schema_version: string;
  authored_by: ArtifactAuthor;
  command: string;
  mode: "produced" | "validated";
  inputs?: ArtifactFingerprintReference[];
  value?: unknown;
  fingerprint?: Fingerprint;
  file_sha256?: Fingerprint;
  recorded_at?: string;
};

export type CommitStageOptions = {
  project_path: string;
  stage: string;
  command: string;
  input_fingerprint: Fingerprint;
  inputs?: ArtifactFingerprintReference[];
  records: ArtifactRecord[];
  replace_record_prefixes?: string[];
  started_at?: string;
  completed_at?: string;
};

export type CommitStageFailureOptions = {
  project_path: string;
  stage: string;
  command: string;
  input_fingerprint: Fingerprint;
  inputs?: ArtifactFingerprintReference[];
  failure_code: string;
  failure_message?: string;
  artifact?: string;
  remediation: string;
  started_at?: string;
  completed_at?: string;
};

export function manifestPath(projectPath: string): string {
  return join(projectPath, projectArtifacts.artifactManifest);
}

export function readProjectArtifactManifest(projectPath: string): ArtifactManifest | null {
  const path = manifestPath(projectPath);
  if (!existsSync(path)) return null;
  return readArtifactManifest(resolveExistingProjectPath(projectPath, projectArtifacts.artifactManifest, "artifact manifest"));
}

export function readOrCreateProjectArtifactManifest(projectPath: string): ArtifactManifest {
  return readProjectArtifactManifest(projectPath) ?? createArtifactManifest();
}

export function artifactReference(record: ArtifactRecord): ArtifactFingerprintReference {
  return { key: record.key, fingerprint: record.fingerprint, schema_version: record.schema_version };
}

export function recordJsonArtifact(options: Omit<RecordArtifactOptions, "fingerprint"> & { value: unknown }): ArtifactRecord {
  return recordArtifactValue({ ...options, fingerprint: semanticJsonFingerprint(options.value) });
}

export function recordFileArtifact(options: Omit<RecordArtifactOptions, "fingerprint" | "file_sha256" | "value">): ArtifactRecord {
  const absolutePath = resolveExistingProjectPath(options.project_path, options.path, `artifact ${options.key}`);
  const fingerprint = fileBytesFingerprint(absolutePath);
  return recordArtifactValue({ ...options, fingerprint, file_sha256: fingerprint });
}

export function recordArtifactValue(options: RecordArtifactOptions & { fingerprint: Fingerprint }): ArtifactRecord {
  const recordedAt = options.recorded_at ?? new Date().toISOString();
  return {
    key: options.key,
    path: options.path,
    role: options.role,
    schema_version: options.schema_version,
    fingerprint: options.fingerprint,
    file_sha256: options.file_sha256,
    authored_by: options.authored_by,
    produced_by_command: options.mode === "produced" ? options.command : undefined,
    validated_by_command: options.mode === "validated" ? options.command : undefined,
    producer_cli_version: cliVersion(),
    command_contract_version: "1.0",
    inputs: [...(options.inputs ?? [])],
    produced_at: options.mode === "produced" ? recordedAt : undefined,
    validated_at: options.mode === "validated" ? recordedAt : undefined,
  };
}

export function commitProjectStage(options: CommitStageOptions): ArtifactManifest {
  const startedAt = options.started_at ?? new Date().toISOString();
  const completedAt = options.completed_at ?? new Date().toISOString();
  const manifest = readOrCreateProjectArtifactManifest(options.project_path);
  const artifacts = { ...manifest.artifacts };
  const removedKeys = new Set<string>();
  if (options.replace_record_prefixes?.length) {
    const replacementKeys = new Set(options.records.map((record) => record.key));
    for (const key of Object.keys(artifacts)) {
      if (!replacementKeys.has(key) && options.replace_record_prefixes.some((prefix) => key.startsWith(prefix))) {
        delete artifacts[key];
        removedKeys.add(key);
      }
    }
  }
  pruneDependentRecords(artifacts, removedKeys);
  for (const record of options.records) artifacts[record.key] = record;
  const attempt: StageAttempt = {
    stage: options.stage,
    command: options.command,
    input_fingerprint: options.input_fingerprint,
    inputs: options.inputs ? [...options.inputs] : undefined,
    status: "success",
    started_at: startedAt,
    completed_at: completedAt,
    output_artifact_keys: options.records.map((record) => record.key),
  };
  const stageAttempts = { ...manifest.stage_attempts };
  for (const [stage, previousAttempt] of Object.entries(stageAttempts)) {
    if (stage === attempt.stage) continue;
    if (
      previousAttempt.output_artifact_keys.some((key) => removedKeys.has(key))
      || previousAttempt.inputs?.some((input) => removedKeys.has(input.key))
    ) delete stageAttempts[stage];
  }
  stageAttempts[attempt.stage] = attempt;
  const committed = parseArtifactManifest({
    ...manifest,
    artifacts,
    stage_attempts: stageAttempts,
    updated_at: completedAt,
  });
  writeArtifactManifest(manifestPath(options.project_path), committed);
  return committed;
}

export function commitProjectStageFailure(options: CommitStageFailureOptions): ArtifactManifest {
  const startedAt = options.started_at ?? new Date().toISOString();
  const completedAt = options.completed_at ?? new Date().toISOString();
  const manifest = readOrCreateProjectArtifactManifest(options.project_path);
  const attempt: StageAttempt = {
    stage: options.stage,
    command: options.command,
    input_fingerprint: options.input_fingerprint,
    inputs: options.inputs ? [...options.inputs] : undefined,
    status: "failed",
    started_at: startedAt,
    completed_at: completedAt,
    output_artifact_keys: [],
    failure_code: options.failure_code,
    failure_message: options.failure_message,
    artifact: options.artifact,
    remediation: options.remediation,
  };
  const committed = parseArtifactManifest({
    ...manifest,
    stage_attempts: { ...manifest.stage_attempts, [attempt.stage]: attempt },
    updated_at: completedAt,
  });
  writeArtifactManifest(manifestPath(options.project_path), committed);
  return committed;
}

function pruneDependentRecords(artifacts: Record<string, ArtifactRecord>, removedKeys: Set<string>): void {
  if (removedKeys.size === 0) return;
  let changed = true;
  while (changed) {
    changed = false;
    for (const [key, record] of Object.entries(artifacts)) {
      if (!record.inputs.some((input) => removedKeys.has(input.key))) continue;
      delete artifacts[key];
      removedKeys.add(key);
      changed = true;
    }
  }
}

export function inputFingerprint(inputs: readonly ArtifactFingerprintReference[]): Fingerprint {
  return compositeInputFingerprint(inputs.map((input) => ({ ...input })));
}

export function proposalFingerprint(proposal: ProductionProposalArtifact): Fingerprint {
  return semanticJsonFingerprint(proposal);
}

export function projectMetadataFingerprintProjection(metadata: ProjectMetadataArtifact): unknown {
  return {
    contract_version: metadata.contract_version,
    provider_execution_mode: metadata.provider_execution_mode,
  };
}

export function editPlanFingerprintProjection(editPlan: EditPlanArtifact): unknown {
  return {
    contract_version: editPlan.contract_version,
    confirmed_option_id: editPlan.confirmed_option_id,
    proposal_selection_fingerprint: editPlan.proposal_selection_fingerprint,
    decisions: editPlan.decisions,
    source_order: editPlan.source_order,
  };
}

export function assetManifestFingerprintProjection(manifest: AssetManifestArtifact): unknown {
  return {
    assets: manifest.assets
      .map(({ acquired_at: _acquiredAt, ...asset }) => asset)
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export function visualAcquisitionFingerprintProjection(acquisition: VisualAcquisitionArtifact): unknown {
  return {
    version: acquisition.version,
    assets: acquisition.assets
      .map(({ acquired_at: _acquiredAt, ...asset }) => asset)
      .sort((left, right) => left.asset_id.localeCompare(right.asset_id)),
  };
}

export function musicAcquisitionFingerprintProjection(acquisition: MusicAcquisitionArtifact): unknown {
  const asset = acquisition.asset
    ? (({ acquired_at: _acquiredAt, ...semanticAsset }) => semanticAsset)(acquisition.asset)
    : undefined;
  return {
    version: acquisition.version,
    request: acquisition.request,
    acquired: acquisition.acquired,
    asset,
    recommendation: acquisition.recommendation,
  };
}

export function renderResultFingerprintProjection(result: RenderResult): unknown {
  const { completed_at: _completedAt, producer_cli_version: _producerCliVersion, ...semantic } = result;
  return semantic;
}

export function inspectionFingerprintProjection(inspection: InspectionArtifact): unknown {
  const { inspected_at: _inspectedAt, producer_cli_version: _producerCliVersion, ...semantic } = inspection;
  return semantic;
}

export function proposalSelectionProjection(proposal: ProductionProposalArtifact, optionId: string): unknown {
  if (proposal.version === "1.1") {
    const option = proposal.options.find((candidate) => candidate.id === optionId);
    if (!option) throw new Error(`proposal option not found: ${optionId}`);
    return {
      proposal_contract_version: proposal.version,
      option_id: option.id,
      goal_summary: proposal.goal_summary,
      business_direction: option.business_direction,
      edit_execution_plan: option.edit_execution_plan,
      asset_requirements: option.asset_requirements,
    };
  }
  const option = proposal.options.find((candidate) => candidate.id === optionId);
  if (!option) throw new Error(`proposal option not found: ${optionId}`);
  return {
    proposal_contract_version: proposal.version,
    option_id: option.id,
    goal_summary: proposal.goal_summary,
    option,
  };
}

export function proposalSelectionFingerprint(proposal: ProductionProposalArtifact, optionId: string): Fingerprint {
  return semanticJsonFingerprint(proposalSelectionProjection(proposal, optionId));
}

export function proposalSelectionFingerprints(proposal: ProductionProposalArtifact): Record<string, Fingerprint> {
  return Object.fromEntries(proposal.options.map((option) => [option.id, proposalSelectionFingerprint(proposal, option.id)]));
}

export function proposalSelectionVirtualPath(optionId: string): string {
  return `.virtual/proposal-selection/${encodeURIComponent(optionId)}.json`;
}

export function semanticFileFingerprint(path: string, parser: (value: unknown) => unknown): Fingerprint {
  return semanticJsonFingerprint(parser(JSON.parse(readFileSync(path, "utf8"))));
}

export function atomicReplaceFile(sourcePath: string, targetPath: string): void {
  mkdirSync(dirname(targetPath), { recursive: true });
  (nodeFs as unknown as { renameSync(source: string, target: string): void }).renameSync(sourcePath, targetPath);
}

export function atomicWriteParsedJson<T>(path: string, value: unknown, parser: (value: unknown) => T): T {
  const parsed = parser(value);
  atomicWriteJson(path, parsed);
  return parsed;
}

export function assertManifestReadable(projectPath: string): ArtifactManifest | null {
  const path = manifestPath(projectPath);
  if (!existsSync(path)) return null;
  const safePath = resolveExistingProjectPath(projectPath, projectArtifacts.artifactManifest, "artifact manifest");
  return parseArtifactManifest(JSON.parse(readFileSync(safePath, "utf8")));
}
