# Artifact 作者合同

## 状态

本文定义 `koubo-clip@0.0.10` 的公开作者合同。实现和发布必须以 canonical npm tarball 的安装态验收为完成标准，源码工作区通过不等于正式交付完成。

## 目标

Koubo Clip 的正式发布包必须让不了解仓库源码的 Agent，仅依赖已安装的 CLI 和官方 Skill，就能发现、编写并校验当前版本支持的业务 artifact。

结构合同与业务指导分开：CLI 定义“什么结构合法”，Skill 解释“为什么写、依据什么写、具体内容如何判断”，Agent 根据用户目标和项目证据填写。Gateway、Hermes 或其他宿主只负责安装、调用和传递 artifact，不重新定义 Koubo Clip schema。

## Ownership

每个公开 artifact 必须声明 ownership，至少分为三类：

| Ownership | Writer | 对外能力 |
| --- | --- | --- |
| `agent_authored` | Skill 引导下的 Agent 或用户 | 完整 schema、template、合法 example、validator 和业务 reference |
| `host_authored` | 已授权宿主或外部 capability | 完整 schema、example、摄入/校验命令和安全约束；是否提供 template 由合同决定 |
| `cli_owned` | Koubo Clip CLI | 只读 schema、producer/verify/inspect 命令；不得提供鼓励外部手写的 authoring template |

`production-proposal.json`、`edit-plan.json`、`enrichment-plan.json` 和语义 request/selection artifacts 属于作者合同重点。`edl.json`、`storyboard.json`、`render-contract.json`、result、inspection 和 `artifact-manifest.json` 属于 CLI-owned，不得由 Skill、Agent 或宿主手写或修复。

## 公开发现面

CLI 提供单次可读取的版本化合同入口：

```bash
koubo-clip artifact contract production-proposal --json
```

具体参数可以 additive 演进，但 JSON 结果必须稳定包含：

- artifact ID、文件名、唯一当前 schema version、ownership 和 artifact role；
- schema digest、CLI version、validator command 和 lifecycle prerequisites；
- 完整 machine-readable schema，包括 required、optional、enum、array、additional-property 和跨字段约束；
- 对可作者化 artifact 提供结构完整的 template 和至少一份当前 CLI 可直接验证的 example；
- 对 CLI-owned artifact 明确 `external_writes_allowed:false`，不返回 authoring template；
- 与当前合同有关的 Skill reference 和 capability ID。

`capabilities --json` 只作为合同索引：它公开每种 artifact 的唯一当前 version、ownership、contract availability 和 digest。完整 schema/template/example 由 artifact contract 命令按需返回，避免把全部 schema 塞进每次 capability discovery。Skill、Agent 和用户不能选择或协商 schema version。

## 作者工作流

```text
Skill 读取 version + capabilities/status
  -> 调用 CLI 获取目标 artifact 的当前合同
  -> 读取对应 Skill reference 的业务方法
  -> Agent 根据用户目标和项目证据填充 template
  -> CLI 对完整 artifact 做 fail-closed 聚合校验
  -> 一次通过，或根据结构化 issues 整体修正一次
  -> CLI 登记 fingerprint/lineage 并推进阶段
```

CLI 不替 Agent 选择业务方向、剪辑策略、素材、文案或风险；template 中不得放会被静默采用的业务默认值。Skill 不复制 CLI-owned required 字段、enum、禁止字段或版本差异，也不能让 Agent 通过反复失败来猜 schema。

## 校验结果

Fail-closed 保持不变。未知字段、缺失必填字段、非法 enum、类型错误、跨字段约束和项目上下文绑定错误仍然失败。

对 Agent/Host authored artifact，JSON 错误应在一次 parse/validation 中尽可能返回完整、稳定、有界的 `issues[]`：

