import { describe, it, expect } from "vitest";
import { createMoodTheme, moodTheme } from "./theme";

describe("theme", () => {
  it("moodTheme is a CM6 extension", () => {
    expect(moodTheme).toBeDefined();
  });

  it("createMoodTheme creates dark theme", () => {
    const theme = createMoodTheme(true);
    expect(theme).toBeDefined();
  });

  it("createMoodTheme creates light theme", () => {
    const theme = createMoodTheme(false);
    expect(theme).toBeDefined();
  });

  it("dark and light themes are different objects", () => {
    const dark = createMoodTheme(true);
    const light = createMoodTheme(false);
    expect(dark).not.toBe(light);
  });
});
