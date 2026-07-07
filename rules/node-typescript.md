# Node 和 TypeScript

## 目的

本规则固定 koubo-clip 的主要实现技术栈。

## Runtime 合同

- 使用 Node.js 22+。
- 项目代码使用 TypeScript。
- 工作区开发、脚本、测试和构建使用 Bun。
- 面向用户的 CLI 通过公开 npm package 分发，暴露 `koubo-clip` 命令；内部 tarball 只作为可选本地二进制打包路径。

## Package 规则

- 当多个 packages 变得必要时，优先使用 Bun workspace。
- 只有在能移除真实耦合时，才创建额外 packages。
- CLI command code 保持薄；可复用 validation 和 media logic 放进 shared packages。
- 主产品不要添加 Python runtime modules。Python 只允许用于临时本地分析脚本，且不能成为发布 CLI 的一部分。

## Dependency 规则

- 先检查 Node.js standard APIs、Bun 和 FFmpeg。
- 添加新依赖前，优先使用已安装依赖。
- 只有当依赖能移除有意义的代码或启用真实 media feature 时才添加。
- CLI 存在后，native/binary dependencies 必须在 `doctor` output 中明确。

## Style 规则

- 优先使用 explicit types 和 narrowing，而不是宽泛 `any`。
- 当小 parser 或 guard 能证明形状时，避免 type assertions。
- render 和 media functions 必须确定性：output generation 中不要使用未 seeded randomness、current time 或 render-time network fetches。
