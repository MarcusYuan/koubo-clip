import { readFileSync } from "node:fs";
import { expect, test } from "bun:test";

test("koubo-clip skill preserves staged review workflow", () => {
  const skill = readFileSync("skills/koubo-clip/SKILL.md", "utf8");
  expect(skill).toContain("project explore");
  expect(skill).toContain("project review");
  expect(skill).toContain("project enrich-plan");
  expect(skill).toContain("edit-plan.json");
  expect(skill).toContain("project inspect");
  expect(skill).toContain("Do not claim render or inspection happened unless the command ran");
  expect(skill).toContain("references/workflow.md");
  expect(skill).toContain("references/visual-selection.md");
  expect(skill).toContain("references/hyperframes-elements.md");
  expect(skill).toContain("references/storyboard-qa.md");
});

test("koubo-clip skill references route agent decisions", () => {
  const references = [
    "workflow.md",
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

  expect(`${skill}\n${workflow}\n${rules}`).toContain("2-3 options");
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
  expect(workflowSourceFrames < workflow.indexOf("Produce a user-facing proposal", workflowSourceFrames)).toBe(true);
  expect(`${skill}\n${workflow}`).toContain("the only allowed media-evidence exception");
  expect(skill).toContain("do not write `edit-plan.json`, `focus-candidates.json`, any `focus-*` execution artifacts, `visual-request.json`, `music-request.json`, `asset-manifest.json`, or `enrichment-plan.json`");
  expect(skill).toContain("do not acquire assets, generate media, or render");
});
