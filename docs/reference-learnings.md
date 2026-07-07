# 参考项目学习结论

本文档记录 koubo-clip 应从参考项目借鉴哪些思想、哪些规则需要适配，以及哪些内容不进入 v0。

## 状态

这些是 v0 规划中的产品和架构决策。它们本身不是实现任务。

V0 保持：

- Local CLI first。
- 一个 bundled `koubo-clip` skill。
- 一个 skill 统一 agent 工作流；HyperFrames 上游 skills 只作为方法论和资源来源，不作为多个对外 skill 暴露。
- Node.js、TypeScript、Bun。
- render 前有可 review 的 cleanup workflow。
- 保持 Hermes-compatible artifact 思维，但不要求 Hermes runtime。
- 业务关键词不是稳定合同；稳定合同是 semantic intent、element type 和 frame evidence。

## 当前梳理后的增强结论

主要产品修正是：用户确认前应先输出 production proposal，而不是让用户分别面对 cleanup、enrichment、music 和 asset 的执行 JSON。

用户首先需要看到 source footage 包含什么、cleanup 策略会移除什么以及为什么，同时看到这条视频将如何使用字幕、UI 动效、图片/生图、音乐和 SFX。`production-proposal` 是“足以决策”的确认单；用户确认后，系统再生成“足以执行”的 `edit-plan`、`focus-*`、`music-*`、`asset-manifest` 和 `enrichment-plan`。

这个确认单不能制造假确定性：没有 frame evidence 时不承诺坐标，没有生成/获取前不承诺 asset path 或 provider 结果，没有 EDL 前不把所有增强点当成最终 output timeline。

enrichment 层应表达为 v1.2 output-timeline plan：

- `profile`: source mode、aspect ratio、caption identity、layout、style 和 frame。
- `elements[]`: registry block/component、caption identity、animation rule、SFX 或 generated asset。
- `captions/cards/music`: v1.1 兼容输入，供旧 plans 继续工作。
- `music[]`: background music intent、volume、fade 和 ducking policy。

每个 element/music item 应包含 `start`、`end`、output-timeline anchoring、visible text 或 asset references、reason，以及它是否需要用户批准或外部 asset generation。

对 v0，CLI 应校验并消费 local assets。它不应拥有 image generation、music generation、B-roll sourcing 或 paid provider selection。Agents 和 host platforms 可以生成这些 assets，但 final composition 必须使用 project-local files 或未来 workspace refs。

首个 enrichment renderer 应保持窄范围：一个 HyperFrames recut composition 用于 visual cards 和 anchor captions，再由 FFmpeg 负责 clean-audio attach 和 music ducking。Remotion 和更广的 OpenMontage-style composition 可以等到需要 charts、generated scenes 或 reusable component systems 时再引入。

最新 source sweep 增加了一个修正：enrichment 必须先按 source mode 分支，再选择 visual defaults。Talking-head avatar footage 可以支持 full cards 和 PiP packaging。Screen recordings 需要 transparent guidance，保证 UI text 仍可读。

再进一步，screen recordings 不能只靠“看起来像对”的坐标。只要元素使用 `target_rect`、`anchor_point` 或任何 UI 定位参数，就必须能回溯到 source frame 或 inspection frame；这就是 Visual Grounding 的目的。用户的原始措辞可以变化，但 `focus-candidates`、`focus-frames` 和 `focus-grounding` 必须把它压缩成可验证的证据链。

最新视觉素材策略修正是 internet-first：koubo-clip 不应先假设存在一个长期本地 UI/icon/Lottie 素材库。需要视觉 UI、图标、动态图标、模板、贴纸、B-roll 或图片时，agent 应通过 host MCP、API 或平台工具直接在互联网上做语义检索，拿到候选、预览、license/cost/source 和用途说明，再进入 proposal/review。确认后的文件只作为当前 project artifact 落地，不承担跨 agent 缓存职责。

当前外部生态优先级：

