# koubo-clip

koubo-clip 是一个面向 AI agent 工作流的本地口播视频后期工具。

它把原始口播素材变成可审查、可复现、可渲染的成片：先分析内容和节奏，提出剪辑、字幕、视觉增强和配乐方案；用户确认后，再在本地完成素材落地、渲染和检查。

目标不是再造一个传统剪辑软件，也不是做黑盒一键成片。koubo-clip 希望把创作者从口播剪辑、字幕、配图、视觉组件、配乐、SFX 和成片检查这些重复劳动里解放出来，把精力放回选题、表达和内容创作。

## 它解决什么问题

口播视频创作最耗人的部分，往往不是“想讲什么”，而是后期整理：

- 从长素材里找出真正可用的表达。
- 删除停顿、等待、口头禅、误开头和重复重录。
- 给视频补上清晰字幕和必要的强调。
- 在关键解释点加入图片、图标、UI 组件、动效、B-roll 或透明标注。
- 选择合适的低音量配乐和必要的 SFX。
- 检查最终 MP4 是否真的生成，素材是否落地，画面是否遮挡，来源是否可追溯。

手工做这些事情很慢；直接让 AI “帮我剪一下” 又容易变成黑盒。koubo-clip 的做法是：agent 负责理解内容、审查候选和提出方案，CLI 负责本地确定性执行、校验、渲染和检查。

## 适合什么场景

koubo-clip 适合处理以讲解为核心的视频：

- 教程、课程、知识讲解。
- 产品演示、功能介绍、内部培训。
- 屏幕录制加旁白。
- talking-head 口播短视频。
- 需要字幕、视觉强调、图片、图标、UI 组件、配乐和 SFX 的轻量包装视频。
- 已经在使用 Codex、Claude、Hermes 或类似 agent 的本地视频工作流。

## 不适合什么场景

koubo-clip 不是完整 NLE，也不是黑盒 AI 视频生成器。它不适合：

- 多机位影视剪辑。
- 强审美驱动的广告片精修。
- 需要大量人工镜头语言设计的复杂项目。
- 不想经过 review/proposal，只想直接生成结果的工作流。
- 完全云端、账户化、多用户协作的视频编辑平台。

## 面向谁

- 短视频创作者。
- 教程、课程和知识创作者。
- 产品演示视频、内部培训视频制作者。
- 使用 AI agent 自动化处理本地素材的开发者。
- 想把视频后期流程接入 CLI 或 agent workflow 的团队。

## 工作方式

![koubo-clip 工作流程](docs/assets/readme-cn-workflow.png)

典型流程是：

```text
原始口播素材
  -> project create
  -> explore: 转写、媒体探测、素材分析
  -> source-frames: 在源时间线上抽取语义观察帧
  -> review: 清理候选和风险审查
  -> proposal: 2-4 个完整方案，每项含业务方向、剪辑执行和素材需求
  -> 用户确认一个 option（只确认一次）
  -> confirmed edit-plan + selection fingerprint
  -> visual/music/focus artifacts: 获取或导入本地素材
  -> enrich-plan: 校验唯一 canonical 渲染计划
  -> render-result: 本地渲染并登记 canonical MP4
  -> inspection: 抽帧、artifact 检查和 report
```

制作方案前，agent 可以基于 transcript 和素材报告选择最多 20 个源时间点，由 CLI 生成 project-local JPEG，帮助有视觉能力的 host 理解原素材；这组只读 source frames 不代表用户确认。用户确认前不会生成 edit plan、focus/视觉/音乐执行 artifacts 或 render。没有视觉能力的 standalone workflow 可以明确标记后继续 transcript-only；platform 缺少视觉能力时由 host workflow 报告 blocker，CLI 抽帧命令本身不调用视觉模型或 provider。

