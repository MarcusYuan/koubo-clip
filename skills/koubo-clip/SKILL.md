---
name: koubo-clip
description: Guide agents through local talking-head video cleanup with the koubo-clip CLI. Use when a user provides one or more口播/talking-head videos and wants repeated speech, false starts, filler, silence, waiting gaps, captions, sourced visual assets, music, SFX, or HyperFrames enrichment reviewed and rendered.
---

# koubo-clip

Use the CLI as the source of truth. The skill owns the user workflow, source-frame semantic selection and visual review, provider-mode routing, request specs, proposal writing, and final explanation; the CLI owns media facts, timestamps, validation, deterministic frame extraction, rendering, subtitles, asset checks, focus evidence, and inspection artifacts.

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
- `references/visual-selection.md`: deciding source highlights, icons, animated icons, UI templates, images, B-roll, generated images, or no visual insert.
- `references/captions.md`: caption rail, source subtitle conflict, emphasis, and readability checks.
- `references/motion-and-sfx.md`: motion rhythm, click cues, transitions, and restrained SFX.
- `references/hyperframes-elements.md`: using `project element-catalog`, `element_type`, `visual_role`, source mode, adapter requirements, and coordinate evidence.
- `references/media-selection.md`: music, internet visual assets, generated images, user assets, and provider boundaries.
- `references/storyboard-qa.md`: using `storyboard.json.qa_checks[]` as both render script and inspection checklist.

## Workflow

1. Choose exactly one provider mode for the project:
   - Use `platform` when the task comes from Hermes, TaskWorkspace, LocalAgent, workspace refs, asset ids, controlled local artifacts, or the "koubo-clip/口播快剪" employee capability.
   - Use `standalone` for ordinary local CLI use where the user's machine owns provider configuration.
   - If a project already has `project.json`, obey its `provider_execution_mode`; do not mix modes in one project.
2. Run `koubo-clip doctor --provider-mode <standalone|platform>`.
3. Run `koubo-clip project create <video...> --provider-mode <standalone|platform>`.
4. If the user or host already has a transcript, put it at `<project>/transcript.json`; otherwise:
   - In `standalone` mode, run `koubo-clip project explore <project> --provider-mode standalone --asr auto`.
   - In `platform` mode, ask the host/platform ASR capability to write `transcript.json` first, then run `koubo-clip project explore <project> --provider-mode platform --asr external`.
5. Before business directions or a production proposal, read `transcript.json`, `material-report.md`, and `sources.json`; select 1-20 useful, non-padding source-local observation points, write `source-frame-request.json`, and run `koubo-clip project source-frames <project> --provider-mode <mode>`.
   - The CLI only validates and extracts JPEGs. If the host has vision capability, review `source-frames.json` and its project-relative images together with ASR facts.
   - If standalone vision is unavailable, continue transcript-only and explicitly state that source-image semantic review was not performed. In platform mode, missing host vision is a host-workflow blocker, not a CLI extraction failure.
6. Read `material-report.md`. If the target is unclear, ask what the material should become before planning edits.
7. Run `koubo-clip project review <project> --provider-mode <mode>`.
8. Write `production-proposal.json` from `material-report.md`, `review-package.md/json`, the user goal, optional `element-catalog`, and optional music/visual source facts.
   - Include 2-3 options. Each option must state the publishing goal it fits, why it fits this source material, cleanup strategy, subtitle strategy, visual strategy, image/generated-image intent, music strategy, SFX strategy, risks, and confirmation items.
   - Before confirmation, write asset intent only: intent, query, provider preference, license/cost/source risk, and reason. Do not write final `asset_id`, local path, provider URL, download URL, absolute path, or raw MCP payload.
9. Run `koubo-clip project proposal <project> --provider-mode <mode>` and show `production-proposal.md`: default option, alternatives, proposed cuts, subtitles, visual direction, images, music, SFX, reasons, risks, and what needs confirmation.
10. If the user replies `OK`, use `recommended_option_id`; if they reply with an option id, use that option. If they ask for changes, update the proposal or reflect the change in later artifacts.
11. Convert the confirmed cleanup choice into `edit-plan.json`; do not ask users to edit JSON unless they want to.
12. For UI-facing inserts, write `focus-candidates.json`, then run `project focus-candidates`, `project focus-frames`, `project focus-grounding`, and `project focus-review` with the same provider mode. Focus candidate timing is on the cleaned output timeline; the CLI maps it through the EDL and writes source-local frame evidence.
13. For approved visual assets, write `visual-request.json`.
   - In `standalone` mode, run `project visual-catalog`, `project visual-search`, `project visual-acquire`, and `project visual-review`.
   - In `platform` mode, call host/platform visual, component, image, or MCP tools first; they must write `visual-candidates.json` and project-local/static exports. Then run CLI visual commands only as read/import/validate steps with `--provider-mode platform`.
