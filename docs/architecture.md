# 架构

koubo-clip 采用与 easy-video 相同的高层分层：安装后的 CLI 负责确定性工作，skill 引导 agents 走分阶段工作流。

## 分层职责

| 层 | 职责 |
| --- | --- |
| CLI | 本地项目文件、媒体探测、ASR adapter 开关、transcript 归一化、候选片段检测、review artifacts、production proposal 校验和 markdown 物化、EDL 校验、字幕、focus-candidates/frames/grounding/focus-review 物化、music acquisition、enrichment/schema 校验、source-mode 默认值、storyboard 物化、HyperFrames composition 生成、FFmpeg render 组装、inspection |
| Skill | 用户对话、explore 后发现目标、生成和展示 production proposal、语义 edit review、source-mode 与 presentation-intent 分类、semantic focus planning、grounding review、音乐用途和来源选择、enrichment 选择、命令选择、artifact 解读 |
| Agent/platform | 可选图片、B-roll 生成；产出本地 asset 文件或未来 workspace refs |
| Environment | FFmpeg、ffprobe、默认线上 ASR 用 Cloudflare Whisper、显式离线兜底用 `whisper-cli`、单个 recut composition 用 `npx --yes hyperframes`、可选外部媒体生成工具和音乐 provider credentials |

## 规划包

```text
packages/cli
  面向用户的 `koubo-clip` 命令。

packages/core
  共享类型、parsers、schema guards、transcript 归一化、candidate 和 EDL models。

packages/media
  FFmpeg/ffprobe wrappers、silence detection、audio loudness、subtitle helpers。

packages/render
  从已校验 artifacts 确定性组装 MP4。
```

这些 packages 只有在真正需要时才创建。首版如果单个 CLI package 更简单，就优先保持单 package。

## 规划技能

```text
skills/koubo-clip
  v0 主工作流：explore、clean、review、enrich、render 口播视频。

未来只有需要时才拆分：
  koubo-clip-cli
  koubo-clip-media
```

## Skill 和 CLI Resources 边界

对外只有一个 agent skill：`skills/koubo-clip`。它负责流程编排、判断规则、proposal/review 话术和 artifact 写入策略。它可以按 `skill-creator` 的渐进披露原则拆出 `references/`，但这些 references 只给 agent 按需阅读，不参与渲染执行。

CLI 不读取、不运行、不解释 agent skill。CLI 是普通程序，只消费 project artifacts、环境变量、FFmpeg/HyperFrames 等外部命令，以及二进制包内 sidecar 静态 resources。

`packages/cli/vendor/hyperframes/resources` 只表示“从 HyperFrames 上游搬来的 resource mirror”，不是 koubo-clip 的用户 skill，也不是 agent 需要加载的 skill。迁移规则是：

- 上游 `SKILL.md`、references 和 motion/caption/media 方法论：提炼进 `skills/koubo-clip/references/`。
- registry、HTML fragments、caption theme JSON、字体、SFX、示例资源和 runtime 配置：留在 CLI vendor resources，由 CLI catalog/adapter/render 使用。
- 用户和 agent 只加载 `skills/koubo-clip`，再由它调用 `koubo-clip` CLI。

## 命令模型

分阶段工作流应作为高质量路径：

```bash
koubo-clip project create ./raw.mp4
koubo-clip project explore koubo-clips/raw --asr auto --json
koubo-clip project review koubo-clips/raw --json
koubo-clip project proposal koubo-clips/raw --json
koubo-clip project element-catalog koubo-clips/raw --json
koubo-clip project focus-candidates koubo-clips/raw --json
koubo-clip project focus-frames koubo-clips/raw --json
koubo-clip project focus-grounding koubo-clips/raw --json
koubo-clip project music-catalog koubo-clips/raw --json
koubo-clip project music-acquire koubo-clips/raw --json
koubo-clip project music-review koubo-clips/raw --json
koubo-clip project visual-catalog koubo-clips/raw --json
koubo-clip project visual-search koubo-clips/raw --json
koubo-clip project visual-acquire koubo-clips/raw --json
koubo-clip project visual-review koubo-clips/raw --json
koubo-clip project enrich-plan koubo-clips/raw --json
koubo-clip project render koubo-clips/raw --json
koubo-clip project inspect koubo-clips/raw --json
```

