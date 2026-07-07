# koubo-clip

koubo-clip 是面向 agent 的口播视频清理与增强工具。它会以 Node.js CLI 加 bundled skills 的形式分发，供 Codex、Claude、Hermes 以及类似 agent 平台使用。

## 先读这些

修改本仓库前，先阅读：

1. `docs/requirements.md`
2. `docs/architecture.md`
3. `docs/reference-learnings.md`
4. `rules/` 下与本次修改相关的规则文件

本仓库刻意沿用 `easy-video` 的产品分层：CLI 负责确定性执行和校验；skills 负责用户工作流和语义审查。

## 产品边界

支持的工作流是：

```text
源口播视频
  -> transcript
  -> 机器检测出的清理候选
  -> agent 审查后的 edit plan
  -> 已校验 EDL
  -> 字幕和增强 assets
  -> 渲染后的 MP4
  -> 已检查 artifacts 和 report
```

第一个产品里程碑是可靠清理：从用户上传的口播素材中移除静音、等待、口头禅、误开头和重复重录，再渲染出带字幕的 MP4。

V0 优先支持本地 CLI 使用。Hermes TaskWorkspace 和平台工具集成是后续目标；artifact 合同要保持兼容思路，但首版不能依赖 Hermes。

## 实现方向

- 项目代码使用 Node.js 22+ 和 TypeScript。
- 工作区开发、脚本、测试和构建使用 Bun。
- 对外提供安装后的 `koubo-clip` 命令作为正常用户入口。
- skills 随发布包一起分发；普通用户不应需要 clone 源码仓库。
- 使用 FFmpeg/ffprobe 作为本地媒体基础能力。
- V0 可以提供内置 `whisper-cli` ASR adapter 用于测试，通过 `--asr auto|off|external` 控制。
- 不要用纯文本 transcript 做精确剪辑。
- 将 `video-use`、`OpenMontage`、`easy-video` 视为参考项目。除非用户明确要求，不要从本仓库修改它们。

## 规划结构

```text
packages/
  cli/      -> koubo-clip 命令、project commands、doctor、validation
  core/     -> transcript、candidate、edit-plan、EDL、artifact schemas
  media/    -> ffmpeg/ffprobe、silence detection、subtitle helpers
  render/   -> 确定性 final assembly
skills/
  koubo-clip/
docs/
rules/
```

只创建当前里程碑真正需要的部分。不要因为规划结构里写了某个 package，就提前搭空架子。

## 开发规则

- 保持 diff 小、可审查、可回滚。
- 优先删除和复用已有工具，再考虑新增抽象。
- 添加依赖前，先检查 Node.js、Bun、FFmpeg 和现有 package 能力。
- 不要把创意或语义决策放进底层 render 代码。
- 不要让 skills 复制 CLI 拥有的常量、schema、时间规则或输出布局。需要时通过 CLI JSON 命令暴露。
- 一旦某个 CLI 命令拥有了支持流程，就不要把手写一次性 FFmpeg 脚本作为支持的工作流。
- 失败后保留生成的项目目录，方便用户和 agent 检查、重试。

## 校验

仅修改 docs 和 rules 时：

```bash
git diff --check
```

TypeScript workspace 存在后，使用与改动匹配的最小校验：

```bash
bun run typecheck
bun run test
bun run lint
```

涉及媒体渲染的改动，校验必须包含至少一个真实 artifact inspection 路径，不能只检查 JSON 形状。
