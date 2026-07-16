# Artifact 生命周期与权威状态

## 状态

本文档定义 Koubo Clip 当前 artifact 生命周期与权威状态合同。产品和架构决策先在这里冻结，当前 CLI、Skill、rules 和测试按此实现。

对应执行顺序、修改面、回归矩阵和停止条件见 `docs/artifact-lifecycle-implementation-plan.md`。

仓库级实现与验收已于 2026-07-15 完成；实际安装包支持面仍以该安装实例的 `koubo-clip --version` 和 `koubo-clip capabilities --json` 为准。本文不替代 release/publish 状态。

## 要解决的问题

Koubo Clip 的问题不是 project 目录里文件多，而是文件存在目前不能可靠回答以下问题：

- 哪个 artifact 是当前业务决定；
- 哪个 artifact 只是某次命令的请求、证据、派生缓存或人类镜像；
- 一个输出由哪些输入生成；
- 上游输入改变后，哪些下游 artifact 已经过期；
- render 和 inspect 使用的是不是当前计划；
- 失败后应从哪个稳定检查点恢复；
- 外部宿主如何恢复流程，而不扫描目录和猜文件名。

目标状态必须满足一个核心不变量：

> 文件存在不代表 artifact 当前有效；只有 schema、fingerprint、dependency lineage 和最近一次成功命令都匹配时，它才是当前事实。

## 现状结论分类

### `working_as_designed`

- JSON 与 Markdown 同时存在是合理分层：JSON 是机器合同，Markdown 是 human view；问题不是文件成对，而是此前没有明确 Markdown 不参与状态判断。
- `review-package.json` 是 transcript + analysis 的派生 review surface，不是第二份 cleanup 决策。
- source-frame request 需要长期保留当前观察请求，frame bytes 是独立视觉证据。
- focus candidates、frames、grounding、review 分别表达语义选择、媒体证据、坐标决定和 deterministic review，不能为减少数量机械合并。
- candidate、selection、acquisition、asset manifest 和 usage 是不同职责；EDL 与 storyboard 作为可重建 checkpoint 也有恢复价值。

### `documentation_gap`

- 现有文档没有统一列出 artifact role、author、validator、consumer、直接依赖、失效范围和恢复命令。
- standalone/platform 共享 project-local artifact contract 的原则存在，但宿主缺少稳定 capability/status 入口。
- render/inspect 成功和项目完成的 machine-readable 定义不完整，Markdown/MP4 容易被误当状态。

### `contract_ambiguity`

- proposal 与 edit plan 没有稳定 selection fingerprint binding，无法证明当前执行计划对应哪次确认。
- `enrichment-plan.json`、两个内嵌 `asset_usage_plan`、`asset-manifest.json` 和 `prepared-assets.json` 的权威边界不清。
- Agent/host 写入合法 input 后如何进入 current，以及失败 attempt 如何记录此前没有公共合同。
- CLI/package version、软件 capabilities、精确 render inputs 和 structured inspect 缺少稳定发现面。

### `implementation_bug`

- `readOrBuildEdl` 仅凭 `edl.json` 存在就复用，edit plan 改变后 focus 可能消费旧 EDL。
- inspect 仅凭 `renders/final.mp4` 存在就优先选择它，纯剪辑重渲染后可能检查旧 enriched final。
- storyboard/QA 也按存在读取，可能把旧 enrichment 解释成当前 render。
- render 在 enrichment preflight 完成前覆盖 EDL、SRT 和 clean output，失败时形成半提交状态。
- 当前 parser 会丢弃 Skill 新写的 business planning 字段；这些变化既未校验，也不会进入 normalized fingerprint。

### `obsolete_or_duplicate`

- `project.json.asset_usage_plan` 与 `edit-plan.json.asset_usage_plan` 是重复且冲突的旧入口，当前 schema 直接拒绝；唯一简化 handoff 是独立 `asset-usage-plan.json`。
- 旧 MP4、storyboard、EDL、report 和 Markdown 可以物理保留用于调试，但其“文件存在即有效”的隐式状态被废止。
- 本轮不删除 review、source-frame、focus、candidate/acquisition 或 human-view 文件；它们承担独立职责，只是降回正确角色。

