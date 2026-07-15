import { expect, test } from "bun:test";
import * as artifacts from "./artifacts";
import { parseAssetManifest, parseEdl, parseEnrichmentPlan, parseMusicRequest, parseProductionProposal, parseSourcesManifest, parseTranscript, parseVisualAcquisition, parseVisualCandidates, parseVisualRequest, parseVisualReview } from "./artifacts";

const manifest = parseSourcesManifest({
  sources: [
    { source_id: "src-1", order: 0, original_filename: "a.mp4", project_path: "source/001-original.mp4", duration_seconds: 10 },
    { source_id: "src-2", order: 1, original_filename: "b.mp4", project_path: "source/002-original.mp4", duration_seconds: 20 },
  ],
});

test("source manifest rejects duplicate source ids", () => {
  expect(() =>
    parseSourcesManifest({
      sources: [
        { source_id: "src-1", order: 0, original_filename: "a.mp4", project_path: "source/a.mp4", duration_seconds: 1 },
        { source_id: "src-1", order: 1, original_filename: "b.mp4", project_path: "source/b.mp4", duration_seconds: 1 },
      ],
    }),
  ).toThrow("duplicate source_id");
});

test("transcript validates timing granularity and source ids", () => {
  const transcript = parseTranscript(
    {
      timing_granularity: "segment",
      segments: [{ source_id: "src-2", start: 1, end: 2, text: "hello" }],
    },
    manifest,
  );
  expect(transcript.segments[0]?.source_id).toBe("src-2");
  expect(() => parseTranscript({ timing_granularity: "frame", segments: [] }, manifest)).toThrow("timing_granularity");
  expect(() =>
    parseTranscript({ timing_granularity: "word", segments: [{ source_id: "missing", start: 0, end: 1, text: "x" }] }, manifest),
  ).toThrow("unknown source_id");
});

test("edl validates source references and output order", () => {
  const edl = parseEdl(
    {
      entries: [
        { source_id: "src-1", source_path: "source/001-original.mp4", start: 0, end: 2, output_order: 0, reason: "intro" },
        { source_id: "src-2", source_path: "source/002-original.mp4", start: 3, end: 4, output_order: 1, reason: "take two" },
      ],
    },
    manifest,
  );
  expect(edl.entries.map((entry) => entry.source_id)).toEqual(["src-1", "src-2"]);
  expect(() =>
    parseEdl({ entries: [{ source_id: "src-1", source_path: "source/a.mp4", start: 2, end: 1, output_order: 0, reason: "bad" }] }, manifest),
  ).toThrow("end must be greater");
  expect(() =>
    parseEdl(
      {
        entries: [
          { source_id: "src-1", source_path: "source/a.mp4", start: 0, end: 1, output_order: 0, reason: "a" },
          { source_id: "src-2", source_path: "source/b.mp4", start: 0, end: 1, output_order: 0, reason: "b" },
        ],
      },
      manifest,
    ),
  ).toThrow("duplicate output_order");
  expect(() =>
    parseEdl(
      {
        entries: [
          { source_id: "src-1", source_path: "source/a.mp4", start: 0, end: 2, output_order: 0, reason: "a" },
          { source_id: "src-1", source_path: "source/a.mp4", start: 1, end: 3, output_order: 1, reason: "b" },
        ],
      },
      manifest,
    ),
  ).toThrow("overlap");
});

test("enrichment artifacts validate slots and safe asset paths", () => {
  const plan = parseEnrichmentPlan({
    version: "1.0",
    slots: [
      { id: "title", type: "title_card", start: 0, end: 1, text: "Hello", reason: "open" },
      { id: "music", type: "music_segment", start: 0, end: 2, asset_id: "m1", volume: 0.2, fade_seconds: 0.2, ducking: true, reason: "bed" },
    ],
  });
  expect(plan.slots?.length).toBe(2);
  expect(plan.profile.source_mode).toBe("talking_head_avatar");
  expect(() => parseEnrichmentPlan({ version: "1.0", cards: [], music: [] })).toThrow("require slots");
  expect(() =>
    parseEnrichmentPlan({
      version: "1.10",
      slots: [{ id: "title", type: "title_card", start: 0, end: 1, text: "Hello", reason: "open" }],
    }),
  ).toThrow("version");
  expect(() => parseEnrichmentPlan({ version: "1.0", slots: [{ id: "bad", type: "title_card", start: 1, end: 1, text: "x", reason: "bad" }] })).toThrow("end must be greater");
  expect(() =>
    parseEnrichmentPlan({
      version: "1.0",
      slots: [
        { id: "a", type: "keyword_callout", start: 0, end: 2, text: "A", reason: "a" },
        { id: "b", type: "key_point_card", start: 1, end: 3, text: "B", reason: "b" },
      ],
    }),
  ).toThrow("overlap");

  const assets = parseAssetManifest({
    assets: [
      {
        id: "img",
        path: "assets/images/a.png",
        type: "image",
        source: "agent_generated",
        provenance: "openai-image",
        reason: "concept art",
        used_by: ["image-1"],
        dimensions: { width: 1280, height: 720 },
        hash: "sha256-demo",
      },
      {
        id: "hit",
        path: "assets/music/hit.wav",
        type: "sfx",
        source: "bundled",
        provider: "local",
        license: "bundled",
        duration_seconds: 0.4,
        volume: 0.2,
        fade_seconds: 0.05,
        ducking: true,
      },
    ],
  });
  expect(assets.assets[0]?.path).toBe("assets/images/a.png");
  expect(assets.assets[0]?.source).toBe("agent_generated");
  expect(assets.assets[0]?.used_by).toEqual(["image-1"]);
  expect(assets.assets[0]?.dimensions).toEqual({ width: 1280, height: 720 });
  expect(assets.assets[1]?.type).toBe("sfx");
  expect(assets.assets[1]?.provider).toBe("local");
  expect(assets.assets[1]?.license).toBe("bundled");
  expect(() => parseAssetManifest({ assets: [{ id: "bad", path: "https://example.com/a.png" }] })).toThrow("project-relative");
  expect(() => parseAssetManifest({ assets: [{ id: "bad", path: "../a.png" }] })).toThrow("must not contain");
  expect(() => parseAssetManifest({ assets: [{ id: "bad", path: "assets/images/a.png", source: "provider_url" }] })).toThrow("source");
  expect(() => parseAssetManifest({ assets: [{ id: "bad", path: "assets/images/a.png", dimensions: { width: 0, height: 720 } }] })).toThrow("greater than 0");
});

test("music request validates sources and safe local paths", () => {
  const request = parseMusicRequest({
    version: "1.0",
    id: "bed",
    source: "minimax",
    reason: "short-form pacing",
    source_mode: "talking_head_avatar",
    presentation_intent: "short_form",
    prompt: "quiet upbeat tech tutorial instrumental",
    target_duration_seconds: 30,
    volume: 0.12,
    fade_seconds: 0.5,
    ducking: true,
  });
  expect(request.source).toBe("minimax");
  expect(request.volume).toBe(0.12);
  expect(() => parseMusicRequest({ version: "1.0", id: "bad", source: "spotify", reason: "bad" })).toThrow("source");
  expect(() => parseMusicRequest({ version: "1.0", id: "bad", source: "local", reason: "bad", local_path: "https://example.com/a.mp3" })).toThrow("project-relative");
  expect(() => parseMusicRequest({ version: "1.0", id: "bad", source: "local", reason: "bad", local_path: "../a.mp3" })).toThrow("must not contain");
});

