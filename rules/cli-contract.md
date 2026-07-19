# CLI 合同

## 目的

本规则定义 koubo-clip CLI 负责什么。CLI 是 command behavior、media probing、candidate detection、validation、canonical output layout 和 rendering 的硬合同。

## CLI 负责

- `koubo-clip --version`、稳定 secret-free 的 `capabilities --json` 软件合同，以及版本化 artifact contract registry/discovery。
- `koubo-clip doctor` 环境检查。
- CLI 独占写入的公开 `artifact-manifest.json`、只读 `project status --json`、artifact lineage 与 stage attempts。
- Project creation 和 canonical output directories。
- Provider execution mode handling：`standalone` 和 `platform`。
- FFmpeg/ffprobe probing 和 media metadata。
- ASR mode handling：`auto`、`off` 和 `external`。
- Standalone 默认线上 ASR adapter：Cloudflare Whisper；显式离线兜底：`whisper-cli`。
- Transcript ingestion 和 normalization，不受 transcription backend 影响。
- Transcript timing-granularity labeling：`word`、`segment` 或 `text-only`。
- `source-frame-request.json` strict validation、project-local source containment、确定性 JPEG 抽取和 `source-frames.json` 物化。
- Silence、pause、filler、false-start 和 repeat-candidate detection。
- 给 agent review 使用的 machine-readable candidate output。
- Review package generation，包含 original transcript、proposed cuts、timestamps 和 strategy reasons。
- Production proposal 完整作者合同、聚合 validation 和 markdown 物化，作为用户确认前的方案面。
- Edit-plan 和 EDL schema validation。
- Semantic Focus Planner 的 artifact 物化与校验：focus-candidates、focus-frames、focus-grounding 和 focus-review。
- Music Acquisition：music-catalog、music-request validation、standalone local library import、standalone network/AI music acquisition、platform landed-asset import/provenance validation、review artifacts 和 asset-manifest 写入。
- Visual Acquisition：visual-catalog、visual-request validation、standalone Iconify 搜索和 SVG 下载、standalone Lordicon/Lottie/shadcn/21st handoff 候选导入、platform landed candidate/static export import、SVG sanitization、runtime dependency provenance、review artifacts 和 asset-manifest 写入。
- Enrichment-plan、storyboard、storyboard QA checks 和 asset-manifest validation。
- Vendored HyperFrames element catalog、registry resolver 和 safe installer。
- 随 npm package 或内部二进制包作为 sidecar 分发的 HyperFrames resources：registry、HTML fragments、caption themes、字体、SFX、runtime adapters 和示例资源。
- 从 transcript timings 生成 subtitles。
- Deterministic render assembly：cuts、fades、embedded captions、registry elements、SFX 和 music mix。
- 支持 visual enrichment 的 HyperFrames single-composition recut rendering。
- Commit-last render、`render-result.json`、structured `inspection.json` 和派生 report generation。
- 通过 JSON support commands 向 skills 和 agents 暴露 CLI-owned facts。

## Provider Execution Mode

Provider execution mode 是 project-level governance state，不是 `enrichment-plan.profile`。CLI 应支持：

```bash
koubo-clip project create <video> --provider-mode standalone
koubo-clip project create <video> --provider-mode platform
```

默认 mode 是 `standalone`。Project 创建或摄入后应把 `provider_execution_mode` 写入 project metadata；后续命令显式传 `--provider-mode` 时只能与 project metadata 一致，不一致返回 blocker。需要切换 mode 时新建 project。

`project create --source-manifest` 的 manifest 是 target 外部的 host-authored seed，不是可预写进 project 的 artifact。CLI 必须在任何 target mkdir 前完成参数、路径关系、读取、JSON、schema/version 和 source identity preflight；失败不得留下 target。Create 只接受不存在的 target：合法已有 project 返回 `PROJECT_ALREADY_EXISTS` 并指向 status，其他占用返回 `PROJECT_TARGET_OCCUPIED`。不得覆盖、删除、迁移、接管或自动选择平行项目名。

