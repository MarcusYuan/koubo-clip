# Skills 和 Agent 工作流

## 目的

本规则定义 koubo-clip skills 和 agents 负责什么。Skills 是工作流层；它们不能替代 CLI 合同。

## Provider Execution Mode Routing

每个 koubo-clip project 必须先选择一个 provider execution mode，并在整个 project 内保持不变：

- `standalone`: 本地 CLI/provider 工作流。Skill 可以指导 CLI 使用已配置的 ASR、music、visual acquisition provider，但所有 provider 结果仍必须落成 project-local artifacts。
- `platform`: Hermes / TaskWorkspace / LocalAgent / 员工能力「口播快剪」工作流。Skill 负责写清楚 ASR、music、visual、image、component 等 request specs；平台 Capability、ConnectorTool、MCP 或 agent tool fulfill；CLI 只校验、摄入、render 和 inspect。

如果当前任务来自 Hermes、TaskWorkspace、LocalAgent、workspace_ref、asset_id、local_artifact_id 或「口播快剪」员工能力，使用 `platform` mode。普通本地 CLI 使用默认 `standalone` mode。不要在同一 project 中混用两个 mode；需要切换时创建新 project。

## Skills 负责的内容

- 澄清用户的目标平台、语气、语言、严格程度和 enrichment 偏好。
- 在任何 project 操作前选择 provider execution mode，并遵守 project metadata 中已有的 mode。
- 用户提供 raw talking-head footage 时，在询问最终目标前运行 material exploration。
- 运行 staged CLI workflow 或 host-equivalent tools。
- Review transcript 和 cleanup candidates。
- 基于 material-report、review-package、用户目标和 element/music 能力生成 `production-proposal.json`，运行 `project proposal`，向用户展示默认方案和可选方案。
- 决定哪些不确定的 repeats、false starts 和 filler segments 要删除。
- 当 edit decision 会实质改变含义时，向用户确认。
- 选择 semantic enrichment intent：source mode、presentation intent、profile、caption rail、HyperFrames elements、image/B-roll requests、SFX 和 music mood。
- 把用户的开放式业务措辞归一化成固定 semantic intent、元素类型和 frame evidence 需求。
- 生成和复审 focus-candidates、focus-frames、focus-grounding 和 focus-review 产物。
- 在 standalone mode 下，通过 Music Acquisition 选择、获取和审查可选 music；通过 Visual Acquisition 搜索、获取和审查可选 icons、animated icons、Lottie、UI/template snapshots、stickers、B-roll 或 images。
- 在 platform mode 下，写出 music/visual/image/component request specs，由平台工具 fulfill，并要求结果进入 TaskWorkspace/project-local artifacts 后再让 CLI 校验和摄入。
- 在具备生图工具的 host 中，skill 应只在用户确认后使用 host 生图能力生成已批准的 `generated_asset`，保存到 project-local asset 或平台 stable ref，写入 `asset-manifest.json`，再让 CLI 合成。
- 在请求 generated media、music acquisition 或 render 前，先产出用户可读的 production proposal；用户确认后再产出执行级 enrichment plan。
- 报告 output paths、removed sections、retained risks，以及 failed 或 skipped steps。
- 通过 `references/` 按需承载 HyperFrames 方法论、视觉选择、caption、motion/SFX、music 和 storyboard QA 规则；不要把上游 HyperFrames 原始 skill 目录当成多个用户 skill 暴露。

## Skills 不能负责的内容

- FFmpeg filter graph assembly。
- EDL validation。
- Subtitle timing math。
- Duration probing。
- Audio loudness normalization。
- Final MP4 rendering。
- Canonical artifact layout。
- 当 CLI command 可以暴露时，硬编码 CLI-owned thresholds、schemas、dimensions 或 output paths。
- 在上游 skill instructions 中写 host-specific tool names 或 platform-only IDs。
- 在 CLI-facing instructions 中放 image-generation 或 B-roll provider logic。
- 在 platform mode 下指导 CLI 直接调用 Cloudflare Whisper、MiniMax、Freesound、Pixabay、Iconify、Lordicon、URL download、MCP 或需要 provider credentials 的能力。
- 编造 visual provider 行为；CLI-owned visual provider 行为只通过 `project visual-catalog`、`project visual-search`、`project visual-acquire` 和 `project visual-review` 暴露，host/MCP provider 必须先给出候选 metadata 和本地/静态导出。
- 承载 CLI 渲染资源。字体、SFX、caption theme JSON、registry blocks/components、HTML fragments 和 runtime adapters 属于 CLI sidecar resources，不放进 `skills/koubo-clip` 作为 agent-loaded skill 内容。

