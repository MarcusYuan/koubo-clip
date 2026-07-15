import { Buffer } from "node:buffer";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { parseAssetManifest, projectArtifacts } from "../artifacts";
import { acquireVisualAssets, buildVisualCatalog, buildVisualReview, renderVisualCandidatesMarkdown, renderVisualReviewMarkdown, sanitizeSvg, searchVisualAssets } from "./acquire";

test("visual catalog exposes internet-first sources and allowlisted runtimes", () => {
  const catalog = buildVisualCatalog();
  expect(catalog.providers.some((provider) => provider.id === "iconify" && provider.available)).toBe(true);
  expect(catalog.providers.some((provider) => provider.id === "lordicon")).toBe(true);
  expect(catalog.providers.find((provider) => provider.id === "shadcn")?.status).toBe("handoff");
  expect(catalog.providers.find((provider) => provider.id === "21st")?.status).toBe("handoff");
  expect(catalog.runtime_allowlist.some((dependency) => dependency.package_name === "bodymovin" && dependency.version === "5.12.2")).toBe(true);
  expect(catalog.runtime_allowlist.some((dependency) => dependency.package_name === "@lottiefiles/dotlottie-web" && dependency.version === "0.76.0")).toBe(true);
});

test("svg sanitizer rejects script, foreignObject, event handlers, and remote refs", () => {
  expect(sanitizeSvg("<svg><path /></svg>")).toContain("<svg");
  expect(() => sanitizeSvg("<svg><script>alert(1)</script></svg>")).toThrow("script");
  expect(() => sanitizeSvg("<svg><foreignObject /></svg>")).toThrow("foreignObject");
  expect(() => sanitizeSvg('<svg><path onclick="x()" /></svg>')).toThrow("event handlers");
  expect(() => sanitizeSvg('<svg><use href="https://example.com/a.svg#x" /></svg>')).toThrow("external href");
  expect(() => sanitizeSvg("<svg><path style=\"fill:url(https://example.com/x)\" /></svg>")).toThrow("external url");
});

test("Iconify search and acquire freezes an SVG into project assets and manifest", async () => {
  const dir = mkdtempSync(join(tmpdir(), "koubo-visual-"));
  writeFileSync(
    join(dir, projectArtifacts.visualRequest),
    JSON.stringify({
      version: "1.0",
      source_mode: "screen_recording",
      presentation_intent: "short_form",
      requests: [
        {
          id: "alarm",
          viewer_job: "make an alarm cue visible",
          semantic_query: "alarm clock",
          asset_type: "icon",
          preferred_sources: ["iconify"],
          reason: "spoken alarm cue needs a visual icon",
          selected_candidate_id: "alarm-iconify-mdi-alarm",
        },
      ],
    }),
  );

  const previousFetch = fetch;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 6v6l4 2"/></svg>';
  const svgBytes = Buffer.from(svg);
  const arrayBuffer = svgBytes.buffer.slice(svgBytes.byteOffset, svgBytes.byteOffset + svgBytes.byteLength);
  (globalThis as unknown as { fetch: unknown }).fetch = async (input: string) => {
    const url = String(input);
    if (url.includes("/search?")) {
      return { ok: true, status: 200, text: async () => "", json: async () => ({ icons: ["mdi:alarm"] }), arrayBuffer: async () => new ArrayBuffer(0) };
    }
    if (url.includes("/collection?")) {
      return {
        ok: true,
        status: 200,
        text: async () => "",
        json: async () => ({ info: { license: { spdx: "Apache-2.0", url: "https://example.com/license" }, author: { name: "Pictogrammers" } } }),
        arrayBuffer: async () => new ArrayBuffer(0),
      };
    }
    return { ok: true, status: 200, text: async () => svg, json: async () => ({}), arrayBuffer: async () => arrayBuffer };
  };

  try {
    const candidates = await searchVisualAssets(dir);
    expect(candidates.candidates[0]?.id).toBe("alarm-iconify-mdi-alarm");
    writeFileSync(join(dir, projectArtifacts.visualCandidates), `${JSON.stringify(candidates, null, 2)}\n`);
    const acquisition = await acquireVisualAssets(dir);
    expect(acquisition.assets[0]?.asset_id).toBe("visual-alarm");
    expect(existsSync(join(dir, "assets", "icons", "visual-alarm.svg"))).toBe(true);
    expect(readFileSync(join(dir, "assets", "icons", "visual-alarm.svg"), "utf8")).toContain("<svg");
    const manifest = parseAssetManifest(JSON.parse(readFileSync(join(dir, projectArtifacts.assetManifest), "utf8")));
    expect(manifest.assets[0]?.provider).toBe("iconify");
    expect(manifest.assets[0]?.source_url).toContain("icon-sets.iconify.design");
    const review = buildVisualReview(acquisition);
    expect(review.items[0]?.license).toBe("Apache-2.0");
  } finally {
    (globalThis as unknown as { fetch: unknown }).fetch = previousFetch;
  }
});