`project proposal` 是用户确认入口。Skill/agent 写入 `production-proposal.json`，CLI 只校验 source mode、presentation intent、option、cleanup candidate 引用和 provider 枚举，然后生成 `production-proposal.md`。它不生成 `edit-plan`、`focus-*`、`music-*`、`asset-manifest` 或 `enrichment-plan`，也不联网、不生图、不 render。

`project element-catalog` 是 enrichment 选型入口。它输出完整 HyperFrames catalog、每个元素的 adapter profile、按 source mode 分组的 `recommendations`，以及按 `source_mode × presentation_intent` 分组的 `purpose_recommendations`。Agent 先从用户目标推断 presentation intent，再从该矩阵选择元素；CLI 只校验和消费选择结果，不替 agent 做创意判断。

外部视觉素材不是本地库优先。需要 icon、animated icon、UI component、sticker、template、B-roll 或图片时，skill/agent 应直接走 internet-first visual acquisition：通过已安装 host MCP、API 或平台工具语义检索互联网上的现成素材，向用户展示候选和来源，确认后把本次任务需要的文件或 workspace ref 写入当前 project artifacts。`assets/images`、`assets/icons`、`assets/lottie`、`assets/visuals` 只是当前 project 的渲染输入，不是长期全局缓存。

`project focus-candidates` 负责校验 agent 写入的固定 semantic intent 和 element type 候选集，并生成可读摘要。`project focus-frames` 负责把 source frame 或 inspection frame 物化成可引用的 evidence。`project focus-grounding` 负责校验候选集、坐标和 evidence 的绑定关系，并拒绝没有 frame evidence 的 screen-recording coordinates。`project focus-review` 负责生成可合并到 enrichment plan 的 `proposed_elements[]`。`project enrich-plan` 只消费已经 grounded 的结果。

`project music-catalog` 是音乐来源入口。它扫描本地曲库并报告 MiniMax、Freesound 和 Pixabay 的可用性；`project music-acquire` 根据 `music-request.json` 获取或生成音乐，写入 `assets/music/`、`music-acquisition.json` 和 `asset-manifest.json`；`project music-review` 输出 human/agent review surface。

`project visual-catalog` 是互联网视觉素材来源入口。它报告 CLI-owned Iconify/Lordicon、Lottie/dotLottie import、shadcn/21st handoff 能力，以及 HyperFrames 允许加载的固定版本 CDN runtime。`project visual-search` 校验 `visual-request.json`，执行 CLI-owned Iconify/Lordicon 搜索或读取 host/MCP handoff 候选，写入 `visual-candidates.json/md`。`project visual-acquire` 下载或导入已确认候选，经过 SVG sanitization 和 path safety 后写入 `assets/icons`、`assets/lottie`、`assets/visuals` 或 `assets/images`，并更新 `asset-manifest.json`。`project visual-review` 输出 human/agent review surface。

Render 阶段不联网，不调用 provider，不消费 provider URL。

可以为草稿提供快速模式：

```bash
koubo-clip generate ./raw.mp4 --captions --json
```

`project explore` 命令负责创建或摄入 transcript。ASR 开关是 CLI 合同的一部分：

- `--asr auto`: 使用已有 transcript，若不存在则优先运行线上 Cloudflare Whisper；缺少线上配置时退到本地 `whisper-cli`。
- `--asr off`: 要求已有 transcript。
- `--asr external`: 跳过内置 ASR，期待外部 agent 或用户提供 `transcript.json`。

`--asr-provider whisper-cli` 可用于离线测试或调试。线上 provider 仍落到同一个 `transcript.json` 合同，后续剪辑逻辑不关心转写后端。

## Agent 合同

当存在 JSON 命令时，agents 不应抓取人类日志。供 skills 使用的命令应支持 `--json`，并返回稳定字段：

