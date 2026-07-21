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
- 在依赖命令或 schema 前读取 `koubo-clip --version` 和 `koubo-clip capabilities --json`；写 Agent/Host authored artifact 前再读取该版本的 CLI artifact contract。恢复已有 project 时先读取只读 `project status --json`，不扫描目录猜状态。
- 在任何 project 操作前选择 provider execution mode，并遵守 project metadata 中已有的 mode。
- 用户提供 raw talking-head footage 时，在询问最终目标前运行 material exploration。
- 运行 staged CLI workflow 或 host-equivalent tools。
- Review transcript 和 cleanup candidates。
- ASR/explore 后，基于 transcript、material report 和 source metadata 选择最多 20 个有明确观察目的的 source-local 时间点，写 `source-frame-request.json` 并运行 `project source-frames`。不要为了凑数量选择重复画面；CLI 不负责语义选点。
- 如果 host 有 vision capability，结合 source frames 和 ASR 事实描述原素材画面；不要把观察推断成用户已经确认的制作方案。Standalone 无 vision 时可以 transcript-only 继续，但必须标记未进行源画面语义检查；platform 缺 vision 时由 host workflow 报 blocker，不能把它误报为 CLI 抽帧失败。
- 把用户的业务诉求转成 2-4 个完整 proposal options。每个 option 同时包含业务方向、剪辑执行方案和素材需求槽位；不要把“卖货/种草/朋友圈/高级感/专业讲解”直接解释成单一渲染计划。
- 先运行 `koubo-clip artifact contract production-proposal --json` 获取 `production-proposal.json` 3.0 的完整 schema/template/example，再基于 material-report、review-package、用户目标和 element/music 能力填充 2-4 个完整 options。Candidate-cleanup option 的 text overlay 不得跨越该 option 已选 cut；先按连续 retained ranges 拆分，再运行 `project proposal --json`。若返回多个 `issues[]`，一次处理完整集合。只有命令成功并返回最终 proposal/selection fingerprints 后，才向用户展示并请求一次确认。
- 只要求用户确认一次：`OK` 选择 recommended option，或用户提供一个 option id。不要先确认方向再确认执行方案。
- 决定哪些不确定的 repeats、false starts 和 filler segments 要删除。
- 当 edit decision 会实质改变含义时，向用户确认。
- 选择 semantic enrichment intent：source mode、presentation intent、profile、caption rail、HyperFrames elements、image/B-roll requests、SFX 和 music mood。
- 把用户的开放式业务措辞归一化成固定 semantic intent、元素类型和 frame evidence 需求。
- 生成和复审 focus-candidates、focus-frames、focus-grounding 和 focus-review 产物。
- 在 standalone mode 下，通过 Music Acquisition 选择、获取和审查可选 music；通过 Visual Acquisition 搜索、获取和审查可选 icons、animated icons、Lottie、UI/template snapshots、stickers、B-roll 或 images。
- 在 platform mode 下，写出 music/visual/image/component request specs，由平台工具 fulfill，并要求结果进入 TaskWorkspace/project-local artifacts 后再让 CLI 校验和摄入。
- 对 visual search/list 返回的候选做语义审查，明确写入 `selected_candidate_id` 和 `selection_reason`；候选顺序和 `recommended` 只是提示，不是 acquire 授权。
- 在具备生图工具的 host 中，skill 应只在用户确认后使用 host 生图能力生成已批准的视觉素材，保存为 project-local asset，再通过受支持的 visual acquire/import 流程让 CLI 校验并写入 `asset-manifest.json`；Agent/host 不手写 CLI-owned manifest。
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
- 复制 required/optional 字段、enum、禁止字段、版本差异，或用压缩 `{}` 示例代替 CLI artifact contract。
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
- 运行工作流前先读取 `capabilities --json`；已有 project 一律先用 `project status --json` 获得 artifact/stage 状态、blockers、remediation、next commands、canonical deliverable 和最后 checkpoint。
- 写任何 Agent/Host authored JSON 前，读取 capabilities 索引指向的 artifact contract；使用其完整 template/example 建立结构，再按 Skill reference 和项目证据填写业务内容。相同 CLI/schema digest 下可以复用已读取合同。
- 只有在 quick drafts 或用户明确要求速度时，才使用 one-shot `generate`。
- 把 transcript 和 candidate files 当作 review surfaces，不是隐藏 internals。
- `project explore` 后总结 `material-report.md`；在询问业务方向或写 production proposal 前，优先完成 source-frame 语义检查。`source-frame-request.json` 直接使用 source-local time，不依赖 EDL；`source-frames.json` 是只读素材证据，不是 focus grounding 或 inspection artifact。
- 当用户目标是开放式业务目标时，直接在同一 `production-proposal.json.options[]` 中写 2-4 个完整选项。Option `id` 是唯一方向身份，不写 `business_direction.direction_id`；顶层 `recommended_option_id` 是唯一推荐权威，不写 `option.recommended`。
- 每个 option 同时写 `edit_execution_plan`，表达 objective、target audience、`duration_target`、narrative、完整有序 `timeline`、text overlays 和 user confirmation summary；不在这里重复任何素材槽位。
- 素材需求槽位从执行方案长出来，不由 capability 自己决定。每个槽位必须包含合同要求的 `slot_id`、`kind`、`purpose` 和 `required`；需要约束素材发现时再填写可选的 `query`/`prompt`、timing/placement、provider、license、cost 和 source-risk 信息。
- `asset_requirements` 是图标/UI 动效、图片、生图、BGM 和 SFX 槽位的唯一权威。不要把图标/UI 动效当成 image generation。
- `project review` 后，先读取 `production-proposal` 3.0 artifact contract，再写 `production-proposal.json` 并运行 `project proposal --json`。展示的单次确认面必须同时覆盖业务方向、剪辑执行、字幕、UI 动效、图片/生图、音乐、SFX、素材槽位、风险和默认/可选方案。确认后的 option selection fingerprint 继续约束后续 edit-plan、compile-edl、enrichment 和 render；不要把它当成只影响 proposal 展示的标记。
- `production-proposal.json` 必须包含 2-4 个 option。每个 option 要说明适合的发布目标、为什么适合当前素材、剪辑策略、字幕策略、视觉策略、图片/生图意图、音乐策略、SFX 策略、风险和确认项，并包含 `business_direction`、`edit_execution_plan` 和 `asset_requirements`。选中的 option 不是“建议”，而是后续执行合同的来源。
- 不得通过连续运行 validator 来逐字段猜 proposal schema。校验失败时读取同一次响应的聚合 `issues[]`，整体修正一次；若仍失败，报告真实的业务/上下文 blocker，不循环删除未知内容。
- 用户确认前，proposal 只能写素材意图：intent、query、provider preference、license/cost/source risk 和 reason。不要写最终 `asset_id`、local path、provider URL、download URL、绝对路径或 raw MCP payload。
- 被确认 option 的 fingerprint 继续约束执行层：`edit-plan.json` 的 cut set 必须与该 option 的 cleanup 决策逐项一致，`enrichment-plan.json` 只能使用该 option 的 asset_requirements 和确认项；如果后续执行语义要变，先回到 proposal 重新确认。
- 用户回复 `OK` 时使用 `recommended_option_id`；用户回复 option id 时使用对应 option。确认后不得修改 cleanup、timeline、text overlays 或其他 executable proposal 内容，也不得替换 selection fingerprint；任何实质修改都必须先更新并重新校验 proposal，再请求重新确认，不能把未重新 fingerprint 的改动只塞进后续 artifacts。
- render 前展示 review package：original subtitles、proposed cuts、timestamps、reasons 和 unresolved risks，并把这些信息纳入 production proposal。
- 把确认选择转换成 `edit-plan.json`；它必须包含 `contract_version:"1.0"`、`confirmed_option_id` 和 `project proposal` 返回的对应 `proposal_selection_fingerprint`。除非用户愿意，不要要求用户编辑 JSON。
- 用户确认 production proposal 前，`source-frame-request.json`、`source-frames.json` 和 CLI 管理的 source-frame JPEG 是唯一允许生成的媒体证据例外；除此之外不要写 `edit-plan.json`、`focus-candidates.json`、`focus-*`、`music-request.json`、`asset-manifest.json` 或 `enrichment-plan.json`，也不要生图、获取音乐或 render。Platform host 不得假设 workspace 工具能直接读取 `.source-frames/*`；使用公开 evidence ref、host staging 或平台提供的文件解析接口，不硬编码任何宿主私有路径。
- 用户确认 production proposal 前，也不要写 `visual-request.json`。确认后才把选中 option 转成 Agent-owned `edit-plan`、`focus-candidates`/`focus-grounding`、`visual-request`、`music-request` 和 `enrichment-plan`；CLI 命令负责生成 frame/review/acquisition artifacts 与 `asset-manifest`。确认前 source frames 只用于理解原素材，不表示用户批准。
- 如果请求 enrichment，先推断一个主要 `presentation_intent`：`internal_tutorial`、`product_demo`、`course_lesson`、`knowledge_explainer` 或 `short_form`。然后运行或读取 `project element-catalog`，优先从 `purpose_recommendations.<source_mode>.<presentation_intent>` 展示元素候选；只有用途不清楚时才退回 `recommendations.<source_mode>`。用户的原始业务关键词只是线索，不是最终 selector。
- 对每个候选增强点，先写 `business_role`、`viewer_job`、`visual_gap` 和 `recommended_treatment`。`source_mode` 只约束遮挡和安全区，不能单独决定是否生图。
- `recommended_treatment` 只能表达为：`source_ui_component`、`generated_asset`、`text_or_caption`、`sfx_or_music` 或 `none`。没有明确 viewer job 的增强点应为 `none`，不要为了“丰富”而添加。
- 在进入最终 enrichment 之前，按顺序产出 `focus-candidates`、`focus-frames`、`focus-grounding` 和 `focus-review`；对 screen recordings，只接受有 frame evidence 的坐标。
- 在生成 assets 或 final rendering 前展示已确认的 planned source mode、`profile`、elements、captions、images、SFX、music、output-timeline timestamps、reasons、grounding evidence 和 missing assets。
- 运行 `project enrich-plan` 后展示 `qa_checks[]`。每个计划加入点都要能说明 expected、asset/provenance、是否需要抽帧、warnings 和是否需要人工复核。
- 2.0 enrichment plan 清楚到足以让用户 review 前，不要生成 images、B-roll、music 或 animation clips。
- 对 icon、animated icon、UI component、sticker、template、B-roll 或图片需求，默认通过 host MCP、API 或平台工具做互联网语义检索。不要把“本地 UI 素材库”当作前置假设；当前 project 的 `assets/*` 只是本次确认后的渲染输入。
- 优先选择官方或上游维护的能力：shadcn MCP / shadcn-compatible registry、21st.dev MCP、Iconify API、Lordicon official Web/API/npm、LottieFiles dotLottie。第三方 MCP 可以作为候选，但必须在 proposal 中标明 third-party/source risk。
- 视觉素材候选应先出现在 production proposal 或后续 review surface 中，说明 query、provider/source、用途、license/cost 风险和为什么适合 viewer job。Search/list 只负责召回；agent 必须结合 viewer job、ASR、源画面、source mode、business direction、授权和 runtime 风险比较候选，再在 `visual-request.json` 写入 `selected_candidate_id` 和非空 `selection_reason`。`reason` 说明为什么需要该槽位，`selection_reason` 说明为什么选择该候选；不要把 provider 的 `recommended` 或数组顺序当作选择。Standalone mode 运行 `project visual-catalog`、`project visual-search`、`project visual-acquire` 和 `project visual-review` 获取本地 asset；platform mode 先调用平台 visual/component tools 写入候选 metadata 和安全的 project-local preview，只物化 agent 选中候选的完整 `local_path`，再运行 CLI acquire/review 校验和导入。最后把获取到的 `asset_id` 写进 `enrichment-plan.json`。
- `preview_path` 只用于查看和比较候选，不能代替 `local_path` 或进入 acquire。Platform mode 下缺少显式选择、选择理由或选中候选的本地完整素材时必须报告 blocker；不要退回 CLI provider、recommended candidate、第一项或唯一候选。
- 如果计划包含 music，先运行或读取 `project music-catalog`，写入 `music-request.json`。Standalone mode 通过 `project music-acquire` 和 `project music-review` 获取可审查的本地音乐资产；platform mode 先调用平台 music capability fulfill，再运行 CLI acquire/review 作为导入和校验面。
- 只在互联网检索不到合适确定性素材，或用户目标需要原创概念画面时，才使用 image generation：cover art、abstract concept art、B-roll illustration、brand imagery。不要为 subtitles、flowcharts、software screenshots、data cards 或常见图标语义优先使用 image generation。对“闹钟/电话/导航/消息/蓝牙/电池”等常见业务语义，默认先走 Iconify/Lordicon/Lottie/shadcn/21st acquisition，而不是文字 chip 或手写 SVG。
- 对 screen recordings，默认使用 transparent guidance；除非用户目标证明有必要，不添加 generated images 或 music。
- 如果当前 host 没有生图能力，skill 必须诚实标记 missing asset、请求用户提供图片，或只在测试中使用明确标记的 deterministic placeholder；不要声称完成了 AI 生图。
- Platform mode 下如果 host 没有对应平台工具，skill 必须报告 blocker，而不是退回 CLI provider 或把 provider URL/API/MCP 原始结果写进 artifacts。
- 如果 proposal 选择 BGM、SFX、icons、Lottie、UI handoff、图片、B-roll 或生图，后续必须出现对应 request/review/manifest/enrichment/QA artifact。选择不加素材时，也必须说明为什么素材不会帮助 viewer job；不要把空素材计划说成已准备完成。
- 对某个视觉槽位决定 no insert 时，把它从最终 `visual-request.json.requests[]` 移除，并在 business/focus review 记录原因；不要伪造候选或留下无选择的 request。没有视觉 requests 时不要运行 visual acquire。
- Platform mode 下，host 已经生成 `prepared-assets.json` 或 `assets/koubo-clip/*` 仍然只是素材准备完成，不等于成片会使用。确认后的 canonical `enrichment-plan.json` 必须说明每个 BGM、SFX、icon/SVG/PNG/Lottie/UI/image/B-roll 的 project-relative `asset_ref`/`asset_id`、output-timeline timing、volume/position/size/animation 等使用参数和 `purpose`。
- 新 workflow 的 skill 输出结构是 proposal `options[]`，每个 option 自带 `business_direction`、`edit_execution_plan` 和 `asset_requirements`。`asset_requirements` 是给 Hermes capability 的请求层，不是 render usage plan。
- `prepared-assets.json` 和 `asset-manifest.json` 是素材库存/校验证据，不是渲染指令。只有 current canonical `enrichment-plan.json` 决定素材是否进入最终成片。
- 简化 platform handoff 只能写当前独立 `asset-usage-plan.json`，由 `project enrich-plan` 一次性归一化为 canonical plan。`edit-plan.json.asset_usage_plan` 和 `project.json.asset_usage_plan` 无效；render 只读取 current canonical `enrichment-plan.json`。
- `asset-usage-plan.json` 的 `asset_ref` 必须是 workspace/project-relative path；禁止本机绝对路径、URL、`file://`、token、raw MCP payload 或 provider 临时链接。时间必须是剪辑后的 output timeline。
- `edit-plan.json.decisions[].action:"cut"` 表示删除候选片段，不表示保留候选片段。保留内容由未删除的 EDL ranges 和可选重排决定。
- 如果没有 current `enrichment-plan.json`，CLI 保持纯剪辑行为并报告 `enrichment_applied:false`；skill 不能把这称为已使用素材。
- Canonical enrichment 与新的 `asset-usage-plan.json` 同时存在时，必须把 `ASSET_USAGE_PLAN_CONFLICT` 当 blocker；不要隐式 merge，也不要覆盖已有 canonical plan。
- 如果 usage input 声明素材，缺文件、格式不支持或字段非法都应视为 blocker。不要要求 CLI 降级成纯剪辑版，也不要把 `missing_asset_ref`、`unsupported_audio_asset_format`、`unsupported_visual_asset_format` 或 `asset_usage_plan_invalid` 当作成功。
- 只为 viewer job 添加 visual content：定位段落、引导注意力、解释 sequence、总结 spoken point，或为可发布短视频增加 pacing relief。Decorative elements 是失败计划。
- AI 可以自主选择 HyperFrames elements，但选择必须服务用户用途：内部教程优先透明引导和 SFX；产品演示优先 UI focus/path/callout；课程讲解优先 chapter/flowchart/data；知识解释优先 key point/quote/data/concept visual；短视频包装才优先 hook、转场、强字幕、图片和配乐。
- 只有当 plan 引用真实本地 `asset_id` 时才使用 `visual_asset`。常见图标、动态图标、UI/template、B-roll、普通图片和原创 AI 生图都用 `visual_asset`，原创来源由 manifest `source:"agent_generated"` 表达。只有当 background music 是已批准 publishing goal 且已经通过 `music-review` 时才加入当前 2.0 audio plan。
- 对 screen recordings，如果 cue 指向 UI，要从 `project focus-frames` 生成的实际 source-local evidence 推导 normalized `target_rect` 或 `anchor_point`，并在 `params.coordinate_source_frame` 写明来源帧，同时把这一帧写入 `focus-grounding`。Render 后的 inspection frames 只用于 final output QA；没有 focus evidence 时不要写坐标。
- 显式 2.0 elements 要满足 CLI adapter 要求：lower-third/social/notification/code 等 semantic blocks 填 `params.title`、`params.subtitle`、`params.detail`、`params.code` 或 `params.username`；screen focus 填 `target_rect`；anchored chip/callout 填 `anchor_point`。caption_identity 只写语义 preset 和文本，不写 CSS、像素或任意坐标；CLI 按输出宽高比冻结 exact layout。`local_media_ref` 只保留为 opaque metadata，不要解析、展开或传给 filesystem。
- 不要手写 `storyboard.json`、registry files 或 card HTML 作为事实来源。CLI 从当前 2.0 `enrichment-plan.json` 物化 storyboard 并安装 vendored registry elements；card 输入无效。
- 不要手写检查清单。Current 且被本次 render result 绑定的 `storyboard.json.qa_checks[]` 是合成清单和验收清单的共同来源；render 前看 `project enrich-plan.qa_checks[]`，render 后看 `project inspect.inspection_checks[]`。
- 不要手写任意 GSAP 或 JavaScript。HyperFrames runtime staging、registry installer、animation templates、SFX manifest 和 CDN allowlist 由 CLI 拥有。
- 不要把业务短语直接映射到元素 ID。先过 semantic focus planner，再让 grounded evidence 决定最终坐标和元素选择。
- 除非真实 CLI 或 host tool call 已发生，否则不要声称 rendering 或 inspection 已开始。
- EDL、storyboard 和其他 CLI-derived checkpoints 只有 lineage current 才可消费。EDL stale 且权威前置完整时，由统一 deterministic compiler 自动重建；不要按文件存在性复用或手写替代。
- `artifact-manifest.json` 由 CLI 独占写入。Skill/host 写 authoritative input 或 command request 后，先让对应 validator 登记；status 中未登记的合法输入是 `pending_validation`，不是 current。
- JSON 是机器合同；Markdown 是可重建 human view。不要用 Markdown 是否存在或内容变化判断业务状态。
- MP4、storyboard 或 report 存在都不能证明完成。只有 current `render-result.json` 指定的 canonical output hash/probe 匹配、current `inspection.json` 绑定同一 render fingerprint 且没有 blocker 时才能声称完成。
- 失败后保留 partial artifacts，并报告 manifest-committed 最后成功 checkpoint；不要把它描述为旧 bytes 的物理 rollback。