`standalone` mode 允许 CLI 在明确的 explore/acquisition commands 中使用用户已配置 provider。`platform` mode 禁止 CLI 主动调用需要 API key、联网、额度、MCP、用户授权、审计或 provider provenance 的外部能力；这些由 host/platform tool fulfillment 负责。CLI 只消费已落地 artifacts、project-relative local paths 或未来 stable workspace refs。

在 `platform` mode 下：

- `project explore --asr auto` 缺少 `transcript.json` 时失败，不调用 Cloudflare Whisper 或 `whisper-cli`。
- `project music-acquire` 不调用 MiniMax、Freesound、Pixabay；只导入或校验平台已落地音乐 asset。
- `project visual-search` / `project visual-acquire` 不调用 Iconify、Lordicon、URL download、MCP 或 host handoff provider；只读取平台已写入候选、本地 handoff 文件或 project-local asset。
- `project render` 和 `project inspect` 继续不联网、不读取 provider key，只消费已校验 artifacts。
- `project source-frames` 在两种 mode 下都只执行 project-local request validation 和 FFmpeg/ffprobe 抽帧；不调用 vision/provider，不读取 key，也不因 host 缺少 vision capability 而失败。
- `doctor` 报告当前 provider execution mode；外部 provider 在 platform mode 下显示为 host-managed 或 disabled，不提示配置 key。

## CLI 不负责

- 用户对话、定位或 creative briefing。
- 从 transcript 中选择 source-frame 时间点，或对抽取的 JPEG 做视觉语义分析。
- 读取、运行或解释 agent skill。CLI 不依赖 `skills/koubo-clip` 或任何上游 `SKILL.md` 才能执行。
- 在 confidence 低时判断哪个 repeated take 更好。
- 由 agent platform 处理的 image generation 或复杂 B-roll creative generation providers。
- 直接运行任意 MCP 生成的 React、HTML、JS、GSAP 或第三方 CDN。shadcn/21st 等 host/MCP 输出必须先转成候选 metadata 和本地静态导出，再由 CLI 校验/导入。
- Remotion、provider routing 或任意 custom animation DSLs。
- Codex thread IDs、Claude projects、Hermes tools、approval UIs 或 tenant IDs 等 host-specific concepts。
- 把 custom one-off HTML、GSAP、Remotion 或 FFmpeg snippets 作为正常用户工作流。

## 规划命令面

具体 flags 可以演进，但 command families 应保持稳定：

```bash
koubo-clip --version
koubo-clip capabilities --json
koubo-clip doctor
koubo-clip artifact contract <artifact> --json
koubo-clip project create <video>
koubo-clip project status <project> --json
koubo-clip project explore <project> --asr auto
koubo-clip project source-frames <project>
koubo-clip project review <project>
koubo-clip project proposal <project>
koubo-clip project element-catalog <project>
koubo-clip project focus-candidates <project>
koubo-clip project focus-frames <project>
koubo-clip project focus-grounding <project>
koubo-clip project music-catalog <project>
koubo-clip project music-acquire <project>
koubo-clip project music-review <project>
koubo-clip project visual-catalog <project>
koubo-clip project visual-search <project>
koubo-clip project visual-acquire <project>
koubo-clip project visual-review <project>
koubo-clip project enrich-plan <project>
koubo-clip project render <project>
koubo-clip project inspect <project>
koubo-clip generate <video>
```

