use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

// ── Types ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Note {
    pub id: String,
    #[serde(rename = "type")]
    pub note_type: String,
    pub title: String,
    pub content: Option<String>,
    pub pi_session: Option<String>,
    pub status: String,
    pub pinned: bool,
    pub context_set: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub template: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteLink {
    pub source_id: String,
    pub target_id: String,
    pub link_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateNote {
    pub note_type: String,
    pub title: String,
    pub content: Option<String>,
    pub pi_session: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateNote {
    pub title: Option<String>,
    pub content: Option<String>,
    pub status: Option<String>,
    pub pinned: Option<bool>,
    pub pi_session: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteFilter {
    pub status: Option<String>,
    pub note_type: Option<String>,
    pub tag: Option<String>,
    pub search: Option<String>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

// ── Note CRUD ──────────────────────────────────────────────────────────

pub fn create_note(conn: &Connection, input: &CreateNote) -> Result<Note, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp();

    conn.execute(
        "INSERT INTO notes (id, type, title, content, pi_session, status, pinned, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'active', 0, ?6, ?6)",
        params![id, input.note_type, input.title, input.content, input.pi_session, now],
    )
    .map_err(|e| e.to_string())?;

    // Add tags
    if let Some(tags) = &input.tags {
        for tag_name in tags {
            ensure_tag(conn, tag_name)?;
            let tag_id = get_tag_id_by_name(conn, tag_name)?;
            conn.execute(
                "INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?1, ?2)",
                params![id, tag_id],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    get_note(conn, &id)?.ok_or_else(|| "Failed to retrieve created note".to_string())
}

pub fn get_note(conn: &Connection, id: &str) -> Result<Option<Note>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, type, title, content, pi_session, status, pinned, context_set, created_at, updated_at
             FROM notes WHERE id = ?1",
        )
        .map_err(|e| e.to_string())?;

    let note = stmt
        .query_row(params![id], |row| {
            Ok(Note {
                id: row.get(0)?,
                note_type: row.get(1)?,
                title: row.get(2)?,
                content: row.get(3)?,
                pi_session: row.get(4)?,
                status: row.get(5)?,
                pinned: row.get::<_, i32>(6)? != 0,
                context_set: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
                tags: Vec::new(),
            })
        })
        .optional()
        .map_err(|e| e.to_string())?;

    match note {
        Some(mut n) => {
            n.tags = get_note_tags(conn, &n.id)?;
            Ok(Some(n))
        }
        None => Ok(None),
    }
}

pub fn update_note(conn: &Connection, id: &str, input: &UpdateNote) -> Result<Note, String> {
    let now = chrono::Utc::now().timestamp();

    // Build dynamic UPDATE
    let mut sets = vec!["updated_at = ?1".to_string()];
    let mut param_idx = 2u32;
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(now)];

    if let Some(ref title) = input.title {
        sets.push(format!("title = ?{param_idx}"));
        param_values.push(Box::new(title.clone()));
        param_idx += 1;
    }
    if let Some(ref content) = input.content {
        sets.push(format!("content = ?{param_idx}"));
        param_values.push(Box::new(content.clone()));
        param_idx += 1;
    }
    if let Some(ref status) = input.status {
        sets.push(format!("status = ?{param_idx}"));
        param_values.push(Box::new(status.clone()));
        param_idx += 1;
    }
    if let Some(pinned) = input.pinned {
        sets.push(format!("pinned = ?{param_idx}"));
        param_values.push(Box::new(pinned as i32));
        param_idx += 1;
    }
    if let Some(ref pi_session) = input.pi_session {
        sets.push(format!("pi_session = ?{param_idx}"));
        param_values.push(Box::new(pi_session.clone()));
        param_idx += 1;
    }
    let _ = param_idx; // suppress unused warning

    let sql = format!(
        "UPDATE notes SET {} WHERE id = ?{}",
        sets.join(", "),
        param_values.len() + 1
    );
    param_values.push(Box::new(id.to_string()));

    let params: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();
    conn.execute(&sql, params.as_slice()).map_err(|e| e.to_string())?;

    get_note(conn, id)?.ok_or_else(|| format!("Note {id} not found"))
}

pub fn delete_note(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM notes WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn list_notes(conn: &Connection, filter: &NoteFilter) -> Result<Vec<Note>, String> {
    let mut conditions = Vec::new();
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    let mut param_idx = 1u32;

    // FTS search uses a different query path
    let use_fts = filter.search.is_some();

    if let Some(ref status) = filter.status {
        conditions.push(format!("n.status = ?{param_idx}"));
        param_values.push(Box::new(status.clone()));
        param_idx += 1;
    }
    if let Some(ref note_type) = filter.note_type {
        conditions.push(format!("n.type = ?{param_idx}"));
        param_values.push(Box::new(note_type.clone()));
        param_idx += 1;
    }
    if let Some(ref tag) = filter.tag {
        conditions.push(format!(
            "n.id IN (SELECT nt.note_id FROM note_tags nt JOIN tags t ON nt.tag_id = t.id WHERE t.name = ?{param_idx})"
        ));
        param_values.push(Box::new(tag.clone()));
        param_idx += 1;
    }

    let limit = filter.limit.unwrap_or(50);
    let offset = filter.offset.unwrap_or(0);

    let sql = if use_fts {
        let search_term = filter.search.as_ref().unwrap();
        conditions.push(format!("n.rowid IN (SELECT rowid FROM notes_fts WHERE notes_fts MATCH ?{param_idx})"));
        param_values.push(Box::new(search_term.clone()));
        param_idx += 1;

        let where_clause = if conditions.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", conditions.join(" AND "))
        };

        format!(
            "SELECT n.id, n.type, n.title, n.content, n.pi_session, n.status, n.pinned, n.context_set, n.created_at, n.updated_at
             FROM notes n {where_clause}
             ORDER BY n.updated_at DESC LIMIT ?{param_idx} OFFSET ?{}",
            param_idx + 1
        )
    } else {
        let where_clause = if conditions.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", conditions.join(" AND "))
        };

        format!(
            "SELECT n.id, n.type, n.title, n.content, n.pi_session, n.status, n.pinned, n.context_set, n.created_at, n.updated_at
             FROM notes n {where_clause}
             ORDER BY n.updated_at DESC LIMIT ?{param_idx} OFFSET ?{}",
            param_idx + 1
        )
    };

    param_values.push(Box::new(limit));
    param_values.push(Box::new(offset));

    let params: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let notes = stmt
        .query_map(params.as_slice(), |row| {
            Ok(Note {
                id: row.get(0)?,
                note_type: row.get(1)?,
                title: row.get(2)?,
                content: row.get(3)?,
                pi_session: row.get(4)?,
                status: row.get(5)?,
                pinned: row.get::<_, i32>(6)? != 0,
                context_set: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
                tags: Vec::new(),
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    // Populate tags for each note
    let mut result = Vec::with_capacity(notes.len());
    for mut note in notes {
        note.tags = get_note_tags(conn, &note.id)?;
        result.push(note);
    }
    Ok(result)
}

// ── Tags ───────────────────────────────────────────────────────────────

pub fn ensure_tag(conn: &Connection, name: &str) -> Result<Tag, String> {
    let existing = conn
        .query_row(
            "SELECT id, name, color, template FROM tags WHERE name = ?1",
            params![name],
            |row| {
                Ok(Tag {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    color: row.get(2)?,
                    template: row.get(3)?,
                })
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;

    if let Some(tag) = existing {
        return Ok(tag);
    }

    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO tags (id, name) VALUES (?1, ?2)",
        params![id, name],
    )
    .map_err(|e| e.to_string())?;

    Ok(Tag {
        id,
        name: name.to_string(),
        color: None,
        template: None,
    })
}

fn get_tag_id_by_name(conn: &Connection, name: &str) -> Result<String, String> {
    conn.query_row(
        "SELECT id FROM tags WHERE name = ?1",
        params![name],
        |row| row.get(0),
    )
    .map_err(|e| e.to_string())
}

fn get_note_tags(conn: &Connection, note_id: &str) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare("SELECT t.name FROM note_tags nt JOIN tags t ON nt.tag_id = t.id WHERE nt.note_id = ?1 ORDER BY t.name")
        .map_err(|e| e.to_string())?;
    let tags = stmt
        .query_map(params![note_id], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<String>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(tags)
}

pub fn set_note_tags(conn: &Connection, note_id: &str, tags: &[String]) -> Result<(), String> {
    conn.execute("DELETE FROM note_tags WHERE note_id = ?1", params![note_id])
        .map_err(|e| e.to_string())?;

    for tag_name in tags {
        ensure_tag(conn, tag_name)?;
        let tag_id = get_tag_id_by_name(conn, tag_name)?;
        conn.execute(
            "INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?1, ?2)",
            params![note_id, tag_id],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn list_tags(conn: &Connection) -> Result<Vec<Tag>, String> {
    let mut stmt = conn
        .prepare("SELECT id, name, color, template FROM tags ORDER BY name")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(Tag {
            id: row.get(0)?,
            name: row.get(1)?,
            color: row.get(2)?,
            template: row.get(3)?,
        })
    })
    .map_err(|e| e.to_string())?;
    let mut tags = Vec::new();
    for row in rows {
        tags.push(row.map_err(|e| e.to_string())?);
    }
    Ok(tags)
}

// ── Note Links ─────────────────────────────────────────────────────────

pub fn add_note_link(conn: &Connection, link: &NoteLink) -> Result<(), String> {
    conn.execute(
        "INSERT OR IGNORE INTO note_links (source_id, target_id, link_type) VALUES (?1, ?2, ?3)",
        params![link.source_id, link.target_id, link.link_type],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_note_links(conn: &Connection, note_id: &str) -> Result<Vec<NoteLink>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT source_id, target_id, link_type FROM note_links
             WHERE source_id = ?1 OR target_id = ?1",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![note_id], |row| {
        Ok(NoteLink {
            source_id: row.get(0)?,
            target_id: row.get(1)?,
            link_type: row.get(2)?,
        })
    })
    .map_err(|e| e.to_string())?;
    let mut links = Vec::new();
    for row in rows {
        links.push(row.map_err(|e| e.to_string())?);
    }
    Ok(links)
}

// ── Tests ──────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::init_memory_db;

    #[test]
    fn test_create_and_get_note() {
        let conn = init_memory_db().unwrap();
        let note = create_note(
            &conn,
            &CreateNote {
                note_type: "document".to_string(),
                title: "Test Note".to_string(),
                content: Some("Hello world".to_string()),
                pi_session: None,
                tags: Some(vec!["plan".to_string()]),
            },
        )
        .unwrap();

        assert_eq!(note.title, "Test Note");
        assert_eq!(note.status, "active");
        assert_eq!(note.tags, vec!["plan"]);

        let fetched = get_note(&conn, &note.id).unwrap().unwrap();
        assert_eq!(fetched.title, "Test Note");
        assert_eq!(fetched.tags, vec!["plan"]);
    }

    #[test]
    fn test_update_note() {
        let conn = init_memory_db().unwrap();
        let note = create_note(
            &conn,
            &CreateNote {
                note_type: "document".to_string(),
                title: "Original".to_string(),
                content: None,
                pi_session: None,
                tags: None,
            },
        )
        .unwrap();

        let updated = update_note(
            &conn,
            &note.id,
            &UpdateNote {
                title: Some("Updated".to_string()),
                content: Some("New content".to_string()),
                status: None,
                pinned: Some(true),
                pi_session: None,
            },
        )
        .unwrap();

        assert_eq!(updated.title, "Updated");
        assert_eq!(updated.content.as_deref(), Some("New content"));
        assert!(updated.pinned);
    }

    #[test]
    fn test_list_with_status_filter() {
        let conn = init_memory_db().unwrap();
        create_note(
            &conn,
            &CreateNote {
                note_type: "document".to_string(),
                title: "Active".to_string(),
                content: None,
                pi_session: None,
                tags: None,
            },
        )
        .unwrap();

        let note2 = create_note(
            &conn,
            &CreateNote {
                note_type: "document".to_string(),
                title: "Done".to_string(),
                content: None,
                pi_session: None,
                tags: None,
            },
        )
        .unwrap();

        update_note(
            &conn,
            &note2.id,
            &UpdateNote {
                title: None,
                content: None,
                status: Some("completed".to_string()),
                pinned: None,
                pi_session: None,
            },
        )
        .unwrap();

        let active = list_notes(
            &conn,
            &NoteFilter {
                status: Some("active".to_string()),
                note_type: None,
                tag: None,
                search: None,
                limit: None,
                offset: None,
            },
        )
        .unwrap();
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].title, "Active");
    }

    #[test]
    fn test_fts_search() {
        let conn = init_memory_db().unwrap();
        create_note(
            &conn,
            &CreateNote {
                note_type: "document".to_string(),
                title: "Rust Programming".to_string(),
                content: Some("Systems language with memory safety".to_string()),
                pi_session: None,
                tags: None,
            },
        )
        .unwrap();

        create_note(
            &conn,
            &CreateNote {
                note_type: "document".to_string(),
                title: "Cooking Recipes".to_string(),
                content: Some("How to make pasta".to_string()),
                pi_session: None,
                tags: None,
            },
        )
        .unwrap();

        let results = list_notes(
            &conn,
            &NoteFilter {
                status: None,
                note_type: None,
                tag: None,
                search: Some("rust OR memory".to_string()),
                limit: None,
                offset: None,
            },
        )
        .unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].title, "Rust Programming");
    }

    #[test]
    fn test_tag_filter() {
        let conn = init_memory_db().unwrap();
        create_note(
            &conn,
            &CreateNote {
                note_type: "conversation".to_string(),
                title: "Chat 1".to_string(),
                content: None,
                pi_session: None,
                tags: Some(vec!["chat".to_string()]),
            },
        )
        .unwrap();

        create_note(
            &conn,
            &CreateNote {
                note_type: "document".to_string(),
                title: "Plan 1".to_string(),
                content: None,
                pi_session: None,
                tags: Some(vec!["plan".to_string()]),
            },
        )
        .unwrap();

        let chats = list_notes(
            &conn,
            &NoteFilter {
                status: None,
                note_type: None,
                tag: Some("chat".to_string()),
                search: None,
                limit: None,
                offset: None,
            },
        )
        .unwrap();
        assert_eq!(chats.len(), 1);
        assert_eq!(chats[0].title, "Chat 1");
    }

    #[test]
    fn test_note_links() {
        let conn = init_memory_db().unwrap();
        let conv = create_note(
            &conn,
            &CreateNote {
                note_type: "conversation".to_string(),
                title: "Chat".to_string(),
                content: None,
                pi_session: None,
                tags: None,
            },
        )
        .unwrap();

        let doc = create_note(
            &conn,
            &CreateNote {
                note_type: "document".to_string(),
                title: "Plan".to_string(),
                content: None,
                pi_session: None,
                tags: None,
            },
        )
        .unwrap();

        add_note_link(
            &conn,
            &NoteLink {
                source_id: doc.id.clone(),
                target_id: conv.id.clone(),
                link_type: "distilled_from".to_string(),
            },
        )
        .unwrap();

        let links = get_note_links(&conn, &doc.id).unwrap();
        assert_eq!(links.len(), 1);
        assert_eq!(links[0].link_type, "distilled_from");
    }

    #[test]
    fn test_delete_note() {
        let conn = init_memory_db().unwrap();
        let note = create_note(
            &conn,
            &CreateNote {
                note_type: "document".to_string(),
                title: "Doomed".to_string(),
                content: None,
                pi_session: None,
                tags: None,
            },
        )
        .unwrap();

        delete_note(&conn, &note.id).unwrap();
        assert!(get_note(&conn, &note.id).unwrap().is_none());
    }
}