## Detached authoring boundary

- Skill 可以写 agent-owned proposal、edit-plan、request、selection 和 enrichment intent，但只能调用 CLI compiler/export 生成 EDL、captions、resolved storyboard 和 render contract。
- Detached flow 先读 capabilities/status，再写 authoring artifacts；external evidence 必须通过 CLI `--import` 摄入。
- Skill 可以解释 CLI 公开 authoring schema 的业务语义，但不复制结构事实；不计算 contract digest，不修改 bundle，不在 strict render machine 上运行。
- Skill 不读取 `.virtual/*`。Proposal selection fingerprint 只取成功的 `project proposal --json.option_selection_fingerprints`，或对应 selection 仍为 current 时的 `project status --json.fingerprints["proposal-selection:<option-id>"]`；pending、stale 或 invalid proposal 没有可确认 fingerprint。local authoring render 和 strict render 共享同一个 execution kernel / frame schedule；`project inspect` 可以返回结构化失败结果，但 blockers 非零时必须视为未完成。
- Current contract 导出后按照 status 的 distributed handoff 指引转交 bundle；不要求 detached authoring 机器 materialize source 或运行 `project render`。
- Strict execution 只认 `verify -> bind -> render -> inspect`；`render-contract.json`、`bindings.json`、`render-contract-result.json` 和 `render-contract-inspection.json` 是同一个 render-contract 2.0 generation。若 bundle 仍是 0.0.13 mixed chain，必须整条 re-export / re-execute，不能手写迁移、补默认值或 fallback；`render_status: success` 不是完成。
- Strict execution 出错时报告 mismatch/blocker；不得重新分析视频、补默认 edit plan、改 transcript、重选素材或“修复” authoring project。若 `project inspect` 返回 blocker，它仍然是结构化验收结果，不是成功。