## 非目标

本轮不引入：

- 数据库或远程状态服务；
- 平台专属状态机；
- Hermes、Gateway、LocalAgent 或 TaskWorkspace 业务实现；
- 第二套 CLI；
- 为保存历史而复制整个 project；
- 新的第三方依赖；
- 对 source video 的原地修改；
- 删除 focus、grounding、visual/music acquisition、HyperFrames、render 或 inspect 能力。

## 状态模型

Koubo Clip 使用两层状态：artifact 状态和 workflow stage 状态。

### Artifact 状态

每个受管理 artifact 只有以下状态：

- `missing`: 预期路径不存在；
- `pending_validation`: agent、host 或用户新写入的 authoritative input / command request 结构可读，但尚未由对应 CLI validator 登记，或内容已不同于最近登记的版本；
- `current`: 文件存在、schema 有效、fingerprint 匹配，而且所有声明的输入仍为 current；
- `stale`: 文件本身可以读取，但生成它的输入 fingerprint 已改变，或依赖已经 stale；
- `invalid`: 文件无法解析、schema 不合法、路径不安全、引用不存在，或 CLI-owned derived/result 的受保护内容与已提交 hash 不匹配。

`pending_validation`、`stale` 与 `invalid` 必须分开。Agent 正常更新一份合法 edit plan 后，它是 pending validation；旧 EDL 结构合法但已经不对应当前 edit plan，它是 stale；损坏 JSON 或被篡改的已提交 render output 才是 invalid。

### Workflow stage 状态

供 `project status` 返回的阶段状态是：

- `not_started`；
- `ready`：前置条件满足，可以执行；
- `blocked`：缺少业务决定、必要输入或外部 fulfillment；
- `complete`：当前输出存在且 lineage 有效；
- `stale`：曾成功，但当前输入已经改变；
- `failed`：最近一次针对当前输入的执行失败；
- `not_applicable`：例如纯剪辑项目不需要 enrichment。

阶段成功不能通过文件存在推断。只有 CLI 最后提交的成功记录和 current 输出才能让阶段进入 `complete`。

Stage 状态按以下固定优先级计算，并始终另外返回 `last_attempt`：

1. 明确不需要该阶段时为 `not_applicable`；
2. prerequisite missing/invalid 时为 `blocked`；
3. authoritative input 或 command request 为 pending validation 时，对应 validator stage 为 `ready`，所有消费者 stage 为 `blocked`；
4. required outputs 全部 current 时为 `complete`；同一输入的失败重试保留在 `last_attempt`，不抹掉仍然有效的成功输出；
5. 当前 input fingerprint 的最近 attempt 失败且没有 current outputs 时为 `failed`；
6. 曾成功或有旧输出，但当前 lineage 已变化时为 `stale`；
7. prerequisites current 且尚未执行时为 `ready`；
8. 其他情况为 `not_started`。

## Artifact 角色

每个公共 artifact 必须声明一个 primary role。角色决定谁可以写、是否参与业务判断、是否可以重建，以及失效后如何恢复。一个 artifact 可以绑定 evidence 或由其他 artifact 派生，但不能因此同时声明多个 primary roles。

| 角色 | 含义 | 是否长期保留 | 能否单独证明阶段完成 |
| --- | --- | --- | --- |
| `authoritative_input` | 用户、agent 或 host 已确认的业务事实和执行决定 | 是 | 否；还需 CLI 校验和 lineage |
| `command_request` | 某条命令的显式输入请求 | 保留当前请求，便于重试 | 否 |
| `evidence` | 媒体帧、grounding、provider provenance 等审查证据 | 是 | 否 |
| `derived` | CLI 可从当前权威输入确定性重建的 artifact | 可保留作 checkpoint | 否 |
| `human_view` | 从 JSON 或 CLI facts 生成的 Markdown 等可读镜像；任何执行命令都不得消费它 | 可重建 | 否 |
| `execution_result` | render、inspect 或 acquisition 成功后的结构化结果 | 是 | 只有 fingerprint 仍匹配时可以 |
| `temporary` | 某次执行的 staging、工作目录和中间媒体 | 失败时可保留检查 | 否 |

