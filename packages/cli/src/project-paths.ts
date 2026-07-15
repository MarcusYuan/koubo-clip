import * as nodeFs from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

const fsRuntime = nodeFs as unknown as {
  lstatSync(path: string): unknown;
  realpathSync(path: string): string;
};

/**
 * Resolve a project-owned input only after both its lexical path and its real
 * filesystem target are proven to remain inside the project root.
 */
export function resolveExistingProjectPath(projectPath: string, projectRelativePath: string, label = "project input"): string {
  const { root, candidate } = resolveLexicalProjectPath(projectPath, projectRelativePath, label);
  const realRoot = realpath(root, `${label} project root is unavailable`);
  const realCandidate = realpath(candidate, `${label} is missing or has an invalid symlink`);
  assertContained(realRoot, realCandidate, `${label} resolves outside the project`);
  return realCandidate;
}

/**
 * Resolve a project-owned output without requiring the final file to exist.
 * The nearest existing path entry is resolved so symlinked (including broken
 * symlink) parents cannot redirect a later mkdir/write/rename outside root.
 */
export function resolveProjectOutputPath(projectPath: string, projectRelativePath: string, label = "project output"): string {
  const { root, candidate } = resolveLexicalProjectPath(projectPath, projectRelativePath, label);
  const realRoot = realpath(root, `${label} project root is unavailable`);
  const existingAncestor = nearestExistingEntry(candidate, root);
  const realAncestor = realpath(existingAncestor, `${label} has an invalid symlink`);
  assertContained(realRoot, realAncestor, `${label} resolves outside the project`);
  return candidate;
}

function resolveLexicalProjectPath(projectPath: string, projectRelativePath: string, label: string): { root: string; candidate: string } {
  if (!projectRelativePath) throw new Error(`${label} must be project-relative`);
  const root = resolve(projectPath);
  const candidate = resolve(root, projectRelativePath);
  // Internal callers may already hold a realpath (for example macOS resolves
  // /var to /private/var). Relative contract paths must still be lexically
  // contained; absolute runtime paths are decided by the realpath check.
  if (!isAbsolutePath(projectRelativePath)) assertContained(root, candidate, `${label} escapes the project`);
  return { root, candidate };
}

function nearestExistingEntry(candidate: string, root: string): string {
  let current = candidate;
  for (;;) {
    if (pathEntryExists(current)) return current;
    if (current === root) return root;
    const parent = dirname(current);
    if (parent === current) return root;
    current = parent;
  }
}

function pathEntryExists(path: string): boolean {
  try {
    fsRuntime.lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

function realpath(path: string, message: string): string {
  try {
    return fsRuntime.realpathSync(path);
  } catch {
    throw new Error(message);
  }
}

function assertContained(root: string, candidate: string, message: string): void {
  const fromRoot = relative(resolve(root), resolve(candidate));
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || fromRoot.startsWith(sep) || /^[a-z]:[\\/]/i.test(fromRoot)) {
    throw new Error(message);
  }
}

function isAbsolutePath(path: string): boolean {
  return path.startsWith(sep) || /^[a-z]:[\\/]/i.test(path);
}
