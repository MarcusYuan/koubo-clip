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
import { parseProductionProposal, parseSourceFrameRequest } from "./artifacts";

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
  "evidence-import-manifest",
  "source-map",
] as const;

test("production proposal contract is complete, deterministic, and self-validating", () => {
  const contract = getArtifactContract("production-proposal");
  expect(contract?.schema_version).toBe("2.0");
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
  invalid.options[0].recommended = true;
  invalid.options[0].business_direction.direction_id = invalid.options[0].id;
  invalid.options[0].edit_execution_plan.remove_intent = "all pauses";
  invalid.options[0].edit_execution_plan.visual_asset_slots = [];
  invalid.options[1].id = invalid.options[0].id;

  expect(() => assertProductionProposalContract(invalid)).toThrow("failed validation");
  try {
    assertProductionProposalContract(invalid);
  } catch (error) {
    if (!(error instanceof ArtifactValidationError)) throw error;
    expect(error.code).toBe("ARTIFACT_VALIDATION_FAILED");
    expect(error.issues.map((issue) => `${issue.path}:${issue.keyword}`)).toEqual([
      "/goal_summary:minLength",
      "/options/0/business_direction/direction_id:additionalProperties",
      "/options/0/edit_execution_plan/remove_intent:additionalProperties",
      "/options/0/edit_execution_plan/visual_asset_slots:additionalProperties",
      "/options/0/recommended:additionalProperties",
      "/options/1/id:unique",
    ]);
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
    },
    elements: [],
    audio: { music: [], sfx: [] },
  });
});

test("every writable contract has closed array items and a self-validating example", () => {
  for (const artifactId of writableArtifactIds) {
    const contract = getArtifactContract(artifactId)!;
    expect(hasBareObjectArrayItem(contract.schema)).toBe(false);
    assertArtifactContract(artifactId, contract.example);
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
  for (const artifactId of ["edl", "render-contract", "render-contract-result", "inspection", "delivery-manifest"]) {
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