test("Lordicon search expands queries and freezes Lottie JSON without leaking keys", async () => {
  const dir = mkdtempSync(join(tmpdir(), "koubo-lordicon-"));
  writeFileSync(
    join(dir, projectArtifacts.visualRequest),
    JSON.stringify({
      version: "1.0",
      source_mode: "talking_head_avatar",
      presentation_intent: "short_form",
      requests: [
        {
          id: "alarm",
          viewer_job: "show a reminder cue",
          semantic_query: "alarm clock",
          asset_type: "animated_icon",
          preferred_sources: [],
          reason: "spoken reminder needs animated icon",
          selected_candidate_id: "alarm-lordicon-clock",
        },
      ],
    }),
  );

  const previousFetch = fetch;
  const oldKey = process.env.LORDICON_API_KEY;
  process.env.LORDICON_API_KEY = "lordicon-secret-test";
  const lottie = JSON.stringify({ v: "5.12.2", layers: [] });
  const lottieBytes = Buffer.from(lottie);
  const arrayBuffer = lottieBytes.buffer.slice(lottieBytes.byteOffset, lottieBytes.byteOffset + lottieBytes.byteLength);
  const requestedUrls: string[] = [];
  const requestedAuth: string[] = [];
  (globalThis as unknown as { fetch: unknown }).fetch = async (input: string, init?: { headers?: Record<string, string> }) => {
    const url = String(input);
    requestedUrls.push(url);
    if (init?.headers?.Authorization) requestedAuth.push(init.headers.Authorization);
    if (url.includes("/v1/icons?")) {
      if (url.includes("alarm%20clock")) {
        return { ok: true, status: 200, text: async () => "", json: async () => [], arrayBuffer: async () => new ArrayBuffer(0) };
      }
      return {
        ok: true,
        status: 200,
        text: async () => "",
        json: async () => [
          {
            family: "system",
            style: "regular",
            index: 1,
            name: "clock",
            title: "Clock",
            premium: false,
            files: { json: "https://cdn.lordicon.com/clock.json", svg: "https://cdn.lordicon.com/clock.svg" },
          },
        ],
        arrayBuffer: async () => new ArrayBuffer(0),
      };
    }
    return { ok: true, status: 200, text: async () => lottie, json: async () => ({}), arrayBuffer: async () => arrayBuffer };
  };

  try {
    const candidates = await searchVisualAssets(dir);
    expect(candidates.warnings.join("\n").includes("lordicon-secret-test")).toBe(false);
    expect(candidates.warnings).toEqual([]);
    expect(candidates.candidates[0]?.id).toBe("alarm-lordicon-clock");
    expect(candidates.candidates[0]?.runtime_dependencies).toContain("lottie_web_5_12_2");
    expect(requestedUrls.some((url) => url.includes("clock"))).toBe(true);
    expect(requestedAuth.every((value) => value === "Bearer lordicon-secret-test")).toBe(true);
    writeFileSync(join(dir, projectArtifacts.visualCandidates), `${JSON.stringify(candidates, null, 2)}\n`);
    const acquisition = await acquireVisualAssets(dir);
    expect(acquisition.assets[0]?.provider).toBe("lordicon");
    expect(existsSync(join(dir, "assets", "lottie", "visual-alarm.json"))).toBe(true);
    const manifest = parseAssetManifest(JSON.parse(readFileSync(join(dir, projectArtifacts.assetManifest), "utf8")));
    expect(manifest.assets[0]?.provider).toBe("lordicon");
    expect(manifest.assets[0]?.runtime_dependencies).toContain("lottie_web_5_12_2");
    expect(JSON.stringify(manifest).includes("lordicon-secret-test")).toBe(false);
  } finally {
    (globalThis as unknown as { fetch: unknown }).fetch = previousFetch;
    if (oldKey === undefined) delete process.env.LORDICON_API_KEY;
    else process.env.LORDICON_API_KEY = oldKey;
  }
});

