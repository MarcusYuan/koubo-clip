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
- 没有允许在缺少真实 output artifact 和 inspection result 时声称完成。

## 报告

最终报告应包含：

- Files changed。
- Checks run 和 results。
- Checks skipped 和原因。
- Remaining risk 或需要的 follow-up。
