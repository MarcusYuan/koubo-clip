# koubo-clip

koubo-clip is a local talking-head video post-production tool built for AI agent workflows.

It turns raw spoken-video footage into reviewable, reproducible, renderable output: it analyzes the content and pacing, proposes cuts, captions, visual enrichment, and music, then renders and inspects the result locally after the user confirms the plan.

The goal is not to replace a traditional NLE, and it is not a black-box "one click video" generator. koubo-clip is meant to free creators from repetitive post-production work such as talking-head cleanup, captions, images, visual components, music, SFX, and final inspection, so they can spend more attention on ideas, structure, and expression.

## What It Solves

The slowest part of talking-head video creation is often not deciding what to say, but cleaning up the raw material:

- Finding the usable parts in long recordings.
- Removing pauses, waiting gaps, filler words, false starts, and repeated takes.
- Adding readable captions and emphasis.
- Adding images, icons, UI components, motion, B-roll, or transparent annotations at key explanation points.
- Choosing low-volume background music and useful SFX.
- Checking that the final MP4 was actually produced, assets are local, visuals do not block the subject, and provenance is traceable.

Doing this by hand is slow. Asking AI to "just edit it" is often too opaque. koubo-clip keeps the split clear: the agent understands the content, reviews candidates, and proposes the plan; the CLI performs deterministic local execution, validation, rendering, and inspection.

## Good Fits

koubo-clip is a good fit for explanation-heavy videos:

- Tutorials, courses, and knowledge videos.
- Product demos, feature walkthroughs, and internal training.
- Screen recordings with narration.
- Talking-head short videos.
- Lightweight packaged videos that need captions, visual emphasis, images, icons, UI components, music, and SFX.
- Local video workflows already using Codex, Claude, Hermes, or similar agents.

## Not A Fit

koubo-clip is not a full NLE or a black-box AI video generator. It is not designed for:

- Multi-camera film editing.
- Highly art-directed commercial finishing.
- Complex projects that require heavy manual shot design.
- Workflows that skip review/proposal and expect immediate generation.
- Fully cloud-hosted, account-based, multi-user video editing platforms.

## Who It Is For

- Short-form video creators.
- Tutorial, course, and knowledge creators.
- Product demo and internal training video makers.
- Developers using AI agents to automate local media workflows.
- Teams that want to connect video post-production to a CLI or agent workflow.

## Workflow

![koubo-clip workflow](docs/assets/readme-cn-workflow.png)

A typical flow:

```text
raw talking-head footage
  -> project create
  -> explore: transcription, media probing, material analysis
  -> review: cleanup candidates and risk review
  -> proposal: cuts, captions, visuals, music, and SFX plan
  -> user confirmation
  -> visual/music/focus artifacts: acquire or import local assets
  -> enrich-plan: validate the final render plan
  -> render: local MP4 rendering
  -> inspect: frame sampling and artifact checks
```

Before confirmation, koubo-clip only presents a plan: what to cut, why it should be cut, how captions should work, where images/icons/UI components/motion are needed, whether music or SFX are useful, and which API or network actions are required. After confirmation, it acquires assets, generates music when requested, writes execution artifacts, and renders.

The render step only consumes files or stable references already landed in the current project directory. Provider URLs, temporary download links, and API keys are not valid final render inputs.

## Current Capabilities

- Content cleanup: detects and reviews long pauses, waiting gaps, filler words, false starts, and repeated takes.
- Captions: generates subtitle files, caption rail, emphasis words, and readability checks.
- Visual enrichment: supports icons, animated icons, images, B-roll, UI components, templates, transparent annotations, and HyperFrames elements.
- Audio: supports local music, MiniMax, Freesound, Pixabay, low-volume ducking, and SFX.
- Composition: uses HyperFrames visual recut and FFmpeg to assemble the final MP4.
- Inspection: uses storyboard QA, inspection frames, and reports to check output.

Some visual and music capabilities depend on network access, API keys, user-provided files, or host-agent MCP handoff. The CLI imports confirmed assets into the project and records source, license, hash, and warnings.

## Quick Start

After the npm package is published:

```bash
npm install -g koubo-clip
koubo-clip doctor
koubo-clip skills install --target codex
```

Then give the video to an agent with the installed skill and ask it to create the project, analyze the material, write the proposal, and call the CLI for validation:

