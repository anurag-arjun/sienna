# Mood Editor — Plan

## Vision

A single-surface desktop app for thinking with AI, where conversations and documents coexist on the same page. Replaces Claude web/mobile chat, scattered plan.md workflows, and blog/tweet drafting — all powered by pi_agent_rust embedded natively in a Tauri backend.

The UX follows Jony Ive's design principles: inevitability, true simplicity, and technology that disappears. One page. Three gestures. No chrome.

## Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Desktop shell | **Tauri v2** | Lightweight (~15-30MB), Rust backend matches pi_agent_rust natively |
| AI engine | **pi_agent_rust** (linked as Rust crate) | No sidecar, no subprocess, no serialization. Agent loop runs in-process. |
| Frontend | **React 19 + TypeScript** | Component model, ecosystem, CodeMirror bindings |
| Editor | **CodeMirror 6** | Hybrid inline Markdown rendering, extensible, performant |
| Note storage | **SQLite** (via `rusqlite` in Tauri backend) | Notes, tags, context sets, metadata |
| Conversation storage | **Pi JSONL sessions** | Tree-structured branching, compaction, format-compatible with pi CLI |
| Styling | **Tailwind CSS v4** | Utility-driven, matches the precise spacing/typography control needed |

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Tauri Webview (React + CodeMirror 6)                    │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  The Page                                          │  │
│  │  - Conversation mode (Enter sends to AI)           │  │
│  │  - Document mode (Enter = new line)                │  │
│  │  - Hybrid mode (document with inline conversations)│  │
│  ├────────────────────────────────────────────────────┤  │
│  │  ▲ Context Tray (drag up from bottom)              │  │
│  └────────────────────────────────────────────────────┘  │
│  ← Library (Cmd+O)          Ship Sheet (Cmd+E) ↓        │
├──────────────────────────────────────────────────────────┤
│  Tauri IPC (invoke commands + event stream)              │
├──────────────────────────────────────────────────────────┤
│  Rust Backend                                            │
│                                                          │
│  ┌──────────────────┐  ┌───────────────────────────────┐ │
│  │  pi crate        │  │  App Services                 │ │
│  │  (linked)        │  │                               │ │
│  │                  │  │  - NoteStore (SQLite)          │ │
│  │  - AgentSession  │  │  - ContextSetManager          │ │
│  │  - ToolRegistry  │  │  - GitHubService (reqwest)    │ │
│  │  - Session JSONL │  │  - NotionService (reqwest)    │ │
│  │  - Compaction    │  │  - FileWatcher (notify crate) │ │
│  │  - Extensions    │  │  - ClaudeImporter             │ │
│  │  - ModelRegistry │  │  - ShipService                │ │
│  │  - AuthStorage   │  │                               │ │
│  └──────────────────┘  └───────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

## Data Model

### SQLite Schema (notes, metadata, context)

```sql
CREATE TABLE notes (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL CHECK(type IN ('conversation','document','hybrid')),
  title         TEXT NOT NULL DEFAULT '',
  content       TEXT,                    -- markdown body for documents
  pi_session    TEXT,                    -- path to pi JSONL file for conversations
  status        TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','dropped')),
  pinned        INTEGER NOT NULL DEFAULT 0,
  context_set   TEXT REFERENCES context_sets(id),
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE tags (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  color         TEXT,
  template      TEXT                     -- markdown template triggered by this tag
);

CREATE TABLE note_tags (
  note_id       TEXT REFERENCES notes(id) ON DELETE CASCADE,
  tag_id        TEXT REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, tag_id)
);

CREATE TABLE context_sets (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  trigger_tags  TEXT NOT NULL DEFAULT '[]'  -- JSON array of tag names
);

CREATE TABLE context_items (
  id            TEXT PRIMARY KEY,
  context_set   TEXT REFERENCES context_sets(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK(type IN ('local','github','notion','note','url','clipboard')),
  reference     TEXT NOT NULL,            -- file path, repo+path, notion page ID, URL, etc.
  label         TEXT NOT NULL,
  pinned        INTEGER NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE note_context (
  id            TEXT PRIMARY KEY,
  note_id       TEXT REFERENCES notes(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,
  reference     TEXT NOT NULL,
  label         TEXT NOT NULL,
  content_cache TEXT,                     -- cached content for quick load
  sort_order    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE note_links (
  source_id     TEXT REFERENCES notes(id) ON DELETE CASCADE,
  target_id     TEXT REFERENCES notes(id) ON DELETE CASCADE,
  link_type     TEXT NOT NULL CHECK(link_type IN ('distilled_from','references','forked_from')),
  PRIMARY KEY (source_id, target_id)
);

CREATE VIRTUAL TABLE notes_fts USING fts5(title, content, content=notes, content_rowid=rowid);
```