`project proposal --json` 会返回 proposal fingerprint 和按 option id 索引的 selection fingerprints。用户确认后，`edit-plan.json` 用 `confirmed_option_id` 和对应 fingerprint 绑定这次选择；被选方案发生变化时，下游会明确变 stale。EDL 是 CLI 派生的 checkpoint，消费者发现它过期且权威输入完整时会通过同一个 deterministic compiler 自动重建。

render 阶段只消费已经落地到当前 project 目录的本地文件或稳定引用，以及 current canonical `enrichment-plan.json`。简化平台交接可写独立 `asset-usage-plan.json`，但必须先由 `project enrich-plan` 一次性归一化；它不能被 render 直接消费，也不能与 canonical 或其他 legacy usage source 隐式合并。Provider URL、临时下载地址和 API key 不是最终渲染输入。

## Artifact 状态与恢复

每个 project 根目录的 `artifact-manifest.json` 由 CLI 独占写入，记录 artifact role、schema、fingerprint、直接输入 lineage 和 stage attempts。文件存在本身不表示成功；artifact 状态是 `missing`、`pending_validation`、`current`、`stale` 或 `invalid`。

`standalone` 与 `platform` 使用同一套 artifact keys、lineage 和 status 合同；区别只在 provider 由本地 CLI 还是 host/platform 执行，所有结果仍先落成可校验 project artifacts。

宿主和 agent 通过以下公共命令恢复工作流：

```bash
koubo-clip --version
koubo-clip capabilities --json
koubo-clip project status <project> --json
```

`capabilities` 描述软件支持的命令、schema、feature flags 和 provider-mode 语义，不探测当前机器；环境检查仍由 `doctor` 负责。`project status` 是只读入口，返回 artifact/stage 状态、blockers、remediation、next commands、精确 render inputs、canonical deliverable 和最后成功 checkpoint。不要扫描目录、比较 mtime，或根据 Markdown、storyboard、`final.mp4` 是否存在猜状态。

没有 manifest 的旧 project 会报告 `legacy_untracked`：结构合法的外部权威输入进入 `pending_validation`，无法证明 lineage 的旧派生结果标为 `stale` / `LINEAGE_UNPROVEN`。按 status 给出的 validator 或 consumer 重跑即可逐步建立新 lineage，不要求重建 source 目录。

Render 成功由 current `render-result.json` 证明，其中 `canonical_output_key` 明确选择 clean 或 final MP4。Inspect 只检查该输出并写 current `inspection.json`。`report.md` 是从 inspection 生成的可重建 human view；它缺失不会推翻仍然 current 的机器完成状态。

## 当前能力

- 内容清理：检测和审查长停顿、等待、口头禅、误开头、重复重录等候选片段。
- 字幕：生成字幕文件，支持 caption rail、强调词和字幕可读性检查。
- 视觉增强：支持图标、动态图标、图片、B-roll、UI 组件、模板、透明标注和 HyperFrames elements。
- 音频：支持本地音乐、MiniMax、Freesound、Pixabay、低音量 ducking 和 SFX。
- 合成：使用 HyperFrames visual recut 和 FFmpeg 组装最终 MP4。
- 检查：通过 structured render result、inspection artifact、storyboard QA、inspection frames 和 report 检查输出。

部分视觉素材和音乐能力依赖网络、API key、用户提供的文件，或 host agent 的 MCP handoff。CLI 负责把确认后的素材导入 project，并记录来源、授权、hash 和 warnings。

## 快速开始

npm 安装：

```bash
npm install -g koubo-clip
koubo-clip --version
koubo-clip capabilities --json
koubo-clip doctor
koubo-clip skills install --target codex
```

然后把视频交给已安装 skill 的 agent，让 agent 创建 project、分析素材、写入 proposal，并调用 CLI 校验：

```text
使用 koubo-clip 处理 ./raw.mp4。
先分析素材并给我 production proposal。
我只确认一个完整 option；确认后再写入绑定 fingerprint 的 edit plan、视觉/音乐 artifacts、渲染 canonical MP4 并检查结果。
```

源码开发方式：

```bash
bun install
bun run koubo-clip -- doctor
bun run koubo-clip -- skills install --target codex
```

