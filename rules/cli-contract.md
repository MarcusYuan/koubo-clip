# CLI 合同

## 目的

本规则定义 koubo-clip CLI 负责什么。CLI 是 command behavior、media probing、candidate detection、validation、canonical output layout 和 rendering 的硬合同。

## CLI 负责

- `koubo-clip doctor` 环境检查。
- Project creation 和 canonical output directories。
- FFmpeg/ffprobe probing 和 media metadata。
- ASR mode handling：`auto`、`off` 和 `external`。
- 默认线上 ASR adapter：Cloudflare Whisper；显式离线兜底：`whisper-cli`。
- Transcript ingestion 和 normalization，不受 transcription backend 影响。
- Transcript timing-granularity labeling：`word`、`segment` 或 `text-only`。
- Silence、pause、filler、false-start 和 repeat-candidate detection。
- 给 agent review 使用的 machine-readable candidate output。
- Review package generation，包含 original transcript、proposed cuts、timestamps 和 strategy reasons。
- Production proposal validation 和 markdown 物化，作为用户确认前的方案面。
- Edit-plan 和 EDL schema validation。
- Semantic Focus Planner 的 artifact 物化与校验：focus-candidates、focus-frames、focus-grounding 和 focus-review。
- Music Acquisition：music-catalog、music-request validation、local library import、network/AI music acquisition、provenance、review artifacts 和 asset-manifest 写入。
- Visual Acquisition：visual-catalog、visual-request validation、Iconify 搜索和 SVG 下载、Lordicon/Lottie/shadcn/21st handoff 候选导入、SVG sanitization、runtime dependency provenance、review artifacts 和 asset-manifest 写入。
- Enrichment-plan、storyboard、storyboard QA checks 和 asset-manifest validation。
- Vendored HyperFrames element catalog、registry resolver 和 safe installer。
- 随 npm package 或内部二进制包作为 sidecar 分发的 HyperFrames resources：registry、HTML fragments、caption themes、字体、SFX、runtime adapters 和示例资源。
- 从 transcript timings 生成 subtitles。
- Deterministic render assembly：cuts、fades、embedded captions、registry elements、SFX、music mix，以及 v1.1 兼容 card templates。
- 支持 visual enrichment 的 HyperFrames single-composition recut rendering。
- Artifact inspection 和 report generation。
- 通过 JSON support commands 向 skills 和 agents 暴露 CLI-owned facts。

## CLI 不负责

- 用户对话、定位或 creative briefing。
- 读取、运行或解释 agent skill。CLI 不依赖 `skills/koubo-clip` 或任何上游 `SKILL.md` 才能执行。
- 在 confidence 低时判断哪个 repeated take 更好。
- 由 agent platform 处理的 image generation 或复杂 B-roll creative generation providers。
- 直接运行任意 MCP 生成的 React、HTML、JS、GSAP 或第三方 CDN。shadcn/21st 等 host/MCP 输出必须先转成候选 metadata 和本地静态导出，再由 CLI 校验/导入。
- Remotion、provider routing 或任意 custom animation DSLs。
- Codex thread IDs、Claude projects、Hermes tools、approval UIs 或 tenant IDs 等 host-specific concepts。
- 把 custom one-off HTML、GSAP、Remotion 或 FFmpeg snippets 作为正常用户工作流。

## 规划命令面

具体 flags 可以演进，但 command families 应保持稳定：

```bash
koubo-clip doctor
koubo-clip project create <video>
koubo-clip project explore <project> --asr auto
koubo-clip project review <project>
koubo-clip project proposal <project>
koubo-clip project element-catalog <project>
koubo-clip project focus-candidates <project>
koubo-clip project focus-frames <project>
koubo-clip project focus-grounding <project>
koubo-clip project music-catalog <project>
koubo-clip project music-acquire <project>
koubo-clip project music-review <project>
koubo-clip project visual-catalog <project>
koubo-clip project visual-search <project>
koubo-clip project visual-acquire <project>
koubo-clip project visual-review <project>
koubo-clip project enrich-plan <project>
koubo-clip project render <project>
koubo-clip project inspect <project>
koubo-clip generate <video>
```

Support commands 应优先提供 `--json`，让 agents 不需要抓取 logs。`project proposal` 校验 `production-proposal.json` 并生成用户确认 markdown，但不生成执行 artifacts；`project element-catalog` 返回完整 vendored HyperFrames 元素目录；`project focus-candidates` 校验 normalized semantic intents、candidate element types 和所需证据；`project focus-frames` 返回 frame evidence 列表；`project focus-grounding` 返回 coordinates 与 evidence 的绑定校验结果；`project focus-review` 返回 `proposed_elements[]`；`project enrich-plan` 返回 `source_mode`、`element_usage[]`、`qa_checks[]` 和 `warnings[]`；`project inspect` 在已知时返回 `source_mode`、`element_usage[]`、`inspection_checks[]`，并为 visual cards/elements 返回兼容的 `inspection_frames[]`。

`project element-catalog` 的每个元素应包含 CLI-owned adapter profile，并返回按 source mode 分组的 `recommendations`，以及按 `source_mode × presentation_intent` 分组的 `purpose_recommendations`。Skills 应优先使用 purpose recommendations；只有当用户用途不清楚时才退回 source-mode recommendations，不能在完整 catalog 中盲选。

`--asr-provider whisper-cli` 只用于离线测试或调试。`project music-catalog` 暴露本地曲库和 provider 状态；`project music-acquire` 只能根据 `music-request.json` 获取或生成音乐，并把结果落成 project-local asset；`project music-review` 生成审查面。Music provider calls 只允许在 acquisition commands 中发生，`project render` 禁止联网、禁止读取 API key、禁止消费 provider URL。当前 music commands 不生成 TTS 或旁白，只处理 background music。

