import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "./cli";

test("prints help", async () => {
  let output = "";
  const code = await main(["--help"], { stdout: (text) => (output = text) });
  expect(code).toBe(0);
  expect(output).toContain("koubo-clip doctor");
  expect(output).toContain("skills path");
  expect(output).toContain("skills install --target codex|claude|hermes");
  expect(output).toContain("project proposal");
  expect(output).toContain("project music-catalog");
  expect(output).toContain("project visual-catalog");
  expect(output).toContain("project enrich-plan");
});

test("prints project help before requiring a project path", async () => {
  let output = "";
  let error = "";
  const code = await main(["project", "element-catalog", "--help"], { stdout: (text) => (output = text), stderr: (text) => (error = text) });
  expect(code).toBe(0);
  expect(error).toBe("");
  expect(output).toContain("koubo-clip project element-catalog <project>");
  expect(output).toContain("koubo-clip project inspect <project>");
});

test("rejects unknown commands", async () => {
  let error = "";
  const code = await main(["wat"], { stderr: (text) => (error = text) });
  expect(code).toBe(1);
  expect(error).toBe("Unknown command: wat");
});

test("doctor prints runtime json", async () => {
  let output = "";
  const code = await main(["doctor"], { stdout: (text) => (output = text) });
  expect(code).toBe(0);
  const json = JSON.parse(output);
  expect(json.runtime).toBe("bun");
  expect(typeof json.npx).toBe("boolean");
  expect(typeof json.providers.minimax_music).toBe("boolean");
  expect(json.providers.iconify).toBe(true);
  expect(typeof json.providers.lordicon).toBe("boolean");
  expect(json.bundle.hyperframes_resources).toBe(true);
  expect(json.bundle.koubo_clip_skill).toBe(true);
  expect(json.bundle.skill_path.endsWith("skills/koubo-clip")).toBe(true);
});

test("loads local env without printing secrets", async () => {
  const previousCwd = process.cwd();
  const old = process.env.MINIMAX_API_KEY;
  delete process.env.MINIMAX_API_KEY;
  const dir = mkdtempSync(join(tmpdir(), "koubo-env-"));
  writeFileSync(join(dir, ".env"), "MINIMAX_API_KEY=secret-test-value\n");
  process.chdir(dir);
  try {
    let output = "";
    const code = await main(["doctor"], { stdout: (text) => (output = text) });
    expect(code).toBe(0);
    expect(output.includes("secret-test-value")).toBe(false);
    expect(JSON.parse(output).providers.minimax_music).toBe(true);
  } finally {
    process.chdir(previousCwd);
    if (old === undefined) delete process.env.MINIMAX_API_KEY;
    else process.env.MINIMAX_API_KEY = old;
  }
});

test("loads user koubo env as fallback", async () => {
  const oldHome = process.env.HOME;
  const oldKey = process.env.LORDICON_API_KEY;
  delete process.env.LORDICON_API_KEY;
  const dir = mkdtempSync(join(tmpdir(), "koubo-home-"));
  process.env.HOME = dir;
  mkdirSync(join(dir, ".koubo-clip"), { recursive: true });
  writeFileSync(join(dir, ".koubo-clip", ".env"), "LORDICON_API_KEY=secret-lordicon-value\n");
  try {
    let output = "";
    const code = await main(["doctor"], { stdout: (text) => (output = text) });
    expect(code).toBe(0);
    expect(output.includes("secret-lordicon-value")).toBe(false);
    expect(JSON.parse(output).providers.lordicon).toBe(true);
  } finally {
    if (oldHome === undefined) delete process.env.HOME;
    else process.env.HOME = oldHome;
    if (oldKey === undefined) delete process.env.LORDICON_API_KEY;
    else process.env.LORDICON_API_KEY = oldKey;
  }
});

test("skills path reports the bundled skill", async () => {
  let output = "";
  const code = await main(["skills", "path", "--json"], { stdout: (text) => (output = text) });
  expect(code).toBe(0);
  const json = JSON.parse(output);
  expect(json.ok).toBe(true);
  expect(json.skill).toBe("koubo-clip");
  expect(json.exists).toBe(true);
  expect(readFileSync(join(json.path, "SKILL.md"), "utf8")).toContain("koubo-clip");
});

test("skills install copies the bundled skill and protects existing installs", async () => {
  const dir = mkdtempSync(join(tmpdir(), "koubo-skills-"));
  let output = "";
  const installed = await main(["skills", "install", "--target", "codex", "--dest", dir], { stdout: (text) => (output = text) });
  expect(installed).toBe(0);
  const target = JSON.parse(output).installed_path;
  expect(existsSync(join(target, "SKILL.md"))).toBe(true);
  expect(existsSync(join(target, "references", "workflow.md"))).toBe(true);

  let error = "";
  const duplicate = await main(["skills", "install", "--target", "codex", "--dest", dir], { stderr: (text) => (error = text) });
  expect(duplicate).toBe(1);
  expect(JSON.parse(error).error.code).toBe("SKILL_EXISTS");

  const forced = await main(["skills", "install", "--target", "codex", "--dest", dir, "--force"], { stdout: (text) => (output = text) });
  expect(forced).toBe(0);
  expect(existsSync(join(JSON.parse(output).installed_path, "references", "storyboard-qa.md"))).toBe(true);

  output = "";
  const claudeDir = mkdtempSync(join(tmpdir(), "koubo-claude-skills-"));
  const claude = await main(["skills", "install", "--target", "claude", "--dest", claudeDir], { stdout: (text) => (output = text) });
  expect(claude).toBe(0);
  expect(JSON.parse(output).target).toBe("claude");
  expect(existsSync(join(claudeDir, "koubo-clip", "SKILL.md"))).toBe(true);

  output = "";
  const hermesDir = mkdtempSync(join(tmpdir(), "koubo-hermes-skills-"));
  const hermes = await main(["skills", "install", "--target", "hermes", "--dest", hermesDir], { stdout: (text) => (output = text) });
  expect(hermes).toBe(0);
  expect(JSON.parse(output).target).toBe("hermes");
  expect(existsSync(join(hermesDir, "koubo-clip", "SKILL.md"))).toBe(true);
});

test("codex skills install defaults to the shared agent skills directory", async () => {
  const oldHome = process.env.HOME;
  const dir = mkdtempSync(join(tmpdir(), "koubo-codex-home-"));
  process.env.HOME = dir;
  try {
    let output = "";
    const code = await main(["skills", "install", "--target", "codex"], { stdout: (text) => (output = text) });
    expect(code).toBe(0);
    const json = JSON.parse(output);
    expect(json.installed_path).toBe(join(dir, ".agents", "skills", "koubo-clip"));
    expect(existsSync(join(dir, ".agents", "skills", "koubo-clip", "SKILL.md"))).toBe(true);
  } finally {
    if (oldHome === undefined) delete process.env.HOME;
    else process.env.HOME = oldHome;
  }
});

test("project command errors stay json", async () => {
  let error = "";
  const code = await main(["project", "explore", "demo", "--asr", "wat"], { stderr: (text) => (error = text) });
  expect(code).toBe(1);
  expect(JSON.parse(error).error.code).toBe("PROJECT_COMMAND_FAILED");
});
