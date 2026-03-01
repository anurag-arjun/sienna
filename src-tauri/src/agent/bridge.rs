//! Bridge between Tauri's tokio runtime and pi's asupersync runtime.
//!
//! Architecture:
//! - A dedicated OS thread runs the asupersync runtime for pi sessions
//! - Commands are sent via crossbeam-style channels (tokio mpsc)
//! - Events flow back to Tauri via tokio mpsc → Tauri event emission
//!
//! Each active session gets its own entry in a shared session map.

use crate::agent::types::{CreateSessionRequest, PiEvent, SessionState};
use pi::sdk::{
    self, AgentEvent, AgentSessionHandle, SessionOptions,
};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tokio::sync::{mpsc, oneshot};

// ── Command Protocol ───────────────────────────────────────────────────

/// Commands sent from Tauri IPC handlers to the pi runtime thread.
#[allow(dead_code)]
enum PiCommand {
    CreateSession {
        request: CreateSessionRequest,
        reply: oneshot::Sender<Result<String, String>>,
        event_tx: mpsc::UnboundedSender<PiEvent>,
    },
    Prompt {
        session_id: String,
        message: String,
        reply: oneshot::Sender<Result<(), String>>,
    },
    Steer {
        session_id: String,
        message: String,
        reply: oneshot::Sender<Result<(), String>>,
    },
    Abort {
        session_id: String,
        reply: oneshot::Sender<Result<(), String>>,
    },
    GetState {
        session_id: String,
        reply: oneshot::Sender<Result<SessionState, String>>,
    },
    SetModel {
        session_id: String,
        provider: String,
        model_id: String,
        reply: oneshot::Sender<Result<(), String>>,
    },
    DestroySession {
        session_id: String,
        reply: oneshot::Sender<Result<(), String>>,
    },
}

// ── Session Entry ──────────────────────────────────────────────────────

struct SessionEntry {
    handle: AgentSessionHandle,
    event_tx: mpsc::UnboundedSender<PiEvent>,
    abort_handle: Option<pi::sdk::AbortHandle>,
}

// ── Pi Bridge ──────────────────────────────────────────────────────────

/// Handle for sending commands to the pi runtime thread.
#[derive(Clone)]
pub struct PiBridge {
    cmd_tx: mpsc::UnboundedSender<PiCommand>,
}

impl PiBridge {
    /// Spawn the pi runtime thread and return a bridge handle.
    pub fn new() -> Self {
        let (cmd_tx, cmd_rx) = mpsc::unbounded_channel();

        std::thread::Builder::new()
            .name("pi-runtime".into())
            .spawn(move || {
                pi_runtime_thread(cmd_rx);
            })
            .expect("failed to spawn pi runtime thread");

        Self { cmd_tx }
    }

    /// Create a new agent session. Returns (session_id, event_receiver).
    pub async fn create_session(
        &self,
        request: CreateSessionRequest,
    ) -> Result<(String, mpsc::UnboundedReceiver<PiEvent>), String> {
        let (reply_tx, reply_rx) = oneshot::channel();
        let (event_tx, event_rx) = mpsc::unbounded_channel();

        self.cmd_tx
            .send(PiCommand::CreateSession {
                request,
                reply: reply_tx,
                event_tx,
            })
            .map_err(|_| "pi runtime thread not running".to_string())?;

        reply_rx
            .await
            .map_err(|_| "pi runtime thread dropped".to_string())?
            .map(|id| (id, event_rx))
    }

    /// Send a prompt to an existing session.
    pub async fn prompt(&self, session_id: String, message: String) -> Result<(), String> {
        let (reply_tx, reply_rx) = oneshot::channel();
        self.cmd_tx
            .send(PiCommand::Prompt {
                session_id,
                message,
                reply: reply_tx,
            })
            .map_err(|_| "pi runtime not running".to_string())?;
        reply_rx
            .await
            .map_err(|_| "pi runtime dropped".to_string())?
    }