- shadcn MCP：官方 MCP，支持 AI assistants 浏览、搜索和安装 registry items。适合作为 UI component / block registry 的标准接入方式。
- shadcn-compatible registries：官方 registry MCP 说明允许第三方 registry 通过 registry index 接入 MCP。适合未来接 21st.dev 或自建 curated registry。
- 21st.dev MCP：上游 MCP，支持自然语言生成/获取现代 React UI components，并接入 21st.dev component library 与 SVGL brand assets。适合寻找更“流行/更新快”的 UI 组件和模板，但视频 render 前仍要经过 koubo 的安全转换或 HyperFrames 包装。
- Iconify API：官方搜索 API，可按 query 搜索 275k+ icons 和 200+ open-source icon sets，并返回 collection/license metadata。适合作为常见业务图标的主来源，例如 alarm、call、navigation、bluetooth、battery、message。
- Lordicon official Web/API/npm：官方 animated icon runtime 和 `<lord-icon>` custom element。适合 animated icon，例如提醒、电话、通知、成功、错误、加载。第三方 Lordicon MCP 可以评估，但不能当作官方能力前提。
- LottieFiles dotLottie：官方 web component / runtime，可通过 CDN 或 npm 渲染 `.lottie` / `.json`，适合作为通用 Lottie/dotLottie render runtime。素材搜索和授权需要单独确认 provider API。
- Rive：适合复杂交互动效，能力强但接入重，后置。
- Astryx：React + StyleX design system，适合未来 koubo review/dashboard UI，不作为视频视觉素材主来源。

本轮 HyperFrames 源码扫描也修正了 CDN 策略：HyperFrames 的成熟做法不是把所有 runtime 都本地化，而是通过 HTML-native composition 引用固定版本 CDN runtime，并用 timeline/adapter 规则保证 seekable rendering。扫描到 registry/skills 中大量使用 `cdn.jsdelivr.net`、Google Fonts、Three.js、D3、TopoJSON、bodymovin/Lottie、dotLottie 和 Anime.js；其中 `gsap@3.14.2` 出现约 198 次。这说明 koubo-clip 应学习“allowlisted CDN runtime + dependency summary + inspect provenance”，而不是把互联网能力视为例外。

本次实现把这个结论落成两个产品合同：

- Visual acquisition 合同：`visual-request` 描述 viewer job 和 semantic query，`visual-candidates` 展示 provider/source/license/cost risk，`visual-acquisition` 记录下载或导入后的 hash/provenance，`visual-review` 再决定是否进入 enrichment。最终 render 只消费 `asset-manifest.json` 中的 project-local files。
- HyperFrames CDN 合同：允许固定版本 allowlist runtime，例如 `gsap@3.14.2`、`bodymovin/lottie-web@5.12.2`、`@lottiefiles/dotlottie-web@0.76.0`、Google Fonts 等；禁止 agent 自定义 CDN。`storyboard.json`、`inspect` 和 `report.md` 必须暴露 runtime dependencies。

## HyperFrames

HyperFrames 是 enriched visual layer 应如何呈现、如何打包的最佳参考。

HyperFrames 上游目录里的 `skills/*` 在 koubo-clip 中要拆开理解：其中的流程说明、caption/motion/media 判断规则应提炼进 `skills/koubo-clip/references/`；其中的 registry、HTML、字体、SFX、caption theme、runtime adapter 和示例文件是 CLI resources。开发态放在 `packages/cli/vendor/hyperframes/`，内部二进制包中放在 `resources/hyperframes/` sidecar 目录。CLI 不读取或运行 agent skill，agent 也不直接加载这些上游 skill 目录。

### 采用

