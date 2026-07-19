import { expect, test } from "bun:test";
import {
  ArtifactValidationError,
  artifactContractIndex,
  artifactContractsDigest,
  assertArtifactContract,
  assertProductionProposalContract,
  getArtifactContract,
  productionProposalExample,
  sourceFrameRequestExample,
} from "./artifact-contracts";
import {
  parseAssetUsagePlan,
  parseEditPlan,
  parseEnrichmentPlan,
  parseFocusCandidates,
  parseFocusGrounding,
  parseMusicRequest,
  parseProductionProposal,
  parseSourceFrameRequest,
  parseSourcesManifest,
  parseTranscript,
  parseVisualCandidates,
  parseVisualRequest,
} from "./artifacts";

const writableArtifactIds = [
  "production-proposal",
  "source-manifest",
  "transcript",
  "edit-plan",
  "enrichment-plan",
  "asset-usage-plan",
  "source-frame-request",
  "focus-candidates",
  "focus-grounding",
  "music-request",
  "visual-request",
  "visual-candidates",
  "evidence-import-manifest",
  "source-map",
] as const;

const runtimeParsers: Record<string, (value: unknown) => unknown> = {
  "production-proposal": parseProductionProposal,
  "source-manifest": parseSourcesManifest,
  transcript: parseTranscript,
  "edit-plan": parseEditPlan,
  "enrichment-plan": parseEnrichmentPlan,
  "asset-usage-plan": parseAssetUsagePlan,
  "source-frame-request": parseSourceFrameRequest,
  "focus-candidates": parseFocusCandidates,
  "focus-grounding": parseFocusGrounding,
  "music-request": parseMusicRequest,
  "visual-request": parseVisualRequest,
  "visual-candidates": parseVisualCandidates,
};