JSON 和 Markdown 可以同时存在，但职责必须不同：JSON 是机器合同，Markdown 是 human view。修改 Markdown 不能改变 workflow 状态；删除 Markdown 可以由 CLI 重建。

## 公共状态文件

### `project.json`

`project.json` 只保存 project identity 和 project-level governance：

- project contract version；
- immutable `provider_execution_mode`；
- created/updated timestamps；
- 当前 project identity 所需的最小 metadata。

它不保存 edit plan、asset usage timeline、render readiness 或其他可与独立 artifact 冲突的业务决定。

### `artifact-manifest.json`

CLI 拥有一个公开、project-root、machine-readable 的 `artifact-manifest.json`。它不是隐藏文件，也不由 Skill 或宿主手写。

每条成功 artifact record 至少包含：

- artifact key 和 project-relative path；
- role；
- schema/contract version；
- content fingerprint；
- `authored_by`：`cli|agent|host|user`；
- CLI 生成结果的 `produced_by_command`，或外部输入的 `validated_by_command`；
- producer CLI version 与 command contract version；
- 输入 artifact keys 与对应 fingerprints；
- produced/validated timestamp；

Manifest 另外保留每个 stage 针对某个 input fingerprint 的最近一次 command attempt，至少包含 command、started/completed time、`success|failed`、稳定 failure code 和 remediation。失败记录不伪造 output artifact record。

成功 artifact record 的 `inputs` 必须引用 manifest 中存在的 records，并形成无环依赖图。Stage attempt 的 `inputs` 表达“本次实际尝试读取的内容”：失败 attempt 可以引用一个已读取但因 schema/业务校验失败而没有成功登记的外部 input key；这种 reference 只用于精确失败恢复，不能把该 input 或任何 output 变成 current。

Manifest 是 lineage 和执行 checkpoint index，不复制 artifact 的业务内容，也不持久化容易过期的 `missing|pending_validation|current|stale|invalid` 计算结果。业务事实仍在各自 JSON 中；`project status` 根据 record、当前文件和依赖实时计算状态。

Skill/agent/host 可以写 authoritative input 和 command request，但不能写 manifest。对应 CLI command 先 parse、校验 upstream binding，再登记它的 fingerprint：`project proposal` 登记 proposal；focus、visual、music 和 enrich commands 登记各自输入；所有 EDL 消费者通过同一个内部 `project.compile-edl` 阶段登记 edit plan 并自动重编 stale EDL。登记前 status 返回 `pending_validation`，并把相应 validator/consumer 列为 next valid command。

### Fingerprint

Fingerprint 使用 Node.js 内置 `crypto` 的 SHA-256，不新增依赖，文本格式为 `sha256:<hex>`。

- JSON：先通过对应 parser 的 semantic fingerprint projection 归一化，再按稳定 key 顺序序列化后计算；纯格式化变化不应造成 stale；
- source、asset、MP4 和 frame：按文件 bytes 计算；
- CLI 派生文本：可以记录 bytes hash 用于审计，但不作为上游业务输入；
- 一个阶段的 input fingerprint 由有序的 artifact key、schema version 和 content fingerprint 组合计算。

如果 artifact parser 会丢弃未知字段，fingerprint 必须基于被 CLI 实际消费的归一化值；需要进入合同的字段必须先进入 schema，不能靠未知字段暗中传递。Record 可以另存 `file_sha256` 供审计，但 JSON 的 physical file hash 改变、semantic fingerprint 不变时不产生 stale。

`created_at`、`updated_at`、`produced_at`、diagnostic timing、日志和 warning 展示顺序等非语义 metadata 不进入 content fingerprint。否则一次成功写入自身就会把所有下游错误地标成 stale。对象 key 稳定排序；source order、EDL output order 和 timeline 等有业务顺序的数组保序；inventory/candidate 等无业务顺序的集合按稳定 ID 投影。每个 parser 必须测试自己的 projection。

