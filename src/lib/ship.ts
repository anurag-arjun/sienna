/**
 * Ship utilities — Markdown stripping and export helpers.
 */

/**
 * Strip Markdown formatting to produce plain text.
 * Handles: headings, bold, italic, links, images, code blocks, lists, blockquotes.
 */
export function stripMarkdown(md: string): string {
  let text = md;

  // Remove code blocks (fenced)
  text = text.replace(/```[\s\S]*?```/g, (match) => {
    // Keep the code content, strip the fences
    const lines = match.split("\n");
    return lines.slice(1, -1).join("\n");
  });

  // Remove inline code (keep content)
  text = text.replace(/`([^`]+)`/g, "$1");

  // Remove images
  text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");

  // Convert links to just text
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  // Remove headings (# ## ### etc)
  text = text.replace(/^#{1,6}\s+/gm, "");

  // Remove bold/italic markers
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, "$1");
  text = text.replace(/\*\*(.+?)\*\*/g, "$1");
  text = text.replace(/\*(.+?)\*/g, "$1");
  text = text.replace(/___(.+?)___/g, "$1");
  text = text.replace(/__(.+?)__/g, "$1");
  text = text.replace(/_(.+?)_/g, "$1");

  // Remove strikethrough
  text = text.replace(/~~(.+?)~~/g, "$1");

  // Remove blockquote markers
  text = text.replace(/^>\s?/gm, "");

  // Remove horizontal rules
  text = text.replace(/^[-*_]{3,}\s*$/gm, "");

  // Remove list markers (-, *, +, numbered)
  text = text.replace(/^[\s]*[-*+]\s+/gm, "");
  text = text.replace(/^[\s]*\d+\.\s+/gm, "");

  // Collapse multiple blank lines
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}

/**
 * Build a suggested filename from a note title and tag.
 */
export function suggestFilename(title: string, tag?: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);

  if (!base) return "untitled.md";

  const ext = tag === "tweet" ? ".txt" : ".md";
  return `${base}${ext}`;
}