`project visual-catalog` 暴露 CLI-owned Iconify/Lordicon、Lottie/dotLottie import、shadcn/21st handoff 能力和 HyperFrames CDN runtime allowlist；`project visual-search` 校验 `visual-request.json` 并执行 CLI-owned Iconify/Lordicon 搜索或合并 host/MCP handoff 候选；`project visual-acquire` 下载/导入已确认候选，写入 `assets/icons|lottie|visuals|images`、`visual-acquisition.json` 和 `asset-manifest.json`；`project visual-review` 生成审查面。Visual provider calls 只允许在 visual acquisition commands 或 host/MCP handoff 中发生，`project render` 禁止 provider search。

## 合同原则

- CLI 可以产出 candidates；但不能假装不确定的 semantic edits 是确定的。
- 用户的原始业务关键词不是 contract key；CLI 和 skills 必须先归一化成固定 semantic intent，再进入 element selection 和 grounding。
- `production-proposal.json` 是确认层，不是 render source of truth。它可以引用 `review-package` candidate IDs 和 source facts，但不能包含无证据坐标、未确认 asset path、provider URL、最终 output timeline，且不能替代 `edit-plan`、`focus-*`、`music-*`、`asset-manifest` 或 `enrichment-plan`。
- Text-only transcripts 不能用于 precise cuts。
- Chinese word-level ASR 必须视为不可信，直到 validation 证明该文件 timing 精确。
- 可 render 的 EDL 必须先校验再 render。
- Enrichment elements/cards/music 必须在 final render 前按 post-cut output timeline 校验。
- `enrichment-plan.json` v1.2 包含 `profile` 和 `elements[]`；`profile.source_mode` 控制 `talking_head_avatar`、`screen_recording` 或 `mixed` 默认值。`elements[].element_type` 可以是 `visual_asset`，但必须引用已通过 visual acquisition/review 或 manifest provenance 校验的本地 asset。v1.1 `captions/cards/music` 与 legacy v1.0 `slots[]` 仅作为兼容输入。
- Elements/cards 可以包含 normalized `target_rect` 和 `anchor_point`；CLI 校验坐标并保留到 `storyboard.json`。对 screen recordings，只要使用这些字段，就必须同时提供 `coordinate_source_frame` 和可追溯的 frame evidence；没有 grounding 就失败。
- `storyboard.json` 由 CLI 从已校验 artifacts 物化；skills 不能手写它作为事实来源。`storyboard.json.qa_checks[]` 同时是合成检查清单，inspect 必须优先按它抽帧和报告；不要新增独立 `inspection-plan.json`。
- 缺失 HyperFrames 是需要 registry/caption visual recut plans 的 blocker；不要静默替换 renderer 或生成假 final。
- Pure music/SFX-only enrichment 可以不依赖 HyperFrames，直接使用 FFmpeg。
- Music acquisition 可以联网；render assembly 不可以联网。MiniMax、Freesound、Pixabay 等 provider output 必须先下载或解码为 `assets/music/*`，再通过 `asset-manifest.json` 和 `enrichment-plan.music[]` 使用。
- Visual acquisition 的主路径是互联网语义检索。CLI 首版拥有 Iconify 搜索/下载和本地/URL/handoff 导入；agent/platform 负责更复杂的 MCP/host candidate sourcing。所有视觉资产必须在当前 project 中形成可检查的 local path 或未来 stable workspace ref，并记录 provider/source/license/provenance；不要把长期本地 UI 库当成前提。
- Agents 不能向 CLI 传入任意 HTML/JS/GSAP。CLI 拥有 vendored registry、safe installer、caption resources、SFX manifest 和 v1.1 兼容 card fragments；这些是 CLI resources，不是对外 agent skills。
- 显式 v1.2 elements 必须满足 adapter 要求：semantic registry blocks 提供必填 params；screen focus 提供 `target_rect`；anchored component/callout 提供 `anchor_point`；需要图片的元素提供本地 `asset_id`。
- Generated HyperFrames workspaces 只能加载 CLI-owned catalog 声明的 runtime dependencies。允许直接从白名单 CDN 加载固定版本 scripts/styles，例如 `gsap@3.14.2`；Google Fonts family CSS 是首个明确记录的 versionless exception。
- Lottie JSON 和 `.lottie` 只能通过 CLI allowlist runtime 渲染：`bodymovin/lottie-web@5.12.2` 和 `@lottiefiles/dotlottie-web@0.76.0`。动画必须可 seek，不能依赖 autoplay/play 驱动 render-critical motion。
- CLI 必须校验 CDN domain、package 和 version，并在 `storyboard.json`、`project inspect` 和 `report.md` 中暴露 dependency summary。白名单 CDN domain 不等于任意 package 被允许。
- Screen-recording templates 必须默认 transparent overlays，不能用大块 opaque cards 遮住 source UI text。
- Screen-recording focus planning 必须先通过 `focus-candidates`、`focus-frames` 和 `focus-grounding`，再进入 `enrich-plan`；坐标没有 frame evidence 就算无效。
- Screen-recording risk warnings 是 advisory；invalid timing、missing assets 和 unsafe paths 仍然失败。
- Asset paths 必须是 project-relative local paths；拒绝 URLs、absolute paths 和 `..`。
- 所有看起来 destructive 的 edits 在 render 前都是虚拟的；永不修改 source video。
- Output artifacts 必须可恢复、可检查。
- 如果 skill 需要 CLI-owned timing、layout 或 schema facts，应通过 CLI JSON 暴露，而不是复制 constants 到 skills。