V0 `project status` 对所有准备声称为 current 的 source、asset、frame 和 MP4 重新计算 bytes hash；size/mtime 不能跨调用替代 hash。实现可以在同一次进程、同一次 status/command 内复用已经计算的 hash，但不能因此削弱返回状态的真实性。

### 动态 artifact keys

Inventory JSON 不能代替它所引用文件的 bytes lineage。Manifest 为媒体成员使用稳定动态 key：

- `source:<source_id>`；
- `source-frame:<frame_id>`；
- `focus-frame:<frame_id>`；
- `proposal-selection:<option_id>`；
- `visual-request:<request_id>` 和 `music-request:<request_id>`；
- `visual-candidate:<request_id>:<candidate_id>` 和 `music-candidate:<request_id>:<candidate_id>`；
- `asset:<asset_id>`；
- `render-output:clean` 和 `render-output:final`；
- `inspection-frame:<check_id>:<index>`。

集合 fingerprint 由成员 key 和 semantic/bytes fingerprint 按稳定 ID 排序后组合。消费者只绑定实际使用的成员 key；未选 candidate 或未引用 asset 的变化不能让 render stale。

这些动态 key 中一部分通过 `.virtual/*` 实现，但虚拟路径不是外部文件合同。`project status.artifacts[]` 只返回可读取的 managed artifacts；逻辑节点的 fingerprint 继续通过 `fingerprints[dynamic-key]` 返回。

## 权威事实划分

### Project 与素材理解

| Artifact | 角色 | 作者 | 消费者 | 权威边界 |
| --- | --- | --- | --- | --- |
| `project.json` | authoritative_input | CLI | 全部 project commands | 只保存 identity/mode，不保存业务计划 |
| `sources.json` | authoritative_input | CLI | explore、EDL、render、frames | source identity 和 project-local media facts |
| `transcript.json` | authoritative_input | CLI 或外部 ASR | analysis、review、proposal、subtitles | 唯一 machine-readable transcript |
| `transcript.md` | human_view | CLI | 用户/agent | 不是 transcript 事实源 |
| `analysis.json` | derived | CLI | review、proposal、edit plan validation | 可由当前 transcript 重建 |
| `material-report.md` | human_view | CLI | 用户/agent | 帮助理解素材，不参与 CLI 状态判断 |
| `source-frame-request.json` | command_request | Skill/agent | `project source-frames` | 当前观察请求，不表示用户批准制作方案 |
| `source-frames.json`、`.source-frames/*` | evidence | CLI | agent/host vision review | 只绑定 source bytes、source-frame request 和 extractor contract/version |

### Review 与确认

| Artifact | 角色 | 作者 | 消费者 | 权威边界 |
| --- | --- | --- | --- | --- |
| `review-package.json` | derived | CLI | proposal、用户/agent review | transcript + analysis 的 review package，不是新的业务决定 |
| `review-package.md` | human_view | CLI | 用户/agent | JSON 的可读镜像 |
| `production-proposal.json` | authoritative_input | Skill/agent | `project proposal`、用户确认、edit plan validation | 单次确认面；`options[]` 中每项同时包含 business direction、edit execution plan 和 asset requirements |
| `production-proposal.md` | human_view | CLI | 用户 | proposal 的可读确认面 |
| `edit-plan.json` | authoritative_input | Skill/agent | EDL compiler、render、inspect | 唯一 cleanup 决策；必须包含 `confirmed_option_id` 和 `proposal_selection_fingerprint` |

用户确认事件发生在宿主或 agent 对话层。Koubo Clip 不伪造审批系统，也不要求方向和方案各确认一次。`production-proposal.json.options[]` 就是 2-4 个可选业务方向及其执行摘要；用户只选择一次。`proposal_selection_fingerprint` 只覆盖 goal summary、被选 option 的 business direction、execution plan 和 asset requirements，不覆盖未选 option 或 Markdown 文案，因此修改未选方案不会无意义地使 EDL stale。

