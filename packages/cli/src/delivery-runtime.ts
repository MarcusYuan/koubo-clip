import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { cliVersion, resolveDistributionRoot, resolveHyperframesRoot, resolveKouboClipSkillRoot } from "./bundle-paths";
import {
  computeCliPayloadDigest,
  computeOfficialSkillDigest,
  computeRendererResourcesDigest,
  parseDeliveryManifest,
  verifyDeliveryManifest,
  type DeliveryManifestV1,
} from "./delivery-identity";

export function installedDeliveryManifestPath(): string {
  return join(resolveDistributionRoot(), "delivery-manifest.json");
}

export function readInstalledDeliveryManifest(): DeliveryManifestV1 {
  const path = installedDeliveryManifestPath();
  if (!existsSync(path)) throw Object.assign(new Error("delivery-manifest.json is missing from the installed Koubo Clip distribution"), { code: "DELIVERY_MANIFEST_INVALID" });
  return parseDeliveryManifest(JSON.parse(readFileSync(path, "utf8")));
}

export function computeInstalledDeliveryDigests(skillRoot = resolveKouboClipSkillRoot()) {
  const distributionRoot = resolveDistributionRoot();
  return {
    cli_payload_digest: computeCliPayloadDigest({ root: distributionRoot, files: cliPayloadFiles(distributionRoot) }).digest,
    renderer_resources_digest: computeRendererResourcesDigest({ root: resolveHyperframesRoot() }).digest,
    official_skill_digest: computeOfficialSkillDigest({ root: skillRoot }).digest,
  };
}

export function verifyInstalledDelivery(): DeliveryManifestV1 {
  const manifest = readInstalledDeliveryManifest();
  return verifyDeliveryManifest(manifest, computeInstalledDeliveryDigests(), { cli_version: cliVersion() });
}

export function verifyInstalledSkill(path: string): { manifest: DeliveryManifestV1; path: string; digest: string } {
  const manifest = readInstalledDeliveryManifest();
  const digest = computeOfficialSkillDigest({ root: path }).digest;
  if (digest !== manifest.official_skill_digest) throw Object.assign(new Error("installed Skill digest does not match this Koubo Clip delivery"), { code: "DELIVERY_DIGEST_MISMATCH" });
  return { manifest, path, digest };
}

export function cliPayloadFiles(root: string): string[] {
  const candidates = ["package.json", "bin/koubo-clip", ...walkFiles(join(root, "packages", "cli", "src")).map((path) => relative(root, path).replaceAll("\\", "/"))];
  return candidates.filter((path) => existsSync(join(root, path)) && !path.endsWith(".test.ts") && !path.includes("/__snapshots__/"));
}

function walkFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const output: string[] = [];
  for (const name of readdirSync(root).sort()) {
    const path = join(root, name);
    const stat = statSync(path);
    if (stat.isDirectory()) output.push(...walkFiles(path));
    else if (stat.isFile()) output.push(path);
  }
  return output;
}