test("visual acquisition artifacts validate metadata urls but keep final paths local", () => {
  const request = parseVisualRequest({
    version: "1.0",
    source_mode: "screen_recording",
    presentation_intent: "short_form",
    requests: [
      {
        id: "alarm",
        viewer_job: "make the deadline cue visible",
        semantic_query: "alarm clock",
        asset_type: "icon",
        preferred_sources: ["iconify"],
        reason: "spoken alarm should be visible as an icon",
        output_usage: "small upper-third icon",
        selected_candidate_id: "alarm-iconify-mdi-alarm",
        selection_reason: "best semantic match with a clear silhouette",
        start: 1,
        end: 2,
        zone: "upper_third",
      },
    ],
  });
  expect(request.requests[0]?.semantic_query).toBe("alarm clock");
  expect(request.requests[0]?.selection_reason).toBe("best semantic match with a clear silhouette");
  expect(() => parseVisualRequest({ ...request, requests: [{ ...request.requests[0], selection_reason: "   " }] })).toThrow("must not be blank");

  const candidates = parseVisualCandidates({
    version: "1.0",
    candidates: [
      {
        id: "alarm-iconify-mdi-alarm",
        request_id: "alarm",
        provider: "iconify",
        asset_type: "icon",
        title: "mdi:alarm",
        semantic_query: "alarm clock",
        preview_url: "https://api.iconify.design/mdi/alarm.svg",
        preview_path: ".visual-previews/alarm.png",
        source_url: "https://icon-sets.iconify.design/mdi/alarm/",
        download_url: "https://api.iconify.design/mdi/alarm.svg",
        local_path: "assets/icons/alarm.svg",
        license: "Apache-2.0",
        license_url: "https://example.com/license",
        renderable: true,
        recommended: true,
        reason: "semantic match",
        runtime_dependencies: [],
      },
    ],
    warnings: [],
  });
  expect(candidates.candidates[0]?.provider).toBe("iconify");
  expect(candidates.candidates[0]?.preview_path).toBe(".visual-previews/alarm.png");

  for (const unsafePath of ["   ", "/tmp/alarm.png", "C:/alarm.png", "https://example.com/alarm.png", "assets\\alarm.png", "assets/../alarm.png"]) {
    expect(() =>
      parseVisualCandidates({
        ...candidates,
        candidates: [{ ...candidates.candidates[0], preview_path: unsafePath }],
      }),
    ).toThrow();
    expect(() =>
      parseVisualCandidates({
        ...candidates,
        candidates: [{ ...candidates.candidates[0], local_path: unsafePath }],
      }),
    ).toThrow();
  }

  const acquisition = parseVisualAcquisition({
    version: "1.0",
    assets: [
      {
        id: "visual-alarm-acquisition",
        request_id: "alarm",
        candidate_id: "alarm-iconify-mdi-alarm",
        asset_id: "visual-alarm",
        provider: "iconify",
        asset_type: "icon",
        path: "assets/icons/visual-alarm.svg",
        hash: "sha256-demo",
        source_url: "https://icon-sets.iconify.design/mdi/alarm/",
        license: "Apache-2.0",
        acquired_at: "2026-07-07T00:00:00.000Z",
        runtime_dependencies: [],
        warnings: [],
      },
    ],
    warnings: [],
  });
  expect(acquisition.assets[0]?.path).toBe("assets/icons/visual-alarm.svg");

  const review = parseVisualReview({
    version: "1.0",
    items: [
      {
        asset_id: "visual-alarm",
        request_id: "alarm",
        candidate_id: "alarm-iconify-mdi-alarm",
        provider: "iconify",
        asset_type: "icon",
        path: "assets/icons/visual-alarm.svg",
        source_url: "https://icon-sets.iconify.design/mdi/alarm/",
        license: "Apache-2.0",
        runtime_dependencies: [],
        usage_reason: "spoken alarm should be visible as an icon",
        selection_reason: "best semantic match with a clear silhouette",
        warnings: [],
      },
    ],
    warnings: [],
  });
  expect(review.items[0]?.asset_id).toBe("visual-alarm");
  expect(parseVisualReview(JSON.parse(JSON.stringify(review)))).toEqual(review);

  expect(() => parseVisualAcquisition({ version: "1.0", assets: [{ ...acquisition.assets[0], path: "https://example.com/alarm.svg" }], warnings: [] })).toThrow("project-relative");
  expect(() => parseVisualCandidates({ version: "1.0", candidates: [{ ...candidates.candidates[0], provider: "random" }], warnings: [] })).toThrow("provider");
});

test("production proposal validates options and forbids premature asset refs", () => {
  const proposal = parseProductionProposal({
    version: "1.0",
    source_mode: "mixed",
    presentation_intent: "knowledge_explainer",
    goal_summary: "make a concise explainer",
    material_summary: "screen recording with spoken explanation",
    recommended_option_id: "balanced",
    options: [
      {
        id: "balanced",
        label: "克制增强",
        recommended: true,
        reason: "keeps the screen readable",
        cleanup: { cut_candidate_ids: ["c-001-silence"], keep_strategy: "keep all semantic content", risks: [] },
        subtitles: { enabled: true, style: "anchor", conflict_notes: ["source has hard subtitles"] },
        visuals: { direction: "transparent focus cues", viewer_job: "follow the important UI step", requires_grounding: true, notes: ["avoid opaque cards"] },
        images: { needed: true, reason: "abstract concept is not visible", missing_assets: ["concept image"] },
        music: { source: "minimax", mood: "quiet tech bed", ducking: true, notes: ["review cost before acquisition"] },
        sfx: { enabled: true, usage: "click accents", restraint: "low volume only" },
        requires_confirmation: ["generate image", "acquire music"],
      },
    ],
  });
  expect(proposal.recommended_option_id).toBe("balanced");
  expect(proposal.options[0]?.music.source).toBe("minimax");

  expect(() =>
    parseProductionProposal({
      ...proposal,
      recommended_option_id: "missing",
    }),
  ).toThrow("recommended_option_id");
  expect(() =>
    parseProductionProposal({
      ...proposal,
      source_mode: "desktop",
    }),
  ).toThrow("source_mode");
  expect(() =>
    parseProductionProposal({
      ...proposal,
      options: [{ ...proposal.options[0], music: { source: "spotify", ducking: true, notes: [] } }],
    }),
  ).toThrow("music.source");
  expect(() =>
    parseProductionProposal({
      ...proposal,
      options: [
        { ...proposal.options[0], id: "same" },
        { ...proposal.options[0], id: "same" },
      ],
    }),
  ).toThrow("duplicate production proposal option id");
  expect(() =>
    parseProductionProposal({
      ...proposal,
      options: [{ ...proposal.options[0], images: { ...proposal.options[0]!.images, path: "assets/images/a.png" } }],
    }),
  ).toThrow("must not appear before confirmed asset acquisition");
});

test("project metadata normalizes missing contract version as legacy", () => {
  expect(artifacts.parseProjectMetadata({ provider_execution_mode: "standalone" }).contract_version).toBe("legacy");
  expect(artifacts.parseProjectMetadata({ contract_version: "1.0", provider_execution_mode: "platform" }).contract_version).toBe("1.0");
  expect(() => artifacts.parseProjectMetadata({ contract_version: "2.0", provider_execution_mode: "standalone" })).toThrow("contract_version");
});

