import { createHash } from "node:crypto";
import * as nodeFs from "node:fs";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  parseArtifactManifest,
  type ArtifactFingerprint,
  type ArtifactManifest as PublicArtifactManifest,
  type ArtifactRecord,
  type ArtifactRole,
  type ArtifactState,
  type StageAttempt as PublicStageAttempt,
} from "./artifacts";

export type Fingerprint = ArtifactFingerprint;

export type ArtifactInputFingerprint = {
  key: string;
  schema_version?: string;
  fingerprint: Fingerprint;
  role?: ArtifactRole;
};

export type ArtifactManifestRecord = ArtifactRecord;
export type StageAttempt = PublicStageAttempt;
export type ArtifactManifest = PublicArtifactManifest;

export const lifecycleReasonCodes = {
  ARTIFACT_MISSING: "ARTIFACT_MISSING",
  ARTIFACT_INVALID: "ARTIFACT_INVALID",
  FINGERPRINT_UNAVAILABLE: "FINGERPRINT_UNAVAILABLE",
  RECORD_KEY_MISMATCH: "RECORD_KEY_MISMATCH",
  UNREGISTERED_INPUT: "UNREGISTERED_INPUT",
  CONTENT_CHANGED: "CONTENT_CHANGED",
  CONTENT_FINGERPRINT_MISMATCH: "CONTENT_FINGERPRINT_MISMATCH",
  LINEAGE_UNPROVEN: "LINEAGE_UNPROVEN",
  DEPENDENCY_MISSING: "DEPENDENCY_MISSING",
  DEPENDENCY_PENDING_VALIDATION: "DEPENDENCY_PENDING_VALIDATION",
  DEPENDENCY_STALE: "DEPENDENCY_STALE",
  DEPENDENCY_INVALID: "DEPENDENCY_INVALID",
  DEPENDENCY_FINGERPRINT_CHANGED: "DEPENDENCY_FINGERPRINT_CHANGED",
  DEPENDENCY_CYCLE: "DEPENDENCY_CYCLE",
} as const;

export type LifecycleReasonCode = (typeof lifecycleReasonCodes)[keyof typeof lifecycleReasonCodes];

export type ArtifactStateNode = {
  artifact_key: string;
  role: ArtifactRole;
  exists: boolean;
  valid?: boolean;
  fingerprint?: Fingerprint;
  manifest_record?: ArtifactManifestRecord;
};

export type ArtifactStateEvaluation = {
  artifact_key: string;
  state: ArtifactState;
  fingerprint?: Fingerprint;
  reason_code?: LifecycleReasonCode;
  dependency_key?: string;
};

type CanonicalJsonValue = null | boolean | number | string | CanonicalJsonValue[] | { [key: string]: CanonicalJsonValue };

type FsRuntime = {
  openSync(path: string, flags: string): number;
  fsyncSync(fd: number): void;
  closeSync(fd: number): void;
  renameSync(oldPath: string, newPath: string): void;
};

const fsRuntime = nodeFs as unknown as FsRuntime;
let temporaryWriteSequence = 0;

export function canonicalJson(value: unknown): string {
  return JSON.stringify(toCanonicalJsonValue(value));
}

export function semanticJsonFingerprint(value: unknown): Fingerprint {
  return fingerprintBytes(canonicalJson(value));
}

