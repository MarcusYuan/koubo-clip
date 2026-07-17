import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseSourcesManifest, type EditDecision, type EnrichmentSourceMode, type ProductionProposalArtifact } from "./artifacts";
import { productionProposalExample } from "./artifact-contracts";
import { proposalProject, reviewProject } from "./project";

export function confirmProposalAndWriteEditPlan(
  project: string,
  decisions: EditDecision[] = [],
  sourceOrder?: string[],
  options: { subtitleStyle?: "none" | "plain" | "anchor"; sourceMode?: EnrichmentSourceMode } = {},
): void {
  const reviewed = reviewProject(project);
  if (!reviewed.ok) throw new Error(reviewed.error.message);
  const proposal = structuredClone(productionProposalExample) as ProductionProposalArtifact;
  if (options.sourceMode) proposal.source_mode = options.sourceMode;
  const cutCandidateIds = decisions
    .filter((decision) => decision.action === "cut" && decision.candidate_id)
    .map((decision) => decision.candidate_id!);
  proposal.options.forEach((option) => {
    option.cleanup.cut_candidate_ids = cutCandidateIds;
    const subtitleStyle = options.subtitleStyle ?? "plain";
    option.subtitles = { ...option.subtitles, enabled: subtitleStyle !== "none", style: subtitleStyle };
  });
  if (sourceOrder) {
    const sources = parseSourcesManifest(JSON.parse(readFileSync(join(project, "sources.json"), "utf8")));
    const byId = new Map(sources.sources.map((source) => [source.source_id, source]));
    const duration = sourceOrder.reduce((total, sourceId) => total + (byId.get(sourceId)?.duration_seconds ?? 0), 0);
    proposal.options.forEach((option) => {
      option.edit_execution_plan.duration_target = {
        min_seconds: Math.max(0, duration - 2 / 30),
        max_seconds: duration + 2 / 30,
        target_seconds: duration,
        tolerance_frames: 2,
      };
      option.edit_execution_plan.timeline = {
        mode: "explicit_segments",
        segments: sourceOrder.map((sourceId) => {
          const source = byId.get(sourceId);
          if (!source) throw new Error(`unknown source order id: ${sourceId}`);
          return { id: `full-${sourceId}`, source_id: sourceId, start: 0, end: source.duration_seconds, reason: "Confirmed whole-source order." };
        }),
      };
    });
  }
  writeFileSync(join(project, "production-proposal.json"), JSON.stringify(proposal));
  const proposed = proposalProject(project);
  if (!proposed.ok) throw new Error(proposed.error.message);
  const optionId = proposal.recommended_option_id;
  writeFileSync(join(project, "edit-plan.json"), JSON.stringify({
    contract_version: "1.0",
    confirmed_option_id: optionId,
    proposal_selection_fingerprint: proposed.data.option_selection_fingerprints[optionId],
    decisions,
  }));
}