test("production proposal v1.1 consumes business direction, execution plan, and asset requirements", () => {
  const proposal = parseProductionProposal({
    version: "1.1",
    source_mode: "mixed",
    presentation_intent: "short_form",
    goal_summary: "turn the source into a concise sales video",
    material_summary: "product demo with a spoken walkthrough",
    recommended_option_id: "sales_conversion",
    options: [
      {
        id: "sales_conversion",
        label: "强卖货转化版",
        recommended: true,
        reason: "the source contains a clear product payoff",
        cleanup: { cut_candidate_ids: ["c-001"], keep_strategy: "keep proof and CTA", risks: [] },
        subtitles: { enabled: true, style: "anchor", conflict_notes: [] },
        visuals: { direction: "restrained product cues", viewer_job: "see the key feature", requires_grounding: true, notes: [] },
        images: { needed: false, reason: "the source already shows the product", missing_assets: [] },
        music: { source: "none", ducking: true, notes: [] },
        sfx: { enabled: false, usage: "none", restraint: "no decorative effects" },
        requires_confirmation: ["final duration"],
        business_direction: {
          direction_id: "sales_conversion",
          title: "强卖货转化版",
          suitable_for: "private-domain conversion",
          editing_strategy: "lead with payoff, retain proof, close with CTA",
          expected_duration: "25-40s",
          asset_style: "strong captions and restrained icons",
          risks: ["sales tone may reduce authenticity"],
        },
        edit_execution_plan: {
          objective: "drive qualified inquiries",
          target_audience: "buyers comparing the product",
          final_duration: "30-40s",
          narrative_structure: [{ beat: "hook", purpose: "show the payoff", source_hint: "0.0-4.0" }],
          keep_segments: [{ source_id: "src-1", start: 0.5, end: 4.5, reason: "contains the core proof" }],
          remove_segments: [{ candidate_id: "c-001", reason: "long pause" }],
          reorder_segments: [],
          text_overlays: [{ start: 0.5, end: 2.5, text: "核心卖点", purpose: "reinforce the hook" }],
          visual_asset_slots: [],
          music_slots: [],
          sfx_slots: [],
          image_slots: [],
          user_confirmation_summary: "cut the pause, keep the proof, and use restrained captions",
        },
        asset_requirements: {
          visual_asset_slots: [
            {
              slot_id: "feature_icon",
              kind: "visual_asset",
              purpose: "reinforce the product feature",
              query: "simple product feature icon",
              required: false,
              suggested_time: 1.2,
              duration_hint: 2.5,
              placement_hint: "top-right small",
              provider_hint: "Iconify",
            },
          ],
          music_slots: [],
          sfx_slots: [],
          image_slots: [],
        },
      },
    ],
  });

  expect(proposal.version).toBe("1.1");
  if (proposal.version !== "1.1") throw new Error("expected v1.1 proposal");
  expect(proposal.options[0]?.business_direction.direction_id).toBe("sales_conversion");
  expect(proposal.options[0]?.edit_execution_plan.keep_segments[0]?.source_id).toBe("src-1");
  expect(proposal.options[0]?.asset_requirements.visual_asset_slots[0]?.slot_id).toBe("feature_icon");

  expect(() => parseProductionProposal({ ...proposal, options: [{ ...proposal.options[0], asset_requirements: undefined }] })).toThrow("asset_requirements");
  expect(() =>
    parseProductionProposal({
      ...proposal,
      options: [
        {
          ...proposal.options[0],
          asset_requirements: {
            ...proposal.options[0]!.asset_requirements,
            visual_asset_slots: [{ ...proposal.options[0]!.asset_requirements.visual_asset_slots[0], asset_id: "already-acquired" }],
          },
        },
      ],
    }),
  ).toThrow("asset_id is not allowed");
});

test("production proposal v1.0 remains an explicit legacy parse path", () => {
  const proposal = parseProductionProposal({
    version: "1.0",
    source_mode: "talking_head_avatar",
    presentation_intent: "knowledge_explainer",
    goal_summary: "legacy proposal",
    material_summary: "legacy material",
    recommended_option_id: "legacy",
    options: [
      {
        id: "legacy",
        label: "Legacy",
        reason: "existing project compatibility",
        cleanup: { cut_candidate_ids: [], keep_strategy: "keep", risks: [] },
        subtitles: { enabled: true, style: "anchor", conflict_notes: [] },
        visuals: { direction: "none", viewer_job: "listen", requires_grounding: false, notes: [] },
        images: { needed: false, reason: "none", missing_assets: [] },
        music: { source: "none", ducking: false, notes: [] },
        sfx: { enabled: false, usage: "none", restraint: "none" },
        requires_confirmation: [],
      },
    ],
  });
  expect(proposal.version).toBe("1.0");
  expect("business_direction" in proposal.options[0]!).toBe(false);
});

test("edit plan requires proposal selection binding only for the current contract", () => {
  const fingerprint = `sha256:${"a".repeat(64)}`;
  const current = artifacts.parseEditPlan({
    contract_version: "1.0",
    confirmed_option_id: "sales_conversion",
    proposal_selection_fingerprint: fingerprint,
    decisions: [],
  });
  expect(current.contract_version).toBe("1.0");
  expect(current.confirmed_option_id).toBe("sales_conversion");
  expect(current.proposal_selection_fingerprint).toBe(fingerprint);

  const legacy = artifacts.parseEditPlan({ decisions: [] });
  expect(legacy.contract_version).toBe("legacy");
  expect(legacy.confirmed_option_id).toBe(undefined);
  expect(() => artifacts.parseEditPlan({ contract_version: "1.0", confirmed_option_id: "sales_conversion", decisions: [] })).toThrow(
    "proposal_selection_fingerprint",
  );
  expect(() =>
    artifacts.parseEditPlan({ contract_version: "1.0", confirmed_option_id: "sales_conversion", proposal_selection_fingerprint: "sha256-demo", decisions: [] }),
  ).toThrow("sha256:<64 hex>");
});

