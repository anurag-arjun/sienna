//! Claude conversation import — parses Claude JSON export into pi sessions + SQLite notes.
//!
//! Uses pi's native Session API to create proper JSONL files that are continuable.

use crate::db::store::{self, CreateNote};
use pi::model::{
    AssistantMessage, ContentBlock, StopReason, TextContent, Usage, UserContent,
};
use pi::session::{Session, SessionMessage};
use rusqlite::Connection;
use serde::Deserialize;
use std::path::PathBuf;

// ── Claude Export Types ────────────────────────────────────────────────

/// Root structure of Claude's JSON export.
#[derive(Debug, Deserialize)]
pub struct ClaudeExport(pub Vec<ClaudeConversation>);

/// A single conversation from the Claude export.
#[derive(Debug, Deserialize)]
pub struct ClaudeConversation {
    pub uuid: String,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub chat_messages: Vec<ClaudeMessage>,
}

/// A content block in a Claude message (multimodal support).
#[derive(Debug, Deserialize)]
pub struct ClaudeContentBlock {
    #[serde(rename = "type")]
    pub block_type: Option<String>,
    pub text: Option<String>,
}

/// An attachment in a Claude message.
#[derive(Debug, Deserialize)]
pub struct ClaudeAttachment {
    pub file_name: Option<String>,
    pub extracted_content: Option<String>,
}

/// A message in a Claude conversation.
#[derive(Debug, Deserialize)]
pub struct ClaudeMessage {
    pub uuid: String,
    pub sender: String, // "human" or "assistant"
    #[serde(default)]
    pub text: String,
    pub created_at: String,
    pub updated_at: String,
    /// Structured content blocks (alternative to text field)
    #[serde(default)]
    pub content: Vec<ClaudeContentBlock>,
    /// File attachments with extracted content
    #[serde(default)]
    pub attachments: Vec<ClaudeAttachment>,
}

// ── Import Result ──────────────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize)]
pub struct ImportResult {
    pub conversations_imported: usize,
    pub messages_imported: usize,
    pub errors: Vec<String>,
}

// ── Import Logic ───────────────────────────────────────────────────────

/// Extract the full text content from a Claude message.
/// Prefers `text` field, falls back to `content` blocks, appends attachment content.
fn extract_message_text(msg: &ClaudeMessage) -> String {
    let mut text = if !msg.text.is_empty() {
        msg.text.clone()
    } else {
        // Fall back to content blocks
        msg.content
            .iter()
            .filter_map(|block| {
                if block.block_type.as_deref() == Some("text") {
                    block.text.clone()
                } else {
                    None
                }
            })
            .collect::<Vec<_>>()
            .join("\n")
    };

    // Append attachment content
    for attachment in &msg.attachments {
        if let Some(ref content) = attachment.extracted_content {
            let name = attachment.file_name.as_deref().unwrap_or("attachment");
            if !text.is_empty() {
                text.push_str("\n\n");
            }
            text.push_str(&format!("[Attachment: {name}]\n{content}"));
        }
    }

    text
}

/// Parse a Claude JSON export string.
pub fn parse_claude_export(json: &str) -> Result<Vec<ClaudeConversation>, String> {
    // Claude export is an array of conversations
    let conversations: Vec<ClaudeConversation> =
        serde_json::from_str(json).map_err(|e| format!("Invalid Claude export JSON: {e}"))?;
    Ok(conversations)
}

/// Import Claude conversations into pi sessions and SQLite notes.
pub fn import_claude_conversations(
    conn: &Connection,
    conversations: &[ClaudeConversation],
    session_dir: &PathBuf,
) -> ImportResult {
    let mut result = ImportResult {
        conversations_imported: 0,
        messages_imported: 0,
        errors: Vec::new(),
    };

    std::fs::create_dir_all(session_dir).ok();

    for conv in conversations {
        match import_single_conversation(conn, conv, session_dir) {
            Ok(msg_count) => {
                result.conversations_imported += 1;
                result.messages_imported += msg_count;
            }
            Err(e) => {
                result
                    .errors
                    .push(format!("Failed to import '{}': {e}", conv.name));
            }
        }
    }

    result
}

