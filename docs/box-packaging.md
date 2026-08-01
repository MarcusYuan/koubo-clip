# Plugin Box 打包

Plugin Box 是 npm 联合包之外的附加交付面。它不改变现有 npm/manual 用户流程，而是把同一版本的 managed CLI 与用户可见 Skill 拆成两个独立构件：

```text
dist/box/
  koubo-clip-box-cli-<version>-macos-aarch64.tgz
  koubo-clip-box-skill-<version>.tgz
  cli-package.box.json
  skill.box.json
```

Box CLI 包只包含 CLI、HyperFrames resources 和受管运行时，不包含用户可见 Skill payload。Box Skill 包以 `SKILL.md` 为包根，直接包含 `agents/`、`references/` 等 Skill 文件；它通过 `skill.box.json` 中 top-level `files` 的逐文件 byte `size`、纯 64 位 hex SHA-256、精确 CLI 版本、裸子命令/命令前缀和 delivery digests 与 CLI 包关联。每个 Skill `files[]` 项严格只含 `path`、`sha256`、`size`，不得使用 CLI artifact 的 `size_bytes` 字段。npm 包仍可联合携带 Skill，`skills install` 仍服务非 Box 用户。

## 当前平台与运行时输入

当前可构建目标只有 `macos/aarch64`，本机 `darwin-arm64` 会映射到该 Box 目标。其他目标由 `KOUBO_BOX_TARGET` 选择时必须 fail closed，直到该平台拥有独立的锁版本、摘要和验收结果。

`box-runtime.lock.json` 是源码侧的可复现输入合同，固定 Bun、受管 FFmpeg 构建合同、HyperFrames 和 Chrome Headless Shell 的版本与摘要。FFmpeg 的逐项 source URL/version/SHA-256、补丁和 build recipe 位于 `third_party/ffmpeg-runtime/macos-aarch64/`；构建结果必须落在 `dist/box-runtime/macos-aarch64/`，并同时生成 binary-to-source evidence 与 corresponding-source tarball。Chrome 输入目录必须通过 `KOUBO_BOX_BROWSER_ROOT` 明确提供；打包脚本先验证完整文件树摘要再复制。安装包内的 `runtime-lock.json` 是另一份安装态合同，列出实际 runtime/resources/evidence 文件的 size、SHA-256 与可执行属性。三者不得混用。

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

FFmpeg/ffprobe 由仓库 build recipe 从锁定的 FFmpeg、x264、FreeType、HarfBuzz 和 build-tool sources 构建。当前配置保留现有 `libx264`/`drawtext` 成功路径，因此启用 GPL 与所需 libraries，但禁止 `--enable-nonfree`。构建产物只允许依赖 macOS 系统动态库；非系统 `@rpath`、Homebrew、临时目录或构建前缀依赖会让门禁失败。

`box-runtime.lock.json.public_distribution_gate` 是公开上传 Box CLI 前的工程事实源。`bun run verify:box-release-gate` 会核对实际 binary flags/features、逐文件摘要、source lock、build recipe、许可证/版权文本、只含系统动态依赖、binary-to-source mapping 和 corresponding-source bundle；tag workflow 使用 `--release` 模式 fail closed。证据完整只表示仓库定义的发布工程门禁通过，不构成法律结论。

许可证 payload 不是“目录非空”检查。`build-evidence.json.license_evidence[]` 是唯一逐文件集合：每项使用规范化相对路径、实际 byte size、纯 hex SHA-256 和 `0644` mode。发布门禁同时要求 source lock 声明、CLI 内 `licenses/ffmpeg-runtime/licenses/` 和 corresponding-source tarball 内 `licenses/` 三方文件集合完全一致，且同路径文件 bytes 一致；额外、缺失、篡改、mode 漂移、重复或路径不规范都会 fail closed。安装态验收还对 CLI/source 两侧执行额外、缺失和篡改 mutation 负测。

## 构建

先构建受管 FFmpeg runtime 和 source bundle，再准备锁定的 Chrome Headless Shell 文件树：

```bash
bun run build:box-ffmpeg-runtime
```

然后运行：

```bash
KOUBO_BOX_BROWSER_ROOT=/absolute/path/to/chrome-headless-shell-mac-arm64 \
  bun scripts/package-box.ts
```

打包脚本从 `package.json` 读取版本号，不在脚本内硬编码 patch 版本。它会拒绝平台不受支持、输入缺失、摘要不匹配、symlink、CLI 包中出现 Skill payload 或任何受管运行时不完整的情况。

本地生成的 `cli-package.box.json` 使用 `bundled://dist/box/...` 标识随包验证的本地 CLI 构件；正式发布构建使用 GitHub Release HTTPS URL。发布系统不得改变 CLI artifact 已声明的 `size_bytes`/SHA-256，也不得改变 Skill `files[]` 已声明的 `size`/SHA-256。

## 验证

```bash
bun scripts/verify-box-package.ts
```

安装态验证从构件解压后的任意 cwd 执行，至少检查：

- CLI/Skill tarball 与两个 Box descriptor 的外层 byte size/纯 hex SHA-256，以及 Skill payload `files[].size`/SHA-256；
- CLI/Skill 包内文件必须与 descriptor 的 top-level `files` 完全一致，不允许 symlink、路径穿越、未列出文件或 digest/executable 漂移；
- Skill payload 以包根 `SKILL.md`、`agents/`、`references/` 布局交付，逐文件 digest、精确 CLI version 和 delivery identity 关联；
- CLI 包不包含用户可见 Skill；
- `--version`、`delivery verify --json` 和 `doctor --json`；
- `test --json` 的本地、无云费用、真实 render-contract verify/bind/render/inspect 闭环；
- 删除或修改受管 runtime 文件后的 fail-closed doctor 分类。

本流程只生成和验证本地构件，不执行 npm publish、远端 push 或 GitHub Release。

正式 `v<version>` Release 还会上传：

- `koubo-clip-ffmpeg-sources-<version>.tar.xz`：FFmpeg 及其链接组件的完整锁定 source archives、已校验的 build-tool distributions、补丁、build recipe、source manifest 和许可证/版权文本；
- `koubo-clip-ffmpeg-build-evidence-<version>.json`：该次二进制的摘要、configure args、source_revision 与门禁断言；
- `koubo-clip-ffmpeg-source-lock-<version>.json` 和 `koubo-clip-ffmpeg-build-recipe-<version>.sh`：可独立核验的源锁和构建入口。

CLI descriptor、Box metadata 和 release-gate report 都绑定这些 exact bytes 的 SHA-256。Release 页面应把 corresponding-source asset 与 Box CLI asset 放在同一 tag 下；不得改写或用其他 commit 重新生成其中任一项。

Box CLI 根目录携带 `THIRD_PARTY_NOTICES.md`，并在 `licenses/ffmpeg-runtime/SOURCE_OFFER.json` 提供版本化机器可读 source offer。该 offer、`cli-package.box.json` 和 `build-evidence.json` 必须同时记录同一 `v<version>` Release 下 corresponding-source asset 的直接 HTTPS URL、size 和 SHA-256；package verification 会拒绝 URL 或 digest 任一不一致。
