# Storyboard QA

Use this file before render and after inspect.

## Single Checklist

`storyboard.json.qa_checks[]` is both:

- the render script checklist
- the inspection checklist

Do not create a separate inspection plan that can drift from render behavior.

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

## After Render

Run `project inspect` and review `inspection_checks[]`.

For visual checks, inspect sampled frames. For music and SFX, inspect timing, asset provenance, volume, ducking, and reason.

The CLI reports sampled evidence and warnings; the agent judges whether the result meets the user's goal.