### Pi Session Bridge

Each conversation note stores a `pi_session` path pointing to a pi JSONL file. When opening a conversation:

```rust
let handle = pi::sdk::create_agent_session(SessionOptions {
    session_path: Some(note.pi_session.into()),
    working_directory: Some(project_dir.into()),
    system_prompt: Some(build_prompt_for_note_type(&note)),
    ..Default::default()
}).await?;
```

When creating a new conversation, pi generates the JSONL file and we store the path in SQLite.

## UX Design

### The Five States

| State | Gesture | Description |
|-------|---------|-------------|
| **Writing** | Default | Blank page, cursor, your text. The resting state. |
| **Conversing** | Type + Enter | Messages flow as dialogue. AI responds inline. |
| **Gathering** | Drag up from bottom | Context tray rises. Search files, repos, notes. |
| **Navigating** | Cmd+O or swipe left | Library slides in. All notes, searchable. |
| **Shipping** | Cmd+E | Export sheet drops. Save, copy, push. |

Every state returns to writing/conversing. The page is always the page.

### Contextual Behavior (Tag-Determined)

The note's tag determines whether Enter sends a message or inserts a newline:

| Tag | Mode | Enter behavior | Template |
|-----|------|---------------|----------|
| `#chat` (or no tag) | Conversation | Sends to AI | None |
| `#plan` | Document | New line | Plan template (Goal, Context, Constraints, Steps, Acceptance Criteria) |
| `#blog` | Document | New line | Blog template (title, intro, sections) |
| `#tweet` | Document | New line | Tweet template with character count |
| `#scratch` | Document | New line | None — freeform |

Typing a tag as the first word of a new note triggers the template and sets the mode. The tag appears in the note list and sidebar.

### The Page

- **One typeface family**, one set of proportions. Not configurable. Designed correctly once.
- **Warm dark palette**: not pure black, not cold. Something like `#1e1e2e` background.
- **No toolbar, no status bar, no menu bar.** The window is the document.
- **Hybrid inline Markdown rendering**: headings render as headings, bold as bold, code blocks with syntax highlighting. When cursor enters a Markdown element, raw syntax appears. When cursor leaves, it re-renders.
- **Conversation rendering**: your messages in one weight, AI responses in a lighter one. No bubbles, no avatars. Dialogue flows like prose.
- **Word count and reading time** appear as a whisper at the bottom when you pause typing, then fade.

### Context Tray

- Rises from the bottom of the window (like iOS Control Center). Translucent overlay, writing still visible behind it.
- **Universal search field**: type a filename → filesystem search. Type a repo name → GitHub. Type a note title → previous notes. Paste a URL → fetches content. Type a Notion page → searches workspace.
- Results grouped by source with small monochrome icons (folder, GitHub mark, Notion mark). No labels.
- Each result becomes a **card**: filename, first few lines, thin proportional bar for relative size (no raw token counts).
- Cards can be expanded, reordered, removed.
- **Context sets**: when a tag triggers a context set, items appear pre-loaded in the tray (slightly muted, with set name as whisper label). Note-specific items below.
- Pushing the tray down dismisses it. A tiny number in the bottom margin shows attached context count.

### Library (Note List)

