# 需求

koubo-clip 通过分阶段 CLI 加 agent 工作流，把一个或多个本地口播视频变成更紧凑、带字幕、可选增强的 MP4。

## 问题

创作者录制自定义口播视频时，经常会有重复录制、误开头、口头禅和长时间等待。手动看完整段素材并剪掉这些部分很慢。这个工具应让 agent 读取 transcript 和检测出的候选片段，做可审查的剪辑决策，并渲染出更成品化的结果。

## 目标用户

- 录制教育类或产品类口播视频的短视频创作者。
- 发布前需要快速清理素材的知识创作者。
- 使用 Codex、Claude、Hermes 或类似 agents 处理本地视频文件的操作者。
- 希望使用可重复 CLI 加 skills 工作流，而不是纯 web 编辑器的内部团队。

## 产品目标

创建一个 Node.js CLI 和一个 bundled v0 skill，能够：

1. 接受一个或多个本地 source talking-head videos。
2. 在询问最终发布目标前先 explore 素材。
3. 生成带明确 timing granularity 的 transcript timeline。
4. 检测 silence、waiting、filler、false starts 和 repeated retakes。
5. 输出原始字幕、拟裁剪片段、时间戳和策略理由供 review。
6. 让用户或 agent 在 render 前确认或编辑计划。
7. 渲染 clean MP4 和 subtitles。
8. 可选渲染带 source-mode-aware captions、HyperFrames elements、images、SFX 和 music 的 enriched final MP4。
9. 报告完成前校验输出 artifacts。

## V0 范围

首版实现面向本地 Codex/Claude 风格 CLI 使用。Hermes TaskWorkspace 集成是后续目标；v0 合同应保持与 workspace refs 兼容的思路，但不要求 Hermes runtime、tenant IDs 或平台工具。

V0 只发布一个 skill：`koubo-clip`。只有当命令和 artifact 合同稳定后，才拆分 `koubo-clip-cli` 或 `koubo-clip-media`。

这个 skill 是唯一对外 agent 入口。按 `skill-creator` 的渐进披露原则，`SKILL.md` 只保留核心工作流；详细判断规则进入 `skills/koubo-clip/references/`。从 HyperFrames 上游搬来的 `SKILL.md`、motion/caption/media 指南只提炼成 koubo-clip references，不作为多个独立 skill 暴露给用户。

CLI 不使用 skill。CLI 只读取 project artifacts 和随 npm package 或内部二进制包分发的 sidecar resources。HyperFrames 的 registry、HTML fragments、caption themes、字体、SFX、runtime 配置和示例资源属于 CLI resources，开发态位于 `packages/cli/vendor/hyperframes/`，发布包中随同 CLI 分发。

公开分发主路径是 npm package `koubo-clip`，包含 CLI source、HyperFrames sidecar resources 和 `skills/koubo-clip/`。内部 tarball 仍可用于本地二进制交付，但不是首选公开分发方式。不把 `.env`、API key 或 MCP 配置写入任何发布包。

## 第一里程碑非目标

- 多用户 web app。
- 云存储或外部项目上传。
- 全自动创意视频工作室。
- 重度 OpenMontage pipeline 集成。
- 把自动 B-roll/image generation 作为必经路径。
- 把 Hermes TaskWorkspace 或平台工具集成作为必经路径。
- 没有 review package 的黑盒剪辑。
- 原地修改原始 source video。

## 参考项目

- `easy-video`: Node.js CLI、私有分发、bundled skills、分阶段 workflow 和 artifact validation 的参考。
- `video-use`: transcript-first editing、EDL rendering、subtitle generation 和 cut-boundary evaluation 的参考。
- `OpenMontage`: 更丰富 talking-head pipeline concepts、Remotion captions、visual overlays、music 和后续 enrichment 的参考。

参考项目是设计模式来源。koubo-clip 正常执行时不应依赖它们的源码树。

## 核心工作流

```text
project create
  -> 探索 source material
  -> material-report.md
  -> 询问用户目标
  -> review-package.md/json
  -> production-proposal.md/json
  -> 用户选择默认方案或修改选项
  -> 校验 edit-plan 和 EDL
  -> 渲染 clean video
  -> 按确认方案生成可选 focus / image / music / enrichment artifacts
  -> storyboard + HyperFrames recut
  -> audio/music mix
  -> 检查 output
```

