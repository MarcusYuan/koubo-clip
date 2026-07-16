# 测试和校验

## 目的

本规则将不同变更类型映射到 koubo-clip 的最小有效 validation。

## 校验矩阵

仅修改 docs 或 rules：

```bash
git diff --check
```

Skills 变更：

```bash
git diff --check
```

skill linting 存在后，也运行 skill linter。

TypeScript workspace 变更：

```bash
bun run typecheck
bun run test
```

CLI command behavior 变更：

```bash
bun run typecheck
bun test packages/cli
```

Artifact contract、schema、template、example、validator 或官方 Skill 作者指导变更：

- 运行 contract/schema focused tests，证明公开 schema 与 runtime validator 等价。
- 验证每个 bundled example 通过同版本 CLI。
- 验证所有可写合同没有未定义字段的裸 object/array item，且 example 通过对应 runtime parser。
- 验证 required、enum 和 unknown-field policy 都能从 contract discovery 获得。
- 验证一次无效输入返回聚合 `issues[]`，且 CLI 仍 fail closed。
- 验证每种 artifact 只暴露唯一当前 schema，contract discovery 不接受 schema version 选择。
- 验证缺失或非当前 artifact version 返回 `CONTRACT_SCHEMA_UNSUPPORTED`；测试不得保留旧 parser、legacy normalization、兼容 union 或运行时迁移 fixture。
- 从 canonical npm tarball 安装到空目录，在不读取源码/tests 的情况下完成对应 authoring smoke；`production-proposal.json` 2.0 必须继续验证 option fingerprint 到 edit plan/EDL 的绑定。
- Evidence import 变更必须覆盖 probe unavailable/non-zero/invalid output、codec、dimensions、size、hash 和 binding；至少一个真实 baseline JPEG 走完整 platform detached import。
- Status 变更必须证明 `.virtual/*` 不作为 artifact path 暴露、fingerprint 仍可发现、detached export 后只推荐 distributed strict chain，并证明 materialized standalone 不回归。

Media probing、EDL、subtitle 或 render behavior 变更：

- 运行 changed package 的 focused unit tests。
- fixtures 存在后，运行一个小 local smoke fixture。
- 当 visual/caption placement 重要时，检查 rendered MP4 或 extracted frames。

## 手动扫描

对于 docs、skills、templates 和 rules，扫描变更文本以确认：

- 没有意外复制 reference-project-specific command names。
- generic workflow 没有强制依赖 host-specific agent platform names。
- 没有指示 agents 把手写 FFmpeg、HTML、Remotion 或 GSAP 当成正常工作流。
- 没有在应由 CLI JSON command 暴露时，重复 CLI-owned schemas、thresholds 或 artifact layouts。
- Agent/Host authored artifact 的完整结构来自 CLI artifact contract discovery；Skill 只重复必要业务语义，不维护未校验的平行 schema。
- 没有允许在缺少 current `render-result.json`、其 hash/probe 匹配的 canonical output 和绑定同一 render fingerprint 的 current `inspection.json` 时声称完成。

## 报告

最终报告应包含：

- Files changed。
- Checks run 和 results。
- Checks skipped 和原因。
- Remaining risk 或需要的 follow-up。
