# 发布和打包规则

## 目的

本规则定义 koubo-clip 什么时候只测试、什么时候只打包验证、什么时候可以正式发布。

## 版本规则

- 首个公开版本从 `0.0.1` 开始。
- 不发布 `0.0.0`。
- 测试版使用 semver prerelease，例如 `0.0.1-beta.1`、`0.0.1-rc.1`。
- 发布 tag 必须是 `v<package.json version>`，例如 `v0.0.1-beta.1` 或 `v0.0.1`。
- 改版本号时，必须同步 `package.json`、`README-CN.md` 和 `README.md` 中的项目状态。

## 分支规则

- `main` 是唯一长期分支。
- 其他开发分支都是临时分支，命名不强制，完成后通过 Pull Request 合并回 `main`。
- 不维护 `develop`、`staging` 或长期 `release/*` 分支，除非以后需要同时维护多个已发布版本线。
- 只有 `main` 上的版本 tag 可以触发发布。

## 日常测试触发

以下情况只运行测试和静态校验，可以构建 smoke artifact，但不发布 npm，不创建 GitHub Release：

- Pull request。
- push 到普通分支。
- push 到 `main`。
- docs、rules、README、skills 或 TypeScript 变更后的本地验证。

最小校验按 `rules/testing-validation.md` 执行。影响 package 元数据、bin 入口、README、LICENSE、skills 或发布白名单时，还要运行：

```bash
npm publish --dry-run --registry=https://registry.npmjs.org/
```

## 打包验证触发

以下情况可以打包，但只能 dry-run 或上传临时 artifact，不能发布到 npm registry：

- 手动本地发布前检查。
- GitHub Actions 的 manual workflow dispatch。
- release workflow 中发布前的验证 job。

打包验证必须证明：

- npm dry-run 不会自动修正 `package.json`。
- npm tarball 包含 `bin/koubo-clip`、CLI source、`skills/koubo-clip`、README、LICENSE 和 third-party notices。
- 平台 CLI 构建产物可以运行 `koubo-clip --help`。

## 测试版发布触发

测试版发布只允许由 `main` 上的 prerelease Git tag 触发：

```text
v0.0.1-beta.1
v0.0.1-beta.2
v0.0.1-rc.1
```

测试版 workflow 必须满足：

- tag 去掉 `v` 后必须等于 `package.json` version。
- 先通过 typecheck、tests、npm dry-run 和平台 CLI smoke check。
- GitHub Release 必须标记为 prerelease。
- npm 发布到 `https://registry.npmjs.org/`，但不能使用 `latest` dist-tag。
- `-beta.N` 使用 npm dist-tag `beta`。
- `-rc.N` 使用 npm dist-tag `rc`。
- GitHub Release 上传 Windows、Linux、macOS CLI artifacts，供用户下载测试。

## 正式发布触发

正式发布只允许由 `main` 上的 stable Git tag 触发：

```text
v0.0.1
v0.0.2
v0.1.0
```

正式发布 workflow 必须满足：

- tag 去掉 `v` 后必须等于 `package.json` version。
- 先通过 typecheck、tests、npm dry-run 和平台 CLI smoke check。
- GitHub Release 不能标记为 prerelease。
- GitHub Release 上传 Windows、Linux、macOS CLI artifacts。
- npm 发布到 `https://registry.npmjs.org/`，dist-tag 为 `latest`。
- npm CI 发布优先使用 trusted publishing / OIDC，不把长期 npm token 写进仓库。

## npm 首次发布和认证

- npm package 不存在时，首个版本必须由 maintainer 用 npm 账号在本机手动发布一次，创建 package ownership。
- 不要依赖 granular access token 创建首个 npm package；它可能只能访问已有 package，首发会表现为 `404 Not Found` 或权限错误。
- 首次手动发布前确认账号、registry 和 2FA / security key 状态：

```bash
npm whoami --registry=https://registry.npmjs.org/
npm publish --access public --registry=https://registry.npmjs.org/
```

- 如果 npm CLI 给出 `Authenticate your account at:` 链接，必须在浏览器中完成 npm passkey / security key 认证，再回到终端继续。
- package 已经存在后，后续 tag 发布可以由 GitHub Actions 自动发布。
- 临时自动发布可以使用 GitHub secret `NPM_TOKEN`，但 token 必须有 package read/write、all packages 和 Bypass 2FA 权限。
- npm UI 创建的 granular token 可能只有短期有效期；记录到期时间，到期前轮换。
- 长期方案优先改用 npm Trusted Publishing / OIDC。配置完成并验证后，删除 `NPM_TOKEN`。
- token、passkey recovery codes、provider key、`.env` 或 GitHub token 绝不能进入聊天记录、git、workflow 日志或发布包。

## 禁止行为

- 不在 pull request 中发布 npm。
- 不在普通 branch push 中发布 npm。
- 不在普通 push 到 `main` 时发布 npm。
- 不从本地脚本自动创建远端 release。
- 不把 `.env`、provider key、npm token 或 GitHub token 打进任何发布包。
- 不发布版本号和 tag 不一致的包。
- 不把 prerelease 版本发布到 npm `latest` dist-tag。

## Delivery identity

- npm 和 internal package 必须包含同一 `delivery-manifest.json`，并通过 `koubo-clip delivery verify --json`。
- Manifest 固定 CLI payload、renderer resources、official Skill、runtime compatibility digest、schema versions、capability IDs 和 exact dependencies。
- `gsap` 固定 `3.15.0`，`hyperframes` 固定 `0.7.36`；strict runtime 禁止联网下载 renderer。
- `skills install` 必须在复制前验证 bundled Skill，在 staging 后和 atomic replace 后再次验证 installed Skill。
- Release 外层另生成 artifact SHA-256；外层 digest 不替代 delivery manifest 内部身份。