`explore` 不是轻量探测。它应该转写音频、检查基础媒体事实、检测明显 timing 问题，并在询问用户最终目标前总结这批素材能变成什么。

## ASR 合同

V0 默认使用线上 Cloudflare Whisper adapter；本地 `whisper-cli` 只作为缺少线上配置时的兜底，或由 agent 显式指定用于离线测试。ASR 由开关控制：

```bash
koubo-clip project explore <project> --asr auto
koubo-clip project explore <project> --asr off
koubo-clip project explore <project> --asr external
```

- `auto`: 默认。已有 `transcript.json` 时使用它；否则优先运行线上 Cloudflare Whisper adapter；缺配置时才退到本地 `whisper-cli`。
- `off`: 要求已有 `transcript.json`；缺失则失败。
- `external`: 跳过内置 ASR，期待 agent 或用户提供 `transcript.json`。

默认 provider 是 `cloudflare-whisper`：

```bash
koubo-clip project explore <project> --asr auto
```

离线测试可以显式指定本地 provider：

```bash
koubo-clip project explore <project> --asr auto --asr-provider whisper-cli
```

`transcript.json` 必须声明 timings 是 `word`、`segment` 还是 `text-only`。Text-only transcripts 可以用于总结素材，但不能用于精确剪辑。中文 word-level 输出不能被当成精确 timing，除非 validation 证明它对该文件可靠。

## 清理检测

CLI 应检测客观候选片段：

- Long silence。
- Waiting gaps。
- Low-energy pauses。
- Common filler words。
- Short false starts。
- Adjacent repeated phrases。
- 第二版更完整的 retakes。

CLI 应标记不确定的语义决策，而不是静默剪掉。Skills 和 agents 负责 review transcript 并决定删除什么。

## 审查包

render 前，工作流应产出人类和机器都可读的 review artifacts：

- 带时间戳的 original transcript/subtitles。
- 带时间戳的 proposed removed transcript ranges。
- 每个 removal 的 candidate type。
- 每个 removal 的 strategy reason。
- Confidence 和 timing-granularity notes。
- 需要用户判断的 unresolved risks。

用户应能自然回复，例如“保留第 3 段，其他都剪掉”，skill 应把它转换成 `edit-plan.json`。

## 制作方案确认单

`production-proposal.json` / `.md` 是用户确认前的总方案。它由 skill/agent 基于 `material-report`、`review-package`、用户用途和 element/music 能力写入，CLI 负责校验并物化 markdown。

确认单必须同时覆盖剪辑、字幕、UI 动效、图片/生图、音乐、SFX、风险和可选方案。它回答“这条视频会被做成什么样”，而不是替代执行 artifacts。

确认单只允许承诺已经有证据的事实：可以引用 source timestamps 和 cleanup candidate IDs，但不能伪造最终 output timeline、无证据坐标、未生成 asset path、未获取音乐或 provider 结果。用户回复 `OK` 时使用 `recommended_option_id`；回复具体 option id 时使用对应方案。确认后，skill 再写 `edit-plan.json`、`focus-*`、`music-*`、`asset-manifest.json` 和 `enrichment-plan.json`。

## 增强

Enrichment 是一等可选阶段，不是隐藏装饰步骤。工作流应先通过 production proposal 确认成片方向；用户确认后，再把方案拆成 cleanup、focus、image/music 和 enrichment 执行 artifacts。

当前 enrichment 目标是 source-mode-aware recut：cleaned video 保持为 base layer，CLI 在一个 HyperFrames composition 中渲染 embedded caption rail、timed registry elements、兼容 cards/images、SFX 和 music。它不是一组彼此独立的黑盒 overlays。

Semantic Focus Planner 是 enrichment 的前置合同。用户可以用任意业务词汇描述目标，但这些词汇不是稳定 schema；CLI 和 skills 必须把它们归一化为固定的 semantic intent、element type 和 evidence contract，再进入最终 enrichment plan。

固定的 intent 是闭集，但分两层：`presentation_intent` 描述这条视频最终用途，当前接受 `internal_tutorial`、`product_demo`、`course_lesson`、`knowledge_explainer` 和 `short_form`；`semantic_intent` 描述某个 focus moment 要帮观众完成什么，当前接受 `orient_viewer`、`guide_attention`、`explain_sequence`、`summarize_payoff` 和 `pacing_relief`。元素能力同样是闭集：`registry_block`、`registry_component`、`animation_rule`、`caption_identity`、`sfx` 和 `generated_asset`。

