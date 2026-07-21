# Workflow

Use this file for the normal project flow. The CLI is the execution surface; this skill is the planning and review surface.

Before starting or resuming, run `koubo-clip --version` and `koubo-clip capabilities --json`. For an existing project, run `koubo-clip project status <project> --json` and follow its blockers, remediation, and `next_commands`; do not recover by scanning filenames. Before writing any external artifact, fetch its unique current contract with `koubo-clip artifact contract <artifact-id> --json`. The CLI contract supplies structure; this reference supplies authoring judgment.

## Stages

1. Create and explore the project.
   - Use a three-way target check before creating anything: missing target -> create; existing valid project -> run status and resume; existing invalid target -> blocker. Never precreate the project target for `project create`, keep any host seed source manifest outside the project target, and never retry with a `-v2`/`-v3` parallel project.
   - Choose `standalone` or `platform` once, then pass the same `--provider-mode` to project commands.
   - Run `project create --provider-mode <mode>`.
   - In `standalone` mode, run `project explore --asr auto` unless a transcript already exists.
   - In `platform` mode, the host/platform ASR capability must write `transcript.json`; then run `project explore --asr external --provider-mode platform`.
   - Read `material-report.md` before asking final positioning questions.

2. Collect source-frame evidence before business planning.
   - Read `transcript.json`, `material-report.md`, and the CLI-owned project `sources.json`.
   - Select 1-20 source-local times that answer useful visual questions; prefer coverage over duplicates and do not pad the request to reach the limit.
   - Write `source-frame-request.json` and run `project source-frames --provider-mode <mode>`. Read `source-frames.json`; access the corresponding JPEGs through a public evidence ref, authorized host staging, or the platform's file-reading interface. In platform mode, do not assume workspace tools can read `.source-frames/*` and do not hard-code a host-private evidence path.
   - The CLI extracts frames only. When host vision is available, combine visual observations with ASR facts. Without standalone vision, continue transcript-only but mark the visual check as not performed; without platform vision, report a host-workflow blocker.

3. Review cleanup candidates.
   - Run `project review`.
   - Use `review-package.json/md` candidate ids for every proposed cut.
   - Never make precise cuts from transcript text alone.

4. Build one user-facing proposal with 2-4 complete options.
   - Run `koubo-clip artifact contract production-proposal --json` and fill its complete template. Do not reconstruct required fields or enums from this reference. The current proposal contract is `3.0`.
   - For broad goals such as "卖货视频", "朋友圈吸引咨询", "高级感", "种草", "专业讲解", or "去废话保留卖点", each `production-proposal.json.options[]` item must combine `business_direction`, `edit_execution_plan`, and `asset_requirements`.
   - The option `id` is the only direction identity; do not add `business_direction.direction_id` or `option.recommended`.
   - `edit_execution_plan` contains execution intent and confirmation summary, never asset slots.
   - `asset_requirements` is the only authority for visual, image, music, and SFX slots; provider capabilities fulfill them only after confirmation.
   - For every `candidate_cleanup` option, ensure each text overlay fits one continuous retained range after the selected cuts. Split an overlay along retained subranges before validation when it crosses a deletion boundary.
   - Do not ask the user to choose a direction and then ask again to confirm its execution plan.

5. Validate the proposal and ask for one confirmation.
   - Write `production-proposal.json` version `3.0` and run `project proposal --json`. If it returns multiple `issues[]`, repair the complete set together and rerun; do not fix one conflict at a time.
   - Show the recommended option and alternatives, including each option's direction, execution plan, asset slots, risks, and confirmation items.
   - Only after success, preserve the returned `proposal_fingerprint` and `option_selection_fingerprints` map and ask for confirmation.
   - `OK` confirms `recommended_option_id`; an explicit option id confirms that option. After confirmation, do not modify executable proposal content or replace the selection fingerprint. Any material change requires updating and validating the proposal, then asking for confirmation again.
   - The selected option fingerprint stays bound downstream: `edit-plan.json` must match the confirmed cleanup set, and `enrichment-plan.json` may only use the confirmed option's asset requirements and subtitles/visual/music/SFX choices. The confirmed option's `duration_target`, ordered `timeline`, and `text_overlays` are the executable parts of the proposal, not just display metadata.
   - Do not acquire assets, generate images, or render before the user confirms the proposal.