fn import_single_conversation(
    conn: &Connection,
    conv: &ClaudeConversation,
    session_dir: &PathBuf,
) -> Result<usize, String> {
    if conv.chat_messages.is_empty() {
        return Ok(0);
    }

    // Create a pi session and populate with messages
    let mut session = Session::create_with_dir(Some(session_dir.clone()));

    let mut msg_count = 0;
    for msg in &conv.chat_messages {
        let timestamp = parse_timestamp(&msg.created_at);
        let text = extract_message_text(msg);
        if text.is_empty() {
            continue;
        }
        match msg.sender.as_str() {
            "human" => {
                session.append_message(SessionMessage::User {
                    content: UserContent::Text(text),
                    timestamp: Some(timestamp),
                });
                msg_count += 1;
            }
            "assistant" => {
                session.append_message(SessionMessage::Assistant {
                    message: AssistantMessage {
                        content: vec![ContentBlock::Text(TextContent::new(&text))],
                        api: "messages".to_string(),
                        provider: "anthropic".to_string(),
                        model: "claude-import".to_string(),
                        usage: Usage::default(),
                        stop_reason: StopReason::Stop,
                        error_message: None,
                        timestamp,
                    },
                });
                msg_count += 1;
            }
            other => {
                // Skip unknown sender types
                log::warn!("Unknown sender type '{}' in conversation '{}'", other, conv.name);
            }
        }
    }

    // Save the session to a JSONL file
    // We need to use the blocking save approach since we're in sync context
    let session_path = session_dir.join(format!("claude-import-{}.jsonl", conv.uuid));
    session.path = Some(session_path.clone());

    // Write the session entries as JSONL
    write_session_jsonl(&session, &session_path)?;

    // Create a note in SQLite pointing to this session
    let created_ts = parse_timestamp(&conv.created_at);
    let first_user_msg = conv
        .chat_messages
        .iter()
        .find(|m| m.sender == "human")
        .map(|m| extract_message_text(m))
        .unwrap_or_default();
    let excerpt = first_user_msg.chars().take(200).collect::<String>();

    store::create_note(
        conn,
        &CreateNote {
            note_type: "conversation".to_string(),
            title: conv.name.clone(),
            content: Some(excerpt),
            pi_session: Some(session_path.to_string_lossy().to_string()),
            tags: Some(vec!["imported".to_string(), "claude".to_string()]),
        },
    )?;

    Ok(msg_count)
}

/// Write session entries as JSONL manually (since Session::save is async).
fn write_session_jsonl(session: &Session, path: &PathBuf) -> Result<(), String> {
    use std::io::Write;

    let file = std::fs::File::create(path)
        .map_err(|e| format!("Cannot create session file {}: {e}", path.display()))?;
    let mut writer = std::io::BufWriter::new(file);

    // Write header
    serde_json::to_writer(&mut writer, &session.header)
        .map_err(|e| format!("Failed to serialize header: {e}"))?;
    writer
        .write_all(b"\n")
        .map_err(|e| format!("Write error: {e}"))?;

    // Write entries
    for entry in &session.entries {
        serde_json::to_writer(&mut writer, entry)
            .map_err(|e| format!("Failed to serialize entry: {e}"))?;
        writer
            .write_all(b"\n")
            .map_err(|e| format!("Write error: {e}"))?;
    }

    writer.flush().map_err(|e| format!("Flush error: {e}"))?;
    Ok(())
}