    /// Steer an in-progress generation.
    pub async fn steer(&self, session_id: String, message: String) -> Result<(), String> {
        let (reply_tx, reply_rx) = oneshot::channel();
        self.cmd_tx
            .send(PiCommand::Steer {
                session_id,
                message,
                reply: reply_tx,
            })
            .map_err(|_| "pi runtime not running".to_string())?;
        reply_rx
            .await
            .map_err(|_| "pi runtime dropped".to_string())?
    }

    /// Abort an in-progress generation.
    pub async fn abort(&self, session_id: String) -> Result<(), String> {
        let (reply_tx, reply_rx) = oneshot::channel();
        self.cmd_tx
            .send(PiCommand::Abort {
                session_id,
                reply: reply_tx,
            })
            .map_err(|_| "pi runtime not running".to_string())?;
        reply_rx
            .await
            .map_err(|_| "pi runtime dropped".to_string())?
    }

    /// Get session state snapshot.
    pub async fn get_state(&self, session_id: String) -> Result<SessionState, String> {
        let (reply_tx, reply_rx) = oneshot::channel();
        self.cmd_tx
            .send(PiCommand::GetState {
                session_id,
                reply: reply_tx,
            })
            .map_err(|_| "pi runtime not running".to_string())?;
        reply_rx
            .await
            .map_err(|_| "pi runtime dropped".to_string())?
    }

    /// Switch model for a session.
    pub async fn set_model(
        &self,
        session_id: String,
        provider: String,
        model_id: String,
    ) -> Result<(), String> {
        let (reply_tx, reply_rx) = oneshot::channel();
        self.cmd_tx
            .send(PiCommand::SetModel {
                session_id,
                provider,
                model_id,
                reply: reply_tx,
            })
            .map_err(|_| "pi runtime not running".to_string())?;
        reply_rx
            .await
            .map_err(|_| "pi runtime dropped".to_string())?
    }

    /// Destroy a session and free resources.
    pub async fn destroy_session(&self, session_id: String) -> Result<(), String> {
        let (reply_tx, reply_rx) = oneshot::channel();
        self.cmd_tx
            .send(PiCommand::DestroySession {
                session_id,
                reply: reply_tx,
            })
            .map_err(|_| "pi runtime not running".to_string())?;
        reply_rx
            .await
            .map_err(|_| "pi runtime dropped".to_string())?
    }
}

// ── Pi Runtime Thread ──────────────────────────────────────────────────

/// Runs the asupersync runtime in a dedicated thread, processing commands.
fn pi_runtime_thread(cmd_rx: mpsc::UnboundedReceiver<PiCommand>) {
    use asupersync::runtime::RuntimeBuilder;
    use asupersync::runtime::reactor::create_reactor;

    let reactor = create_reactor().expect("failed to create asupersync reactor");
    let runtime = RuntimeBuilder::current_thread()
        .with_reactor(reactor)
        .build()
        .expect("failed to build asupersync runtime");

    runtime.block_on(pi_runtime_loop(cmd_rx));
}

/// The async command loop running inside the asupersync runtime.
async fn pi_runtime_loop(mut cmd_rx: mpsc::UnboundedReceiver<PiCommand>) {
    let sessions: Arc<Mutex<HashMap<String, SessionEntry>>> =
        Arc::new(Mutex::new(HashMap::new()));

    // We need to poll the tokio mpsc receiver from inside asupersync.
    // Since tokio channels use standard Future trait, they should work
    // with any executor. But we may need a compatibility shim.
    // For now, use a polling approach with try_recv + sleep.
    loop {
        match cmd_rx.try_recv() {
            Ok(cmd) => {
                handle_command(cmd, &sessions).await;
            }
            Err(mpsc::error::TryRecvError::Empty) => {
                // No commands, yield briefly
                // Use a small sleep to avoid busy-waiting
                std::thread::sleep(std::time::Duration::from_millis(1));
            }
            Err(mpsc::error::TryRecvError::Disconnected) => {
                log::info!("Pi bridge command channel closed, shutting down");
                break;
            }
        }
    }
}

