mod agent;
mod db;
mod github;
mod import;

use agent::bridge::PiBridge;
use agent::types::{CreateSessionRequest, ForkResult, ForkableMessage, SessionMessage, SessionState};
use serde::{Deserialize, Serialize};
use db::store::{self, AssembledContext, ContextSet, ContextSetItem, CreateContextSet, CreateContextSetItem, CreateNote, CreateNoteContext, Note, NoteContext, NoteFilter, NoteLink, Tag, UpdateContextSet, UpdateNote};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{Emitter, Manager, State};
struct AppState {
    db: Mutex<rusqlite::Connection>,
    pi: PiBridge,
    /// Active event forwarders (session_id → abort sender to stop forwarding)
    event_forwarders: Mutex<HashMap<String, tokio::sync::oneshot::Sender<()>>>,
}

// ── IPC Commands ───────────────────────────────────────────────────────

#[tauri::command]
async fn ping(message: String) -> Result<String, String> {
    Ok(format!("pong: {}", message))
}

#[tauri::command]
fn create_note(state: State<'_, AppState>, input: CreateNote) -> Result<Note, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    store::create_note(&conn, &input)
}

#[tauri::command]
fn get_note(state: State<'_, AppState>, id: String) -> Result<Option<Note>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    store::get_note(&conn, &id)
}

#[tauri::command]
fn update_note(state: State<'_, AppState>, id: String, input: UpdateNote) -> Result<Note, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    store::update_note(&conn, &id, &input)
}

#[tauri::command]
fn delete_note(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    store::delete_note(&conn, &id)
}

#[tauri::command]
fn list_notes(state: State<'_, AppState>, filter: NoteFilter) -> Result<Vec<Note>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    store::list_notes(&conn, &filter)
}

#[tauri::command]
fn list_tags(state: State<'_, AppState>) -> Result<Vec<Tag>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    store::list_tags(&conn)
}

#[tauri::command]
fn set_note_tags(state: State<'_, AppState>, note_id: String, tags: Vec<String>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    store::set_note_tags(&conn, &note_id, &tags)
}

#[tauri::command]
fn add_note_link(state: State<'_, AppState>, link: NoteLink) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    store::add_note_link(&conn, &link)
}

#[tauri::command]
fn get_note_links(state: State<'_, AppState>, note_id: String) -> Result<Vec<NoteLink>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    store::get_note_links(&conn, &note_id)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct FileMeta {
    name: String,
    path: String,
    size: u64,
    is_dir: bool,
}

// ── Context Commands ───────────────────────────────────────────────────

#[tauri::command]
fn add_note_context(state: State<'_, AppState>, input: CreateNoteContext) -> Result<NoteContext, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    store::add_note_context(&conn, &input)
}

#[tauri::command]
fn list_note_context(state: State<'_, AppState>, note_id: String) -> Result<Vec<NoteContext>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    store::list_note_context(&conn, &note_id)
}

#[tauri::command]
fn remove_note_context(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    store::remove_note_context(&conn, &id)
}

#[tauri::command]
fn reorder_note_context(state: State<'_, AppState>, id: String, sort_order: i32) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    store::reorder_note_context(&conn, &id, sort_order)
}

// ── Context Set Commands ───────────────────────────────────────────────

#[tauri::command]
fn create_context_set(state: State<'_, AppState>, input: CreateContextSet) -> Result<ContextSet, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    store::create_context_set(&conn, &input)
}

#[tauri::command]
fn get_context_set(state: State<'_, AppState>, id: String) -> Result<Option<ContextSet>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    store::get_context_set(&conn, &id)
}

#[tauri::command]
fn update_context_set(state: State<'_, AppState>, id: String, input: UpdateContextSet) -> Result<ContextSet, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    store::update_context_set(&conn, &id, &input)
}

#[tauri::command]
fn delete_context_set(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    store::delete_context_set(&conn, &id)
}

#[tauri::command]
fn list_context_sets(state: State<'_, AppState>) -> Result<Vec<ContextSet>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    store::list_context_sets(&conn)
}

#[tauri::command]
fn add_context_set_item(state: State<'_, AppState>, input: CreateContextSetItem) -> Result<ContextSetItem, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    store::add_context_set_item(&conn, &input)
}

#[tauri::command]
fn list_context_set_items(state: State<'_, AppState>, context_set_id: String) -> Result<Vec<ContextSetItem>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    store::list_context_set_items(&conn, &context_set_id)
}

#[tauri::command]
fn remove_context_set_item(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    store::remove_context_set_item(&conn, &id)
}

#[tauri::command]
fn find_context_sets_by_tags(state: State<'_, AppState>, tags: Vec<String>) -> Result<Vec<ContextSet>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    store::find_context_sets_by_tags(&conn, &tags)
}

