# Mood Editor

A desktop Markdown editor with built-in AI. Write documents, have conversations, or do both on the same page.

![Tauri](https://img.shields.io/badge/Tauri-v2-blue) ![React](https://img.shields.io/badge/React-19-blue) ![License](https://img.shields.io/badge/license-private-lightgrey)

## What it does

You get a single writing surface. Start typing and it's a Markdown editor with inline rendering — headings render as headings, bold as bold. Press Ctrl+J and it becomes an AI conversation. Press Ctrl+J again and you're back to writing.

The two modes blur together. You can ask the AI a question inside your document (Ctrl+Return), have a back-and-forth, then collapse it into a tiny dot in the margin. You can distill a conversation into a structured document (Ctrl+D). You can fork a conversation to explore a different direction (Ctrl+B).

Context — files, notes, URLs — attaches via a slide-up tray and feeds into every AI interaction automatically. No copy-pasting.

## Quick Start

**Prerequisites:** Rust (stable), Node.js 22+, pnpm, [Tauri v2 system deps](https://v2.tauri.app/start/prerequisites/)

```bash
git clone https://github.com/anurag-arjun/mood-editor.git
cd mood-editor
pnpm install
pnpm tauri dev
```

You'll need API keys for at least one provider (Anthropic, OpenAI, or Google) configured in your environment.

## Shortcuts

| Key | What it does |
|-----|-------------|
| Ctrl+J | Switch between writing and conversation |
| Ctrl+Return | Ask the AI a question inline, right in your document |
| Tab (line start) | Generate text with AI — type an instruction, Enter to run |
| Ctrl+D | Turn a conversation into a document |
| Ctrl+B | Fork a conversation |
| Ctrl+O | Open your notes library |
| Ctrl+N | New blank note |
| Esc | Close panels, dismiss AI output, collapse inline Q&A |

## How it works

**Editor** — CodeMirror 6 with hybrid inline Markdown rendering. Cursor-aware: formatting characters hide when you're not editing them, reappear when your cursor enters.

**AI** — [pi_agent_rust](https://crates.io/crates/pi_agent_rust) runs in-process as a linked Rust crate. No sidecar, no subprocess. Supports Anthropic, OpenAI, and Google models with mid-conversation switching.

**Storage** — SQLite for notes, tags, and context. Pi JSONL for conversation history (tree-structured, forkable).

**Context tray** — Slide up from the bottom. Search for files on disk, notes in your library, or paste URLs. Attached context is included in every AI message. Context sets let you auto-load specific files whenever a tag is used (e.g. `#blog` always loads your style guide).

**Tags as modes** — The first-line tag determines behavior. `#chat` makes Enter send messages. `#plan` loads a plan template. `#blog`, `#tweet`, `#scratch` each have their own defaults. No mode picker — just type.

## Stack

Tauri v2 + React 19 + CodeMirror 6 + Tailwind CSS v4 + SQLite + pi_agent_rust. Single binary, ~15–30MB.

## Tests

```bash
pnpm test              # 270 frontend tests (Vitest)
cd src-tauri && cargo test --lib  # 26 backend tests
```

## Status

Core surface is functional. Remaining work: GitHub/Notion context integrations, export/publish sheet, Wayland workaround, live AI testing.

## License

Private. © 2026
