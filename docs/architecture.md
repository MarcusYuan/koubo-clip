# 架构

koubo-clip 采用与 easy-video 相同的高层分层：安装后的 CLI 负责确定性工作，skill 引导 agents 走分阶段工作流。

## 分层职责

| 层 | 职责 |
| --- | --- |
| CLI | Artifact contract registry 与 schema/template/example discovery、本地项目文件、公开 artifact manifest/status、provider execution mode 锁定、媒体探测、ASR adapter 开关、transcript 归一化、source-frame request 校验和确定性 JPEG 抽取、候选片段检测、review artifacts、production proposal 聚合校验和 markdown 物化、EDL 校验、字幕、focus-candidates/frames/grounding/focus-review 物化、music/visual request 校验和 artifact 摄入、standalone provider acquisition、enrichment/schema 校验、source-mode 默认值、storyboard 物化、HyperFrames composition 生成、FFmpeg render 组装、render-result 与 structured inspection |
| Skill | 用户对话、provider execution mode 选择、读取 CLI artifact contract、explore 后选择 source-local 语义抽帧点、结合 ASR 和画面事实理解素材、生成和展示 production proposal、语义 edit review、source-mode 与 presentation-intent 分类、semantic focus planning、grounding review、ASR/music/visual/image/component request specs、enrichment 选择、命令选择、artifact 解读 |
| Agent/platform | 对 source frames 做视觉语义分析；在 platform mode 下执行 ASR、生图、生音乐、音乐获取、视觉素材搜索、UI 组件下载、MCP/ConnectorTool handoff；产出 TaskWorkspace refs、受控 metadata、本地 asset 文件或未来 workspace refs |
| Environment | FFmpeg、ffprobe、standalone 默认线上 ASR 用 Cloudflare Whisper、standalone 显式离线兜底用 `whisper-cli`、交付中锁定的本地 HyperFrames binary、standalone 外部媒体生成工具和音乐 provider credentials |

## Provider Execution Mode 边界

一个 koubo-clip project 只能处于一个 provider execution mode：

- `standalone`: CLI 和本地 agent 可以使用本机配置的 provider。所有 provider 输出仍必须先固化为 project-local artifacts，再进入 render。
- `platform`: Hermes / TaskWorkspace / LocalAgent / 员工能力运行。平台 Capability、ConnectorTool 或 MCP 拥有 provider 执行、凭证、额度、审计和 provenance；CLI 不主动调用外部 provider，不读取 provider key，不消费 provider URL 或 MCP 原始结果。

provider execution mode 应在创建或摄入 project 时锁定。后续命令可显式传同一个 `--provider-mode` 便于日志审计，但不能在同一 project 内切换。需要切换时创建新的 project。该 mode 不属于 `enrichment-plan.profile`；后者只描述视频包装/source-mode 风格。

platform mode 下仍由 skill 决定“需要什么”：先基于 transcript、素材事实和用户目标给出 2-4 个业务剪辑方向；用户选定方向后，skill 写执行方案和素材需求槽位。槽位描述音乐 mood/duration/ducking、视觉素材 viewer job/query/asset type、UI component、SFX 或 image brief。平台工具负责满足这些 slots；CLI 只验证 request/fulfillment 是否落成可渲染 artifact。V0 平台接入的 CLI 输入仍是 project-local materialized files 和归一化 JSON；Hermes 的 `workspace_ref`、`asset_id` 或 `local_artifact_id` 应由 host/LocalAgent 先解析并写入当前 TaskWorkspace/project，再交给 CLI。CLI 未来可以扩展 stable workspace ref schema，但不能在未实现前把 provider URL、绝对路径或 raw MCP payload 当作等价替代。

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

## Artifact Contract Registry

CLI 内部维护公开 artifact contract registry，作为 runtime validator、schema discovery、template、example、capabilities 索引和 contract digest 的单一结构事实来源。每项声明 artifact ID、文件名、唯一当前 schema version、ownership、role、writer、validator/producer、lifecycle prerequisites 和 schema digest。

Registry 的递归 schema validator 是所有 Agent/Host authored artifact 的结构校验入口。Runtime parser 只在结构校验通过后做类型化和项目上下文检查；不能另行维护一份更严格但不可发现的字段合同。所有可写合同必须提供闭合嵌套 schema、完整 template 和可被当前 parser 接受的 example。

