# 媒体产物

## 目的

本规则定义 koubo-clip project layout 和 inspection boundaries。

## 标准输出布局

生成的 project 应使用如下结构：

```text
koubo-clips/<slug>/
  project.json
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
  edl.json
  enrichment-plan.json
  storyboard.json
  asset-manifest.json
  subtitles.srt
  .hyperframes/
    recut/
      public/
        index.html
        compositions/
        cards/
  assets/
    icons/
    images/
    lottie/
    music/
    overlays/
    visuals/
  renders/
    clean.mp4
    final.mp4
  report.md
```

具体文件名可以演进，但 canonical artifacts 的任何变化都必须同步更新本规则、docs、skills 和 validation。

## 产物含义

- `material-report.md` 总结输入素材包含什么，以及它可以变成什么。
- `project.json` 记录 project-level metadata，至少包含 `provider_execution_mode:"standalone"|"platform"`。该字段不是 `enrichment-plan.profile`；同一 project 中不能混用两个 provider execution mode。
- `sources.json` 记录每个 source video 的 `source_id`、稳定顺序、原始文件名、project-local path、duration 和 probe facts。单 source project 也使用这个 manifest。
- `transcript.json` 是 machine-readable transcript，包含 source IDs、source-local timings 和明确 timing granularity。
- `transcript.md` 是 agent/human review surface。
- `analysis.json` 包含机器检测出的 silence、pause、filler、false-start 和 repeat candidates，带 source IDs。
- `source-frame-request.json` 是 skill/agent 在 ASR/explore 后根据 transcript、material report 和 source metadata 写入的源画面观察请求。它包含 1–20 个按原顺序处理的 source-local 时间点；CLI 不做语义选点。
- `source-frames.json` 是 CLI 生成的源画面证据 manifest，按 request 顺序记录从 0 开始的 index、request identity、source_id、source-local time、project-relative JPEG path、尺寸、byte size 和 SHA-256，并汇总 frame count 和总 byte size；实际图片保存在 `.source-frames/frame-0001.jpg` 等稳定顺序路径。
- `review-package.md` 是 human-readable pre-render review surface。
- `review-package.json` 包含 original subtitle ranges、proposed cuts、reasons、confidence、unresolved risks 和 source identity。
- `production-proposal.json` 是用户确认前的制作方案合同，由 skill/agent 写入。它包含 source mode、presentation intent、目标摘要、素材摘要、默认 option，以及 2-3 个 option。每个 option 说明适合的发布目标、为什么适合当前素材、剪辑、字幕、UI 动效、图片/生图、音乐、SFX、风险和确认事项。它只能写素材 intent、query、provider preference、license/cost/source risk 和 reason，不能写最终 `asset_id`、local path、provider URL、download URL、绝对路径或 raw MCP payload。
- `production-proposal.md` 是 CLI 从 proposal 物化出的 human-readable confirmation surface。它用于用户回复 `OK` 或 option id，不是 render source of truth。
- `focus-candidates.md` 是 semantic focus planning 的 human-readable candidate surface。
- `focus-candidates.json` 记录 normalized semantic intent、candidate element type、viewer job、风险和所需证据。
- `focus-frames.json` 记录确认方案后的 grounding evidence：candidate timing 来自 cleaned output timeline，经 EDL 映射后抽取 source-local frame，manifest 记录 source timeline evidence；实际截图保存在 `.focus/frames/*.jpg`。它不能替代确认前的 `source-frames.json`。
- `focus-grounding.json` 绑定 candidate id、frame id、confidence、coordinate-bearing fields 和 frame evidence。
- `focus-review.md` 是 enrichment review surface，描述保留、拒绝和仍需确认的 grounded choices。
- `focus-review.json` 保存对应的 machine-readable review decisions 和 unresolved risks。
- `music-catalog.json` / `.md` 在 `standalone` mode 下暴露本地曲库、MiniMax、Freesound 和 Pixabay 的可用性；在 `platform` mode 下这些外部 provider 应标记为 host-managed 或 disabled。它不能输出 API key。
- `music-request.json` 是 agent/user 写入的音乐获取请求，包含来源、用途、mood、target duration、provider、prompt/query 或 local path。AI music 的 prompt 必须是配乐 prompt：background/underscore、纯音乐、no vocals、目标时长和用途要可读；不要把 TTS/旁白提示词放进这里。在 `platform` mode 下它是给平台 music capability 的 request spec，CLI 不据此调用外部 provider。
- `music-acquisition.json` 是 CLI 写入的实际获取结果，包含 provider、model、prompt/query、duration、hash、license、original_url、cost 和 output asset。
- `music-review.json` / `.md` 是给用户和 agent 审查的音乐选择面，说明是否建议把获取到的音乐加入 `enrichment-plan.music[]`。
- `visual-catalog.json` / `.md` 在 `standalone` mode 下暴露 CLI-owned Iconify/Lordicon、Lottie/dotLottie import、shadcn/21st handoff、Rive future provider，以及 HyperFrames allowlisted runtime dependencies；在 `platform` mode 下这些 provider 应标记为 host-managed 或 disabled。它不能输出 API key 或本机 provider 状态。
- `visual-request.json` 是 agent/user 写入的视觉素材获取请求，包含 viewer job、semantic query、asset type、preferred sources、用途、可选 timing/zone 和 selected candidate。在 `platform` mode 下它是给平台 visual/component capability 的 request spec，CLI 不据此调用 Iconify、Lordicon、URL download 或 MCP。
- `visual-candidates.json` / `.md` 保存候选素材，包含 provider、preview/source/download URL 或 local handoff path、license、cost/source risk、runtime dependencies 和推荐理由。候选里允许 provider URL；它们不是 render 输入。`platform` mode 下候选应使用平台脱敏后的 provider/source label、opaque source ref 或 project-local handoff path，不保存 API key、Bearer token、provider URL 或 MCP 原始 payload。
- `visual-acquisition.json` 是 CLI 写入的实际下载或导入结果，包含 provider、asset type、project-local path、hash、license、source_url、original_author、acquired_at、runtime dependencies 和 warnings。
- `visual-review.json` / `.md` 是给用户和 agent 审查的视觉资产选择面，说明哪个素材建议进入 enrichment，以及来源、授权和 runtime 风险。
- `edit-plan.json` 包含 agent-reviewed decisions。
- `edl.json` 是 render-ready edit decision list。Entries 包含 `source_id`、source-local ranges、output order、quote 或 label、reason。
- `enrichment-plan.json` 当前主合同是 v1.2 output-timeline `profile` 和 `elements[]`。`elements[]` 可引用 `registry_block`、`registry_component`、`animation_rule`、`caption_identity`、`sfx`、`visual_asset` 或 legacy `generated_asset`。`visual_asset` 必须引用通过 visual acquisition/review 或 manifest provenance 校验的本地 asset。v1.1 `captions/cards/music` 与 legacy v1.0 `slots[]` 可以被接受并归一化为 element usage。
- `elements[]` 和兼容 `cards[]` 可以包含用于 focus boxes 的 normalized `target_rect`，或用于 callouts 的 `anchor_point`。这些坐标是 output-canvas ratios，必须保持在 `[0,1]` 内。
- `storyboard.json` 是 CLI-materialized HyperFrames render plan，也是成片 QA checklist 的单一来源。它由 enrichment plan、subtitles、source aspect ratio、asset manifest、visual review 和 music review 生成，并包含 `qa_checks[]`。
- `asset-manifest.json` 记录 enrichment elements/cards/music 消费的本次 project files。V0 的 `path` 必须是 project-relative local path；未来 stable workspace refs 只有在 schema、resolver 和 render materialization 明确实现后才能进入 manifest。Provider URLs 不是最终 asset refs。Standalone mode 的 entry 可以保留 provider/license/prompt/query/source_url/original_url/hash 等 provenance。Platform mode 的 entry 应优先保留平台脱敏 provenance：provider label、opaque source ref、license/usage note、attribution、host audit id、acquired_at、hash、runtime_dependencies 和用途说明，不保存 provider 临时 URL、API key、本机绝对路径或 MCP 原始结果。视觉 `type` 可为 `icon`、`animated_icon`、`lottie`、`ui_component`、`template`、`sticker`、`broll` 或 `image`。
- `subtitles.srt` 从 transcript timings 和 selected cuts 派生。
- `renders/clean.mp4` 是 cleaned talking-head video。
- `.hyperframes/recut/public/index.html` 是生成的 single HyperFrames composition。`public/compositions/` 包含从 vendored HyperFrames registry 安装的 block/component 文件；`public/cards/*.html` 是 v1.1 兼容 card fragments，不是任意 agent-authored HTML。
- `.hyperframes/recut/public/index.html` 可以加载 CLI-owned catalog 声明的白名单 CDN runtime dependencies。每个 external dependency 必须有 domain、package、version 或明确 versionless exception，并进入 `storyboard.json` / inspect / report。
- `renders/final.mp4` 是启用 enrichment 时的 enriched deliverable。
- `.inspection/card-*.jpg`、`.inspection/element-*.jpg` 和同类多帧截图包含 render 后基于 final output timeline、由 `storyboard.qa_checks[]` 派生的检查帧。
- `report.md` 总结移除了什么、保留了什么、每个 QA check 的 expected/status/frame paths，以及仍需人工关注什么。