- 使用 `/talking-head-recut` mental model：cleaned talking-head video 保持为 base footage，designed graphics 在同一 timeline 上叠加。
- 借鉴 `/embedded-captions` 的 rail-first 规则：大部分 transcript text 属于可读 caption rail；特殊 embedded/emphasis text 应该稀少。
- 在 HTML generation 前使用 storyboard/render-plan checkpoint。在 koubo-clip 中就是从 `enrichment-plan.json` 派生出的 `storyboard.json`。
- 生成一个完整 composition，而不是单独渲染许多 independent overlays。这样 caption rail、cards 和 base video 处在同一个 timing surface。
- 遵守 HyperFrames HTML contracts：root `data-composition-id/data-width/data-height`，timed clips 使用 `data-start/data-duration/data-track-index`，并在 composition id 下注册 paused seekable timeline。
- 按用户最终决策，完整迁移 HyperFrames 的可创建元素体系：`registry/blocks`、`registry/components`、`registry/examples`、embedded-captions theme/DNA、animation rules/blueprints、hyperframes-media SFX、motion-graphics categories、talking-head references 和 creative frame presets。迁移结果对 CLI 是 resources，对 agent 是经 koubo-clip references 和 element-catalog 暴露的决策能力。
- 把 registry/catalog 从“少量手写映射”升级成本地 vendored registry resolver/installer，保留 path traversal 校验、依赖拓扑安装、block/component 区分和 preview/tag metadata。
- 按用户最终决策，生成的 public workspace 可以直接加载 CLI allowlist 中的固定版本 CDN runtime，例如 HyperFrames blocks 常用的 `gsap@3.14.2`；Google Fonts family CSS 是首个明确记录的 versionless exception。
- 迁移 Lottie/dotLottie runtime adapter 思路：Lottie JSON 用 allowlisted `lottie-web`，`.lottie` 用 allowlisted dotLottie runtime；两者都注册到 seekable timeline，不靠 `play()` 驱动 render-critical motion。
- 注册 seekable `window.__timelines.recut`，保持 deterministic paused timeline。CDN 只是 runtime delivery 方式，不是允许 agents 提供任意外部 HTML/JS。
- 使用 vendored registry elements 和 deterministic compatibility HTML/SVG 生成 recut，不接受任意 agent-authored HTML。
- 完整迁移不等于直接播放 demo composition。koubo-clip 需要一层 adapter，把每个 vendored element 归到 caption、lower-third、code、screen-focus、notification、social、app、flowchart、chart/map、transition、VFX、liquid-glass、device、SFX 或 guidance family，并把 demo 文案替换成 plan params。
- 借鉴 `/motion-graphics` 的调度方式：先判断用户内容是否需要 search/generated assets，再按 kinetic-type、stat、charts、lower-thirds、webpage、news、tweet、asset-fusion 等类别选择元素。koubo-clip 中对应为先推断 `presentation_intent`，再结合 `source_mode` 读取 `purpose_recommendations`。
- 借鉴 `/talking-head-recut` 的设计方式：输出比例、layout、style、frame 和 card density 是独立维度，卡片数量和节奏由 transcript duration/density 决定。koubo-clip 不把这套决策写成固定模板，而是通过 skill 的用途判断和 CLI catalog 推荐约束 agent 选择。
- media paths 保持在 project/public workspace 本地。
- 借鉴 `video-overlay` 规则：与 source video 共享 canvas 的 overlays 必须保持透明或范围很小。
- 对 screen recordings，借鉴 focus/callout grammar，而不是 slide-card grammar：transparent rectangles、small labels、accent lines、lower thirds 和 anchored callouts。

### 适配

- HyperFrames 上游 skill 文档经常使用 GSAP 和更广的 agent-authored composition work。koubo-clip v0 将 animation templates 保留在 CLI resources 内部，不暴露任意 animation DSL。
- HyperFrames 可以制作丰富 authored pages。koubo-clip v0 只接受 semantic card data 加可选 normalized coordinates；CLI 负责具体 animation 和 visual template。
- 对 code 和 screen-focus 类元素，直接挂载原生 demo block 容易带出示例 token 或遮挡 source UI；v0 用 CLI-owned 透明 overlay 消费这些 family，仍在 catalog/report 中保留 HyperFrames 来源。
- HyperFrames 的 embedded captions 可以做 matting 和 text-behind-person。koubo-clip v0 只实现 `anchor` rail；subject matte 和 occlusion-aware caption placement 是后续里程碑。
- Flowcharts 和 data cards 应使用 HTML/SVG，而不是 image generation。
- Image models 只应在 visual asset 没有 deterministic source 时使用：cover art、abstract concept visuals、B-roll illustrations 或 brand icons。
- 对 screen recordings，优先使用 source screenshots、crops、SVG diagrams 和 transparent callouts，而不是 generated images。
- 对 screen recordings，优先使用 source screenshots、crops、SVG diagrams、transparent callouts 和 frame-backed grounding，而不是仅凭语言描述放置坐标。