`project proposal` 在用户选择前登记并返回 `proposal_fingerprint` 和完整 `option_selection_fingerprints` map。每个 option projection 至少包含 proposal contract version、option id、goal summary 和该 option 的 semantic projection。用户确认后，agent 把 `confirmed_option_id` 与 map 中对应 fingerprint 写入 edit plan；EDL compiler 从 current proposal 重新计算并逐项比对。

缺少当前 proposal、确认绑定或 edit plan 时，staged workflow 必须 fail closed。快速草稿命令可以有独立、明确标记的简化合同，不能让 staged project render 静默猜测用户决定。

### Cleanup 与 timeline

| Artifact | 角色 | 作者 | 消费者 | 权威边界 |
| --- | --- | --- | --- | --- |
| `edl.json` | derived | CLI | focus、subtitles、render、inspect | 当前 sources + transcript + analysis + edit plan 的编译结果 |
| `subtitles.srt` | derived | CLI | render、用户 | 当前 transcript + EDL 的派生字幕 |
| `renders/clean.mp4` | execution_result | CLI | enrichment/render result | 当前 EDL 的 clean 输出；是否为 deliverable 由 render result 指定 |

EDL 可以作为 checkpoint 持久化，但不能因为文件存在就复用。任何消费者在使用前必须验证 EDL input fingerprint；不匹配时通过同一个 deterministic `project.compile-edl` 内部阶段自动重建并提交新 lineage。只有 proposal confirmation、edit plan 或其他 authoritative prerequisite 不完整时才返回 blocker。

### Focus 与 grounding

| Artifact | 角色 | 作者 | 消费者 | 权威边界 |
| --- | --- | --- | --- | --- |
| `focus-candidates.json` | authoritative_input | Skill/agent | focus frames/review/enrichment | 当前 edit plan/EDL 上的 semantic focus 决定 |
| `focus-candidates.md` | human_view | CLI | 用户/agent | JSON 的可读镜像 |
| `focus-frames.json`、`.focus/frames/*` | evidence | CLI | grounding、review、enrichment | 当前 focus candidates + EDL 映射到 source-local frames 的证据 |
| `focus-grounding.json` | authoritative_input | agent/host vision | focus review、enrichment | 坐标决定及其与当前 frame evidence 的绑定 |
| `focus-review.json` | derived | CLI | agent、enrichment | 当前 candidates + frames + grounding 的审查结果 |
| `focus-review.md` | human_view | CLI | 用户/agent | JSON 的可读镜像 |

这些文件不应为了减少数量而合并。它们表达了不同阶段：语义选择、媒体证据、坐标判断和确定性 review。需要修复的是 lineage，而不是删除证据层。

### Visual、music 与 assets

| Artifact | 角色 | 作者 | 消费者 | 权威边界 |
| --- | --- | --- | --- | --- |
| `visual-catalog.json`、`music-catalog.json` | derived | CLI | Skill/agent | 环境和 provider 能力快照，不是项目计划 |
| catalog Markdown | human_view | CLI | 用户/agent | JSON 镜像 |
| `visual-request.json`、`music-request.json` | command_request | Skill/agent | search/acquire/host fulfillment | 当前已确认方案产生的素材请求 |
| `visual-candidates.json` | evidence | CLI 或 host | agent selection、acquire | provider recall，不构成选择授权 |
| candidates Markdown | human_view | CLI | 用户/agent | 候选镜像 |
| `visual-acquisition.json`、`music-acquisition.json` | execution_result | CLI | asset manifest、review | 选中素材的落地和 provenance 结果 |
| `visual-review.json`、`music-review.json` | derived | CLI | agent、enrichment preflight | acquisition 的可读/可机审摘要，不决定最终使用 |
| review Markdown | human_view | CLI | 用户/agent | JSON 镜像 |
| `asset-manifest.json` | execution_result | CLI | enrichment preflight、storyboard、render | 哪些 project-local assets 已完成校验及其 provenance；不说明是否入片 |
| `prepared-assets.json` | command_request | host | Skill/agent、asset import/normalization | 外部素材交接输入；只表示素材已准备，不是 canonical render artifact |

Candidate、selection、acquisition、manifest 和 usage 不能互相替代：

