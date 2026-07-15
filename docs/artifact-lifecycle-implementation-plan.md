# Artifact 生命周期实施计划

## 状态

本文档把 `docs/artifact-lifecycle.md` 的目标合同转换为可执行、可验证的交付计划。目标合同先于代码；本轮仓库级实现已于 2026-07-15 完成。这里的“完成”表示源码、测试和本地打包验收通过，不等同于 npm 发布。

最终验收证据：`git diff --check`、TypeScript typecheck、178 个 CLI/媒体/lifecycle 测试、npm pack dry-run、internal compiled package，以及编译后二进制的 version/capabilities/create/status smoke 均通过。真实媒体测试覆盖 MP4 render/inspect、output hash/probe、canonical output、inspection binding、source/focus frame transaction rollback 和 runtime symlink fail-closed。仓库没有 lint script，因此没有虚构 lint 结果。

## 完整目标

在保留 standalone、platform、source frames、semantic focus、visual/music acquisition、HyperFrames、render 和 inspect 全部能力的前提下，完成 Koubo Clip artifact 生命周期修复，使 Skill、CLI、artifact、失败恢复和宿主接入共享同一套可验证合同：

- 文件存在不再等同于成功或 current；
- 每个受管理 artifact 有 role、semantic/bytes fingerprint 和直接 input lineage；
- agent/host 写入的权威输入能经过明确 CLI validator 从 `pending_validation` 进入 `current`；
- 上游改变后，下游稳定地变为 `stale`，损坏或篡改才是 `invalid`；
- EDL 不按存在性复用，stale EDL 由 deterministic compiler 自动重建；
- `enrichment-plan.json` 是唯一 render-time 素材使用计划；
- render 以 `render-result.json` 指定 canonical output，inspect 不猜 `final.mp4`；
- inspect 写 `inspection.json`，`report.md` 只是派生视图；
- 宿主通过稳定 `capabilities` 和只读 `project status` 恢复流程，不扫描目录；
- legacy project 有明确、非破坏的迁移和重建路径。

## 完成标准

只有以下条件全部满足，本目标才算完成：

1. `docs/artifact-lifecycle.md` 中的状态、权威边界和失效规则均有实现或明确测试；
2. `--version`、`capabilities --json`、`project status --json` 的公开 JSON 合同稳定；
3. proposal selection、edit plan、EDL、enrichment、render result 和 inspection 能形成完整 lineage；
4. 多个 `asset_usage_plan` 来源不再在 render runtime 隐式合并；
5. stale EDL、旧 final、旧 storyboard、被改 asset/output 和失败 render 都不能被误判为成功；
6. standalone/platform 使用同一 artifact/status contract；
7. Skill、rules、README 和代码没有相互冲突的恢复或完成判断；
8. typecheck、全量测试、package dry-run 和至少一条真实 MP4 render + inspect 验收通过。

## 已冻结决策

实施时不再重新发明以下边界：

- Artifact 状态是 `missing|pending_validation|current|stale|invalid`；workflow stage 状态是 `not_started|ready|blocked|complete|stale|failed|not_applicable`。
- Manifest 分为成功 artifact records 和 stage attempts；失败 attempt 不创建假的 output record。
- 外部作者和 CLI validator/producer 分开记录。
- JSON 使用 parser-owned semantic projection；媒体成员使用 bytes SHA-256；mtime/size 只做 hash cache hint。
- Proposal 只有一次用户确认。`edit-plan.json` 固定使用 `confirmed_option_id` 和 `proposal_selection_fingerprint`，只绑定被选 option 的语义投影。
- EDL consumer 自动调用同一个内部 `project.compile-edl` 阶段；输入完整时重建，输入不完整时 blocker。
- 新简化交接只写 `asset-usage-plan.json`；`project enrich-plan` 一次性归一化；render 只读 canonical `enrichment-plan.json`。
- Render result 只绑定实际消费的 artifact/member keys，不因未选 candidate 或未引用 asset 改变而 stale。
- 固定项目路径不承诺 crash 后物理 rollback；last successful checkpoint 是最后一次 manifest-committed metadata，不是旧 bytes 备份。
- 不引入数据库、远程状态服务、新 package、通用 workflow framework 或平台专属状态机。

## 修改面

