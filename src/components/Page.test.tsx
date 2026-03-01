import { describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Page } from "./Page";

describe("Page", () => {
  afterEach(cleanup);

  it("shows 'Starting…' when not ready", () => {
    render(<Page ready={false} />);
    expect(screen.getByText("Starting…")).toBeTruthy();
  });

  it("renders editor when ready", () => {
    const { container } = render(<Page ready={true} />);
    // Editor mounts — look for CM6 editor element
    expect(container.querySelector(".cm-editor")).toBeTruthy();
  });

  it("shows word count area", () => {
    const { container } = render(<Page ready={true} />);
    // Word count starts hidden (opacity-0) with "0 words"
    const wordCount = container.querySelector("span");
    const spans = container.querySelectorAll("span");
    const wordSpan = Array.from(spans).find((s) =>
      s.textContent?.includes("word")
    );
    expect(wordSpan).toBeTruthy();
  });

  it("shows context tray indicator", () => {
    const { container } = render(<Page ready={true} />);
    // Context count badge shows "0"
    const spans = container.querySelectorAll("span");
    const countSpan = Array.from(spans).find(
      (s) => s.textContent?.trim() === "0" && s.className.includes("text-[10px]")
    );
    expect(countSpan).toBeTruthy();
  });
});
