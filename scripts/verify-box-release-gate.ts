import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Json = Record<string, any>;

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lock = readJson(join(root, "box-runtime.lock.json"));
const releaseMode = process.argv.includes("--release");
const ffmpegPath = join(root, "node_modules", "ffmpeg-ffprobe-static", "ffmpeg");
const ffprobePath = join(root, "node_modules", "ffmpeg-ffprobe-static", "ffprobe");

try {
  verifyLockedBinary(ffmpegPath, lock.inputs?.ffmpeg, "ffmpeg");
  verifyLockedBinary(ffprobePath, lock.inputs?.ffprobe, "ffprobe");

  const configuration = binaryConfiguration(ffmpegPath);
  const gate = lock.public_distribution_gate as Json | undefined;
  expect(gate && typeof gate === "object", "box-runtime.lock.json is missing public_distribution_gate");
  expect(["blocked", "approved"].includes(gate.status), "public_distribution_gate.status must be blocked or approved");
  expect(typeof gate.blocker_code === "string" && gate.blocker_code.length > 0, "public distribution gate is missing blocker_code");
  expect(typeof gate.policy_reference === "string" && gate.policy_reference.startsWith("https://"), "public distribution gate needs an HTTPS policy_reference");

  for (const flag of gate.observed_binary_flags ?? []) {
    expect(configuration.includes(flag), `locked ffmpeg configuration no longer contains declared flag ${flag}`);
  }

  const forbidden = (gate.forbidden_release_flags ?? []).filter((flag: unknown) => typeof flag === "string" && configuration.includes(flag));
  const requiredEvidence = Array.isArray(gate.required_evidence) ? gate.required_evidence : [];
  expect(requiredEvidence.length >= 4 && requiredEvidence.every((entry: unknown) => typeof entry === "string" && entry.length > 0), "public distribution gate must enumerate auditable evidence requirements");

  const releaseAllowed = gate.status === "approved" && forbidden.length === 0;
  const result = {
    schema_version: "1",
    ok: !releaseMode || releaseAllowed,
    status: gate.status,
    release_allowed: releaseAllowed,
    blocker_code: releaseAllowed ? null : gate.blocker_code,
    input: gate.input,
    policy_reference: gate.policy_reference,
    forbidden_flags_present: forbidden,
    ffmpeg_sha256: sha256File(ffmpegPath),
    ffprobe_sha256: sha256File(ffprobePath),
    source_revision: gitRevision(),
  };

  const outputPath = process.env.BOX_RELEASE_GATE_OUTPUT;
  if (outputPath) writeFileSync(resolve(outputPath), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result));
  if (!result.ok) process.exitCode = 1;
} catch (error) {
  const result = {
    schema_version: "1",
    ok: false,
    status: "invalid",
    release_allowed: false,
    blocker_code: "BOX_RELEASE_GATE_INVALID",
    message: error instanceof Error ? error.message : String(error),
  };
  console.log(JSON.stringify(result));
  process.exitCode = 1;
}

function verifyLockedBinary(path: string, entry: Json | undefined, label: string): void {
  expect(entry && typeof entry === "object", `runtime lock is missing ${label}`);
  expect(statSync(path).isFile(), `${label} binary is missing`);
  expect(/^[a-f0-9]{64}$/.test(entry.sha256), `${label} lock SHA-256 is invalid`);
  expect(sha256File(path) === entry.sha256, `${label} binary does not match box-runtime.lock.json`);
}

function binaryConfiguration(path: string): string {
  const result = spawnSync(path, ["-version"], { encoding: "utf8" });
  expect(result.status === 0, `failed to inspect locked ffmpeg: ${result.stderr || result.stdout}`);
  const line = result.stdout.split(/\r?\n/).find((entry) => entry.startsWith("configuration:"));
  expect(Boolean(line), "locked ffmpeg did not report its build configuration");
  return line!;
}

function gitRevision(): string {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
  expect(result.status === 0, "unable to resolve source revision");
  const revision = result.stdout.trim();
  expect(/^[a-f0-9]{40}$/.test(revision), "source revision is not an exact commit SHA");
  return revision;
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readJson(path: string): Json {
  return JSON.parse(readFileSync(path, "utf8")) as Json;
}

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
