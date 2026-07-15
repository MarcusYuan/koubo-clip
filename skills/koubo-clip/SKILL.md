---
name: koubo-clip
description: Guide agents through local or detached talking-head video authoring with the koubo-clip CLI. Use when a user provides one or more口播/talking-head videos, or portable source identities without local media bytes, and wants cleanup decisions, captions, visual/audio enrichment, evidence review, a local render, or an immutable render contract for strict execution on another machine.
---

# koubo-clip

Use the CLI as the source of truth. The skill owns the user workflow, transcript/candidate semantic review, proposal and edit decisions, visual/audio choices, evidence interpretation, and final explanation. The CLI owns source identity and materialization, schemas, lineage, portable EDL, caption mapping, resolved storyboard, immutable render contracts, source binding, deterministic rendering, and inspection.

This Skill is an authoring surface. A strict render-contract consumer must not load or run it.

## Command

For normal use, prefer the installed binary:

```bash
koubo-clip ...
```

Inside this repo before internal packaging, use:

```bash
bun packages/cli/src/cli.ts ...
```

## Read References

Read only the references needed for the current stage:

- `references/workflow.md`: normal end-to-end flow from explore to inspect.
- `references/business-planning.md`: single-confirmation proposal options, selection fingerprints, confirmed edit-plan binding, asset requirement slots, and canonical enrichment handoff.
- `references/visual-selection.md`: deciding source highlights, icons, animated icons, UI templates, images, B-roll, generated images, or no visual insert.
- `references/captions.md`: caption rail, source subtitle conflict, emphasis, and readability checks.
- `references/motion-and-sfx.md`: motion rhythm, click cues, transitions, and restrained SFX.
- `references/hyperframes-elements.md`: using `project element-catalog`, `element_type`, `visual_role`, source mode, adapter requirements, and coordinate evidence.
- `references/media-selection.md`: music, internet visual assets, generated images, user assets, and provider boundaries.
- `references/storyboard-qa.md`: using `storyboard.json.qa_checks[]` as both render script and inspection checklist.

## Workflow

1. Run `koubo-clip --version` and `koubo-clip capabilities --json` before relying on a command or schema. Choose exactly one provider mode for the project:
   - Use `platform` when the task comes from Hermes, TaskWorkspace, LocalAgent, workspace refs, asset ids, controlled local artifacts, or the "koubo-clip/口播快剪" employee capability.
   - Use `standalone` for ordinary local CLI use where the user's machine owns provider configuration.
   - If a project already has `project.json`, obey its `provider_execution_mode`; do not mix modes in one project.
2. When resuming an existing project, run `koubo-clip project status <project> --json` first. Follow its blockers, remediation, `next_commands`, source identity/materialization state, and last checkpoint; never infer state by scanning files. For a new project:
   - With local media, run `project create <video...> --project <dir> --provider-mode <mode>`; the CLI writes portable identity and a separate verified materialization.
   - Without local media bytes, run `project create --source-manifest <sources-v2.json> --project <dir> --provider-mode <mode>`. Treat `local_media_ref` as opaque metadata. Never resolve it, echo it, pass it to a filesystem tool, or copy media into the project.
3. If the user or host already has a transcript, put it at `<project>/transcript.json`; otherwise:
   - In `standalone` mode, run `koubo-clip project explore <project> --provider-mode standalone --asr auto`.
   - In `platform` mode, ask the host/platform ASR capability to write `transcript.json` first, then run `koubo-clip project explore <project> --provider-mode platform --asr external`.
