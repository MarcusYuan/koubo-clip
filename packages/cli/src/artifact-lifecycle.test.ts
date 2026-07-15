import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  atomicWriteJson,
  atomicWriteText,
  compositeInputFingerprint,
  createArtifactManifest,
  evaluateArtifactStates,
  fileBytesFingerprint,
  getStageAttempt,
  readArtifactManifest,
  recordArtifact,
  recordStageAttempt,
  semanticJsonFingerprint,
  writeArtifactManifest,
  type ArtifactManifestRecord,
  type ArtifactStateNode,
} from "./artifact-lifecycle";

const FP_A = `sha256:${"a".repeat(64)}` as const;
const FP_B = `sha256:${"b".repeat(64)}` as const;
const FP_C = `sha256:${"c".repeat(64)}` as const;

test("semantic JSON fingerprints ignore whitespace and object key order but preserve array order", () => {
  const left = JSON.parse('{ "b": 2, "a": { "y": true, "x": [1, 2] } }');
  const right = JSON.parse('{"a":{"x":[1,2],"y":true},"b":2}');

  expect(semanticJsonFingerprint(left)).toBe(semanticJsonFingerprint(right));
  expect(semanticJsonFingerprint({ values: [1, 2] }) === semanticJsonFingerprint({ values: [2, 1] })).toBe(false);
});

test("semantic and file-byte fingerprints change only when their consumed content changes", () => {
  expect(semanticJsonFingerprint({ selected: "a" }) === semanticJsonFingerprint({ selected: "b" })).toBe(false);

  const dir = mkdtempSync(join(tmpdir(), "koubo-lifecycle-bytes-"));
  const path = join(dir, "asset.bin");
  writeFileSync(path, "first");
  const first = fileBytesFingerprint(path);
  writeFileSync(path, "second");
  expect(fileBytesFingerprint(path) === first).toBe(false);
});

test("composite input fingerprints preserve declared order and exclude human views", () => {
  const semanticInputs = [
    { key: "edit-plan", schema_version: "1.0", fingerprint: FP_A },
    { key: "asset:hero", schema_version: "1.0", fingerprint: FP_B },
  ];
  const forward = compositeInputFingerprint(semanticInputs);
  const reversed = compositeInputFingerprint([...semanticInputs].reverse());
  expect(forward === reversed).toBe(false);

  const withMarkdown = compositeInputFingerprint([
    ...semanticInputs,
    { key: "report", schema_version: "1.0", fingerprint: FP_C, role: "human_view" },
  ]);
  const changedMarkdown = compositeInputFingerprint([
    ...semanticInputs,
    { key: "report", schema_version: "1.0", fingerprint: FP_A, role: "human_view" },
  ]);
  expect(withMarkdown).toBe(forward);
  expect(changedMarkdown).toBe(forward);
});

test("manifest helpers record artifacts and the latest success or failure for a stage input", () => {
  const artifact: ArtifactManifestRecord = {
    key: "edl",
    path: "edl.json",
    role: "derived",
    schema_version: "1.0",
    fingerprint: FP_A,
    authored_by: "cli",
    produced_by_command: "project.compile-edl",
    producer_cli_version: "0.0.1",
    command_contract_version: "1.0",
    inputs: [{ key: "edit-plan", schema_version: "1.0", fingerprint: FP_B }],
    produced_at: "2026-07-15T01:00:00.000Z",
  };

  expect(() => recordArtifact(createArtifactManifest(), artifact)).toThrow("references missing artifact key edit-plan");

  let manifest = recordArtifact(createArtifactManifest(), record("edit-plan", "authoritative_input", FP_B));
  manifest = recordArtifact(manifest, artifact);
  manifest = recordStageAttempt(manifest, {
    stage: "compile-edl",
    command: "project.compile-edl",
    input_fingerprint: FP_B,
    started_at: "2026-07-15T01:00:00.000Z",
    completed_at: "2026-07-15T01:00:01.000Z",
    status: "success",
    output_artifact_keys: ["edl"],
  });
  expect(manifest.artifacts.edl).toEqual(artifact);
  expect(getStageAttempt(manifest, "compile-edl", FP_B)?.status).toBe("success");

  manifest = recordStageAttempt(manifest, {
    stage: "compile-edl",
    command: "project.compile-edl",
    input_fingerprint: FP_B,
    started_at: "2026-07-15T01:01:00.000Z",
    completed_at: "2026-07-15T01:01:01.000Z",
    status: "failed",
    output_artifact_keys: [],
    failure_code: "EDL_VALIDATION_FAILED",
    remediation: "Fix edit-plan.json and retry.",
  });
  expect(getStageAttempt(manifest, "compile-edl", FP_B)?.status).toBe("failed");
  expect(getStageAttempt(manifest, "compile-edl", FP_B)?.failure_code).toBe("EDL_VALIDATION_FAILED");
  expect(manifest.artifacts.edl).toEqual(artifact);

  expect(() =>
    recordStageAttempt(manifest, {
      stage: "render",
      command: "project.render",
      input_fingerprint: FP_A,
      started_at: "2026-07-15T01:02:00.000Z",
      completed_at: "2026-07-15T01:02:01.000Z",
      status: "success",
      output_artifact_keys: ["render-output:missing"],
    }),
  ).toThrow("references missing artifact key render-output:missing");
});