```text
Use koubo-clip to process ./raw.mp4.
Analyze the material first and give me a production proposal.
After I confirm, write the edit plan and visual/music artifacts, render final.mp4, and inspect the result.
```

For source development:

```bash
bun install
bun run koubo-clip -- doctor
bun run koubo-clip -- skills install --target codex
```

For manual troubleshooting, the first steps can be run directly:

```bash
koubo-clip project create ./raw.mp4
koubo-clip project explore koubo-clips/raw --asr auto
koubo-clip project review koubo-clips/raw
```

After `review`, the CLI does not generate a production plan as a black box. The agent or user must write `production-proposal.json` first, then run:

```bash
koubo-clip project proposal koubo-clips/raw
```

`project proposal` validates `production-proposal.json` and writes `production-proposal.md`. After confirming the plan, continue by writing `edit-plan.json`, visual/music artifacts, and `enrichment-plan.json`, then run render/inspect.

## Install

For source development:

```bash
git clone <repo-url>
cd koubo-clip
bun install
bun run koubo-clip -- --help
bun run koubo-clip -- doctor
```

After npm publication, the user entrypoint will be:

```bash
npm install -g koubo-clip
koubo-clip --help
koubo-clip doctor
```

Install the agent skill:

The examples below use source development commands. After npm installation, replace `bun run koubo-clip --` with `koubo-clip`.

```bash
# Codex: defaults to ~/.agents/skills/koubo-clip
bun run koubo-clip -- skills install --target codex

# Claude Code: defaults to ~/.claude/skills/koubo-clip
bun run koubo-clip -- skills install --target claude

# Hermes Agent: defaults to ~/.hermes/skills/koubo-clip
bun run koubo-clip -- skills install --target hermes
```

Use a custom skills directory:

```bash
bun run koubo-clip -- skills install --target codex --dest /path/to/skills
```

Overwrite an existing install:

```bash
bun run koubo-clip -- skills install --target codex --force
```

The npm package will include `skills/koubo-clip` and HyperFrames sidecar resources. The `koubo-clip` package name is prepared locally; actual publication still requires npm login and a release version.

## skills.sh

The repository root includes `skills.sh.json` so skills.sh can place the public `koubo-clip` skill in the Video group after the GitHub repository is indexed. After indexing, it can also be installed with the skills.sh CLI:

```bash
npx skills add <owner>/<repo>
```

Replace `<owner>/<repo>` with the actual public GitHub repository name.

## Local Dependencies

Required:

- Bun.
- Node.js 22+.
- FFmpeg / ffprobe.
- `npx`, used to invoke the HyperFrames renderer when needed.
- Optional network access for online ASR, music generation, and visual asset search.
- Optional provider API keys or MCP configuration.

Recommended macOS install with Homebrew:

```bash
brew tap oven-sh/bun
brew install bun ffmpeg node
bun --version
ffmpeg -version
npx --version
```

Recommended Windows install with winget and PowerShell:

```powershell
winget install --id Gyan.FFmpeg -e
winget install --id OpenJS.NodeJS.LTS -e
powershell -c "irm bun.sh/install.ps1 | iex"
bun --version
ffmpeg -version
npx --version
```

Check the environment:

```bash
bun run koubo-clip -- doctor
```

`doctor` reports FFmpeg, ffprobe, npx, Whisper, MiniMax, Lordicon, MCP handoff, and bundled resources. It does not print API keys.

## Configuration

Configuration can live in `~/.koubo-clip/.env`:

```bash
mkdir -p ~/.koubo-clip
$EDITOR ~/.koubo-clip/.env
```

Windows PowerShell:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.koubo-clip"
notepad "$env:USERPROFILE\.koubo-clip\.env"
```

Shell environment variables can also be used. A temporary `.env` in the current project directory works too. Load order:

```text
shell environment variables > current directory .env > ~/.koubo-clip/.env
```

Common configuration:

```bash
# Default online ASR: Cloudflare Whisper
GATEWAY_CLOUDFLARE_AI_ACCOUNT_ID=...
GATEWAY_CLOUDFLARE_AI_API_TOKEN=...
GATEWAY_CLOUDFLARE_AI_TRANSCRIPTION_MODEL=@cf/openai/whisper-large-v3-turbo

# AI-generated background music
MINIMAX_API_KEY=...

# Official animated icon source
LORDICON_API_KEY=...

# Optional network music source
FREESOUND_API_KEY=...

