# Plugin Box 打包

Plugin Box 是 npm 联合包之外的附加交付面。它不改变现有 npm/manual 用户流程，而是把同一版本的 managed CLI 与用户可见 Skill 拆成两个独立构件：

```text
dist/box/
  koubo-clip-box-cli-<version>-macos-aarch64.tgz
  koubo-clip-box-skill-<version>.tgz
  cli-package.box.json
  skill.box.json
```

Box CLI 包只包含 CLI、HyperFrames resources 和受管运行时，不包含用户可见 Skill payload。Box Skill 包以 `SKILL.md` 为包根，直接包含 `agents/`、`references/` 等 Skill 文件；它通过 `skill.box.json` 中 top-level `files` 的逐文件 `size_bytes`、纯 64 位 hex SHA-256、精确 CLI 版本、主要命令和 delivery digests 与 CLI 包关联。npm 包仍可联合携带 Skill，`skills install` 仍服务非 Box 用户。

## 当前平台与运行时输入

当前可构建目标只有 `macos/aarch64`，本机 `darwin-arm64` 会映射到该 Box 目标。其他目标由 `KOUBO_BOX_TARGET` 选择时必须 fail closed，直到该平台拥有独立的锁版本、摘要和验收结果。

`box-runtime.lock.json` 是源码侧的可复现输入合同，固定 Bun、FFmpeg、ffprobe、HyperFrames 和 Chrome Headless Shell 的版本与摘要。Chrome 输入目录必须通过 `KOUBO_BOX_BROWSER_ROOT` 明确提供；打包脚本先验证完整文件树摘要再复制。安装包内的 `runtime-lock.json` 是另一份安装态合同，列出实际 runtime/resources 文件的 size、SHA-256 与可执行属性。两者不得混用。

Box CLI 的稳定入口只从包自身定位：

```text
bin/koubo-clip
runtime/bin/{bun,ffmpeg,ffprobe,hyperframes,chrome-headless-shell}
runtime/hyperframes.js
runtime/browser/...
resources/hyperframes/...
delivery-manifest.json
runtime-lock.json
```

`runtime/bin/chrome-headless-shell` is a package-owned launcher for the pinned browser tree. It disables host audio output during deterministic headless validation, so a machine without an audio device does not turn a muted visual-only composition into a false runtime failure.

运行时不依赖用户安装 Bun、Node、npx、HyperFrames、FFmpeg/ffprobe，也不从当前工作目录或 PATH 选择替代版本。缺文件属于 `needs_configuration`；已存在但摘要、布局或可执行属性损坏属于 `degraded`。render/test 不允许联网临时下载 renderer。

FFmpeg/ffprobe 当前由 `ffmpeg-ffprobe-static@6.1.2-rc.1` 提供并在输入合同中锁定二进制摘要。`box-runtime.lock.json.public_distribution_gate` 是公开发布门禁的唯一事实源；`bun run verify:box-release-gate` 校验本地证据，tag workflow 使用 `--release` 模式 fail closed。当前输入缺少 exact corresponding source/build recipe/binary-to-source mapping，且锁定二进制报告 `--enable-nonfree`，因此状态保持 `blocked`。本地构件验证不等于公开再分发批准，这项工程门禁也不构成法律结论。

## 构建

先准备锁定的 Chrome Headless Shell 文件树，然后运行：

```bash
KOUBO_BOX_BROWSER_ROOT=/absolute/path/to/chrome-headless-shell-mac-arm64 \
  bun scripts/package-box.ts
```

打包脚本从 `package.json` 读取版本号，不在脚本内硬编码 patch 版本。它会拒绝平台不受支持、输入缺失、摘要不匹配、symlink、CLI 包中出现 Skill payload 或任何受管运行时不完整的情况。

本地生成的 `cli-package.box.json` 和 `skill.box.json` 使用 `bundled://dist/box/...` 标识随包验证的本地构件，同时保留可替换为 GitHub Release 的 HTTPS `release_url`。发布系统可以在上传后替换下载 URL，但不得改变已声明的 `size_bytes` 或 SHA-256。

## 验证

```bash
bun scripts/verify-box-package.ts
```

安装态验证从构件解压后的任意 cwd 执行，至少检查：

- CLI/Skill tarball 与两个 Box descriptor 的 `size_bytes`/纯 hex SHA-256；
- CLI/Skill 包内文件必须与 descriptor 的 top-level `files` 完全一致，不允许 symlink、路径穿越、未列出文件或 digest/executable 漂移；
- Skill payload 以包根 `SKILL.md`、`agents/`、`references/` 布局交付，逐文件 digest、精确 CLI version 和 delivery identity 关联；
- CLI 包不包含用户可见 Skill；
- `--version`、`delivery verify --json` 和 `doctor --json`；
- `test --json` 的本地、无云费用、真实 render-contract verify/bind/render/inspect 闭环；
- 删除或修改受管 runtime 文件后的 fail-closed doctor 分类。

本流程只生成和验证本地构件，不执行 npm publish、远端 push 或 GitHub Release。