| 文件 | 计划职责 |
| --- | --- |
| `packages/cli/src/artifact-lifecycle.ts` | stable serialization、semantic/bytes hash、atomic manifest IO 和通用 dependency state evaluation |
| `packages/cli/src/project-lineage.ts` | project artifact record、semantic projection、stage success/failure commit 和动态成员替换 |
| `packages/cli/src/project-status.ts` | 只读 registry、artifact/stage 状态、legacy recovery、canonical deliverable 和 checkpoint |
| `packages/cli/src/project-paths.ts` | project-local input/output 的 lexical + realpath containment，拒绝 symlink 逃逸 |
| `packages/cli/src/artifacts.ts` | 新 artifact/result/status 类型、公共文件名、proposal/edit binding，以及所有受管 JSON 的真实 parser |
| `packages/cli/src/cli.ts` | `--version`、`capabilities`、`project status` 路由；只读命令不加载 provider secrets |
| `packages/cli/src/bundle-paths.ts` | 暴露构建时注入或随包携带的 CLI version，兼容源码、npm 和 internal compiled binary |
| `packages/cli/src/project.ts` | validator 接入、EDL compile、usage normalization、render commit-last、render result、structured inspect |
| `packages/cli/src/music/acquire.ts` | acquisition/asset bytes lineage 与 atomic manifest handoff |
| `packages/cli/src/visual/acquire.ts` | selected candidate、asset bytes、acquisition/manifest lineage；保留当前 selection/path hardening |
| `packages/cli/src/globals.d.ts` | 仅补充实际使用的 Node API 类型 |
| `skills/koubo-clip/**`、`rules/**`、README | 恢复、权威输入、canonical enrichment 和完成判断同步 |

不整体替换当前 dirty 文件。现有 visual `selection_reason`、preview/local path、realpath/symlink 防逃逸和“只获取明确选中候选”改动与本目标正交，应保留。

## 阶段计划

### Phase 0：先锁错误行为

先写失败回归，再修改实现。

工作：

- 新建 `packages/cli/src/artifact-lifecycle.test.ts`，覆盖 semantic/bytes fingerprint、manifest、attempt、状态分类、依赖传播、Markdown 无关性和 legacy recovery；
- 在 `project.test.ts` 先加入 stale EDL、旧 final、旧 storyboard、usage authority conflict 和 render failure 不提交 result 的回归；
- 固定 EDL 行为为“输入完整则自动重建”，不允许测试接受“重建或 blocker”两种结果；
- 复用现有运行时生成的 160×90 H.264/AAC fixture，不新增二进制媒体文件。

退出条件：新增测试能准确暴露当前按存在性复用、猜 final 和 runtime merge 的问题；既有无关测试仍通过。

### Phase 1：Schema 与 lifecycle 底座

工作：

- 增加 `artifact-manifest.json`、`asset-usage-plan.json`、`render-result.json`、`inspection.json` 类型和 parser；
- 把当前仍靠类型断言读取的 music acquisition/review、storyboard、inspection 等受管 JSON 补成真实 parser；registry 不接受“只验证存在”的 JSON；
- 给 `project.json` 增加明确 `contract_version`，并定义无该字段旧项目的 legacy 默认；
- 增加 artifact roles、states、stage attempts、dynamic member keys 和 status result 类型；
- 实现 canonical JSON serialization、semantic projection、bytes hash、组合 input fingerprint；
- 实现 atomic JSON/text write 和 manifest commit；
- 实现 current/pending/stale/invalid 的递归计算、cycle guard 和 stable reasons/codes；
- artifact registry 只列当前真实 artifacts 和直接依赖；包括 `proposal-selection:<option_id>`、request member、candidate member、source/frame/asset member，不提前抽新 package。

退出条件：纯文件测试证明相同语义 JSON 的 key 顺序/空白不改变 fingerprint，媒体改一 byte 会改变 fingerprint；manifest/parser 对 unsafe path、错误 hash、重复 key/path 和缺依赖 fail closed。

### Phase 2：Version、capabilities、只读 status 与 create 初始化

工作：

- `koubo-clip --version` 返回同一个 package version；源码运行、npm 安装和 internal compiled binary 都必须可用，不能假设 binary 旁存在 root `package.json`；
- `capabilities --json` 返回 software contract，不探测机器、不加载 `.env`；
- `project status <project> --json` 只读计算 artifact/stage 状态、blockers、next commands、canonical deliverable 和 checkpoint；
- status 使用独立只读 metadata reader，不能调用会补写 `project.json` 的 mode resolver；
- `project create` 在 source copy、probe 和 hash 成功后提交 project/sources/source member records。