- Full view that slides in from the left, not a persistent sidebar.
- Notes sorted by last edited. Each shows: first line as title, one-line excerpt, soft date, status dot, tag chips.
- 💬 icon for conversations, 📄 icon for documents. Subtle, not colored.
- Search at top: full-text across titles, content, tags. Qualifiers: `tag:plan`, `status:active`.
- Tap a tag anywhere → list filters instantly.
- Tap "All Notes" header → expands to show notebooks. Flat list, not tree.
- Status dots: active = calm blue, completed = green, dropped = muted grey.
- Completed/dropped notes hidden from default view. Accessible via status filter.

### AI Interaction

**Inline invocation (document mode):** Place cursor or select text, press Tab at start of line. A thin glowing insertion line appears. Type instruction in natural language. Press Enter → instruction disappears, AI generates text in-place. Generated text appears slightly lighter. Press Enter to accept (text normalizes). Press Esc to dismiss.

**Conversation mode:** Type message, press Enter. Your message moves up, AI responds below. Context tray contents included automatically in every message. Conversation history persists.

**Conversation-in-document:** From anywhere in a document, press Cmd+Return to start an inline conversation. AI Q&A happens below your cursor. When done, Esc collapses the conversation into a margin annotation. Tap to review later.

**Steering:** While AI is streaming, type and press Enter to steer (pi's `steer` command). Interrupts current generation with new instruction.

### Distill Flow (Conversation → Document)

In a conversation, press Cmd+D. An inline prompt appears:

```
Distill into → ▊
```

Type `plan.md`, `blog`, `tweet`, or nothing (raw lift). AI synthesizes the conversation into a structured document. The new document opens beside the conversation briefly (split view for verification), then goes full-page. The conversation is linked via `note_links` (type: `distilled_from`).

### Ship Sheet

Drops from the top when pressing Cmd+E. Destinations:

- **Save to file** — native save dialog, defaults to project directory
- **Copy as Markdown** — raw Markdown to clipboard
- **Copy as text** — stripped plain text
- **Push to GitHub** — branch, path, commit message (3 fields, 1 button)
- **Run with agent** — save plan.md to path, shell out `pi <path>` or configured agent command

Optional: "Include source conversation" checkbox (off by default).

### Conversation Forking

Select any AI message, press Cmd+B. A fork creates a new conversation branch from that point. Both branches share history up to the fork. Pi's `session.fork(entryId)` handles the JSONL branching natively.

Forks appear as linked notes in the library. Can compare two forks side-by-side (the one exception to the single-surface rule).

## Context Integration

### Local Files
- Tauri's `fs` API for native file access
- File picker via Tauri's dialog plugin
- Optional watch mode (re-read on change) via `notify` crate
- Directory mode: read all files respecting `.gitignore`, up to depth limit

### GitHub
- REST API via `reqwest` + `octocrab` crate
- PAT-based auth stored in app settings
- Browse: repos → tree → files, PRs (diff), issues (thread content)
- File content fetched and held as context items

### Notion
- REST API via `reqwest`
- OAuth flow via Tauri's deep link / redirect
- Browse: workspaces → databases → pages
- Page content converted from Notion blocks to Markdown

### Context Sets as Pi Extensions
Context sets inject their items before each LLM turn. Implemented as a pi extension:

```rust
// Pseudo-code for context set injection
agent_session.enable_extensions_with_policy(
    &tools,
    &cwd,
    Some(&config),
    &[context_set_extension_path],
    // ...
).await?;
```

The extension reads the active context set from SQLite, assembles the content, and injects it as additional system prompt or user context before each turn.

## Claude Import

Parse Claude's JSON export format into pi JSONL sessions + SQLite note records:

1. User provides Claude export JSON file
2. Parser extracts conversations, preserving message structure and timestamps
3. Each conversation → one pi JSONL session file + one SQLite note record
4. Auto-tagged `#imported/claude`
5. Fully searchable and continuable after import

## Visual Language

- **Background**: warm neutral dark (`#1e1e2e` range)
- **Text**: near-black on light, near-white on dark
- **Color is functional only**: status dots (blue/green/grey), tag chips (user-assigned), AI insertion state (gentle warmth)
- **No gradients, no accent colors on buttons, no decorative elements**
- **Motion is meaning**: tray rises from below (context supports writing), library slides from left (navigation is beside), AI text materializes (result, not performance)
- **Transitions**: 150-200ms ease. Fast but not jarring.
- **One density setting**: the right one. Not configurable.

## Phase 2: Desktop Coding Agent

After Phase 1 is stable (3-6 months):

- **Lock/unlock icon** on context items: locked = read-only, unlocked = AI can write
- Pi's built-in tools (read/write/edit/bash) surface as **inline action items** in conversations
- Each action shows: description, expandable diff, individual approve/reject
- **Granular approval**: per-action accept/reject/modify (not binary y/n)
- **Command output** renders inline, collapsible
- **No new UI paradigm**: same conversation surface, AI just gains write capabilities

## Build Order

| # | Item | What it delivers | Depends on |
|---|------|-----------------|------------|
| 1 | **Tauri + React scaffold** | Window, IPC bridge, Tailwind, warm dark theme shell | — |
| 2 | **CodeMirror 6 hybrid editor** | Inline Markdown rendering, cursor-aware syntax toggle | 1 |
| 3 | **Pi crate integration** | `create_agent_session()` in Tauri backend, event stream to frontend | 1 |
| 4 | **Conversation rendering** | Subscribe to pi events, render messages on the page, Enter-to-send | 2, 3 |
| 5 | **SQLite note store** | CRUD notes, tags, FTS search, status filtering | 1 |
| 6 | **Library view** | Cmd+O note list, search, tag filter, note switching | 4, 5 |
| 7 | **Tag-based mode switching** | #chat/#plan/#blog/#tweet tags, templates, contextual Enter | 4, 5 |
| 8 | **Context tray — local files** | Drag-up tray, file picker, file reading, token estimation | 1, 3 |
| 9 | **Context sets** | Persistent context collections, tag-triggered loading, pi extension injection | 5, 8 |
| 10 | **Inline document AI** | Tab-to-invoke, inline instruction, inline generation in document mode | 2, 3 |
| 11 | **Distill flow** | Cmd+D conversation→document synthesis, linked pairs | 4, 7 |
| 12 | **Claude import** | JSON parser, bulk import to pi JSONL + SQLite | 5, 3 |
| 13 | **GitHub context** | PAT auth, repo browser, file/PR/issue fetching | 8 |
| 14 | **Notion context** | OAuth, page browser, blocks→Markdown conversion | 8 |
| 15 | **Ship sheet** | Cmd+E, save to file, copy, push to GitHub | 1, 13 |
| 16 | **Conversation forking** | Cmd+B, pi `fork()`, branch comparison | 4, 6 |
| 17 | **Multi-model support** | Model picker, mid-conversation switching, response attribution | 3 |
| 18 | **Conversation-in-document** | Cmd+Return inline Q&A, collapsible margin annotations | 2, 4 |

Items 1-6 produce a usable daily-driver: a local AI chat with Markdown rendering, persistent searchable history, and pi's full capabilities. Items 7-11 make it a writing workbench. Items 12-18 make it complete.

## Risks

| Risk | Mitigation |
|------|-----------|
| pi_agent_rust is v0.1.8, SDK declared unstable | Pin to specific version. Wrap SDK calls in a thin adapter layer so swapping to TypeScript pi (via RPC sidecar) is feasible if needed. |
| pi_agent_rust only supports Anthropic/OpenAI/Gemini/Azure | Sufficient for current needs. Additional providers are out-of-scope for the Rust port but available via TypeScript pi if needed later. |
| CodeMirror 6 hybrid rendering is complex | Start with standard Markdown highlighting. Add inline rendering incrementally. The app is usable with a simpler editor. |
| Tauri v2 IPC for streaming events | Use Tauri's event system (`app.emit()` from Rust, `listen()` in JS). Test with high-frequency pi events early. |
| JSONL session files + SQLite = two storage systems | Clear ownership: pi owns conversation content (JSONL), app owns metadata (SQLite). Bridge is the `pi_session` path in the notes table. |
| Single-surface UX ambiguity (conversation vs document) | Tag-based mode determination eliminates ambiguity. Mode is explicit but lightweight — one word sets it. |
