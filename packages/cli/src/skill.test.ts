import { readFileSync } from "node:fs";
import { expect, test } from "bun:test";

test("koubo-clip skill preserves staged review workflow", () => {
  const skill = readFileSync("skills/koubo-clip/SKILL.md", "utf8");
  expect(skill).toContain("project explore");
  expect(skill).toContain("project review");
  expect(skill).toContain("project enrich-plan");
  expect(skill).toContain("edit-plan.json");
  expect(skill).toContain("project inspect");
  expect(skill).toContain("Require current `render-result.json`, current `inspection.json`, matching hashes/lineage, and no blocker");
  expect(skill).toContain("references/workflow.md");
  expect(skill).toContain("references/business-planning.md");
  expect(skill).toContain("references/visual-selection.md");
  expect(skill).toContain("references/hyperframes-elements.md");
  expect(skill).toContain("references/storyboard-qa.md");
});

test("koubo-clip skill references route agent decisions", () => {
  const references = [
    "workflow.md",
    "business-planning.md",
    "visual-selection.md",
    "captions.md",
    "motion-and-sfx.md",
    "hyperframes-elements.md",
    "media-selection.md",
    "storyboard-qa.md",
  ];
  for (const name of references) {
    const body = readFileSync(`skills/koubo-clip/references/${name}`, "utf8");
    expect(body.length > 200).toBe(true);
  }
  expect(readFileSync("skills/koubo-clip/references/hyperframes-elements.md", "utf8")).toContain("visual_role");
  expect(readFileSync("skills/koubo-clip/references/storyboard-qa.md", "utf8")).toContain("storyboard.json.qa_checks[]");
});

test("koubo-clip skill documents proposal confirmation gate", () => {
  const skill = readFileSync("skills/koubo-clip/SKILL.md", "utf8");
  const workflow = readFileSync("skills/koubo-clip/references/workflow.md", "utf8");
  const media = readFileSync("skills/koubo-clip/references/media-selection.md", "utf8");
  const qa = readFileSync("skills/koubo-clip/references/storyboard-qa.md", "utf8");
  const rules = readFileSync("rules/skills-agent-workflow.md", "utf8");

  expect(`${skill}\n${workflow}\n${rules}`).toContain("2-4 complete options");
  expect(skill).toContain("The user confirms exactly once");
  expect(`${skill}\n${workflow}`).toContain("proposal_fingerprint");
  expect(`${skill}\n${workflow}`).toContain("option_selection_fingerprints");
  expect(`${skill}\n${workflow}`).toContain("`contract_version:\"1.0\"`, `confirmed_option_id`, and the matching `proposal_selection_fingerprint`");
  expect(skill).toContain("Before user confirmation, do not write `edit-plan.json`, `focus-candidates.json`, any `focus-*` execution artifacts, `visual-request.json`, `music-request.json`, `asset-manifest.json`, or `enrichment-plan.json`");
  expect(`${skill}\n${workflow}\n${media}`).toContain("intent, query, provider preference, license/cost/source risk");
  expect(`${skill}\n${workflow}\n${media}`).toContain("provider URL, download URL, absolute path, or raw MCP payload");
  expect(skill).toContain("Request host/platform fulfillment, then let CLI validate landed artifacts");
  expect(qa).toContain("If the confirmed proposal selected BGM, SFX, icons, Lottie/dotLottie, UI handoff, image, B-roll, or generated-image work");
  expect(`${skill}\n${media}\n${qa}`).toContain("no assets");
});

test("koubo-clip skill collects source frames before business planning without opening the confirmation gate", () => {
  const skill = readFileSync("skills/koubo-clip/SKILL.md", "utf8");
  const workflow = readFileSync("skills/koubo-clip/references/workflow.md", "utf8");

  expect(skill).toContain("project source-frames");
  expect(workflow).toContain("project source-frames");
  const skillExplore = skill.indexOf("project explore", skill.indexOf("## Workflow"));
  const skillSourceFrames = skill.indexOf("project source-frames", skillExplore);
  const skillDirections = skill.indexOf("Write `production-proposal.json`", skillSourceFrames);
  expect(skillExplore < skillSourceFrames).toBe(true);
  expect(skillSourceFrames < skillDirections).toBe(true);
  const workflowSourceFrames = workflow.indexOf("project source-frames", workflow.indexOf("## Stages"));
  expect(workflowSourceFrames < workflow.indexOf("Build one user-facing proposal", workflowSourceFrames)).toBe(true);
  expect(`${skill}\n${workflow}`).toContain("the only allowed media-evidence exception");
  expect(skill).toContain("do not write `edit-plan.json`, `focus-candidates.json`, any `focus-*` execution artifacts, `visual-request.json`, `music-request.json`, `asset-manifest.json`, or `enrichment-plan.json`");
  expect(skill).toContain("do not acquire assets, generate media, or render");
});

test("koubo-clip skill resumes from status and keeps one canonical enrichment authority", () => {
  const skill = readFileSync("skills/koubo-clip/SKILL.md", "utf8");
  const workflow = readFileSync("skills/koubo-clip/references/workflow.md", "utf8");
  const planning = readFileSync("skills/koubo-clip/references/business-planning.md", "utf8");

  const skillWorkflow = skill.indexOf("## Workflow");
  const skillStatus = skill.indexOf("project status <project> --json", skillWorkflow);
  const skillExplore = skill.indexOf("project explore", skillWorkflow);
  expect(skillStatus > skillWorkflow).toBe(true);
  expect(skillStatus < skillExplore).toBe(true);

  const workflowStatus = workflow.indexOf("project status <project> --json");
  expect(workflowStatus < workflow.indexOf("## Stages")).toBe(true);
  expect(`${skill}\n${workflow}\n${planning}`).toContain("`enrichment-plan.json` is the only canonical");
  expect(`${skill}\n${workflow}\n${planning}`).toContain("asset-usage-plan.json");
  expect(`${skill}\n${workflow}\n${planning}`).toContain("normalize");
  expect(`${skill}\n${workflow}`).toContain("ASSET_USAGE_PLAN_CONFLICT");
  expect(skill).toContain("never infer state by scanning files");
});

test("koubo-clip skill and READMEs use render-result and inspection as completion evidence", () => {
  const skill = readFileSync("skills/koubo-clip/SKILL.md", "utf8");
  const workflow = readFileSync("skills/koubo-clip/references/workflow.md", "utf8");
  const qa = readFileSync("skills/koubo-clip/references/storyboard-qa.md", "utf8");
  const readme = readFileSync("README.md", "utf8");
  const readmeCn = readFileSync("README-CN.md", "utf8");

  for (const body of [skill, workflow, qa, readme, readmeCn]) {
    expect(body).toContain("project status");
    expect(body).toContain("render-result.json");
    expect(body).toContain("inspection.json");
  }

  for (const body of [skill, workflow, readme, readmeCn]) {
    expect(body).toContain("canonical_output_key");
  }

  for (const body of [readme, readmeCn]) {
    expect(body).toContain("artifact-manifest.json");
    expect(body).toContain("pending_validation");
    expect(body).toContain("LINEAGE_UNPROVEN");
    expect(body).toContain("report.md");
  }

  expect(workflow).toContain("its `inputs[]` records exact consumed artifacts");
  expect(qa).toContain("do not inspect an arbitrary `final.mp4`");
  expect(qa).toContain("bound to the same render-result fingerprint with no blocker");
  expect(skill).toContain("JSON is the machine contract. Markdown is a rebuildable human view");
});