Support commands 应优先提供 `--json`，让 agents 不需要抓取 logs。`capabilities` 描述命令、artifact contract index/schema digest、feature flags、provider-mode 语义和 render/inspect 所需 artifact keys，不探测当前机器；`artifact contract` 按 artifact 返回唯一当前 schema 的 ownership、role、完整 schema、适用的 template/example、validator/producer、prerequisites 和 digest，不接受 version 选择；`project status` 只读返回 artifact/stage 状态、blockers、remediation、next commands、canonical deliverable 和最后 checkpoint。`project source-frames` 校验 `source-frame-request.json`，按 request 顺序抽取 source-local JPEG 并返回 manifest path、数量、总 byte size 和稳定 warnings；`project proposal` 聚合校验 `production-proposal.json` 并生成用户确认 markdown，但不生成执行 artifacts；`project element-catalog` 返回完整 vendored HyperFrames 元素目录；`project focus-candidates` 校验 normalized semantic intents、candidate element types 和所需证据；`project focus-frames` 把 cleaned output-timeline candidate timing 经 EDL 映射为 source-local frame evidence；`project focus-grounding` 返回 coordinates 与 evidence 的绑定校验结果；`project focus-review` 返回 `proposed_elements[]`；`project enrich-plan` 返回 `source_mode`、`element_usage[]`、`qa_checks[]` 和 `warnings[]`；`project inspect` 只消费 current render result 的 canonical output，并返回 `source_mode`、`element_usage[]` 和 `inspection_checks[]`。confirmed proposal 的 option selection fingerprint 继续约束后续 `edit-plan` 和 `enrichment-plan`；被确认 option 的 `duration_target`、有序 `timeline`、`text_overlays` 和 `asset_requirements` 共同构成后续执行合同。若剪辑或素材语义越出已确认 option，CLI 必须返回 blocker 而不是静默修补。local authoring render、strict render 和 strict inspect 共享同一个冻结执行内核和同一帧时序语义，inspect 在 blockers 非零时仍可返回结构化结果，但命令必须 fail closed。

## Source Frames 合同

