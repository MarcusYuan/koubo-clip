---
name: koubo-clip
description: Guide agents through local talking-head video cleanup with the koubo-clip CLI. Use when a user provides one or more口播/talking-head videos and wants repeated speech, false starts, filler, silence, waiting gaps, captions, sourced visual assets, music, SFX, or HyperFrames enrichment reviewed and rendered.
---

# koubo-clip

Use the CLI as the source of truth. The skill owns the user workflow, semantic review, proposal writing, and final explanation; the CLI owns media facts, timestamps, validation, rendering, subtitles, asset checks, focus evidence, and inspection artifacts.

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

1. Run `koubo-clip doctor`.
2. Run `koubo-clip project create <video...>`.
3. If the user or host already has a transcript, put it at `<project>/transcript.json`; otherwise run `koubo-clip project explore <project> --asr auto`.
4. Read `material-report.md`. If the target is unclear, ask what the material should become before planning edits.
5. Run `koubo-clip project review <project>`.
6. Write `production-proposal.json` from `material-report.md`, `review-package.md/json`, the user goal, optional `element-catalog`, and optional music/visual source facts.
7. Run `koubo-clip project proposal <project>` and show `production-proposal.md`: default option, alternatives, proposed cuts, subtitles, visual direction, images, music, SFX, reasons, risks, and what needs confirmation.
8. If the user replies `OK`, use `recommended_option_id`; if they reply with an option id, use that option. If they ask for changes, update the proposal or reflect the change in later artifacts.
9. Convert the confirmed cleanup choice into `edit-plan.json`; do not ask users to edit JSON unless they want to.
10. For UI-facing inserts, write `focus-candidates.json`, then run `project focus-candidates`, `project focus-frames`, `project focus-grounding`, and `project focus-review`.
11. For approved visual assets, write `visual-request.json`, then run `project visual-catalog`, `project visual-search`, `project visual-acquire`, and `project visual-review`.
12. For approved music, run `project music-catalog`, write `music-request.json`, then run `project music-acquire` and `project music-review`.
13. Write `enrichment-plan.json` with output-timeline timestamps, selected `elements[]`, captions, music, SFX, local `asset_id` refs, grounding evidence, and reasons.
14. Run `koubo-clip project enrich-plan <project>` and show `qa_checks[]`; fix missing assets, provenance, runtime dependency, timing, or coordinate evidence warnings before render.
15. Run `koubo-clip project render <project>`.
16. Run `koubo-clip project inspect <project>`.
17. Report output paths, removed sections, enrichment choices, provider provenance, grounded evidence, `inspection_checks[]`, sampled frames, warnings, and skipped or failed stages.

## Hard Rules

- Explore before asking for final positioning when raw footage is supplied.
- Never treat text-only transcripts as precise cut timing.
- Treat unvalidated Chinese word-level timing as segment timing; do not use it for frame-precise cuts.
- `production-proposal.json` is a confirmation surface, not the execution source of truth.
- `enrichment-plan.json` uses output-timeline seconds after cleanup, not raw source timestamps.
- Select visuals by viewer job and evidence, not by fixed business keywords.
- For screen recordings, use transparent guidance, real frame evidence, and normalized coordinates. Add `params.coordinate_source_frame` for every `target_rect` or `anchor_point`.
- For sourced icons, animated icons, UI templates, stickers, B-roll, or images, use visual acquisition and local project assets. Do not hand-write common SVG/CSS/JS assets.
- Use generated images only when deterministic internet or user-provided assets do not fit, or when the user needs original concept art.
- Use music only after `project music-acquire`; render consumes only local music assets listed in `asset-manifest.json`.
- Do not generate TTS, replacement narration, or voice-performance prompts through koubo-clip music commands.
- HyperFrames rendering, `storyboard.json`, allowlisted CDN dependencies, vendored resource installation, SFX manifest, and adapter validation are CLI-owned. Do not hand-write arbitrary HTML/JS/GSAP or external script URLs as stable inputs.
- `storyboard.json.qa_checks[]` is the shared render and QA checklist. Do not create a separate inspection plan.
- Read `source_mode`, `warnings`, `qa_checks`, `inspection_checks`, `inspection_frames`, `element_usage`, `block_usage`, and CDN dependency summaries from CLI JSON outputs.
- Do not claim render or inspection happened unless the command ran and produced artifacts.
- Preserve partial project folders after failure and report the last successful stage.
