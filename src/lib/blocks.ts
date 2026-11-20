// Helpers for BlockNote documents stored as JSON in grammar_sections.content.
// Kept free of BlockNote imports so they run on the server too.

type InlineNode = { type?: string; text?: string; content?: InlineNode[] | string };
type BlockNode = {
  type?: string;
  content?: InlineNode[] | string | { rows?: { cells?: unknown[] }[] };
  children?: BlockNode[];
};

function inlineText(content: BlockNode["content"]): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((node) => (typeof node.content === "string" || Array.isArray(node.content) ? inlineText(node.content) : (node.text ?? "")))
      .join("");
  }
  // Table content: rows → cells → inline content
  return (content.rows ?? [])
    .map((row) =>
      (row.cells ?? [])
        .map((cell) => {
          const c = cell as { content?: InlineNode[] } | InlineNode[];
          return inlineText(Array.isArray(c) ? c : (c.content ?? []));
        })
        .join(" | ")
    )
    .join("\n");
}

/** Plain text of a BlockNote document, one line per block. */
export function blocksToText(blocks: unknown, depth = 0): string {
  if (!Array.isArray(blocks)) return "";
  return (blocks as BlockNode[])
    .map((block) => {
      const line = inlineText(block.content).trim();
      const prefix = block.type === "bulletListItem" || block.type === "numberedListItem" ? "- " : "";
      const self = line ? `${"  ".repeat(depth)}${prefix}${line}` : "";
      const children = blocksToText(block.children, depth + 1);
      return [self, children].filter(Boolean).join("\n");
    })
    .filter(Boolean)
    .join("\n");
}

/** Initial document for a grammar rule discovered in Practice. */
export function grammarRuleBlocks(rule: {
  explanation_fr: string;
  example_hanzi: string;
  example_pinyin: string;
}) {
  const blocks: { type: string; content: string; props?: Record<string, unknown> }[] = [];
  if (rule.explanation_fr) blocks.push({ type: "paragraph", content: rule.explanation_fr });
  if (rule.example_hanzi) {
    blocks.push({ type: "heading", content: "Exemple", props: { level: 3 } });
    blocks.push({ type: "quote", content: rule.example_hanzi });
    if (rule.example_pinyin) blocks.push({ type: "paragraph", content: rule.example_pinyin });
  }
  return blocks;
}
