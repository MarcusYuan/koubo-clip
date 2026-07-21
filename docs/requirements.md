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
10. 通过公开、可恢复的 artifact lineage 和 project status 合同，区分 current、stale、invalid、derived、evidence 和 human-readable artifacts；宿主不需要扫描目录猜测状态。
11. 通过 CLI-owned、版本化的 artifact 作者合同，让只安装正式 CLI 和官方 Skill 的 Agent 能在不读取仓库源码的情况下，一次生成或有界修正合法业务 artifact。

Artifact 权威状态、fingerprint、失效和恢复的目标合同见 `docs/artifact-lifecycle.md`。在对应 CLI、Skill、rules 和测试落地前，该文档描述的是本轮修复目标，不表示当前实现已经完成。

## V0 范围

首版实现面向本地 Codex/Claude 风格 CLI 使用。完整 Hermes TaskWorkspace runtime、tenant IDs 和平台工具调用不是 v0 硬依赖；但 provider execution mode 合同现在就定义，确保未来接入 Hermes / TaskWorkspace / LocalAgent 员工能力时不会绕过 workspace refs、凭证、额度、审计和 provider provenance。

koubo-clip 支持两个互斥 provider execution mode。一个 project 只能使用一个 mode，创建或摄入时确定；后续命令不得混用。

- `standalone`: 本地 CLI/agent 使用。koubo-clip 可以使用用户本机已配置的 ASR、music、visual acquisition 等 provider，但 provider 结果必须先落成 project-local artifacts。
- `platform`: Hermes / TaskWorkspace / LocalAgent / 员工能力「口播快剪」使用。平台 Capability、ConnectorTool、MCP 或 agent tool 负责 ASR、生图、生音乐、音乐获取、视觉素材搜索、UI 组件下载和授权；koubo-clip 只负责请求校验、已落地 artifact 摄入、确定性媒体处理、render 和 inspect。

provider execution mode 是任务边界，不是每个命令临时选择的开关，也不是 `enrichment-plan.profile`。需要切换 mode 时应创建新的 project，而不是在同一个 project 中混用 provider 来源。

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
  -> 基于 transcript、material report 和 source metadata 选择 source-local 时间点
  -> source-frame-request.json -> project source-frames -> source-frames.json
  -> agent/host 结合 ASR 和源画面事实理解素材
  -> 询问用户目标
  -> review-package.md/json
  -> production-proposal.md/json
  -> 用户选择默认方案或修改选项
  -> 校验 edit-plan 和 EDL
  -> 渲染 clean video
  -> 按确认方案生成可选 focus / image / music / enrichment artifacts
  -> storyboard + HyperFrames recut
  -> audio/music mix
  -> render-result.json 指定 canonical output
  -> inspect current render result
  -> inspection.json + report.md