export function fingerprintBytes(value: string | Uint8Array): Fingerprint {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function fileBytesFingerprint(path: string): Fingerprint {
  return fingerprintBytes(readFileSync(path));
}

export function compositeInputFingerprint(inputs: readonly ArtifactInputFingerprint[]): Fingerprint {
  const semanticInputs = inputs
    .filter((input) => input.role !== "human_view")
    .map((input) => ({
      key: input.key,
      schema_version: input.schema_version ?? "",
      fingerprint: input.fingerprint,
    }));
  return semanticJsonFingerprint(semanticInputs);
}

export function atomicWriteText(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${Date.now().toString(36)}-${temporaryWriteSequence++}`;
  let descriptor: number | undefined;

  try {
    writeFileSync(temporaryPath, content);
    descriptor = fsRuntime.openSync(temporaryPath, "r");
    fsRuntime.fsyncSync(descriptor);
    fsRuntime.closeSync(descriptor);
    descriptor = undefined;
    fsRuntime.renameSync(temporaryPath, path);
  } catch (error) {
    if (descriptor !== undefined) {
      try {
        fsRuntime.closeSync(descriptor);
      } catch {
        // Preserve the original write error.
      }
    }
    if (existsSync(temporaryPath)) {
      try {
        unlinkSync(temporaryPath);
      } catch {
        // Preserve the original write error.
      }
    }
    throw error;
  }
}

export function atomicWriteJson(path: string, value: unknown): void {
  const canonicalValue = toCanonicalJsonValue(value);
  atomicWriteText(path, `${JSON.stringify(canonicalValue, null, 2)}\n`);
}

export function createArtifactManifest(): ArtifactManifest {
  return { contract_version: "1.0", artifacts: {}, stage_attempts: {}, updated_at: new Date().toISOString() };
}

export function readArtifactManifest(path: string): ArtifactManifest | null {
  if (!existsSync(path)) return null;
  const value = JSON.parse(readFileSync(path, "utf8")) as unknown;
  return parseArtifactManifest(value);
}

export function writeArtifactManifest(path: string, manifest: ArtifactManifest): void {
  atomicWriteJson(path, parseArtifactManifest(manifest));
}

export function recordArtifact(manifest: ArtifactManifest, record: ArtifactManifestRecord): ArtifactManifest {
  const next = {
    ...manifest,
    artifacts: { ...manifest.artifacts, [record.key]: { ...record, inputs: record.inputs.map((input) => ({ ...input })) } },
    updated_at: record.produced_at ?? record.validated_at ?? new Date().toISOString(),
  };
  return parseArtifactManifest(next);
}

export function recordStageAttempt(manifest: ArtifactManifest, attempt: StageAttempt): ArtifactManifest {
  const normalizedAttempt = {
    ...attempt,
    inputs: attempt.inputs?.map((input) => ({ ...input })),
    output_artifact_keys: [...(attempt.output_artifact_keys ?? [])],
  };
  const next = {
    ...manifest,
    stage_attempts: { ...manifest.stage_attempts, [attempt.stage]: normalizedAttempt },
    updated_at: attempt.completed_at,
  };
  return parseArtifactManifest(next);
}

export function getStageAttempt(manifest: ArtifactManifest, stage: string, inputFingerprint: Fingerprint): StageAttempt | undefined {
  const attempt = manifest.stage_attempts[stage];
  return attempt?.input_fingerprint === inputFingerprint ? attempt : undefined;
}

export function evaluateArtifactStates(nodes: readonly ArtifactStateNode[]): Record<string, ArtifactStateEvaluation> {
  const nodeByKey = new Map<string, ArtifactStateNode>();
  for (const node of nodes) {
    if (nodeByKey.has(node.artifact_key)) throw new Error(`duplicate artifact lifecycle node: ${node.artifact_key}`);
    nodeByKey.set(node.artifact_key, node);
  }

  const cyclicKeys = findCyclicKeys(nodeByKey);
  const evaluations = new Map<string, ArtifactStateEvaluation>();

  const evaluate = (artifactKey: string): ArtifactStateEvaluation => {
    const cached = evaluations.get(artifactKey);
    if (cached) return cached;
    const node = nodeByKey.get(artifactKey);
    if (!node) {
      return stateResult(artifactKey, "missing", undefined, lifecycleReasonCodes.ARTIFACT_MISSING);
    }

    let result: ArtifactStateEvaluation;
    if (!node.exists) {
      result = stateResult(artifactKey, "missing", node.fingerprint, lifecycleReasonCodes.ARTIFACT_MISSING);
    } else if (node.valid === false) {
      result = stateResult(artifactKey, "invalid", node.fingerprint, lifecycleReasonCodes.ARTIFACT_INVALID);
    } else if (node.role === "human_view") {
      result = stateResult(artifactKey, "current", node.fingerprint);
    } else if (!node.fingerprint) {
      result = stateResult(artifactKey, "invalid", undefined, lifecycleReasonCodes.FINGERPRINT_UNAVAILABLE);
    } else if (!node.manifest_record) {
      const acceptsUnregisteredInput = node.role === "authoritative_input" || node.role === "command_request";
      result = stateResult(
        artifactKey,
        acceptsUnregisteredInput ? "pending_validation" : "stale",
        node.fingerprint,
        acceptsUnregisteredInput ? lifecycleReasonCodes.UNREGISTERED_INPUT : lifecycleReasonCodes.LINEAGE_UNPROVEN,
      );
    } else if (node.manifest_record.key !== artifactKey) {
      result = stateResult(artifactKey, "invalid", node.fingerprint, lifecycleReasonCodes.RECORD_KEY_MISMATCH);
    } else if (node.manifest_record.fingerprint !== node.fingerprint) {
      const acceptsChangedInput = node.role === "authoritative_input" || node.role === "command_request";
      result = stateResult(
        artifactKey,
        acceptsChangedInput ? "pending_validation" : "invalid",
        node.fingerprint,
        acceptsChangedInput ? lifecycleReasonCodes.CONTENT_CHANGED : lifecycleReasonCodes.CONTENT_FINGERPRINT_MISMATCH,
      );
    } else if (cyclicKeys.has(artifactKey)) {
      result = stateResult(artifactKey, "invalid", node.fingerprint, lifecycleReasonCodes.DEPENDENCY_CYCLE);
    } else {
      result = evaluateDependencies(node, nodeByKey, evaluate);
    }

    evaluations.set(artifactKey, result);
    return result;
  };

  const output: Record<string, ArtifactStateEvaluation> = {};
  for (const node of nodes) output[node.artifact_key] = evaluate(node.artifact_key);
  return output;
}

function evaluateDependencies(
  node: ArtifactStateNode,
  nodeByKey: ReadonlyMap<string, ArtifactStateNode>,
  evaluate: (artifactKey: string) => ArtifactStateEvaluation,
): ArtifactStateEvaluation {
  const record = node.manifest_record!;
  for (const input of record.inputs) {
    const dependencyNode = nodeByKey.get(input.key);
    if (dependencyNode?.role === "human_view") continue;
    if (!dependencyNode) {
      return stateResult(node.artifact_key, "stale", node.fingerprint, lifecycleReasonCodes.DEPENDENCY_MISSING, input.key);
    }

    const dependency = evaluate(input.key);
    if (dependency.state !== "current") {
      return stateResult(
        node.artifact_key,
        "stale",
        node.fingerprint,
        dependencyReasonCode(dependency.state),
        input.key,
      );
    }
    if (dependencyNode.fingerprint !== input.fingerprint) {
      return stateResult(
        node.artifact_key,
        "stale",
        node.fingerprint,
        lifecycleReasonCodes.DEPENDENCY_FINGERPRINT_CHANGED,
        input.key,
      );
    }
  }
  return stateResult(node.artifact_key, "current", node.fingerprint);
}

function dependencyReasonCode(state: Exclude<ArtifactState, "current">): LifecycleReasonCode {
  switch (state) {
    case "missing":
      return lifecycleReasonCodes.DEPENDENCY_MISSING;
    case "pending_validation":
      return lifecycleReasonCodes.DEPENDENCY_PENDING_VALIDATION;
    case "stale":
      return lifecycleReasonCodes.DEPENDENCY_STALE;
    case "invalid":
      return lifecycleReasonCodes.DEPENDENCY_INVALID;
  }
}

function stateResult(
  artifactKey: string,
  state: ArtifactState,
  fingerprint?: Fingerprint,
  reasonCode?: LifecycleReasonCode,
  dependencyKey?: string,
): ArtifactStateEvaluation {
  return {
    artifact_key: artifactKey,
    state,
    ...(fingerprint ? { fingerprint } : {}),
    ...(reasonCode ? { reason_code: reasonCode } : {}),
    ...(dependencyKey ? { dependency_key: dependencyKey } : {}),
  };
}

function findCyclicKeys(nodeByKey: ReadonlyMap<string, ArtifactStateNode>): Set<string> {
  const color = new Map<string, "visiting" | "visited">();
  const stack: string[] = [];
  const cyclic = new Set<string>();

  const visit = (artifactKey: string): void => {
    color.set(artifactKey, "visiting");
    stack.push(artifactKey);
    const node = nodeByKey.get(artifactKey);
    for (const input of node?.manifest_record?.inputs ?? []) {
      const dependency = nodeByKey.get(input.key);
      if (dependency?.role === "human_view" || !dependency) continue;
      const dependencyColor = color.get(input.key);
      if (dependencyColor === "visiting") {
        const cycleStart = stack.lastIndexOf(input.key);
        for (const key of stack.slice(cycleStart)) cyclic.add(key);
      } else if (!dependencyColor) {
        visit(input.key);
      }
    }
    stack.pop();
    color.set(artifactKey, "visited");
  };

  for (const artifactKey of nodeByKey.keys()) {
    if (!color.has(artifactKey)) visit(artifactKey);
  }
  return cyclic;
}

function toCanonicalJsonValue(value: unknown, ancestors = new WeakSet<object>()): CanonicalJsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "object") throw new Error(`value is not JSON-serializable: ${typeof value}`);
  if (ancestors.has(value)) throw new Error("value is not JSON-serializable: circular reference");

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => item === undefined ? null : toCanonicalJsonValue(item, ancestors));
    }

    const normalized: { [key: string]: CanonicalJsonValue } = {};
    for (const key of Object.keys(value).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item !== undefined) normalized[key] = toCanonicalJsonValue(item, ancestors);
    }
    return normalized;
  } finally {
    ancestors.delete(value);
  }
}