Ownership 固定分为：

- `agent_authored`：Skill 引导 Agent 编写，CLI 提供完整 schema、template、合法 example 和聚合 validator；
- `host_authored`：授权宿主/capability 编写，CLI 提供完整 schema、example、摄入命令和安全约束；
- `cli_owned`：CLI 独占生成，只公开只读 schema 和 producer/verify/inspect，明确禁止外部写入。

对外提供一次读取的 JSON 合同面：

```bash
koubo-clip artifact contract production-proposal --json
```

命令返回唯一当前 schema、结构闭合 template、合法 example、ownership、validator、prerequisites 和 digest。`capabilities --json` 只返回 contract index，不内联全部 schema。Skill 先读取合同，再按业务 reference 引导 Agent 填写；CLI 不做业务选择，Skill 不复制 CLI-owned required/enum/禁止字段。命令不接受 version 选择；artifact 自带 version 只用于 fail-closed 和交付身份。

Agent/Host authored artifact 的校验保持 fail-closed，但一次尽可能返回完整、有界的 `issues[]`，每项包含 JSON path、稳定 keyword/code 和 message。完整合同见 `docs/artifact-authoring-contracts.md`。

## 命令模型

分阶段工作流应作为高质量路径：

```bash
koubo-clip artifact contract production-proposal --json
koubo-clip project create ./raw.mp4 --provider-mode standalone
koubo-clip project explore koubo-clips/raw --asr auto --json
koubo-clip project source-frames koubo-clips/raw --json
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

`project proposal` 是用户确认入口。Skill/agent 先读取当前 3.0 artifact contract，再写入 `production-proposal.json`；CLI 聚合校验完整结构、跨字段约束、cleanup candidate 引用和 provider 枚举，然后生成 `production-proposal.md`。被确认的 option 是后续执行真相：其 `duration_target`、有序 `timeline`、`text_overlays` 和 `asset_requirements` 会继续约束 `edit-plan`、`compile-edl`、`enrichment`、`render` 和 `inspect`。proposal 本身不生成 `edit-plan`、`focus-*`、`music-*`、`asset-manifest` 或 `enrichment-plan`，也不联网、不生图、不 render。

`project source-frames` 是 ASR/explore 之后、制作方案之前的本地证据命令。Skill/agent 从 transcript、material report 和 source metadata 中选择 source-local 时间点并写 `source-frame-request.json`；CLI 校验 request 和 project-local source containment，按顺序抽取 `.source-frames/*.jpg` 并写 `source-frames.json`。该命令不读取 EDL，不做 output-timeline 映射，不调用 vision/provider，不联网，也不读取 key；`standalone` 和 `platform` 下执行行为相同。Vision capability 是否存在由 host workflow 处理，不是 CLI blocker。

三类 frame 的 timeline 和阶段不能混用：

- Source frames 在用户确认前生成，request 直接使用 source-local time，只用于理解原素材。
- Focus candidates 在方案确认后使用 cleaned output-timeline timing；`project focus-frames` 经 EDL 映射后生成 source-local evidence，`focus-frames.json` 因而记录 source timeline evidence，而不是笼统的 output timeline 截图。
- Inspection frames 在 render 后从 final output timeline 抽取，用于成片 QA。

`project element-catalog` 是 enrichment 选型入口。它输出完整 HyperFrames catalog、每个元素的 adapter profile、按 source mode 分组的 `recommendations`，以及按 `source_mode × presentation_intent` 分组的 `purpose_recommendations`。Agent 先从用户目标推断 presentation intent，再从该矩阵选择元素；CLI 只校验和消费选择结果，不替 agent 做创意判断。

外部视觉素材不是本地库优先。需要 icon、animated icon、UI component、sticker、template、B-roll 或图片时，skill/agent 应直接走 internet-first visual acquisition：通过已安装 host MCP、API 或平台工具语义检索互联网上的现成素材，向用户展示候选和来源，确认后把本次任务需要的文件或 workspace ref 写入当前 project artifacts。`assets/images`、`assets/icons`、`assets/lottie`、`assets/visuals` 只是当前 project 的渲染输入，不是长期全局缓存。

`project focus-candidates` 负责校验 agent 写入的固定 semantic intent 和 element type 候选集，并生成可读摘要。`project focus-frames` 负责把 cleaned output-timeline candidate timing 经 EDL 映射为可引用的 source-local evidence。`project focus-grounding` 负责校验候选集、坐标和 evidence 的绑定关系，并拒绝没有 frame evidence 的 screen-recording coordinates。`project focus-review` 负责生成可合并到 enrichment plan 的 `proposed_elements[]`。`project enrich-plan` 只消费已经 grounded 的结果。

`project music-catalog` 是音乐来源入口。在 `standalone` mode 下，它扫描本地曲库并报告 MiniMax、Freesound 和 Pixabay 的可用性；`project music-acquire` 根据 `music-request.json` 获取或生成音乐，写入 `assets/music/`、`music-acquisition.json` 和 `asset-manifest.json`；`project music-review` 输出 human/agent review surface。在 `platform` mode 下，`music-request.json` 是 skill 给平台 capability 的需求规格；CLI 只接受已经落地的 project-local/local asset 或已有 acquisition/review artifact，不能触发 MiniMax、Freesound、Pixabay 等 provider。

`project visual-catalog` 是互联网视觉素材来源入口。在 `standalone` mode 下，它报告 CLI-owned Iconify/Lordicon、Lottie/dotLottie import、shadcn/21st handoff 能力，以及 HyperFrames 允许加载的固定版本 CDN runtime。在 `platform` mode 下，它只报告 host-managed/disabled 能力和 runtime allowlist，不读取 provider key 或本机 provider 状态。`visual-candidates` 是公开的 host-authored evidence contract；host 写入前必须读取 `artifact contract visual-candidates --json`。`project visual-search` 校验 `visual-request.json` 和候选合同，执行 CLI-owned Iconify/Lordicon 搜索或读取 host/MCP handoff 候选，写入或登记 `visual-candidates.json/md`。搜索和 provider list 只召回候选；agent/host 做语义审查后把 `selected_candidate_id` 和 `selection_reason` 写回 request，CLI 才执行 acquire。`selected_candidate_id` 是唯一授权，`recommended` 和候选顺序不构成 fallback；request `reason` 解释槽位需求，`selection_reason` 解释具体选择。决定 no insert 的槽位从最终 `requests[]` 删除，并在 business/focus review 中保留原因；空 requests 不进入 acquire。

Visual acquisition 的数据流固定为 `recall -> semantic selection -> selected asset materialization -> deterministic acquire`。候选 `preview_path` 是 project-local 预览，只能用于比较，不能替代完整素材；`local_path` 是 platform 对选中候选完成授权和物化后的 acquire 输入。`project visual-acquire` 只下载或导入明确选择的可渲染候选，经过 SVG sanitization 和 path safety 后写入 `assets/icons`、`assets/lottie`、`assets/visuals` 或 `assets/images`，并更新 `asset-manifest.json`。在 `standalone` mode 下，CLI 可以执行 provider 搜索和下载，但仍不得自动选择；在 `platform` mode 下，平台 visual/component tools 负责搜索、授权、语义选择和仅对选中素材的物化，CLI fail closed 地校验 selection、project-local `preview_path`/`local_path` 和 provenance，不请求 Iconify/Lordicon/URL/MCP provider，也不保留 provider URL 字段。`project visual-review` 同时保留 usage reason 和 selection reason。现有 request/candidate artifacts 足够表达该边界，不新增 selection artifact 或平台专属对象。

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

- 当前 CLI version、artifact contract version/digest、ownership 和 authoring availability。
- Agent/Host authored artifact 的完整 schema、template、example、validator 和 lifecycle prerequisites。
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

Agent 编写 artifact 前先通过 capabilities/status 确认版本和项目状态，再通过 artifact contract discovery 获取结构。仓库源码、TypeScript 类型和 test fixture 不能成为正式作者合同的一部分。

## Artifact 权威状态与生命周期

Artifact 状态不能由文件存在、mtime 或文件名推断。Koubo Clip 的目标状态使用 project-root `artifact-manifest.json` 记录 schema version、content fingerprint、作者/validator/producer、command contract 和直接输入 fingerprints，并通过只读 `project status` 计算 `missing`、`pending_validation`、`current`、`stale`、`invalid` 和 workflow stage 状态。

完整目标合同见 `docs/artifact-lifecycle.md`。该合同的关键架构选择是：

- `project.json` 只保存 project identity 和 immutable provider mode，不保存可与独立 artifact 冲突的业务计划；
- JSON 承担机器合同，Markdown 是可重建 human view；
- proposal 是确认事实，edit plan 是唯一 cleanup 决策，EDL 是 CLI 派生的编译结果；
- `enrichment-plan.json` 2.0 是唯一最终素材使用计划；独立 `asset-usage-plan.json` 是当前简化 handoff 输入，只能由 `project enrich-plan` 一次性归一化。`project.json` / `edit-plan.json` embedded usage 字段无效；
- storyboard 是带 input lineage 的 CLI-derived executable，不是独立业务决定；
- render 成功物化 `render-result.json` 并明确 canonical output，inspect 不按 `final.mp4` 是否存在猜测输出；
- inspect 成功物化 `inspection.json`，`report.md` 从它生成；
- 外部宿主通过 `capabilities` 和 `project status` 接入，不扫描 project directory。

在实现完成前，本节描述目标架构，不改变当前 CLI 的已实现命令面。对应行为落地时必须同步 rules、Skill、README 和 tests。

## 制作方案层

Production proposal 位于 `review-package` 之后、执行 artifacts 之前：

```text
material-report + review-package + user goal
  -> production-proposal.json
       options[2-4]
       each = business_direction + edit_execution_plan + asset_requirements
       recommended_option_id
  -> project proposal
  -> production-proposal.md
  -> user confirms recommended option or one option id exactly once
  -> edit-plan / focus / music / assets / enrichment execution artifacts
```

它是确认层，不是 render source of truth。它可以说明业务方向、剪辑、字幕、UI 动效、图片/生图、音乐和 SFX 的方向与选项，也可以包含 `asset_requirements` 槽位；但最终剪辑仍由 `edit-plan`/`edl` 驱动，最终视觉和音频只由 current `enrichment-plan.json` 驱动。`asset-manifest.json` 证明素材已校验，`prepared-assets.json` 只表示外部素材已准备；两者都不表示会入片。当前独立 `asset-usage-plan.json` 必须先经 `project enrich-plan` 一次性归一化，不能被 render 直接消费。

确认后的 option fingerprint 直接进入执行链：`edit-plan` 的 cut set 必须和被选 option 的 cleanup 决策一致，`enrichment-plan` 只能落在该 option 的字幕、视觉、音乐和 SFX 语义范围内。未确认的方案变化只能先回到 proposal 重新确认，不能在执行层静默补齐。

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
  -> render-result.json (exact inputs + canonical output)
  -> inspect current render result
  -> inspection.json
  -> report.md
```

CLI 负责校验、music acquisition、visual acquisition 中可确定执行的下载/导入、以及 composition 物化。skill 负责判断哪些时刻值得 enrichment、是否需要音乐/视觉素材以及使用哪个来源；agent/host 负责无法由 CLI 直接搜索的 internet-first handoff，包括通过 host MCP、API 或平台工具查找图标、动效图标、UI templates、图片或 B-roll，并把确认后的候选 metadata 和本地导出交给 CLI。

`enrichment-plan.json` 基于 output timeline，因为剪辑后 source timestamps 会变化。当前唯一合同是 `version:"2.0"`，结构固定为 `profile + elements + audio`：`profile` 选择 `source_mode`；`elements[]` 只选择 HyperFrames `registry_block`、`registry_component`、`animation_rule`、`caption_identity` 或 `visual_asset`；`audio.music[]` 与 `audio.sfx[]` 表达音频计划。所有图片、生图、图标、Lottie、UI handoff 和 B-roll 都作为已验证 `visual_asset` 引用，并通过 manifest provenance 区分来源。`cards`、`slots`、顶层 `captions` / `music`、`generated_asset` 和 element-level SFX 输入无效。

`storyboard.json` 是 current enrichment inputs 派生出的 render-time executable 和 QA checklist，不是独立业务决定或项目完成证明。CLI 从 `enrichment-plan.json`、subtitles、asset manifest、visual review 和 music review 物化 `storyboard.qa_checks[]`；`project enrich-plan` 先返回同一批 planned QA checks 做 preflight；`project render` 只消费 lineage current 的 storyboard，并把其 fingerprint 写入 `render-result.json.inputs[]`。`project inspect` 的首要输入是 current `render-result.json` 及其 canonical output；只有该结果实际绑定的 current storyboard 才能提供本次 `inspection_checks[]`。不要新增独立 `inspection-plan.json`，也不要让旧 storyboard 因文件仍存在而进入当前 inspection。

本地 authoring render 和 strict render 共享同一个 `executeResolvedRenderPlan`。它们可以在不同路径上进入，但必须使用同一帧时序、同一输出规格和同一 inspection 门禁；如果 `inspection.json` 记录了 blocker，就只说明结构化验收结果存在，不说明成片通过。

`focus-candidates` / `focus-frames` / `focus-grounding` / `focus-review` 是 enrichment 的前置契约，不是可选备注。它们把开放式业务表述压缩成固定 intent，再把 UI 相关的坐标绑定到真实帧证据上，最后才允许进入 `enrichment-plan.json`。

Elements 可以包含可选归一化坐标：

- `target_rect`: `{ x, y, width, height }`，用于 screen focus boxes。
- `anchor_point`: `{ x, y }`，用于绑定可见 UI 位置的 callouts。

这些坐标是 output canvas 上的比例值，由 CLI 校验并传入 `storyboard.json`。agent 或 skill 从实际 focus evidence screenshots 中推导坐标；CLI 在 v0 不做自动视觉定位。对 screen recordings，这些坐标必须能追溯到 `focus-frames` 中的 source-local frame evidence，并在 `focus-grounding.json` 中被引用。

render 顺序必须保证生产正确性：

1. 从已校验 EDL 构建 clean base video。
2. 从 vendored HyperFrames registry 和 CLI resources 解析完整元素目录。
3. 从 enrichment plan、subtitles、source aspect ratio、本地 asset manifest、visual review 和 music review 物化 `storyboard.json`，并写入 `qa_checks[]`。
4. 应用 source-mode 默认值：talking-head avatar 素材允许完整包装，screen recordings 使用透明引导。
5. 将 `registry_block` / `registry_component` 安装到 `.hyperframes/recut/public/compositions/`，并生成 `.hyperframes/recut/public/index.html`。
6. `registry_block` 用 `data-composition-src` 挂载，`registry_component` 注入 host composition；caption identity 和当前 elements 在同一 composition 中渲染。
7. 渲染一个包含 clean video、caption rail 和 registry elements 的 HyperFrames composition。生成页面会注册 seekable `window.__timelines.recut` wrapper 供 HyperFrames capture。
8. 将原 clean audio 回贴到 visual render 上。
9. 混入带 fade 和 ducking 的背景音乐，并按 element timing 混入 vendored SFX。
10. 在 managed staging path 对渲染输出做 media probe、duration 和 SHA-256 校验，再原子替换公共输出。
11. 最后提交 artifact manifest success，并写 `render-result.json`，记录 exact inputs、output hashes/probes 和 canonical output；没有该 current result，MP4 不构成成功。
12. 独立 `project inspect` 读取 current render result 的 canonical output，校验其 hash/probe 和绑定的 current storyboard，物化 namespaced inspection frames、`inspection.json` 与派生 `report.md`。

HyperFrames 通过交付中锁定的本地 `hyperframes@0.7.36` binary 调用，禁止 floating `npx --yes` 下载。缺失、版本不匹配或失败是需要 registry/caption visual recut plans 的 blocker，不能静默生成假 final。纯 audio/SFX-only enrichment 仍可不依赖 HyperFrames，直接使用 FFmpeg。

CLI vendor 了 HyperFrames 的可创建元素体系：`registry/blocks`、`registry/components`、`registry/examples`、embedded-captions theme/DNA、animation rules/blueprints、SFX、motion-graphics categories、talking-head references 和 creative frame presets。这些是 CLI resources，不是对外 agent skills。Agents 选择元素和 timing；CLI 校验、安装、渲染和报告。Agents 不能向 renderer 传任意 HTML、GSAP、URLs、绝对路径或 `..` 路径。GSAP/Google Fonts 等 runtime dependencies 只能通过 CLI allowlist 和固定版本 catalog 写入，不是公开动画 authoring surface。

vendored 元素进入 renderer 前会经过轻量 adapter 分层。Adapter 从 registry metadata 和少量 override 推导 family、render strategy、source-mode 推荐、screen safety、必填 params、坐标要求和 asset 要求。`registry_block` 默认使用安装到 `.hyperframes/recut/public/` 的原生 composition；code/screen-focus 类为了避免 demo token 或遮挡问题，使用 CLI-owned 透明 overlay。`registry_component` 按 caption component 或 anchored chip 消费，不再统一塞进一个 generic pill。SFX 仍走 FFmpeg mix，但在 element usage 和 report 中显示 adapter 信息。

## 分发

预期 v0 交付形式：

1. 公开 npm package `koubo-clip`，暴露 `koubo-clip` 命令。
2. 随 npm package 分发 CLI source、`packages/cli/vendor/hyperframes/` sidecar resources 和 `skills/koubo-clip/`。
3. npm 正式发布使用 canonical staging：先让 npm packlist 物化最终文件树，再从该树生成 delivery manifest 和唯一 tarball；发布、GitHub Release 与安装态验收消费同一 tarball，不从源码 checkout 二次打包。
4. `delivery-manifest.json` 3.0 的 `artifact_contracts_digest` 绑定唯一当前 registry，`delivery_digest` 聚合 CLI、official Skill、renderer resources、runtime compatibility、artifact contracts、schema、capabilities 和 exact dependencies，作为跨 Hermes/LocalAgent 的完整交付身份；component digests 仍用于定位具体损坏面。
5. 可选内部 tarball，包含当前平台的 `bin/koubo-clip` 二进制、`resources/hyperframes/` 和同一份 bundled skill。
6. `skills.sh.json` 用于让 skills.sh 识别和展示仓库内的 `koubo-clip` skill。

正式发布包还必须包含 artifact contract registry、schemas/templates/examples，并让 delivery identity 绑定 registry/schema digests 和 official Skill digest。安装态验收从 canonical tarball 的空目录安装开始，在不访问源码/tests 的情况下读取 production proposal 3.0 合同、生成 2-4 个完整 options、通过 proposal validator，并继续验证 option fingerprint 到 edit plan/EDL 的绑定。

普通用户应安装 CLI 和唯一对外 skill，配置 providers，并通过 agent 运行工作流。他们不应需要 clone 源码仓库，也不应加载 `packages/cli/vendor/hyperframes/*` 中的上游资源目录。

Hermes 集成以后应使用同一套 artifacts，但 v0 不能依赖 Hermes TaskWorkspace、tenant state 或平台工具调用。

## Portable authoring 与 strict execution

```text
authoring agent: sources identity -> review/proposal/edit-plan -> portable EDL/captions/resolved storyboard -> immutable bundle
strict machine: bundle + explicit source map -> verified binding -> executeResolvedRenderPlan -> result -> inspection
```

Skill 只存在于 authoring 段。CLI compiler 把 agent decisions 解析成冻结后的执行闭包；strict runtime 与 authoring runtime 只在 `executeResolvedRenderPlan` 汇合。Strict runtime 不读取 transcript、analysis、edit-plan 或 enrichment-plan，也没有 fallback。

Strict timeline 的权威时长属于 output frame domain：CLI 按累计 output time 对 `fps` 取整得到每个片段的帧边界，总帧数是最后一个累计边界，`preflight.expected_duration_seconds = total_frames / fps`。渲染器在同一个 FFmpeg filter graph 中把各片段归一化到精确帧数和音频采样数后 concat；inspect 同时校验 exact video frame count 和容器时长容差。禁止逐段独立取整、逐段封装 MP4 后 copy-concat，或按片段数量扩大 tolerance。

Source lineage 分为 `source-identity:*`、`source-materialization` 和 `source:*` bytes。规划依赖 identity；ASR、抽帧和本地 render 才依赖 bytes。External evidence import 先验证完整批次的 containment、regular-file、hash、size、JPEG probe 和 request/EDL mapping，再原子发布 canonical evidence。

Evidence JPEG probe 在进程边界区分 executable/transport unavailable、non-zero exit、invalid output、codec mismatch 和 dimension mismatch；size、hash、request/candidate binding 分别校验。错误只暴露稳定 code 和脱敏事实。

Lineage 可以包含 `proposal-selection:*`、`source-identity:*` 等逻辑节点，但 `.virtual/*` 是内部实现路径，不进入公开 `artifacts[].path`。外部所需逻辑 fingerprint 通过 status 的 `fingerprints` map 或对应命令结果获取。当任一 source 未 materialize 时，authoring status 选择 distributed execution 分支：合同导出前推荐 export，导出后声明 handoff ready 并给出 strict consumer 命令链；本地 project render/inspect 不进入该分支的完成条件。
