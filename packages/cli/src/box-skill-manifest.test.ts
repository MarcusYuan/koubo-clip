import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import * as nodeFs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseSkillManifestV1,
  verifySkillManifestV1,
  verifySkillPayloadDirectory,
} from "../../../scripts/box-skill-manifest";

test("Plugin Box Skill manifest v1 accepts canonical files and bare CLI subcommands", () => {
  withFixture(({ root, manifest }) => {
    const parsed = parseSkillManifestV1(JSON.stringify(manifest));
    expect(parsed.files[0]).toEqual({ path: "SKILL.md", sha256: sha256("workflow\n"), size: 9 });
    verifySkillPayloadDirectory(root, parsed.files);
  });
});

test("Plugin Box Skill manifest v1 rejects a file entry with missing size", () => {
  withFixture(({ manifest }) => {
    delete manifest.files[0].size;
    expect(() => verifySkillManifestV1(manifest)).toThrow("keys mismatch");
  });
});

test("Plugin Box Skill manifest v1 rejects the legacy size_bytes field", () => {
  withFixture(({ manifest }) => {
    manifest.files[0].size_bytes = manifest.files[0].size;
    delete manifest.files[0].size;
    expect(() => verifySkillManifestV1(manifest)).toThrow("keys mismatch");
  });
});

test("Plugin Box Skill manifest v1 rejects a size that differs from the payload", () => {
  withFixture(({ root, manifest }) => {
    manifest.files[0].size += 1;
    expect(() => verifySkillPayloadDirectory(root, manifest.files)).toThrow("size mismatch");
  });
});

test("Plugin Box Skill manifest v1 rejects a SHA-256 that differs from the payload", () => {
  withFixture(({ root, manifest }) => {
    manifest.files[0].sha256 = "0".repeat(64);
    expect(() => verifySkillPayloadDirectory(root, manifest.files)).toThrow("SHA-256 mismatch");
  });
});

test("Plugin Box Skill manifest v1 rejects executable-prefixed or flag-bearing dependency commands", () => {
  withFixture(({ manifest }) => {
    manifest.cli_dependencies[0].commands = ["koubo-clip doctor --json"];
    expect(() => verifySkillManifestV1(manifest)).toThrow("bare subcommand");
  });
});

function fixture(): { root: string; manifest: Record<string, any> } {
  const root = nodeFs.mkdtempSync(join(tmpdir(), "koubo-skill-manifest-test-"));
  nodeFs.mkdirSync(join(root, "agents"));
  nodeFs.mkdirSync(join(root, "references"));
  nodeFs.writeFileSync(join(root, "SKILL.md"), "workflow\n");
  nodeFs.writeFileSync(join(root, "agents", "default.md"), "agent\n");
  nodeFs.writeFileSync(join(root, "references", "contract.md"), "contract\n");
  nodeFs.writeFileSync(join(root, "skill.box.json"), "{}\n");
  const files = [
    { path: "SKILL.md", sha256: sha256("workflow\n"), size: 9 },
    { path: "agents/default.md", sha256: sha256("agent\n"), size: 6 },
    { path: "references/contract.md", sha256: sha256("contract\n"), size: 9 },
  ];
  return {
    root,
    manifest: {
      manifest_version: "1",
      id: "koubo-clip",
      version: "0.0.19",
      entrypoint: "SKILL.md",
      files,
      cli_dependencies: [{ id: "koubo-clip", version: "0.0.19", required: true, commands: ["doctor", "test", "render-contract render"] }],
    },
  };
}

function withFixture(action: (value: ReturnType<typeof fixture>) => void): void {
  const value = fixture();
  try {
    action(value);
  } finally {
    nodeFs.rmSync(value.root, { recursive: true, force: true });
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