```json
{
  "ok": false,
  "error": {
    "code": "ARTIFACT_VALIDATION_FAILED",
    "artifact": "production-proposal.json",
    "schema_version": "2.0",
    "schema_digest": "sha256:...",
    "issues": [
      {
        "path": "/options/0/cleanup",
        "keyword": "required",
        "message": "cleanup is required"
      },
      {
        "path": "/options/0/edit_execution_plan/remove_intent",
        "keyword": "additionalProperties",
        "message": "remove_intent is not allowed"
      }
    ]
  }
}
```

所有作者合同校验使用统一的结构化错误面，不保留只返回首个错误的旧响应别名。项目状态、lineage 或媒体探测等依赖运行态的错误可以在结构校验之后单独返回；CLI 不为通过校验而静默补全业务语义。

## Production Proposal 2.0

`production-proposal.json` 是第一项必须落地的完整作者合同。正式合同必须让 Agent 在写文件前发现：

- 完整顶层结构；
- 2–4 个 option 的数量要求；
- 每个 option 的 cleanup、subtitles、visuals、images、music、SFX、risk/confirmation 字段；
- `business_direction`、`edit_execution_plan` 和 `asset_requirements` 的完整嵌套结构；option `id` 是唯一方向身份，`recommended_option_id` 是唯一推荐权威；
- `source_mode`、`presentation_intent`、music source 和 slot kind 等所有闭集枚举；
- required、optional、允许为空数组和禁止出现字段；
- `asset_requirements` 是 visual/image/music/SFX 槽位的唯一权威，`edit_execution_plan` 不接受重复 slots；
- 一份包含 2–4 个完整 option、可被同版本 `project proposal --json` 直接接受的实例。

官方 Skill 继续负责怎样形成一次完整确认面，但不得再用 `{}` 或“省略字段仍遵循 schema”作为唯一结构说明。

## 单一事实来源与防漂移

运行时 validator、公开 schema、template、example、capabilities 索引和 Skill reference 中的结构性声明必须由同一合同定义生成，或由自动测试证明等价。不得独立维护互不校验的 TypeScript 类型、手写 parser、JSON Schema 和 Skill 示例。

合同注册测试必须拒绝可写合同中的裸 `items:{"type":"object"}`、缺失 example 或无法通过当前 runtime parser 的 example。`source-frame-request` 1.0 必须完整公开 frame 的五个必填字段和唯一可选 `segment_id`，并聚合返回缺失、类型、范围、未知字段和重复 ID 问题。

每个正式发布必须证明：

1. 所有 bundled examples 通过同版本 CLI validator；
2. Skill 声明的 artifact version 与 CLI capabilities/contract 一致；
3. CLI required/enum/禁止字段都能从公开合同发现；
4. Skill 推荐字段不会被 CLI 拒绝；
5. 从 canonical npm tarball 安装到空目录后，仍能读取合同、验证官方 Skill，并只依赖发布包完成真实 authoring smoke；
6. delivery identity 绑定 artifact contract registry/schema digests 和 official Skill digest，使 Hermes 与 LocalAgent 能确认安装的是同一套合同与执行实现。

## 单一当前 Schema

- 每个 CLI release 对每种 artifact 只支持一个当前 schema，不提供 version 选择、协商、旧 parser、legacy normalization 或运行时迁移。
- Artifact 内仍保留 version 字段，用于 fail-closed、schema digest、delivery identity 和跨机器一致性；不匹配当前 version 时直接返回 `CONTRACT_SCHEMA_UNSUPPORTED`。
- `production-proposal.json` 当前唯一版本是 `2.0`；`enrichment-plan.json` 当前唯一版本是 `2.0`；其他 artifact 以当前 capabilities/contract registry 声明为准。
- 旧项目和旧 artifact 不自动恢复或升级。开发阶段的 fixtures、示例和内部项目一次性改写为当前格式；无法改写的项目使用当前 CLI 重新创建。
- 未来确需破坏性修改时，发布新的 schema version，并在同一变更中删除旧版本 runtime 支持；不得长期并存多个版本。
- Contract template/example 只用于作者指导，不是运行时默认值，也不进入 project lineage，除非 Agent 明确写入并通过对应 validator。
