import { existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { computeCliPayloadDigest, computeDeliveryDigest, computeOfficialSkillDigest, computeRendererResourcesDigest, computeRuntimeCompatibilityDigest } from "../packages/cli/src/delivery-identity";
import { cliPayloadFiles } from "../packages/cli/src/delivery-runtime";
import { artifactContractsDigest } from "../packages/cli/src/artifact-contracts";

const root = resolve(process.argv[2] ?? ".");
const distributionKind = process.argv[3] ?? "source";
const sourceRevision = process.env.KOUBO_CLIP_SOURCE_REVISION ?? "unknown";
const version = process.env.KOUBO_CLIP_VERSION ?? "0.0.1";
const skillRoot = join(root, "skills", "koubo-clip");
const rendererRoot = join(root, "resources", "hyperframes");
const sourceRendererRoot = join(root, "packages", "cli", "vendor", "hyperframes");
const schemaVersions = { "sources.json": "2.0", "source-materialization.json": "1.0", "edl.json": "2.0", "production-proposal.json": "3.0", "enrichment-plan.json": "2.0", "render-contract.json": "2.0", "bindings.json": "2.0", "render-contract-result.json": "2.0", "render-contract-inspection.json": "2.0", "delivery-manifest.json": "3.0" };
const capabilityIds = ["detached_source.v1", "external_frame_evidence.v1", "portable_edl.v1", "artifact_contract.discovery.v1", "artifact_validation.aggregate.v1", "render_contract.export.v1", "render_contract.consume_strict.v1", "source_binding.v1", "caption_layout.safe_area.v1"];
const runtimeDependencies = ["gsap@3.15.0", "hyperframes@0.7.36"];
const cliPayloadDigest = computeCliPayloadDigest({ root, files: cliPayloadFiles(root) }).digest;
const rendererResourcesDigest = computeRendererResourcesDigest({ root: existsSync(rendererRoot) ? rendererRoot : sourceRendererRoot }).digest;
const baseManifest = {
  schema_version: "3.0" as const,
  cli_version: version,
  source_revision: sourceRevision,
  distribution_kind: distributionKind,
  cli_payload_digest: cliPayloadDigest,
  renderer_resources_digest: rendererResourcesDigest,
  official_skill_digest: computeOfficialSkillDigest({ root: skillRoot }).digest,
  artifact_contracts_digest: artifactContractsDigest(),
  runtime_compatibility_digest: computeRuntimeCompatibilityDigest({ cli_payload_digest: cliPayloadDigest, renderer_resources_digest: rendererResourcesDigest, schema_versions: schemaVersions, capability_ids: capabilityIds, runtime_dependencies: runtimeDependencies }),
  schema_versions: schemaVersions,
  capability_ids: capabilityIds,
  runtime_dependencies: runtimeDependencies,
};
const manifest = { ...baseManifest, delivery_digest: computeDeliveryDigest(baseManifest) };
writeFileSync(join(root, "delivery-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