#[tauri::command]
fn assemble_context_for_tags(state: State<'_, AppState>, tags: Vec<String>) -> Result<Vec<AssembledContext>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    store::assemble_context_for_tags(&conn, &tags)
}

#[tauri::command]
async fn read_file_content(path: String) -> Result<String, String> {
    let metadata = tokio::fs::metadata(&path)
        .await
        .map_err(|e| format!("Cannot access {}: {}", path, e))?;

    // Limit to 1MB for context items
    if metadata.len() > 1_048_576 {
        return Err(format!(
            "File too large ({} bytes, max 1MB)",
            metadata.len()
        ));
    }

    tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| format!("Cannot read {}: {}", path, e))
}

#[tauri::command]
async fn get_file_meta(path: String) -> Result<FileMeta, String> {
    let metadata = tokio::fs::metadata(&path)
        .await
        .map_err(|e| format!("Cannot access {}: {}", path, e))?;

    let file_name = std::path::Path::new(&path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    Ok(FileMeta {
        name: file_name,
        path: path.clone(),
        size: metadata.len(),
        is_dir: metadata.is_dir(),
    })
}

// ── Import Commands ────────────────────────────────────────────────────

#[tauri::command]
async fn import_claude_export(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    file_path: String,
) -> Result<import::ImportResult, String> {
    let json = tokio::fs::read_to_string(&file_path)
        .await
        .map_err(|e| format!("Cannot read file: {e}"))?;

    let conversations = import::parse_claude_export(&json)?;

    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let session_dir = app_dir.join("sessions").join("claude-import");

    let conn = state.db.lock().map_err(|e| e.to_string())?;
    Ok(import::import_claude_conversations(
        &conn,
        &conversations,
        &session_dir,
    ))
}

// ── GitHub Commands ────────────────────────────────────────────────────

#[tauri::command]
async fn github_set_pat(state: State<'_, AppState>, pat: String) -> Result<String, String> {
    // Validate the PAT first
    let user = github::validate_pat(&pat).await?;
    // Store it
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    store::set_setting(&conn, "github_pat", &pat)?;
    Ok(user.login)
}

#[tauri::command]
fn github_get_pat(state: State<'_, AppState>) -> Result<Option<String>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    store::get_setting(&conn, "github_pat")
}

#[tauri::command]
fn github_clear_pat(state: State<'_, AppState>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    store::delete_setting(&conn, "github_pat")
}

fn get_pat(state: &State<'_, AppState>) -> Result<String, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    store::get_setting(&conn, "github_pat")?
        .ok_or_else(|| "No GitHub token configured. Set one first.".to_string())
}

#[tauri::command]
async fn github_list_repos(
    state: State<'_, AppState>,
    page: Option<u32>,
) -> Result<Vec<github::GitHubRepo>, String> {
    let pat = get_pat(&state)?;
    github::list_repos(&pat, page.unwrap_or(1), 30).await
}

#[tauri::command]
async fn github_get_tree(
    state: State<'_, AppState>,
    owner: String,
    repo: String,
    branch: Option<String>,
) -> Result<Vec<github::GitHubTreeEntry>, String> {
    let pat = get_pat(&state)?;
    let branch = branch.unwrap_or_else(|| "HEAD".to_string());
    github::get_tree(&pat, &owner, &repo, &branch).await
}

#[tauri::command]
async fn github_get_file(
    state: State<'_, AppState>,
    owner: String,
    repo: String,
    path: String,
    branch: Option<String>,
) -> Result<String, String> {
    let pat = get_pat(&state)?;
    let branch = branch.unwrap_or_else(|| "HEAD".to_string());
    github::get_file(&pat, &owner, &repo, &path, &branch).await
}

#[tauri::command]
async fn github_get_issue(
    state: State<'_, AppState>,
    owner: String,
    repo: String,
    number: u64,
) -> Result<String, String> {
    let pat = get_pat(&state)?;
    let (issue, comments) = github::get_issue(&pat, &owner, &repo, number).await?;
    Ok(github::format_issue_context(&issue, &comments))
}

#[tauri::command]
async fn github_get_pr_diff(
    state: State<'_, AppState>,
    owner: String,
    repo: String,
    number: u64,
) -> Result<String, String> {
    let pat = get_pat(&state)?;
    let pr = github::get_pr_diff(&pat, &owner, &repo, number).await?;
    Ok(github::format_pr_context(&pr))
}

// ── Pi Agent Commands ──────────────────────────────────────────────────

#[tauri::command]
async fn pi_create_session(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    request: CreateSessionRequest,
) -> Result<String, String> {
    let (session_id, mut event_rx) = state.pi.create_session(request).await?;

    // Spawn a tokio task to forward pi events to the Tauri webview
    let app_handle = app.clone();
    let sid = session_id.clone();
    let (stop_tx, mut stop_rx) = tokio::sync::oneshot::channel::<()>();

    tauri::async_runtime::spawn(async move {
        loop {
            tokio::select! {
                event = event_rx.recv() => {
                    match event {
                        Some(pi_event) => {
                            let _ = app_handle.emit("pi-event", &pi_event);
                        }
                        None => break,
                    }
                }
                _ = &mut stop_rx => break,
            }
        }
    });

    state
        .event_forwarders
        .lock()
        .unwrap()
        .insert(session_id.clone(), stop_tx);

    Ok(sid)
}

#[tauri::command]
async fn pi_prompt(
    state: State<'_, AppState>,
    session_id: String,
    message: String,
) -> Result<(), String> {
    state.pi.prompt(session_id, message).await
}

#[tauri::command]
async fn pi_steer(
    state: State<'_, AppState>,
    session_id: String,
    message: String,
) -> Result<(), String> {
    state.pi.steer(session_id, message).await
}

#[tauri::command]
async fn pi_abort(state: State<'_, AppState>, session_id: String) -> Result<(), String> {
    state.pi.abort(session_id).await
}

#[tauri::command]
async fn pi_get_state(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<SessionState, String> {
    state.pi.get_state(session_id).await
}

#[tauri::command]
async fn pi_get_fork_messages(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Vec<ForkableMessage>, String> {
    state.pi.get_fork_messages(session_id).await
}

#[tauri::command]
async fn pi_fork_session(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    entry_id: String,
) -> Result<ForkResult, String> {
    let (result, mut event_rx) = state.pi.fork_session(session_id, entry_id).await?;

    // Spawn event forwarder for the new forked session
    let app_handle = app.clone();
    let sid = result.session_id.clone();
    let (stop_tx, mut stop_rx) = tokio::sync::oneshot::channel::<()>();

    tauri::async_runtime::spawn(async move {
        loop {
            tokio::select! {
                event = event_rx.recv() => {
                    match event {
                        Some(pi_event) => {
                            let _ = app_handle.emit("pi-event", &pi_event);
                        }
                        None => break,
                    }
                }
                _ = &mut stop_rx => break,
            }
        }
    });

    state
        .event_forwarders
        .lock()
        .unwrap()
        .insert(sid, stop_tx);

    Ok(result)
}

#[tauri::command]
async fn pi_get_messages(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Vec<SessionMessage>, String> {
    state.pi.get_messages(session_id).await
}

#[tauri::command]
async fn pi_set_model(
    state: State<'_, AppState>,
    session_id: String,
    provider: String,
    model_id: String,
) -> Result<(), String> {
    state.pi.set_model(session_id, provider, model_id).await
}

#[tauri::command]
async fn pi_destroy_session(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<(), String> {
    // Stop event forwarding
    if let Some(stop_tx) = state
        .event_forwarders
        .lock()
        .unwrap()
        .remove(&session_id)
    {
        let _ = stop_tx.send(());
    }
    state.pi.destroy_session(session_id).await
}

// ── App Entry ──────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Initialize SQLite database in app data directory
            let handle = app.handle();
            let app_dir = handle.path().app_data_dir()
                .map_err(|e| e.to_string())?;
            std::fs::create_dir_all(&app_dir)
                .map_err(|e| e.to_string())?;

            let db_path = app_dir.join("mood.db");
            log::info!("Database path: {}", db_path.display());

            let conn = db::init_db(&db_path)
                .map_err(|e| e.to_string())?;

            let pi_bridge = PiBridge::new();

            handle.manage(AppState {
                db: Mutex::new(conn),
                pi: pi_bridge,
                event_forwarders: Mutex::new(HashMap::new()),
            });

            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            ping,
            create_note,
            get_note,
            update_note,
            delete_note,
            list_notes,
            list_tags,
            set_note_tags,
            add_note_link,
            get_note_links,
            add_note_context,
            list_note_context,
            remove_note_context,
            reorder_note_context,
            create_context_set,
            get_context_set,
            update_context_set,
            delete_context_set,
            list_context_sets,
            add_context_set_item,
            list_context_set_items,
            remove_context_set_item,
            find_context_sets_by_tags,
            assemble_context_for_tags,
            read_file_content,
            get_file_meta,
            import_claude_export,
            github_set_pat,
            github_get_pat,
            github_clear_pat,
            github_list_repos,
            github_get_tree,
            github_get_file,
            github_get_issue,
            github_get_pr_diff,
            pi_create_session,
            pi_prompt,
            pi_steer,
            pi_abort,
            pi_get_state,
            pi_get_messages,
            pi_get_fork_messages,
            pi_fork_session,
            pi_set_model,
            pi_destroy_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
