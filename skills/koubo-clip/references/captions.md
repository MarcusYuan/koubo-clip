# Captions

Use this file whenever subtitles, source hard captions, or spoken emphasis are involved.

## Defaults

- Use the anchor caption rail by default.
- Keep captions readable before making them stylish.
- Treat source hard captions as existing visual content; avoid duplicating them in the same area.

## Safe Layout

- Caption placement is output-aspect-ratio driven.
- The public presets are `placement:auto|center_lower|bottom_safe` and `size:small|medium|large`.
- 9:16 defaults to `center_lower` at `(0.50,0.70)`.
- 4:5 defaults to `center_lower` at `(0.50,0.76)`.
- Landscape defaults to `bottom_safe` at `(0.50,0.90)`.
- Anchor captions and plain subtitle rails share the same safe-layout contract.
- Agents choose the semantic role, preset, size, and text only. The CLI resolves the exact layout and freezes it into render contract 2.0.

## Emphasis

- Emphasize only the words that change viewer understanding.
- Avoid rendering the same emphasis twice through anchor emphasis and a caption component.
- For screen recordings, keep emphasis within a safe bottom area or a small transparent highlight.
- For talking-head packaging, stronger kinetic captions are acceptable when the goal is short-form retention.

## QA

Before render, `project enrich-plan` should show caption-related `qa_checks[]`. After render, inspect sampled frames for:

- caption text not clipped
- no repeated caption layer
- no conflict with source hard captions
- no major UI occlusion
