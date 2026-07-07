# Media Selection

Use this file when choosing music, SFX, internet visual assets, generated images, user assets, or B-roll.

## Music

- Screen recordings default to no music unless the goal is packaged short-form output.
- Talking-head or knowledge packaging can use low, ducked music.
- Always write the need clearly in `music-request.json`: source intent, mood, target duration, volume, fade, ducking, and why it helps the viewer.
- In `standalone` mode, use `project music-catalog`, `project music-acquire`, and `project music-review`.
- In `platform` mode, ask the host/platform music capability to generate, search, license, or import the track first. Then run CLI music commands only to import, validate, and review landed project-local assets.
- Final render uses only local music files listed in `asset-manifest.json`.
- Do not put API keys, temporary provider URLs, provider raw JSON, or local absolute paths in music artifacts.

## Visual Assets

- Always write the need clearly in `visual-request.json`: viewer job, semantic query, asset type, preferred sources, timing/zone when known, and why it helps the viewer.
- In `standalone` mode, use `project visual-search`, `project visual-acquire`, and `project visual-review`.
- In `platform` mode, ask the host/platform visual/component/image/MCP tools to search, authorize, download, export, or generate first. They must write normalized `visual-candidates.json` plus project-local files or stable workspace refs before CLI import/review.
- Record provider/source label, query, license or usage note, author/attribution, hash, runtime dependencies, and any host audit id.
- Never use provider URLs as final render inputs.
- Never write raw MCP/provider responses, Bearer tokens, API keys, temporary URLs, absolute paths, or unreviewed remote downloads as render inputs.

## Generated Images

Use generated images when:

- the concept is not visible in the source
- internet or user-provided assets are not suitable
- the user wants original cover, concept, brand, or B-roll art

Do not use generated images for subtitles, flowcharts, software screenshots, data cards, or common semantic icons.

## User Assets

If the user provides files, import them into the project, record local paths in `asset-manifest.json`, and still include them in QA checks.