test("artifact manifest validates records, lineage references, and stage attempts", () => {
  const projectFingerprint = `sha256:${"1".repeat(64)}`;
  const editFingerprint = `sha256:${"2".repeat(64)}`;
  const inputFingerprint = `sha256:${"3".repeat(64)}`;
  const value = {
    contract_version: "1.0",
    artifacts: {
      project: {
        key: "project",
        path: "project.json",
        role: "authoritative_input",
        schema_version: "1.0",
        fingerprint: projectFingerprint,
        authored_by: "cli",
        produced_by_command: "project.create",
        producer_cli_version: "0.0.1",
        command_contract_version: "1.0",
        inputs: [],
        produced_at: "2026-07-15T00:00:00.000Z",
      },
      "edit-plan": {
        key: "edit-plan",
        path: "edit-plan.json",
        role: "authoritative_input",
        schema_version: "1.0",
        fingerprint: editFingerprint,
        authored_by: "agent",
        validated_by_command: "project.compile-edl",
        producer_cli_version: "0.0.1",
        command_contract_version: "1.0",
        inputs: [{ key: "project", fingerprint: projectFingerprint }],
        validated_at: "2026-07-15T00:01:00.000Z",
      },
    },
    stage_attempts: {
      "project.compile-edl": {
        stage: "project.compile-edl",
        command: "project.render",
        input_fingerprint: inputFingerprint,
        status: "failed",
        started_at: "2026-07-15T00:02:00.000Z",
        completed_at: "2026-07-15T00:02:01.000Z",
        failure_code: "EDIT_PLAN_INVALID",
        remediation: "fix edit-plan.json and rerun project render",
      },
    },
    updated_at: "2026-07-15T00:02:01.000Z",
  };

  const manifest = artifacts.parseArtifactManifest(value);
  expect(manifest.artifacts["edit-plan"]?.inputs[0]?.fingerprint).toBe(projectFingerprint);
  expect(manifest.stage_attempts["project.compile-edl"]?.failure_code).toBe("EDIT_PLAN_INVALID");

  const rejectedInputAttempt = artifacts.parseArtifactManifest({
    ...value,
    stage_attempts: {
      "project.compile-edl": {
        ...value.stage_attempts["project.compile-edl"],
        inputs: [{ key: "unvalidated-edit-plan", fingerprint: editFingerprint }],
      },
    },
  });
  expect(rejectedInputAttempt.stage_attempts["project.compile-edl"]?.inputs?.[0]?.key).toBe("unvalidated-edit-plan");

  expect(() =>
    artifacts.parseArtifactManifest({
      ...value,
      artifacts: { ...value.artifacts, project: { ...value.artifacts.project, path: "../project.json" } },
    }),
  ).toThrow("must not contain ..");
  expect(() =>
    artifacts.parseArtifactManifest({
      ...value,
      artifacts: { ...value.artifacts, project: { ...value.artifacts.project, fingerprint: "sha256-not-valid" } },
    }),
  ).toThrow("sha256:<64 hex>");
  expect(() =>
    artifacts.parseArtifactManifest({
      ...value,
      stage_attempts: { "project.compile-edl": { ...value.stage_attempts["project.compile-edl"], remediation: undefined } },
    }),
  ).toThrow("remediation");

  expect(() =>
    artifacts.parseArtifactManifest({
      ...value,
      artifacts: {
        ...value.artifacts,
        "edit-plan": {
          ...value.artifacts["edit-plan"],
          inputs: [{ key: "missing-input", fingerprint: projectFingerprint }],
        },
      },
    }),
  ).toThrow("references missing artifact key missing-input");

  expect(() =>
    artifacts.parseArtifactManifest({
      ...value,
      artifacts: {
        ...value.artifacts,
        project: {
          ...value.artifacts.project,
          inputs: [{ key: "edit-plan", fingerprint: editFingerprint }],
        },
      },
    }),
  ).toThrow("artifact dependency cycle: project -> edit-plan -> project");

  const failedAttempt = value.stage_attempts["project.compile-edl"];
  expect(() =>
    artifacts.parseArtifactManifest({
      ...value,
      stage_attempts: {
        "project.compile-edl": {
          ...failedAttempt,
          output_artifact_keys: ["edit-plan"],
        },
      },
    }),
  ).toThrow("failed attempt must not include output_artifact_keys");

  expect(() =>
    artifacts.parseArtifactManifest({
      ...value,
      stage_attempts: {
        "project.compile-edl": {
          ...failedAttempt,
          status: "success",
          failure_code: undefined,
          remediation: undefined,
          artifact: "edit-plan",
          output_artifact_keys: ["edit-plan"],
        },
      },
    }),
  ).toThrow("successful attempt must not include artifact or failure fields");

  expect(() =>
    artifacts.parseArtifactManifest({
      ...value,
      stage_attempts: {
        "project.compile-edl": {
          ...failedAttempt,
          status: "success",
          failure_code: undefined,
          remediation: undefined,
          output_artifact_keys: ["missing-output"],
        },
      },
    }),
  ).toThrow("references missing artifact key missing-output");

  expect(
    artifacts.parseArtifactManifest({
      ...value,
      stage_attempts: {
        "project.compile-edl": {
          ...failedAttempt,
          status: "success",
          failure_code: undefined,
          remediation: undefined,
          output_artifact_keys: ["edit-plan"],
        },
      },
    }).stage_attempts["project.compile-edl"]?.status,
  ).toBe("success");
});

test("artifact manifest requires matching file hashes for physical records but not human views", () => {
  const fingerprint = `sha256:${"a".repeat(64)}`;
  const otherFingerprint = `sha256:${"b".repeat(64)}`;
  const physicalRecord = {
    key: "asset:demo",
    path: "assets/demo.bin",
    role: "execution_result",
    schema_version: "bytes-v1",
    fingerprint,
    authored_by: "cli",
    produced_by_command: "project.render",
    producer_cli_version: "0.0.1",
    command_contract_version: "1.0",
    inputs: [],
    produced_at: "2026-07-15T00:00:00.000Z",
  };
  const manifest = {
    contract_version: "1.0",
    artifacts: { "asset:demo": physicalRecord },
    stage_attempts: {},
    updated_at: "2026-07-15T00:00:00.000Z",
  };

  for (const schemaVersion of ["bytes-v1", "image/jpeg", "audio/wav", "video/mp4", "media-v1", "media/probed-v1"]) {
    expect(() =>
      artifacts.parseArtifactManifest({
        ...manifest,
        artifacts: { "asset:demo": { ...physicalRecord, schema_version: schemaVersion } },
      }),
    ).toThrow(`file_sha256 is required for physical schema ${schemaVersion}`);
  }

  expect(() =>
    artifacts.parseArtifactManifest({
      ...manifest,
      artifacts: { "asset:demo": { ...physicalRecord, file_sha256: otherFingerprint } },
    }),
  ).toThrow("file_sha256 must match fingerprint for physical schema bytes-v1");

  expect(
    artifacts.parseArtifactManifest({
      ...manifest,
      artifacts: { "asset:demo": { ...physicalRecord, file_sha256: fingerprint } },
    }).artifacts["asset:demo"]?.file_sha256,
  ).toBe(fingerprint);

  expect(
    artifacts.parseArtifactManifest({
      ...manifest,
      artifacts: {
        "asset:demo": {
          ...physicalRecord,
          path: "views/demo.jpg",
          role: "human_view",
          schema_version: "image/jpeg",
        },
      },
    }).artifacts["asset:demo"]?.file_sha256,
  ).toBe(undefined);
});

test("render result separates inputs and outputs and owns canonical output selection", () => {
  const fingerprint = `sha256:${"4".repeat(64)}`;
  const value = {
    contract_version: "1.0",
    input_fingerprint: fingerprint,
    inputs: [{ key: "edl", fingerprint }],
    outputs: [
      { key: "subtitles", role: "derived", path: "subtitles.srt", sha256: `sha256:${"5".repeat(64)}` },
      {
        key: "render-output:clean",
        role: "execution_result",
        path: "renders/clean.mp4",
        sha256: `sha256:${"6".repeat(64)}`,
        duration_seconds: 5,
        probe: { probe_ok: true, video_codec: "h264" },
      },
    ],
    canonical_output_key: "render-output:clean",
    enrichment_applied: false,
    clean_output_path: "renders/clean.mp4",
    producer_cli_version: "0.0.1",
    completed_at: "2026-07-15T00:03:00.000Z",
  };
  const result = artifacts.parseRenderResult(value);
  expect(result.outputs[1]?.path).toBe("renders/clean.mp4");
  expect(result.canonical_output_key).toBe("render-output:clean");
  expect(() => artifacts.parseRenderResult({ ...value, canonical_output_key: "render-output:missing" })).toThrow("canonical_output_key");
  expect(() => artifacts.parseRenderResult({ ...value, clean_output_path: "/tmp/clean.mp4" })).toThrow("project-relative");
  expect(() => artifacts.parseRenderResult({ ...value, outputs: [{ ...value.outputs[1], sha256: "sha256-demo" }] })).toThrow("sha256:<64 hex>");
});