6. Write execution artifacts after confirmation.
   - Write `edit-plan.json` with `contract_version:"1.0"`, `confirmed_option_id`, and the matching `proposal_selection_fingerprint`; this is the only cleanup decision source.
   - `focus-candidates.json` and grounding artifacts for UI-facing inserts. Candidate timing is on the cleaned output timeline; `project focus-frames` maps it through the EDL and records source-local evidence.
   - `visual-request.json` and visual review artifacts for sourced visuals. Every retained request must have an explicit `selected_candidate_id` and `selection_reason` after candidate review; `recommended` and candidate order are hints only.
   - `music-request.json` and music review artifacts for music.
   - CLI-generated `asset-manifest.json` for validated local files only.
   - Fetch the enrichment-plan contract, then write `enrichment-plan.json` version `2.0` as `profile + elements + audio`; it is the only canonical final visual/audio usage plan.
   - Use `caption_identity` for caption styling, `visual_asset` for all acquired or generated visuals, `audio.music[]` for BGM, and `audio.sfx[]` for SFX. Cards, slots, top-level captions/music, `generated_asset`, and element-level SFX are invalid.
   - A simplified platform handoff may write standalone `asset-usage-plan.json`, then run `project enrich-plan` to normalize it once. Do not embed new usage plans in `project.json` or `edit-plan.json`, and never let render merge multiple sources.
   - In `platform` mode, `music-request.json` and `visual-request.json` are request specs for host/platform tools. The CLI must only see fulfilled, project-local assets, normalized candidates, or stable workspace refs. A visual `preview_path` is review-only; the host materializes only the selected candidate to `local_path` before acquire.
   - In `standalone` mode, run visual search first, compare the candidates, write the explicit selection, and only then acquire. Provider search does not choose on the agent's behalf.
   - Compare visual candidates using the viewer job, ASR facts, source-frame evidence, source mode, selected business direction, license/source constraints, and runtime risk. `reason` explains the slot; `selection_reason` explains the exact choice.
   - For a no-insert decision, remove the slot from final `visual-request.json.requests[]` and retain its rationale in business/focus review. If the request set is empty, skip visual acquire and review.
   - A prepared asset list is not a render instruction. If using BGM, SFX, icons, SVG/PNG, Lottie, or UI handoff exports, put exactly where, how, and why they enter the output timeline into canonical enrichment, directly or through the one-time handoff input.
   - A canonical plan plus handoff input is `ASSET_USAGE_PLAN_CONFLICT`; fix the source conflict rather than merging.
   - EDL consumers validate lineage. When authoritative prerequisites are complete, a stale EDL is automatically rebuilt by the same deterministic compiler.

7. Validate, render, and inspect.
   - Run `project enrich-plan` and show planned `qa_checks[]`.
   - Run `project render`.
   - Treat only current `render-result.json` as render success; its `canonical_output_key` selects the deliverable and its `inputs[]` records exact consumed artifacts.
   - Run `project inspect` and review current `inspection.json` plus `inspection_checks[]`; sampled inspection frames use the final output timeline. If inspection reports blockers, the structured result still exists but the command is fail-closed and does not count as accepted.
   - Report the canonical deliverable, render/inspection fingerprints, artifact paths, and any warnings that remain. `report.md` is a rebuildable human view, not machine state.

## Confirmation Rule

The proposal can describe desired images, music, UI motion, SFX, and visual assets, but it must not pretend those files already exist. All direction and execution alternatives live in the same proposal; the user confirms one option exactly once. Final asset ids and output timeline coordinates belong in the execution artifacts after confirmation. `source-frame-request.json`, `source-frames.json`, and CLI-managed source-frame JPEGs are the only pre-confirmation media-evidence exception: they describe the source, not an approved edit or render plan. Platform hosts read those JPEGs only through an authorized public evidence surface.