### 不迁移

- 不迁移 Studio、Cloud、发布平台、Auth、浏览器 UI、账户体系或完整 HyperFrames 产品面。
- 首个 enrichment loop 不要求 matting/remove-background。
- 不允许 agents 把任意 HTML/JS 当成稳定产品接口写入。
- 不让所有 enrichment 都依赖 generated images；大多数 educational overlays 应是 deterministic registry elements、caption treatments 或 source-aware callouts。

## Digital Assistant Hermes

Hermes 是治理、工具边界、asset provenance 和长期规则的最佳参考。它不是让 koubo-clip 在 v0 变成平台 app 的参考。

### 采用的策略

- 把 `AGENTS.md` 用作索引和操作合同，而不是所有规则的垃圾桶。
- 保持分工清晰：`docs/` 解释产品、架构、协议和原因；`rules/` 解释实现边界、validation 和禁止的捷径。
- 优先写小而明确的规则，而不是宽泛平台 policy。
- 只有当约束会重复出现或保护长期边界时才新增规则。
- 把 generated artifacts 当成事实：stable refs、无隐藏 provider URLs、user-facing contracts 中无 host absolute paths。
- provider-backed generation 在 final local render 证明 deliverable 存在前都只是 support work。
- 用户批准 production proposal 前，不生成昂贵或创意 media。
- 在 media generation 前保留 production proposal / confirmation checkpoint：source summary、intended audience/use、cleanup posture、字幕、UI 动效、图片/生图、音乐、SFX、默认选项和风险。
- 把 images、music、B-roll 和 generated animation clips 视为 support artifacts。它们不是完成证明，除非 local render 和 inspection 通过。
- 让 failure states 足够结构化，方便 agents retry 或报告 blocker。

### 要适配的规则

| Hermes source | koubo-clip adaptation |
| --- | --- |
| `rules-governance.md` | 保持当前 `rules/rules-governance.md` 严格：先更新已有规则，只为重复稳定边界新增规则。 |
| `contracts.md` | 当真实 schemas 出现时新增 schema-contract rule。`transcript.json`、`review-package.json`、`edit-plan.json` 和 `edl.json` 不能互相替代。 |
| `task-workspace-uploaded-assets.md` | 暂缓完整 TaskWorkspace 规则，但为未来 source asset handling 借鉴 path safety、manifest metadata 和“不要暴露 absolute paths/provider URLs”。 |
| `image-slot-contract.md` | 未来适配为 `visual-enrichment-slot` 合同，用于 cover images、concept cards、transition images、sticker overlays 和 generated B-roll requests。 |
| `generated-asset-storage.md` | 借鉴 provider URLs 只是临时输入线索的规则；final composition 消费 local files 或未来 workspace refs。 |
| `testing.md` voice smoke rules | ASR tests 必须使用真实非空 audio 且确认 duration；不要用零时长样本判断 ASR behavior。 |
| `runtime.md` Chinese Whisper note | Chinese word-level ASR 必须视为不可信，直到 per-file validation 证明 precision。否则标记 timing granularity 为 `segment`。 |
| `easy-video-runtime.md` | 借鉴 staged confirmation、support-tool boundaries、TaskWorkspace-like artifact refs，以及 local final render 才是真正 completion signal。 |

### V0 不迁移的规则

- API Gateway、tenant、auth、quota 和 platform permission rules。
- Database 和 migration rules。
- Frontend UI、Expo 和 Render Pane rules。
- Connector、LocalAgent、mobile、WeChat、ERP、sales 和 job-center rules。
- WorkArtifact Projection 细节，除了 user-facing files 需要 authorized stable ref 这个一般思想。

这些规则解决平台问题。过早把它们拉进本地 CLI，会让 v0 更重，却不能改善第一版 editing loop。

