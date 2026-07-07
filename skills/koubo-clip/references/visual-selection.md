# Visual Selection

Use this file when deciding whether to add source highlights, icons, animated icons, UI templates, images, generated images, B-roll, or no visual insert.

## Decision Order

1. Identify the viewer job for the segment:
   - orient the viewer
   - guide attention
   - explain a sequence
   - summarize a payoff
   - create pacing relief

2. Check what is already visible in the source.
   - If the source already shows the thing, prefer a small highlight, label, zoom, or pointer.
   - If the source does not show the thing, consider a sourced icon, UI template, B-roll, image, or generated image.

3. Match the source mode.
   - `screen_recording`: transparent and small by default. Avoid hiding UI.
   - `talking_head_avatar`: full packaging, cards, images, and low music are acceptable when they serve the publishing goal.
   - `mixed`: use the strictest rule for the visible moment.

## Source Priority

- Common semantic icons such as alarm, phone, navigation, message, bluetooth, battery, call, or checkmark: use Iconify or Lordicon first.
- App-like panels, forms, cards, dashboards, pricing, tables, and settings: use shadcn or 21st.dev handoff and import only a static export, screenshot, safe fragment, SVG, or local file.
- Lottie or dotLottie motion: use only confirmed local `.json` or `.lottie` assets with recorded provenance.
- B-roll or sourced images: use visual acquisition and record provider, source URL, license, author, and hash.
- Generated images: use only when deterministic sources do not fit or the user needs original concept art.
- No insert: choose this when the added content would only decorate and not help the viewer job.

## Proposal Surface

Before confirmation, explain:

- what visual treatment is proposed
- why it helps the viewer
- which provider or host tool will be used
- license, cost, source, or attribution risk
- whether grounding evidence is needed
