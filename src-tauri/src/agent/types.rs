//! Serializable types for frontend communication.
//!
//! These mirror pi SDK types but are simplified for JSON serialization
//! over Tauri IPC events.

use serde::{Deserialize, Serialize};

/// Options for creating a new agent session.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateSessionRequest {
    /// AI provider (e.g. "anthropic", "openai")
    pub provider: Option<String>,
    /// Model ID (e.g. "claude-sonnet-4-20250514")
    pub model: Option<String>,
    /// API key override (if not using stored auth)
    pub api_key: Option<String>,
    /// System prompt override
    pub system_prompt: Option<String>,
    /// Append to default system prompt
    pub append_system_prompt: Option<String>,
    /// Working directory for tools
    pub working_directory: Option<String>,
    /// Path to existing session JSONL
    pub session_path: Option<String>,
    /// Directory for session storage
    pub session_dir: Option<String>,
    /// Disable session persistence
    #[serde(default)]
    pub no_session: bool,
    /// Enabled tools (empty = no tools, None = all defaults)
    pub enabled_tools: Option<Vec<String>>,
}

/// Frontend-facing event emitted during streaming.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type")]
pub enum PiEvent {
    /// Agent started processing
    #[serde(rename = "agent_start")]
    AgentStart { session_id: String },

    /// Text token streamed
    #[serde(rename = "text_delta")]
    TextDelta {
        session_id: String,
        content_index: usize,
        delta: String,
    },

    /// Full text block completed
    #[serde(rename = "text_end")]
    TextEnd {
        session_id: String,
        content_index: usize,
        content: String,
    },

    /// Thinking token streamed
    #[serde(rename = "thinking_delta")]
    ThinkingDelta {
        session_id: String,
        content_index: usize,
        delta: String,
    },

    /// Tool execution started
    #[serde(rename = "tool_start")]
    ToolStart {
        session_id: String,
        tool_call_id: String,
        tool_name: String,
    },

    /// Tool execution ended
    #[serde(rename = "tool_end")]
    ToolEnd {
        session_id: String,
        tool_call_id: String,
        tool_name: String,
        is_error: bool,
    },

    /// Turn completed (one request-response cycle)
    #[serde(rename = "turn_end")]
    TurnEnd {
        session_id: String,
        turn_index: usize,
    },

    /// Agent finished processing
    #[serde(rename = "agent_end")]
    AgentEnd {
        session_id: String,
        error: Option<String>,
    },

    /// Error occurred
    #[serde(rename = "error")]
    Error {
        session_id: String,
        message: String,
    },
}

/// Session state snapshot for the frontend.
#[derive(Debug, Clone, Serialize)]
pub struct SessionState {
    pub session_id: Option<String>,
    pub provider: String,
    pub model_id: String,
    pub thinking_level: Option<String>,
    pub save_enabled: bool,
    pub message_count: usize,
}

/// Model info for the frontend.
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize)]
pub struct ModelInfo {
    pub provider: String,
    pub model_id: String,
    pub display_name: String,
    pub context_window: usize,
}
