# Artifact 合同规则

## 目的

本规则定义公开 artifact 的 ownership、作者合同发现、校验诊断和防漂移要求。CLI 是结构合同的唯一权威；Skill 是业务作者指导，不复制 CLI schema。

## Ownership

- 每个公开 artifact 必须声明 `agent_authored`、`host_authored` 或 `cli_owned` ownership，以及唯一当前 schema version、role、writer、validator/producer 和 lifecycle prerequisites。
- `agent_authored` artifact 必须公开完整 schema、template、合法 example 和 validator。
- `host_authored` artifact 必须公开完整 schema、合法 example、摄入/校验命令和安全约束；需要宿主填写复杂结构时也必须提供 template。
- `cli_owned` artifact 只公开只读 schema 和 producer/verify/inspect 能力，必须声明 `external_writes_allowed:false`；Skill、Agent、宿主和用户不得手写、修改或修复。

## CLI 公开合同

- CLI 必须提供单次、稳定、`--json` 的 artifact contract discovery，按 artifact ID 返回唯一当前 schema 的 ownership、role、schema digest、完整 schema、validator/producer、prerequisites，以及适用的 template/example；不接受 version 选择参数。
- `capabilities --json` 必须索引每种 artifact 的唯一当前 version、ownership、contract availability 和 digest，但不必内联全部 schema。
- Schema 必须覆盖 required、optional、enum、array limits、unknown/additional properties、格式约束和可静态表达的跨字段约束。
- Template 必须结构闭合，不得用 `{}`、`...` 或“省略字段遵循 schema”代替必填嵌套对象；template 不得携带会被 CLI 静默采用的业务默认决策。
- Example 必须完整、无 placeholder violation，并通过同版本正式 CLI validator。
- 可写 schema 的所有嵌套 object/array item 必须定义实际字段与 unknown-field policy；禁止用裸 `type:object` 隐藏 runtime parser 要求。注册表测试必须验证每个可写 example 通过对应当前 parser。

## Skill 与 Agent

- Skill 在编写 Agent/Host authored artifact 前，先读取 CLI version、capabilities/status 和目标 artifact contract，再读取对应业务 reference。
- Skill 负责字段语义、证据使用、业务判断和用户确认方法；Agent 负责填写具体内容。
- Skill 不复制 required 字段、enum、禁止字段、schema version 差异或 validator constants；必要结构通过 CLI contract discovery 获得。
- Skill 不得指导 Agent 通过连续失败反向推测 schema，也不得为通过校验删除有业务意义的内容而不重新审查。

## 校验

- CLI 保持 fail-closed：缺失、类型错误、非法 enum、unknown field、跨字段约束和上下文绑定错误不得被接受或静默补全。
- 对 Agent/Host authored artifact，一次 JSON 校验应尽可能返回完整且有界的 `issues[]`。每项至少包含 JSON path、稳定 keyword/code 和 message；顶层同时返回 artifact、schema version 和 schema digest。
- 所有作者合同校验使用同一结构化错误面，不保留只返回第一个错误的旧响应别名。
- `source-frame-request` 结构错误使用 `ARTIFACT_VALIDATION_FAILED` 聚合返回；只在 JSON 无法读取等尚未形成 artifact value 的情况下使用 request IO 类错误。
- 聚合结构错误后，项目状态、lineage、candidate/source binding 等运行态错误可以分阶段返回；CLI 不替 Agent 做业务方向、剪辑、素材或文案选择。

## 单一事实来源

- Runtime validator、公开 schema、template、example、capabilities 和 Skill 的结构性声明必须来自同一合同定义，或有自动等价测试；禁止维护未互相校验的平行 schema。
- Artifact schema version 变化必须同步 contract digest、capabilities、Skill reference、examples、tests 和 delivery identity，并删除旧版本 runtime 支持。
- 相同 schema version 下不得悄悄改变 required、enum、unknown-field policy、fingerprint projection 或业务语义。

## 发布门禁

- Canonical npm tarball 中必须包含 CLI artifact contract discovery、完整 examples 和匹配的官方 Skill。
- 安装态验收必须在不读取仓库源码或 tests 的情况下，使用发布包合同生成并验证至少一个真实 Agent-authored artifact。
- `production-proposal.json` 2.0 是首个强制场景：生成 2–4 个完整 options，首次 `project proposal --json` 通过，或最多依据一次聚合 issues 整体修正后通过；随后 option selection fingerprint 必须可绑定 edit plan 并继续 compile EDL。
- Delivery identity 必须绑定 artifact contract registry/schema digests 和 official Skill digest，防止 CLI、Skill、template/example 与 validator 分属不同版本。

## 单一 Schema 政策

- 每个 CLI release 对每种 artifact 只接受一个当前 schema；Skill、Agent、Host 和用户不得选择或协商 version。
- Artifact 仍保留 version 字段用于 fail-closed 和交付身份；与当前 registry 不一致时返回 `CONTRACT_SCHEMA_UNSUPPORTED`。
- 不保留旧 parser、legacy normalization、运行时 migration、兼容 union 或多版本测试矩阵。
- 开发阶段的 fixtures、示例和内部项目直接迁移到当前格式；旧外部项目不自动恢复，使用当前 CLI 重新创建。
- 当前 `production-proposal.json` 和 `enrichment-plan.json` 都只接受 `2.0`。

## 禁止行为

- 不让 Gateway、Hermes 或其他宿主重新定义、复制或放宽 Koubo Clip artifact schema。
- 不通过接受 unknown fields、静默补默认业务值或自动改写 Agent 内容来掩盖作者合同缺失。
- 不把 CLI-owned artifacts 变成可填写模板。
- 不把仓库源码、TypeScript 类型或测试 fixture 当作安装用户必需的合同发现面。