## Direction And Slot Contract

Use the current CLI contract rather than a partial shape in this reference. `business_direction` explains the option, `edit_execution_plan` explains how it will be edited, and `asset_requirements` is the sole post-confirmation capability request layer. Do not duplicate its slots under the execution plan.

## Production Proposal Contract

`production-proposal.json` is the confirmation surface and the execution source of truth for the confirmed option. It is not the render plan.

- Write 2-4 options, not a single plan.
- For each option, cover: publishing goal, why it fits this material, cleanup strategy, subtitle strategy, visual strategy, image/generated-image intent, music strategy, SFX strategy, risks, and confirmation items.
- Before confirmation, write only asset intent: intent, query, provider preference, license/cost/source risk, and reason.
- Before confirmation, do not write final `asset_id`, local path, provider URL, download URL, absolute path, raw MCP payload, `edit-plan.json`, `focus-candidates.json`, other `focus-*` execution artifacts, `visual-request.json`, `music-request.json`, `asset-manifest.json`, `enrichment-plan.json`, or render artifacts. The source-frame evidence exception above remains allowed.
- If an option uses no assets, state why the source, captions, or cleanup already serve the viewer job.

## Example

User goal: "帮我做成卖货视频". Source: screen recording plus product-demo speech.

Proposal options, each with its own execution plan and asset requirements:

- `sales-conversion`: strong sales version. Fast cleanup, denser payoff subtitles, feature icons for call/navigation/payment-like selling points, light short-form music with ducking, and restrained click SFX. Use when the publishing goal is conversion. Risk: icons/music need post-confirm fulfillment and license review.
- `authentic-review`: realistic seeding version. Keep more natural speech, use anchor captions plus a few key-point lower thirds, no music by default, and only source UI highlights. Use when credibility matters more than packaging. Reason for no extra assets: decoration would reduce trust and can hide UI.
- `tutorial-demo`: tutorial explainer version. Organize around steps, use transparent UI focus/callouts, step labels, and maybe one navigation/function icon. Use when the viewer must learn the workflow. Risk: screen coordinates need `focus-frames` and `focus-grounding`.

After `project proposal --json`, the user confirms `sales-conversion` once. Copy its returned selection fingerprint into the confirmed edit plan, then ask host/platform capabilities to fulfill the confirmed option's `asset_requirements`.

Convert the confirmed option into authoring artifacts: `edit-plan.json` from review candidate ids; `focus-candidates.json` and `focus-grounding.json` for UI moments; `visual-request.json` for approved icons/Lottie/UI/image/B-roll intents; `music-request.json` for approved BGM; and canonical `enrichment-plan.json` using output-timeline timings. Use supported CLI commands to produce `focus-frames.json`, `focus-review.json`, acquisition results, and CLI-owned `asset-manifest.json`.

In platform mode, a standalone `asset-usage-plan.json` is the only new shortcut. `project enrich-plan` normalizes it into canonical enrichment before render. `prepared-assets.json` is only an inventory, and neither it nor `asset-manifest.json` is render source of truth.

## Platform Blockers

If the CLI returns `PROVIDER_MODE_MISMATCH`, keep the project mode and rerun with the matching `--provider-mode`, or create a new project. If it returns `PLATFORM_PROVIDER_BLOCKED`, inspect whether `visual-request.json` lacks an explicit selection/reason or `visual-candidates.json` lacks the selected project-local materialization, then ask the host/platform capability to fulfill the named artifact. For state or lineage blockers, trust `project status --json` remediation. Do not retry by switching to standalone or by passing provider URLs, API keys, raw MCP payloads, or absolute local paths into render artifacts. Missing platform vision is reported by the host workflow after source-frame extraction; `project source-frames` itself is local and does not require vision/provider access.
