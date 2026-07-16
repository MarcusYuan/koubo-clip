# Business Planning

Use this reference after `project explore` and `project review`, before asset preparation or render. It explains authoring decisions; the CLI owns every JSON structure.

## Contract First

Before writing the proposal, run:

```bash
koubo-clip artifact contract production-proposal --json
```

Fill the returned current template and obey its schema. Do not use this reference, repository source, TypeScript types, test fixtures, or repeated validator failures as a substitute for the contract. The current proposal version is `2.0`.

Use the same rule for every later Agent/Host-authored artifact:

```bash
koubo-clip artifact contract <artifact-id> --json
```

## One Confirmation

For broad goals such as "做成卖货视频", "发朋友圈吸引咨询", "强化高级感", "种草", "专业讲解", or "去废话保留卖点", create 2-4 complete options in one proposal. Do not ask the user to choose a direction and then confirm its execution plan separately.

Each option combines:

- `business_direction`: who it serves, where it will be published, the editorial angle, expected duration/style, tradeoffs, and risks;
- `edit_execution_plan`: objective, audience, narrative, keep/remove/reorder intent, text overlays, and the confirmation summary;
- `asset_requirements`: the only authority for visual, image, music, and SFX capability slots;
- the cleanup, subtitle, visual, image, music, SFX, reason, risk, and confirmation decisions required by the current CLI contract.

The option `id` is its only identity. Do not add `business_direction.direction_id` or `option.recommended`. Use top-level `recommended_option_id` as the only recommendation authority. Do not duplicate asset slots inside `edit_execution_plan`.

Common option concepts include:

- sales conversion: short hook, dense selling points, clear CTA, restrained supporting assets;
- authentic recommendation: preserve natural speech, fewer decorative assets, prioritize trust;
- professional explainer: structured reasoning, clear terminology, proof-oriented captions;
- tutorial demo: step ordering, transparent UI focus, readable source interaction.

These are creative directions, not fixed enum values. Use IDs and values allowed by the fetched contract.

## Evidence And Intent

Use transcript facts, material report, review candidate IDs, source-frame evidence, user goal, source mode, and presentation intent. Do not claim facts unsupported by those inputs.

Before confirmation, describe asset intent only: purpose, search/generation intent, provider preference, license/cost/source risk, and reason. Do not write final asset IDs, paths, provider/download URLs, absolute paths, raw MCP payloads, or output-timeline coordinates that have not been established.

`remove_segments[].candidate_id` must refer to current review candidates. In the confirmed edit plan, `action:"cut"` means delete that candidate range; it is not a keep-list.

If an option needs no assets, say why cleanup, source footage, or captions already serve the viewer job.

## Validate And Bind

Run `project proposal --json` after writing the complete proposal. If it fails, address the complete bounded `issues[]` set together; do not enter a one-field guessing loop.

The command returns:

- `proposal_fingerprint`;
- `option_selection_fingerprints`, keyed by option ID;
- `recommended_option_id`.

The user confirms exactly once. `OK` selects `recommended_option_id`; an explicit option ID selects that option. A material change requires updating and revalidating the proposal before the final selection.

After confirmation, fetch the edit-plan contract, then copy the selected option ID and exact returned selection fingerprint into the cleanup plan. The CLI recomputes that projection before compiling the EDL. Changing the selected option makes downstream artifacts stale; changing an unselected option does not.

## Asset Fulfillment And Enrichment

Capabilities fulfill only the confirmed option's `asset_requirements`; they do not invent or change the creative strategy. `prepared-assets.json` and `asset-manifest.json` prove inventory or validated bytes, not final usage.

Before writing final visual/audio usage, run:

```bash
koubo-clip artifact contract enrichment-plan --json
```

Write the unique current `enrichment-plan.json` version `2.0` as `profile + elements + audio`:

- express caption styling with `caption_identity`; CLI maps final cues from transcript and EDL;
- represent sourced and generated visuals as `visual_asset`, distinguished by asset provenance;
- put BGM in `audio.music[]` and SFX in `audio.sfx[]`;
- use output-timeline timing and current project-local asset records.

Do not write cards, slots, top-level captions/music, `generated_asset`, or an `sfx` element. Do not translate or repair an old shape.

A simplified platform handoff may use the current standalone `asset-usage-plan.json` contract and then run `project enrich-plan` once. Embedded `project.json.asset_usage_plan` and `edit-plan.json.asset_usage_plan` are invalid. Render consumes only current canonical enrichment; canonical plus handoff input is `ASSET_USAGE_PLAN_CONFLICT`.

## Resume And Completion

On resume, run `koubo-clip capabilities --json` and `koubo-clip project status <project> --json`. Do not scan filenames or infer state from Markdown, a storyboard, or an MP4. `artifact-manifest.json` is CLI-owned.

Render success requires current `render-result.json`; inspection success requires current `inspection.json` bound to that render fingerprint. `report.md` is a rebuildable human view.

## Hermes Boundary

Koubo Clip defines the editing method and contracts. Hermes owns orchestration, TaskWorkspace, capabilities, LocalAgent, guardrails, and provider calls. In platform mode, ask the host to fulfill provider work and let the CLI validate landed project artifacts; do not make Koubo Clip call platform-private providers.