4. Before a production proposal, read `transcript.json`, `material-report.md`, and `sources.json`; select 1-20 useful, non-padding source-local observation points and write `source-frame-request.json`.
   - With materialized source bytes, run `project source-frames <project> --provider-mode <mode>`.
   - For detached authoring, ask the authorized host to fulfill the request as an evidence directory, then run `project source-frames <project> --import <evidence-dir> --provider-mode <mode>`. Do not copy or trust external frames yourself; the CLI validates containment, hash, size, JPEG probe, source identity, request id, and source time before publishing canonical evidence.
   - The CLI only validates and extracts JPEGs. If the host has vision capability, review `source-frames.json` and its project-relative images together with ASR facts.
   - If standalone vision is unavailable, continue transcript-only and explicitly state that source-image semantic review was not performed. In platform mode, missing host vision is a host-workflow blocker, not a CLI extraction failure.
5. Run `koubo-clip project review <project> --provider-mode <mode>` and infer the user's business goal from source evidence. Do not jump directly from "做成卖货视频" or similar broad requests to rendering.
6. Write `production-proposal.json` version `1.1` with 2-4 complete options. Each option combines:
   - `business_direction`: direction id/title, suitable use, editing strategy, expected duration, asset style, risks, and tradeoffs.
   - `edit_execution_plan`: objective, target audience, narrative structure, keep/remove/reorder intent, text overlays, visual/music/SFX/image slots, and confirmation summary.
   - `asset_requirements`: the capability slots that would be fulfilled after that option is confirmed.
   - The existing cleanup, subtitle, visual, image, music, SFX, reason, risk, and confirmation fields required by the proposal schema.
   - Do not ask the user to select a direction and then ask again to confirm the execution plan. The options are the single confirmation surface.
   - Before confirmation, write asset intent only: intent, query, provider preference, license/cost/source risk, and reason. Do not write final `asset_id`, local path, provider URL, download URL, absolute path, or raw MCP payload.
7. Run `koubo-clip project proposal <project> --provider-mode <mode> --json`. Show the complete options and preserve `proposal_fingerprint` plus the `option_selection_fingerprints` map. The user confirms exactly once: `OK` selects `recommended_option_id`, or they provide one option id. Material changes require updating and revalidating the proposal before the final selection.
8. Convert the confirmed cleanup choice into `edit-plan.json` with `contract_version:"1.0"`, `confirmed_option_id`, and the matching `proposal_selection_fingerprint`. Do not ask users to edit JSON unless they want to. CLI consumers validate this binding and automatically rebuild a stale EDL when prerequisites are complete.
9. Run `project compile-edl <project>` after the confirmed edit plan. For UI-facing inserts, write `focus-candidates.json`, then run `project focus-candidates`, `project focus-frames`, `project focus-grounding`, and `project focus-review` with the same provider mode. In detached authoring, fulfill focus evidence externally and use `project focus-frames <project> --import <evidence-dir>`; the CLI verifies each output time against the current portable EDL mapping rather than trusting an external source mapping.
10. For approved visual assets, write `visual-request.json`.
   - For each retained request, compare candidates against the viewer job, ASR facts, source-frame evidence, source mode, selected business direction, license/source constraints, and runtime risk. Search order and `recommended` are hints only; neither authorizes acquisition.
   - Write both `selected_candidate_id` and `selection_reason` for every retained request. `reason` explains why the slot exists; `selection_reason` explains why that exact candidate was chosen.
   - In `standalone` mode, run `project visual-catalog` and `project visual-search`, review the returned candidates, write the explicit selection, then run `project visual-acquire` and `project visual-review`.
   - In `platform` mode, call host/platform visual, component, image, or MCP tools first; they must write `visual-candidates.json` with safe project-relative `preview_path` values when previews are needed. Review the candidates, write the explicit selection, and have the host materialize only the selected candidate as a project-local `local_path`. Then run CLI visual commands only as read/import/validate steps with `--provider-mode platform`.
   - `preview_path` is preview-only and never an acquisition source. In platform mode, only the selected candidate's `local_path` can enter acquisition.
   - If the semantic decision is no insert, remove that slot from the final `visual-request.json.requests[]` and retain the reason in business/focus review. If no visual requests remain, skip visual acquire and review.
