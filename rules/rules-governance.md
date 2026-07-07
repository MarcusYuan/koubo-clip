# 规则治理

## 目的

本规则治理 `rules/` 目录：什么时候新增规则、什么时候更新已有规则，以及如何避免重复文档。

## 什么时候新增或更新规则

在以下情况新增或更新规则：

- 某个决策会被多个 contributors 或 agents 重复执行。
- 边界混淆可能破坏产品合同。
- 新的长期实现面需要 ownership、naming、validation 或 forbidden behavior。
- 用户确认了应该在当前对话之外继续生效的约束。

如果主题已经被覆盖，优先更新已有规则。

## 什么时候不要新增规则

不要为以下内容新增规则：

- 一次性任务。
- 临时实验。
- 应该放在 `docs/` 的长篇用户指南。
- implementation 或 tests 已经维护的合同完整副本。
- 尚未被接受为项目 policy 的研究笔记。

## 规则写作要求

- 从规则目的开始。
- 定义该规则负责什么、不负责什么。
- 优先写具体 constraints、validation requirements 和 forbidden behavior。
- 示例保持简洁稳定。
- 文件名使用长期主题，例如 `cli-contract.md`。

## 维护要求

- 新增、重命名或退役规则时，更新 `rules/README.md`。
- 如果 source-of-truth routing 变化，更新 `AGENTS.md`。
- 删除或合并过期规则，不要保留并行版本。
- 如果规则和实现不一致，先判断是实现错误还是规则过期，再编辑任一方。
