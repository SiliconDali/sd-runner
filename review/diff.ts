/** Which version of a file a review comment anchors to, in the pull request API's terms. */
export type Side = "LEFT" | "RIGHT";

/** The lines a unified diff shows, per file and side: the only lines an inline comment may anchor to. */
export interface DiffIndex {
  /** Whether `line` of `path` appears in a hunk on `side`. */
  has(path: string, line: number, side: Side): boolean;
  /** Every file the diff touches, in diff order, by its new path (old path for a deletion). */
  paths(): string[];
}

interface FileLines {
  readonly LEFT: Set<number>;
  readonly RIGHT: Set<number>;
}

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
const HEADER = /^diff --git a\/(.+) b\/(.+)$/;

/**
 * Index a unified diff (`git diff`, three lines of context by default) by the
 * lines each hunk shows. Right side: added and context lines, numbered in the
 * new file. Left side: deleted and context lines, numbered in the old file.
 * These are the lines the pull request review API accepts as anchors.
 */
export function parseDiff(diff: string): DiffIndex {
  const files = new Map<string, FileLines>();
  let current: FileLines | undefined;
  let currentPath = "";
  let oldPath: string | undefined;
  let oldLine = 0;
  let newLine = 0;
  let oldLeft = 0;
  let newLeft = 0;

  const open = (path: string) => {
    const existing = files.get(path);
    if (existing) return existing;
    const created: FileLines = { LEFT: new Set(), RIGHT: new Set() };
    files.set(path, created);
    return created;
  };

  // `+++` names the file more reliably than the `diff --git` header, whose
  // split is a guess when a path contains " b/".
  const rename = (from: string, to: string) => {
    if (from === to || !current) return;
    files.delete(from);
    files.set(to, current);
    currentPath = to;
  };

  for (const line of diff.split("\n")) {
    if (oldLeft > 0 || newLeft > 0) {
      if (line.startsWith("\\")) continue;
      const mark = line[0];
      if (mark === "+") {
        current?.RIGHT.add(newLine++);
        newLeft--;
        continue;
      }
      if (mark === "-") {
        current?.LEFT.add(oldLine++);
        oldLeft--;
        continue;
      }
      if (mark === " " || line === "") {
        current?.LEFT.add(oldLine++);
        current?.RIGHT.add(newLine++);
        oldLeft--;
        newLeft--;
        continue;
      }
      // A line that is not hunk content ends the hunk early.
      oldLeft = 0;
      newLeft = 0;
    }

    const header = HEADER.exec(line);
    if (header) {
      oldPath = unquote(header[1]!);
      currentPath = unquote(header[2]!);
      current = open(currentPath);
      continue;
    }
    if (!current) continue;

    if (line.startsWith("--- ")) {
      const path = line.slice(4);
      if (path !== "/dev/null") oldPath = stripPrefix(unquote(path), "a/");
      continue;
    }
    if (line.startsWith("+++ ")) {
      const path = line.slice(4);
      rename(currentPath, path === "/dev/null" ? oldPath ?? "" : stripPrefix(unquote(path), "b/"));
      continue;
    }

    const hunk = HUNK.exec(line);
    if (hunk) {
      oldLine = Number(hunk[1]);
      oldLeft = hunk[2] === undefined ? 1 : Number(hunk[2]);
      newLine = Number(hunk[3]);
      newLeft = hunk[4] === undefined ? 1 : Number(hunk[4]);
    }
  }

  return {
    has: (path, line, side) => files.get(path)?.[side].has(line) ?? false,
    paths: () => [...files.keys()],
  };
}

function unquote(path: string): string {
  return path.length > 1 && path.startsWith('"') && path.endsWith('"') ? path.slice(1, -1) : path;
}

function stripPrefix(path: string, prefix: string): string {
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}
