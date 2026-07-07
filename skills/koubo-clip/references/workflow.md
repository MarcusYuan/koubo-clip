# Workflow

Use this file for the normal project flow. The CLI is the execution surface; this skill is the planning and review surface.

## Stages

1. Create and explore the project.
   - Choose `standalone` or `platform` once, then pass the same `--provider-mode` to project commands.
   - Run `project create --provider-mode <mode>`.
   - In `standalone` mode, run `project explore --asr auto` unless a transcript already exists.
   - In `platform` mode, the host/platform ASR capability must write `transcript.json`; then run `project explore --asr external --provider-mode platform`.
   - Read `material-report.md` before asking final positioning questions.

2. Review cleanup candidates.
   - Run `project review`.
   - Use `review-package.json/md` candidate ids for every proposed cut.
   - Never make precise cuts from transcript text alone.

3. Produce a user-facing proposal.
   - Write `production-proposal.json`.
   - Run `project proposal`.
   - Show the default option, alternatives, risks, and what requires confirmation.
   - Do not acquire assets, generate images, or render before the user confirms the proposal.

4. Write execution artifacts after confirmation.
   - `edit-plan.json` for cleanup.
   - `focus-candidates.json` and grounding artifacts for UI-facing inserts.
   - `visual-request.json` and visual review artifacts for sourced visuals.
   - `music-request.json` and music review artifacts for music.
   - `asset-manifest.json` for local files only.
   - `enrichment-plan.json` for final render instructions.
   - In `platform` mode, `music-request.json` and `visual-request.json` are request specs for host/platform tools. The CLI must only see fulfilled, project-local assets, normalized candidates, or stable workspace refs.

5. Validate, render, and inspect.
   - Run `project enrich-plan` and show planned `qa_checks[]`.
   - Run `project render`.
   - Run `project inspect` and review `inspection_checks[]`.
   - Report artifact paths and any warnings that remain.

## Confirmation Rule

The proposal can describe desired images, music, UI motion, SFX, and visual assets, but it must not pretend those files already exist. Final asset ids and output timeline coordinates belong in the execution artifacts after confirmation.

## Platform Blockers

If the CLI returns `PROVIDER_MODE_MISMATCH`, keep the project mode and rerun with the matching `--provider-mode`, or create a new project. If it returns `PLATFORM_PROVIDER_BLOCKED`, ask the host/platform capability to fulfill the request and write the required artifact; do not retry by switching to standalone or by passing provider URLs, API keys, raw MCP payloads, or absolute local paths into render artifacts.