- Request 根对象只允许 `version`、`frames`；每项要求 `id`、`source_id`、`time_seconds`、`transcript_quote` 和 `reason`，只允许额外提供可选 `segment_id`。要求 version `1.0`、1–20 项、唯一 id、trim 后非空字符串和有限非负时间；未知字段无效。`id`、`source_id` 和可选 `segment_id` 是 opaque identifiers，不得包含 URL scheme、`/`、`\` 或 Windows drive/path 形态；`transcript_quote` 和 `reason` 仍只做 trim 后非空校验，允许 URL 或路径文本。
- Source existence 和时间边界在命令层校验：source 必须存在于 `sources.json`，且 `0 <= time_seconds < source.duration_seconds`。
- Source path 按字符串安全、realpath containment、regular file 和 read access 的顺序校验。URL、绝对路径、`..`、缺失/不可读文件和解析到 project 外部的 symlink 都被拒绝。
- 图片按固定三档编码：最长边 1280/`q:v 4`、最长边 1280/`q:v 6`、最长边 960/`q:v 6`；不放大小图。只有有效 JPEG 超过单图上限时才进入下一档。
- ffprobe 必须确认首个视频流是 `mjpeg` 且尺寸为正并不超过当前档位。单图最多 `1_500_000` bytes，批次最多 `30_000_000` bytes；manifest 记录 size 和 SHA-256。
- Source-frame writer 必须 commit-last：先完成 request/source 校验，在 managed staging path 生成并验证全部 JPEG、batch size 和 SHA-256，再原子替换公共 `.source-frames/` 与 `source-frames.json`，最后提交 artifact manifest success。失败不得先删除或半覆盖旧 evidence；partial staging 可以保留诊断，但不得标为 current。Host 只使用 `project status` 的 lineage 状态，不按文件残留判断权威性。
- 完全重复的 `source_id + time_seconds` 不去重，仍按 request 顺序抽取；warning 固定为 `SOURCE_FRAME_DUPLICATE_TIME: <currentId> duplicates <firstId> at <sourceId>@<time_seconds>s`，同一 key 始终引用首次出现的 id。
- Request 和 manifest 只接受合同声明的结构化字段，未知字段不能夹带额外 path/URL/provider/token metadata；artifact paths 使用 POSIX project-relative path。`transcript_quote` 和 `reason` 只做 trim 后非空校验，不扫描其文本内容，正常台词或理由可以包含 URL。Warnings、errors 和日志不得泄漏 project/source 绝对路径、provider key 或 raw provider payload。命令结果的 `data.project_path` 是保留现有 CLI 兼容性的唯一例外。
- Source frames 在 ASR/explore 后、制作方案前生成，只是只读素材理解证据。它们不读取 EDL、不做 output-timeline 映射，也不替代确认后的 focus evidence 或 render 后 inspection frames。

`project element-catalog` 的每个元素应包含 CLI-owned adapter profile，并返回按 source mode 分组的 `recommendations`，以及按 `source_mode × presentation_intent` 分组的 `purpose_recommendations`。Skills 应优先使用 purpose recommendations；只有当用户用途不清楚时才退回 source-mode recommendations，不能在完整 catalog 中盲选。

`--asr-provider whisper-cli` 只用于 standalone 离线测试或调试。`project music-catalog` 暴露本地曲库和 provider 状态；`project music-acquire` 在 standalone mode 下根据 `music-request.json` 获取或生成音乐，并把结果落成 project-local asset；在 platform mode 下只摄入平台已 fulfill 的音乐 asset。`project music-review` 生成审查面。Music provider calls 只允许在 standalone acquisition commands 中发生，`project render` 禁止联网、禁止读取 API key、禁止消费 provider URL。当前 music commands 不生成 TTS 或旁白，只处理 background music。

`project visual-catalog` 暴露 CLI-owned Iconify/Lordicon、Lottie/dotLottie import、shadcn/21st handoff 能力和 HyperFrames CDN runtime allowlist；`project visual-search` 在 standalone mode 下校验 `visual-request.json` 并执行 CLI-owned Iconify/Lordicon 搜索或合并 host/MCP handoff 候选；在 platform mode 下只读取平台已归一化候选。`project visual-acquire` 下载/导入已确认候选，写入 `assets/icons|lottie|visuals|images`、`visual-acquisition.json` 和 `asset-manifest.json`；在 platform mode 下只导入 project-local/local handoff asset。`project visual-review` 生成审查面。Visual provider calls 只允许在 standalone visual acquisition commands 或 host/MCP handoff 中发生，`project render` 禁止 provider search。

## 合同原则

- 每个公开 artifact 必须在 registry 中声明 schema version、ownership、role、writer、validator/producer、prerequisites 和 schema digest。Agent/Host authored artifact 公开完整 schema/template/example；CLI-owned artifact 明确 `external_writes_allowed:false`，不提供 authoring template。
- Runtime validator、公开 schema、template、example、capabilities 和 Skill 结构性声明必须共享同一合同事实来源或自动等价测试。每种 artifact 只支持 registry 声明的唯一当前 schema。
- Agent/Host authored artifact 校验保持 fail-closed，并在一次 JSON 响应中尽可能返回完整、有界的 `issues[]`；每项至少包含 JSON path、稳定 keyword/code 和 message。不保留只暴露首个结构错误的旧响应别名。
- CLI 可以产出 candidates；但不能假装不确定的 semantic edits 是确定的。
- 用户的原始业务关键词不是 contract key；CLI 和 skills 必须先归一化成固定 semantic intent，再进入 element selection 和 grounding。
- `production-proposal.json` 是确认层，也是被确认 option 进入执行合同的入口。它可以引用 `review-package` candidate IDs 和 source facts，但不能包含无证据坐标、未确认 asset path、provider URL、最终 output timeline，且不能替代 `edit-plan`、`focus-*`、`music-*`、`asset-manifest` 或 `enrichment-plan`。
- 被确认的 proposal option fingerprint 必须继续约束执行层：`project proposal` 返回的 `option_selection_fingerprints`、`edit-plan.json` 的 cut set 和后续 `enrichment-plan.json` 的 asset 确认项必须一致；若剪辑或素材语义越出已确认 option，CLI 必须返回 blocker，而不是静默修补。local authoring render、strict render 和 strict inspect 共享同一冻结执行内核；render 成功不代表 inspect accepted，inspect 只有 blockers 为零才算完成。当前 proposal 的唯一当前版本是 3.0，选中的 option 是后续 render contract 的执行真相。
- Source frames 是用户确认前 hard rule 的唯一媒体产物例外；该例外不允许提前生成 edit plan、focus artifacts、visual/music requests、assets、enrichment 或 render artifacts。
- Text-only transcripts 不能用于 precise cuts。
- Chinese word-level ASR 必须视为不可信，直到 validation 证明该文件 timing 精确。
- 可 render 的 EDL 必须先校验再 render。
- Enrichment elements 和 audio plan 必须在 final render 前按 post-cut output timeline 校验。
- `enrichment-plan.json` 只接受 2.0 `profile + elements + audio`；`profile.source_mode` 必填并控制 `talking_head_avatar`、`screen_recording` 或 `mixed` 行为。`elements[]` 只接受 `registry_block`、`registry_component`、`animation_rule`、`caption_identity`、`visual_asset`；外部视觉素材引用已通过 visual acquisition/review 或 manifest provenance 校验的本地 asset。BGM/SFX 分别进入 `audio.music[]` / `audio.sfx[]`。Cards、slots、顶层 captions/music、`generated_asset`、element-level SFX 和缺失 version 均不接受。
- `enrichment-plan.json` 是唯一 canonical visual/audio usage plan。简化交接只能写当前独立 `asset-usage-plan.json`，由 `project enrich-plan` 一次性物化 canonical plan；`project.json.asset_usage_plan` 和 `edit-plan.json.asset_usage_plan` 无效。Render 只读取 current canonical plan，不实现旧入口合并或运行时迁移。
- Elements 可以包含 normalized `target_rect` 和 `anchor_point`；CLI 校验坐标并保留到 `storyboard.json`。对 screen recordings，只要使用这些字段，就必须同时提供 `coordinate_source_frame` 和可追溯的 frame evidence；没有 grounding 就失败。
- `storyboard.json` 由 CLI 从已校验 artifacts 物化；skills 不能手写它作为事实来源。它只有 lineage current 且被本次 `render-result.json.inputs[]` 绑定时，才是该次 enriched render 的 executable 和 QA checklist。Inspect 必须先验证 current render result 与 canonical output，再使用该结果绑定的 storyboard checks 抽帧和报告；不要新增独立 `inspection-plan.json`。
- 缺失 HyperFrames 是需要 registry/caption visual recut plans 的 blocker；不要静默替换 renderer 或生成假 final。
- Pure music/SFX-only enrichment 可以不依赖 HyperFrames，直接使用 FFmpeg。
- Music acquisition 可以联网；render assembly 不可以联网。MiniMax、Freesound、Pixabay 等 provider output 必须先下载或解码为 `assets/music/*`，再通过 `asset-manifest.json` 和 `enrichment-plan.audio.music[]` 使用。
- Visual acquisition 的主路径是互联网语义检索。CLI 首版拥有 Iconify 搜索/下载和本地/URL/handoff 导入；agent/platform 负责更复杂的 MCP/host candidate sourcing。所有视觉资产必须在当前 project 中形成可检查的 local path 或未来 stable workspace ref，并记录 provider/source/license/provenance；不要把长期本地 UI 库当成前提。
- Agents 不能向 CLI 传入任意 HTML/JS/GSAP。CLI 拥有 vendored registry、safe installer、caption resources 和 SFX manifest；这些是 CLI resources，不是对外 agent skills。
- 显式 2.0 elements 必须满足 adapter 要求：semantic registry blocks 提供必填 params；screen focus 提供 `target_rect`；anchored component/callout 提供 `anchor_point`；需要图片的元素提供本地 `asset_id`。
- Generated HyperFrames workspaces 只能加载 CLI-owned catalog 声明的 runtime dependencies。允许直接从白名单 CDN 加载固定版本 scripts/styles，例如 `gsap@3.14.2`；Google Fonts family CSS 是首个明确记录的 versionless exception。
- Lottie JSON 和 `.lottie` 只能通过 CLI allowlist runtime 渲染：`bodymovin/lottie-web@5.12.2` 和 `@lottiefiles/dotlottie-web@0.76.0`。动画必须可 seek，不能依赖 autoplay/play 驱动 render-critical motion。
- CLI 必须校验 CDN domain、package 和 version，并在 `storyboard.json`、`project inspect` 和 `report.md` 中暴露 dependency summary。白名单 CDN domain 不等于任意 package 被允许。
- Screen-recording templates 必须默认 transparent overlays，不能用大块 opaque cards 遮住 source UI text。
- Screen-recording focus planning 必须先通过 `focus-candidates`、`focus-frames` 和 `focus-grounding`，再进入 `enrich-plan`；坐标没有 frame evidence 就算无效。
- Screen-recording risk warnings 是 advisory；invalid timing、missing assets 和 unsafe paths 仍然失败。
- Asset paths 必须是 project-relative local paths；拒绝 URLs、absolute paths 和 `..`。
- Platform mode artifacts 不能包含 API key、Bearer token、provider 临时 URL、本机绝对路径或 MCP 原始结果作为 render input。Candidate/review surfaces 可以保留脱敏 provider label、opaque source ref、license/usage note、host audit id、hash 和 attribution。
- 所有看起来 destructive 的 edits 在 render 前都是虚拟的；永不修改 source video。
- Output artifacts 必须可恢复、可检查。
- 如果 skill 需要 CLI-owned timing、layout 或 schema facts，应通过 CLI JSON 暴露，而不是复制 constants 到 skills。

## Blocker Codes

CLI failures 应使用稳定 code。Provider mode 相关 blocker 至少包含 `code`、`message`、`provider_execution_mode`、`stage`、`artifact` 和可执行 remediation。最小稳定 codes：

- `PROVIDER_MODE_MISMATCH`: command 或 artifact 与 project mode 冲突。
- `PLATFORM_PROVIDER_BLOCKED`: platform mode 需要 host/platform fulfillment，CLI 不会触发外部 provider。用 `stage` 区分 `asr`、`music-acquire`、`music-review`、`visual-search` 或 `visual-acquire`，并用 `artifact` 指向缺失或未 fulfill 的 artifact。
- `UNSAFE_ASSET_REF`: URL、absolute path、Windows drive path、`..` 或非 project-local path 被用作 render asset ref。
- `RAW_PROVIDER_RESULT_REJECTED`: raw MCP/provider payload 被写入 artifact，而不是归一化 candidate 或 landed-asset metadata。
- `PROVENANCE_MISSING`: landed asset 缺少最小审计 metadata，例如 provider/source label、license/usage note、hash、type 或 acquired_at。
- `SOURCE_FRAME_REQUEST_MISSING`: `source-frame-request.json` 不存在。
- `SOURCE_FRAME_REQUEST_INVALID`: request 文件无法读取或 JSON 无法 parse；结构和静态语义错误使用聚合的 `ARTIFACT_VALIDATION_FAILED`。
- `EVIDENCE_PROBE_UNAVAILABLE`: ffprobe executable/transport 无法启动。
- `EVIDENCE_PROBE_FAILED`: ffprobe 已启动但非零退出。
- `EVIDENCE_PROBE_OUTPUT_INVALID`: ffprobe 输出无法解析或缺少有效视频流。
- `EVIDENCE_CODEC_MISMATCH`: evidence codec 不是 JPEG `mjpeg`。
- `EVIDENCE_DIMENSION_MISMATCH`: evidence 尺寸与 manifest 不一致。
- `EVIDENCE_SIZE_MISMATCH`: evidence byte size 与 manifest 不一致。
- `EVIDENCE_HASH_MISMATCH`: evidence SHA-256 与 manifest 不一致。
- `EVIDENCE_BINDING_MISMATCH`: evidence request/candidate/source/time binding 不一致。
- `SOURCE_FRAME_SOURCE_NOT_FOUND`: source manifest/source id/path 无效，或 source 不是可读的 project-local regular file。
- `SOURCE_FRAME_TIME_OUT_OF_RANGE`: request time 达到或超过 source duration。
- `SOURCE_FRAME_FFMPEG_FAILED`: FFmpeg 无法执行、返回失败或未产生输出。
- `SOURCE_FRAME_IMAGE_INVALID`: ffprobe、JPEG codec、尺寸、stat 或 hash 校验失败。
- `SOURCE_FRAME_IMAGE_TOO_LARGE`: 最后一档 JPEG 仍超过单图上限。
- `SOURCE_FRAME_BATCH_TOO_LARGE`: 合规 JPEG 总量超过批次上限。
- `PROJECT_SOURCE_FRAMES_FAILED`: staging/directory preparation、public artifact replacement 或 manifest commit 等未预期命令失败；message 固定为 `source frames command failed`，不得传播包含真实路径的底层错误。
- `ARTIFACT_CONTRACT_UNSUPPORTED`: 请求的 artifact 没有公开合同。
- `CONTRACT_SCHEMA_UNSUPPORTED`: Artifact version 与当前 registry 唯一 schema 不一致。
- `ARTIFACT_VALIDATION_FAILED`: Agent/Host authored artifact 不符合公开 schema；响应必须包含 artifact、schema version/digest 和聚合 `issues[]`。
- `SOURCE_MANIFEST_PROJECT_CONFLICT`: detached source manifest 位于 project target 内部。
- `SOURCE_MANIFEST_INVALID`: detached source manifest 无法读取或不是合法 JSON；schema 结构和 version 分别使用 `ARTIFACT_VALIDATION_FAILED` 与 `CONTRACT_SCHEMA_UNSUPPORTED`。
- `PROJECT_ALREADY_EXISTS`: target 已经是合法当前 project；恢复必须运行 `project status`。
- `PROJECT_TARGET_OCCUPIED`: target 已存在但不是可创建目标；CLI 不修改或清理它。
- `PROJECT_METADATA_INVALID`: 已有 `project.json` 无法解析。
- `PROPOSAL_EXECUTION_MISMATCH`: confirmed proposal、edit-plan 或 enrichment 语义与后续 execution contract 不一致，CLI 不得静默修补。
- `INSPECTION_ACCEPTANCE_FAILED`: structured inspection 已写出，但存在 blocker，命令必须 fail closed。

## Render contract

- `render-contract.json`、`bindings.json`、`render-contract-result.json` 和 `render-contract-inspection.json` 是同一个 render-contract 2.0 generation；strict consumer 顺序固定为 `verify -> bind -> render -> inspect`。Skill、host 和 user 不得手写或改写；如果链路仍是 0.0.13 mixed chain，必须整条 re-export / re-execute，不能手写迁移、修补或 fallback。
- Export 只接受 sources v2 与 EDL v2；合同 payload 不得含 source path、project path、absolute path、export timestamp 或 `local_media_ref`。
- Contract bundle、binding output 和 run directory 均不可覆盖。公共合同/result 必须 commit-last。
- Strict render 只能调用冻结执行内核；禁止调用 authoring EDL compiler、transcript-to-SRT、enrichment validator、storyboard builder 或 provider。Local authoring render 和 strict render 共享同一个 execution kernel / frame schedule，只在冻结执行计划之后分叉。
- Unknown schema/capability/runtime digest、asset tamper、binding member 缺失/多余、source replacement 和 output tamper 都必须返回稳定非零错误。
- Detached authoring 导出 current contract 后，status 必须进入 distributed handoff，不再推荐本地 `project render` 或要求 `source-materialization.json`。若 strict inspection 发现 blocker，CLI 仍必须返回结构化 inspection 结果并 fail closed；结果存在不代表 accepted。
