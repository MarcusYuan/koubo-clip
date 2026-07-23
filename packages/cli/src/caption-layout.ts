export type CaptionPlacementPreset = "auto" | "center_lower" | "bottom_safe";
export type CaptionSizePreset = "small" | "medium" | "large";
export type ResolvedCaptionPlacement = Exclude<CaptionPlacementPreset, "auto">;

export type CaptionLayoutIntent = {
  placement: CaptionPlacementPreset;
  size: CaptionSizePreset;
};

export type ResolvedCaptionLayout = {
  placement: ResolvedCaptionPlacement;
  size: CaptionSizePreset;
  anchor_x_ratio: number;
  anchor_y_ratio: number;
  font_size_px: number;
};

export type CaptionCue = { start: number; end: number; text: string };

export const CAPTION_RAIL_MAX_WIDTH_RATIO = 0.84;
export const CAPTION_MAX_LINES = 2;

const CAPTION_HORIZONTAL_PADDING_PX = 40;
const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export const defaultCaptionLayoutIntent = (): CaptionLayoutIntent => ({ placement: "auto", size: "medium" });

export function resolveCaptionLayout(input: {
  width: number;
  height: number;
  source_mode: "talking_head_avatar" | "screen_recording" | "mixed";
  intent?: Partial<CaptionLayoutIntent>;
}): ResolvedCaptionLayout {
  const { width, height, source_mode } = input;
  if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0) {
    throw new Error("caption layout requires positive integer canvas dimensions");
  }
  const intent = { ...defaultCaptionLayoutIntent(), ...input.intent };
  if (!isCaptionPlacementPreset(intent.placement) || !isCaptionSizePreset(intent.size)) throw new Error("caption layout preset is invalid");

  const tallPortrait = height / width >= 1.5;
  const portrait = height > width;
  const placement: ResolvedCaptionPlacement = intent.placement === "auto" ? portrait ? "center_lower" : "bottom_safe" : intent.placement;
  const anchor_y_ratio = placement === "center_lower"
    ? tallPortrait ? 0.7 : portrait ? 0.76 : 0.72
    : portrait ? 0.82 : 0.9;
  const sizeScale = intent.size === "small" ? 0.85 : intent.size === "large" ? 1.15 : 1;
  const sourceScale = source_mode === "talking_head_avatar" ? 1 : 0.9;
  const medium = clamp(Math.min(width, height) * 0.043, 24, 64);
  const resolved: ResolvedCaptionLayout = {
    placement,
    size: intent.size,
    anchor_x_ratio: 0.5,
    anchor_y_ratio,
    font_size_px: Math.max(1, Math.round(medium * sizeScale * sourceScale)),
  };
  assertResolvedCaptionLayout(resolved);
  return resolved;
}

export function assertResolvedCaptionLayout(value: ResolvedCaptionLayout): void {
  if (value.placement !== "center_lower" && value.placement !== "bottom_safe") throw new Error("caption placement must be resolved");
  if (!isCaptionSizePreset(value.size)) throw new Error("caption size preset is invalid");
  if (!Number.isFinite(value.anchor_x_ratio) || value.anchor_x_ratio < 0 || value.anchor_x_ratio > 1) throw new Error("caption anchor_x_ratio is outside the canvas");
  if (!Number.isFinite(value.anchor_y_ratio) || value.anchor_y_ratio < 0 || value.anchor_y_ratio > 1) throw new Error("caption anchor_y_ratio is outside the canvas");
  const maxY = value.placement === "center_lower" ? 0.82 : 0.9;
  if (value.anchor_y_ratio > maxY) throw new Error(`caption ${value.placement} exceeds its safe area`);
  if (!Number.isSafeInteger(value.font_size_px) || value.font_size_px <= 0) throw new Error("caption font_size_px must be a positive integer");
}

export function captionLayoutsEqual(left: ResolvedCaptionLayout, right: ResolvedCaptionLayout): boolean {
  return left.placement === right.placement
    && left.size === right.size
    && left.anchor_x_ratio === right.anchor_x_ratio
    && left.anchor_y_ratio === right.anchor_y_ratio
    && left.font_size_px === right.font_size_px;
}

export function layoutCaptionCues(
  cues: readonly CaptionCue[],
  layout: ResolvedCaptionLayout,
  width: number,
  height: number,
): CaptionCue[] {
  const graphemesPerLine = captionGraphemesPerLine(layout, width, height);
  const capacity = graphemesPerLine * CAPTION_MAX_LINES;
  return cues.flatMap((cue) => layoutCaptionCue(cue, graphemesPerLine, capacity));
}

export function assertCaptionCuesFitLayout(
  cues: readonly CaptionCue[],
  layout: ResolvedCaptionLayout,
  width: number,
  height: number,
): void {
  const graphemesPerLine = captionGraphemesPerLine(layout, width, height);
  for (const cue of cues) {
    if (!Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.start < 0 || cue.end <= cue.start) {
      throw new Error("caption cue timing is invalid");
    }
    const lines = cue.text.split(/\r?\n/);
    if (lines.length > CAPTION_MAX_LINES || lines.some((line) => captionGraphemeCount(line) > graphemesPerLine)) {
      throw new Error("caption cue exceeds the frozen two-line safe layout");
    }
  }
}

export function captionGraphemeCount(text: string): number {
  return graphemes(text).length;
}

