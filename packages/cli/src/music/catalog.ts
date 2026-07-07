import { listMusicLibraryTracks } from "./library";

export type MusicCatalogProvider = {
  id: "minimax" | "freesound" | "pixabay";
  kind: "ai_generated" | "network_stock";
  available: boolean;
  status: "available" | "missing_key" | "experimental" | "host-managed" | "disabled";
  env?: string;
  models?: string[];
  note: string;
};

export type MusicCatalogArtifact = {
  version: "1.0";
  library: ReturnType<typeof listMusicLibraryTracks> & { track_count: number; total_duration_seconds?: number };
  providers: MusicCatalogProvider[];
};

export function buildMusicCatalog(): MusicCatalogArtifact {
  const library = listMusicLibraryTracks();
  const durations = library.tracks.map((track) => track.duration_seconds).filter((value): value is number => typeof value === "number");
  return {
    version: "1.0",
    library: {
      ...library,
      track_count: library.tracks.length,
      total_duration_seconds: durations.length ? Number(durations.reduce((sum, value) => sum + value, 0).toFixed(3)) : undefined,
    },
    providers: [
      {
        id: "minimax",
        kind: "ai_generated",
        available: Boolean(process.env.MINIMAX_API_KEY),
        status: process.env.MINIMAX_API_KEY ? "available" : "missing_key",
        env: "MINIMAX_API_KEY",
        models: ["music-2.6", "music-2.6-free"],
        note: "AI instrumental music generation; output is decoded to a local asset",
      },
      {
        id: "freesound",
        kind: "network_stock",
        available: Boolean(process.env.FREESOUND_API_KEY),
        status: process.env.FREESOUND_API_KEY ? "available" : "missing_key",
        env: "FREESOUND_API_KEY",
        note: "Creative Commons preview download; license must be reviewed",
      },
      {
        id: "pixabay",
        kind: "network_stock",
        available: true,
        status: "experimental",
        note: "No-key web retrieval for Pixabay Music; experimental and may be blocked by Cloudflare. Pixabay API keys do not unlock music search.",
      },
    ],
  };
}

export function buildPlatformMusicCatalog(): MusicCatalogArtifact {
  return {
    version: "1.0",
    library: {
      library_dir: "host-managed",
      exists: false,
      tracks: [],
      track_count: 0,
    },
    providers: [
      {
        id: "minimax",
        kind: "ai_generated",
        available: false,
        status: "host-managed",
        note: "Platform music capability owns generation, credentials, quota, audit, and provenance",
      },
      {
        id: "freesound",
        kind: "network_stock",
        available: false,
        status: "host-managed",
        note: "Platform connector owns search, download, license review, audit, and provenance",
      },
      {
        id: "pixabay",
        kind: "network_stock",
        available: false,
        status: "host-managed",
        note: "Platform connector owns search, download, license review, audit, and provenance",
      },
    ],
  };
}

export function renderMusicCatalogMarkdown(catalog: MusicCatalogArtifact): string {
  return [
    "# Music Catalog",
    "",
    "## Local Library",
    `- exists: ${catalog.library.exists ? "yes" : "no"}`,
    `- tracks: ${catalog.library.track_count}`,
    ...(catalog.library.tracks.length ? catalog.library.tracks.map((track) => `- ${track.id} duration=${track.duration_seconds ?? "unknown"}s size=${track.size_bytes}`) : ["- none"]),
    "",
    "## Providers",
    ...catalog.providers.map((provider) => `- ${provider.id}: ${provider.status}${provider.env ? ` env=${provider.env}` : ""} - ${provider.note}`),
    "",
  ].join("\n");
}
