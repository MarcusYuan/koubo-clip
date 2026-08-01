# 发布流程

本项目使用最小分支模型：

```text
main
  -> Pull Request checks
  -> tag vX.Y.Z-beta.N for test releases
  -> tag vX.Y.Z for stable releases
```

`main` 是唯一长期分支。贡献者从 `main` 拉临时分支，开发完成后提 Pull Request 回 `main`。PR 和普通 push 只做验证，不发布。

## PR 和普通 push

触发：

- Pull Request。
- push 到普通分支。
- push 到 `main`。

行为：

- 运行 typecheck 和 tests。
- 运行 npm dry-run。
- 构建并安装态验证 canonical npm package。
- 在 `macos-aarch64` Box target lane 上构建并安装态验证 Box CLI 与 Box Skill package。
- 不发布 npm。
- 不创建正式 GitHub Release。

## 测试版发布

测试版由 prerelease tag 触发。tag 去掉 `v` 后必须等于 `package.json` 里的 `version`：

```bash
# package.json: "version": "0.0.2-beta.1"
git tag v0.0.2-beta.1
git push origin v0.0.2-beta.1
```

行为：

- 校验 tag 去掉 `v` 后等于 `package.json` version。
- 运行 typecheck、tests、npm dry-run 和平台 CLI smoke check。
- 创建 GitHub prerelease。
- 上传 canonical npm package、npm metadata/acceptance、Box CLI、Box Skill、Box descriptors、Box metadata 和 Box acceptance artifacts。
- 发布 npm 包，但使用 prerelease dist-tag。

dist-tag 规则：

- `v0.0.2-beta.1` -> `npm install -g koubo-clip@beta`
- `v0.0.2-rc.1` -> `npm install -g koubo-clip@rc`

## 正式发布

正式版由 stable tag 触发。tag 去掉 `v` 后必须等于 `package.json` 里的 `version`：

```bash
git tag v0.0.1
git push origin v0.0.1
```

行为：

- 校验 tag 去掉 `v` 后等于 `package.json` version。
- 运行 typecheck、tests、npm dry-run 和平台 CLI smoke check。
- 创建 GitHub Release。
- 上传 canonical npm package、npm metadata/acceptance、Box CLI、Box Skill、Box descriptors、Box metadata 和 Box acceptance artifacts。
- 发布 npm 包到 `latest`。

用户安装正式版：

```bash
npm install -g koubo-clip
```

## 认证

本地手动发布前先确认 npm 登录：

```bash
npm whoami --registry=https://registry.npmjs.org/
```

自动发布有两种认证方式：

- 首次发布：创建一个 granular access token，开启 write 权限和 Bypass 2FA，保存为 GitHub 仓库 secret `NPM_TOKEN`，然后推 tag 发布。
- 长期发布：包存在后，在 npm 包设置里配置 Trusted Publisher，指向 `MarcusYuan/koubo-clip` 的 `release.yml`，然后删除 `NPM_TOKEN`。

不要把长期 npm token、provider key、`.env` 或 GitHub token 写入仓库或发布包。

## Box 发布门禁

Box CLI 当前包含受管 FFmpeg/ffprobe runtime。公开发布门禁的唯一仓库事实源是 `box-runtime.lock.json.public_distribution_gate`，`bun run verify:box-release-gate` 会核对锁定二进制摘要、实际 build configuration、blocked/approved 状态和证据要求。tag release 在发布 npm 或创建 GitHub Release 前运行同一检查的 `--release` 模式；门禁未批准或二进制仍包含禁止公开发布的 build flag 时，workflow fail closed。

当前 `ffmpeg-ffprobe-static@6.1.2-rc.1` 输入缺少 exact corresponding source/build recipe/binary-to-source mapping，且锁定的 macOS aarch64 二进制报告 `--enable-nonfree`，所以 `public_distribution_gate.status` 保持 `blocked`。这是一项可审计的工程发布门禁，不构成法律结论。PR/main 的本地 Box 构建和验收仍可运行；tag release 不会发布 npm，也不会上传公开 Box CLI artifact。后续只能通过提交并审查新的锁定运行时及其完整证据来关闭门禁，不能用仓库变量临时绕过。

Release workflow 使用 `github.sha` 作为 npm 与 Box `source_revision`，并在 macOS 构建阶段直接把 `cli-package.box.json` 的 artifact URL 生成为对应 `v<version>` GitHub Release HTTPS asset URL；descriptor 与 metadata 随后保持同一组已验收 bytes，不在上传前二次改写。

0.0.18 Box lane 及后续版本延续同一门禁：只有指向 clean `main` 历史的 `v<package.json version>` tag 可以发布，且 npm/Box delivery manifest 的 `source_revision` 必须等于该 workflow 的 `github.sha`。FFmpeg/ffprobe 公开再分发证据未审批时，tag workflow 必须失败，不能发布 Box CLI，也不能继续完成正式 Release。
