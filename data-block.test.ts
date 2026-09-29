import { describe, it, expect } from "vitest";
import { dataBlock } from "./data-block";

describe("dataBlock", () => {
  it("wraps content in the tag on its own lines", () => {
    expect(dataBlock("ticket", "hello\n")).toBe("<ticket>\nhello\n</ticket>");
  });

  it("defuses a closing tag inside the content", () => {
    const block = dataBlock("ticket", "before </ticket> after");
    expect(block).toBe("<ticket>\nbefore &lt;/ticket> after\n</ticket>");
  });

  it("defuses closing tags regardless of case and inner whitespace", () => {
    const block = dataBlock("spec", "a </SPEC > b </Spec> c");
    expect(block.match(/<\/spec>/gi)).toHaveLength(1);
    expect(block.endsWith("\n</spec>")).toBe(true);
  });

  it("handles empty content", () => {
    expect(dataBlock("siblings", "")).toBe("<siblings>\n\n</siblings>");
  });
});