test("inspection artifact binds checks and summaries to the inspected render bytes", () => {
  const value = {
    contract_version: "1.0",
    render_result_fingerprint: `sha256:${"7".repeat(64)}`,
    canonical_output_key: "render-output:clean",
    canonical_output_path: "renders/clean.mp4",
    canonical_output_sha256: `sha256:${"8".repeat(64)}`,
    canonical_output_duration_seconds: 5,
    canonical_output_probe: { probe_ok: true, video_codec: "h264" },
    expected_duration_seconds: 5,
    captions_present: true,
    enrichment_applied: false,
    removed_ranges: [
      { candidate_id: "c-001", source_id: "src-1", start: 1, end: 2, type: "pause", reason: "long pause", text: "" },
    ],
    retained_risks: [{ reason: "source contains baked-in captions" }],
    summaries: { enrichment: [], blocks: [], elements: [], audio: [], assets: [] },
    checks: [
      {
        id: "duration",
        source_element_id: "render-output:clean",
        kind: "element",
        start: 0,
        end: 5,
        expected: "render duration matches EDL",
        frame_times: [2.5],
        frame_paths: [".inspection/duration.jpg"],
        status: "sampled",
        warnings: [],
        needs_human_review: true,
      },
    ],
    warnings: [],
    blockers: [],
    producer_cli_version: "0.0.1",
    inspected_at: "2026-07-15T00:04:00.000Z",
  };
  const inspection = artifacts.parseInspection(value);
  expect(inspection.checks[0]?.frame_paths).toEqual([".inspection/duration.jpg"]);
  expect(inspection.removed_ranges[0]?.candidate_id).toBe("c-001");
  expect(() =>
    artifacts.parseInspection({
      ...value,
      checks: [{ ...value.checks[0], frame_paths: ["/tmp/duration.jpg"] }],
    }),
  ).toThrow("project-relative");
  expect(() => artifacts.parseInspection({ ...value, canonical_output_sha256: "sha256-demo" })).toThrow("sha256:<64 hex>");
});

test("music acquisition and review managed JSON use real parsers", () => {
  const request = {
    version: "1.0",
    id: "bed",
    source: "local",
    reason: "quiet background bed",
    local_path: "assets/incoming/bed.wav",
    target_duration_seconds: 8,
  };
  const acquisition = artifacts.parseMusicAcquisition({
    version: "1.0",
    request,
    acquired: true,
    asset: { id: "bed", path: "assets/music/bed.wav", type: "music", source: "imported", duration_seconds: 8, hash: "legacy-asset-hash" },
    recommendation: { start: 0, end: 8, volume: 0.12, fade_seconds: 0.5, ducking: true, offset_seconds: 0, loop: false },
    warnings: [],
  });
  expect(acquisition.asset?.path).toBe("assets/music/bed.wav");

  const review = artifacts.parseMusicReview({
    version: "1.0",
    request_id: "bed",
    status: "ready",
    asset_id: "bed",
    provider: "local",
    path: "assets/music/bed.wav",
    duration_seconds: 8,
    license: "user-provided",
    warnings: [],
    recommended_music_segment: {
      id: "bed",
      type: "music_segment",
      start: 0,
      end: 8,
      asset_id: "bed",
      volume: 0.12,
      fade_seconds: 0.5,
      ducking: true,
      reason: "quiet background bed",
    },
  });
  expect(review.status).toBe("ready");
  expect(() => artifacts.parseMusicReview({ ...review, path: "https://example.com/bed.wav" })).toThrow("project-relative");
  expect(() => artifacts.parseMusicAcquisition({ version: "1.0", request, acquired: true, warnings: [] })).toThrow("asset");
});

test("enrichment v1.1 validates profile, captions, cards, and music", () => {
  const plan = parseEnrichmentPlan({
    version: "1.1",
    profile: { source_mode: "talking_head_avatar", aspect_ratio: "source", caption_identity: "anchor", layout: "stack", style: "whiteboard", frame: "clean" },
    captions: { enabled: true, identity: "anchor", emphasis: [{ start: 0.4, end: 0.9, text: "关键点", reason: "highlight" }] },
    cards: [
      {
        id: "opening",
        start: 0,
        end: 1.2,
        kind: "title",
        block_id: "lt_bold_block",
        visual_intent: "opening hook",
        layout: "stack",
        style: "whiteboard",
        frame: "clean",
        zone: "full_frame",
        title: "开场标题",
        reason: "orient",
      },
      {
        id: "flow",
        start: 1.2,
        end: 2.5,
        kind: "flowchart",
        title: "三步流程",
        detail: "上传 -> 清理 -> 增强",
        reason: "explain process",
      },
    ],
    music: [{ id: "bed", type: "music_segment", start: 0, end: 2.5, asset_id: "m1", volume: 0.12, fade_seconds: 0.2, ducking: true, reason: "light bed" }],
  });
  expect(plan.profile.style).toBe("whiteboard");
  expect(plan.profile.source_mode).toBe("talking_head_avatar");
  expect(plan.captions.identity).toBe("anchor");
  expect(plan.cards.map((card) => card.kind)).toEqual(["title", "flowchart"]);
  expect(plan.cards[0]?.block_id).toBe("lt_bold_block");
  expect(plan.cards[0]?.visual_intent).toBe("opening hook");
  expect(plan.cards[1]?.style).toBe("whiteboard");
  expect(plan.music[0]?.asset_id).toBe("m1");
  expect(() =>
    parseEnrichmentPlan({
      version: "1.1",
      slots: [{ id: "legacy", type: "title_card", start: 0, end: 1, text: "Legacy", reason: "stale" }],
      captions: { enabled: true, identity: "anchor" },
      cards: [],
      music: [],
    }),
  ).toThrow("legacy slots");

  expect(() =>
    parseEnrichmentPlan({
      version: "1.1",
      profile: { layout: "grid" },
      captions: { enabled: true, identity: "anchor" },
      cards: [],
      music: [],
    }),
  ).toThrow("profile.layout");
  expect(() =>
    parseEnrichmentPlan({
      version: "1.1",
      captions: { enabled: true, identity: "anchor" },
      cards: [{ id: "bad", start: 0, end: 1, kind: "unknown", title: "Bad", reason: "bad" }],
      music: [],
    }),
  ).toThrow("cards[0].kind");
  expect(() =>
    parseEnrichmentPlan({
      version: "1.1",
      captions: { enabled: true, identity: "anchor" },
      cards: [{ id: "bad", start: 0, end: 1, kind: "key_point", block_id: "unknown_block", title: "Bad", reason: "bad" }],
      music: [],
    }),
  ).toThrow("block_id");
  expect(() =>
    parseEnrichmentPlan({
      version: "1.1",
      profile: { source_mode: "screen_recording" },
      captions: { enabled: true, identity: "anchor" },
      cards: [{ id: "bad", start: 0, end: 1, kind: "key_point", block_id: "visual_inspection_report", title: "Bad", reason: "bad" }],
      music: [],
    }),
  ).toThrow("renderable");
  expect(() =>
    parseEnrichmentPlan({
      version: "1.1",
      profile: { source_mode: "screen_recording" },
      captions: { enabled: true, identity: "anchor" },
      cards: [{ id: "bad", start: 0, end: 1, kind: "lower_third", block_id: "target_zoom", title: "Bad", reason: "bad" }],
      music: [],
    }),
  ).toThrow("lower_third");
  expect(() =>
    parseEnrichmentPlan({
      version: "1.1",
      profile: { source_mode: "screen_recording" },
      captions: { enabled: true, identity: "anchor" },
      cards: [{ id: "bad", start: 0, end: 1, kind: "title", block_id: "lt_bold_block", title: "Bad", reason: "bad" }],
      music: [],
    }),
  ).toThrow("screen_recording");
});

