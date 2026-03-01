import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ContextCard } from "./ContextCard";
import type { NoteContext } from "../api/context";

const makeItem = (overrides: Partial<NoteContext> = {}): NoteContext => ({
  id: "ctx-1",
  note_id: "note-1",
  type: "local",
  reference: "/home/user/project/main.rs",
  label: "main.rs",
  content_cache: "fn main() {\n    println!(\"hello\");\n}\n",
  sort_order: 0,
  ...overrides,
});

describe("ContextCard", () => {
  afterEach(cleanup);

  it("renders label and type icon", () => {
    render(<ContextCard item={makeItem()} maxSize={100} onRemove={vi.fn()} />);
    expect(screen.getByTestId("context-card-label").textContent).toBe("main.rs");
    expect(screen.getByTestId("context-card-icon").textContent).toBe("📁");
  });

  it("shows preview when collapsed", () => {
    render(<ContextCard item={makeItem()} maxSize={100} onRemove={vi.fn()} />);
    expect(screen.getByTestId("context-card-preview")).toBeTruthy();
    expect(screen.queryByTestId("context-card-full")).toBeNull();
  });

  it("shows full content when expanded", () => {
    render(<ContextCard item={makeItem()} maxSize={100} onRemove={vi.fn()} />);
    fireEvent.click(screen.getByTestId("context-card"));
    expect(screen.getByTestId("context-card-full")).toBeTruthy();
    expect(screen.queryByTestId("context-card-preview")).toBeNull();
  });

  it("toggles between expanded and collapsed", () => {
    render(<ContextCard item={makeItem()} maxSize={100} onRemove={vi.fn()} />);
    // Expand
    fireEvent.click(screen.getByTestId("context-card"));
    expect(screen.getByTestId("context-card-full")).toBeTruthy();
    // Collapse
    fireEvent.click(screen.getByTestId("context-card"));
    expect(screen.getByTestId("context-card-preview")).toBeTruthy();
  });

  it("calls onRemove when remove button clicked", () => {
    const onRemove = vi.fn();
    render(<ContextCard item={makeItem()} maxSize={100} onRemove={onRemove} />);
    fireEvent.click(screen.getByTestId("context-card-remove"));
    expect(onRemove).toHaveBeenCalledWith("ctx-1");
  });

  it("renders size bar proportional to maxSize", () => {
    const item = makeItem({ content_cache: "x".repeat(50) });
    render(<ContextCard item={item} maxSize={100} onRemove={vi.fn()} />);
    const bar = screen.getByTestId("context-card-sizebar");
    expect(bar.style.width).toBe("50%");
  });

  it("handles null content_cache gracefully", () => {
    const item = makeItem({ content_cache: null });
    render(<ContextCard item={item} maxSize={100} onRemove={vi.fn()} />);
    expect(screen.getByTestId("context-card-label").textContent).toBe("main.rs");
    expect(screen.queryByTestId("context-card-preview")).toBeNull();
  });

  it("shows correct icon for different types", () => {
    const { rerender } = render(
      <ContextCard item={makeItem({ type: "github" })} maxSize={100} onRemove={vi.fn()} />,
    );
    expect(screen.getByTestId("context-card-icon").textContent).toBe("⚙");

    rerender(
      <ContextCard item={makeItem({ type: "url" })} maxSize={100} onRemove={vi.fn()} />,
    );
    expect(screen.getByTestId("context-card-icon").textContent).toBe("🔗");
  });
});
