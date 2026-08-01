# Plugin Box 打包

Plugin Box 是 npm 联合包之外的附加交付面。它不改变现有 npm/manual 用户流程，而是把同一版本的 managed CLI 与用户可见 Skill 拆成两个独立构件：

```text
dist/box/
  koubo-clip-box-cli-<version>-darwin-arm64.tgz
  koubo-clip-box-skill-<version>.tgz
  cli-package.box.json
  skill.box.json
```

Box CLI 包只包含 CLI、HyperFrames resources 和受管运行时，不包含 `skills/koubo-clip`。Box Skill 包只包含 Skill payload；它通过 `skill.box.json` 中逐文件的 size/SHA-256、精确 CLI 版本、主要命令和 delivery digests 与 CLI 包关联。npm 包仍可联合携带 Skill，`skills install` 仍服务非 Box 用户。

## 当前平台与运行时输入

当前可构建目标只有 `darwin-arm64`。其他目标由 `KOUBO_BOX_TARGET` 选择时必须 fail closed，直到该平台拥有独立的锁版本、摘要和验收结果。

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

FFmpeg/ffprobe 当前由 `ffmpeg-ffprobe-static@6.1.2-rc.1` 提供并在输入合同中锁定二进制摘要。该输入的许可证与目标发布渠道必须在对外分发前单独完成合规审核；本地构件验证不等于公开再分发批准。

## 构建

先准备锁定的 Chrome Headless Shell 文件树，然后运行：

```bash
KOUBO_BOX_BROWSER_ROOT=/absolute/path/to/chrome-headless-shell-mac-arm64 \
  bun run package:box
```

打包脚本会拒绝版本不为目标 patch、平台不受支持、输入缺失、摘要不匹配、symlink、CLI 包中出现 Skill payload或任何受管运行时不完整的情况。

## 验证

```bash
bun run verify:package:box
```

安装态验证从构件解压后的任意 cwd 执行，至少检查：

- CLI/Skill tarball 与两个 Box descriptor 的 size/SHA-256；
- Skill payload 逐文件 digest、精确 CLI version 和 delivery identity 关联；
- CLI 包不包含用户可见 Skill；
- `--version`、`delivery verify --json` 和 `doctor --json`；
- `test --json` 的本地、无云费用、真实 render-contract verify/bind/render/inspect 闭环；
- 删除或修改受管 runtime 文件后的 fail-closed doctor 分类。

本流程只生成和验证本地构件，不执行 npm publish、远端 push 或 GitHub Release。
