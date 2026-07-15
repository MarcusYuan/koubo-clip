# 按素材模式增强实现计划

## 目标

修正当前 enrichment 的场景错配：talking-head avatar 素材和 screen recordings 需要不同的视觉规则。

当前实现已经从本计划的 v1.1 card 默认值推进到 v1.2 element 合同：`source_mode` 仍然是分支入口，但 screen-recording 的视觉表达优先通过 `elements[]` 选择 HyperFrames registry block/component、SFX 和 caption identity。下文保留 card 术语的位置表示历史兼容路径。

最小有效改动是新增一个 profile 字段：

```json
{
  "profile": {
    "source_mode": "talking_head_avatar"
  }
}
```

接受值：

- `talking_head_avatar`: 主要是单个 speaker 或 avatar，几乎没有需要保留的 source-screen 细节。
- `screen_recording`: UI、desktop、code、browser、terminal 或 app workflow footage，source pixels 本身承载解释。
- `mixed`: 多种素材类型，或分类不确定。默认使用 screen-safe 行为，除非 card 明确选择更完整的包装方式。

## 产品规则

`talking_head_avatar` 使用完整包装。

- speaker 可以被重构成 `stack`、`split` 或 `pip`。
- Cards 可以使用 opaque whiteboard、audit 或 minimal panels。
- Image generation 可用于 cover art、abstract concept visuals、B-roll illustrations 和 brand/icon imagery。
- Music 可以默认建议，但必须保持低音量，并 duck 在 speech 下方。

`screen_recording` 使用透明引导。

- source video 保持可读，并尽量 full-frame。
- 优先使用 transparent overlays：highlight boxes、arrows、step labels、keystroke badges、outline focus、small lower thirds 和 caption rail。
- 避免 opaque cards 遮住 UI。Full cards 只允许用于 intro、outro、transition、recap 或用户批准的 pause/interstitial。
- 优先使用 source screenshots、crops、SVG flowcharts 和 deterministic labels，而不是 generated images。
- Music 默认关闭。只在 short-form packaging 或明确用户意图下使用。

`mixed` 保持保守。

- 默认使用 `screen_recording` placement。
- 只有在明确 avatar/talking-head ranges 或 intentional interstitials 上，才允许 `talking_head_avatar` card 行为。

## 实现计划

1. 扩展 artifact parser。
   - 添加可选 `profile.source_mode`。
   - legacy 和缺失值默认到 `talking_head_avatar`，保证兼容。
   - 拒绝未知值。

2. 按 source mode 归一化 card 默认值。
   - `talking_head_avatar`: 保留当前 `stack + whiteboard + clean` 默认。
   - `screen_recording`: 默认 `overlay + minimal + clean`，使用透明 zones。
   - `mixed`: 默认 `overlay + minimal + clean`。

3. 增加 screen-safe template 行为。
   - 保留现有 card renderer 作为 talking-head packaging 路径。
   - 为 `screen_recording` 增加小型 transparent overlay 路径：callout label、highlight box、arrow 和 lower-third。
   - 对 `screen_recording`，除非 card 是 intro/outro/full-frame，否则 `image` 和 `key_point` cards 透明化。

4. 更新 validation。
   - 对 `screen_recording`，为普通 UI footage 中的大块 opaque cards warning 或 reject。
   - 保持 asset path validation 不变：只能是 project-relative local paths。
   - 保持 music validation 不变，但 skills 对 screen recordings 默认关闭 music。
   - 从 `project enrich-plan` 返回 `source_mode` 和 `warnings[]`。

5. 更新 skill workflow。
   - `explore` 后，从 sampled frames 和 transcript context 分类 source mode。
   - 在 enrichment plan 中展示 source-mode decision。
   - 解释为什么包含 generated images 或 music，或者为什么跳过它们。

6. 增加 visual inspection 输出。
   - `project inspect` 只读取 current `render-result.json` 指定的 canonical output。
   - 将每个 visual card 的检查帧抽取到 `.inspection/<render-fingerprint-prefix>/`，避免旧 render 帧混入当前检查。
   - 持久化绑定 render result fingerprint 的 `inspection.json`，并在命令输出中包含 `source_mode` 和 `inspection_frames[]`，让 agent 能验证 UI readability 和 caption safety。

7. 真实视频验收测试。
   - 重新运行 `/Users/yuanpeng/Downloads/0507 (1).mp4`。
   - 期望模式：`screen_recording`。
   - 期望结果：transparent annotations、readable UI、readable anchor captions，没有大块 whiteboard panels 覆盖屏幕。

## 暂时跳过

- 不做自动视觉分类器。
- 不引入 Remotion。
- 不允许任意 HTML/GSAP input。
- 不在 CLI 中做 image 或 music provider system。
- 不做 matting 或 text-behind-person。
