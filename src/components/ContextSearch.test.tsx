import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  act,
  waitFor,
} from "@testing-library/react";
import { ContextSearch } from "./ContextSearch";

// Mock APIs
vi.mock("../api/notes", () => ({
  notesApi: {
    listNotes: vi.fn().mockResolvedValue([
      {
        id: "note-1",
        type: "document",
        title: "My Plan",
        content: "This is my plan content",
        pi_session: null,
        status: "active",
        pinned: false,
        context_set: null,
        created_at: 0,
        updated_at: 0,
        tags: [],
      },
    ]),
    getNote: vi.fn().mockResolvedValue({
      id: "note-1",
      type: "document",
      title: "My Plan",
      content: "This is my plan content",
      pi_session: null,
      status: "active",
      pinned: false,
      context_set: null,
      created_at: 0,
      updated_at: 0,
      tags: [],
    }),
  },
}));

vi.mock("../api/context", () => ({
  contextApi: {
    getFileMeta: vi.fn().mockResolvedValue({
      name: "main.rs",
      path: "/home/user/main.rs",
      size: 256,
      is_dir: false,
    }),
    readFileContent: vi.fn().mockResolvedValue("fn main() {}"),
    addNoteContext: vi.fn().mockResolvedValue({ id: "ctx-new" }),
  },
}));

describe("ContextSearch", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders search input", () => {
    render(<ContextSearch noteId="note-1" onAdd={vi.fn()} />);
    expect(screen.getByTestId("context-search-input")).toBeTruthy();
  });

  it("shows no results for empty query", () => {
    render(<ContextSearch noteId="note-1" onAdd={vi.fn()} />);
    expect(screen.queryByTestId("search-result")).toBeNull();
  });

  it("searches notes on text input", async () => {
    vi.useFakeTimers();
    render(<ContextSearch noteId="note-1" onAdd={vi.fn()} />);

    await act(async () => {
      fireEvent.change(screen.getByTestId("context-search-input"), {
        target: { value: "plan" },
      });
    });

    // Wait for debounce
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    vi.useRealTimers();

    await waitFor(() => {
      expect(screen.getByText("My Plan")).toBeTruthy();
    });
  });

  it("searches filesystem for file paths", async () => {
    vi.useFakeTimers();
    render(<ContextSearch noteId="note-1" onAdd={vi.fn()} />);

    await act(async () => {
      fireEvent.change(screen.getByTestId("context-search-input"), {
        target: { value: "/home/user/main.rs" },
      });
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    vi.useRealTimers();

    await waitFor(() => {
      expect(screen.getByText("main.rs")).toBeTruthy();
    });
  });

  it("shows URL result for pasted URLs", async () => {
    vi.useFakeTimers();
    render(<ContextSearch noteId="note-1" onAdd={vi.fn()} />);

    await act(async () => {
      fireEvent.change(screen.getByTestId("context-search-input"), {
        target: { value: "https://example.com/page" },
      });
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    vi.useRealTimers();

    await waitFor(() => {
      expect(screen.getByText("https://example.com/page")).toBeTruthy();
    });
  });

  it("calls onAdd when result is clicked", async () => {
    vi.useFakeTimers();
    const onAdd = vi.fn().mockResolvedValue(undefined);
    render(<ContextSearch noteId="note-1" onAdd={onAdd} />);

    await act(async () => {
      fireEvent.change(screen.getByTestId("context-search-input"), {
        target: { value: "/home/user/main.rs" },
      });
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    vi.useRealTimers();

    await waitFor(() => {
      expect(screen.getByText("main.rs")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getAllByTestId("search-result")[0]);
    });

    expect(onAdd).toHaveBeenCalledWith("/home/user/main.rs");
  });

  it("shows 'No results' when search finds nothing", async () => {
    const { notesApi } = await import("../api/notes");
    vi.mocked(notesApi.listNotes).mockResolvedValueOnce([]);

    vi.useFakeTimers();
    render(<ContextSearch noteId="note-1" onAdd={vi.fn()} />);

    await act(async () => {
      fireEvent.change(screen.getByTestId("context-search-input"), {
        target: { value: "nonexistent" },
      });
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    vi.useRealTimers();

    await waitFor(() => {
      expect(screen.getByText("No results")).toBeTruthy();
    });
  });

  it("groups results by source type", async () => {
    vi.useFakeTimers();
    render(<ContextSearch noteId="note-1" onAdd={vi.fn()} />);

    // A generic query searches both notes and files
    await act(async () => {
      fireEvent.change(screen.getByTestId("context-search-input"), {
        target: { value: "plan" },
      });
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    vi.useRealTimers();

    await waitFor(() => {
      expect(screen.getByTestId("search-group-note")).toBeTruthy();
    });
  });
});