## 检查规则

- JSON artifacts 在 schemas 存在后必须能 parse 并匹配 schema。
- Project metadata 的 `provider_execution_mode` 是 immutable safety boundary。不同 mode 生成的 provider artifacts 不能在另一 mode 下静默复用；需要重新导入、重新校验或新建 project。
- `transcript.json` 必须声明 timings 是 `word`、`segment` 还是 `text-only`。
- Text-only transcripts 必须无法通过 precise-cut validation。
- Source media 永不被覆盖。
- Source-frame request 只能引用 `sources.json` 中的 source，并满足 `0 <= time_seconds < source.duration_seconds`。Source path 必须是 project-relative、真实可读的 project-local file；拒绝 URL、绝对路径、`..` 和解析到 project 外部的 symlink。
- `source-frame-request.json` 和 `source-frames.json` 只接受合同声明的结构化字段。`id`、`source_id` 和可选 `segment_id` 是 opaque identifiers，不得包含 URL scheme、`/`、`\` 或 Windows drive/path 形态；未知字段不能夹带额外 path/URL/provider/token metadata，manifest 的 artifact path 必须是 project-relative。`transcript_quote` 和 `reason` 只做 trim 后非空校验，不扫描文本内容，正常台词或理由可以包含 URL 或路径文本。Warnings、errors 和日志不得泄漏 source 绝对路径、provider key 或 raw provider payload；命令 JSON 结果中的既有 `data.project_path` 是唯一兼容例外。
- Source-frame V0 使用 delete-first，不使用 atomic staging 或 request hash。正常可写 filesystem 上先使旧 manifest 失效、成功时最后写新 manifest；host 只可在最近一次 `project source-frames` 成功后将其视为 authoritative。Cleanup 因 filesystem 权限失败时旧文件可能物理残留，但命令必须返回 `PROJECT_SOURCE_FRAMES_FAILED`，host 必须忽略该残留 manifest。
- Source frames 是确认前的只读素材理解证据，不依赖 EDL，不触发 edit plan、focus、asset acquisition、enrichment 或 render。CLI 不执行视觉语义分析。
- EDL ranges 必须引用已有 source、位于该 source duration 内，并且在 output order 中不能错误重叠。
- Rendered duration 应在小容差内匹配 EDL。
- 除非明确关闭，captions 是期望存在的。
- Enrichment elements/cards/music 必须使用 output-timeline timing，而不是 source timing。
- visual enrichment 启用时，captions 在 HyperFrames composition 中使用受支持的 `anchor` identity。
- Text/image cards 和 registry elements 必须保持 caption readability，并停留在受支持 template zones 内。
- Screen-recording enrichment 必须保留 source UI readability；默认使用 transparent overlays。
- Screen-recording focus planning 必须先通过 `focus-candidates`、`focus-frames` 和 `focus-grounding`，再进入 `enrich-plan`；坐标没有 frame evidence 就算无效。
- Source frames、focus frames 和 inspection frames 必须保持 timeline/阶段分离：分别使用 source-local time、由 cleaned output timing 经 EDL 映射得到的 source evidence、以及 final output timeline。
- `project enrich-plan` 和 `project inspect` 应暴露 `element_usage[]`；`project inspect` 应暴露 `inspection_frames[]`，让 agents 可以验证 visual readability，而不是猜。
- `project enrich-plan` 应暴露 `qa_checks[]`，让 agents 在 render 前检查每个加入点的 asset/provenance、timing、coordinate evidence、music/SFX 风险和 expected viewer job。
- `storyboard.json.qa_checks[]` 是 render 后检查的事实来源。不要新增或手写独立 `inspection-plan.json`。
- `project inspect` 应暴露结构化 `inspection_checks[]` 和兼容的扁平 `inspection_frames[]`。Visual checks 默认抽中点帧，持续 6 秒以上的加入点抽开始、中点和结束附近 3 帧；SFX/music 不抽视频帧，但必须出现在 QA checks 中。
- CLI 的检查状态只表示 `sampled`、`warning` 或 `blocker`；视觉审美、是否达到用户目标和是否需要重做由 skill/agent 根据 inspection frames 判断。
- `project focus-candidates`、`project focus-frames`、`project focus-grounding` 和 `project focus-review` 应暴露对应的 candidate、frame、evidence 和 proposed element paths，让 agents 可以从 candidate 回溯到证据，再回到 final plan。
- `project proposal` 只校验和物化 `production-proposal`，不能生成 `edit-plan`、`focus-*`、`music-*`、`asset-manifest`、`enrichment-plan` 或 render artifacts。
- `production-proposal` 可以引用 `review-package` 中的 cleanup candidate IDs，但不能包含未确认的 asset id/path、provider URL、download URL、绝对路径、`..`、raw MCP payload、无证据坐标或最终 output timeline。
- 如果 proposal 选择 BGM、SFX、icons、Lottie、UI handoff、图片、B-roll 或生图，确认后的执行阶段必须有对应 request/review/manifest/enrichment/QA artifact。选择不加素材时必须说明原因，不能把空素材计划当作已完成。
- `element_usage[]` 应暴露 adapter family、render strategy 和 screen safety，让 review 能区分 native composition、CLI overlay、caption component、anchored chip 和 SFX mix。
- 对 screen recordings，任何 `target_rect` 或 `anchor_point` 都必须能从 `focus-grounding.json` 追溯到 `focus-frames.json` 里的 frame evidence；没有证据的坐标无效。
- Music 是可选的；存在时不能压过 speech。
- Music 必须在 final render 前定义 volume/fade/ducking behavior。
- Music acquisition 可以联网或调用 provider，但 render/inspect 只能消费已落地的 project-local music asset。
- 在 `platform` mode 下，music acquisition 命令不能触发 MiniMax、Freesound、Pixabay 或其他 provider；缺少已落地音乐 asset 时返回 blocker，要求平台先 fulfill `music-request.json`。
- `music-acquisition.json` 和 `asset-manifest.json` 不能包含 API key、Bearer token 或未下载的临时 provider URL 作为 asset path。
- Visual acquisition 可以联网或调用 host MCP、API 或平台工具。它的主路径是互联网语义检索，不是查找长期本地 UI 库。确认后的视觉素材只需要为当前 project 落地或形成稳定 workspace ref，不承担跨 agent 缓存职责。
- `visual-search` / `visual-acquire` 可以访问 provider；`render` 不能访问 provider。`visual-candidates` 中的 `preview_url`、`source_url`、`download_url` 不能成为最终 asset path。
- 在 `platform` mode 下，visual search/acquire 命令不能触发 Iconify、Lordicon、URL download、MCP 或 host handoff provider；只能读取平台已写入的候选 metadata、本地 handoff 文件或 project-local asset。
- SVG/icon assets 必须经过 sanitization。拒绝 `<script>`、`foreignObject`、事件 handler、external href、`javascript:` 和 remote `url()`。
- Lottie/dotLottie assets 必须是本地 `.json` 或 `.lottie`，并在 manifest/runtime dependency summary 中记录 `lottie_web_5_12_2` 或 `dotlottie_web_0_76_0`。
- Asset references 在 V0 必须是 project-relative local paths。未来 stable workspace refs 只有在 schema、resolver 和 render materialization 明确实现后才允许；URLs、absolute paths 和 `..` 无效。
- HyperFrames registry 和 render resources 来自 `packages/cli/vendor/hyperframes`。即使上游 mirror 中存在 `SKILL.md` 或目录名包含 `skills`，它们也不是对外 agent skills；agent 只能通过 `skills/koubo-clip` 的 references 和 CLI `element-catalog` 理解并选择元素，不能把任意 HTML/JS 当成 artifact 输入。
- 除非 render 被跳过，否则应有 final MP4。
- Multi-source renders 默认按 `sources.json` 顺序；除非 `edit-plan.json` 明确重排 sources。

## 失败处理

- 失败后保留 project directory。
- inspection 期间不要生成新策略。
- 不要把手写 replacement subtitles、manifests 或 render scripts 作为正常恢复路径。