- candidate 表示“找到过什么”；
- explicit selection 表示“允许获取什么”；
- acquisition 表示“实际落地了什么”；
- asset manifest 表示“当前有哪些可验证素材”；
- enrichment plan 表示“最终使用什么、何时、如何使用”。

### Enrichment

`enrichment-plan.json` 是唯一 canonical final asset usage 和 visual/audio execution plan。

简化的 `asset-usage-plan.json` 是当前 platform handoff input，但不能与 canonical plan 形成平行权威路径。目标行为是：

1. 新工作流直接写 `enrichment-plan.json`；
2. 需要简化 handoff 时，使用单独、明确的 `asset-usage-plan.json` command input；
3. `project enrich-plan` 校验并把它一次性物化为 canonical `enrichment-plan.json`；
4. 同时存在 canonical plan 与 `asset-usage-plan.json` 时返回 conflict，不做隐式 merge；
5. render 只消费 current `enrichment-plan.json`；
6. `project.json.asset_usage_plan` 或 `edit-plan.json.asset_usage_plan` 一律 schema invalid，不提供迁移路径。

| Artifact | 角色 | 作者 | 消费者 | 权威边界 |
| --- | --- | --- | --- | --- |
| `asset-usage-plan.json` | command_request | Skill/host | `project enrich-plan` | 当前简化素材交接，不直接进入 render |
| `enrichment-plan.json` | authoritative_input | Skill/agent 或 CLI normalization | preflight、storyboard、render | 唯一最终 enrichment 使用计划，绑定当前 EDL、edit plan、被引用 assets 和 grounding |
| `storyboard.json` | derived | CLI | HyperFrames render、inspect QA | 当前 enrichment inputs 的可执行剧本；只有 lineage current 时才是 render-time source of truth |
| `.hyperframes/*`、`.render/*` | temporary | CLI | renderer/debugging | 执行工作区，不是 project state |

`storyboard.json` 可以继续作为 HyperFrames 执行和 QA checklist 的 source of truth，但它不是独立业务决定。它必须由 current enrichment inputs 物化，并记录相同 input fingerprint。

### Render 与 inspect

新增持久化、machine-readable 的 `render-result.json`：

- render input fingerprint；
- `inputs[]`：本次实际消费的精确 artifact/member keys 与 fingerprints；
- `outputs[]`：SRT、clean MP4 和可选 final MP4 的 key、role、path、SHA-256、duration/media probe facts；
- `canonical_output_key`：必须指向 `outputs[]` 中一个 MP4 member；
- `enrichment_applied`；
- clean intermediate path；
- producer CLI version 和完成时间。

Inspect 只能读取 current `render-result.json` 指定的 canonical output。它不能通过 `final.mp4` 是否存在来选择视频。

- 纯剪辑 render 可以把 `renders/clean.mp4` 标为 canonical output；
- enriched render 把 `renders/final.mp4` 标为 canonical output；
- 旧 `final.mp4` 即使物理残留，只要不属于 current render result，就必须被忽略；
- render 失败时不能提交新的 render result，旧 result 对新输入显示 stale。

Pure cleanup result 的 `inputs[]` 只绑定 EDL、EDL 引用的 source members 和 render config；SRT 与 clean MP4 放在 `outputs[]`。Enriched result 额外绑定 canonical enrichment plan、current storyboard 和被其引用的 asset members，并把 final MP4 加入 `outputs[]`；它不绑定无关 catalog、未选 candidate 或 asset inventory 中未使用的条目。

新增持久化 `inspection.json`：

- 被检查的 render result fingerprint；
- output path/hash/probe facts；
- removed ranges、retained risks；
- enrichment、asset、dependency 和 audio summaries；
- inspection checks 和 frame paths；
- blockers/warnings；
- inspection completion status。

`report.md` 从 `inspection.json` 确定性生成。命令 JSON 返回 inspection 摘要和 artifact path，但瞬时 command result 不是唯一恢复事实。

## Dependency 与失效规则

以下是最小依赖和失效矩阵。实现可以记录更细的直接边，但不能削弱这些下游失效关系。

