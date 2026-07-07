# 内部二进制打包

公开分发主路径是 npm package `koubo-clip`。本文件只记录可选的内部二进制 tarball 打包方式，用于离线、本机或临时分发：

```text
koubo-clip-<platform>-<arch>.tgz
  koubo-clip/
    bin/koubo-clip
    resources/hyperframes/
    skills/koubo-clip/
    INSTALL.md
```

## 打包

```bash
bun run package:internal
```

脚本会用 `bun build --compile` 生成 `bin/koubo-clip`，并复制 HyperFrames sidecar resources 和唯一对外 skill。

## 安装检查

解压后运行：

```bash
./bin/koubo-clip --help
./bin/koubo-clip doctor
./bin/koubo-clip skills path --json
./bin/koubo-clip skills install --target codex
./bin/koubo-clip skills install --target claude
./bin/koubo-clip skills install --target hermes
```

默认安装目录：

- Codex: `~/.agents/skills/koubo-clip`
- Claude Code: `~/.claude/skills/koubo-clip`
- Hermes Agent: `~/.hermes/skills/koubo-clip`

自定义 skills 目录：

```bash
./bin/koubo-clip skills install --target codex --dest /path/to/skills
```

## 边界

- `.env`、API key、MCP 配置不进包。默认读取 `~/.koubo-clip/.env`；当前目录 `.env` 可作为临时覆盖。
- FFmpeg、ffprobe、npx、网络和 provider credentials 是用户机器环境，由 `doctor` 检查。
- `resources/hyperframes` 是 CLI 运行时资源，不是 agent skill。
- `skills/koubo-clip` 是唯一给 agent 加载的 skill。
- 第一版只打当前平台二进制；跨平台构建后续再加。