test("production proposal contract is complete, deterministic, and self-validating", () => {
  const contract = getArtifactContract("production-proposal");
  expect(contract?.schema_version).toBe("3.0");
  expect(contract?.external_writes_allowed).toBe(true);
  expect(contract?.schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
  expect(/^sha256:[a-f0-9]{64}$/.test(contract?.schema_digest ?? "")).toBe(true);
  expect(/^sha256:[a-f0-9]{64}$/.test(contract?.contract_digest ?? "")).toBe(true);
  expect(/^sha256:[a-f0-9]{64}$/.test(artifactContractsDigest())).toBe(true);
  expect(artifactContractIndex()["production-proposal"]?.contract_digest).toBe(contract?.contract_digest);
  expect(parseProductionProposal(productionProposalExample).options.length).toBe(2);
});

test("production proposal validation aggregates stable closed-schema issues", () => {
  const invalid = structuredClone(productionProposalExample) as Record<string, any>;
  invalid.goal_summary = "";
  invalid.options[0].label = "";
  invalid.options[0].business_direction.suitable_for = "";
  invalid.options[1].id = invalid.options[0].id;

  expect(() => assertProductionProposalContract(invalid)).toThrow("failed validation");
  try {
    assertProductionProposalContract(invalid);
  } catch (error) {
    if (!(error instanceof ArtifactValidationError)) throw error;
    expect(error.code).toBe("ARTIFACT_VALIDATION_FAILED");
    const issueCodes = error.issues.map((issue) => `${issue.path}:${issue.keyword}`);
    expect(issueCodes.length).toBe(4);
    expect(issueCodes).toContain("/goal_summary:minLength");
    expect(issueCodes).toContain("/options/0/business_direction/suitable_for:minLength");
    expect(issueCodes).toContain("/options/0/label:minLength");
    expect(issueCodes).toContain("/options/1/id:unique");
  }
});

test("production proposal keeps cleanup and execution removal intent identical", () => {
  const invalid = structuredClone(productionProposalExample) as Record<string, any>;
  invalid.options[0].sfx.enabled = false;
  invalid.options[0].asset_requirements.sfx_slots.push({ slot_id: "extra", kind: "sfx", purpose: "extra", required: true });

  try {
    assertProductionProposalContract(invalid);
    throw new Error("expected proposal media requirement validation failure");
  } catch (error) {
    if (!(error instanceof ArtifactValidationError)) throw error;
    const issues = error.issues.map((issue) => `${issue.path}:${issue.keyword}`);
    expect(issues).toContain("/options/0/asset_requirements/sfx_slots:confirmation");
  }
});

test("production proposal rejects every non-current version before field repair", () => {
  for (const version of [undefined, "1.0", "1.1"]) {
    expect(() => assertProductionProposalContract({ ...productionProposalExample, version })).toThrow("unsupported");
  }
});

test("contract registry exposes every external JSON entry point without version selection", () => {
  const index = artifactContractIndex();
  for (const artifactId of writableArtifactIds) {
    const contract = getArtifactContract(artifactId);
    expect(contract === undefined).toBe(false);
    expect(contract?.external_writes_allowed).toBe(true);
    expect(contract?.ownership === "agent_authored" || contract?.ownership === "host_authored").toBe(true);
    expect(contract?.template === undefined).toBe(false);
    expect(contract?.example === undefined).toBe(false);
    expect(contract?.template_requires_filling).toBe(true);
    expect(index[artifactId]?.schema_version).toBe(contract?.schema_version);
    expect(index[artifactId]?.schema_digest).toBe(contract?.schema_digest);
    expect(index[artifactId]?.contract_digest).toBe(contract?.contract_digest);
  }

  const enrichment = getArtifactContract("enrichment-plan");
  expect(enrichment?.schema_version).toBe("2.0");
  expect(enrichment?.template).toEqual({
    version: "2.0",
    profile: {
      source_mode: "talking_head_avatar",
      aspect_ratio: "source",
      caption_identity: "anchor",
      layout: "stack",
      style: "minimal",
      frame: "clean",
      caption_layout: { placement: "auto", size: "medium" },
    },
    elements: [],
    audio: { music: [], sfx: [] },
  });
});

test("caption layout contract fields are closed and enum validated", () => {
  const proposal = structuredClone(productionProposalExample);
  proposal.options[0]!.subtitles.placement = "bottom_safe";
  proposal.options[0]!.subtitles.size = "large";
  assertProductionProposalContract(proposal);

  try {
    assertProductionProposalContract({
      ...proposal,
      options: [{ ...proposal.options[0], subtitles: { ...proposal.options[0]!.subtitles, size: "huge" } }, proposal.options[1]],
    });
    throw new Error("expected proposal subtitle size validation failure");
  } catch (error) {
    if (!(error instanceof ArtifactValidationError)) throw error;
    expect(error.issues.map((issue) => `${issue.path}:${issue.keyword}`)).toContain("/options/0/subtitles/size:enum");
  }

  const enrichment = structuredClone(getArtifactContract("enrichment-plan")!.example) as Record<string, any>;
  enrichment.profile.caption_layout = { placement: "center_lower", size: "small" };
  assertArtifactContract("enrichment-plan", enrichment);

  try {
    assertArtifactContract("enrichment-plan", {
      ...enrichment,
      profile: { ...enrichment.profile, caption_layout: { placement: "center_lower", size: "small", extra: true } },
    });
    throw new Error("expected enrichment caption layout validation failure");
  } catch (error) {
    if (!(error instanceof ArtifactValidationError)) throw error;
    expect(error.issues.map((issue) => `${issue.path}:${issue.keyword}`)).toContain("/profile/caption_layout/extra:additionalProperties");
  }
});

test("source manifest contract remains a host-authored command request", () => {
  const contract = getArtifactContract("source-manifest")!;
  expect(contract.ownership).toBe("host_authored");
  expect(contract.role).toBe("command_request");
  expect(contract.external_writes_allowed).toBe(true);
  expect(contract.schema_version).toBe("2.0");
  assertArtifactContract("source-manifest", contract.example);
});

test("every writable contract has closed array items and a self-validating example", () => {
  for (const artifactId of writableArtifactIds) {
    const contract = getArtifactContract(artifactId)!;
    expect(hasBareObjectArrayItem(contract.schema)).toBe(false);
    assertArtifactContract(artifactId, contract.example);
  }
});

test("writable contract examples pass their runtime parsers", () => {
  for (const [artifactId, parse] of Object.entries(runtimeParsers)) {
    parse(structuredClone(getArtifactContract(artifactId)!.example));
  }
});

test("writable runtime parsers reject closed-schema root and nested unknown fields", () => {
  for (const [artifactId, parse] of Object.entries(runtimeParsers)) {
    const value = structuredClone(getArtifactContract(artifactId)!.example) as Record<string, unknown>;
    value.unexpected = true;
    expect(() => parse(value)).toThrow("failed validation");
  }

  for (const [artifactId, mutate] of nestedUnknownCases) {
    const value = structuredClone(getArtifactContract(artifactId)!.example);
    mutate(value as Record<string, any>);
    expect(() => runtimeParsers[artifactId]!(value)).toThrow("failed validation");
  }
});

test("edit-plan authoring contract only exposes candidate-bound cut and keep decisions", () => {
  const contract = getArtifactContract("edit-plan")!;
  expect(JSON.stringify(contract.schema).includes("source_order")).toBe(false);
  for (const invalid of [
    { action: "skip", candidate_id: "candidate-1" },
    { action: "cut" },
  ]) {
    expect(() => parseEditPlan({ ...contract.example as object, decisions: [invalid] })).toThrow("failed validation");
  }
});

test("source frame request contract is complete and runtime-equivalent", () => {
  expect(parseSourceFrameRequest(sourceFrameRequestExample).frames[0]).toEqual(sourceFrameRequestExample.frames[0]);
  const invalid = {
    version: "1.0",
    frames: [
      { id: "../bad", source_id: "", time_seconds: -1, unexpected: true },
      { id: "duplicate", source_id: "src-001", time_seconds: 1, transcript_quote: "quote", reason: "reason" },
      { id: "duplicate", source_id: "src-001", time_seconds: 2, transcript_quote: "quote", reason: "reason" },
    ],
  };
  try {
    parseSourceFrameRequest(invalid);
    throw new Error("expected source frame request validation failure");
  } catch (error) {
    if (!(error instanceof ArtifactValidationError)) throw error;
    const issues = error.issues.map((issue) => `${issue.path}:${issue.keyword}`);
    expect(issues).toContain("/frames/0/id:pattern");
    expect(issues).toContain("/frames/0/reason:required");
    expect(issues).toContain("/frames/0/time_seconds:minimum");
    expect(issues).toContain("/frames/0/transcript_quote:required");
    expect(issues).toContain("/frames/0/unexpected:additionalProperties");
    expect(issues).toContain("/frames/2/id:unique");
  }
});

test("source frame request rejects non-current version before field repair", () => {
  try {
    parseSourceFrameRequest({ version: "0.9", frames: [] });
    throw new Error("expected version failure");
  } catch (error) {
    expect((error as { code?: string }).code).toBe("CONTRACT_SCHEMA_UNSUPPORTED");
    expect((error as { schema_version?: string }).schema_version).toBe("1.0");
  }
});

test("CLI-owned contracts are discoverable but never authorable", () => {
  for (const artifactId of ["project", "source-materialization", "analysis", "review-package", "edl", "source-frames", "focus-frames", "focus-review", "music-acquisition", "music-review", "visual-acquisition", "visual-review", "asset-manifest", "storyboard", "render-result", "inspection", "render-contract", "source-binding", "render-contract-result", "render-contract-inspection", "delivery-manifest"]) {
    const contract = getArtifactContract(artifactId);
    expect(contract === undefined).toBe(false);
    expect(contract?.ownership).toBe("cli_owned");
    expect(contract?.external_writes_allowed).toBe(false);
    expect(contract?.template).toBe(undefined);
    expect(Boolean(contract?.producer)).toBe(true);
  }
});

function hasBareObjectArrayItem(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasBareObjectArrayItem);
  const record = value as Record<string, unknown>;
  const items = record.items;
  if (items && typeof items === "object" && !Array.isArray(items)) {
    const item = items as Record<string, unknown>;
    if (item.type === "object" && item.properties === undefined && item.additionalProperties === undefined) return true;
  }
  return Object.values(record).some(hasBareObjectArrayItem);
}

const nestedUnknownCases: Array<[string, (value: Record<string, any>) => void]> = [
  ["source-manifest", (value) => { value.sources[0].unexpected = true; }],
  ["transcript", (value) => { value.segments[0].unexpected = true; }],
  ["edit-plan", (value) => { value.decisions = [{ action: "cut", candidate_id: "candidate-1", unexpected: true }]; }],
  ["enrichment-plan", (value) => { value.elements = [{ id: "caption-1", source: "manual", element_id: "anchor", element_type: "caption_identity", start: 0, end: 1, reason: "show caption identity", unexpected: true }]; }],
  ["asset-usage-plan", (value) => { value.music = [{ asset_ref: "assets/music.wav", start: 0, end: 1, purpose: "bed", unexpected: true }]; }],
  ["source-frame-request", (value) => { value.frames[0].unexpected = true; }],
  ["focus-candidates", (value) => { value.candidates[0].unexpected = true; }],
  ["focus-grounding", (value) => { value.groundings[0].unexpected = true; }],
  ["visual-request", (value) => { value.requests[0].unexpected = true; }],
  ["visual-candidates", (value) => { value.candidates[0].unexpected = true; }],
];
