import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";

const read = (name) => readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), "utf8");

test("automatic tag publication cannot write npm and retains both validation jobs", () => {
  const source = read("release.yml");
  const workflow = Bun.YAML.parse(source);
  expect(workflow.on.push.tags).toEqual(["v*.*.*"]);
  expect(workflow.jobs.release.needs).toEqual(["validate", "box-macos-aarch64"]);
  expect(source).not.toMatch(/npm publish|NODE_AUTH_TOKEN|NPM_TOKEN|id-token:/);
  expect(source).toContain("Verify installed canonical npm package");
  expect(source).toContain("Verify Box packages from arbitrary cwd");
  expect(source).toContain("actual_sha256");
  expect(source).toContain("Release asset ${name} changed after initial verification");
});

test("npm publication requires manual dispatch and consumes checked release bytes", () => {
  const source = read("publish-npm.yml");
  const workflow = Bun.YAML.parse(source);
  expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]);
  expect(workflow.on.workflow_dispatch.inputs.tag.required).toBe(true);
  expect(source).toContain("scripts/verify-release-npm-artifact.py");
  expect(source).toContain("gh release download");
  expect(source).toContain("verify:package:npm");
  expect(source).not.toContain("run package:npm");
  expect(source).toContain("registry tarball digest mismatch");
});