- Project path。
- Source metadata。
- Transcript path。
- Material report path。
- Review package path。
- Production proposal path。
- Candidate counts。
- ASR timing granularity。
- Edit-plan status。
- EDL validation result。
- Enrichment-plan status 和 missing assets。
- Rendered output paths。
- Inspection result。

## 制作方案层

Production proposal 位于 `review-package` 之后、执行 artifacts 之前：

```text
material-report + review-package + user goal + element/music catalog facts
  -> production-proposal.json
  -> project proposal
  -> production-proposal.md
  -> user OK / option
  -> edit-plan / focus / music / assets / enrichment execution artifacts
```

它是确认层，不是 render source of truth。它可以说明剪辑、字幕、UI 动效、图片/生图、音乐和 SFX 的方向与选项，但最终剪辑仍由 `edit-plan`/`edl`，最终视觉和音频仍由 `focus-*`、`music-*`、`asset-manifest` 和 `enrichment-plan` 驱动。

## 增强层

enrichment 层位于 production proposal 确认之后、final render 之前。

```text
reviewed edit-plan
  -> validated EDL
  -> focus-candidates.json
  -> focus-frames.json
  -> focus-grounding.json
  -> focus-review.json
  -> internet visual acquisition for approved external visual assets
  -> visual-request.json / visual-search / visual-acquire / visual-review
  -> music-catalog / music-request.json / music-acquire / music-review
  -> agent/platform 按需准备 icons/Lottie/UI snippets/images/B-roll assets
  -> asset-manifest.json
  -> enrichment-plan.json
  -> project enrich-plan preflight qa_checks
  -> render clean.mp4
  -> vendored HyperFrames resource install
  -> storyboard.json
  -> storyboard.qa_checks[]
  -> .hyperframes/recut/public/index.html
  -> HyperFrames visual recut
  -> FFmpeg clean-audio attach and music/SFX mix
  -> renders/final.mp4
  -> inspect inspection_checks/report
```

CLI 负责校验、music acquisition、visual acquisition 中可确定执行的下载/导入、以及 composition 物化。skill 负责判断哪些时刻值得 enrichment、是否需要音乐/视觉素材以及使用哪个来源；agent/host 负责无法由 CLI 直接搜索的 internet-first handoff，包括通过 host MCP、API 或平台工具查找图标、动效图标、UI templates、图片或 B-roll，并把确认后的候选 metadata 和本地导出交给 CLI。

`enrichment-plan.json` 基于 output timeline，因为剪辑后 source timestamps 会变化。当前主合同是 `version:"1.2"`：`profile` 选择 `source_mode`，`elements[]` 选择 HyperFrames registry block/component、caption identity、animation rule、SFX、`visual_asset` 或 legacy generated asset。`visual_asset` 必须引用已经通过 `visual-review` 或 manifest provenance 校验的本地 asset。`version:"1.1"` 的 `captions`、`cards[]`、`music[]` 和 legacy `version:"1.0"` 的 `slots[]` 继续接受，并在 CLI 内部生成兼容 `elements[]`，但不再是新 skill 的主表达。

`storyboard.json` 是 render source of truth，也是 QA checklist source of truth。CLI 从 `enrichment-plan.json`、subtitles、asset manifest、visual review 和 music review 物化 `storyboard.qa_checks[]`；`project enrich-plan` 先返回同一批 planned QA checks 做 preflight；`project render` 写入 storyboard；`project inspect` 再按 storyboard 的 QA checks 抽帧并输出 `inspection_checks[]`。不要新增独立 `inspection-plan.json`。

`focus-candidates` / `focus-frames` / `focus-grounding` / `focus-review` 是 enrichment 的前置契约，不是可选备注。它们把开放式业务表述压缩成固定 intent，再把 UI 相关的坐标绑定到真实帧证据上，最后才允许进入 `enrichment-plan.json`。

Elements 和兼容 cards 可以包含可选归一化坐标：

- `target_rect`: `{ x, y, width, height }`，用于 screen focus boxes。
- `anchor_point`: `{ x, y }`，用于绑定可见 UI 位置的 callouts。