需要手动排查时，前几步可以直接运行：

```bash
koubo-clip project create ./raw.mp4
koubo-clip project explore koubo-clips/raw --asr auto
koubo-clip project source-frames koubo-clips/raw
koubo-clip project review koubo-clips/raw
```

规划机器没有原片字节时，使用分布式 authoring/strict execution 流程：

```bash
koubo-clip project create --source-manifest ./sources.json --project ./project --provider-mode platform
koubo-clip project compile-edl ./project
koubo-clip render-contract export ./project --output ./render-bundle
koubo-clip render-contract verify ./render-bundle
koubo-clip render-contract bind ./render-bundle --source-map ./source-map.json --output ./bindings.json
koubo-clip render-contract render ./render-bundle --bindings ./bindings.json --output ./strict-run
koubo-clip render-contract inspect ./render-bundle --result ./strict-run/render-contract-result.json
```

合同由 CLI 独占生成且不可变。Strict consumer 不读取 transcript、analysis、edit-plan 或 enrichment-plan，也不会在缺失 authoring 状态时重新规划。

`review` 之后，CLI 不会黑盒生成制作方案。agent 或用户需要先写入 `production-proposal.json`，再运行：

```bash
koubo-clip project proposal koubo-clips/raw --json
```

`project proposal --json` 会校验 `production-proposal.json`、生成 `production-proposal.md`，并返回每个 option 的 selection fingerprint。每个 option 已经同时包含业务方向、剪辑执行方案和素材需求，用户只确认一次。确认后，把 option id 和 fingerprint 写入 `edit-plan.json`，再继续准备视觉/音乐 artifacts、canonical `enrichment-plan.json`，并执行 render/inspect。

## 安装

源码开发方式：

```bash
git clone <repo-url>
cd koubo-clip
bun install
bun run koubo-clip -- --help
bun run koubo-clip -- doctor
```

发布到 npm 后，用户入口会是：

```bash
npm install -g koubo-clip
koubo-clip --help
koubo-clip doctor
```

安装 agent skill：

下面命令以源码开发方式为例；全局安装后，把 `bun run koubo-clip --` 换成 `koubo-clip` 即可。

```bash
# Codex: 默认 ~/.agents/skills/koubo-clip
bun run koubo-clip -- skills install --target codex

# Claude Code: 默认 ~/.claude/skills/koubo-clip
bun run koubo-clip -- skills install --target claude

# Hermes Agent: 默认 ~/.hermes/skills/koubo-clip
bun run koubo-clip -- skills install --target hermes
```

自定义 skills 目录：

```bash
bun run koubo-clip -- skills install --target codex --dest /path/to/skills
```

已经安装过并确认要覆盖：

```bash
bun run koubo-clip -- skills install --target codex --force
```

npm 包会随包发布 `skills/koubo-clip` 和 HyperFrames sidecar resources。当前公开包名是 `koubo-clip`。

## skills.sh

仓库根目录提供 `skills.sh.json`，用于让 skills.sh 在索引公开 GitHub 仓库时把 `koubo-clip` skill 放到 Video 分组。仓库被索引后，也可以通过 skills.sh CLI 安装：

```bash
npx skills add <owner>/<repo>
```

这里的 `<owner>/<repo>` 需要替换成实际公开 GitHub 仓库名。

## 本机依赖

需要：

- Bun。
- Node.js 22+。
- FFmpeg / ffprobe。
- `npx`，用于按需调用 HyperFrames renderer。
- 可选网络访问，用于在线 ASR、音乐生成、视觉素材搜索。
- 可选 provider API key 或 MCP 配置。

macOS 推荐用 Homebrew：

```bash
brew tap oven-sh/bun
brew install bun ffmpeg node
bun --version
ffmpeg -version
npx --version
```

Windows 推荐用 winget：

```powershell
winget install --id Gyan.FFmpeg -e
winget install --id OpenJS.NodeJS.LTS -e
powershell -c "irm bun.sh/install.ps1 | iex"
bun --version
ffmpeg -version
npx --version
```

