import { describe, it, expect } from "vitest";
import { failureReason, trimCliCrash } from "./failure-reason";

const crash = [
  "claude-code exited with code 1:",
  " 6 | // and may be used to improve Anthropic's products, including training models.",
  " 7 | // You are responsible for reviewing any code suggestions before use.",
  " 8 | ",
  " 9 | // (c) Anthropic PBC. All rights reserved.",
  "10 | ",
  '11 | import{Le,Vo}from"/$bunfs/root/chunk-37s48y77.js";import{q,j,we,Ln}from"/$bunfs/root/chunk-d37h8mav.js";',
  "                 ^",
  "error: bubblewrap is required for subprocess env scrubbing and isolation. Install with: sudo apt-get install -y bubblewrap.",
  "      at xWr (/$bunfs/root/chunk-2rwe9v5c.js:11:16608)",
  "      at A (/$bunfs/root/chunk-93n18aak.js:11:4210)",
  "      at async <anonymous> (/$bunfs/root/chunk-50t47w3f.js:24:6416)",
  "",
  "Bun v1.2.0 (Linux x64)",
].join("\n");

describe("trimCliCrash", () => {
  it("keeps sandcastle's header and the error line, drops the bundle and the stack", () => {
    expect(trimCliCrash(crash)).toBe(
      "claude-code exited with code 1:\n" +
        "error: bubblewrap is required for subprocess env scrubbing and isolation. Install with: sudo apt-get install -y bubblewrap."
    );
  });

  it("keeps an error that wraps onto following lines until the stack starts", () => {
    const wrapped = [
      "claude-code exited with code 2:",
      "3 | x",
      "error: first line of the message",
      "  second line of the message",
      "    at f (/$bunfs/root/chunk-a.js:1:2)",
    ].join("\n");
    expect(trimCliCrash(wrapped)).toBe(
      "claude-code exited with code 2:\nerror: first line of the message\n  second line of the message"
    );
  });

  it("works without sandcastle's header", () => {
    const bare = ["1 | import x", "error: boom", "    at f (/a.js:1:2)"].join("\n");
    expect(trimCliCrash(bare)).toBe("error: boom");
  });

  it("leaves a message alone when there is no crash dump around the error line", () => {
    const plain = "claude-code exited with code 1:\nerror: unknown option '--bogus'";
    expect(trimCliCrash(plain)).toBe(plain);
    const stderr = "sandbox disabled: bwrap not found\nsomething else";
    expect(trimCliCrash(stderr)).toBe(stderr);
  });

  it("leaves a dump with no error line alone", () => {
    const dump = "claude-code exited with code 1:\n1 | import x\n    at f (/a.js:1:2)";
    expect(trimCliCrash(dump)).toBe(dump);
  });
});

describe("failureReason", () => {
  it("reads an Error's message and trims a crash", () => {
    expect(failureReason(new Error(crash))).toMatch(/^claude-code exited with code 1:\nerror: bubblewrap/);
    expect(failureReason(new Error(crash))).not.toContain("bunfs");
  });

  it("stringifies anything else", () => {
    expect(failureReason("plain")).toBe("plain");
    expect(failureReason(42)).toBe("42");
  });
});
