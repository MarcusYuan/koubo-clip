# 修改纪律

## 目的

本规则定义如何在 koubo-clip 中做有边界的修改。

## 编辑前

- 阅读 `AGENTS.md`、`docs/requirements.md` 和相关规则文件。
- 找出完成请求所需的最小文件集合。
- 检查 worktree，并假设无关 dirty changes 属于用户。
- 一旦 implementation files 和 tests 存在，就把它们当作最终事实来源。

## 编辑中

- 只修改目标变更需要的文件。
- 保持所触碰文件的既有风格。
- 避免无关 refactors、dependency churn、generated files 和 release metadata。
- 除非用户明确要求，不要 revert 你没有做的改动。
- 对 structured data 使用 structured parsers 或项目 helpers。
- Comments 保持简短，只在说明非显然行为时添加。

## 限制区域

- 除非明确要求，不要从本仓库修改参考项目（`easy-video`、`video-use`、`OpenMontage`）。
- 没有明确批准，不要引入外部 upload、telemetry、publishing 或 cloud transfer 行为。
- 不要把 CLI flags、artifact schemas 或 output layout 的变更混入无关 docs 或 skill 工作。

## 编辑后

- 运行与修改面匹配的最小 validation set。
- 报告 changed files、checks run、skipped checks 和 remaining risks。