检查环境：

```bash
bun run koubo-clip -- doctor
```

`doctor` 会报告 FFmpeg、ffprobe、npx、Whisper、MiniMax、Lordicon、MCP handoff 和 bundled resources 状态。它不会输出 API key 明文。

## 配置

可以把配置放在用户目录的 `~/.koubo-clip/.env`：

```bash
mkdir -p ~/.koubo-clip
$EDITOR ~/.koubo-clip/.env
```

Windows PowerShell：

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.koubo-clip"
notepad "$env:USERPROFILE\.koubo-clip\.env"
```

也可以用 shell 环境变量，或在当前 project 目录放 `.env` 做临时覆盖。加载优先级是：

```text
shell 环境变量 > 当前目录 .env > ~/.koubo-clip/.env
```

常见配置：

```bash
# 默认线上 ASR：Cloudflare Whisper
GATEWAY_CLOUDFLARE_AI_ACCOUNT_ID=...
GATEWAY_CLOUDFLARE_AI_API_TOKEN=...
GATEWAY_CLOUDFLARE_AI_TRANSCRIPTION_MODEL=@cf/openai/whisper-large-v3-turbo

# AI 生成背景音乐
MINIMAX_API_KEY=...

# 动态图标官方来源
LORDICON_API_KEY=...

# 可选：网络音乐素材
FREESOUND_API_KEY=...

# 可选：本地音乐库
MUSIC_LIBRARY_DIR=/path/to/music-library
```

说明：

- `--asr auto` 默认优先使用已有 `transcript.json`；没有 transcript 时使用线上 Cloudflare Whisper；缺少线上配置时才退到本机 `whisper-cli`。
- MiniMax 只用于 `project music-acquire`，render 阶段不联网、不读取 key。
- Iconify 静态图标不需要 key。
- Lordicon 用于动态图标候选和下载。
- Freesound 是可选网络音乐来源。
- Pixabay 目前是实验性路径，不作为稳定音乐来源。

不要把真实 key 提交到仓库。

## Agent 推荐用法

安装 skill 后，在 Codex、Claude、Hermes 或类似 agent 中描述目标，例如：

```text
使用 koubo-clip 分析这个口播视频：
剪掉停顿、等待、口头禅、误开头和重复重录。
加清晰字幕，在关键解释点加入图片、图标、UI 组件或动效。
如果适合发布效果，加入低音量背景音乐和必要 SFX。
先给我包含完整选项的 production proposal；我确认一次后再渲染 canonical MP4，并输出结构化 inspection 和检查报告。
```

agent 会读取 koubo-clip skill，调用 CLI，展示 proposal，并在用户确认后继续准备视觉/音乐素材、渲染和检查。

## 手动 CLI 流程

agent 通常会自动调用 CLI。需要手动排查时，可以按阶段运行。

开始前先确认软件合同；恢复已有 project 时只读 status：

```bash
bun run koubo-clip -- --version
bun run koubo-clip -- capabilities --json
bun run koubo-clip -- project status koubo-clips/video --json
```

前半段由 CLI 直接生成分析和 review 包：

```bash
bun run koubo-clip -- project create /path/to/video.mp4
bun run koubo-clip -- project explore koubo-clips/video --asr auto
bun run koubo-clip -- project source-frames koubo-clips/video
bun run koubo-clip -- project review koubo-clips/video
```

`project source-frames` 读取 agent 已写入的 `source-frame-request.json`，按 source-local time 生成只读素材证据；CLI 不负责选择时间点或做视觉判断。

之后的命令会读取 agent 或用户已经写入的 artifacts，而不是自动替你做创意决策：

```bash
# 需要已有 production-proposal.json
bun run koubo-clip -- project proposal koubo-clips/video --json

# 可选：查看可用视觉元素目录
bun run koubo-clip -- project element-catalog koubo-clips/video

