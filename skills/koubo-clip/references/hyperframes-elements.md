# HyperFrames Elements

Use this file before selecting catalog elements.

## Catalog First

Run `project element-catalog <project>` and read:

- `elements[]`
- `recommendations`
- `purpose_recommendations`
- `adapter`
- `visual_role`
- `source_modes`
- `required_params`
- `requires_target_rect`
- `requires_anchor_point`
- `screen_safe`

Use `purpose_recommendations.<source_mode>.<presentation_intent>` first. Use generic recommendations only when the intent is still unclear.

## Selection

- Choose the smallest element set that serves the viewer job.
- Do not use all available elements.
- Do not choose elements by business keyword alone. Convert the user wording into semantic intent, viewer job, visual gap, and required evidence.
- For screen recordings, choose screen-safe elements unless the moment is a user-approved intro, outro, or interstitial.

## Required Evidence

- Focus elements need `target_rect`.
- Anchored callouts or chips need `anchor_point`.
- Both require `params.coordinate_source_frame`.
- Use `focus-frames` and `focus-grounding` before writing final coordinates into `enrichment-plan.json`.

## Fields

- `element_type` tells the CLI how to validate and render the element.
- `visual_role` describes why this element exists visually.
- `source_path` is a CLI directory fact and may point into `packages/cli/vendor/hyperframes/resources`.