test("enrichment v1.2 accepts HyperFrames elements and rejects invalid element contracts", () => {
  const plan = parseEnrichmentPlan({
    version: "1.2",
    profile: { source_mode: "screen_recording" },
    captions: { enabled: false, identity: "anchor" },
    cards: [],
    music: [],
    elements: [
      {
        id: "focus",
        source: "agent",
        element_id: "code-highlight",
        element_type: "registry_block",
        start: 0,
        end: 1,
        target_rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.2 },
        reason: "highlight code region",
      },
      {
        id: "shimmer",
        source: "agent",
        element_id: "shimmer-sweep",
        element_type: "registry_component",
        start: 1,
        end: 2,
        anchor_point: { x: 0.2, y: 0.8 },
        params: { text: "关键步骤", volume: 0.2, enabled: true, optional: null },
        reason: "text accent",
      },
      {
        id: "caption-theme",
        source: "agent",
        element_id: "anchor",
        element_type: "caption_identity",
        start: 0,
        end: 2,
        caption_identity: "anchor",
        reason: "caption rail",
      },
      {
        id: "click",
        source: "agent",
        element_id: "click",
        element_type: "sfx",
        start: 1.2,
        end: 1.45,
        sfx_id: "click",
        reason: "sync click",
      },
      {
        id: "asset",
        source: "agent",
        element_id: "hero-image",
        element_type: "generated_asset",
        start: 1.5,
        end: 2,
        asset_id: "img",
        reason: "agent generated visual",
      },
      {
        id: "guidance",
        source: "agent",
        element_id: "animation-rule:coordinate-target-zoom",
        element_type: "animation_rule",
        start: 0,
        end: 1,
        reason: "motion guidance",
      },
    ],
  });
  expect(plan.version).toBe("1.2");
  expect(plan.profile.source_mode).toBe("screen_recording");
  expect(plan.elements.map((element) => element.element_type)).toEqual(["registry_block", "registry_component", "caption_identity", "sfx", "generated_asset", "animation_rule"]);
  expect(plan.elements[1]?.params?.text).toBe("关键步骤");
  expect(plan.elements[3]?.sfx_id).toBe("click");

  expect(() =>
    parseEnrichmentPlan({
      version: "1.2",
      profile: { source_mode: "screen_recording" },
      captions: { enabled: false, identity: "anchor" },
      elements: [{ id: "bad", source: "agent", element_id: "missing", element_type: "registry_block", start: 0, end: 1, reason: "bad" }],
    }),
  ).toThrow("unknown vendored HyperFrames registry item");
  expect(() =>
    parseEnrichmentPlan({
      version: "1.2",
      captions: { enabled: false, identity: "anchor" },
      elements: [{ id: "bad", source: "agent", element_id: "code-highlight", element_type: "block", start: 0, end: 1, reason: "bad" }],
    }),
  ).toThrow("element_type");
  expect(() =>
    parseEnrichmentPlan({
      version: "1.2",
      captions: { enabled: false, identity: "anchor" },
      elements: [{ id: "bad", source: "agent", element_id: "img", element_type: "generated_asset", start: 0, end: 1, reason: "bad" }],
    }),
  ).toThrow("asset_id");
  expect(() =>
    parseEnrichmentPlan({
      version: "1.2",
      captions: { enabled: false, identity: "anchor" },
      elements: [{ id: "bad", source: "agent", element_id: "click", element_type: "sfx", start: 0, end: 1, sfx_id: "missing", reason: "bad" }],
    }),
  ).toThrow("unknown HyperFrames sfx");
  expect(() =>
    parseEnrichmentPlan({
      version: "1.2",
      captions: { enabled: false, identity: "anchor" },
      elements: [{ id: "bad", source: "agent", element_id: "shimmer-sweep", element_type: "registry_component", start: 0, end: 1, params: { nested: { nope: true } }, reason: "bad" }],
    }),
  ).toThrow("params.nested");
});

test("current enrichment parser output is safe to persist and parse again", () => {
  const first = parseEnrichmentPlan({
    version: "1.2",
    profile: { source_mode: "talking_head_avatar", aspect_ratio: "source", caption_identity: "anchor" },
    captions: { enabled: false, identity: "anchor", emphasis: [] },
    cards: [],
    music: [],
    elements: [],
  });

  expect(first.slots).toBe(undefined);
  expect(parseEnrichmentPlan(JSON.parse(JSON.stringify(first)))).toEqual(first);
});

test("source mode controls enrichment defaults without overriding explicit card choices", () => {
  const screen = parseEnrichmentPlan({
    version: "1.1",
    profile: { source_mode: "screen_recording" },
    captions: { enabled: true, identity: "anchor" },
    cards: [
      { id: "default", start: 0, end: 1, kind: "key_point", title: "Default", reason: "screen safe" },
      { id: "explicit", start: 1, end: 2, kind: "key_point", layout: "stack", style: "whiteboard", frame: "hairline", title: "Explicit", reason: "user approved" },
    ],
    music: [],
  });
  expect(screen.profile.source_mode).toBe("screen_recording");
  expect(screen.profile.layout).toBe("overlay");
  expect(screen.profile.style).toBe("minimal");
  expect(screen.cards[0]?.layout).toBe("overlay");
  expect(screen.cards[0]?.style).toBe("minimal");
  expect(screen.cards[1]?.layout).toBe("stack");
  expect(screen.cards[1]?.style).toBe("whiteboard");
  expect(screen.cards[1]?.frame).toBe("hairline");

  const mixed = parseEnrichmentPlan({ version: "1.1", profile: { source_mode: "mixed" }, captions: { enabled: true, identity: "anchor" }, cards: [], music: [] });
  expect(mixed.profile.layout).toBe("overlay");
  expect(() =>
    parseEnrichmentPlan({
      version: "1.1",
      profile: { source_mode: "screen" },
      captions: { enabled: true, identity: "anchor" },
      cards: [],
      music: [],
    }),
  ).toThrow("profile.source_mode");
});

test("enrichment cards validate normalized target coordinates", () => {
  const plan = parseEnrichmentPlan({
    version: "1.1",
    profile: { source_mode: "screen_recording" },
    captions: { enabled: true, identity: "anchor" },
    cards: [
      {
        id: "focus",
        start: 0,
        end: 1,
        kind: "screenshot_focus",
        title: "按钮位置",
        target_rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.2 },
        anchor_point: { x: 0.44, y: 0.3 },
        reason: "precise screen highlight",
      },
    ],
    music: [],
  });
  expect(plan.cards[0]?.target_rect).toEqual({ x: 0.1, y: 0.2, width: 0.3, height: 0.2 });
  expect(plan.cards[0]?.anchor_point).toEqual({ x: 0.44, y: 0.3 });

  expect(() =>
    parseEnrichmentPlan({
      version: "1.1",
      cards: [{ id: "bad", start: 0, end: 1, kind: "screenshot_focus", title: "Bad", target_rect: { x: -0.1, y: 0, width: 0.2, height: 0.2 }, reason: "bad" }],
      music: [],
    }),
  ).toThrow("target_rect.x");
  expect(() =>
    parseEnrichmentPlan({
      version: "1.1",
      cards: [{ id: "bad", start: 0, end: 1, kind: "screenshot_focus", title: "Bad", target_rect: { x: 0.9, y: 0, width: 0.2, height: 0.2 }, reason: "bad" }],
      music: [],
    }),
  ).toThrow("normalized canvas bounds");
  expect(() =>
    parseEnrichmentPlan({
      version: "1.1",
      cards: [{ id: "bad", start: 0, end: 1, kind: "screenshot_focus", title: "Bad", target_rect: { x: 0, y: 0, width: 0, height: 0.2 }, reason: "bad" }],
      music: [],
    }),
  ).toThrow("greater than 0");
  expect(() =>
    parseEnrichmentPlan({
      version: "1.1",
      cards: [{ id: "bad", start: 0, end: 1, kind: "key_point", title: "Bad", anchor_point: { x: 0.4, y: 1.1 }, reason: "bad" }],
      music: [],
    }),
  ).toThrow("anchor_point.y");
});

