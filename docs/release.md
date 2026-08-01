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

Box CLI 包含仓库自建、受管的 FFmpeg/ffprobe runtime。公开发布门禁的唯一仓库事实源是 `box-runtime.lock.json.public_distribution_gate`，`bun run verify:box-release-gate` 会核对 source lock、build recipe、实际 binary 摘要/configuration/features、动态依赖、许可证/版权材料、binary-to-source mapping 和 corresponding-source bundle。tag release 在发布 npm 或创建 GitHub Release 前运行同一检查的 `--release` 模式；任何证据缺失、摘要漂移、`--enable-nonfree`、非系统动态依赖或 source_revision 不一致都会 fail closed。

当前 build contract 使用锁定的 FFmpeg 6.1.1 与 x264/FreeType/HarfBuzz source，启用 GPL、`libx264`、`libfreetype`、`libharfbuzz`，并明确禁用 nonfree。Release 同时上传 `koubo-clip-ffmpeg-sources-<version>.tar.xz`、版本化 build evidence/source lock/build recipe；CLI 内也携带相同证据与许可证文本。门禁通过只表示这些仓库工程条件得到机器验证，不构成法律结论，且不能用环境变量临时绕过。

`build-evidence.json.license_evidence[]` 必须精确覆盖 source lock 声明的许可证文件，并与 CLI runtime、corresponding-source bundle 的规范化 path/size/SHA-256/mode 集合一致。Release 前 mutation 负测会分别增加、删除和篡改 CLI/source 两侧许可证文件，确认所有漂移都 fail closed。CLI 内的 `SOURCE_OFFER.json`、Box descriptor 和 build evidence 还必须绑定同一 Release source asset 的直接 HTTPS URL、size 与 digest。

Release workflow 使用 `github.sha` 作为 npm 与 Box `source_revision`，并在 macOS 构建阶段直接把 `cli-package.box.json` 的 artifact URL 生成为对应 `v<version>` GitHub Release HTTPS asset URL；descriptor 与 metadata 随后保持同一组已验收 bytes，不在上传前二次改写。

正式发布采用两阶段顺序：workflow 先创建不可见的 draft GitHub Release，优先上传 corresponding-source，再上传其余 npm/Box/evidence assets，并逐个从 GitHub 下载核对 size 与 SHA-256；只有整组远端 bytes 验收通过后才发布并回读核验 npm，最后再次核验 draft assets 并公开 Release。既有同 tag Release 或 asset 只能在名称、元数据和 bytes 全部一致时复用；缺失或摘要漂移一律 fail closed，不覆盖资产。npm registry 与 GitHub Release 是两个独立外部系统，无法提供跨系统原子事务：如果 npm 已成功而最终公开 draft 失败，Release 仍保持 draft，后续只能用同一 tag、同一组已核验 bytes 重试公开，不能重建或替换资产。

0.0.19 Box lane 及后续版本延续同一门禁：只有指向 clean `main` 历史的 `v<package.json version>` tag 可以发布，且 npm/Box delivery manifest、FFmpeg build evidence 的 `source_revision` 必须等于该 workflow 的 `github.sha`。Box CLI、descriptor、source bundle 和 evidence 必须来自同一个 macOS job 的 exact bytes；Skill manifest 还必须以 canonical v1 `{ path, sha256, size }` 文件项通过反序列化、payload size/SHA-256 和根结构反例验收。任一工程证据未闭合时，tag workflow 必须失败，不能发布 Box CLI，也不能继续完成正式 Release。
