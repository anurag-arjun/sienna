import { describe, it, expect } from "vitest";
import { buildDistillPrompt, suggestDistillTitle } from "./distill";
import type { Message } from "../components/Conversation";

const sampleMessages: Message[] = [
  { id: "1", role: "user", content: "How should we structure the API?" },
  { id: "2", role: "assistant", content: "I'd recommend a REST API with these endpoints..." },
  { id: "3", role: "user", content: "What about authentication?" },
  { id: "4", role: "assistant", content: "JWT tokens with refresh flow would work well." },
  { id: "5", role: "user", content: "Good. Let's also add rate limiting." },
];

describe("buildDistillPrompt", () => {
  it("includes all conversation messages", () => {
    const prompt = buildDistillPrompt(sampleMessages, "plan");
    expect(prompt).toContain("How should we structure the API?");
    expect(prompt).toContain("JWT tokens with refresh flow");
    expect(prompt).toContain("rate limiting");
  });

  it("labels roles correctly", () => {
    const prompt = buildDistillPrompt(sampleMessages, "plan");
    expect(prompt).toContain("User: How should we structure");
    expect(prompt).toContain("Assistant: I'd recommend");
  });

  it("includes plan template structure", () => {
    const prompt = buildDistillPrompt(sampleMessages, "plan");
    expect(prompt).toContain("## Goal");
    expect(prompt).toContain("## Approach");
    expect(prompt).toContain("## Open Questions");
  });

  it("includes blog template structure", () => {
    const prompt = buildDistillPrompt(sampleMessages, "blog");
    expect(prompt).toContain("## Title");
    expect(prompt).toContain("blog post draft");
  });

  it("includes tweet instruction", () => {
    const prompt = buildDistillPrompt(sampleMessages, "tweet");
    expect(prompt).toContain("≤280 chars");
  });

  it("includes title hint when provided", () => {
    const prompt = buildDistillPrompt(sampleMessages, "plan", "API Design");
    expect(prompt).toContain('titled "API Design"');
  });

  it("includes distill instruction", () => {
    const prompt = buildDistillPrompt(sampleMessages, "plan");
    expect(prompt).toContain("Distill the following conversation");
    expect(prompt).toContain("plan document");
  });
});

describe("suggestDistillTitle", () => {
  it("uses first user message as title", () => {
    const title = suggestDistillTitle(sampleMessages, "plan");
    expect(title).toBe("#plan How should we structure the API?");
  });

  it("truncates long first messages", () => {
    const longMessages: Message[] = [
      {
        id: "1",
        role: "user",
        content: "This is a very long message that goes on and on about many different topics and should be truncated",
      },
    ];
    const title = suggestDistillTitle(longMessages, "blog");
    expect(title.length).toBeLessThan(70);
    expect(title).toContain("…");
    expect(title.startsWith("#blog ")).toBe(true);
  });

  it("falls back to just tag when no user messages", () => {
    const aiOnly: Message[] = [
      { id: "1", role: "assistant", content: "Hello!" },
    ];
    const title = suggestDistillTitle(aiOnly, "plan");
    expect(title).toBe("#plan");
  });
});