fn parse_timestamp(s: &str) -> i64 {
    chrono::DateTime::parse_from_rfc3339(s)
        .or_else(|_| chrono::DateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S%.f"))
        .map(|dt| dt.timestamp())
        .unwrap_or_else(|_| chrono::Utc::now().timestamp())
}

// ── Tests ──────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::init_memory_db;
    use tempfile::TempDir;

    fn sample_export() -> &'static str {
        r#"[
            {
                "uuid": "conv-001",
                "name": "Test Conversation",
                "created_at": "2025-01-15T10:00:00Z",
                "updated_at": "2025-01-15T10:05:00Z",
                "chat_messages": [
                    {
                        "uuid": "msg-001",
                        "sender": "human",
                        "text": "Hello Claude!",
                        "created_at": "2025-01-15T10:00:00Z",
                        "updated_at": "2025-01-15T10:00:00Z"
                    },
                    {
                        "uuid": "msg-002",
                        "sender": "assistant",
                        "text": "Hello! How can I help you today?",
                        "created_at": "2025-01-15T10:00:05Z",
                        "updated_at": "2025-01-15T10:00:05Z"
                    }
                ]
            },
            {
                "uuid": "conv-002",
                "name": "Second Chat",
                "created_at": "2025-01-16T10:00:00Z",
                "updated_at": "2025-01-16T10:10:00Z",
                "chat_messages": [
                    {
                        "uuid": "msg-003",
                        "sender": "human",
                        "text": "What is Rust?",
                        "created_at": "2025-01-16T10:00:00Z",
                        "updated_at": "2025-01-16T10:00:00Z"
                    },
                    {
                        "uuid": "msg-004",
                        "sender": "assistant",
                        "text": "Rust is a systems programming language.",
                        "created_at": "2025-01-16T10:00:10Z",
                        "updated_at": "2025-01-16T10:00:10Z"
                    },
                    {
                        "uuid": "msg-005",
                        "sender": "human",
                        "text": "Tell me more",
                        "created_at": "2025-01-16T10:01:00Z",
                        "updated_at": "2025-01-16T10:01:00Z"
                    },
                    {
                        "uuid": "msg-006",
                        "sender": "assistant",
                        "text": "It focuses on safety, speed, and concurrency.",
                        "created_at": "2025-01-16T10:01:10Z",
                        "updated_at": "2025-01-16T10:01:10Z"
                    }
                ]
            }
        ]"#
    }

    #[test]
    fn test_parse_claude_export() {
        let conversations = parse_claude_export(sample_export()).unwrap();
        assert_eq!(conversations.len(), 2);
        assert_eq!(conversations[0].name, "Test Conversation");
        assert_eq!(conversations[0].chat_messages.len(), 2);
        assert_eq!(conversations[1].chat_messages.len(), 4);
    }

    #[test]
    fn test_parse_malformed_json() {
        let result = parse_claude_export("not json");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid Claude export JSON"));
    }

    #[test]
    fn test_parse_empty_array() {
        let conversations = parse_claude_export("[]").unwrap();
        assert_eq!(conversations.len(), 0);
    }

    #[test]
    fn test_import_creates_notes_and_sessions() {
        let conn = init_memory_db().unwrap();
        let tmp_dir = TempDir::new().unwrap();
        let session_dir = tmp_dir.path().to_path_buf();

        let conversations = parse_claude_export(sample_export()).unwrap();
        let result = import_claude_conversations(&conn, &conversations, &session_dir);

        assert_eq!(result.conversations_imported, 2);
        assert_eq!(result.messages_imported, 6);
        assert!(result.errors.is_empty());

        // Verify notes were created
        let notes = store::list_notes(
            &conn,
            &store::NoteFilter {
                status: None,
                note_type: None,
                tag: Some("imported".to_string()),
                search: None,
                limit: None,
                offset: None,
            },
        )
        .unwrap();
        assert_eq!(notes.len(), 2);
        assert!(notes.iter().any(|n| n.title == "Test Conversation"));
        assert!(notes.iter().any(|n| n.title == "Second Chat"));

        // Verify tags
        for note in &notes {
            assert!(note.tags.contains(&"imported".to_string()));
            assert!(note.tags.contains(&"claude".to_string()));
        }

        // Verify pi_session paths
        for note in &notes {
            assert!(note.pi_session.is_some());
            let path = note.pi_session.as_ref().unwrap();
            assert!(path.ends_with(".jsonl"));
            assert!(std::path::Path::new(path).exists());
        }

        // Verify JSONL files contain valid content
        for note in &notes {
            let path = note.pi_session.as_ref().unwrap();
            let content = std::fs::read_to_string(path).unwrap();
            let lines: Vec<&str> = content.lines().collect();
            assert!(lines.len() >= 2, "JSONL should have header + entries");

            // First line should be a valid JSON header
            let _header: serde_json::Value =
                serde_json::from_str(lines[0]).expect("Header should be valid JSON");
        }
    }

    #[test]
    fn test_import_empty_conversation() {
        let conn = init_memory_db().unwrap();
        let tmp_dir = TempDir::new().unwrap();
        let session_dir = tmp_dir.path().to_path_buf();

        let json = r#"[{
            "uuid": "empty-conv",
            "name": "Empty",
            "created_at": "2025-01-15T10:00:00Z",
            "updated_at": "2025-01-15T10:00:00Z",
            "chat_messages": []
        }]"#;

        let conversations = parse_claude_export(json).unwrap();
        let result = import_claude_conversations(&conn, &conversations, &session_dir);

        assert_eq!(result.conversations_imported, 1);
        assert_eq!(result.messages_imported, 0);
    }

    #[test]
    fn test_fts_indexes_imported_content() {
        let conn = init_memory_db().unwrap();
        let tmp_dir = TempDir::new().unwrap();
        let session_dir = tmp_dir.path().to_path_buf();

        let conversations = parse_claude_export(sample_export()).unwrap();
        import_claude_conversations(&conn, &conversations, &session_dir);

        // Search for content from the first conversation
        let results = store::list_notes(
            &conn,
            &store::NoteFilter {
                status: None,
                note_type: None,
                tag: None,
                search: Some("Hello Claude".to_string()),
                limit: None,
                offset: None,
            },
        )
        .unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].title, "Test Conversation");
    }

    #[test]
    fn test_message_alternation_preserved() {
        let conversations = parse_claude_export(sample_export()).unwrap();
        let conv = &conversations[1]; // Second Chat has 4 messages

        assert_eq!(conv.chat_messages[0].sender, "human");
        assert_eq!(conv.chat_messages[1].sender, "assistant");
        assert_eq!(conv.chat_messages[2].sender, "human");
        assert_eq!(conv.chat_messages[3].sender, "assistant");
    }

    #[test]
    fn test_content_blocks_fallback() {
        let json = r#"[{
            "uuid": "conv-blocks",
            "name": "Content Blocks Test",
            "created_at": "2025-01-15T10:00:00Z",
            "updated_at": "2025-01-15T10:00:00Z",
            "chat_messages": [
                {
                    "uuid": "msg-b1",
                    "sender": "human",
                    "text": "",
                    "content": [{"type": "text", "text": "Hello from content block"}],
                    "created_at": "2025-01-15T10:00:00Z",
                    "updated_at": "2025-01-15T10:00:00Z"
                },
                {
                    "uuid": "msg-b2",
                    "sender": "assistant",
                    "text": "Direct text response",
                    "content": [],
                    "created_at": "2025-01-15T10:00:05Z",
                    "updated_at": "2025-01-15T10:00:05Z"
                }
            ]
        }]"#;

        let conn = init_memory_db().unwrap();
        let tmp_dir = TempDir::new().unwrap();
        let conversations = parse_claude_export(json).unwrap();
        let result =
            import_claude_conversations(&conn, &conversations, &tmp_dir.path().to_path_buf());

        assert_eq!(result.conversations_imported, 1);
        assert_eq!(result.messages_imported, 2);

        // Verify FTS found content from the content block
        let results = store::list_notes(
            &conn,
            &store::NoteFilter {
                status: None,
                note_type: None,
                tag: None,
                search: Some("content block".to_string()),
                limit: None,
                offset: None,
            },
        )
        .unwrap();
        assert_eq!(results.len(), 1);
    }

    #[test]
    fn test_attachments_included() {
        let json = r#"[{
            "uuid": "conv-attach",
            "name": "Attachment Test",
            "created_at": "2025-01-15T10:00:00Z",
            "updated_at": "2025-01-15T10:00:00Z",
            "chat_messages": [
                {
                    "uuid": "msg-a1",
                    "sender": "human",
                    "text": "Check this file",
                    "content": [],
                    "attachments": [
                        {
                            "file_name": "notes.txt",
                            "extracted_content": "Important notes here"
                        }
                    ],
                    "created_at": "2025-01-15T10:00:00Z",
                    "updated_at": "2025-01-15T10:00:00Z"
                }
            ]
        }]"#;

        let conversations = parse_claude_export(json).unwrap();
        let msg = &conversations[0].chat_messages[0];
        let text = extract_message_text(msg);
        assert!(text.contains("Check this file"));
        assert!(text.contains("[Attachment: notes.txt]"));
        assert!(text.contains("Important notes here"));
    }

    #[test]
    fn test_timestamp_parsing() {
        // RFC3339
        let ts = parse_timestamp("2025-01-15T10:00:00Z");
        assert!(ts > 0);

        // With fractional seconds
        let ts2 = parse_timestamp("2025-01-15T10:00:00.123Z");
        assert!(ts2 > 0);

        // Fallback for invalid
        let ts3 = parse_timestamp("invalid");
        assert!(ts3 > 0); // Falls back to now
    }
}
