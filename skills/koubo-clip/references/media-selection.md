# Media Selection

Use this file when choosing music, SFX, internet visual assets, generated images, user assets, or B-roll.

## Music

- Screen recordings default to no music unless the goal is packaged short-form output.
- Talking-head or knowledge packaging can use low, ducked music.
- Use `project music-catalog`, `music-request.json`, `project music-acquire`, and `project music-review`.
- Final render uses only local music files listed in `asset-manifest.json`.

## Visual Assets

- Use `visual-request.json`, `project visual-search`, `project visual-acquire`, and `project visual-review`.
- Record provider, query, source URL, license, author, hash, and runtime dependencies.
- Never use provider URLs as final render inputs.

## Generated Images

Use generated images when:

- the concept is not visible in the source
- internet or user-provided assets are not suitable
- the user wants original cover, concept, brand, or B-roll art

Do not use generated images for subtitles, flowcharts, software screenshots, data cards, or common semantic icons.

## User Assets

If the user provides files, import them into the project, record local paths in `asset-manifest.json`, and still include them in QA checks.