## Video Use

`video-use` 是最强的 editing 参考。它解决的问题最接近：对用户素材做 conversational editing。

### 采用

- Transcript-first editing：transcript 是主要 reasoning surface。
- Audio 是主线；visuals 只在 decision points 检查。
- 用 packed phrase-level transcript 给 agent review，而不是把巨大 raw JSON 倒进上下文。
- 剪辑前做 strategy confirmation。
- EDL entries 包含 source、start、end、beat/label、quote 和 reason。
- 当 word timings 可信时，永不从单词中间切。
- 为 cut boundaries 加 padding，以吸收 ASR drift。
- 在 cut boundaries 加短 audio fades。
- Subtitles 使用 cuts 之后的 output-timeline offsets。
- Captions 必须保持为最上层可读层；在 HyperFrames recut path 中，这意味着同一 composition 中的 anchor rail。
- 报告成功前，自评 rendered output 的 cut boundaries 附近。
- Cards 和 caption emphasis 应同步到相关 spoken payoff word 或 phrase，而不是随意 timestamps。
- 不同 animation engines 适合不同阶段：v0 用 HyperFrames cards/caption rail，React component overlays 以后可用 Remotion。

### 谨慎适配

- `video-use` 把 word-level verbatim ASR 当硬规则。koubo-clip 应改为要求显式 `timing_granularity`，因为 v0 可能使用 `whisper-cli`，且中文 word-level timing 可能不可靠。
- `video-use` 写入 `<videos_dir>/edit/`。koubo-clip 应使用自己的 project directory shape：`koubo-clips/<slug>/`。
- `video-use` 可用 sub-agents 做 overlays 和 animations。koubo-clip v0 在 cleanup loop 可靠前应保持 enrichment 简单。

### 不采用

- 不要求 ElevenLabs Scribe 作为唯一 ASR path。
- 不把 animation generation 变成 v0 必经路径。
- 如果项目是 Node.js-first，就不复制它的 Python helper 架构。

## Easy Video

`easy-video` 是 packaging 和 staged agent workflow 的最佳参考，不是 editorial logic 的参考。

### 采用

- Node.js + TypeScript + Bun。
- 安装后的 `koubo-clip` 二进制作为执行入口。
- Bundled skill 随 npm package 分发；内部 tarball 只是可选二进制交付路径。
- 用 staged `project` workflow 做谨慎处理。
- Fast `generate` 只用于草稿或用户明确要快。
- 面向 agents 输出 `--json`。
- `--dry-run` 和 doctor-style checks。
- Provider keys 来自用户环境，永不来自 package。
- Generated project directories 必须可检查、可恢复。
- Internal render glue 不是 user-facing authoring model。
- 使用类似 `image-video-plan.json` 思想的 plan artifact：timed beats、visible text、visual intent、asset paths，以及 render 前 validation。
- 生成或放置 images 和 on-screen text 时保留 subtitle safe areas。Generated visuals 不应把重要文字放在底部 subtitle band。

### 谨慎适配

- easy-video 拆成三个 skills。koubo-clip 应先从一个 skill 开始，等 command 和 artifact contracts 稳定后再拆。
- easy-video 让 CLI 拥有 provider-backed image/TTS generation。koubo-clip v0 不应把 image generation providers 放进 CLI；agents/platforms 可以生成 assets，CLI 只校验并消费 local files。

### 不采用

- 不把 image-first generation 作为产品中心。
- 不把 storyboard/image generation 作为 cleanup 必经路径。
- 不要求 generated slide images 作为 visual source of truth。

## OpenMontage

OpenMontage 对长期架构思考有用。它完整的 pipeline system 对 koubo-clip v0 来说太重。

### 采用

