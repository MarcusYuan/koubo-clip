import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type PackResult = { filename: string; shasum: string; integrity: string };

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(process.argv[2] ?? join(root, "dist", `koubo-clip-${packageVersion()}.tgz`));
const version = packageVersion();
const sourceRevision = process.env.KOUBO_CLIP_SOURCE_REVISION ?? gitRevision();
const staging = mkdtempSync(join(tmpdir(), "koubo-npm-package-"));

try {
  const npmCache = join(staging, "npm-cache");
  const bootstrapDir = join(staging, "bootstrap");
  const unpackedDir = join(staging, "unpacked");
  const finalDir = join(staging, "final");
  mkdirSync(bootstrapDir, { recursive: true });
  mkdirSync(unpackedDir, { recursive: true });
  mkdirSync(finalDir, { recursive: true });

  // First materialize npm's real packlist. The bootstrap manifest is deliberately
  // ignored: it was computed against the source workspace, not these final bytes.
  const bootstrap = npmPack(root, bootstrapDir, npmCache);
  run("tar", ["-xzf", resolve(bootstrapDir, bootstrap.filename), "-C", unpackedDir], root);
  const packageRoot = join(unpackedDir, "package");

  run("bun", [join(root, "scripts", "generate-delivery-manifest.ts"), packageRoot, "npm"], root, {
    KOUBO_CLIP_SOURCE_REVISION: sourceRevision,
    KOUBO_CLIP_VERSION: version,
  });

  const finalPack = npmPack(packageRoot, finalDir, npmCache);
  mkdirSync(dirname(outputPath), { recursive: true });
  copyFileSync(resolve(finalDir, finalPack.filename), outputPath);
  const sha256 = `sha256:${createHash("sha256").update(readFileSync(outputPath)).digest("hex")}`;
  const metadataPath = `${outputPath}.json`;
  writeFileSync(
    metadataPath,
    `${JSON.stringify({
      schema_version: "1.0",
      package: `koubo-clip@${version}`,
      source_revision: sourceRevision,
      filename: basename(outputPath),
      sha256,
      npm_shasum: finalPack.shasum,
      npm_integrity: finalPack.integrity,
    }, null, 2)}\n`,
  );
  console.log(JSON.stringify({ ok: true, tarball: outputPath, metadata: metadataPath, sha256 }));
} finally {
  rmSync(staging, { recursive: true, force: true });
}

function npmPack(cwd: string, destination: string, cache: string): PackResult {
  const output = run("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", destination], cwd, {
    npm_config_cache: cache,
  });
  const parsed = JSON.parse(output) as PackResult[];
  const result = parsed[0];
  if (!result?.filename || !result.shasum || !result.integrity) throw new Error("npm pack did not return complete artifact identity");
  return result;
}

function run(command: string, args: string[], cwd: string, env: Record<string, string> = {}): string {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.stdout}`.trim());
  return result.stdout;
}

function packageVersion(): string {
  return (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string }).version;
}

function gitRevision(): string {
  return run("git", ["rev-parse", "HEAD"], root).trim();
}