```

`explore` 不是轻量探测。它应该转写音频、检查基础媒体事实、检测明显 timing 问题，并在询问用户最终目标前总结这批素材能变成什么。

## ASR 合同

在 `standalone` mode 下，V0 默认使用线上 Cloudflare Whisper adapter；本地 `whisper-cli` 只作为缺少线上配置时的兜底，或由 agent 显式指定用于离线测试。ASR 由开关控制：

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

在 `platform` mode 下，ASR 是平台 capability。`project explore --asr auto` 不应主动调用 Cloudflare Whisper 或 `whisper-cli`；缺少 `transcript.json` 时应返回明确 blocker，要求 host/platform 先提供符合 schema 的 `transcript.json`，或显式使用 `--asr external/off` 配合已落地 transcript。

## 源视频语义抽帧

ASR/explore 完成后、业务方向和 production proposal 生成前，skill/agent 应基于 `transcript.json`、`material-report.md` 和 `sources.json` 选择 1–20 个值得观察的 source-local 时间点，写入 `source-frame-request.json`，再运行：

```bash
koubo-clip project source-frames <project> --provider-mode <standalone|platform>
```

CLI 不负责选择语义时间点。它只严格校验 request、校验 source 是 project 内真实可读文件，并按 request 顺序确定性抽取受大小约束的 JPEG，写入 `.source-frames/frame-0001.jpg` 等文件和 `source-frames.json`。Request 合法记录 id、source-local time、可选 segment、transcript quote 和 reason；manifest 还合法记录顺序 index、MIME、尺寸、byte size、SHA-256 和汇总值。`id`、`source_id` 和可选 `segment_id` 是 opaque identifiers，不得包含 URL scheme、`/`、`\` 或 Windows drive/path 形态。结构化未知字段不能用来夹带额外 path/URL/provider/token metadata，artifact path 必须是 project-relative。`transcript_quote` 和 `reason` 只做 trim 后非空校验，不扫描文本内容，因此正常台词或理由可以包含 URL 或路径文本。Warnings、errors 和日志不得泄漏 source 绝对路径、provider key 或 raw provider payload。指向 project 外部文件的 symlink source 无效。

Source-frame writer 遵循 commit-last。命令先校验 request、source containment 和时间边界，在 managed staging path 生成并验证全部 JPEG、size 和 SHA-256，再原子替换公共 `.source-frames/` 与 `source-frames.json`，最后提交 `artifact-manifest.json` 的成功记录。失败不得先删除或半覆盖旧 evidence；partial staging 可以保留诊断，但不能被标为 current。Host 只以 `project status` 返回的 lineage 状态判断权威性，不按旧文件是否物理残留猜测。

Source frames 是用户确认前只读理解素材的明确例外：生成它们不代表用户确认，也不能触发 edit plan、focus planning、素材获取/生成、enrichment 或 render。它们不依赖 EDL，也不把 source time 映射成 output timeline。

视觉分析由 agent/host 完成，CLI 不调用 vision model、provider，不联网，也不读取 provider key。`standalone` host 没有视觉能力时可以继续 transcript-only 流程，但必须明确标记“未进行源画面语义检查”；`platform` host 缺少视觉能力时由 host workflow 报告 blocker。`project source-frames` 命令本身在两种 provider mode 下行为一致，不因缺少 vision capability 而失败。

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

用户应能自然回复，例如“保留第 3 段，其他都剪掉”。在 staged workflow 中，skill 先把这类意图纳入 production proposal option，用户完成一次方案确认后再转换成 `edit-plan.json`；明确标记的 fast cleanup workflow 可以使用独立简化合同，但不能伪装成已确认的 staged project。

## 制作方案确认单

`production-proposal.json` / `.md` 是用户确认前的总方案，也是当前唯一可执行的作者合同。它由 skill/agent 基于 `material-report`、`review-package`、用户用途和 element/music 能力写入，CLI 负责校验并物化 markdown。

对“卖货、朋友圈吸引咨询、高级感、种草、专业讲解、去废话保留卖点”等开放式业务目标，skill 不应直接生成素材或渲染。它必须在同一 `production-proposal.json.options[]` 中给出 2-4 个可选业务方向；每个 option 同时包含 `business_direction`、`edit_execution_plan` 和 `asset_requirements`。用户只确认一次 recommended option 或具体 option id。素材 capability 只 fulfill 已确认 option 的槽位；最终是否入片只由 canonical `enrichment-plan.json` 决定。当前独立 `asset-usage-plan.json` 只是简化交接输入，必须先经 CLI 一次性归一化；后续 render 只读取 current canonical plan。

确认单必须同时覆盖剪辑、字幕、UI 动效、图片/生图、音乐、SFX、风险和可选方案。它回答“这条视频会被做成什么样”，而不是替代执行 artifacts。被选中的 option 是后续执行合同的来源：结构化 `duration_target`、有序 `timeline`、`text_overlays` 和 `asset_requirements` 一起落到 edit-plan、EDL、enrichment 和 render contract。

确认单只允许承诺已经有证据的事实：可以引用 source timestamps 和 cleanup candidate IDs，但不能伪造无证据坐标、未生成 asset path、未获取音乐或 provider 结果。用户回复 `OK` 时使用 `recommended_option_id`；回复具体 option id 时使用对应方案。确认后，skill/agent 写当前合同允许的 edit、focus、request 和 enrichment authoring artifacts；CLI 生成 frame/review/acquisition artifacts、EDL 与 `asset-manifest.json`。

确认后的 option fingerprint 不是单独的标记，而是后续执行合同的一部分：`edit-plan.json` 的 cut set 必须精确对应被确认 option 的 cleanup 决策，`enrichment-plan.json` 只能使用该 option 的 `asset_requirements` 和确认项，不得擅自扩大到未确认的字幕、视觉、音乐或 SFX 语义。任何新的执行语义都必须先重写 proposal 并重新确认。

## Artifact 作者合同

所有需要 Skill/Agent/Host 编写的公开 JSON artifact，都必须先由 CLI 发布完整、版本化、机器可读的结构合同。Skill 负责业务语义和填写方法，Agent 根据用户目标和项目证据填写，CLI 负责 fail-closed 校验、lineage 和状态推进。Gateway、Hermes 或其他宿主不得重新定义或复制 Koubo Clip schema。

CLI 的 artifact contract discovery 必须一次返回目标 artifact 的 ownership、schema version/digest、完整 schema、validator/lifecycle 信息，以及适用的结构完整 template 和同版本合法 example。`capabilities --json` 公开合同索引；Skill 在写 artifact 前先读取对应合同，不复制 required 字段、enum、禁止字段或版本差异。

所有 `external_writes_allowed:true` 的合同都必须闭合到实际 runtime parser 接受的嵌套字段，不能使用无字段定义的通用 `object` 代替作者合同。`source-frame-request.json` 1.0 的 frame 必填 `id`、`source_id`、`time_seconds`、`transcript_quote` 和 `reason`，只允许额外提供 `segment_id`；公开 example 必须可被同版本 request parser 首次接受。

每个 CLI release 对每种 artifact 只支持一个当前 schema。artifact 中保留 `version`，用于 fail-closed 校验、digest 和 delivery identity，但公开命令不接受 schema version 选择，也不做旧 parser、兼容 union、legacy normalization 或运行时迁移。缺失或不匹配的 artifact version 返回 `CONTRACT_SCHEMA_UNSUPPORTED`；开发 fixtures 和内部项目直接更新为当前格式，旧外部项目使用当前 CLI 重新创建。

对 Agent/Host authored artifact，CLI 应一次返回尽可能完整且有界的结构化 `issues[]`，让 Agent 整体修正，而不是按第一个错误反复重写。Fail-closed 不变：未知字段、缺失必填字段、非法 enum、类型和跨字段错误仍然失败，CLI 不静默补全业务语义。

CLI-owned derived/result artifacts 只公开只读 schema 和 producer/verify/inspect 能力，不提供 authoring template，也不得由 Skill、Agent 或宿主手写。完整 ownership、发现面、诊断与单一 schema 要求见 `docs/artifact-authoring-contracts.md`。

`production-proposal.json` 3.0 是首个强制落地场景。正式发布包必须提供一份包含 2-4 个完整 option、能够被同版本 `project proposal --json` 直接接受的实例；不得继续用 `{}` 或“省略字段遵循 schema”作为 Agent 能获得的唯一结构说明。Option `id` 是唯一方向身份，`recommended_option_id` 是唯一推荐权威；`asset_requirements` 是 visual/image/music/SFX 槽位的唯一权威，`edit_execution_plan` 不接受重复 slots。`duration_target` 说明目标时长区间和容差，`timeline` 用顺序数组描述 candidate_cleanup 或 explicit_segments，`text_overlays` 记录 source-local 文本叠加意图。Candidate-cleanup option 的每个 overlay 必须完整落在删除后单个连续 retained range 内；跨越 selected cut 时，Agent 必须在确认前按 CLI 返回的 retained subranges 拆分并重新校验，CLI 不自动截断、拆分或删除。只有全部 options 通过该可执行一致性门禁后，`project proposal` 才能返回可供用户确认的 fingerprints。

## 增强

Enrichment 是一等可选阶段，不是隐藏装饰步骤。工作流应先通过 production proposal 确认成片方向；用户确认后，再把方案拆成 cleanup、focus、image/music 和 enrichment 执行 artifacts。

当前 enrichment 目标是 source-mode-aware recut：cleaned video 保持为 base layer，CLI 在一个 HyperFrames composition 中渲染 embedded caption rail、timed registry elements、SFX 和 music。它不是一组彼此独立的黑盒 overlays。

Semantic Focus Planner 是 enrichment 的前置合同。用户可以用任意业务词汇描述目标，但这些词汇不是稳定 schema；CLI 和 skills 必须把它们归一化为固定的 semantic intent、element type 和 evidence contract，再进入最终 enrichment plan。

固定的 intent 是闭集，但分两层：`presentation_intent` 描述这条视频最终用途，当前接受 `internal_tutorial`、`product_demo`、`course_lesson`、`knowledge_explainer` 和 `short_form`；`semantic_intent` 描述某个 focus moment 要帮观众完成什么，当前接受 `orient_viewer`、`guide_attention`、`explain_sequence`、`summarize_payoff` 和 `pacing_relief`。元素能力同样是闭集：`registry_block`、`registry_component`、`animation_rule`、`caption_identity`、`sfx` 和 `visual_asset`。

Visual Grounding 是 coordinate-bearing 元素的证据合同。只要一个 screen-recording 元素使用 `target_rect`、`anchor_point` 或任何需要放置在 UI 上的坐标，它就必须带有可追溯的 source-local focus frame evidence，不能只是抽象描述。Render 后的 inspection frames 只用于 final output QA，不反向充当方案确认前的 grounding 证据。

Semantic Focus Planner 物化的中间产物是：

- `focus-candidates.json` 和 `focus-candidates.md`：把用户目标归一化为业务角色、viewer job、视觉缺口、推荐处理方式、固定 intent、候选 element type、风险和所需证据。`recommended_treatment` 当前接受 `source_ui_component`、`generated_asset`、`text_or_caption`、`sfx_or_music` 和 `none`。
- `focus-frames.json` 和 `.focus/frames/*.jpg`：candidate timing 来自 cleaned output timeline，经 EDL 映射后记录并保存 source-local grounding evidence，包含 source_id、source-local timecode 和 frame path。
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

`storyboard.json` 是 current enrichment inputs 的 CLI-derived 合成剧本和 QA checklist，不是独立业务决定，也不是完成证明。Production proposal 决定“哪里要加入什么以及为什么”，`enrichment-plan.json` 表达执行选择，CLI 再把它物化成带 `qa_checks[]` 的 storyboard。Render 只消费 lineage current 的 storyboard，并在 `render-result.json.inputs[]` 中绑定其 fingerprint；inspect 先验证 current `render-result.json` 及其 canonical output，再按该 render result 实际绑定的 storyboard checks 抽帧，避免旧 storyboard 或另一份手写检查清单漂移进当前检查。

本地 authoring render 和 strict render 必须共享同一个 `executeResolvedRenderPlan` 和同一帧时序语义；inspect 可以写出结构化 `inspection.json` / `report.md`，但当 blockers 非零时命令仍必须 fail closed，不能把失败包装成成功。

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

- `profile`: 默认 professional explainer style，包含 `source_mode:"talking_head_avatar"`、`caption_identity:"anchor"`、`layout:"stack"`、`style:"whiteboard"`、`frame:"clean"`、`aspect_ratio:"source"`。Caption placement 由 0.0.13 safe-layout contract 按输出宽高比自动解析并冻结；公开 preset 只有 `placement:auto|center_lower|bottom_safe` 和 `size:small|medium|large`。默认位置是 9:16 `center_lower` `(0.50,0.70)`、4:5 `center_lower` `(0.50,0.76)`、横屏 `bottom_safe` `(0.50,0.90)`，skill 不写 CSS、像素或任意坐标。
- 2.0 `elements[]`，元素类型只允许 `registry_block`、`registry_component`、`animation_rule`、`caption_identity` 或 `visual_asset`；音乐和 SFX 分别进入 `audio.music[]` 与 `audio.sfx[]`。
- `project element-catalog` 暴露完整 HyperFrames 可创建元素目录，包括 blocks、components、examples、caption themes/DNA、animation rules/blueprints、SFX、motion categories、talking-head references 和 frame presets。
- `project element-catalog` 暴露的是 CLI resources 能力，不是让 agent 加载 HyperFrames 上游 skills。Agent 通过 catalog 选择元素，通过 koubo-clip references 理解决策规则。
- `project element-catalog` 还必须暴露每个元素的 adapter profile：family、render strategy、source-mode 适用性、screen safety、默认 zone、必填 params、坐标要求、asset 要求和已知限制，并按 source mode 返回 recommendations。业务关键词只是输入提示，不是 selector key。
- `project element-catalog` 必须额外返回 `purpose_recommendations`，按 `source_mode × presentation_intent` 给 agent 一个用途驱动的候选集。首版 intent 为 `internal_tutorial`、`product_demo`、`course_lesson`、`knowledge_explainer` 和 `short_form`。
- Enrichment 不是“迁移来的元素全用”，也不是“默认不用”。Agent 应先理解用户希望视频素材变成什么，再从 purpose recommendations 中选择最小有效元素集合，并把它们放进 focus-candidates / focus-grounding / review contract。
- 是否生图不由 `source_mode` 粗暴决定。Agent 应先写明每段的 `business_role`、`viewer_job` 和 `visual_gap`：可从源画面指给观众看的内容优先用 `source_ui_component`；源画面不可见的抽象概念、B-roll、品牌记忆点才请求生成素材并以 `visual_asset` 落地；没有 viewer job 的装饰应标记 `none`。
- 需要图标、动态图标、UI 组件、贴纸、模板或图片时，主路径是 internet-first visual acquisition：agent 通过 host MCP、API 或平台工具在互联网上语义检索现成素材，并在 proposal/review 中说明候选、来源、用途和风险。确认后，在 `standalone` mode 下 CLI 可以通过 `visual-search` / `visual-acquire` 把可下载或 handoff 的素材固化为 project-local assets；在 `platform` mode 下平台工具先完成 provider 调用和授权，再把候选 metadata 或本地导出写入 TaskWorkspace/project，CLI 只导入和校验。不要把“先建立长期本地 UI 素材库”作为前提。
- 首批外部来源按能力分层：UI 组件优先 shadcn MCP 和 21st.dev HTTP MCP；通用图标优先 Iconify API；动态图标优先 Lordicon official API；Lottie/dotLottie runtime 优先 LottieFiles dotLottie；Rive 和完整 React design systems 后置。选择依据是是否流行、活跃、官方支持 MCP/registry/API，以及是否能给出可审查 metadata。
- 本地 `assets/*` 只表示当前 project 的已确认渲染输入，不是跨 agent、跨项目复用的全局缓存。每次新任务应根据用户目标重新语义检索；如果互联网检索失败，应报告 blocker 或换 provider，而不是退回手写低质 UI。
- 互联网搜索和 provider 调用发生在 acquisition / host-agent 阶段；render 阶段仍只消费当前 project 已落地或 host workspace 可稳定引用的 assets，保证这一次输出可检查、可追踪。`visual_asset` 是 2.0 唯一的外部视觉素材 element type；图标、Lottie、UI/template、图片、生图和 B-roll 都使用 `visual_asset`，通过 asset provenance 区分来源。
- element 上可选归一化 `target_rect` 和 `anchor_point` 字段，让 agents 能基于真实 screen inspection 放置 focus boxes 和 callouts。值是 `[0,1]` 内的 ratios；CLI 校验边界。只要这些字段出现于 screen recordings，就必须有 frame evidence 和 `coordinate_source_frame`。
- 2.0 plans 通过 `caption_identity` 和 registry elements 表达 anchor captions、plain subtitle rails、title、key-point、quote、flowchart、image、screenshot-focus 或 lower-third；anchor/plain 共享同一 safe-layout contract，不接受 card 输入，也不接受手写 CSS、像素或任意坐标。
- 可选 caption emphasis moments。
- 可选用户提供或 agent-generated local images。
- 可选通过 Music Acquisition 获得的 background music，并使用 speech-safe mixing。

Generated images 和原创 B-roll 仍是 agent/platform 职责；icons、animated icons、Lottie、UI/template snapshots、贴纸、确定性图片或 B-roll 则优先通过 Visual Acquisition 获取或导入。只有找不到确定性素材或用户目标需要原创概念图时才使用 image generation。Music 在 `standalone` mode 下进入 koubo-clip acquisition 流程：CLI 可以扫描本地曲库、下载网络素材或调用 MiniMax 生成音乐；在 `platform` mode 下，skill 产出 music request，平台工具生成或获取音乐并落地，CLI 只导入、校验和 review。final render 只消费 project-local files 或未来 stable workspace refs；provider URL、API key、本机绝对路径、MCP 原始结果和临时下载链接不能成为最终 asset refs。Flowcharts、data cards、subtitles、software screenshots 和 deterministic text cards 应由 CLI 或 agent 以 HTML/SVG/source crops 生成，不应走 image models。

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

`visual-search` / provider list 只负责召回候选，不代表允许 acquire。Agent/host 必须结合 viewer job、ASR、源画面、source mode、已确认业务方向、授权和 runtime 风险审查候选，并在 `visual-request.json` 中写入 `selected_candidate_id` 和 `selection_reason`；前者是 acquire 的唯一授权，后者说明为什么选择这个具体 candidate。Request 原有的 `reason` 仍只说明为什么该位置需要视觉素材。候选的 `recommended` 和数组顺序都只是展示提示，不能作为 fallback。Agent 决定不插入素材时，应从最终 `requests[]` 删除该槽位，并在 business/focus review 中记录原因；没有 request 时不运行 visual acquire。

候选的 `preview_path` 只用于 agent、视觉模型或用户比较候选，不能被 acquire 或 render 当作素材；只有明确选中且具有可渲染 `local_path` 的完整素材才能进入 platform acquire。两种 provider mode 都要求每个 request 同时提供 `selected_candidate_id` 和非空 `selection_reason`：`standalone` 可以由 CLI 搜索或下载 provider 候选，但 acquire 仍须消费明确选择；`platform` 由 host 完成搜索、授权和选中素材的物化，CLI fail closed 地校验 selection、project-local 路径和候选 provenance。这个合同继续使用现有 request/candidate artifacts，不新增 `visual-selection.json`、数据库、provider 接口或平台专属 selection 对象。

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
  -> enrichment-plan.audio.music[]
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

`enrichment-plan.json` 只接受 `version:"2.0"` 和 `profile + elements + audio`。`cards`、`slots`、顶层 `captions` / `music`、`generated_asset`、element-level SFX 和缺失 version 一律返回 `CONTRACT_SCHEMA_UNSUPPORTED`，不在运行时转换。

后续 enrichment 可以加入 matting/text-behind-person、Remotion、更广 OpenMontage-style packaging、generated scenes 和 reusable overlay components。

## 期望产物

```text
koubo-clips/<slug>/
  project.json
  artifact-manifest.json
  sources.json
  source/
    001-original.<ext>
    002-original.<ext>
  material-report.md
  source-frame-request.json
  source-frames.json
  .source-frames/
    frame-0001.jpg
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
  music-catalog.md
  music-catalog.json
  music-request.json
  music-acquisition.json
  music-review.md
  music-review.json
  visual-catalog.md
  visual-catalog.json
  visual-request.json
  visual-candidates.md
  visual-candidates.json
  visual-acquisition.json
  visual-review.md
  visual-review.json
  edit-plan.json
  asset-usage-plan.json  # optional current simplified handoff input
  edl.json
  enrichment-plan.json
  storyboard.json
  asset-manifest.json
  subtitles.srt
  .hyperframes/
    recut/
      public/
        index.html
  assets/
    icons/
    images/
    lottie/
    music/
    overlays/
    visuals/
  renders/clean.mp4
  renders/final.mp4
  render-result.json
  inspection.json
  .inspection/
    <render-fingerprint-prefix>/
      element-*.jpg
  report.md
```

## 成功标准

- Source media 永不被覆盖。
- 用户或 agent 可以在 final render 前检查每个决策。
- report 展示 original subtitles、proposed cuts、timestamps 和 reasons。
- Multi-source projects 从 manifest、transcript、review、EDL、render 到 report 都保留 source identity。
- ASR timing granularity 明确，并被 cut planning 尊重。
- Agent 可以在制作方案前用 project-local source frames 核对源画面语义；没有视觉能力时会明确记录降级状态。
- Rendered MP4 可在本地播放。
- 启用 captions 时，captions 存在且同步。
- Speech 不会在 cut boundaries 被截断。
- report 解释 removed segments 和 unresolved risks。
- CLI 在实现后可以为 agent automation 运行 dry-run 或 JSON mode。
- 任意 artifact 或 MP4 的存在都不能单独证明阶段成功；current 状态必须有匹配的 schema、fingerprint 和 dependency lineage。
- edit plan、EDL、enrichment、render 和 inspection 必须能追溯到当前上游输入；上游改变后旧下游结果会被明确标记 stale 并被 CLI 拒绝。
- 宿主可以通过稳定 capability discovery 和只读 project status JSON 恢复流程、获得精确 render inputs、当前 deliverable、blockers、next commands 和最后成功 checkpoint。
- 不了解仓库源码的 Agent 可以只依赖正式发布包中的 CLI artifact contract 和官方 Skill，生成合法 `production-proposal.json` 3.0；首次校验通过，或最多根据一次聚合 issues 整体修正后通过。
- 所有 Agent/Host authored artifact 的 required、optional、enum、unknown-field policy 和合法 example 都能从正式 CLI 发现；Skill、validator、example 和发布包由 contract/schema digest 防止漂移。
- 只有当 technical、proposal、business 三个检查都通过且整体状态为 completed 时，才算完成；单独的 `render_status: success` 不是完成证明。

## Detached source 与分布式执行合同

- `sources.json` v2 只保存 portable identity 和 opaque `local_media_ref`，不得保存机器路径；authoring project 的已验证本地副本单独写入 `source-materialization.json` v1。
- `project create --source-manifest` 读取的 host-authored `sources.json` 只是位于 project target 外部的创建 seed；target 必须尚不存在且只能由 CLI 创建。创建成功后，CLI 在 target 内写入独立的 authoritative `sources.json`，外部 seed 不进入 project lineage。恢复时只有不存在的 target 才能 create；合法当前 project 先运行 status；被其他内容占用的 target 必须 fail closed，不能覆盖、删除、迁移或改用 `-v2`/`-v3` 平行目录。
- Detached project 不要求原片存在，不创建 `source/`，并允许 external transcript、source/focus evidence、proposal、edit plan、portable EDL、captions、resolved storyboard 和 contract export 完成。
- `edl.json` v2 只含 `source_id` 与 source-local ranges。CLI 在 materialized render 或 strict binding 时才解析真实路径。
- `render-contract export` 生成不可覆盖的目录合同包。合同 digest 仅覆盖 canonical payload；bundle 只含实际引用的 content-addressed 非源素材。
- `render-contract.json`、`bindings.json`、`render-contract-result.json` 和 `render-contract-inspection.json` 构成同一个 render-contract 2.0 generation；如果链路仍是 0.0.13 mixed chain，必须整条 re-export / re-execute，不能手写迁移、补字段或 fallback。strict consumer 顺序固定为 `verify -> bind -> render -> inspect`。
- Strict consumer 只读取合同、bundle assets 和显式 source binding。它不得读取 authoring transcript、analysis、edit-plan 或 enrichment-plan，不得重规划、补默认值或修复项目。
- Hash/size 必须 exact；source probe duration tolerance 为 0.05 秒。Strict output 的 expected duration 必须由累计 EDL 边界量化后的 exact target frame count 除以 fps 得到，视频帧数必须 exact；容器 duration tolerance 仍为 `max(0.05, 2/fps)`，不得按片段数量扩大。Mismatch 一律 fail closed，并报告 expected、actual、delta 和 tolerance。
- CLI delivery 必须公开 CLI version、payload/resources/Skill digest、`artifact_contracts_digest`、schema versions、capability IDs 和 exact GSAP/HyperFrames versions，并能在 export、verify、bind、render 前验证兼容性。`delivery-manifest.json` 唯一当前版本是 3.0，旧 manifest 不读取或迁移。正式 npm delivery 的 manifest 必须从 npm packlist 物化后的最终文件树生成；CI 验收、npm publish 和 GitHub Release 必须复用同一个 canonical tarball，不能从源码 checkout 再次打包。正式版本只有在空目录安装该 tarball 后独立通过 Skill、delivery、contract export、strict render 和 inspect 验收才可发布。
- `.virtual/*` 只用于 CLI 内部 lineage，`project status` 不得把它作为外部可读取 artifact path。Proposal selection fingerprint 通过成功的 `project proposal --json.option_selection_fingerprints` 获取，或在对应 selection 仍为 current 时通过 `project status --json.fingerprints["proposal-selection:<option-id>"]` 获取；pending、stale 和 invalid proposal 不公开可确认 fingerprint。
- Evidence import 必须区分 probe 不可用、probe 进程失败、probe 输出无效、codec、尺寸、size、hash 和 binding mismatch，同时保持错误脱敏和批次 commit-last。
- Detached project 的 current render contract 导出成功后进入 distributed handoff。Status 应把本地 render/inspect 标记为不适用，并指向远端 `render-contract verify -> bind -> render -> inspect`；不得要求 authoring agent 手写 source materialization 或在 Hermes 本机渲染。