async fn handle_command(
    cmd: PiCommand,
    sessions: &Arc<Mutex<HashMap<String, SessionEntry>>>,
) {
    match cmd {
        PiCommand::CreateSession {
            request,
            reply,
            event_tx,
        } => {
            let result = create_session_impl(request, event_tx.clone(), sessions).await;
            let _ = reply.send(result);
        }
        PiCommand::Prompt {
            session_id,
            message,
            reply,
        } => {
            let result = prompt_impl(&session_id, message, sessions).await;
            let _ = reply.send(result);
        }
        PiCommand::Steer {
            session_id: _,
            message: _,
            reply,
        } => {
            // Steer requires RPC transport; for in-process SDK we use abort + new prompt
            // For now, return unsupported
            let _ = reply.send(Err("steer not yet implemented for in-process SDK".into()));
        }
        PiCommand::Abort {
            session_id,
            reply,
        } => {
            let result = abort_impl(&session_id, sessions);
            let _ = reply.send(result);
        }
        PiCommand::GetState {
            session_id,
            reply,
        } => {
            let result = get_state_impl(&session_id, sessions).await;
            let _ = reply.send(result);
        }
        PiCommand::SetModel {
            session_id,
            provider,
            model_id,
            reply,
        } => {
            let result = set_model_impl(&session_id, &provider, &model_id, sessions).await;
            let _ = reply.send(result);
        }
        PiCommand::DestroySession {
            session_id,
            reply,
        } => {
            let mut map = sessions.lock().unwrap();
            map.remove(&session_id);
            let _ = reply.send(Ok(()));
        }
    }
}

async fn create_session_impl(
    request: CreateSessionRequest,
    event_tx: mpsc::UnboundedSender<PiEvent>,
    sessions: &Arc<Mutex<HashMap<String, SessionEntry>>>,
) -> Result<String, String> {
    let session_id = uuid::Uuid::new_v4().to_string();
    let sid = session_id.clone();

    // Build session-level event listener that forwards to the channel
    let event_tx_clone = event_tx.clone();
    let sid_for_events = session_id.clone();
    let on_event: Arc<dyn Fn(AgentEvent) + Send + Sync> = Arc::new(move |event| {
        let pi_event = agent_event_to_pi_event(&sid_for_events, &event);
        if let Some(ev) = pi_event {
            let _ = event_tx_clone.send(ev);
        }
    });

    let options = SessionOptions {
        provider: request.provider,
        model: request.model,
        api_key: request.api_key,
        system_prompt: request.system_prompt,
        append_system_prompt: request.append_system_prompt,
        working_directory: request.working_directory.map(PathBuf::from),
        session_path: request.session_path.map(PathBuf::from),
        session_dir: request.session_dir.map(PathBuf::from),
        no_session: request.no_session,
        enabled_tools: request.enabled_tools,
        on_event: Some(on_event),
        ..SessionOptions::default()
    };

    let handle = sdk::create_agent_session(options)
        .await
        .map_err(|e| format!("Failed to create session: {e}"))?;

    let entry = SessionEntry {
        handle,
        event_tx,
        abort_handle: None,
    };

    sessions.lock().unwrap().insert(session_id.clone(), entry);

    Ok(sid)
}