Visual Grounding 是 coordinate-bearing 元素的证据合同。只要一个 screen-recording 元素使用 `target_rect`、`anchor_point` 或任何需要放置在 UI 上的坐标，它就必须带有可追溯的 frame evidence。证据可以来自 source frame 或 inspection frame，但不能只是抽象描述。

Semantic Focus Planner 物化的中间产物是：

- `focus-candidates.json` 和 `focus-candidates.md`：把用户目标归一化为业务角色、viewer job、视觉缺口、推荐处理方式、固定 intent、候选 element type、风险和所需证据。`recommended_treatment` 当前接受 `source_ui_component`、`generated_asset`、`text_or_caption`、`sfx_or_music` 和 `none`。
- `focus-frames.json` 和 `.focus/frames/*.jpg`：记录并保存用于 grounding 的 source frame 或 inspection frame，包含 source_id、timecode 和 frame path。
- `focus-grounding.json`：把候选 intent、元素、坐标和 frame evidence 绑定起来，形成可校验的 visual grounding contract。
- `focus-review.json` 和 `focus-review.md`：给人和 agent 看的 enrichment review surface，说明保留、拒绝和仍需确认的 grounding 选择。

推荐的命令顺序是先完成 review 和 production proposal，再按用户确认的 option 进入 semantic focus planning 和 final enrichment：

```text
project review
  -> project proposal
  -> user OK / option
  -> project element-catalog
  -> internet visual search/acquisition when visuals need external assets
  -> project focus-candidates
  -> project focus-frames
  -> project focus-grounding
  -> focus-review
  -> project enrich-plan
  -> project render
  -> project inspect
```

`project enrich-plan` 仍然是 final render 前的最后一份计划合同。它必须消费已经 grounded 的 intent 和 frame evidence，而不是重新解释业务关键词。

`storyboard.json` 是合成剧本清单，也是成片检查清单的唯一来源。Production proposal 决定“哪里要加入什么以及为什么”，`enrichment-plan.json` 表达执行选择，CLI 再把它物化成带 `qa_checks[]` 的 storyboard。Render 按 storyboard 合成；inspect 也按同一份 storyboard 抽取对应帧并报告每个加入点的证据，避免出现一份渲染清单和另一份手写检查清单互相漂移。

enrichment plan 必须先分类 cleaned material，再选择 visuals：

- `talking_head_avatar`: 主要是一个 speaker/avatar。允许完整包装：stack、split、PiP、不透明 cards、concept images 和低音量 ducked music。
- `screen_recording`: UI/code/browser/app workflow footage。保留 source 可读性。优先使用 transparent callouts、highlights、arrows、step labels、lower thirds 和 anchor captions。避免 opaque cards 遮住 UI。
- `mixed`: 保守默认。除非某段明确是 talking-head 或 interstitial moment，否则使用 screen-safe overlays。

enrichment plan 应回答：

- 适用哪种 source mode，以及它如何约束 visuals。
- 哪些时刻需要 visual help、emphasis 或 pacing relief。
- 哪些准确 output-timeline ranges 会接收 HyperFrames elements、caption emphasis、images、SFX 或 music。
- 每个 element/music segment 对 viewer 的作用是什么。
- 哪些 assets 是用户提供、agent/platform 生成，或仍缺失。
- 哪些选择需要用户在 media generation 或 render 前批准。

V0 enrichment 从完整可创建元素体系开始：

