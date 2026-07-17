import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { EditDecision, ProductionProposalArtifact } from "./artifacts";
import { productionProposalExample } from "./artifact-contracts";
import { proposalProject, reviewProject } from "./project";

export function confirmProposalAndWriteEditPlan(project: string, decisions: EditDecision[] = [], sourceOrder?: string[]): void {
  const reviewed = reviewProject(project);
  if (!reviewed.ok) throw new Error(reviewed.error.message);
  const proposal = structuredClone(productionProposalExample) as ProductionProposalArtifact;
  const cutCandidateIds = decisions
    .filter((decision) => decision.action === "cut" && decision.candidate_id)
    .map((decision) => decision.candidate_id!);
  proposal.options.forEach((option) => {
    option.cleanup.cut_candidate_ids = cutCandidateIds;
    option.edit_execution_plan.remove_segments = cutCandidateIds.map((candidate_id) => ({ candidate_id, reason: "Confirmed cleanup candidate." }));
  });
  writeFileSync(join(project, "production-proposal.json"), JSON.stringify(proposal));
  const proposed = proposalProject(project);
  if (!proposed.ok) throw new Error(proposed.error.message);
  const optionId = proposal.recommended_option_id;
  writeFileSync(join(project, "edit-plan.json"), JSON.stringify({
    contract_version: "1.0",
    confirmed_option_id: optionId,
    proposal_selection_fingerprint: proposed.data.option_selection_fingerprints[optionId],
    decisions,
    ...(sourceOrder ? { source_order: sourceOrder } : {}),
  }));
}
