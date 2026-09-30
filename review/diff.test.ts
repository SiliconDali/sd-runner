import { describe, it, expect } from "vitest";
import { parseDiff } from "./diff";

const diff = [
  "diff --git a/src/a.ts b/src/a.ts",
  "index 1111111..2222222 100644",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1,4 +1,5 @@",
  " one",
  "-two",
  "+TWO",
  "+two and a half",
  " three",
  " four",
  "@@ -20,2 +21,3 @@ function tail() {",
  " twenty",
  "+new",
  " twenty-one",
  "\\ No newline at end of file",
  "diff --git a/src/new.ts b/src/new.ts",
  "new file mode 100644",
  "index 0000000..3333333",
  "--- /dev/null",
  "+++ b/src/new.ts",
  "@@ -0,0 +1,2 @@",
  "+x",
  "+y",
  "diff --git a/src/gone.ts b/src/gone.ts",
  "deleted file mode 100644",
  "--- a/src/gone.ts",
  "+++ /dev/null",
  "@@ -1,2 +0,0 @@",
  "-p",
  "-q",
  "diff --git a/img.png b/img.png",
  "Binary files a/img.png and b/img.png differ",
  "",
].join("\n");

describe("parseDiff", () => {
  const index = parseDiff(diff);

  it("puts added and context lines on the right side", () => {
    expect(index.has("src/a.ts", 1, "RIGHT")).toBe(true); // context
    expect(index.has("src/a.ts", 2, "RIGHT")).toBe(true); // added
    expect(index.has("src/a.ts", 5, "RIGHT")).toBe(true); // context
    expect(index.has("src/a.ts", 22, "RIGHT")).toBe(true); // added in second hunk
    expect(index.has("src/a.ts", 23, "RIGHT")).toBe(true);
  });

  it("puts deleted and context lines on the left side", () => {
    expect(index.has("src/a.ts", 2, "LEFT")).toBe(true); // deleted "two"
    expect(index.has("src/a.ts", 4, "LEFT")).toBe(true); // context "four"
    expect(index.has("src/a.ts", 5, "LEFT")).toBe(false);
  });

  it("rejects lines outside every hunk", () => {
    expect(index.has("src/a.ts", 6, "RIGHT")).toBe(false);
    expect(index.has("src/a.ts", 20, "RIGHT")).toBe(false);
    expect(index.has("src/a.ts", 24, "RIGHT")).toBe(false);
  });

  it("does not count the no-newline marker as a line", () => {
    expect(index.has("src/a.ts", 22, "LEFT")).toBe(false);
  });

  it("indexes a new file by its new path", () => {
    expect(index.has("src/new.ts", 1, "RIGHT")).toBe(true);
    expect(index.has("src/new.ts", 2, "RIGHT")).toBe(true);
    expect(index.has("src/new.ts", 3, "RIGHT")).toBe(false);
  });

  it("indexes a deleted file on the left only", () => {
    expect(index.has("src/gone.ts", 1, "LEFT")).toBe(true);
    expect(index.has("src/gone.ts", 1, "RIGHT")).toBe(false);
  });

  it("knows no lines of a binary file or an unknown path", () => {
    expect(index.has("img.png", 1, "RIGHT")).toBe(false);
    expect(index.has("nope.ts", 1, "RIGHT")).toBe(false);
  });

  it("lists every file the diff touches", () => {
    expect(index.paths()).toEqual(["src/a.ts", "src/new.ts", "src/gone.ts", "img.png"]);
  });

  it("indexes a rename under its new path", () => {
    const renamed = parseDiff(
      [
        "diff --git a/old name.ts b/new name.ts",
        "similarity index 90%",
        "rename from old name.ts",
        "rename to new name.ts",
        "--- a/old name.ts",
        "+++ b/new name.ts",
        "@@ -3 +3 @@",
        "-a",
        "+b",
      ].join("\n")
    );
    expect(renamed.has("new name.ts", 3, "RIGHT")).toBe(true);
    expect(renamed.has("old name.ts", 3, "RIGHT")).toBe(false);
  });

  it("returns an empty index for an empty diff", () => {
    expect(parseDiff("").paths()).toEqual([]);
  });
});