14. For approved music, write `music-request.json`.
   - In `standalone` mode, run `project music-catalog`, `project music-acquire`, and `project music-review`.
   - In `platform` mode, call the host/platform music capability first; it must land a project-local music file or compatible acquisition artifact. Then run CLI music commands only as import/validate/review steps with `--provider-mode platform`.
15. Write `enrichment-plan.json` with output-timeline timestamps, selected `elements[]`, captions, music, SFX, local `asset_id` refs, grounding evidence, and reasons.
16. Run `koubo-clip project enrich-plan <project> --provider-mode <mode>` and show `qa_checks[]`; fix missing assets, provenance, runtime dependency, timing, or coordinate evidence warnings before render.
17. Run `koubo-clip project render <project> --provider-mode <mode>`.
18. Run `koubo-clip project inspect <project> --provider-mode <mode>`; inspection frames use the final output timeline.
19. Report output paths, removed sections, enrichment choices, provider provenance, grounded evidence, `inspection_checks[]`, sampled frames, warnings, and skipped or failed stages.

## Hard Rules

- Explore before asking for final positioning when raw footage is supplied.
- Never treat text-only transcripts as precise cut timing.
- Treat unvalidated Chinese word-level timing as segment timing; do not use it for frame-precise cuts.
- `production-proposal.json` is a confirmation surface, not the execution source of truth.
- Before user confirmation, `source-frame-request.json`, `source-frames.json`, and `.source-frames/*.jpg` are the only allowed media-evidence exception. They are read-only source-understanding artifacts and do not imply approval.
- Before user confirmation, do not write `edit-plan.json`, `focus-candidates.json`, any `focus-*` execution artifacts, `visual-request.json`, `music-request.json`, `asset-manifest.json`, or `enrichment-plan.json`; do not acquire assets, generate media, or render.
- Empty or no-asset plans must explain why no assets help the viewer job; never claim assets are ready when the request/review/manifest/enrichment artifacts do not exist.
- `enrichment-plan.json` uses output-timeline seconds after cleanup, not raw source timestamps.
- Select visuals by viewer job and evidence, not by fixed business keywords.
- For screen recordings, use transparent guidance, real frame evidence, and normalized coordinates. Add `params.coordinate_source_frame` for every `target_rect` or `anchor_point`.
- For sourced icons, animated icons, UI templates, stickers, B-roll, or images, use visual acquisition and local project assets. Do not hand-write common SVG/CSS/JS assets.
- Use generated images only when deterministic internet or user-provided assets do not fit, or when the user needs original concept art.
- Use music only after `project music-acquire`; render consumes only local music assets listed in `asset-manifest.json`.
- In `platform` mode, never tell the CLI to call Cloudflare Whisper, `whisper-cli`, MiniMax, Freesound, Pixabay, Iconify, Lordicon, URL download, MCP, shadcn, or 21st provider paths. Request host/platform fulfillment, then let CLI validate landed artifacts.
- Treat `PROVIDER_MODE_MISMATCH` and `PLATFORM_PROVIDER_BLOCKED` as actionable host/tool blockers, not as a reason to fall back to standalone provider calls.
- Do not write provider API keys, Bearer tokens, local absolute paths, temporary provider URLs, raw MCP payloads, or unreviewed provider results into render inputs or final artifacts.
- Do not generate TTS, replacement narration, or voice-performance prompts through koubo-clip music commands.
- HyperFrames rendering, `storyboard.json`, allowlisted CDN dependencies, vendored resource installation, SFX manifest, and adapter validation are CLI-owned. Do not hand-write arbitrary HTML/JS/GSAP or external script URLs as stable inputs.
- `storyboard.json.qa_checks[]` is the shared render and QA checklist. Do not create a separate inspection plan.
- Read `source_mode`, `warnings`, `qa_checks`, `inspection_checks`, `inspection_frames`, `element_usage`, `block_usage`, and CDN dependency summaries from CLI JSON outputs.
- Do not claim render or inspection happened unless the command ran and produced artifacts.
- Preserve partial project folders after failure and report the last successful stage.
