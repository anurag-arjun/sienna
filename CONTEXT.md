# Mood Editor — Context

## Project Overview

A single-surface desktop app for AI-assisted writing and conversation, built with Tauri + React + pi_agent_rust. Replaces Claude web/mobile chat, plan.md generation workflows, and content drafting.

## Architecture Decisions

- **Tauri v2 + pi_agent_rust (Option E)**: pi's Rust port linked directly as a crate in Tauri's backend. No sidecar, no subprocess, no Electron. Single binary ~15-30MB.
- **React 19 + CodeMirror 6**: Hybrid inline Markdown rendering. Cursor-aware syntax toggle.
- **SQLite + pi JSONL**: SQLite for notes/tags/context sets/metadata. Pi JSONL for conversation content. Bridge via `pi_session` path in notes table.
- **Tailwind CSS v4**: Utility-driven styling. Warm dark theme as only theme.
- **Contextual mode switching**: Tags (#chat, #plan, #blog, #tweet) determine Enter behavior (send vs newline) and templates.
- **Single-surface UX (Ive-inspired)**: One page, five states (writing/conversing/gathering/navigating/shipping), three gestures (up=context, left=library, down=ship).
- **No offline/local models**: Cloud providers only (Anthropic, OpenAI, Gemini, Azure).
- **Phase 2 coding agent**: Same surface, pi tools gain write permissions via lock/unlock icon on context items.

## Git State

No git repo initialized yet. Project is in planning phase.

## Key Files

- `docs/plan.md` — Full project plan with architecture, data model, UX design, build order (18 items)
- `docs/conv.md` — Original brainstorming conversation that produced the plan

## Dependencies (Planned)

### Rust (Tauri backend)
- `tauri` v2
- `pi_agent_rust` (pi crate) — linked as library
- `rusqlite` — SQLite for note storage
- `reqwest` — HTTP client for GitHub/Notion APIs
- `notify` — file watcher for context tray
- `octocrab` — GitHub API client
- `serde` / `serde_json` — serialization

### Frontend (React)
- `react` 19
- `@codemirror/state`, `@codemirror/view`, `@codemirror/lang-markdown` — editor
- `tailwindcss` v4
- `@tauri-apps/api` — IPC bridge

## Current Status

Planning complete. Ready to begin build item 1 (Tauri + React scaffold).
