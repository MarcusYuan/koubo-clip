# Storyboard QA

Use this file before render and after inspect.

## Single Checklist

`storyboard.json.qa_checks[]` is both:

- the render script checklist
- the inspection checklist

Do not create a separate inspection plan that can drift from render behavior.

## Proposal Consistency

If the confirmed proposal selected BGM, SFX, icons, Lottie/dotLottie, UI handoff, image, B-roll, or generated-image work, the execution stage must include the matching request/review/manifest/enrichment artifacts and QA checks before render.

If the confirmed proposal selected no assets, the proposal or review surface must explain why. Do not report "assets ready" for an empty plan.

## Before Render

Run `project enrich-plan` and show `qa_checks[]`:

- id
- source element id
- kind
- expected viewer job
- timing
- asset provenance
- coordinate evidence
- warnings or blockers

Fix blockers before render.

Render consumes only current canonical `enrichment-plan.json`. If the project has a standalone `asset-usage-plan.json` handoff input, run `project enrich-plan` to normalize it first; do not pass it directly to render or merge it at runtime. Embedded usage fields are invalid.

## After Render

Run `project inspect` and review `inspection_checks[]`. The command must resolve the canonical output through current `render-result.json`; do not inspect an arbitrary `final.mp4`, an old storyboard, or whichever MP4 happens to exist.

For visual checks, inspect sampled frames. For music and SFX, inspect timing, asset provenance, volume, ducking, and reason.

After inspect, run `project status --json`. Completion requires current `inspection.json` bound to the same render-result fingerprint with no blocker. `report.md` is a rebuildable human view and is not machine completion evidence.

The CLI reports sampled evidence and warnings; the agent judges whether the result meets the user's goal.