- `profile`: 默认 professional explainer style，包含 `source_mode:"talking_head_avatar"`、`caption_identity:"anchor"`、`layout:"stack"`、`style:"whiteboard"`、`frame:"clean"`、`aspect_ratio:"source"`。
- v1.2 `elements[]`，元素类型为 `registry_block`、`registry_component`、`animation_rule`、`caption_identity`、`sfx` 或 `generated_asset`。
- `project element-catalog` 暴露完整 HyperFrames 可创建元素目录，包括 blocks、components、examples、caption themes/DNA、animation rules/blueprints、SFX、motion categories、talking-head references 和 frame presets。
- `project element-catalog` 暴露的是 CLI resources 能力，不是让 agent 加载 HyperFrames 上游 skills。Agent 通过 catalog 选择元素，通过 koubo-clip references 理解决策规则。
- `project element-catalog` 还必须暴露每个元素的 adapter profile：family、render strategy、source-mode 适用性、screen safety、默认 zone、必填 params、坐标要求、asset 要求和已知限制，并按 source mode 返回 recommendations。业务关键词只是输入提示，不是 selector key。
- `project element-catalog` 必须额外返回 `purpose_recommendations`，按 `source_mode × presentation_intent` 给 agent 一个用途驱动的候选集。首版 intent 为 `internal_tutorial`、`product_demo`、`course_lesson`、`knowledge_explainer` 和 `short_form`。
- Enrichment 不是“迁移来的元素全用”，也不是“默认不用”。Agent 应先理解用户希望视频素材变成什么，再从 purpose recommendations 中选择最小有效元素集合，并把它们放进 focus-candidates / focus-grounding / review contract。
- 是否生图不由 `source_mode` 粗暴决定。Agent 应先写明每段的 `business_role`、`viewer_job` 和 `visual_gap`：可从源画面指给观众看的内容优先用 `source_ui_component`；源画面不可见的抽象概念、B-roll、品牌记忆点才用 `generated_asset`；没有 viewer job 的装饰应标记 `none`。
- 需要图标、动态图标、UI 组件、贴纸、模板或图片时，主路径是 internet-first visual acquisition：agent 通过 host MCP、API 或平台工具在互联网上语义检索现成素材，并在 proposal/review 中说明候选、来源、用途和风险。确认后，CLI 通过 `visual-search` / `visual-acquire` 把可下载或 handoff 的素材固化为 project-local assets。不要把“先建立长期本地 UI 素材库”作为前提。
- 首批外部来源按能力分层：UI 组件优先 shadcn MCP 和 21st.dev HTTP MCP；通用图标优先 Iconify API；动态图标优先 Lordicon official API；Lottie/dotLottie runtime 优先 LottieFiles dotLottie；Rive 和完整 React design systems 后置。选择依据是是否流行、活跃、官方支持 MCP/registry/API，以及是否能给出可审查 metadata。
- 本地 `assets/*` 只表示当前 project 的已确认渲染输入，不是跨 agent、跨项目复用的全局缓存。每次新任务应根据用户目标重新语义检索；如果互联网检索失败，应报告 blocker 或换 provider，而不是退回手写低质 UI。
- 互联网搜索和 provider 调用发生在 acquisition / host-agent 阶段；render 阶段仍只消费当前 project 已落地或 host workspace 可稳定引用的 assets，保证这一次输出可检查、可追踪。`visual_asset` 是 v1.2 的一等 element type；legacy `generated_asset` 继续兼容，但新图标/Lottie/UI/template 素材应优先用 `visual_asset` 引用。
- element 上可选归一化 `target_rect` 和 `anchor_point` 字段，让 agents 能基于真实 screen inspection 放置 focus boxes 和 callouts。值是 `[0,1]` 内的 ratios；CLI 校验边界。只要这些字段出现于 screen recordings，就必须有 frame evidence 和 `coordinate_source_frame`。
- v1.1 plans 默认开启 anchor captions，并继续支持 title、key-point、quote、flowchart、image、screenshot-focus 或 lower-third cards 作为兼容输入。
- 可选 caption emphasis moments。
- 可选用户提供或 agent-generated local images。
- 可选通过 Music Acquisition 获得的 background music，并使用 speech-safe mixing。

Generated images 和原创 B-roll 仍是 agent/platform 职责；icons、animated icons、Lottie、UI/template snapshots、贴纸、确定性图片或 B-roll 则优先通过 Visual Acquisition 获取或导入。只有找不到确定性素材或用户目标需要原创概念图时才使用 image generation。Music 进入 koubo-clip 的一等 acquisition 流程：CLI 可以扫描本地曲库、下载网络素材或调用 MiniMax 生成音乐，但 final render 只消费 project-local files；provider URL、API key 和临时下载链接不能成为最终 asset refs。Flowcharts、data cards、subtitles、software screenshots 和 deterministic text cards 应由 CLI 或 agent 以 HTML/SVG/source crops 生成，不应走 image models。

Visual Acquisition 也是一等 acquisition 流程。支持的首批 CLI 命令是：

```text
visual-catalog
  -> visual-request.json
  -> visual-search
  -> visual-candidates.json/md
  -> visual-acquire
  -> visual-acquisition.json + asset-manifest.json
  -> visual-review.json/md
  -> enrichment-plan.elements[].element_type = "visual_asset"
```

