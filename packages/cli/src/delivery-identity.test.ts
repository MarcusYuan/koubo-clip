import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DeliveryIdentityError,
  computeCliPayloadDigest,
  computeDeliveryDigest,
  computeDeliveryFileSetDigest,
  computeOfficialSkillDigest,
  computeRendererResourcesDigest,
  computeRuntimeCompatibilityDigest,
  parseDeliveryManifest,
  verifyDeliveryManifest,
  type DeliveryDigest,
  type DeliveryIdentityErrorCode,
  type DeliveryManifestV1,
  type DeliveryManifestV2,
} from "./delivery-identity";

test("delivery digest is sorted by POSIX path and ignores filesystem mtime", () => {
  const root = fixtureRoot("stable");
  mkdirSync(join(root, "nested"));
  writeFileSync(join(root, "z.txt"), "last");
  writeFileSync(join(root, "nested", "a.txt"), "first");

  const first = computeDeliveryFileSetDigest({ root });
  writeFileSync(join(root, "z.txt"), "last");
  writeFileSync(join(root, "nested", "a.txt"), "first");
  const second = computeDeliveryFileSetDigest({ root, files: ["z.txt", "nested/a.txt"] });

  expect(first.paths).toEqual(["nested/a.txt", "z.txt"]);
  expect(second.paths).toEqual(first.paths);
  expect(second.digest).toBe(first.digest);
  expect(second.byte_length).toBe(first.byte_length);
});

test("delivery digest changes when bytes or logical POSIX path changes", () => {
  const original = fixtureRoot("original");
  const changedBytes = fixtureRoot("changed-bytes");
  const changedPath = fixtureRoot("changed-path");
  writeFileSync(join(original, "asset.bin"), "same");
  writeFileSync(join(changedBytes, "asset.bin"), "different");
  writeFileSync(join(changedPath, "renamed.bin"), "same");

  const base = computeDeliveryFileSetDigest({ root: original }).digest;
  expect(computeDeliveryFileSetDigest({ root: changedBytes }).digest === base).toBe(false);
  expect(computeDeliveryFileSetDigest({ root: changedPath }).digest === base).toBe(false);
});

test("delivery digest uses path NUL byte-length NUL bytes framing", () => {
  const root = fixtureRoot("framing");
  writeFileSync(join(root, "a.txt"), "x");

  expect(computeDeliveryFileSetDigest({ root }).digest).toBe(
    "sha256:40a8cf652ed99e16065e0d1da017bddb302f7035aecfb44be7da75a1cd40feae",
  );
});

test("CLI payload excludes delivery-manifest.json but hashes other files", () => {
  const root = fixtureRoot("manifest-exclusion");
  writeFileSync(join(root, "cli.js"), "cli");
  writeFileSync(join(root, "delivery-manifest.json"), "first manifest");
  const first = computeCliPayloadDigest({ root });

  writeFileSync(join(root, "delivery-manifest.json"), "tampered manifest bytes");
  const second = computeCliPayloadDigest({ root });
  writeFileSync(join(root, "cli.js"), "changed cli");
  const changedPayload = computeCliPayloadDigest({ root });

  expect(first.paths).toEqual(["cli.js"]);
  expect(second.digest).toBe(first.digest);
  expect(changedPayload.digest === first.digest).toBe(false);
});

test("delivery hashing rejects symlinks and paths that are not safe POSIX relatives", () => {
  const root = fixtureRoot("symlink");
  const outside = fixtureRoot("outside");
  writeFileSync(join(outside, "secret.txt"), "secret");
  symlinkSync(join(outside, "secret.txt"), join(root, "linked.txt"));

  expectDeliveryError(() => computeDeliveryFileSetDigest({ root }), "DELIVERY_SYMLINK_REJECTED");
  expectDeliveryError(() => computeDeliveryFileSetDigest({ root, files: ["../outside/secret.txt"] }), "DELIVERY_PATH_INVALID");
  expectDeliveryError(() => computeDeliveryFileSetDigest({ root: "relative/root" }), "DELIVERY_PATH_INVALID");
});

test("strict delivery manifest parser rejects unknown fields and malformed digests", () => {
  const manifest = manifestFixture();
  expect(parseDeliveryManifest(manifest)).toEqual(manifest);
  expectDeliveryError(() => parseDeliveryManifest({ ...manifest, unexpected: true }), "DELIVERY_MANIFEST_INVALID");
  expectDeliveryError(
    () => parseDeliveryManifest({ ...manifest, cli_payload_digest: "sha256:not-a-digest" }),
    "DELIVERY_MANIFEST_INVALID",
  );
});

