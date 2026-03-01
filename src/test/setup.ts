import "@testing-library/jest-dom/vitest";

// Mock @tauri-apps/api/core for tests
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));
