import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  act,
  waitFor,
} from "@testing-library/react";
import { LibraryPanel } from "./LibraryPanel";
import type { Note } from "../api/notes";

const now = Math.floor(Date.now() / 1000);

const mockNotes: Note[] = [
  {
    id: "n1",
    type: "document",
    title: "My Document",
    content: "Some content",
    pi_session: null,
    status: "active",
    pinned: false,
    context_set: null,
    created_at: now - 7200,
    updated_at: now - 300,
    tags: ["plan"],
  },
  {
    id: "n2",
    type: "conversation",
    title: "Chat Session",
    content: null,
    pi_session: "sess-1",
    status: "active",
    pinned: false,
    context_set: null,
    created_at: now - 3600,
    updated_at: now - 60,
    tags: ["chat"],
  },
];

// Mock the notes API
vi.mock("../api/notes", () => ({
  notesApi: {
    listNotes: vi.fn().mockResolvedValue([]),
  },
}));

import { notesApi } from "../api/notes";
const mockListNotes = vi.mocked(notesApi.listNotes);

describe("LibraryPanel", () => {
  beforeEach(() => {
    mockListNotes.mockResolvedValue(mockNotes);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("is hidden when closed", () => {
    render(
      <LibraryPanel open={false} onClose={vi.fn()} onSelectNote={vi.fn()} />,
    );
    const panel = screen.getByTestId("library-panel");
    expect(panel.className).toContain("-translate-x-full");
  });

  it("is visible when open", () => {
    render(
      <LibraryPanel open={true} onClose={vi.fn()} onSelectNote={vi.fn()} />,
    );
    const panel = screen.getByTestId("library-panel");
    expect(panel.className).toContain("translate-x-0");
  });

  it("fetches active notes by default when opened", async () => {
    render(
      <LibraryPanel open={true} onClose={vi.fn()} onSelectNote={vi.fn()} />,
    );
    await waitFor(() => {
      expect(mockListNotes).toHaveBeenCalledWith(
        expect.objectContaining({ status: "active", limit: 100 }),
      );
    });
  });

  it("renders fetched notes", async () => {
    render(
      <LibraryPanel open={true} onClose={vi.fn()} onSelectNote={vi.fn()} />,
    );
    await waitFor(() => {
      expect(screen.getByText("My Document")).toBeTruthy();
      expect(screen.getByText("Chat Session")).toBeTruthy();
    });
  });

  it("shows note count in footer", async () => {
    render(
      <LibraryPanel open={true} onClose={vi.fn()} onSelectNote={vi.fn()} />,
    );
    await waitFor(() => {
      expect(screen.getByText("2 notes")).toBeTruthy();
    });
  });

  it("calls onClose on Escape", async () => {
    const onClose = vi.fn();
    render(
      <LibraryPanel open={true} onClose={onClose} onSelectNote={vi.fn()} />,
    );
    await act(async () => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose on backdrop click", () => {
    const onClose = vi.fn();
    render(
      <LibraryPanel open={true} onClose={onClose} onSelectNote={vi.fn()} />,
    );
    fireEvent.click(screen.getByTestId("library-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onSelectNote and onClose when note clicked", async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <LibraryPanel open={true} onClose={onClose} onSelectNote={onSelect} />,
    );
    await waitFor(() => {
      expect(screen.getByText("My Document")).toBeTruthy();
    });
    fireEvent.click(screen.getAllByTestId("note-item")[0]);
    expect(onSelect).toHaveBeenCalledWith(mockNotes[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it("shows Library header", () => {
    render(
      <LibraryPanel open={true} onClose={vi.fn()} onSelectNote={vi.fn()} />,
    );
    expect(screen.getByText("Library")).toBeTruthy();
  });

  it("has a search input", () => {
    render(
      <LibraryPanel open={true} onClose={vi.fn()} onSelectNote={vi.fn()} />,
    );
    expect(screen.getByTestId("library-search")).toBeTruthy();
  });

  it("passes search query as FTS filter", async () => {
    vi.useFakeTimers();
    render(
      <LibraryPanel open={true} onClose={vi.fn()} onSelectNote={vi.fn()} />,
    );

    const input = screen.getByTestId("library-search");
    await act(async () => {
      fireEvent.change(input, { target: { value: "rust" } });
    });

    // Advance past debounce
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(mockListNotes).toHaveBeenCalledWith(
      expect.objectContaining({ search: "rust", status: "active" }),
    );
    vi.useRealTimers();
  });

  it("passes tag qualifier to filter", async () => {
    vi.useFakeTimers();
    render(
      <LibraryPanel open={true} onClose={vi.fn()} onSelectNote={vi.fn()} />,
    );

    const input = screen.getByTestId("library-search");
    await act(async () => {
      fireEvent.change(input, { target: { value: "tag:plan" } });
    });

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(mockListNotes).toHaveBeenCalledWith(
      expect.objectContaining({ tag: "plan", status: "active" }),
    );
    vi.useRealTimers();
  });

  it("shows clear button when query is active", async () => {
    render(
      <LibraryPanel open={true} onClose={vi.fn()} onSelectNote={vi.fn()} />,
    );

    const input = screen.getByTestId("library-search");
    await act(async () => {
      fireEvent.change(input, { target: { value: "hello" } });
    });

    expect(screen.getByTestId("library-clear-search")).toBeTruthy();
  });

  it("clears search on clear button click", async () => {
    render(
      <LibraryPanel open={true} onClose={vi.fn()} onSelectNote={vi.fn()} />,
    );

    const input = screen.getByTestId("library-search") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: "hello" } });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("library-clear-search"));
    });

    expect(input.value).toBe("");
  });

  it("clears query when panel closes", async () => {
    const { rerender } = render(
      <LibraryPanel open={true} onClose={vi.fn()} onSelectNote={vi.fn()} />,
    );

    const input = screen.getByTestId("library-search") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: "hello" } });
    });
    expect(input.value).toBe("hello");

    rerender(
      <LibraryPanel open={false} onClose={vi.fn()} onSelectNote={vi.fn()} />,
    );
    rerender(
      <LibraryPanel open={true} onClose={vi.fn()} onSelectNote={vi.fn()} />,
    );

    const newInput = screen.getByTestId("library-search") as HTMLInputElement;
    expect(newInput.value).toBe("");
  });
});
