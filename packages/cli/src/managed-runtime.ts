import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { cliVersion, distributionKind, isBoxCliDistribution, resolveDistributionRoot, resolveHyperframesBinary, resolveHyperframesRoot } from "./bundle-paths";
import { artifactContractsDigest } from "./artifact-contracts";
import { type ProviderExecutionMode } from "./artifacts";

export type MachineError = {
  code: string;
  message: string;
  retryable: boolean;
};

export type MachineEnvelope<T> =
  | { contract_version: "1"; ok: true; result: T }
  | { contract_version: "1"; ok: false; error: MachineError };

export type MachineFailureEnvelope = { contract_version: "1"; ok: false; error: MachineError };

export type ManagedRuntimeStatus = "healthy" | "degraded" | "needs_configuration";

export type RuntimeLockFile = {
  schema_version: "1";
  files: Array<{
    path: string;
    size: number;
    sha256: string;
    role: string;
    executable?: true;
  }>;
};

type RuntimeIssue = {
  code: string;
  message: string;
  path?: string;
  role?: string;
};

export function machineSuccess<T>(result: T): MachineEnvelope<T> {
  return { contract_version: "1", ok: true, result };
}

export function machineFailure(code: string, message: string, retryable = false): MachineFailureEnvelope {
  return { contract_version: "1", ok: false, error: { code, message: sanitizeMessage(message), retryable } };
}

export function errorEnvelope(error: unknown, fallbackCode: string): MachineFailureEnvelope {
  const source = error && typeof error === "object" ? error as Record<string, unknown> : {};
  return machineFailure(
    typeof source.code === "string" ? source.code : fallbackCode,
    error instanceof Error ? error.message : String(error),
    Boolean(source.retryable),
  );
}

export function boxDoctorResult(mode: ProviderExecutionMode) {
  const verification = verifyManagedRuntime();
  return {
    id: "koubo-clip",
    version: cliVersion(),
    status: verification.status,
    distribution_kind: distributionKind(),
    provider_mode: mode,
    runtime: {
      bun: runtimeBunVersion(),
      node: process.version,
      lock_path: verification.lock_path,
      distribution_root: verification.distribution_root ? "<distribution-root>" : null,
    },
    tools: {
      ffmpeg: toolStatus("ffmpeg", verification),
      ffprobe: toolStatus("ffprobe", verification),
      hyperframes: isBoxCliDistribution()
        ? { managed: true, ok: Boolean(resolveHyperframesBinary()) && !verification.issues.some((issue) => issue.role?.startsWith("hyperframes")) }
        : { managed: false, ok: commandExists("hyperframes") || Boolean(resolveHyperframesBinary()) },
    },
    resources: {
      hyperframes: existsSync(join(resolveHyperframesRoot(), "registry")) && existsSync(join(resolveHyperframesRoot(), "resources")),
      artifact_contracts_digest: artifactContractsDigest(),
    },
    providers: providerStatus(mode),
    issues: verification.issues,
  };
}

export function assertManagedRuntimeForBox(): void {
  if (!isBoxCliDistribution()) return;
  const verification = verifyManagedRuntime();
  if (verification.status !== "healthy") {
    const first = verification.issues[0];
    throw Object.assign(new Error(first?.message ?? "managed runtime is not healthy"), {
      code: first?.code ?? "MANAGED_RUNTIME_UNHEALTHY",
      retryable: verification.status === "needs_configuration",
    });
  }
}

export function resolveManagedRuntimeTool(tool: "ffmpeg" | "ffprobe"): string {
  if (!isBoxCliDistribution()) return tool;
  assertManagedRuntimeForBox();
  return join(resolveDistributionRoot(), "runtime", "bin", tool);
}