## 规划技能

```text
/koubo-clip        -> v0 staged talking-head cleanup and enrichment workflow

合同稳定后才考虑拆分：
  /koubo-clip-cli
  /koubo-clip-media
```

## 工作流规则

- 对真实用户视频，优先使用 staged workflow。
- 第一阶段先确定 provider execution mode；如果 project metadata 已存在，以 metadata 为准。
- 只有在 quick drafts 或用户明确要求速度时，才使用 one-shot `generate`。
- 把 transcript 和 candidate files 当作 review surfaces，不是隐藏 internals。
- `project explore` 后，总结 `material-report.md`，并询问用户希望素材变成什么。
- `project review` 后，先写 `production-proposal.json` 并运行 `project proposal`。展示的确认单必须同时覆盖剪辑、字幕、UI 动效、图片/生图、音乐、SFX、风险和默认/可选方案。
- `production-proposal.json` 必须包含 2-3 个 option。每个 option 要说明适合的发布目标、为什么适合当前素材、剪辑策略、字幕策略、视觉策略、图片/生图意图、音乐策略、SFX 策略、风险和确认项。
- 用户确认前，proposal 只能写素材意图：intent、query、provider preference、license/cost/source risk 和 reason。不要写最终 `asset_id`、local path、provider URL、download URL、绝对路径或 raw MCP payload。
- 用户回复 `OK` 时使用 `recommended_option_id`；用户回复 option id 时使用对应 option；用户自然语言修改时先更新 proposal 或把修改反映到后续 artifacts。
- render 前展示 review package：original subtitles、proposed cuts、timestamps、reasons 和 unresolved risks，并把这些信息纳入 production proposal。
- 把自然语言 review feedback 转换成 `edit-plan.json`；除非用户愿意，不要要求用户编辑 JSON。
- 用户确认 production proposal 前，不要写 `edit-plan.json`、`focus-candidates.json`、`music-request.json`、`asset-manifest.json` 或 `enrichment-plan.json`，也不要生图、获取音乐或 render。
- 用户确认 production proposal 前，也不要写 `visual-request.json`。确认后才把选中 option 转成 `edit-plan`、`focus-*`、`visual-request`、`music-request`、`asset-manifest` 和 `enrichment-plan`。
- 如果请求 enrichment，先推断一个主要 `presentation_intent`：`internal_tutorial`、`product_demo`、`course_lesson`、`knowledge_explainer` 或 `short_form`。然后运行或读取 `project element-catalog`，优先从 `purpose_recommendations.<source_mode>.<presentation_intent>` 展示元素候选；只有用途不清楚时才退回 `recommendations.<source_mode>`。用户的原始业务关键词只是线索，不是最终 selector。
- 对每个候选增强点，先写 `business_role`、`viewer_job`、`visual_gap` 和 `recommended_treatment`。`source_mode` 只约束遮挡和安全区，不能单独决定是否生图。
- `recommended_treatment` 只能表达为：`source_ui_component`、`generated_asset`、`text_or_caption`、`sfx_or_music` 或 `none`。没有明确 viewer job 的增强点应为 `none`，不要为了“丰富”而添加。
- 在进入最终 enrichment 之前，按顺序产出 `focus-candidates`、`focus-frames`、`focus-grounding` 和 `focus-review`；对 screen recordings，只接受有 frame evidence 的坐标。
- 在生成 assets 或 final rendering 前展示已确认的 planned source mode、`profile`、elements、captions、images、SFX、music、output-timeline timestamps、reasons、grounding evidence 和 missing assets。
- 运行 `project enrich-plan` 后展示 `qa_checks[]`。每个计划加入点都要能说明 expected、asset/provenance、是否需要抽帧、warnings 和是否需要人工复核。
- v1.2 enrichment plan 清楚到足以让用户 review 前，不要生成 images、B-roll、music 或 animation clips。
- 对 icon、animated icon、UI component、sticker、template、B-roll 或图片需求，默认通过 host MCP、API 或平台工具做互联网语义检索。不要把“本地 UI 素材库”当作前置假设；当前 project 的 `assets/*` 只是本次确认后的渲染输入。
- 优先选择官方或上游维护的能力：shadcn MCP / shadcn-compatible registry、21st.dev MCP、Iconify API、Lordicon official Web/API/npm、LottieFiles dotLottie。第三方 MCP 可以作为候选，但必须在 proposal 中标明 third-party/source risk。
- 视觉素材候选应先出现在 production proposal 或后续 review surface 中，说明 query、provider/source、用途、license/cost 风险和为什么适合 viewer job。用户确认后写入 `visual-request.json`。Standalone mode 运行 `project visual-catalog`、`project visual-search`、`project visual-acquire` 和 `project visual-review` 获取本地 asset；platform mode 先调用平台 visual/component tools fulfill，再运行 CLI 的 search/acquire/review 作为读取、导入和校验面。最后把获取到的 `asset_id` 写进 `enrichment-plan.json`。
- 如果计划包含 music，先运行或读取 `project music-catalog`，写入 `music-request.json`。Standalone mode 通过 `project music-acquire` 和 `project music-review` 获取可审查的本地音乐资产；platform mode 先调用平台 music capability fulfill，再运行 CLI acquire/review 作为导入和校验面。
- 只在互联网检索不到合适确定性素材，或用户目标需要原创概念画面时，才使用 image generation：cover art、abstract concept art、B-roll illustration、brand imagery。不要为 subtitles、flowcharts、software screenshots、data cards 或常见图标语义优先使用 image generation。对“闹钟/电话/导航/消息/蓝牙/电池”等常见业务语义，默认先走 Iconify/Lordicon/Lottie/shadcn/21st acquisition，而不是文字 chip 或手写 SVG。
- 对 screen recordings，默认使用 transparent guidance；除非用户目标证明有必要，不添加 generated images 或 music。
- 如果当前 host 没有生图能力，skill 必须诚实标记 missing asset、请求用户提供图片，或只在测试中使用明确标记的 deterministic placeholder；不要声称完成了 AI 生图。
- Platform mode 下如果 host 没有对应平台工具，skill 必须报告 blocker，而不是退回 CLI provider 或把 provider URL/API/MCP 原始结果写进 artifacts。
- 如果 proposal 选择 BGM、SFX、icons、Lottie、UI handoff、图片、B-roll 或生图，后续必须出现对应 request/review/manifest/enrichment/QA artifact。选择不加素材时，也必须说明为什么素材不会帮助 viewer job；不要把空素材计划说成已准备完成。
- 只为 viewer job 添加 visual content：定位段落、引导注意力、解释 sequence、总结 spoken point，或为可发布短视频增加 pacing relief。Decorative elements 是失败计划。
- AI 可以自主选择 HyperFrames elements，但选择必须服务用户用途：内部教程优先透明引导和 SFX；产品演示优先 UI focus/path/callout；课程讲解优先 chapter/flowchart/data；知识解释优先 key point/quote/data/concept visual；短视频包装才优先 hook、转场、强字幕、图片和配乐。
- 只有当 plan 引用真实本地 `asset_id` 时才使用 `visual_asset`、legacy `generated_asset` 或兼容 `kind:"image"`。常见图标/动态图标/UI/template/B-roll/image 优先用 `visual_asset`；原创 AI 生图仍可用 legacy `generated_asset` 或 manifest `source:"agent_generated"`。只有当 background music 是已批准 publishing goal 且已经通过 `music-review` 的一部分时才使用 `music[]`。否则两者都留空。
- 对 screen recordings，如果 cue 指向 UI，要从实际 screenshots 或 inspection frames 推导 normalized `target_rect` 或 `anchor_point`，并在 `params.coordinate_source_frame` 写明来源帧，同时把这一帧写入 `focus-frames` 和 `focus-grounding`。没有视觉证据时不要写坐标。
- 显式 v1.2 elements 要满足 CLI adapter 要求：lower-third/social/notification/code 等 semantic blocks 填 `params.title`、`params.subtitle`、`params.detail`、`params.code` 或 `params.username`；screen focus 填 `target_rect`；anchored chip/callout 填 `anchor_point`。
- 不要手写 `storyboard.json`、registry files 或 card HTML 作为事实来源。CLI 从 `enrichment-plan.json` 物化 storyboard、安装 vendored registry elements，并生成兼容 card fragments。
- 不要手写检查清单。`storyboard.json.qa_checks[]` 是合成清单和验收清单的共同来源；render 前看 `project enrich-plan.qa_checks[]`，render 后看 `project inspect.inspection_checks[]`。
- 不要手写任意 GSAP 或 JavaScript。HyperFrames runtime staging、registry installer、animation templates、SFX manifest 和 CDN allowlist 由 CLI 拥有。
- 不要把业务短语直接映射到元素 ID。先过 semantic focus planner，再让 grounded evidence 决定最终坐标和元素选择。
- 除非真实 CLI 或 host tool call 已发生，否则不要声称 rendering 或 inspection 已开始。
- MP4 存在且 inspection 检查通过前，不要声称完成。
- 失败后保留 partial artifacts，并报告最后成功的阶段。
