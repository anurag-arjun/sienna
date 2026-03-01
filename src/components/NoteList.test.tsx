import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NoteList } from "./NoteList";
import type { Note } from "../api/notes";

const now = Math.floor(Date.now() / 1000);

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "note-1",
    type: "document",
    title: "Test Note",
    content: "First line\nSecond line with excerpt",
    pi_session: null,
    status: "active",
    pinned: false,
    context_set: null,
    created_at: now - 3600,
    updated_at: now - 60,
    tags: [],
    ...overrides,
  };
}

describe("NoteList", () => {
  afterEach(cleanup);

  it("shows empty state when no notes", () => {
    render(<NoteList notes={[]} onSelect={vi.fn()} />);
    expect(screen.getByText("No notes yet")).toBeTruthy();
  });

  it("shows loading state", () => {
    render(<NoteList notes={[]} onSelect={vi.fn()} loading />);
    expect(screen.getByText("Loading…")).toBeTruthy();
  });

  it("renders correct number of items", () => {
    const notes = [
      makeNote({ id: "1", title: "First" }),
      makeNote({ id: "2", title: "Second" }),
      makeNote({ id: "3", title: "Third" }),
    ];
    render(<NoteList notes={notes} onSelect={vi.fn()} />);
    expect(screen.getAllByTestId("note-item")).toHaveLength(3);
  });

  it("shows conversation icon for conversation type", () => {
    const notes = [makeNote({ type: "conversation", title: "Chat" })];
    render(<NoteList notes={notes} onSelect={vi.fn()} />);
    const icon = screen.getByTestId("note-type-icon");
    expect(icon.textContent).toBe("◆");
  });

  it("shows document icon for document type", () => {
    const notes = [makeNote({ type: "document", title: "Doc" })];
    render(<NoteList notes={notes} onSelect={vi.fn()} />);
    const icon = screen.getByTestId("note-type-icon");
    expect(icon.textContent).toBe("✎");
  });

  it("uses correct status dot colors", () => {
    const notes = [
      makeNote({ id: "1", status: "active" }),
      makeNote({ id: "2", status: "completed" }),
      makeNote({ id: "3", status: "dropped" }),
    ];
    render(<NoteList notes={notes} onSelect={vi.fn()} />);
    const dots = screen.getAllByTestId("status-dot");
    expect(dots[0].className).toContain("bg-status-active");
    expect(dots[1].className).toContain("bg-status-completed");
    expect(dots[2].className).toContain("bg-status-dropped");
  });

  it("shows tags as chips", () => {
    const notes = [makeNote({ tags: ["chat", "plan"] })];
    render(<NoteList notes={notes} onSelect={vi.fn()} />);
    expect(screen.getByText("chat")).toBeTruthy();
    expect(screen.getByText("plan")).toBeTruthy();
  });

  it("calls onSelect when note is clicked", () => {
    const onSelect = vi.fn();
    const note = makeNote({ title: "Click me" });
    render(<NoteList notes={[note]} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId("note-item"));
    expect(onSelect).toHaveBeenCalledWith(note);
  });

  it("highlights selected note", () => {
    const note = makeNote({ id: "selected-1" });
    render(
      <NoteList notes={[note]} selectedId="selected-1" onSelect={vi.fn()} />,
    );
    const item = screen.getByTestId("note-item");
    expect(item.className).toContain("bg-surface-3");
  });

  it("shows Untitled for notes without title", () => {
    const notes = [makeNote({ title: "" })];
    render(<NoteList notes={notes} onSelect={vi.fn()} />);
    expect(screen.getByText("Untitled")).toBeTruthy();
  });

  it("shows relative date", () => {
    const notes = [makeNote({ updated_at: now - 120 })]; // 2 minutes ago
    render(<NoteList notes={notes} onSelect={vi.fn()} />);
    expect(screen.getByText("2m ago")).toBeTruthy();
  });
});
