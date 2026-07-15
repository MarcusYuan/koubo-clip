# Business Planning Contract

Use this reference after `project explore` and `project review`, before asset preparation or render. The goal is to put business direction, edit execution, and asset requirements into one proposal option so the user confirms exactly once.

## Flow

```text
ASR transcript + material report + user goal + metadata
  -> production-proposal.json options[2-4]
       each option = business_direction + edit_execution_plan + asset_requirements
  -> project proposal returns option_selection_fingerprints
  -> user confirms recommended option or one option id exactly once
  -> confirmed edit-plan.json
  -> standalone CLI or platform/host fulfills selected assets
  -> enrichment-plan.json
  -> render
```

Do not ask the user to choose a direction and then ask again to confirm its execution plan. Do not skip directly from a broad business goal to `edit-plan.json`, media generation, or render.

## Proposal Options

For requests like "做成卖货视频", "发朋友圈吸引咨询", "强化高级感", "种草", "专业讲解", or "去废话保留卖点", write 2-4 options into one `production-proposal.json`. Every option combines the direction, the execution plan, and the asset slots that would be fulfilled after confirmation:

```json
{
  "version": "1.1",
  "goal_summary": "做成能引导咨询或下单的卖货短视频",
  "recommended_option_id": "sales_conversion",
  "options": [
    {
      "id": "sales_conversion",
      "label": "强卖货转化版",
      "business_direction": {
        "direction_id": "sales_conversion",
        "title": "强卖货转化版",
        "suitable_for": "投放、私域成交、直播间/商品页引流",
        "editing_strategy": "前3秒保留结果承诺；删除犹豫、重复和弱铺垫；保留核心卖点和行动指令。",
        "expected_duration": "25-45s",
        "asset_style": "强字幕、少量功能图标、克制 SFX、低音量 BGM",
        "risks": ["销售感更强，真实感会下降"]
      },
      "edit_execution_plan": {},
      "asset_requirements": {
        "visual_asset_slots": [],
        "music_slots": [],
        "sfx_slots": [],
        "image_slots": []
      }
    }
  ]
}
```

The omitted fields in this compact example still follow the proposal schema. `business_direction.direction_id` must match the option `id`. The option's existing cleanup, subtitle, visual, image, music, SFX, risk, and confirmation fields stay part of the same confirmation surface.

Common option ids:

- `sales_conversion`: strong selling and CTA.
- `product_seeding`: softer short-video/social recommendation.
- `professional_explainer`: authority, clarity, and trust.
- `short_hook`: short punchy platform version.

## Execution Plan

Each option embeds its own confirmable `edit_execution_plan` before the user chooses:

```json
{
  "edit_execution_plan": {
    "objective": "做成能引导咨询/下单的卖货短视频",
    "target_audience": "对蓝牙耳机通话、便捷拨号感兴趣的潜在用户",
    "final_duration": "30-40s",
    "narrative_structure": [
      { "beat": "hook", "purpose": "先给功能结果", "source_hint": "0.0-4.0" },
      { "beat": "proof", "purpose": "保留演示或讲解证据", "source_hint": "4.0-20.0" },
      { "beat": "cta", "purpose": "引导咨询/购买", "source_hint": "尾段或补字幕" }
    ],
    "keep_segments": [
      { "source_id": "src-001", "start": 0.6, "end": 8.4, "reason": "包含核心卖点" }
    ],
    "remove_segments": [
      { "candidate_id": "c-002-filler", "reason": "口头禅削弱节奏" }
    ],
    "reorder_segments": [
      { "from": "功能演示段", "to": "开头hook后", "reason": "先证明卖点" }
    ],
    "text_overlays": [
      { "start": 0.4, "end": 3.0, "text": "一键拨号，通话更省心", "purpose": "强化卖点" }
    ],
    "visual_asset_slots": [],
    "music_slots": [],
    "sfx_slots": [],
    "image_slots": [],
    "user_confirmation_summary": "确认后会删除口头禅和等待段，保留核心卖点，加入少量图标、BGM和提示音。"
  }
}
```

`remove_segments[].candidate_id` maps to `review-package.json` candidates. In `edit-plan.json`, `action:"cut"` means delete the candidate range; it is not a keep-list.

## Asset Requirement Slots

Each option also embeds its own `asset_requirements`. Slots describe what would be needed if that option is confirmed. Capabilities fulfill slots only after confirmation; they do not invent the creative strategy.

```json
{
  "asset_requirements": {
    "visual_asset_slots": [
      {
        "slot_id": "icon_bluetooth_hook",
        "kind": "visual_asset",
        "purpose": "强化蓝牙耳机产品属性",
        "query": "bluetooth headset icon simple white line",
        "required": false,
        "suggested_time": 0.6,
        "duration_hint": 3.4,
        "placement_hint": "top-right small",
        "provider_hint": "Iconify or Lordicon"
      }
    ],
    "music_slots": [
      {
        "slot_id": "bgm_sales_light",
        "kind": "music",
        "purpose": "增强节奏但不压过人声",
        "query": "light tech upbeat background no vocals",
        "required": false,
        "suggested_time": 0,
        "duration_hint": "full_output",
        "placement_hint": "under voice, ducked",
        "provider_hint": "media.music_prepare"
      }
    ],
    "sfx_slots": [
      {
        "slot_id": "sfx_click_feature",
        "kind": "sfx",
        "purpose": "功能点出现时给轻提示",
        "query": "soft UI click",
        "required": false,
        "suggested_time": 13.0,
        "duration_hint": 0.2,
        "placement_hint": "mix under speech",
        "provider_hint": "media.music_prepare"
      }
    ],
    "image_slots": [
      {
        "slot_id": "cover_product_scene",
        "kind": "image",
        "purpose": "朋友圈封面或原创场景图",
        "prompt": "premium lifestyle product image for wireless headset calling",
        "required": false,
        "suggested_time": "cover",
        "duration_hint": null,
        "placement_hint": "cover or intro card",
        "provider_hint": "content.image_generate"
      }
    ]
  }
}
```