test("shadcn and 21st handoff candidates import only local static exports", async () => {
  const dir = mkdtempSync(join(tmpdir(), "koubo-ui-handoff-"));
  writeFileSync(join(dir, "shadcn-card.svg"), '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10H0z"/></svg>');
  writeFileSync(join(dir, "twenty-first-card.svg"), '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h8v8H0z"/></svg>');
  writeFileSync(
    join(dir, projectArtifacts.visualRequest),
    JSON.stringify({
      version: "1.0",
      source_mode: "talking_head_avatar",
      presentation_intent: "product_demo",
      requests: [
        { id: "shadcn-card", viewer_job: "show a stable product card", semantic_query: "product card", asset_type: "ui_component", preferred_sources: ["shadcn"], reason: "host exported shadcn static card", selected_candidate_id: "shadcn-card-export" },
        { id: "twenty-first-card", viewer_job: "show a polished template", semantic_query: "feature card", asset_type: "template", preferred_sources: ["21st"], reason: "host exported 21st static template", selected_candidate_id: "21st-card-export" },
      ],
    }),
  );
  writeFileSync(
    join(dir, projectArtifacts.visualCandidates),
    JSON.stringify({
      version: "1.0",
      candidates: [
        { id: "shadcn-card-export", request_id: "shadcn-card", provider: "shadcn", asset_type: "ui_component", title: "shadcn card export", semantic_query: "product card", local_path: "shadcn-card.svg", license: "MIT", renderable: true, recommended: true, reason: "static export from shadcn MCP candidate", runtime_dependencies: [] },
        { id: "21st-card-export", request_id: "twenty-first-card", provider: "21st", asset_type: "template", title: "21st card export", semantic_query: "feature card", local_path: "twenty-first-card.svg", license: "unknown", source_risk: "host must confirm 21st source license", renderable: true, recommended: true, reason: "static export from 21st MCP candidate", runtime_dependencies: [] },
      ],
      warnings: [],
    }),
  );

  const candidates = await searchVisualAssets(dir);
  expect(candidates.warnings).toEqual([]);
  expect(candidates.candidates.map((candidate) => candidate.provider)).toEqual(["shadcn", "21st"]);
  writeFileSync(join(dir, projectArtifacts.visualCandidates), `${JSON.stringify(candidates, null, 2)}\n`);
  const acquisition = await acquireVisualAssets(dir);
  expect(acquisition.assets.map((asset) => asset.provider)).toEqual(["shadcn", "21st"]);
  expect(existsSync(join(dir, "assets", "visuals", "visual-shadcn-card.svg"))).toBe(true);
  expect(existsSync(join(dir, "assets", "visuals", "visual-twenty-first-card.svg"))).toBe(true);
});

