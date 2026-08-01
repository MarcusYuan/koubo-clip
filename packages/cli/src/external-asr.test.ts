import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { expect, test } from "bun:test";
import { createProject } from "./project";
import { importExternalAsrProject, prepareExternalAsrProject } from "./external-asr";

test("prepare external ASR creates upload audio and manifest without overwriting", () => {
  if (!commandExists("ffmpeg")) return;
  const dir = mkdtempSync(join(tmpdir(), "koubo-external-asr-prepare-"));
  const source = join(dir, "raw.mp4");
  const project = join(dir, "project");
  makeSampleVideo(source, 1.2);
  const created = createProject([source], { projectPath: project });
  expect(created.ok).toBe(true);

  const prepared = prepareExternalAsrProject(project, { outputDir: "asr-upload/src-001" });
  expect(prepared.ok).toBe(true);
  if (!prepared.ok) throw new Error(prepared.error.message);
  expect(prepared.data.source_id).toBe("src-001");
  expect(prepared.data.size_bytes > 0).toBe(true);
  expect(prepared.data.sha256).toBe(sha256(readFileSync(prepared.data.audio_path)));
  expect(statSync(prepared.data.audio_path).size).toBe(prepared.data.size_bytes);
  const manifest = JSON.parse(readFileSync(prepared.data.manifest_path, "utf8"));
  expect(manifest.contract_version).toBe("1");
  expect(manifest.source_id).toBe("src-001");
  expect(manifest.audio.path).toBe("src-001.m4a");
  expect(manifest.audio.sha256).toBe(prepared.data.sha256);
  expect(manifest.audio.sample_rate_hz).toBe(16000);
  expect(manifest.audio.channels).toBe(1);

  const second = prepareExternalAsrProject(project, { outputDir: "asr-upload/src-001" });
  expect(second.ok).toBe(false);
  if (second.ok) throw new Error("expected overwrite failure");
  expect(second.error.code).toBe("ASR_OUTPUT_EXISTS");
});

test("prepare external ASR reports upload limit before publishing output", () => {
  if (!commandExists("ffmpeg")) return;
  const dir = mkdtempSync(join(tmpdir(), "koubo-external-asr-limit-"));
  const source = join(dir, "raw.mp4");
  const project = join(dir, "project");
  makeSampleVideo(source, 1);
  const created = createProject([source], { projectPath: project });
  expect(created.ok).toBe(true);

  const result = prepareExternalAsrProject(project, { outputDir: "asr-upload/too-large", maxBytes: 1 });
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected limit failure");
  expect(result.error.code).toBe("ASR_UPLOAD_LIMIT_EXCEEDED");
  expect(existsSync(join(project, "asr-upload", "too-large"))).toBe(false);
});

test("import external ASR writes normalized full-project transcript", () => {
  const dir = mkdtempSync(join(tmpdir(), "koubo-external-asr-import-"));
  const project = makeManifestProject(dir, [
    source("src-001", 0, 2, "1"),
    source("src-002", 1, 3, "2"),
  ]);
  writeJson(join(project, "external-asr.json"), {
    contract_version: "1",
    provider: "example-asr",
    language: "en",
    results: [
      { source_id: "src-002", timing_granularity: "segment", segments: [{ start: 1, end: 1.5, text: "second" }] },
      {
        source_id: "src-001",
        timing_granularity: "segment",
        segments: [
          { start: 1, end: 1.2, text: "later" },
          { start: 0, end: 0.4, text: "first" },
        ],
      },
    ],
  });

  const imported = importExternalAsrProject(project, { inputPath: "external-asr.json" });
  expect(imported.ok).toBe(true);
  if (!imported.ok) throw new Error(imported.error.message);
  expect(imported.data.source_ids).toEqual(["src-001", "src-002"]);
  expect(imported.data.timing_granularity).toBe("segment");
  expect(imported.data.segment_count).toBe(3);
  const transcript = JSON.parse(readFileSync(join(project, "transcript.json"), "utf8"));
  expect(transcript).toEqual({
    timing_granularity: "segment",
    provider: "example-asr",
    language: "en",
    segments: [
      { source_id: "src-001", start: 0, end: 0.4, text: "first" },
      { source_id: "src-001", start: 1, end: 1.2, text: "later" },
      { source_id: "src-002", start: 1, end: 1.5, text: "second" },
    ],
  });
});

