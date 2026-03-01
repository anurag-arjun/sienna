# Mood Editor

A single-surface desktop app for thinking with AI, where conversations and documents coexist on the same page.

Replaces Claude web chat, scattered plan.md workflows, and content drafting — all powered by [pi_agent_rust](https://crates.io/crates/pi_agent_rust) embedded natively in a Tauri backend.

Built with the philosophy that the best tool disappears. One page, five states, three gestures.

## The Surface

Everything happens on a single page. No tabs, no sidebars, no split views. The window *is* the document.

**Writing** — A hybrid Markdown editor where headings render as headings, bold renders as bold, and raw syntax reappears when your cursor enters it. Just you and the words.

**Conversing** — Type a message, press Enter. Your words flow up, the AI responds below. No bubbles, no avatars. Dialogue as prose.

**Gathering** — Drag up from the bottom to reveal the context tray. Attach local files, search notes, paste URLs. Everything in the tray feeds into every AI interaction automatically.

**Navigating** — Ctrl+O slides in your library from the left. All conversations and documents live together — searchable, taggable, filterable.

**Shipping** — (Coming soon) Ctrl+E drops a sheet from the top. Save to file, copy as Markdown, push to GitHub.

## Key Features

- **Tag-based mode switching** — Type `#chat` and the surface becomes a conversation. Type `#plan` and a plan template appears. The tag *is* the mode.
- **Inline AI generation** — Tab at a blank line, type an instruction, press Enter. Text materializes in-place. Accept with Enter, dismiss with Esc.
- **Conversation-in-document** — Ctrl+Return opens an inline Q&A at your cursor position. Multi-turn conversation within the document. Esc collapses it to a subtle annotation dot. Click to revisit.
- **Context tray** — iOS Control Center–style slide-up panel. Universal search across files, notes, URLs. Attach context once, use it everywhere.
- **Context sets** — Persistent context collections triggered by tags. Your `#blog` tag auto-loads brand guidelines. Your `#plan` tag auto-loads project architecture docs.
- **Multi-model support** — 9 models across Anthropic, OpenAI, and Google. Switch mid-conversation. Response attribution shows which model said what.
- **Conversation forking** — Ctrl+B branches a conversation. Explore alternatives without losing the original thread.
- **Distill** — Ctrl+D synthesizes a conversation into a structured document. The AI reads the full dialogue and produces a plan, blog post, or tweet thread.
- **Claude import** — One-time import of Claude conversation exports. Your history becomes searchable, taggable, continuable.
- **Note auto-save** — Debounced saves. Notes auto-create on first meaningful edit. No save button. No data loss.

## Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Tauri v2 |
| AI engine | pi_agent_rust (linked as Rust crate, in-process) |
| Frontend | React 19 + TypeScript |
| Editor | CodeMirror 6 |
| Storage | SQLite (notes, tags, context) + Pi JSONL (conversations) |
| Styling | Tailwind CSS v4 |

Single binary, ~15–30MB. No Electron, no sidecar, no subprocess.

## Prerequisites

- [Rust](https://rustup.rs/) (stable)
- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/)
- Tauri v2 system dependencies ([Linux](https://v2.tauri.app/start/prerequisites/#linux) | [macOS](https://v2.tauri.app/start/prerequisites/#macos) | [Windows](https://v2.tauri.app/start/prerequisites/#windows))

## Setup

```bash
git clone https://github.com/anurag-arjun/mood-editor.git
cd mood-editor
pnpm install
```

## Development

```bash
pnpm tauri dev
```

Frontend hot-reloads. Rust backend recompiles on save.

## Build

```bash
pnpm tauri build
```

Produces a native binary in `src-tauri/target/release/`.

## Tests

```bash
# Frontend (270 tests)
pnpm test

# Rust backend (26 tests)
cd src-tauri && cargo test --lib
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+J | Toggle document ↔ conversation |
| Ctrl+O | Library |
| Ctrl+N | New note |
| Ctrl+D | Distill conversation → document |
| Ctrl+B | Fork conversation |
| Ctrl+Return | Inline Q&A in document |
| Tab | Inline AI generation (at line start) |
| Esc | Dismiss / collapse |

## Design Philosophy

> *"Making the solution seem so completely inevitable and obvious, so uncontrived and natural — it's so hard."*
> — Jony Ive

The app always returns to writing. That is its resting state. Its home. Its purpose.

- **One typeface, one theme, one density.** Design decisions, not preferences.
- **Color is information, not decoration.** The only color is functional — status dots, the AI insertion state, tag chips.
- **Motion is meaning.** The tray rises from below (context supports writing). The library slides from the left (navigation is beside your work). Nothing moves for fun.
- **No visible chrome.** No toolbar, no status bar, no menu bar. The window is the document.

## License

Private. © 2026
