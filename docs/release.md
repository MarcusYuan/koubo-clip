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
- 可构建平台 CLI smoke artifacts。
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
- 上传 Windows、Linux、macOS CLI artifacts。
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
- 上传 Windows、Linux、macOS CLI artifacts。
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