CLI 首版直接支持 Iconify API 搜索和 SVG 下载，也直接支持 Lordicon official API 搜索和 JSON/SVG 下载。Lottie import、shadcn 和 21st 作为 host/MCP handoff 候选来源，支持 `.json` Lottie、`.lottie`、SVG、静态图片或安全导出的 UI/template 文件固化到 `assets/icons`、`assets/lottie`、`assets/visuals` 或 `assets/images`。SVG 必须经过 sanitization；最终 asset path 仍只能是 project-relative local path。

对 screen recordings，image generation 是 opt-in，且必须在 plan 中说明理由。只在 intro/outro art、abstract concepts、brand icons 或原画面无法展示的 visuals 上使用。不要为原 recording 已经解释清楚的 UI steps 生成装饰 artwork。screen recordings 默认不加 background music；当用户目标是 `short_form`、课程包装或发布传播时，可以通过 Music Acquisition 获取低音量、ducked music。talking-head avatar packaging 在支持 publishing goal 时可默认建议低音量开启。

Music Acquisition 是 enrichment 的前置可选阶段。它必须先暴露音乐来源和用途，再生成或下载资产：

```text
review/focus/enrichment intent
  -> music-catalog
  -> music-request.json
  -> music-acquire
  -> music-review.json/md
  -> asset-manifest.json
  -> enrichment-plan.music[]
  -> render/inspect
```

支持的首批来源是本地曲库、Freesound、Pixabay 和 MiniMax Music。CLI 负责 provider 状态、获取、license/provenance 记录、duration/hash 检查和 manifest 写入；skill 负责根据用户目标说明为什么需要音乐，以及是否接受授权/成本。

本阶段只解决背景音乐，不实现 TTS、旁白重配或 voice performance。用户原始口播音频默认保留；后续如果需要 AI 旁白，再单独引入 voice-generation 合同。

MiniMax 等 AI 音乐请求必须带有可审查的 music prompt。Prompt 应描述风格/类型、BPM 或节奏、情绪/调性、主要乐器、能量曲线和用途，并明确这是 background/underscore、纯音乐、no vocals。Screen recording 默认使用克制、speech-safe、低频铺底的 prompt；short_form 或 talking-head packaging 才允许更强节奏。

完整迁移后的质量来自 adapter 消费，而不是盲目挂载 demo blocks。Semantic registry elements 必须用 `params.title`、`params.subtitle`、`params.detail`、`params.code` 或 `params.username` 替换 demo 文案。Screen focus elements 必须有 `target_rect`；anchored chips/callouts 必须有 `anchor_point`。缺少这些输入时，CLI 应在 `project enrich-plan` 阶段失败。

只有当 enrichment 内容真正值得占用屏幕时才添加：

- 当 viewer 需要 attention guidance 时，添加 `screenshot_focus`、`lower_third` 或 `key_point`，不要为了装饰而添加。
- 当 speaker 描述 source screen 没有明显展示的 sequence 或 decision path 时，添加 `flowchart`。
- 当目标是 `internal_tutorial` 或 `product_demo` 且 source 是 screen recording 时，优先使用 `target_rect`/`anchor_point` 驱动的 focus、cursor/click、marker sweep、small callout 和 SFX；不要默认插入图片或背景乐。
- 当目标是 `short_form` 或 talking-head packaging 时，可以使用 hook/title packaging、kinetic caption、lower-third、social/app/data blocks、concept images、SFX 和 ducked music，但每个元素都要说明 viewer job。
- 只有当 concept 在 source video 中不可见，或用户明确要 short-form packaging 时，才添加带本地 `asset_id` 的 `image`。Screen recordings 应保持 image cards 小而侧边放置。
- 只有当目标是 packaged/published content 时，才添加 background music。Screen recordings 应保持低音量并 duck；avatar talking-heads 中，低音量 ducked music 可用于改善 pacing。音乐来源必须来自 `music-request.json` / `music-acquire` 审查后的本地 asset，不能在 render 阶段临时联网获取。
- 不要为 subtitles、UI screenshots、flowcharts、data cards 或 source-visible steps 添加 generated images；改用 HTML/SVG/crops/transparent overlays。

CLI 应在 final render 前校验 enrichment inputs：

