declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  execPath: string;
  version: string;
  cwd(): string;
  chdir(path: string): void;
  exitCode?: number;
};

interface ImportMeta {
  main?: boolean;
}

declare const Bun: {
  version: string;
};

declare const Buffer: {
  from(input: string | ArrayBuffer | Uint8Array, encoding?: string): Uint8Array & { toString(encoding?: string): string };
};

declare function fetch(
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
): Promise<{ ok: boolean; status: number; text(): Promise<string>; json(): Promise<unknown>; arrayBuffer(): Promise<ArrayBuffer> }>;

declare module "bun:test" {
  export const test: (name: string, fn: () => void) => void;
  export const expect: (actual: unknown) => {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toContain(expected: unknown): void;
    toThrow(expected?: string): void;
  };
}

declare module "node:child_process" {
  export function spawnSync(
    command: string,
    args?: string[],
    options?: { stdio?: "ignore"; encoding?: string; cwd?: string; timeout?: number },
  ): { status: number | null; stdout: string; stderr: string };
}

declare module "node:fs" {
  export function cpSync(from: string, to: string, options?: { recursive?: boolean }): void;
  export function copyFileSync(from: string, to: string): void;
  export function existsSync(path: string): boolean;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
  export function readdirSync(path: string): string[];
  export function readdirSync(path: string, options: { withFileTypes: true }): Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
  export function readFileSync(path: string): Uint8Array;
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
  export function statSync(path: string): { isDirectory(): boolean; isFile(): boolean; size: number };
  export function unlinkSync(path: string): void;
  export function writeFileSync(path: string, data: string | Uint8Array): void;
  export function mkdtempSync(prefix: string): string;
}

declare module "node:crypto" {
  export function createHash(algorithm: string): { update(data: string | Uint8Array): { digest(encoding: "hex"): string } };
}

declare module "node:buffer" {
  export const Buffer: {
    from(input: string | ArrayBuffer | Uint8Array, encoding?: string): Uint8Array & { toString(encoding?: string): string };
  };
}

declare module "node:os" {
  export function homedir(): string;
  export function tmpdir(): string;
}

declare module "node:path" {
  export function basename(path: string, suffix?: string): string;
  export function dirname(path: string): string;
  export function extname(path: string): string;
  export function join(...parts: string[]): string;
  export function relative(from: string, to: string): string;
  export function resolve(...parts: string[]): string;
  export const sep: string;
}

declare module "node:url" {
  export function fileURLToPath(url: string | URL): string;
}