Kinds:

- `visual_asset`: icons, animated icons, UI components, Lottie, dotLottie, SVG, PNG UI handoff, stickers, templates. Do not route these to image generation first.
- `music`: BGM/underscore.
- `sfx`: click, transition, notification, button, payoff cues.
- `image`: original generated scene image, product image, cover image, concept B-roll illustration.

If a slot is not needed, omit it or set `required:false` and explain why no asset helps the viewer job.

## One Confirmation And Binding

Run `project proposal --json` after writing the complete proposal. The command validates it and returns:

- `proposal_fingerprint`
- `option_selection_fingerprints`, keyed by option id
- `recommended_option_id`

The user confirms exactly once. `OK` selects `recommended_option_id`; an explicit option id selects that option. If the user requests a material change, update and revalidate the proposal before asking for the final selection.

After confirmation, write the selected binding into the cleanup plan:

```json
{
  "contract_version": "1.0",
  "confirmed_option_id": "sales_conversion",
  "proposal_selection_fingerprint": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "decisions": []
}
```

The all-`a` SHA-256 value is a schema-valid placeholder for this example; replace it with the exact fingerprint returned for `sales_conversion`.

The CLI recomputes the selected option projection before compiling the EDL. A change to the selected option makes the edit plan and downstream artifacts stale; changing an unselected option does not. The EDL is a CLI-derived checkpoint: every consumer validates its input lineage and automatically rebuilds a stale EDL when the authoritative prerequisites are complete.

## Asset Usage Plan Handoff

`prepared-assets.json` is only an inventory. It proves files exist; it does not place them in the final video.

After standalone acquisition or Hermes/platform fulfillment completes the selected slots, the normal workflow writes canonical `enrichment-plan.json`.

For a simplified platform handoff or legacy migration, write a standalone `asset-usage-plan.json` command input and run `project enrich-plan`. The CLI validates and normalizes the unique source into `enrichment-plan.json`; render never consumes the compatibility input directly. Legacy embedded `project.json.asset_usage_plan` and `edit-plan.json.asset_usage_plan` are migration inputs only.

Minimal platform shortcut:

```json
{
  "music": [
      {
        "asset_ref": "assets/koubo-clip/bgm.wav",
        "start": 0,
        "end": 36.0,
        "volume": 0.16,
        "duck_original_audio": true,
        "fade_in": 0.4,
        "fade_out": 0.8,
        "purpose": "增强卖货节奏但不压过人声"
      }
  ],
  "sfx": [
      {
        "asset_ref": "assets/koubo-clip/sfx-click.wav",
        "time": 13.0,
        "duration": 0.2,
        "volume": 0.35,
        "purpose": "功能点出现时给轻提示"
      }
  ],
  "visual_assets": [
      {
        "asset_ref": "assets/koubo-clip/bluetooth-icon.png",
        "start": 0.6,
        "end": 4.0,
        "position": "top-right",
        "size": "small",
        "animation": "fade-in",
        "asset_type": "icon",
        "purpose": "强化蓝牙耳机产品属性"
      }
  ]
}
```

Rules:

- `asset_ref` must be workspace/project-relative. No absolute paths, URLs, `file://`, tokens, or raw provider payloads.
- Times are output timeline seconds after cuts/reorder, not raw source timestamps.
- A canonical `enrichment-plan.json` together with any standalone or legacy usage source is a conflict. Two compatibility sources are also a conflict. Do not merge them.
- Render consumes only the current canonical `enrichment-plan.json`. If no enrichment plan is written, render is pure cleanup and must be reported as `enrichment_applied:false`.
- Missing files or unsupported formats are blockers, not silent fallback.

`prepared-assets.json` and `asset-manifest.json` prove inventory or validated bytes; neither decides final usage. Only canonical enrichment decides which assets enter the video.

## Resume And Completion

On resume, run `koubo-clip capabilities --json` and `koubo-clip project status <project> --json`. Do not scan filenames or infer state from Markdown, an old storyboard, or an MP4. `artifact-manifest.json` is CLI-owned; skills and hosts never write it.

Render success is recorded in current `render-result.json`, whose `canonical_output_key` selects the deliverable and whose `inputs[]` lists the exact consumed artifacts. Inspection success is recorded in current `inspection.json` bound to that render fingerprint. `report.md` is a rebuildable human view and does not block machine completion when `inspection.json` remains current.

## Hermes Boundary

koubo-clip skills define editing method and contracts. Hermes owns orchestration, TaskWorkspace, capabilities, LocalAgent, guardrails, and provider calls. koubo-clip CLI renders only from landed project artifacts.

In `platform` mode, do not ask koubo-clip CLI to call Whisper, image generation, MiniMax, Freesound, Iconify, Lordicon, shadcn, 21st, URL download, or MCP providers.