| 上游变化 | 至少失效的下游 |
| --- | --- |
| `sources.json` 或 source bytes | transcript、analysis、source frames、review、proposal、edit plan、EDL、focus、acquisition requests、enrichment、storyboard、render、inspection |
| `transcript.json` | analysis、review、proposal selection、edit plan、EDL、focus、subtitles、enrichment、storyboard、render、inspection；已按相同 source time 抽出的 source frame bytes 不失效 |
| `analysis.json` | review、proposal、edit plan、EDL、focus、subtitles、enrichment、storyboard、render、inspection |
| `source-frame-request.json` | source frames；如果 proposal 声明使用了视觉理解证据，也使 proposal 及下游 stale |
| 被确认 option 的 proposal selection projection | edit plan、EDL、focus、asset requests、enrichment、storyboard、render、inspection；未选 option 的独立改动不失效下游 |
| `edit-plan.json` | EDL、subtitles、focus、asset requests、enrichment、storyboard、render、inspection |
| `edl.json` | subtitles、focus frames/grounding/review、output-timeline requests、enrichment、storyboard、render、inspection |
| `focus-candidates.json` | focus frames、grounding、review、enrichment、storyboard、render、inspection |
| `focus-frames.json` 或 frame bytes | grounding、focus review、coordinate-bearing enrichment、storyboard、render、inspection |
| `focus-grounding.json` | focus review、coordinate-bearing enrichment、storyboard、render、inspection |
| visual/music request member 或被选 candidate projection | 对应 acquisition/review/asset records；未选 candidate 的变化不失效 acquisition |
| acquisition、被引用 asset record 或 asset bytes | 引用该 asset 的 enrichment preflight、storyboard、render、inspection；无关 inventory member 不失效 render |
| `enrichment-plan.json` | storyboard、render、inspection |
| `storyboard.json` | enriched render、inspection |
| `render-result.json` 或 output bytes | inspection 和 report |

失效是逻辑状态，不要求立即删除物理文件。保留旧文件有助于调试，但任何 CLI 消费者都必须忽略 stale artifact。

## 命令合同

### `koubo-clip --version`

返回安装的 CLI/package version。

### `koubo-clip capabilities --json`

稳定返回：

- CLI version 和 capability contract version；
- 支持的 project commands；
- 支持的 artifact schema versions；
- source frames、focus、grounding、visual/music acquisition、enrichment、HyperFrames、structured inspect 等 feature flags；
- provider mode 语义；
- render/inspect 所需 artifact keys；
- 核心 lifecycle blocker/error code catalog。

它描述软件能力，不探测当前机器。`doctor` 继续负责 FFmpeg、ffprobe、npx、ASR/provider 和 bundled resource 可用性。

### `koubo-clip project status <project> --json`

这是宿主恢复流程的唯一公共入口。它必须只读，并返回：

- project/provider mode；
- manifest/current-contract 状态；
- 每个 artifact 的 role、path、state、fingerprint 和 stale reason；
- 每个 workflow stage 的状态；
- current proposal/edit plan/EDL/enrichment/render/inspection fingerprints；
- 当前 canonical deliverable；
- render 的精确输入集合；
- next valid commands；
- blockers 和可执行 remediation；
- last successful checkpoint。

`render_contract` 还必须区分 `export_ready`、`exported`、`execution_mode` 和 `handoff_ready`。任一 source unbound 时使用 distributed 分支：本地 render/inspect stage 为 `not_applicable`；export 前 next command 是 export，export 后 next commands 是 strict verify/bind/render/inspect，不要求本机 materialization。

宿主不扫描目录，不比较 mtime，不根据 Markdown 或 MP4 文件名猜状态。

### 现有 project commands

每个成功 command result 保留该命令已有的 task-specific data；proposal、render、inspect 等命令可以另外返回当前调用最有用的 fingerprint、路径或摘要。Durable lifecycle 事实只提交到 `artifact-manifest.json`，宿主随后通过 `project status --json` 读取 input fingerprint、output records、stage state、warnings 和 next valid commands，不在每个瞬时 command result 中复制第二份状态合同。

