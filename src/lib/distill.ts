/**
 * Distill — convert a conversation into a structured document.
 *
 * Builds a synthesis prompt from conversation messages,
 * targeting a specific output format (plan, blog, etc.).
 */

import type { Message } from "../components/Conversation";
import type { NoteTag } from "./note-mode";
import { getTemplate } from "./note-mode";

/**
 * Build a distill prompt that asks the AI to synthesize
 * a conversation into a structured document.
 */
export function buildDistillPrompt(
  messages: Message[],
  targetTag: NoteTag,
  title?: string,
): string {
  const conversationText = messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");

  const template = getTemplate(targetTag);
  const titleHint = title ? ` titled "${title}"` : "";

  const formatInstructions: Record<string, string> = {
    plan: "Synthesize into a structured plan with Goal, Context, Approach, and Open Questions sections. Be specific and actionable.",
    blog: "Synthesize into a blog post draft with a compelling title, clear structure, and engaging prose. Maintain the original voice and insights.",
    tweet: "Distill into a single concise tweet (≤280 chars). Capture the key insight or takeaway.",
    scratch: "Distill the key points and insights into concise notes.",
    chat: "Summarize the conversation highlights.",
  };

  const instruction = formatInstructions[targetTag] || formatInstructions.scratch;

  return [
    `Distill the following conversation into a ${targetTag} document${titleHint}.`,
    "",
    instruction,
    "",
    `Use this template structure:`,
    "```",
    template,
    "```",
    "",
    "--- Conversation ---",
    "",
    conversationText,
    "",
    "--- End Conversation ---",
    "",
    `Write the distilled ${targetTag} document now. Output only the document content, no preamble.`,
  ].join("\n");
}

/**
 * Build the title for a distilled note from the conversation.
 * Uses the first user message as a hint.
 */
export function suggestDistillTitle(
  messages: Message[],
  targetTag: NoteTag,
): string {
  const firstUserMsg = messages.find((m) => m.role === "user");
  if (firstUserMsg) {
    // Take first ~50 chars of first user message as title hint
    const hint = firstUserMsg.content.slice(0, 50).replace(/\n/g, " ").trim();
    return `#${targetTag} ${hint}${firstUserMsg.content.length > 50 ? "…" : ""}`;
  }
  return `#${targetTag}`;
}
