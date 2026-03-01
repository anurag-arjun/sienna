/**
 * Note mode system — tags determine behavior and templates.
 *
 * The first #tag on the first line of a note determines its mode.
 * Each mode configures: Enter behavior, template, display label.
 */

export type NoteTag = "chat" | "plan" | "blog" | "tweet" | "scratch";

export interface ModeConfig {
  /** The tag that triggers this mode */
  tag: NoteTag;
  /** What Enter does: "send" (chat) or "newline" (document) */
  enterBehavior: "send" | "newline";
  /** Display label for the mode indicator */
  label: string;
  /** Icon for the mode indicator */
  icon: string;
  /** Note type for storage */
  noteType: "conversation" | "document";
  /** Starting template content (after the tag line) */
  template: string;
}

/** Mode configurations keyed by tag */
const MODES: Record<NoteTag, ModeConfig> = {
  chat: {
    tag: "chat",
    enterBehavior: "send",
    label: "chat",
    icon: "◆",
    noteType: "conversation",
    template: "",
  },
  plan: {
    tag: "plan",
    enterBehavior: "newline",
    label: "plan",
    icon: "▣",
    noteType: "document",
    template: [
      "",
      "## Goal",
      "",
      "",
      "## Context",
      "",
      "",
      "## Approach",
      "",
      "",
      "## Open Questions",
      "",
      "",
    ].join("\n"),
  },
  blog: {
    tag: "blog",
    enterBehavior: "newline",
    label: "blog",
    icon: "¶",
    noteType: "document",
    template: [
      "",
      "## Title",
      "",
      "",
      "---",
      "",
      "",
    ].join("\n"),
  },
  tweet: {
    tag: "tweet",
    enterBehavior: "newline",
    label: "tweet",
    icon: "✦",
    noteType: "document",
    template: "\n",
  },
  scratch: {
    tag: "scratch",
    enterBehavior: "newline",
    label: "scratch",
    icon: "✎",
    noteType: "document",
    template: "\n",
  },
};

/** Default mode when no tag is detected */
const DEFAULT_MODE: ModeConfig = {
  tag: "scratch",
  enterBehavior: "newline",
  label: "write",
  icon: "✎",
  noteType: "document",
  template: "",
};

/** All recognized tags */
export const ALL_TAGS: NoteTag[] = ["chat", "plan", "blog", "tweet", "scratch"];

/**
 * Extract the first #tag from the first line of content.
 * Returns null if no recognized tag is found.
 */
export function extractTag(content: string): NoteTag | null {
  const firstLine = content.split("\n")[0] || "";
  const match = firstLine.match(/#(\w+)/);
  if (!match) return null;

  const tag = match[1].toLowerCase();
  if (ALL_TAGS.includes(tag as NoteTag)) {
    return tag as NoteTag;
  }
  return null;
}

/**
 * Resolve the mode config for given content.
 * Checks the first line for a #tag, falls back to default.
 */
export function resolveMode(content: string): ModeConfig {
  const tag = extractTag(content);
  if (tag) return MODES[tag];
  return DEFAULT_MODE;
}

/**
 * Get the mode config for a specific tag.
 */
export function getModeForTag(tag: NoteTag): ModeConfig {
  return MODES[tag];
}

/**
 * Get the template content for a tag (includes the tag line).
 */
export function getTemplate(tag: NoteTag): string {
  const mode = MODES[tag];
  return `#${tag}${mode.template}`;
}
