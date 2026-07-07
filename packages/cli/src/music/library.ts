import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";

export const MUSIC_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".opus", ".aiff", ".aif"]);

export type MusicLibraryTrack = {
  id: string;
  name: string;
  size_bytes: number;
  duration_seconds?: number;
};

export function musicLibraryDir(): string {
  return resolve(process.env.MUSIC_LIBRARY_DIR || "music_library");
}

export function listMusicLibraryTracks(libraryDir = musicLibraryDir()): { library_dir: string; exists: boolean; tracks: MusicLibraryTrack[] } {
  if (!existsSync(libraryDir)) return { library_dir: libraryDir, exists: false, tracks: [] };
  const files = walk(libraryDir)
    .filter((path) => MUSIC_EXTENSIONS.has(extname(path).toLowerCase()))
    .sort((a, b) => a.localeCompare(b));
  return {
    library_dir: libraryDir,
    exists: true,
    tracks: files.map((path) => ({
      id: basename(path),
      name: basename(path),
      size_bytes: statSync(path).size,
      duration_seconds: probeAudioDuration(path),
    })),
  };
}

export function resolveLibraryTrack(trackName: string, libraryDir = musicLibraryDir()): string {
  const match = walk(libraryDir).find((path) => basename(path) === trackName && MUSIC_EXTENSIONS.has(extname(path).toLowerCase()));
  if (!match) throw new Error(`music library track not found: ${trackName}`);
  return match;
}

export function probeAudioDuration(path: string): number | undefined {
  const result = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path], {
    encoding: "utf8",
    timeout: 15_000,
  });
  if (result.status !== 0) return undefined;
  const duration = Number(result.stdout.trim());
  return Number.isFinite(duration) ? Number(duration.toFixed(3)) : undefined;
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : entry.isFile() ? [path] : [];
  });
}