11. For approved music, write `music-request.json`.
   - In `standalone` mode, run `project music-catalog`, `project music-acquire`, and `project music-review`.
   - In `platform` mode, call the host/platform music capability first; it must land a project-local music file or compatible acquisition artifact. Then run CLI music commands only as import/validate/review steps with `--provider-mode platform`.
12. Write canonical `enrichment-plan.json` with output-timeline timestamps, selected `elements[]`, captions, music, SFX, local asset refs, grounding evidence, and reasons.
   - A simplified platform/legacy handoff may write standalone `asset-usage-plan.json`, then run `project enrich-plan` once to normalize it into canonical enrichment.
   - Do not write new embedded usage plans in `project.json` or `edit-plan.json`. Canonical plus compatibility input, or multiple compatibility inputs, is `ASSET_USAGE_PLAN_CONFLICT`; never merge them.
13. Run `koubo-clip project enrich-plan <project> --provider-mode <mode>` and show `qa_checks[]`; fix missing assets, provenance, runtime dependency, timing, coordinate evidence, or authority conflicts before render.
14. Choose one execution handoff:
   - Local authoring execution: run `project render`, then `project inspect` as before.
   - Distributed execution: run `render-contract export <project> --output <new-bundle-dir>`. The output directory must not exist. Do not write, edit, patch, merge, or reserialize `render-contract.json`; the CLI alone compiles and signs the frozen closure.
15. For distributed execution, transfer the immutable bundle through the platform. The remote machine must use the same compatible Koubo Clip delivery and invoke `render-contract verify`, `bind`, `render`, then `inspect`. The remote executor must not receive or consult transcript, analysis, edit-plan, enrichment-plan, or this Skill.
16. Run `project status --json` again and report the current authoring fingerprint, contract digest or canonical local deliverable, render/inspection fingerprints, removed sections, enrichment choices, grounded evidence, checks, warnings, and skipped or failed stages.
   - For local execution, select the output only through `render-result.json.canonical_output_key`; never guess from a filename.

## Hard Rules