- Agent as control plane：instructions 和 artifacts 引导 workflow；code 拥有 tools 和 validation。
- 带 schema validation 的 canonical artifacts。
- Checkpoint thinking：已完成阶段不应无必要重跑。
- 清楚区分 reference video 和 source footage。
- Consequential 或 paid calls 前应沟通 provider/model/runtime choices。
- Blockers 应明确：失败了什么、为什么、选项和建议。
- 呈现 final output 前自审。
- Project workspace 约定：generated artifacts 放在 project directory 下，而不是 repo root。
- 为 enrichment 借鉴 `scene_plan` 和 `action_timeline` 思路：区分 talking-head base、B-roll、animation、text card、transition、generated scene 和 timed actions。
- 借鉴 talking-head overlay primitives：lower thirds、side panels、stat cards、comparison cards、quote/callout cards、section titles 和 topmost captions。
- 借鉴 screen-demo primitives：克制的 zoom/focus、highlight boxes、arrows、step labels、keystroke badges、blur masks，以及 readable UI 作为 quality gate。
- 借鉴 audio-mixer concepts：background music 不只是文件路径；它需要 volume、fades、segments 和 ducking，让 speech 保持可懂。
- 借鉴 OpenMontage music plan：音乐必须在 proposal/enrichment plan 阶段暴露，不要等到 asset 或 render 阶段才发现没有来源。
- 借鉴 `music_library`：本地曲库是第一优先级，应该列出 track、duration 和位置，让用户选择已有授权素材。
- 借鉴 `pixabay_music` / `freesound_music`：网络素材可以进入获取层，但必须记录 provider、query、license/original URL，并让用户知道稳定性和授权风险。
- 借鉴 `pixabay_music`：Pixabay Music 不是官方 API key 路径，而是 experimental web retrieval。遇到 403 或 Cloudflare challenge 时应诚实报告并 fallback，不要暗示用户换 API key 就能解决。
- 借鉴 `music_gen` / Suno 类工具：AI 音乐是 provider-backed acquisition，不是 render 逻辑；provider/model/cost/seed 或 prompt 必须进入 provenance。
- 借鉴 `music-gen-usage`：音乐 prompt 必须写清风格、BPM/节奏、情绪/调性、乐器、能量曲线和用途；视频配乐默认必须是 background/underscore、纯音乐、no vocals，避免抢人声。
- 借鉴 `audio_energy`：获取后的音乐还要检查 duration、最佳 offset、是否 loop，而不是简单从 0 秒开始铺满。
- TTS/voice performance 暂不进入 koubo-clip 当前音乐获取层。保留原口播音频是默认路径，AI 旁白以后单独设计。

### 推迟

- 完整 YAML pipeline manifests。
- 完整 Tool registry 和 provider selector system。
- Budget tracker 和 cost reservation。
- Multi-runtime composition choice UI。
- Stage-director skill tree。
- Global style playbook system。

如果 koubo-clip 成长为更广的 production system，这些会有用。它们不是 v0 cleanup loop 所需。

## V0 借鉴总结

最小有效组合是：

- `video-use` 用于 editing craft。
- `easy-video` 用于 CLI + skill packaging。
- `Hermes` 用于 rules、asset boundaries 和 provider/tool separation。
- `OpenMontage` 用于后续 pipeline/checkpoint/schema discipline。

具体到 enrichment：

- `video-use` 给出 render correctness：output-timeline subtitles、cut fades 和 visual self-checks。
- `easy-video` 给出 staged plan-review-render 形态和 safe-area discipline。
- `Hermes` 给出 approval boundary：plan 确认前不要生成 media。
- `OpenMontage` 给出 overlay scene types、timed actions 和 audio ducking 词汇。

不要整体复制任何一个项目。koubo-clip 正确形态是 cleanup-first talking-head editor，带可选 enrichment-plan 层。

## 候选未来规则

只有出现对应实现压力时才创建这些规则：

- `rules/schema-contracts.md`: 引入 JSON schemas 时。
- `rules/asr-validation.md`: ASR adapters 超出 `whisper-cli` 时。
- `rules/visual-enrichment-slot.md`: generated images 或 B-roll 进入正常 workflow 时。
- `rules/source-assets.md`: multi-file ingestion 或 Hermes TaskWorkspace integration 开始时。
- `rules/generated-assets.md`: provider-backed generated media 成为一等 koubo-clip input 时。

在那之前，保持当前 rules 小而明确，并优先原地更新已有文件。