test("visual acquire requires explicit selection even for recommended or sole renderable candidates", async () => {
  for (const recommended of [true, false]) {
    const dir = mkdtempSync(join(tmpdir(), "koubo-explicit-visual-"));
    writeFileSync(join(dir, projectArtifacts.visualRequest), JSON.stringify({
      version: "1.0",
      source_mode: "screen_recording",
      presentation_intent: "short_form",
      requests: [{ id: "alarm", viewer_job: "show alarm", semantic_query: "alarm", asset_type: "icon", preferred_sources: [], reason: "alarm needs an icon" }],
    }));
    writeFileSync(join(dir, projectArtifacts.visualCandidates), JSON.stringify({
      version: "1.0",
      candidates: [{ id: "alarm-candidate", request_id: "alarm", provider: "local", asset_type: "icon", title: "Alarm", semantic_query: "alarm", local_path: "alarm.svg", renderable: true, recommended, reason: "matches alarm", runtime_dependencies: [] }],
      warnings: [],
    }));

    let error: unknown;
    try {
      await acquireVisualAssets(dir);
    } catch (caught) {
      error = caught;
    }
    expect(String(error)).toContain("selected_candidate_id is required");
    expect(existsSync(join(dir, "assets"))).toBe(false);
    expect(existsSync(join(dir, projectArtifacts.assetManifest))).toBe(false);
  }
});

test("visual acquire preflights every request before fetch, file, or manifest side effects", async () => {
  const dir = mkdtempSync(join(tmpdir(), "koubo-visual-preflight-"));
  const originalManifest = '{"assets":[]}\n';
  writeFileSync(join(dir, projectArtifacts.assetManifest), originalManifest);
  writeFileSync(join(dir, projectArtifacts.visualRequest), JSON.stringify({
    version: "1.0",
    source_mode: "screen_recording",
    presentation_intent: "short_form",
    requests: [
      { id: "first", viewer_job: "show first", semantic_query: "first", asset_type: "icon", preferred_sources: [], reason: "first reason", selected_candidate_id: "first-candidate" },
      { id: "second", viewer_job: "show second", semantic_query: "second", asset_type: "icon", preferred_sources: [], reason: "second reason", selected_candidate_id: "missing-candidate" },
    ],
  }));
  writeFileSync(join(dir, projectArtifacts.visualCandidates), JSON.stringify({
    version: "1.0",
    candidates: [{ id: "first-candidate", request_id: "first", provider: "url", asset_type: "icon", title: "First", semantic_query: "first", download_url: "https://example.com/first.svg", renderable: true, recommended: true, reason: "first candidate", runtime_dependencies: [] }],
    warnings: [],
  }));
  const previousFetch = fetch;
  let fetchCount = 0;
  (globalThis as unknown as { fetch: unknown }).fetch = async () => {
    fetchCount += 1;
    throw new Error("fetch must not run");
  };

  try {
    let error: unknown;
    try {
      await acquireVisualAssets(dir);
    } catch (caught) {
      error = caught;
    }
    expect(String(error)).toContain("missing-candidate was not found for this request");
    expect(fetchCount).toBe(0);
    expect(existsSync(join(dir, "assets"))).toBe(false);
    expect(readFileSync(join(dir, projectArtifacts.assetManifest), "utf8")).toBe(originalManifest);
  } finally {
    (globalThis as unknown as { fetch: unknown }).fetch = previousFetch;
  }
});