这些坐标是 output canvas 上的比例值，由 CLI 校验并传入 `storyboard.json`。agent 或 skill 从 screenshots/inspection 中推导坐标；CLI 在 v0 不做自动视觉定位。对 screen recordings，这些坐标必须能追溯到 `focus-frames` 中的 frame evidence，并在 `focus-grounding.json` 中被引用。

render 顺序必须保证生产正确性：

1. 从已校验 EDL 构建 clean base video。
2. 从 vendored HyperFrames registry 和 CLI resources 解析完整元素目录。
3. 从 enrichment plan、subtitles、source aspect ratio、本地 asset manifest、visual review 和 music review 物化 `storyboard.json`，并写入 `qa_checks[]`。
4. 应用 source-mode 默认值：talking-head avatar 素材允许完整包装，screen recordings 使用透明引导。
5. 将 `registry_block` / `registry_component` 安装到 `.hyperframes/recut/public/compositions/`，并生成 `.hyperframes/recut/public/index.html`。
6. `registry_block` 用 `data-composition-src` 挂载，`registry_component` 注入 host composition；caption identity 和旧 cards 仍在同一 composition 中渲染。
7. 渲染一个包含 clean video、caption rail、registry elements 和兼容 cards 的 HyperFrames composition。生成页面会注册 seekable `window.__timelines.recut` wrapper 供 HyperFrames capture。
8. 将原 clean audio 回贴到 visual render 上。
9. 混入带 fade 和 ducking 的背景音乐，并按 element timing 混入 vendored SFX。
10. 检查渲染输出，包括 captions 是否存在、enrichment summary、duration、source mode、`inspection_checks[]`、sampled card/element frames、grounding evidence 和 warnings。

HyperFrames 通过 `npx --yes hyperframes` 调用。缺失或失败的 HyperFrames 是需要 registry/caption visual recut plans 的 blocker，不能静默生成假 final。纯 audio/SFX-only enrichment 仍可不依赖 HyperFrames，直接使用 FFmpeg。

CLI vendor 了 HyperFrames 的可创建元素体系：`registry/blocks`、`registry/components`、`registry/examples`、embedded-captions theme/DNA、animation rules/blueprints、SFX、motion-graphics categories、talking-head references 和 creative frame presets。这些是 CLI resources，不是对外 agent skills。Agents 选择元素和 timing；CLI 校验、安装、渲染和报告。Agents 不能向 renderer 传任意 HTML、GSAP、URLs、绝对路径或 `..` 路径。GSAP/Google Fonts 等 runtime dependencies 只能通过 CLI allowlist 和固定版本 catalog 写入，不是公开动画 authoring surface。

vendored 元素进入 renderer 前会经过轻量 adapter 分层。Adapter 从 registry metadata 和少量 override 推导 family、render strategy、source-mode 推荐、screen safety、必填 params、坐标要求和 asset 要求。`registry_block` 默认使用安装到 `.hyperframes/recut/public/` 的原生 composition；code/screen-focus 类为了避免 demo token 或遮挡问题，使用 CLI-owned 透明 overlay。`registry_component` 按 caption component 或 anchored chip 消费，不再统一塞进一个 generic pill。SFX 仍走 FFmpeg mix，但在 element usage 和 report 中显示 adapter 信息。

## 分发

预期 v0 交付形式：

1. 公开 npm package `koubo-clip`，暴露 `koubo-clip` 命令。
2. 随 npm package 分发 CLI source、`packages/cli/vendor/hyperframes/` sidecar resources 和 `skills/koubo-clip/`。
3. 可选内部 tarball，包含当前平台的 `bin/koubo-clip` 二进制、`resources/hyperframes/` 和同一份 bundled skill。
4. `skills.sh.json` 用于让 skills.sh 识别和展示仓库内的 `koubo-clip` skill。

普通用户应安装 CLI 和唯一对外 skill，配置 providers，并通过 agent 运行工作流。他们不应需要 clone 源码仓库，也不应加载 `packages/cli/vendor/hyperframes/*` 中的上游资源目录。

Hermes 集成以后应使用同一套 artifacts，但 v0 不能依赖 Hermes TaskWorkspace、tenant state 或平台工具调用。