async fn prompt_impl(
    session_id: &str,
    message: String,
    sessions: &Arc<Mutex<HashMap<String, SessionEntry>>>,
) -> Result<(), String> {
    // Take the handle out for the duration of the prompt
    let (mut handle, event_tx) = {
        let mut map = sessions.lock().unwrap();
        let entry = map
            .remove(session_id)
            .ok_or_else(|| format!("Session not found: {session_id}"))?;
        (entry.handle, entry.event_tx)
    };

    let sid = session_id.to_string();
    let event_tx_for_prompt = event_tx.clone();
    let sid_for_prompt = sid.clone();

    // Create abort handle for this prompt
    let (_abort_handle, abort_signal) = AgentSessionHandle::new_abort_handle();

    // Store abort handle
    {
        // abort_handle stored for potential cancellation - not yet wired up
    }

    let result = handle
        .prompt_with_abort(message, abort_signal, move |event| {
            if let Some(pi_event) = agent_event_to_pi_event(&sid_for_prompt, &event) {
                let _ = event_tx_for_prompt.send(pi_event);
            }
        })
        .await;

    // Put the handle back
    let entry = SessionEntry {
        handle,
        event_tx: event_tx.clone(),
        abort_handle: None,
    };
    sessions.lock().unwrap().insert(sid.clone(), entry);

    match result {
        Ok(_) => Ok(()),
        Err(e) => {
            let _ = event_tx.send(PiEvent::Error {
                session_id: sid,
                message: e.to_string(),
            });
            Err(e.to_string())
        }
    }
}

fn abort_impl(
    session_id: &str,
    sessions: &Arc<Mutex<HashMap<String, SessionEntry>>>,
) -> Result<(), String> {
    let map = sessions.lock().unwrap();
    let entry = map
        .get(session_id)
        .ok_or_else(|| format!("Session not found: {session_id}"))?;
    if let Some(ref abort_handle) = entry.abort_handle {
        abort_handle.abort();
        Ok(())
    } else {
        Err("No active prompt to abort".into())
    }
}

async fn get_state_impl(
    session_id: &str,
    sessions: &Arc<Mutex<HashMap<String, SessionEntry>>>,
) -> Result<SessionState, String> {
    let map = sessions.lock().unwrap();
    let entry = map
        .get(session_id)
        .ok_or_else(|| format!("Session not found: {session_id}"))?;

    let (provider, model_id) = entry.handle.model();
    let thinking = entry.handle.thinking_level().map(|t| t.to_string());

    // We can't call async state() while holding the lock, so return what we can sync
    Ok(SessionState {
        session_id: Some(session_id.to_string()),
        provider,
        model_id,
        thinking_level: thinking,
        save_enabled: entry.handle.session().save_enabled(),
        message_count: 0, // Would need async call for accurate count
    })
}

async fn set_model_impl(
    session_id: &str,
    provider: &str,
    model_id: &str,
    sessions: &Arc<Mutex<HashMap<String, SessionEntry>>>,
) -> Result<(), String> {
    let mut map = sessions.lock().unwrap();
    let entry = map
        .get_mut(session_id)
        .ok_or_else(|| format!("Session not found: {session_id}"))?;

    entry
        .handle
        .set_model(provider, model_id)
        .await
        .map_err(|e| e.to_string())
}

// ── Event Conversion ───────────────────────────────────────────────────