test("dependency evaluation propagates pending and stale state through the full closure", () => {
  const nodes: ArtifactStateNode[] = [
    node("source", "authoritative_input", FP_A, record("source", "authoritative_input", FP_A)),
    node("edit-plan", "authoritative_input", FP_C, record("edit-plan", "authoritative_input", FP_B, [{ key: "source", fingerprint: FP_A }])),
    node("edl", "derived", FP_A, record("edl", "derived", FP_A, [{ key: "edit-plan", fingerprint: FP_B }])),
    node("render", "execution_result", FP_B, record("render", "execution_result", FP_B, [{ key: "edl", fingerprint: FP_A }])),
  ];

  const states = evaluateArtifactStates(nodes);
  expect(states.source?.state).toBe("current");
  expect(states["edit-plan"]?.state).toBe("pending_validation");
  expect(states["edit-plan"]?.reason_code).toBe("CONTENT_CHANGED");
  expect(states.edl?.state).toBe("stale");
  expect(states.edl?.reason_code).toBe("DEPENDENCY_PENDING_VALIDATION");
  expect(states.render?.state).toBe("stale");
  expect(states.render?.reason_code).toBe("DEPENDENCY_STALE");
});

test("legacy inputs remain pending while legacy derived artifacts report LINEAGE_UNPROVEN", () => {
  const states = evaluateArtifactStates([
    node("edit-plan", "authoritative_input", FP_A),
    node("old-edl", "derived", FP_B),
  ]);

  expect(states["edit-plan"]?.state).toBe("pending_validation");
  expect(states["edit-plan"]?.reason_code).toBe("UNREGISTERED_INPUT");
  expect(states["old-edl"]?.state).toBe("stale");
  expect(states["old-edl"]?.reason_code).toBe("LINEAGE_UNPROVEN");
});

test("dependency evaluation keeps missing and invalid distinct", () => {
  const states = evaluateArtifactStates([
    { artifact_key: "missing", role: "derived", exists: false },
    { artifact_key: "broken", role: "derived", exists: true, valid: false },
  ]);

  expect(states.missing?.state).toBe("missing");
  expect(states.missing?.reason_code).toBe("ARTIFACT_MISSING");
  expect(states.broken?.state).toBe("invalid");
  expect(states.broken?.reason_code).toBe("ARTIFACT_INVALID");
});

test("human-view dependencies never affect artifact state", () => {
  const markdown = node("proposal-md", "human_view", FP_C);
  const output = node(
    "edl",
    "derived",
    FP_A,
    record("edl", "derived", FP_A, [{ key: "proposal-md", fingerprint: FP_B }]),
  );

  const states = evaluateArtifactStates([markdown, output]);
  expect(states["proposal-md"]?.state).toBe("current");
  expect(states.edl?.state).toBe("current");
});

test("dependency cycles are invalid without recursion and stale their consumers", () => {
  const states = evaluateArtifactStates([
    node("a", "derived", FP_A, record("a", "derived", FP_A, [{ key: "b", fingerprint: FP_B }])),
    node("b", "derived", FP_B, record("b", "derived", FP_B, [{ key: "a", fingerprint: FP_A }])),
    node("consumer", "execution_result", FP_C, record("consumer", "execution_result", FP_C, [{ key: "a", fingerprint: FP_A }])),
  ]);

  expect(states.a?.state).toBe("invalid");
  expect(states.a?.reason_code).toBe("DEPENDENCY_CYCLE");
  expect(states.b?.state).toBe("invalid");
  expect(states.consumer?.state).toBe("stale");
  expect(states.consumer?.reason_code).toBe("DEPENDENCY_INVALID");
});

test("atomic text, JSON, and manifest writes replace complete files without temp residue", () => {
  const dir = mkdtempSync(join(tmpdir(), "koubo-lifecycle-atomic-"));
  const textPath = join(dir, "state.txt");
  const jsonPath = join(dir, "state.json");
  const manifestPath = join(dir, "artifact-manifest.json");
  writeFileSync(textPath, "old");

  atomicWriteText(textPath, "new\n");
  atomicWriteJson(jsonPath, { z: 1, a: { y: 2, x: 1 } });
  const emptyManifest = createArtifactManifest();
  writeArtifactManifest(manifestPath, emptyManifest);

  expect(readFileSync(textPath, "utf8")).toBe("new\n");
  expect(readFileSync(jsonPath, "utf8")).toBe('{\n  "a": {\n    "x": 1,\n    "y": 2\n  },\n  "z": 1\n}\n');
  expect(existsSync(manifestPath)).toBe(true);
  expect(readArtifactManifest(manifestPath)).toEqual(emptyManifest);
  expect(readdirSync(dir).some((name) => name.includes(".tmp-"))).toBe(false);
});

function node(
  artifact_key: string,
  role: ArtifactStateNode["role"],
  fingerprint: ArtifactStateNode["fingerprint"],
  manifest_record?: ArtifactManifestRecord,
): ArtifactStateNode {
  return { artifact_key, role, exists: true, valid: true, fingerprint, manifest_record };
}

function record(
  key: string,
  role: ArtifactManifestRecord["role"],
  fingerprint: ArtifactManifestRecord["fingerprint"],
  inputs: ArtifactManifestRecord["inputs"] = [],
): ArtifactManifestRecord {
  return {
    key,
    path: `${key}.json`,
    role,
    schema_version: "1.0",
    fingerprint,
    authored_by: role === "authoritative_input" ? "agent" : "cli",
    produced_by_command: role === "authoritative_input" ? undefined : `project.${key}`,
    validated_by_command: role === "authoritative_input" ? `project.${key}` : undefined,
    producer_cli_version: "0.0.1",
    command_contract_version: "1.0",
    inputs,
    produced_at: role === "authoritative_input" ? undefined : "2026-07-15T01:00:00.000Z",
    validated_at: role === "authoritative_input" ? "2026-07-15T01:00:00.000Z" : undefined,
  };
}
