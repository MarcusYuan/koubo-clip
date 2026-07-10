# Workflow

Use this file for the normal project flow. The CLI is the execution surface; this skill is the planning and review surface.

## Stages

1. Create and explore the project.
   - Choose `standalone` or `platform` once, then pass the same `--provider-mode` to project commands.
   - Run `project create --provider-mode <mode>`.
   - In `standalone` mode, run `project explore --asr auto` unless a transcript already exists.
   - In `platform` mode, the host/platform ASR capability must write `transcript.json`; then run `project explore --asr external --provider-mode platform`.
   - Read `material-report.md` before asking final positioning questions.

2. Collect source-frame evidence before business planning.
   - Read `transcript.json`, `material-report.md`, and `sources.json`.
   - Select 1-20 source-local times that answer useful visual questions; prefer coverage over duplicates and do not pad the request to reach the limit.
   - Write `source-frame-request.json`, run `project source-frames --provider-mode <mode>`, then read `source-frames.json` and its project-relative JPEGs.
   - The CLI extracts frames only. When host vision is available, combine visual observations with ASR facts. Without standalone vision, continue transcript-only but mark the visual check as not performed; without platform vision, report a host-workflow blocker.

3. Review cleanup candidates.
   - Run `project review`.
   - Use `review-package.json/md` candidate ids for every proposed cut.
   - Never make precise cuts from transcript text alone.

4. Produce a user-facing proposal.
   - Write `production-proposal.json`.
   - Run `project proposal`.
   - Show the default option, alternatives, risks, and what requires confirmation.
   - Do not acquire assets, generate images, or render before the user confirms the proposal.

5. Write execution artifacts after confirmation.
   - `edit-plan.json` for cleanup.
   - `focus-candidates.json` and grounding artifacts for UI-facing inserts. Candidate timing is on the cleaned output timeline; `project focus-frames` maps it through the EDL and records source-local evidence.
   - `visual-request.json` and visual review artifacts for sourced visuals.
   - `music-request.json` and music review artifacts for music.
   - `asset-manifest.json` for local files only.
   - `enrichment-plan.json` for final render instructions.
   - In `platform` mode, `music-request.json` and `visual-request.json` are request specs for host/platform tools. The CLI must only see fulfilled, project-local assets, normalized candidates, or stable workspace refs.

6. Validate, render, and inspect.
   - Run `project enrich-plan` and show planned `qa_checks[]`.
   - Run `project render`.
   - Run `project inspect` and review `inspection_checks[]`; sampled inspection frames use the final output timeline.
   - Report artifact paths and any warnings that remain.

## Confirmation Rule

The proposal can describe desired images, music, UI motion, SFX, and visual assets, but it must not pretend those files already exist. Final asset ids and output timeline coordinates belong in the execution artifacts after confirmation. `source-frame-request.json`, `source-frames.json`, and `.source-frames/*.jpg` are the only pre-confirmation media-evidence exception: they describe the source, not an approved edit or render plan.

## Production Proposal Contract

`production-proposal.json` is the confirmation surface. It is not the render plan.

- Write 2-3 options, not a single plan.
- For each option, cover: publishing goal, why it fits this material, cleanup strategy, subtitle strategy, visual strategy, image/generated-image intent, music strategy, SFX strategy, risks, and confirmation items.
- Before confirmation, write only asset intent: intent, query, provider preference, license/cost/source risk, and reason.
- Before confirmation, do not write final `asset_id`, local path, provider URL, download URL, absolute path, raw MCP payload, `edit-plan.json`, `focus-candidates.json`, other `focus-*` execution artifacts, `visual-request.json`, `music-request.json`, `asset-manifest.json`, `enrichment-plan.json`, or render artifacts. The source-frame evidence exception above remains allowed.
- If an option uses no assets, state why the source, captions, or cleanup already serve the viewer job.

## Example

User goal: "精简这个，突出卖货". Source: screen recording plus product-demo speech.

Proposal options:

- `sales-conversion`: strong sales version. Fast cleanup, denser payoff subtitles, feature icons for call/navigation/payment-like selling points, light short-form music with ducking, and restrained click SFX. Use when the publishing goal is conversion. Risk: icons/music need post-confirm fulfillment and license review.
- `authentic-review`: realistic seeding version. Keep more natural speech, use anchor captions plus a few key-point lower thirds, no music by default, and only source UI highlights. Use when credibility matters more than packaging. Reason for no extra assets: decoration would reduce trust and can hide UI.
- `tutorial-demo`: tutorial explainer version. Organize around steps, use transparent UI focus/callouts, step labels, and maybe one navigation/function icon. Use when the viewer must learn the workflow. Risk: screen coordinates need `focus-frames` and `focus-grounding`.

After the user confirms an option, convert it into execution artifacts: `edit-plan.json` from review candidate ids; `focus-candidates.json`, `focus-frames.json`, `focus-grounding.json`, and `focus-review.json` for UI moments; `visual-request.json` for approved icons/Lottie/UI/image/B-roll intents; `music-request.json` for approved BGM; `asset-manifest.json` only for landed assets; and `enrichment-plan.json` using output-timeline timings.

## Platform Blockers

If the CLI returns `PROVIDER_MODE_MISMATCH`, keep the project mode and rerun with the matching `--provider-mode`, or create a new project. If it returns `PLATFORM_PROVIDER_BLOCKED`, ask the host/platform capability to fulfill the request and write the required artifact; do not retry by switching to standalone or by passing provider URLs, API keys, raw MCP payloads, or absolute local paths into render artifacts. Missing platform vision is reported by the host workflow after source-frame extraction; `project source-frames` itself is local and does not require vision/provider access.
