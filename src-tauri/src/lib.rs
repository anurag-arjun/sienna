mod db;

use db::store::{self, CreateNote, Note, NoteFilter, NoteLink, Tag, UpdateNote};
use std::sync::Mutex;
use tauri::{Manager, State};

struct AppState {
    db: Mutex<rusqlite::Connection>,
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

            handle.manage(AppState {
                db: Mutex::new(conn),
            });

            Ok(())
        })
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