- Explore before asking for final positioning when raw footage is supplied.
- Never hand-write, modify, or repair `render-contract.json`, bindings, strict results, or strict inspection artifacts. Invoke CLI commands and treat digest/schema/runtime failures as blockers.
- Never run this Skill during strict contract consumption. Do not re-analyze source media, regenerate plans, add default edits, rewrite transcript, reselect assets, or repair missing authoring state on the render machine.
- Detached planning may complete while source-byte stages remain blocked. `SOURCE_BINDING_REQUIRED` means only the byte-dependent operation is unavailable; it does not invalidate transcript review, proposal, edit decisions, portable EDL, evidence import, or contract export.
- Broad business goals require 2-4 complete proposal options. For "卖货", "朋友圈咨询", "高级感", "种草", "专业讲解", or "去废话保留卖点", put direction, execution plan, and asset requirements together, then ask for one option confirmation.
- Asset slots come from the confirmed execution plan. Capabilities fulfill slots; they do not decide the creative asset strategy by themselves.
- Never treat text-only transcripts as precise cut timing.
- Treat unvalidated Chinese word-level timing as segment timing; do not use it for frame-precise cuts.
- `production-proposal.json` is a confirmation surface, not the execution source of truth.
- Before user confirmation, `source-frame-request.json`, `source-frames.json`, and `.source-frames/*.jpg` are the only allowed media-evidence exception. They are read-only source-understanding artifacts and do not imply approval.
- Before user confirmation, do not write `edit-plan.json`, `focus-candidates.json`, any `focus-*` execution artifacts, `visual-request.json`, `music-request.json`, `asset-manifest.json`, or `enrichment-plan.json`; do not acquire assets, generate media, or render.
- Empty or no-asset plans must explain why no assets help the viewer job; never claim assets are ready when the request/review/manifest/enrichment artifacts do not exist.
- Prepared assets are not used automatically. If the plan chooses BGM, SFX, icons, SVG/PNG, Lottie, UI handoff, images, or B-roll, canonical `enrichment-plan.json` must contain asset refs, output-timeline timing, usage parameters, and purpose. A standalone `asset-usage-plan.json` is only a one-time normalization input.
- `prepared-assets.json` and `asset-manifest.json` are inventory/validation evidence, not render instructions. Without current canonical enrichment, final render is pure cleanup and must be reported that way.
- In `edit-plan.json`, `action:"cut"` means remove those candidate ranges. Kept source ranges are everything not cut, optionally ordered by `source_order`; do not write cut decisions as if they were keep lists.
- `enrichment-plan.json` uses output-timeline seconds after cleanup, not raw source timestamps.
- Select visuals by viewer job and evidence, not by fixed business keywords.
- Visual search/list is recall, not selection. A candidate's array position or `recommended` flag never grants acquire permission; every retained visual request requires an explicit `selected_candidate_id` and `selection_reason` before acquisition in either provider mode.
- Keep visual meanings separate: request `reason` explains why a visual slot is useful, while `selection_reason` explains why the chosen candidate best fits it.
- Treat `preview_path` as project-local review evidence only. It cannot replace `local_path`, and the CLI must not acquire bytes from it.
- Represent no insert by omitting the slot from final `visual-request.json.requests[]` and recording the reason in business/focus review. Do not invent a no-insert candidate or run visual acquire for an empty request set.
- For screen recordings, use transparent guidance, real frame evidence, and normalized coordinates. Add `params.coordinate_source_frame` for every `target_rect` or `anchor_point`.
- For sourced icons, animated icons, UI templates, stickers, B-roll, or images, use visual acquisition and local project assets. Do not hand-write common SVG/CSS/JS assets.
- Use generated images only when deterministic internet or user-provided assets do not fit, or when the user needs original concept art.
- Use music only after `project music-acquire` in standalone mode, or after platform fulfillment in platform mode. Render consumes only assets referenced by current canonical `enrichment-plan.json` and validated project-local asset records.
- In `platform` mode, never tell the CLI to call Cloudflare Whisper, `whisper-cli`, MiniMax, Freesound, Pixabay, Iconify, Lordicon, URL download, MCP, shadcn, or 21st provider paths. Request host/platform fulfillment, then let CLI validate landed artifacts.
- Treat `PROVIDER_MODE_MISMATCH` and `PLATFORM_PROVIDER_BLOCKED` as actionable host/tool blockers, not as a reason to fall back to standalone provider calls.
- Do not write provider API keys, Bearer tokens, local absolute paths, temporary provider URLs, raw MCP payloads, or unreviewed provider results into render inputs or final artifacts.
- Do not generate TTS, replacement narration, or voice-performance prompts through koubo-clip music commands.
- HyperFrames rendering, `storyboard.json`, allowlisted CDN dependencies, vendored resource installation, SFX manifest, and adapter validation are CLI-owned. Do not hand-write arbitrary HTML/JS/GSAP or external script URLs as stable inputs.
- `storyboard.json.qa_checks[]` is the shared render and QA checklist. Do not create a separate inspection plan.
- Read `source_mode`, `warnings`, `qa_checks`, `inspection_checks`, `inspection_frames`, `element_usage`, `audio_usage`, `block_usage`, and CDN dependency summaries from CLI JSON outputs.
- `artifact-manifest.json` is CLI-owned. Skills, users, and hosts never hand-write it; they use `project status --json` to observe `missing`, `pending_validation`, `current`, `stale`, and `invalid`.
- JSON is the machine contract. Markdown is a rebuildable human view; changing or deleting Markdown must not change business state.
- Do not claim render or inspection happened merely because an MP4, storyboard, report, or Markdown file exists. Require current `render-result.json`, current `inspection.json`, matching hashes/lineage, and no blocker.
- Preserve partial project folders after failure and report the manifest-committed last successful checkpoint; it is not a promise of physical rollback.