test("focus candidate parser accepts source-timeline focus candidates", () => {
  const parseFocusCandidates = requiredArtifactParser("parseFocusCandidates");
  const candidates = parseFocusCandidates(
    {
      version: "1.0",
      source_mode: "screen_recording",
      presentation_intent: "internal_tutorial",
      candidates: [
        {
          id: "focus-candidate-1",
          start: 1.2,
          end: 2.4,
          reason: "speaker points at the pricing button",
          transcript_quote: "click the pricing button",
          semantic_intent: "guide_attention",
          business_role: "operation_step",
          viewer_job: "find the exact UI control",
          visual_gap: "source_has_visible_target",
          recommended_treatment: "source_ui_component",
          element_id: "cinematic-zoom",
          element_type: "registry_block",
          requires_grounding: true,
          asset_id: "optional-asset",
          params: { title: "pricing button" },
        },
      ],
    },
  );

  expect(candidates.candidates[0]?.id).toBe("focus-candidate-1");
  expect(candidates.candidates[0]?.start).toBe(1.2);
  expect(candidates.candidates[0]?.end).toBe(2.4);
  expect(candidates.candidates[0]?.transcript_quote).toBe("click the pricing button");
  expect(candidates.candidates[0]?.semantic_intent).toBe("guide_attention");
  expect(candidates.candidates[0]?.business_role).toBe("operation_step");
  expect(candidates.candidates[0]?.viewer_job).toBe("find the exact UI control");
  expect(candidates.candidates[0]?.visual_gap).toBe("source_has_visible_target");
  expect(candidates.candidates[0]?.recommended_treatment).toBe("source_ui_component");
  expect(candidates.candidates[0]?.requires_grounding).toBe(true);
  expect(candidates.candidates[0]?.asset_id).toBe("optional-asset");
});

test("focus candidate parser rejects invalid semantic intent and timing", () => {
  const parseFocusCandidates = requiredArtifactParser("parseFocusCandidates");
  expect(() =>
    parseFocusCandidates({
      version: "1.0",
      source_mode: "screen_recording",
      presentation_intent: "internal_tutorial",
      candidates: [
        {
          id: "focus-candidate-1",
          start: 1,
          end: 2,
          reason: "bad intent",
          transcript_quote: "click the button",
          semantic_intent: "decorate_screen",
          element_id: "cinematic-zoom",
          element_type: "registry_block",
          requires_grounding: true,
        },
      ],
    }),
  ).toThrow("semantic_intent");
  expect(() =>
    parseFocusCandidates({
      version: "1.0",
      source_mode: "screen_recording",
      presentation_intent: "internal_tutorial",
      candidates: [
        {
          id: "focus-candidate-1",
          start: 1,
          end: 2,
          reason: "bad treatment",
          transcript_quote: "click the button",
          semantic_intent: "guide_attention",
          recommended_treatment: "decorative_picture",
          element_id: "cinematic-zoom",
          element_type: "registry_block",
          requires_grounding: true,
        },
      ],
    }),
  ).toThrow("recommended_treatment");
  expect(() =>
    parseFocusCandidates({
      version: "1.0",
      source_mode: "screen_recording",
      presentation_intent: "internal_tutorial",
      candidates: [
        {
          id: "focus-candidate-1",
          start: 2,
          end: 1,
          reason: "bad timing",
          transcript_quote: "click the button",
          semantic_intent: "guide_attention",
          element_id: "cinematic-zoom",
          element_type: "registry_block",
          requires_grounding: true,
        },
      ],
    }),
  ).toThrow("end must be greater");
});

test("focus frame parser accepts project-relative inspection frames", () => {
  const parseFocusCandidates = requiredArtifactParser("parseFocusCandidates");
  const parseFocusFrames = requiredArtifactParser("parseFocusFrames");
  const candidates = parseFocusCandidates({
    version: "1.0",
    source_mode: "screen_recording",
    presentation_intent: "internal_tutorial",
    candidates: [
      {
        id: "focus-candidate-1",
        start: 1,
        end: 2,
        reason: "needs visual grounding",
        transcript_quote: "click export",
        semantic_intent: "guide_attention",
        element_id: "cinematic-zoom",
        element_type: "registry_block",
        requires_grounding: true,
      },
    ],
  });

  const frames = parseFocusFrames(
    {
      version: "1.0",
      frames: [
        {
          id: "frame-1",
          candidate_id: "focus-candidate-1",
          timeline: "source",
          time_seconds: 1.5,
          source_id: "src-1",
          path: ".inspection/focus/frame-1.jpg",
          width: 1280,
          height: 720,
        },
      ],
    },
  );
  expect(candidates.candidates[0]?.id).toBe("focus-candidate-1");

  expect(frames.frames[0]?.id).toBe("frame-1");
  expect(frames.frames[0]?.candidate_id).toBe("focus-candidate-1");
  expect(frames.frames[0]?.source_id).toBe("src-1");
  expect(frames.frames[0]?.timeline).toBe("source");
  expect(frames.frames[0]?.time_seconds).toBe(1.5);
  expect(frames.frames[0]?.path).toBe(".inspection/focus/frame-1.jpg");
});

test("source frame request parser accepts 1 to 20 ordered frames and URL text", () => {
  const parseSourceFrameRequest = requiredArtifactParser("parseSourceFrameRequest");
  const one = parseSourceFrameRequest({
    version: "1.0",
    frames: [
      {
        id: "source-frame-001",
        source_id: "src-1",
        time_seconds: 1.25,
        segment_id: "segment-1",
        transcript_quote: "  mailto:person@example.com, https://example.com/help, and /Users/private/source.mp4  ",
        reason: "  data:text/plain,x, https:example.com, ../outside, and C:\\secret  ",
      },
    ],
  });
  expect(one.frames[0]?.segment_id).toBe("segment-1");
  expect(one.frames[0]?.transcript_quote).toBe("  mailto:person@example.com, https://example.com/help, and /Users/private/source.mp4  ");
  expect(one.frames[0]?.reason).toBe("  data:text/plain,x, https:example.com, ../outside, and C:\\secret  ");

  const twenty = parseSourceFrameRequest({
    version: "1.0",
    frames: Array.from({ length: 20 }, (_, index) => ({
      id: `source-frame-${index + 1}`,
      source_id: "src-1",
      time_seconds: index,
      transcript_quote: `quote ${index}`,
      reason: `reason ${index}`,
    })),
  });
  expect(twenty.frames.map((frame: { id: string }) => frame.id)).toEqual(Array.from({ length: 20 }, (_, index) => `source-frame-${index + 1}`));
});

test("source frame request parser rejects invalid counts and duplicate ids", () => {
  const parseSourceFrameRequest = requiredArtifactParser("parseSourceFrameRequest");
  const frame = { id: "source-frame-1", source_id: "src-1", time_seconds: 0, transcript_quote: "quote", reason: "reason" };
  expect(() => parseSourceFrameRequest({ version: "1.0", frames: [] })).toThrow("between 1 and 20");
  expect(() => parseSourceFrameRequest({ version: "1.0", frames: Array.from({ length: 21 }, (_, index) => ({ ...frame, id: `frame-${index}` })) })).toThrow(
    "between 1 and 20",
  );
  expect(() => parseSourceFrameRequest({ version: "1.0", frames: [frame, frame] })).toThrow("duplicate source frame request id");
});