- Element/card/music times 基于 cleanup 后 output timeline。
- Caption identity 受支持，且 captions 保持可读。
- Text、image 和 registry elements 留在 safe areas 内，并遵守 source-mode opacity rules。
- 引用的 image/music/video 文件存在。
- Music 定义了 volume、fade 和 ducking settings。
- `storyboard.json` 可从 enrichment plan 确定性物化。
- `storyboard.json.qa_checks[]` 可从 enrichment plan、asset manifest、visual review 和 music review 确定性物化。每个视觉、字幕强调、SFX 或 music 加入点都应有 expected、timing、asset/provenance 摘要、preflight status 和 warnings。
- `project enrich-plan` 为高风险 screen-recording choices 返回 `source_mode`、`element_usage[]` 和 non-blocking `warnings[]`。
- `project enrich-plan` 返回 `qa_checks[]`，让 skill 在 render 前展示 planned QA，而不是等成片后才发现素材或坐标问题。
- `project inspect` 返回 `source_mode`、`element_usage[]`、`inspection_checks[]` 和 `.inspection/*.jpg` frame paths。每个 visual check 默认抽中点帧，持续 6 秒以上的加入点抽开始、中点和结束附近 3 帧；SFX/music 不抽视频帧，但仍进入 QA check。CLI 只给出 `sampled`、`warning` 或 `blocker`，不自动声明“美观通过”。grounded screen-recording elements 还应能追溯到 `focus-frames` 中的 evidence frame。

首个支持的 render path 是：

```text
enrichment-plan.json
  -> storyboard.json
  -> vendored HyperFrames resource install
  -> .hyperframes/recut/public/index.html
  -> allowlisted fixed-version CDN dependencies
  -> HyperFrames visual recut
  -> FFmpeg clean-audio attach + music/SFX ducking
  -> renders/final.mp4
```

生成的 HyperFrames workspace 只能使用 CLI catalog 写入的 runtime dependencies。允许直接加载白名单 CDN 上的固定版本 scripts/styles，例如 `gsap@3.14.2`；Google Fonts family CSS 是首个明确记录的 versionless exception。`storyboard.json`、inspect JSON 和 `report.md` 必须暴露 block usage、element usage 和 CDN dependencies。Agents 可以选择 moments、`element_id`、`element_type` 和 coordinates，但不能提供任意 GSAP、JavaScript、external scripts 或 HTML。

legacy `version:"1.0"` `slots[]` plans 继续接受，并在内部转换成 v1.1 cards/music 和 v1.2 element usage。旧的大黑框 overlay style 不再是主路径。

后续 enrichment 可以加入 matting/text-behind-person、Remotion、更广 OpenMontage-style packaging、generated scenes 和 reusable overlay components。

## 期望产物

```text
koubo-clips/<slug>/
  sources.json
  source/
    001-original.<ext>
    002-original.<ext>
  material-report.md
  transcript.json
  transcript.md
  analysis.json
  review-package.md
  review-package.json
  production-proposal.md
  production-proposal.json
  focus-candidates.md
  focus-candidates.json
  focus-frames.json
  focus-grounding.json
  .focus/
    frames/
  focus-review.md
  focus-review.json
  visual-catalog.md
  visual-catalog.json
  visual-request.json
  visual-candidates.md
  visual-candidates.json
  visual-acquisition.json
  visual-review.md
  visual-review.json
  edit-plan.json
  edl.json
  enrichment-plan.json
  storyboard.json
  asset-manifest.json
  subtitles.srt
  .hyperframes/
    recut/
      public/
        index.html
        cards/
  assets/
    icons/
    images/
    lottie/
    music/
    overlays/
    visuals/
  renders/clean.mp4
  renders/final.mp4
  report.md
```

## 成功标准

- Source media 永不被覆盖。
- 用户或 agent 可以在 final render 前检查每个决策。
- report 展示 original subtitles、proposed cuts、timestamps 和 reasons。
- Multi-source projects 从 manifest、transcript、review、EDL、render 到 report 都保留 source identity。
- ASR timing granularity 明确，并被 cut planning 尊重。
- Rendered MP4 可在本地播放。
- 启用 captions 时，captions 存在且同步。
- Speech 不会在 cut boundaries 被截断。
- report 解释 removed segments 和 unresolved risks。
- CLI 在实现后可以为 agent automation 运行 dry-run 或 JSON mode。