# 需要已有 edit-plan.json；如使用视觉/音乐增强，还需要 enrichment-plan.json 和 asset-manifest.json
bun run koubo-clip -- project enrich-plan koubo-clips/video
bun run koubo-clip -- project render koubo-clips/video
bun run koubo-clip -- project inspect koubo-clips/video
```

视觉素材命令：

```bash
bun run koubo-clip -- project visual-catalog <project>

# 需要已有 visual-request.json
bun run koubo-clip -- project visual-search <project>
bun run koubo-clip -- project visual-acquire <project>
bun run koubo-clip -- project visual-review <project>
```

音乐命令：

```bash
bun run koubo-clip -- project music-catalog <project>

# 需要已有 music-request.json
bun run koubo-clip -- project music-acquire <project>
bun run koubo-clip -- project music-review <project>
```

涉及 UI 坐标、source highlight 或 screen-recording callout 时，先走 focus evidence：

```bash
bun run koubo-clip -- project focus-candidates <project>
bun run koubo-clip -- project focus-frames <project>
bun run koubo-clip -- project focus-grounding <project>
bun run koubo-clip -- project focus-review <project>
```

## 输出文件

常见输出在 project 目录中：

- `material-report.md`
- `source-frame-request.json` / `source-frames.json`
- `.source-frames/`
- `review-package.md` / `review-package.json`
- `production-proposal.md` / `production-proposal.json`
- `artifact-manifest.json`
- `edit-plan.json`
- `asset-usage-plan.json`（仅简化/兼容输入）
- `focus-*`
- `visual-*`
- `music-*`
- `asset-manifest.json`
- `enrichment-plan.json`
- `storyboard.json`
- `renders/clean.mp4`
- `renders/final.mp4`
- `render-result.json`
- `inspection.json`
- `.inspection/`
- `report.md`

`storyboard.json.qa_checks[]` 是合成清单也是检查清单，但 storyboard 只有 lineage current 时才可消费。`project inspect` 会从 current render result 的 canonical output 按它抽帧并输出 `inspection_checks[]`。

## 项目状态

- 当前安装版本以 `koubo-clip --version` 为准，不在 README 硬编码。
- 当前包状态：已发布到 npm；当前稳定发布线已包含 detached authoring 和 strict render-contract execution。
- 当前推荐开发方式：源码仓库中使用 Bun。
- npm package：`koubo-clip`。
- 视觉素材、音乐和部分 provider 能力依赖网络、API key、用户资产或 host MCP handoff。
- 渲染依赖 FFmpeg、ffprobe、npx 和 HyperFrames 相关资源。
- Artifact/state 合同以 `capabilities --json` 和 `project status --json` 为公共发现面。

## 开发

```bash
bun install
bun run typecheck
bun run test
bun run pack:dry
bun run package:internal
```

开发态直接运行：

```bash
bun run koubo-clip -- --help
```

### AI 辅助开发约定

koubo-clip 本身也使用 Codex、Claude Code 等 AI 工具协作开发。参与开发前，请让你的 AI 工具先读取项目约定：

- Codex：使用根目录 `AGENTS.md` 作为项目指令入口，它会继续指向 `docs/` 和 `rules/` 中的长期约束。
- Claude Code：先构建或更新根目录 `CLAUDE.md`，内容应来自 `AGENTS.md` 的项目说明、相关 `docs/` 和 `rules/`，再让 Claude Code 开始修改。

不要把本地 token、npm key、API key 或个人机器路径写进 `AGENTS.md`、`CLAUDE.md` 或任何提交内容。

## License

koubo-clip 以 MIT License 开源，见根目录 `LICENSE`。

第三方依赖、vendored resources、生成素材和 CDN runtime 保留各自许可证，见 `THIRD_PARTY_NOTICES.md`。其中需要特别注意：`gsap` 使用 Standard "No Charge" GSAP License；HyperFrames resources 使用 Apache-2.0；Pixabay SFX 和 VS Code theme JSON 保留各自许可证。