退出条件：CLI 路由测试通过；相同内容的 standalone/platform project 除 mode/path/time 外拥有同构 status；legacy project 返回最早可执行恢复命令且不把旧 derived/result 标 current。

### Phase 3：Proposal/Edit 权威绑定与 canonical enrichment

工作：

- 扩展 proposal schema，使 `options[]` 真正消费 business direction、edit execution plan 和 asset requirements，而不是静默丢字段；
- `project proposal` 返回并登记 `proposal_fingerprint` 与按 option id 索引的 `option_selection_fingerprints` map；
- edit plan parser 固定 `confirmed_option_id` 和 `proposal_selection_fingerprint`；
- EDL compile 校验 selection binding，修改未选 option 不让 EDL stale；
- 把 `AssetUsagePlanArtifact` 及现有 path/format/SVG 安全校验复用于独立 `asset-usage-plan.json`；
- 建立统一 confirmed-project test fixture，并迁移 render/focus/多源/usage tests，避免测试继续绕过 proposal binding；
- `project enrich-plan` 检测 canonical、独立 handoff 和 legacy project/edit 字段冲突；只允许唯一来源一次性写 `enrichment-plan.json` 和必要 asset entries；
- normalization 只能引用已经校验并登记的 asset member；platform handoff import 必须先 atomic 登记 bytes/member record，再提交 canonical plan；
- 删除 render/inspect 的 `assetUsagePlans`、`mergeAssetUsagePlans` 和 `mergeEnrichmentPlans` runtime authority merge。

退出条件：单一 handoff 可归一化；多个 legacy source、canonical + handoff 均返回稳定 `ASSET_USAGE_PLAN_CONFLICT` 且不改 canonical plan；render input 只出现 canonical enrichment。

### Phase 4：EDL 与各阶段 lineage

工作：

- 用 current-aware compiler 替换 `readOrBuildEdl` 的存在性判断；
- sources、transcript、analysis、review、proposal、source frames、focus、visual/music acquisition/review、asset manifest 和 enrichment 接入 validator/attempt/output records；
- 所有受管 public JSON writer 改为 temp write、parse/probe/hash、atomic rename、最后 manifest success；`sourceFramesProject` 不能在新 evidence 成功前删除旧 evidence；
- source frames 只绑定 source bytes、request 和 extractor contract，不因 transcript 文案更新重抽；
- focus frames 绑定 EDL、candidate 和实际 source member bytes；
- acquisition 绑定被选 candidate projection；render-related lineage 只绑定被引用 asset member；
- human-view 写入/删除不改变机器 stage 状态。
- 保留各命令 task-specific `CommandResult`；durable input/output/stage/next-command 事实只写 manifest，并由 status 统一返回，避免瞬时结果复制第二套状态合同。失败保留稳定 code，并在 inputs 已知时提交当前 input 对应 attempt。

Catalog 和 human-view 只登记为 non-blocking derived/view 状态；它们可展示最后记录和 warning，但不进入 render completion 的阻塞依赖闭包，也不要求 status 加载 provider 环境。退出条件：dependency closure 单测通过；edit plan 改变后 focus consumer 自动重编 EDL，绝不消费旧 fingerprint；无关 candidate/asset/Markdown 变化不扩大 stale 范围。

### Phase 5：Render commit-last 与 `render-result.json`

工作：

1. 在公共输出写入前校验全部 current inputs；
2. 在 managed staging path 生成 EDL、SRT、clean、storyboard 和可选 final；
3. 对真实媒体执行 probe/hash；
4. 逐个 atomic replace 公共 artifact；
5. 写 `render-result.json`，明确 canonical output、精确 inputs、hash、duration、probe、enrichment flag 和 CLI version；
6. 最后提交 manifest success；失败只提交当前 input fingerprint 对应的 stage attempt。

`renderEnrichedVideo` 必须接收 staging target；HyperFrames lint/validate/render 成功前不能覆盖 root `storyboard.json`。

退出条件：纯 cleanup 指向 `renders/clean.mp4`；enriched 指向 `renders/final.mp4`；新输入 render 失败时不产生新 current result，旧 result 对新输入是 stale，partial files 不被认作成功。

