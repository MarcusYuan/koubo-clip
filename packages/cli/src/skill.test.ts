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