export function verifyManagedRuntime(): {
  status: ManagedRuntimeStatus;
  distribution_root: string;
  lock_path: string | null;
  issues: RuntimeIssue[];
} {
  const distributionRoot = resolveDistributionRoot();
  if (!isBoxCliDistribution()) {
    return { status: "healthy", distribution_root: distributionRoot, lock_path: null, issues: [] };
  }

  const lockPath = join(distributionRoot, "runtime-lock.json");
  if (!existsSync(lockPath)) {
    return {
      status: "needs_configuration",
      distribution_root: distributionRoot,
      lock_path: "runtime-lock.json",
      issues: [{ code: "RUNTIME_LOCK_MISSING", message: "managed runtime lock is missing", path: "runtime-lock.json" }],
    };
  }

  let lock: RuntimeLockFile;
  try {
    lock = parseRuntimeLock(JSON.parse(readFileSync(lockPath, "utf8")));
  } catch {
    return {
      status: "degraded",
      distribution_root: distributionRoot,
      lock_path: "runtime-lock.json",
      issues: [{ code: "RUNTIME_LOCK_INVALID", message: "managed runtime lock is invalid", path: "runtime-lock.json" }],
    };
  }

  const issues: RuntimeIssue[] = [];
  for (const file of lock.files) {
    const fullPath = join(distributionRoot, ...file.path.split("/"));
    if (!existsSync(fullPath)) {
      issues.push({ code: "MANAGED_RUNTIME_FILE_MISSING", message: "managed runtime file is missing", path: file.path, role: file.role });
      continue;
    }
    const stat = statSync(fullPath);
    if (!stat.isFile()) {
      issues.push({ code: "MANAGED_RUNTIME_FILE_INVALID", message: "managed runtime path is not a file", path: file.path, role: file.role });
      continue;
    }
    if (stat.size !== file.size) {
      issues.push({ code: "MANAGED_RUNTIME_SIZE_MISMATCH", message: "managed runtime file size does not match lock", path: file.path, role: file.role });
      continue;
    }
    const statMode = stat as unknown as { mode?: unknown };
    const mode = typeof statMode.mode === "number" ? statMode.mode : 0;
    if (file.executable && (mode & 0o111) === 0) {
      issues.push({ code: "MANAGED_RUNTIME_PERMISSION_MISMATCH", message: "managed runtime executable permission does not match lock", path: file.path, role: file.role });
      continue;
    }
    const digest = createHash("sha256").update(readFileSync(fullPath)).digest("hex");
    if (digest !== file.sha256) {
      issues.push({ code: "MANAGED_RUNTIME_DIGEST_MISMATCH", message: "managed runtime file digest does not match lock", path: file.path, role: file.role });
    }
  }

  const missing = issues.some((issue) => issue.code === "MANAGED_RUNTIME_FILE_MISSING");
  return {
    status: issues.length === 0 ? "healthy" : missing ? "needs_configuration" : "degraded",
    distribution_root: distributionRoot,
    lock_path: "runtime-lock.json",
    issues,
  };
}

function parseRuntimeLock(value: unknown): RuntimeLockFile {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid runtime lock");
  const raw = value as Record<string, unknown>;
  if (raw.schema_version !== "1" || !Array.isArray(raw.files)) throw new Error("invalid runtime lock");
  return {
    schema_version: "1",
    files: raw.files.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("invalid runtime lock file");
      const row = item as Record<string, unknown>;
      const path = text(row.path);
      if (!path || path.startsWith("/") || path.includes("\\") || path.split("/").some((part) => !part || part === "." || part === "..")) {
        throw new Error("invalid runtime lock path");
      }
      const size = integer(row.size);
      const sha256 = text(row.sha256);
      if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error("invalid runtime lock digest");
      const role = text(row.role);
      const executable = row.executable === true ? true : undefined;
      return { path, size, sha256, role, ...(executable ? { executable } : {}) };
    }),
  };
}

function toolStatus(role: string, verification: ReturnType<typeof verifyManagedRuntime>) {
  if (!isBoxCliDistribution()) return { managed: false, ok: commandExists(role) };
  const locked = verification.issues.find((issue) => issue.role === role || issue.path?.endsWith(`/bin/${role}`));
  return { managed: true, ok: !locked, locked: verification.lock_path !== null };
}

function commandExists(command: string): boolean {
  return spawnSync(command, ["-version"], { stdio: "ignore" }).status === 0;
}

function runtimeBunVersion(): string | null {
  const bun = (globalThis as typeof globalThis & { Bun?: { version: string } }).Bun;
  return bun?.version ?? null;
}

function sanitizeMessage(value: string): string {
  let sanitized = value.replaceAll(process.cwd(), "<cwd>");
  if (process.env.HOME) sanitized = sanitized.replaceAll(process.env.HOME, "<home>");
  return sanitized
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer <redacted>")
    .replace(/([A-Za-z_][A-Za-z0-9_]*(?:TOKEN|KEY|SECRET|PASSWORD)[A-Za-z0-9_]*=)[^\s]+/gi, "$1<redacted>");
}

function providerStatus(mode: ProviderExecutionMode): Record<string, boolean | "host-managed" | "disabled"> {
  if (mode === "platform") {
    return {
      minimax_music: "host-managed",
      cloudflare_whisper: "host-managed",
      freesound: "host-managed",
      music_library_dir: "disabled",
      iconify: "host-managed",
      lordicon: "host-managed",
      shadcn_mcp_handoff: "host-managed",
      "21st_mcp_handoff": "host-managed",
    };
  }
  return {
    minimax_music: Boolean(process.env.MINIMAX_API_KEY),
    cloudflare_whisper: Boolean(process.env.GATEWAY_CLOUDFLARE_AI_ACCOUNT_ID && process.env.GATEWAY_CLOUDFLARE_AI_API_TOKEN && process.env.GATEWAY_CLOUDFLARE_AI_TRANSCRIPTION_MODEL),
    freesound: Boolean(process.env.FREESOUND_API_KEY),
    music_library_dir: Boolean(process.env.MUSIC_LIBRARY_DIR),
    iconify: true,
    lordicon: Boolean(process.env.LORDICON_API_KEY),
    shadcn_mcp_handoff: true,
    "21st_mcp_handoff": true,
  };
}

function text(value: unknown): string {
  if (typeof value !== "string") throw new Error("expected string");
  return value;
}

function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("expected non-negative integer");
  return value;
}