### Phase 6：Inspect 只绑定 current render

工作：

- inspect 只读取 current `render-result.json` 的 canonical output；
- 重新验证 output bytes hash 和 probe；
- enrichment/audio/asset/storyboard summaries 来自 render result 已登记 inputs，不根据当前目录猜历史 render；
- inspection frames 按 render fingerprint 隔离；
- 写 `inspection.json` 并绑定 render result fingerprint；
- `report.md` 完全从 inspection artifact 生成。

退出条件：物理残留 `renders/final.mp4` 不影响 clean result inspection；stale/invalid render result 被稳定 blocker 拒绝；旧 storyboard 不进入新 inspection。

### Phase 7：Skill、rules、README 与发布验证

工作：

- Skill resume 先运行 `capabilities`/`project status`，不扫描 project directory；
- 删除“在 project/edit plan 内写 usage plan 并由 render 直接合并”的新工作流描述；
- 同步 proposal 单次确认、pending validation、EDL 自动重编、canonical enrichment、render/inspection 完成条件；
- 更新 `rules/cli-contract.md`、`rules/media-artifacts.md`、`rules/skills-agent-workflow.md`、skill tests 和 `docs/README.md`；先更新中文事实源 `README-CN.md`，再同步 `README.md`；
- 检查 npm package 包含新模块、docs 和 bundled skill，不包含测试/secret。
- 检查 internal package 的 compiled binary `--version`/`capabilities` smoke；版本不能依赖未打包的 root `package.json`。

退出条件：文档、rules、Skill、CLI help/capabilities 和 parser 字段一致；pack dry-run 可见所有必要 runtime files。

## 最小回归矩阵

| 场景 | 证明 |
| --- | --- |
| JSON 只改空白/key order | semantic fingerprint 不变 |
| edit plan 改变 | 旧 EDL/focus stale，consumer 自动重编 |
| 未选 proposal option 改文案 | selected projection 和下游不变 |
| 被选 proposal option 改变 | edit plan 及下游 stale/pending blocker |
| source-frame request 不变、transcript 文案改变 | 已抽 source frame bytes 仍 current；proposal 可因 transcript 改变而 stale |
| asset bytes 改变 | 仅引用该 asset 的 storyboard/render/inspection stale |
| 未引用 asset/candidate 改变 | render 不 stale |
| 修改 representative Markdown | 机器状态不变 |
| 单一 legacy usage source | enrich-plan 成功归一化 |
| 多 usage sources 或 canonical + handoff | fail closed，不改 canonical |
| render 失败 | 不提交新 current render result；stage attempt failed |
| 残留 final MP4 | inspect 仍使用 render result 指定的 clean |
| output bytes 被改 | render output invalid，inspection stale |
| legacy project | `legacy_untracked` + 可执行恢复路径 |
| standalone/platform | 共用 artifact/stage keys 和 lineage 算法 |

## 验证顺序

每阶段先跑新增 targeted tests；最终依次运行：

```bash
git diff --check
bun run typecheck
bun run test
npm pack --dry-run
bun run package:internal
bun test packages/cli/src/project.test.ts -t "renders and inspects an edit plan"
```

仓库当前没有 `lint` script，因此不虚构 `bun run lint` 证据。若本次不新增 lint 配置，最终报告明确写“not configured”。真实媒体验收必须校验 output SHA-256、ffprobe duration、canonical path 和 `inspection.json -> render-result.json` fingerprint binding，不能只检查 JSON 外形。

## 风险与回退边界

- 当前 worktree 有未提交的 visual selection 和 business planning 改动；只做符号级合并，不整体回退或覆盖文件。
- Manifest/status 是新 public contract；实现期间先保持 version `1.0`，字段新增允许向后兼容，改变语义必须升级 contract version。
- Legacy normalization 是一次性兼容，不在 render runtime 永久保留多入口。
- 不删除旧物理 artifacts；状态层先让它们失去权威，便于失败检查和用户恢复。
- 若真实媒体阶段失败，保留 staging/partial 供诊断，但 final report 只能基于 current inspection。

## 停止条件

在“代码已实现、目标测试全部通过、真实 MP4 路径完成、Skill/rules/docs 同步、剩余风险已明确”之前持续执行。只完成文档、只生成 manifest、只修 stale final 或只让测试通过，都不算完成。
