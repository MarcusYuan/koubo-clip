import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { probeAudioDuration } from "./library";

export type MusicEnergySummary = {
  duration_seconds?: number;
  recommended_offset_seconds: number;
  needs_loop: boolean;
  reason: string;
};

export function analyzeMusicEnergy(path: string, targetDuration?: number): MusicEnergySummary {
  if (!existsSync(path)) throw new Error(`music file not found: ${path}`);
  const duration = probeAudioDuration(path);
  if (!duration) return { recommended_offset_seconds: 0, needs_loop: false, reason: "duration unavailable" };

  const result = spawnSync("ffmpeg", ["-i", path, "-af", "ebur128", "-f", "null", "-"], { encoding: "utf8", timeout: 120_000 });
  if (result.status !== 0) {
    return { duration_seconds: duration, recommended_offset_seconds: 0, needs_loop: targetDuration ? duration < targetDuration : false, reason: "ebur128 unavailable" };
  }

  const points = [...result.stderr.matchAll(/t:\s*([\d.]+)\s+.*?M:\s*(-?[\d.]+)/g)]
    .map((match) => ({ t: Number(match[1]), lufs: Number(match[2]) }))
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.lufs) && point.lufs > -120);
  if (!points.length) return { duration_seconds: duration, recommended_offset_seconds: 0, needs_loop: targetDuration ? duration < targetDuration : false, reason: "no active loudness points" };

  const seconds = Math.max(1, Math.ceil(duration));
  const perSecond = Array.from({ length: seconds }, (_, second) => {
    const values = points.filter((point) => Math.floor(point.t) === second).map((point) => point.lufs);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : -120;
  });

  let offset = perSecond.findIndex((lufs) => lufs > -40);
  let reason = `first active second above -40 LUFS`;
  if (offset < 0) {
    offset = 0;
    reason = "no active threshold crossing";
  }

  if (targetDuration && targetDuration < duration) {
    const windowSize = Math.max(1, Math.floor(targetDuration));
    let bestScore = -Infinity;
    let bestStart = 0;
    for (let start = 0; start <= perSecond.length - windowSize; start += 1) {
      const window = perSecond.slice(start, start + windowSize).map((value) => (value > -120 ? value : -60));
      const score = window.reduce((sum, value) => sum + value, 0) / window.length;
      if (score > bestScore) {
        bestScore = score;
        bestStart = start;
      }
    }
    offset = bestStart;
    reason = `best ${windowSize}s loudness window`;
  }

  return {
    duration_seconds: duration,
    recommended_offset_seconds: offset,
    needs_loop: targetDuration ? duration - offset < targetDuration : false,
    reason,
  };
}