test("import external ASR rejects missing and unknown project sources", () => {
  const dir = mkdtempSync(join(tmpdir(), "koubo-external-asr-sources-"));
  const project = makeManifestProject(dir, [
    source("src-001", 0, 2, "1"),
    source("src-002", 1, 3, "2"),
  ]);
  writeJson(join(project, "missing.json"), {
    contract_version: "1",
    results: [{ source_id: "src-001", timing_granularity: "segment", segments: [{ start: 0, end: 1, text: "only first" }] }],
  });
  const missing = importExternalAsrProject(project, { inputPath: "missing.json" });
  expect(missing.ok).toBe(false);
  if (missing.ok) throw new Error("expected missing source failure");
  expect(missing.error.code).toBe("ASR_SOURCE_RESULT_MISSING");
  expect(missing.error.request?.source_ids).toEqual(["src-002"]);

  writeJson(join(project, "unknown.json"), {
    contract_version: "1",
    results: [
      { source_id: "src-001", timing_granularity: "segment", segments: [{ start: 0, end: 1, text: "first" }] },
      { source_id: "src-404", timing_granularity: "segment", segments: [{ start: 0, end: 1, text: "unknown" }] },
    ],
  });
  const unknown = importExternalAsrProject(project, { inputPath: "unknown.json" });
  expect(unknown.ok).toBe(false);
  if (unknown.ok) throw new Error("expected unknown source failure");
  expect(unknown.error.code).toBe("ASR_SOURCE_ID_MISMATCH");
  expect(unknown.error.request?.source_ids).toEqual(["src-404"]);
});

test("import external ASR rejects text-only, mixed granularity, unknown fields, bounds, and overlap", () => {
  const dir = mkdtempSync(join(tmpdir(), "koubo-external-asr-invalid-"));
  const project = makeManifestProject(dir, [source("src-001", 0, 2, "1")]);
  const cases: Array<[string, unknown, string]> = [
    ["text-only", { contract_version: "1", results: [{ source_id: "src-001", timing_granularity: "text-only", text: "hello" }] }, "ASR_TIMING_REQUIRED"],
    [
      "unknown-field",
      { contract_version: "1", results: [{ source_id: "src-001", timing_granularity: "segment", segments: [{ start: 0, end: 1, text: "x", confidence: 0.9 }] }] },
      "ASR_INPUT_INVALID",
    ],
    [
      "bounds",
      { contract_version: "1", results: [{ source_id: "src-001", timing_granularity: "segment", segments: [{ start: 1.9, end: 2.1, text: "late" }] }] },
      "ASR_TIMING_INVALID",
    ],
    [
      "overlap",
      {
        contract_version: "1",
        results: [{
          source_id: "src-001",
          timing_granularity: "segment",
          segments: [{ start: 0, end: 1, text: "a" }, { start: 0.5, end: 1.5, text: "b" }],
        }],
      },
      "ASR_TIMING_INVALID",
    ],
  ];
  for (const [name, value, code] of cases) {
    writeJson(join(project, `${name}.json`), value);
    const result = importExternalAsrProject(project, { inputPath: `${name}.json` });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error(`expected ${name} failure`);
    expect(result.error.code).toBe(code);
  }

  writeJson(join(project, "transcript.json"), {
    timing_granularity: "segment",
    segments: [{ source_id: "src-001", start: 0, end: 0.5, text: "old" }],
  });
  writeJson(join(project, "bad-overlap.json"), {
    contract_version: "1",
    results: [{
      source_id: "src-001",
      timing_granularity: "segment",
      segments: [{ start: 0, end: 1, text: "new" }, { start: 0.9, end: 1.2, text: "bad" }],
    }],
  });
  const atomic = importExternalAsrProject(project, { inputPath: "bad-overlap.json" });
  expect(atomic.ok).toBe(false);
  const transcript = JSON.parse(readFileSync(join(project, "transcript.json"), "utf8"));
  expect(transcript.segments).toEqual([{ source_id: "src-001", start: 0, end: 0.5, text: "old" }]);
});

test("import external ASR rejects mixed timing granularity across sources", () => {
  const dir = mkdtempSync(join(tmpdir(), "koubo-external-asr-mixed-"));
  const project = makeManifestProject(dir, [
    source("src-001", 0, 2, "1"),
    source("src-002", 1, 2, "2"),
  ]);
  writeJson(join(project, "mixed.json"), {
    contract_version: "1",
    results: [
      { source_id: "src-001", timing_granularity: "segment", segments: [{ start: 0, end: 1, text: "first" }] },
      { source_id: "src-002", timing_granularity: "word", words: [{ start: 0, end: 0.3, text: "second" }] },
    ],
  });
  const result = importExternalAsrProject(project, { inputPath: "mixed.json" });
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected mixed granularity failure");
  expect(result.error.code).toBe("ASR_TIMING_INVALID");
});