test("source frame request parser rejects unknown structured fields", () => {
  const parseSourceFrameRequest = requiredArtifactParser("parseSourceFrameRequest");
  const frame = { id: "source-frame-1", source_id: "src-1", time_seconds: 0, transcript_quote: "quote", reason: "reason" };
  expect(() => parseSourceFrameRequest({ version: "1.0", frames: [frame], provider: "local" })).toThrow("provider is not allowed");
  for (const key of ["path", "url", "absolute_path", "provider", "token"]) {
    expect(() => parseSourceFrameRequest({ version: "1.0", frames: [{ ...frame, [key]: "forbidden" }] })).toThrow(`${key} is not allowed`);
  }
});

test("source frame request parser rejects blank strings and invalid times", () => {
  const parseSourceFrameRequest = requiredArtifactParser("parseSourceFrameRequest");
  const frame = { id: "source-frame-1", source_id: "src-1", time_seconds: 0, segment_id: "segment-1", transcript_quote: "quote", reason: "reason" };
  for (const key of ["id", "source_id", "segment_id", "transcript_quote", "reason"]) {
    expect(() => parseSourceFrameRequest({ version: "1.0", frames: [{ ...frame, [key]: "   " }] })).toThrow("must not be blank");
  }
  expect(() => parseSourceFrameRequest({ version: "1.0", frames: [{ ...frame, time_seconds: -1 }] })).toThrow("non-negative number");
  expect(() => parseSourceFrameRequest({ version: "1.0", frames: [{ ...frame, time_seconds: Number.NaN }] })).toThrow("non-negative number");
});

test("source frame request parser rejects path-like identifiers", () => {
  const parseSourceFrameRequest = requiredArtifactParser("parseSourceFrameRequest");
  const frame = { id: "source-frame-1", source_id: "src-1", time_seconds: 0, segment_id: "segment-1", transcript_quote: "quote", reason: "reason" };
  for (const [key, value] of [
    ["id", "/Users/private/source.mp4"],
    ["source_id", "../outside"],
    ["segment_id", "https://bad.example"],
    ["id", "C:\\secret"],
    ["id", "mailto:private@example.com"],
    ["source_id", "data:text/plain,secret"],
    ["segment_id", "https:example.com"],
    ["id", "  mailto:private@example.com"],
    ["source_id", "data:text/plain,secret  "],
    ["segment_id", "  https:example.com  "],
    ["source_id", "  ../outside  "],
  ]) {
    expect(() => parseSourceFrameRequest({ version: "1.0", frames: [{ ...frame, [key]: value }] })).toThrow("opaque identifier");
  }
});

test("focus frame parser rejects duplicate ids and unsafe frame paths", () => {
  const parseFocusCandidates = requiredArtifactParser("parseFocusCandidates");
  const parseFocusFrames = requiredArtifactParser("parseFocusFrames");
  const candidates = parseFocusCandidates({ version: "1.0", source_mode: "screen_recording", presentation_intent: "internal_tutorial", candidates: [] });

  expect(() =>
    parseFocusFrames({
      version: "1.0",
      frames: [
        { id: "frame-1", candidate_id: "focus-candidate-1", timeline: "source", time_seconds: 1.5, path: ".inspection/focus/frame-1.jpg", width: 1280, height: 720 },
        { id: "frame-1", candidate_id: "focus-candidate-2", timeline: "source", time_seconds: 1.6, path: ".inspection/focus/frame-2.jpg", width: 1280, height: 720 },
      ],
    }),
  ).toThrow("duplicate focus frame id");
  expect(() =>
    parseFocusFrames({
      version: "1.0",
      frames: [{ id: "frame-1", candidate_id: "focus-candidate-1", timeline: "source", time_seconds: 1.5, path: "../frame-1.jpg", width: 1280, height: 720 }],
    }),
  ).toThrow("must not contain");
  expect(candidates.candidates).toEqual([]);
});

test("focus grounding parser accepts candidate-frame target grounding", () => {
  const parseFocusGrounding = requiredArtifactParser("parseFocusGrounding");
  const grounding = parseFocusGrounding({
    version: "1.0",
    groundings: [
      {
        candidate_id: "focus-candidate-1",
        frame_id: "frame-1",
        target_rect: { x: 0.42, y: 0.32, width: 0.14, height: 0.09 },
        anchor_point: { x: 0.49, y: 0.36 },
        evidence_note: "button visible in sampled frame",
        confidence: 0.86,
      },
    ],
  });

  expect(grounding.groundings[0]?.candidate_id).toBe("focus-candidate-1");
  expect(grounding.groundings[0]?.frame_id).toBe("frame-1");
  expect(grounding.groundings[0]?.target_rect).toEqual({ x: 0.42, y: 0.32, width: 0.14, height: 0.09 });
  expect(grounding.groundings[0]?.anchor_point).toEqual({ x: 0.49, y: 0.36 });
});

test("focus grounding parser rejects missing evidence and out-of-bounds targets", () => {
  const parseFocusGrounding = requiredArtifactParser("parseFocusGrounding");
  expect(() =>
    parseFocusGrounding({
      version: "1.0",
      groundings: [{ candidate_id: "focus-candidate-1", frame_id: "frame-1", target_rect: { x: 0.95, y: 0.32, width: 0.14, height: 0.09 }, evidence_note: "bad", confidence: 0.86 }],
    }),
  ).toThrow("normalized canvas bounds");
  expect(() =>
    parseFocusGrounding({
      version: "1.0",
      groundings: [{ candidate_id: "focus-candidate-1", frame_id: "frame-1", target_rect: { x: 0.42, y: 0.32, width: 0.14, height: 0.09 }, confidence: 0.86 }],
    }),
  ).toThrow("evidence_note");
});

test("focus review parser accepts proposed elements for enrichment", () => {
  const parseFocusReview = requiredArtifactParser("parseFocusReview");
  const review = parseFocusReview({
    version: "1.0",
    items: [
      {
        candidate_id: "focus-candidate-1",
        status: "ready",
        frame_paths: [".inspection/focus/frame-1.jpg"],
        warnings: [],
      },
    ],
    proposed_elements: [
      {
        id: "focus-element-1",
        source: "focus-review",
        element_id: "cinematic-zoom",
        element_type: "registry_block",
        start: 1.2,
        end: 2.4,
        target_rect: { x: 0.42, y: 0.32, width: 0.14, height: 0.09 },
        params: { title: "Pricing button", coordinate_source_frame: ".inspection/focus/frame-1.jpg" },
        reason: "guide attention to the grounded UI target",
        approved: true,
      },
    ],
    warnings: [],
  });

  expect(review.proposed_elements[0]?.id).toBe("focus-element-1");
  expect(review.proposed_elements[0]?.element_id).toBe("cinematic-zoom");
  expect(review.proposed_elements[0]?.element_type).toBe("registry_block");
  expect(review.proposed_elements[0]?.target_rect).toEqual({ x: 0.42, y: 0.32, width: 0.14, height: 0.09 });
});

test("focus review parser rejects ungrounded proposed elements", () => {
  const parseFocusReview = requiredArtifactParser("parseFocusReview");
  expect(() =>
    parseFocusReview({
      version: "1.0",
      items: [
        {
          candidate_id: "focus-candidate-1",
          status: "ready",
          frame_paths: [".inspection/focus/frame-1.jpg"],
          warnings: [],
        },
      ],
      proposed_elements: [
        {
          id: "focus-element-1",
          source: "focus-review",
          element_id: "cinematic-zoom",
          element_type: "registry_block",
          start: 1.2,
          end: 2.4,
          reason: "missing target",
        },
      ],
      warnings: [],
    }),
  ).toThrow("target_rect");
});

function requiredArtifactParser(name: string): (...args: unknown[]) => any {
  const parser = (artifacts as Record<string, unknown>)[name];
  expect(typeof parser).toBe("function");
  return parser as (...args: unknown[]) => any;
}