test("visual acquire keeps every current asset and manifest when the second selected asset fails", async () => {
  const dir = mkdtempSync(join(tmpdir(), "koubo-visual-commit-last-"));
  const firstTarget = join(dir, "assets", "icons", "visual-first.svg");
  const secondTarget = join(dir, "assets", "icons", "visual-second.svg");
  writeFileSync(join(dir, "first.svg"), '<svg xmlns="http://www.w3.org/2000/svg"><path d="M1 1h8v8H1z"/></svg>');
  mkdirSync(join(dir, "assets", "icons"), { recursive: true });
  writeFileSync(firstTarget, "current first bytes");
  writeFileSync(secondTarget, "current second bytes");
  writeFileSync(join(dir, projectArtifacts.visualRequest), JSON.stringify({
    version: "1.0",
    source_mode: "screen_recording",
    presentation_intent: "short_form",
    requests: [
      { id: "first", viewer_job: "show first", semantic_query: "first", asset_type: "icon", preferred_sources: [], reason: "first reason", selected_candidate_id: "first-candidate" },
      { id: "second", viewer_job: "show second", semantic_query: "second", asset_type: "icon", preferred_sources: [], reason: "second reason", selected_candidate_id: "second-candidate" },
    ],
  }));
  writeFileSync(join(dir, projectArtifacts.visualCandidates), JSON.stringify({
    version: "1.0",
    candidates: [
      { id: "first-candidate", request_id: "first", provider: "local", asset_type: "icon", title: "First", semantic_query: "first", local_path: "first.svg", renderable: true, recommended: true, reason: "first candidate", runtime_dependencies: [] },
      { id: "second-candidate", request_id: "second", provider: "local", asset_type: "icon", title: "Second", semantic_query: "second", local_path: "missing-second.svg", renderable: true, recommended: true, reason: "second candidate", runtime_dependencies: [] },
    ],
    warnings: [],
  }));
  const originalManifest = `${JSON.stringify({
    assets: [
      { id: "visual-first", path: "assets/icons/visual-first.svg", type: "icon", source: "imported" },
      { id: "visual-second", path: "assets/icons/visual-second.svg", type: "icon", source: "imported" },
    ],
  }, null, 2)}\n`;
  writeFileSync(join(dir, projectArtifacts.assetManifest), originalManifest);

  let error: unknown;
  try {
    await acquireVisualAssets(dir);
  } catch (caught) {
    error = caught;
  }
  expect(String(error)).toContain("missing-second.svg");

  expect(readFileSync(firstTarget, "utf8")).toBe("current first bytes");
  expect(readFileSync(secondTarget, "utf8")).toBe("current second bytes");
  expect(readFileSync(join(dir, projectArtifacts.assetManifest), "utf8")).toBe(originalManifest);
  expect(readdirSync(dir).some((entry) => entry.startsWith(".visual-acquire-staging-"))).toBe(false);
});

test("visual candidate and review markdown expose preview and distinct reasons", () => {
  const candidatesMarkdown = renderVisualCandidatesMarkdown({
    version: "1.0",
    candidates: [{ id: "alarm", request_id: "alarm-request", provider: "local", asset_type: "icon", title: "Alarm", semantic_query: "alarm", preview_path: ".visual-previews/alarm.png", local_path: "alarm.svg", renderable: true, recommended: true, reason: "candidate match", runtime_dependencies: [] }],
    warnings: [],
  });
  expect(candidatesMarkdown).toContain("preview=.visual-previews/alarm.png");

  const review = buildVisualReview({
    version: "1.0",
    assets: [{ id: "acquired-alarm", request_id: "alarm-request", candidate_id: "alarm", asset_id: "visual-alarm", provider: "local", asset_type: "icon", path: "assets/icons/visual-alarm.svg", hash: "abc", acquired_at: "2026-07-11T00:00:00.000Z", runtime_dependencies: [], warnings: [] }],
    warnings: [],
  }, {
    version: "1.0",
    source_mode: "screen_recording",
    presentation_intent: "short_form",
    requests: [{ id: "alarm-request", viewer_job: "show alarm", semantic_query: "alarm", asset_type: "icon", preferred_sources: [], reason: "the spoken cue needs visual help", selected_candidate_id: "alarm", selection_reason: "best readable silhouette" }],
  });
  expect(review.items[0]?.usage_reason).toBe("the spoken cue needs visual help");
  expect(review.items[0]?.selection_reason).toBe("best readable silhouette");
  const reviewMarkdown = renderVisualReviewMarkdown(review);
  expect(reviewMarkdown).toContain("usage=the spoken cue needs visual help");
  expect(reviewMarkdown).toContain("selection=best readable silhouette");
});