test("import external ASR accepts word granularity", () => {
  const dir = mkdtempSync(join(tmpdir(), "koubo-external-asr-word-"));
  const project = makeManifestProject(dir, [source("src-001", 0, 2, "1")]);
  writeJson(join(project, "words.json"), {
    contract_version: "1",
    results: [{ source_id: "src-001", timing_granularity: "word", words: [{ start: 0, end: 0.2, text: "hello" }] }],
  });
  const result = importExternalAsrProject(project, { inputPath: "words.json" });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  const transcript = JSON.parse(readFileSync(join(project, "transcript.json"), "utf8"));
  expect(transcript.timing_granularity).toBe("word");
  expect(transcript.segments).toEqual([{ source_id: "src-001", start: 0, end: 0.2, text: "hello" }]);
});

test("external ASR CLI prepare/import exposes JSON output and stable failure codes", () => {
  if (!commandExists("ffmpeg")) return;
  const dir = mkdtempSync(join(tmpdir(), "koubo-external-asr-cli-"));
  try {
    const sourcePath = join(dir, "raw.mp4");
    const project = join(dir, "project");
    makeSampleVideo(sourcePath, 1);
    const created = createProject([sourcePath], { projectPath: project });
    expect(created.ok).toBe(true);

    const prepared = runCli(["project", "asr-prepare", project, "--output", "asr-upload", "--json"]);
    expect(prepared.status).toBe(0);
    const prepareJson = JSON.parse(prepared.stdout);
    expect(prepareJson.ok).toBe(true);
    expect(prepareJson.command).toBe("external-asr.prepare");
    expect(prepareJson.data.source_id).toBe("src-001");
    expect(existsSync(join(project, "asr-upload", "src-001.m4a"))).toBe(true);

    writeJson(join(project, "provider-result.json"), {
      contract_version: "1",
      provider: "black-box-provider",
      results: [{ source_id: "src-001", timing_granularity: "segment", segments: [{ start: 0, end: 0.8, text: "hello" }] }],
    });
    const imported = runCli(["project", "asr-import", project, "--input", "provider-result.json", "--json"]);
    expect(imported.status).toBe(0);
    expect(JSON.parse(imported.stdout).data.timing_granularity).toBe("segment");

    writeJson(join(project, "text-only.json"), {
      contract_version: "1",
      results: [{ source_id: "src-001", timing_granularity: "text-only", text: "hello" }],
    });
    const rejected = runCli(["project", "asr-import", project, "--input", "text-only.json", "--json"]);
    expect(rejected.status).toBe(1);
    expect(JSON.parse(rejected.stderr).error.code).toBe("ASR_TIMING_REQUIRED");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60_000);

function makeManifestProject(root: string, sources: unknown[]): string {
  const project = join(root, "project");
  mkdirSync(project, { recursive: true });
  writeJson(join(project, "sources.json"), { contract_version: "2.0", sources });
  return project;
}

function runCli(args: string[]) {
  return spawnSync(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), "cli.ts"), ...args], { encoding: "utf8" });
}

function source(source_id: string, order: number, duration_seconds: number, hashChar: string) {
  return {
    source_id,
    order,
    original_filename: `${source_id}.mp4`,
    local_media_ref: `local:${source_id}`,
    identity: {
      sha256: `sha256:${hashChar.repeat(64)}`,
      size_bytes: 100 + order,
      duration_seconds,
      video: {
        codec_name: "h264",
        width: 160,
        height: 90,
        display_width: 160,
        display_height: 90,
        rotation: 0,
        avg_frame_rate: "10/1",
        pixel_format: "yuv420p",
      },
      audio: { codec_name: "aac", sample_rate: 48000, channels: 2, channel_layout: "stereo" },
    },
  };
}

function makeSampleVideo(path: string, duration: number): void {
  const result = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=160x90:rate=10",
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=440:duration=${duration}`,
      "-t",
      String(duration),
      "-pix_fmt",
      "yuv420p",
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      "-preset",
      "ultrafast",
      path,
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
}

function commandExists(command: string): boolean {
  return spawnSync(command, ["-version"], { encoding: "utf8" }).status === 0;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