# Optional local music library
MUSIC_LIBRARY_DIR=/path/to/music-library
```

Notes:

- `--asr auto` first uses an existing `transcript.json`; without one, it uses online Cloudflare Whisper; without online configuration, it falls back to local `whisper-cli`.
- MiniMax is only used by `project music-acquire`; render does not go online or read keys.
- Iconify static icons do not require a key.
- Lordicon is used for animated icon candidates and downloads.
- Freesound is an optional network music source.
- Pixabay is currently experimental and not a stable music source.

Do not commit real keys to the repository.

## Recommended Agent Usage

After installing the skill, describe the target in Codex, Claude, Hermes, or a similar agent:

```text
Use koubo-clip to analyze this talking-head video:
remove pauses, waiting gaps, filler words, false starts, and repeated takes.
Add readable captions and add images, icons, UI components, or motion at key explanation points.
If it helps the publish quality, add low-volume background music and necessary SFX.
Give me the production proposal first; after I confirm, render final.mp4 and output the inspection report.
```

The agent reads the koubo-clip skill, calls the CLI, presents the proposal, then prepares visual/music assets, renders, and inspects after user confirmation.

## Manual CLI Flow

Agents usually call the CLI automatically. For manual troubleshooting, run the flow by stages.

The first half is generated directly by the CLI:

```bash
bun run koubo-clip -- project create /path/to/video.mp4
bun run koubo-clip -- project explore koubo-clips/video --asr auto
bun run koubo-clip -- project review koubo-clips/video
```

The following commands read artifacts already written by the agent or user. They do not make creative decisions automatically:

```bash
# Requires production-proposal.json
bun run koubo-clip -- project proposal koubo-clips/video

# Optional: inspect available visual elements
bun run koubo-clip -- project element-catalog koubo-clips/video

# Requires edit-plan.json; when visual/music enrichment is used, also requires enrichment-plan.json and asset-manifest.json
bun run koubo-clip -- project enrich-plan koubo-clips/video
bun run koubo-clip -- project render koubo-clips/video
bun run koubo-clip -- project inspect koubo-clips/video
```

Visual asset commands:

```bash
bun run koubo-clip -- project visual-catalog <project>

# Requires visual-request.json
bun run koubo-clip -- project visual-search <project>
bun run koubo-clip -- project visual-acquire <project>
bun run koubo-clip -- project visual-review <project>
```

Music commands:

```bash
bun run koubo-clip -- project music-catalog <project>

# Requires music-request.json
bun run koubo-clip -- project music-acquire <project>
bun run koubo-clip -- project music-review <project>
```

For UI coordinates, source highlight, or screen-recording callouts, collect focus evidence first:

```bash
bun run koubo-clip -- project focus-candidates <project>
bun run koubo-clip -- project focus-frames <project>
bun run koubo-clip -- project focus-grounding <project>
bun run koubo-clip -- project focus-review <project>
```

## Output Files

Common files in the project directory:

- `material-report.md`
- `review-package.md` / `review-package.json`
- `production-proposal.md` / `production-proposal.json`
- `edit-plan.json`
- `focus-*`
- `visual-*`
- `music-*`
- `asset-manifest.json`
- `enrichment-plan.json`
- `storyboard.json`
- `renders/clean.mp4`
- `renders/final.mp4`
- `.inspection/`
- `report.md`

`storyboard.json.qa_checks[]` is both the composition checklist and inspection checklist. `project inspect` samples frames from it and outputs `inspection_checks[]`.

## Project Status

- Current version: `0.0.1`.
- Current package status: preparing for public npm publication.
- Current recommended development mode: use Bun from the source repository.
- npm package: `koubo-clip`; confirm npm login and version before publication.
- Visual assets, music, and some provider capabilities depend on network access, API keys, user assets, or host MCP handoff.
- Rendering depends on FFmpeg, ffprobe, npx, and HyperFrames resources.

## Development

```bash
bun install
bun run typecheck
bun run test
bun run pack:dry
bun run package:internal
```

Run directly in development:

```bash
bun run koubo-clip -- --help
```

## License

koubo-clip is released under the MIT License. See [LICENSE](LICENSE).

Third-party dependencies, vendored resources, generated assets, and CDN runtimes keep their own licenses. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). In particular: `gsap` uses the Standard "No Charge" GSAP License; HyperFrames resources use Apache-2.0; Pixabay SFX and VS Code theme JSON files keep their own licenses.