每个失败结果至少包含稳定 code 和可读 message。进入 lifecycle stage 且已知被尝试输入的失败另外包含 stage、artifact、remediation，并在 manifest 的 stage attempt 中记录该次输入；参数路由、项目不存在或输入尚无法识别等前置失败不伪造 attempt。宿主不能依赖 message 文本分支。

## 写入、失败与幂等性

CLI 命令遵循 commit-last：

1. 解析和校验所有输入；
2. 计算 input fingerprint；
3. 确认依赖 current；
4. 在 managed staging path 写输出；
5. 校验真实输出，包括需要的 media probe/hash；
6. 逐个原子替换目标 artifact；
7. 最后提交 manifest 成功记录。

如果第 4–6 步失败：

- 保留必要 partial artifacts 供检查；
- 不把 partial output 标为 current；
- 记录 stage failure；
- 旧成功输出对新输入显示 stale；
- `project status` 返回最后成功 checkpoint 和重试命令。

固定路径的多文件 project 不承诺 OS crash 后恢复被覆盖的旧 bytes，也不把“last successful checkpoint”描述成物理 rollback。它只表示最后一次完整提交到 manifest 的成功阶段和 lineage metadata。若进程在第 6、7 步之间终止，status 必须把未登记或 hash 不匹配的文件标成 pending/invalid，并要求重跑；绝不能把半提交当成功。Manifest 自身使用 atomic temp + rename 写入。

同一输入重复运行同一 deterministic command，应得到相同 output fingerprint，或明确说明哪些非确定 metadata 被排除在 fingerprint 外。

## 非当前项目

CLI 只支持当前 project contract 和每种 artifact 的唯一当前 schema。缺少当前 `project.json` contract、`artifact-manifest.json`，或包含旧 artifact version/embedded usage 字段的项目，`project status` 返回 `CONTRACT_SCHEMA_UNSUPPORTED`，不扫描旧目录恢复 lineage，也不执行运行时 migration。

开发期 fixtures、示例和内部项目一次性改写为当前格式。无法改写的项目使用当前 CLI 重新创建；旧 Markdown、EDL、storyboard、MP4 和 report 可以由用户自行保留，但不进入当前 project 状态。

## 完成定义

一个 staged Koubo Clip project 只有同时满足以下条件才算完成：

- proposal、edit plan 和所有必要确认绑定 current；
- EDL 与 edit plan lineage current；
- 可选 focus、assets 和 enrichment lineage current；
- `render-result.json` current，canonical output 存在、hash 和 probe 匹配；
- `inspection.json` current，并引用同一个 render fingerprint；
- 没有 blocker。

`project inspect` 正常成功时仍物化 `report.md`。如果 current `inspection.json` 存在但 report 被删除，机器完成状态不变；status 的 artifact 列表会把 report 标为 missing，重新运行 `project inspect` 可以重建 human view。

MP4、Markdown、storyboard 或 report 单独存在都不能证明项目完成。

## 实施约束与验收

后续实现应保持 diff 小，并优先复用现有 parsers、`projectArtifacts`、command result、Node.js `crypto` 和现有测试 fixtures。不要先抽出新的 packages 或引入通用 workflow framework。

最小回归测试必须覆盖：

- edit plan 改变后旧 EDL 变 stale，focus 不得复用；
- 被确认 option 的 proposal selection projection 改变后 edit plan 及下游变 stale；未选 option 改变不扩大 stale；
- enrichment 被移除后，旧 `final.mp4` 不得被 inspect 选择；
- 被 render 引用的 asset record/bytes 改变后旧 render 变 stale；未引用 asset/inventory member 改变不扩大 stale；
- 多个 asset usage 权威来源冲突时 fail closed；
- render 失败不提交新的 current render result；
- inspect 拒绝 stale render result；
- Markdown 改变不影响业务状态；
- 非当前 project contract 返回 `CONTRACT_SCHEMA_UNSUPPORTED`，不执行恢复或迁移；
- standalone 和 platform 使用同一 lineage/status 合同；
- `capabilities` 和 `project status` 返回稳定、可测试的 JSON；
- 至少一个真实 MP4 render + inspect 路径验证 output hash、duration 和 inspection binding。