test("delivery manifest v2 binds every released component to one aggregate digest", () => {
  const manifest = manifestV2Fixture();
  expect(parseDeliveryManifest(manifest)).toEqual(manifest);
  expect(computeDeliveryDigest(manifest)).toBe(manifest.delivery_digest);
  expectDeliveryError(
    () =>
      verifyDeliveryManifest(
        { ...manifest, official_skill_digest: digest("9") },
        {
          cli_payload_digest: manifest.cli_payload_digest,
          renderer_resources_digest: manifest.renderer_resources_digest,
          official_skill_digest: digest("9"),
        },
      ),
    "DELIVERY_DIGEST_MISMATCH",
  );
});

test("manifest verification detects delivered byte and runtime contract tampering", () => {
  const cliRoot = fixtureRoot("verify-cli");
  const resourcesRoot = fixtureRoot("verify-resources");
  const skillRoot = fixtureRoot("verify-skill");
  writeFileSync(join(cliRoot, "cli.js"), "cli");
  writeFileSync(join(resourcesRoot, "renderer.json"), "renderer");
  writeFileSync(join(skillRoot, "SKILL.md"), "skill");
  const cli = computeCliPayloadDigest({ root: cliRoot });
  const resources = computeRendererResourcesDigest({ root: resourcesRoot });
  const skill = computeOfficialSkillDigest({ root: skillRoot });
  const manifest = manifestFixture({
    cli_payload_digest: cli.digest,
    renderer_resources_digest: resources.digest,
    official_skill_digest: skill.digest,
  });

  expect(
    verifyDeliveryManifest(manifest, {
      cli_payload_digest: cli.digest,
      renderer_resources_digest: resources.digest,
      official_skill_digest: skill.digest,
    }),
  ).toEqual(manifest);

  writeFileSync(join(cliRoot, "cli.js"), "tampered cli");
  expectDeliveryError(
    () =>
      verifyDeliveryManifest(manifest, {
        cli_payload_digest: computeCliPayloadDigest({ root: cliRoot }).digest,
        renderer_resources_digest: resources.digest,
        official_skill_digest: skill.digest,
      }),
    "DELIVERY_DIGEST_MISMATCH",
  );

  expectDeliveryError(
    () =>
      verifyDeliveryManifest(
        { ...manifest, capability_ids: [...manifest.capability_ids, "tampered-capability"] },
        {
          cli_payload_digest: manifest.cli_payload_digest,
          renderer_resources_digest: resources.digest,
          official_skill_digest: skill.digest,
        },
      ),
    "DELIVERY_DIGEST_MISMATCH",
  );
});

function manifestFixture(overrides: Partial<DeliveryManifestV1> = {}): DeliveryManifestV1 {
  const base = {
    schema_version: "1.0" as const,
    cli_version: "0.0.1",
    source_revision: "abc123",
    distribution_kind: "npm",
    cli_payload_digest: digest("1"),
    renderer_resources_digest: digest("2"),
    official_skill_digest: digest("3"),
    schema_versions: { "artifact-manifest.json": "1.0", "delivery-manifest.json": "1.0" },
    capability_ids: ["project.render", "project.status"],
    runtime_dependencies: ["bun_stdlib", "ffmpeg"],
  };
  return {
    ...base,
    runtime_compatibility_digest: computeRuntimeCompatibilityDigest(base),
    ...overrides,
    ...(overrides.runtime_compatibility_digest
      ? {}
      : {
          runtime_compatibility_digest: computeRuntimeCompatibilityDigest({
            renderer_resources_digest: overrides.renderer_resources_digest ?? base.renderer_resources_digest,
            schema_versions: overrides.schema_versions ?? base.schema_versions,
            capability_ids: overrides.capability_ids ?? base.capability_ids,
            runtime_dependencies: overrides.runtime_dependencies ?? base.runtime_dependencies,
          }),
        }),
  };
}

function manifestV2Fixture(): DeliveryManifestV2 {
  const v1 = manifestFixture();
  const base = { ...v1, schema_version: "2.0" as const };
  return { ...base, delivery_digest: computeDeliveryDigest(base) };
}

function fixtureRoot(label: string): string {
  return mkdtempSync(join(tmpdir(), `koubo-delivery-${label}-`));
}

function digest(character: string): DeliveryDigest {
  return `sha256:${character.repeat(64)}`;
}

function expectDeliveryError(action: () => unknown, code: DeliveryIdentityErrorCode): void {
  try {
    action();
    throw new Error(`expected ${code}`);
  } catch (error) {
    expect(error instanceof DeliveryIdentityError).toBe(true);
    expect((error as DeliveryIdentityError).code).toBe(code);
  }
}
