# Captions

Use this file whenever subtitles, source hard captions, or spoken emphasis are involved.

## Defaults

- Use the anchor caption rail by default.
- Keep captions readable before making them stylish.
- Treat source hard captions as existing visual content; avoid duplicating them in the same area.

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
