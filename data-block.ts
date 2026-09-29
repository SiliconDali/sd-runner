/**
 * Wrap text fetched from outside the run in a tagged block the prompt marks
 * as data. A closing tag inside the text is defused, so the block ends where
 * the script says it ends and nothing in the text can pose as the prompt.
 */
export function dataBlock(tag: string, content: string): string {
  const closing = new RegExp(`</(${tag})(\\s*)>`, "gi");
  const body = content.trimEnd().replace(closing, "&lt;/$1$2>");
  return `<${tag}>\n${body}\n</${tag}>`;
}
