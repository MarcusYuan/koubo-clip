# README 同步规则

## 目的

本规则确保开源首页在中文和英文之间保持一致，避免用户看到过期安装或使用说明。

## Source of truth

- 默认先维护 `README-CN.md`。
- `README-CN.md` 完成后，必须在同一轮工作中同步更新英文 `README.md`。
- `README.md` 应表达同一产品定位、安装路径、使用流程、项目状态和许可证边界。

## 同步要求

- 不要只在一个 README 中新增安装、发布、skill、CLI、provider、license 或项目状态信息。
- 英文版可以为了自然表达调整措辞，但不能删掉中文 README 中影响用户安装和使用的关键信息。
- 如果中文 README 明确某能力是规划中、发布后使用、需要 API key 或需要 agent 写入 artifact，英文 README 也必须保留这些限制。
- 更新 README 后，至少运行 `git diff --check`。

## 不负责什么

- 不要求逐字翻译。
- 不要求把深层 artifact schema、架构细节或规则文件复制进 README。