/// Convert a pi AgentEvent into a frontend-friendly PiEvent.
fn agent_event_to_pi_event(session_id: &str, event: &AgentEvent) -> Option<PiEvent> {
    match event {
        AgentEvent::AgentStart { .. } => Some(PiEvent::AgentStart {
            session_id: session_id.to_string(),
        }),
        AgentEvent::AgentEnd { error, .. } => Some(PiEvent::AgentEnd {
            session_id: session_id.to_string(),
            error: error.clone(),
        }),
        AgentEvent::TurnEnd { turn_index, .. } => Some(PiEvent::TurnEnd {
            session_id: session_id.to_string(),
            turn_index: *turn_index,
        }),
        AgentEvent::MessageUpdate {
            assistant_message_event,
            ..
        } => {
            use pi::model::AssistantMessageEvent as AME;
            match assistant_message_event {
                AME::TextDelta {
                    content_index,
                    delta,
                    ..
                } => Some(PiEvent::TextDelta {
                    session_id: session_id.to_string(),
                    content_index: *content_index,
                    delta: delta.clone(),
                }),
                AME::TextEnd {
                    content_index,
                    content,
                    ..
                } => Some(PiEvent::TextEnd {
                    session_id: session_id.to_string(),
                    content_index: *content_index,
                    content: content.clone(),
                }),
                AME::ThinkingDelta {
                    content_index,
                    delta,
                    ..
                } => Some(PiEvent::ThinkingDelta {
                    session_id: session_id.to_string(),
                    content_index: *content_index,
                    delta: delta.clone(),
                }),
                _ => None,
            }
        }
        AgentEvent::ToolExecutionStart {
            tool_call_id,
            tool_name,
            ..
        } => Some(PiEvent::ToolStart {
            session_id: session_id.to_string(),
            tool_call_id: tool_call_id.clone(),
            tool_name: tool_name.clone(),
        }),
        AgentEvent::ToolExecutionEnd {
            tool_call_id,
            tool_name,
            is_error,
            ..
        } => Some(PiEvent::ToolEnd {
            session_id: session_id.to_string(),
            tool_call_id: tool_call_id.clone(),
            tool_name: tool_name.clone(),
            is_error: *is_error,
        }),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bridge_creates_without_panic() {
        // Just verify the bridge can be constructed
        // (don't actually create a session — that needs API keys)
        let bridge = PiBridge::new();
        assert!(bridge.cmd_tx.send(PiCommand::DestroySession {
            session_id: "nonexistent".into(),
            reply: oneshot::channel().0,
        }).is_ok());
    }

    #[test]
    fn agent_event_to_pi_event_maps_text_delta() {
        use pi::sdk::AgentEvent;
        use pi::model::AssistantMessageEvent;
        use pi::sdk::{AssistantMessage, Usage, StopReason, Message};
        use std::sync::Arc;

        let partial = Arc::new(AssistantMessage {
            content: Vec::new(),
            api: String::new(),
            provider: String::new(),
            model: String::new(),
            usage: Usage::default(),
            stop_reason: StopReason::Stop,
            error_message: None,
            timestamp: 0,
        });

        let event = AgentEvent::MessageUpdate {
            message: Message::Assistant(partial.clone()),
            assistant_message_event: AssistantMessageEvent::TextDelta {
                content_index: 0,
                delta: "hello".into(),
                partial: partial.clone(),
            },
        };

        let result = agent_event_to_pi_event("test-session", &event);
        assert!(result.is_some());
        match result.unwrap() {
            PiEvent::TextDelta {
                session_id,
                delta,
                content_index,
            } => {
                assert_eq!(session_id, "test-session");
                assert_eq!(delta, "hello");
                assert_eq!(content_index, 0);
            }
            other => panic!("expected TextDelta, got {:?}", other),
        }
    }

    #[test]
    fn agent_event_to_pi_event_maps_agent_start() {
        let event = AgentEvent::AgentStart {
            session_id: "s1".into(),
        };
        let result = agent_event_to_pi_event("my-session", &event);
        assert!(matches!(result, Some(PiEvent::AgentStart { .. })));
    }

    #[test]
    fn agent_event_to_pi_event_maps_agent_end() {
        let event = AgentEvent::AgentEnd {
            session_id: "s1".into(),
            messages: vec![],
            error: Some("oops".into()),
        };
        let result = agent_event_to_pi_event("my-session", &event);
        match result {
            Some(PiEvent::AgentEnd { error, .. }) => {
                assert_eq!(error, Some("oops".into()));
            }
            other => panic!("expected AgentEnd, got {:?}", other),
        }
    }

    #[test]
    fn agent_event_to_pi_event_returns_none_for_unmapped() {
        let event = AgentEvent::AutoCompactionStart {
            reason: "test".into(),
        };
        assert!(agent_event_to_pi_event("s", &event).is_none());
    }
}