export function isolatedTailCaptionWarning(cues: readonly CaptionCue[], expectedDurationSeconds: number): string | undefined {
  if (cues.length < 2 || !Number.isFinite(expectedDurationSeconds) || expectedDurationSeconds <= 0) return undefined;
  const tail = cues.at(-1)!;
  const previous = cues.at(-2)!;
  const text = tail.text.trim();
  const count = captionGraphemeCount(text);
  if (
    count < 1 || count > 3 ||
    tail.end - tail.start > 0.75 ||
    tail.start - previous.end > 0.15 ||
    expectedDurationSeconds - tail.end > 0.25
  ) return undefined;
  return `caption tail cue requires transcript review: cue_index=${cues.length} start=${tail.start.toFixed(3)}s end=${tail.end.toFixed(3)}s text=${JSON.stringify(text)}; review transcript/ASR segmentation before accepting the final edit`;
}

export function renderAssCaptionFile(
  cues: readonly CaptionCue[],
  layout: ResolvedCaptionLayout,
  width: number,
  height: number,
): string {
  assertResolvedCaptionLayout(layout);
  if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0) throw new Error("ASS captions require positive integer canvas dimensions");
  const x = Math.round(width * layout.anchor_x_ratio);
  const y = Math.round(height * layout.anchor_y_ratio);
  const events = cues.map((cue) => {
    if (!Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.start < 0 || cue.end <= cue.start) throw new Error("ASS caption cue timing is invalid");
    return `Dialogue: 0,${assTimestamp(cue.start)},${assTimestamp(cue.end)},Default,,0,0,0,,{\\an5\\pos(${x},${y})}${escapeAssText(cue.text)}`;
  });
  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "WrapStyle: 2",
    "",
    "[V4+ Styles]",
    "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding",
    `Style: Default,Arial,${layout.font_size_px},&H00FFFFFF,&H00FFFFFF,&H66000000,&H99000000,-1,0,0,0,100,100,0,0,3,1,0,5,0,0,0,1`,
    "",
    "[Events]",
    "Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text",
    ...events,
    "",
  ].join("\n");
}

export function isCaptionPlacementPreset(value: unknown): value is CaptionPlacementPreset {
  return value === "auto" || value === "center_lower" || value === "bottom_safe";
}

export function isCaptionSizePreset(value: unknown): value is CaptionSizePreset {
  return value === "small" || value === "medium" || value === "large";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function assTimestamp(seconds: number): string {
  const centiseconds = Math.max(0, Math.round(seconds * 100));
  const hours = Math.floor(centiseconds / 360000);
  const minutes = Math.floor((centiseconds % 360000) / 6000);
  const wholeSeconds = Math.floor((centiseconds % 6000) / 100);
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}.${String(centiseconds % 100).padStart(2, "0")}`;
}

function escapeAssText(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("{", "\\{").replaceAll("}", "\\}").replace(/\r\n?|\n/g, "\\N");
}

function layoutCaptionCue(cue: CaptionCue, graphemesPerLine: number, capacity: number): CaptionCue[] {
  if (!Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.start < 0 || cue.end <= cue.start) {
    throw new Error("caption cue timing is invalid");
  }
  const source = graphemes(cue.text);
  if (source.length === 0) throw new Error("caption cue text is empty");
  const chunks: Array<{ source: string; display: string; count: number }> = [];
  let cursor = 0;
  while (cursor < source.length) {
    const remaining = source.slice(cursor);
    const cut = preferredBreak(remaining, capacity);
    const chunk = remaining.slice(0, cut);
    const lines: string[] = [];
    let lineCursor = 0;
    while (lineCursor < chunk.length) {
      const lineCut = preferredBreak(chunk.slice(lineCursor), graphemesPerLine);
      lines.push(chunk.slice(lineCursor, lineCursor + lineCut).join(""));
      lineCursor += lineCut;
    }
    if (lines.length > CAPTION_MAX_LINES) throw new Error("caption cue cannot be contained within the safe line limit");
    chunks.push({ source: chunk.join(""), display: joinCaptionLines(lines), count: chunk.length });
    cursor += cut;
  }
  if (chunks.map((chunk) => chunk.source).join("") !== cue.text) throw new Error("caption cue layout changed the source text");
  let consumed = 0;
  return chunks.map((chunk, index) => {
    const start = index === 0 ? cue.start : cue.start + (cue.end - cue.start) * consumed / source.length;
    consumed += chunk.count;
    const end = index === chunks.length - 1 ? cue.end : cue.start + (cue.end - cue.start) * consumed / source.length;
    return { start, end, text: chunk.display };
  });
}

function graphemes(text: string): string[] {
  return Array.from(graphemeSegmenter.segment(text), (part) => part.segment);
}

function captionGraphemesPerLine(layout: ResolvedCaptionLayout, width: number, height: number): number {
  assertResolvedCaptionLayout(layout);
  if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0) {
    throw new Error("caption cues require positive integer canvas dimensions");
  }
  const usableWidth = Math.max(layout.font_size_px, Math.floor(width * CAPTION_RAIL_MAX_WIDTH_RATIO) - CAPTION_HORIZONTAL_PADDING_PX);
  return Math.max(1, Math.floor(usableWidth / layout.font_size_px));
}

function preferredBreak(input: readonly string[], limit: number): number {
  const maximum = Math.min(input.length, Math.max(1, limit));
  if (maximum === input.length) return maximum;
  const minimum = Math.max(1, Math.floor(maximum * 0.6));
  for (let index = maximum - 1; index >= minimum - 1; index -= 1) {
    if (/[\s，。！？；：、,.!?;:]/u.test(input[index]!)) return index + 1;
  }
  return maximum > 1 && /^[，。！？；：、,.!?;:]$/u.test(input[maximum]!) ? maximum - 1 : maximum;
}

function joinCaptionLines(lines: readonly string[]): string {
  return lines.reduce((output, line, index) => {
    if (index === 0) return line;
    return `${output}${/[\r\n]$/.test(output) ? "" : "\n"}${line}`;
  }, "");
}
