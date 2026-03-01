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

// ── Note Context Items ─────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteContext {
    pub id: String,
    pub note_id: String,
    #[serde(rename = "type")]
    pub ctx_type: String,
    pub reference: String,
    pub label: String,
    pub content_cache: Option<String>,
    pub sort_order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateNoteContext {
    pub note_id: String,
    #[serde(rename = "type")]
    pub ctx_type: String,
    pub reference: String,
    pub label: String,
    pub content_cache: Option<String>,
    pub sort_order: Option<i32>,
}

pub fn add_note_context(conn: &Connection, input: &CreateNoteContext) -> Result<NoteContext, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let sort_order = input.sort_order.unwrap_or(0);

    conn.execute(
        "INSERT INTO note_context (id, note_id, type, reference, label, content_cache, sort_order)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![id, input.note_id, input.ctx_type, input.reference, input.label, input.content_cache, sort_order],
    )
    .map_err(|e| e.to_string())?;

    Ok(NoteContext {
        id,
        note_id: input.note_id.clone(),
        ctx_type: input.ctx_type.clone(),
        reference: input.reference.clone(),
        label: input.label.clone(),
        content_cache: input.content_cache.clone(),
        sort_order,
    })
}

pub fn list_note_context(conn: &Connection, note_id: &str) -> Result<Vec<NoteContext>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, note_id, type, reference, label, content_cache, sort_order
             FROM note_context WHERE note_id = ?1 ORDER BY sort_order ASC",
        )
        .map_err(|e| e.to_string())?;

    let items = stmt
        .query_map(params![note_id], |row| {
            Ok(NoteContext {
                id: row.get(0)?,
                note_id: row.get(1)?,
                ctx_type: row.get(2)?,
                reference: row.get(3)?,
                label: row.get(4)?,
                content_cache: row.get(5)?,
                sort_order: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(items)
}

pub fn remove_note_context(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM note_context WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn reorder_note_context(conn: &Connection, id: &str, sort_order: i32) -> Result<(), String> {
    conn.execute(
        "UPDATE note_context SET sort_order = ?1 WHERE id = ?2",
        params![sort_order, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn clear_note_context(conn: &Connection, note_id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM note_context WHERE note_id = ?1", params![note_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn update_note_context_cache(conn: &Connection, id: &str, content_cache: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE note_context SET content_cache = ?1 WHERE id = ?2",
        params![content_cache, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Context Sets ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextSet {
    pub id: String,
    pub name: String,
    pub trigger_tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextSetItem {
    pub id: String,
    pub context_set: String,
    #[serde(rename = "type")]
    pub item_type: String,
    pub reference: String,
    pub label: String,
    pub pinned: bool,
    pub sort_order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateContextSet {
    pub name: String,
    pub trigger_tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateContextSet {
    pub name: Option<String>,
    pub trigger_tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateContextSetItem {
    pub context_set: String,
    #[serde(rename = "type")]
    pub item_type: String,
    pub reference: String,
    pub label: String,
    pub pinned: Option<bool>,
    pub sort_order: Option<i32>,
}

fn parse_trigger_tags(json_str: &str) -> Vec<String> {
    serde_json::from_str(json_str).unwrap_or_default()
}

pub fn create_context_set(conn: &Connection, input: &CreateContextSet) -> Result<ContextSet, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let tags_json = serde_json::to_string(&input.trigger_tags).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO context_sets (id, name, trigger_tags) VALUES (?1, ?2, ?3)",
        params![id, input.name, tags_json],
    )
    .map_err(|e| e.to_string())?;

    Ok(ContextSet {
        id,
        name: input.name.clone(),
        trigger_tags: input.trigger_tags.clone(),
    })
}

pub fn get_context_set(conn: &Connection, id: &str) -> Result<Option<ContextSet>, String> {
    conn.query_row(
        "SELECT id, name, trigger_tags FROM context_sets WHERE id = ?1",
        params![id],
        |row| {
            let tags_str: String = row.get(2)?;
            Ok(ContextSet {
                id: row.get(0)?,
                name: row.get(1)?,
                trigger_tags: parse_trigger_tags(&tags_str),
            })
        },
    )
    .optional()
    .map_err(|e| e.to_string())
}

pub fn update_context_set(conn: &Connection, id: &str, input: &UpdateContextSet) -> Result<ContextSet, String> {
    let existing = get_context_set(conn, id)?
        .ok_or_else(|| format!("Context set not found: {}", id))?;

    let name = input.name.as_deref().unwrap_or(&existing.name);
    let trigger_tags = input.trigger_tags.as_ref().unwrap_or(&existing.trigger_tags);
    let tags_json = serde_json::to_string(trigger_tags).map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE context_sets SET name = ?1, trigger_tags = ?2 WHERE id = ?3",
        params![name, tags_json, id],
    )
    .map_err(|e| e.to_string())?;

    Ok(ContextSet {
        id: id.to_string(),
        name: name.to_string(),
        trigger_tags: trigger_tags.clone(),
    })
}

pub fn delete_context_set(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM context_sets WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn list_context_sets(conn: &Connection) -> Result<Vec<ContextSet>, String> {
    let mut stmt = conn
        .prepare("SELECT id, name, trigger_tags FROM context_sets ORDER BY name")
        .map_err(|e| e.to_string())?;

    let sets = stmt
        .query_map([], |row| {
            let tags_str: String = row.get(2)?;
            Ok(ContextSet {
                id: row.get(0)?,
                name: row.get(1)?,
                trigger_tags: parse_trigger_tags(&tags_str),
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(sets)
}

/// Find all context sets whose trigger_tags contain any of the given tags.
pub fn find_context_sets_by_tags(conn: &Connection, tags: &[String]) -> Result<Vec<ContextSet>, String> {
    if tags.is_empty() {
        return Ok(vec![]);
    }

    let all_sets = list_context_sets(conn)?;
    Ok(all_sets
        .into_iter()
        .filter(|set| set.trigger_tags.iter().any(|t| tags.contains(t)))
        .collect())
}

// ── Context Set Items ──────────────────────────────────────────────────

pub fn add_context_set_item(conn: &Connection, input: &CreateContextSetItem) -> Result<ContextSetItem, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let pinned = input.pinned.unwrap_or(false);
    let sort_order = input.sort_order.unwrap_or(0);

    conn.execute(
        "INSERT INTO context_items (id, context_set, type, reference, label, pinned, sort_order)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![id, input.context_set, input.item_type, input.reference, input.label, pinned, sort_order],
    )
    .map_err(|e| e.to_string())?;

    Ok(ContextSetItem {
        id,
        context_set: input.context_set.clone(),
        item_type: input.item_type.clone(),
        reference: input.reference.clone(),
        label: input.label.clone(),
        pinned,
        sort_order,
    })
}

pub fn list_context_set_items(conn: &Connection, context_set_id: &str) -> Result<Vec<ContextSetItem>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, context_set, type, reference, label, pinned, sort_order
             FROM context_items WHERE context_set = ?1 ORDER BY sort_order ASC",
        )
        .map_err(|e| e.to_string())?;

    let items = stmt
        .query_map(params![context_set_id], |row| {
            Ok(ContextSetItem {
                id: row.get(0)?,
                context_set: row.get(1)?,
                item_type: row.get(2)?,
                reference: row.get(3)?,
                label: row.get(4)?,
                pinned: row.get(5)?,
                sort_order: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(items)
}

pub fn remove_context_set_item(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM context_items WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Assemble all context content for a set of tags.
/// Returns combined content from all matching context sets' items (reading file content).
pub fn assemble_context_for_tags(conn: &Connection, tags: &[String]) -> Result<Vec<AssembledContext>, String> {
    let sets = find_context_sets_by_tags(conn, tags)?;
    let mut assembled = Vec::new();

    for set in &sets {
        let items = list_context_set_items(conn, &set.id)?;
        for item in items {
            // Read file content for local items
            let content = if item.item_type == "local" {
                std::fs::read_to_string(&item.reference).ok()
            } else {
                None
            };

            assembled.push(AssembledContext {
                set_name: set.name.clone(),
                set_id: set.id.clone(),
                item_id: item.id.clone(),
                item_type: item.item_type.clone(),
                reference: item.reference.clone(),
                label: item.label.clone(),
                content,
            });
        }
    }

    Ok(assembled)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssembledContext {
    pub set_name: String,
    pub set_id: String,
    pub item_id: String,
    #[serde(rename = "type")]
    pub item_type: String,
    pub reference: String,
    pub label: String,
    pub content: Option<String>,
}

// ── Settings ───────────────────────────────────────────────────────────

pub fn get_setting(conn: &Connection, key: &str) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        [key],
        |row| row.get(0),
    )
    .optional()
    .map_err(|e| e.to_string())
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete_setting(conn: &Connection, key: &str) -> Result<(), String> {
    conn.execute("DELETE FROM settings WHERE key = ?1", [key])
        .map_err(|e| e.to_string())?;
    Ok(())
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
    fn test_note_context_crud() {
        let conn = init_memory_db().unwrap();
        let note = create_note(
            &conn,
            &CreateNote {
                note_type: "document".to_string(),
                title: "Test".to_string(),
                content: None,
                pi_session: None,
                tags: None,
            },
        )
        .unwrap();

        // Add context items
        let ctx1 = add_note_context(
            &conn,
            &CreateNoteContext {
                note_id: note.id.clone(),
                ctx_type: "local".to_string(),
                reference: "/home/user/file.rs".to_string(),
                label: "file.rs".to_string(),
                content_cache: Some("fn main() {}".to_string()),
                sort_order: Some(0),
            },
        )
        .unwrap();

        let ctx2 = add_note_context(
            &conn,
            &CreateNoteContext {
                note_id: note.id.clone(),
                ctx_type: "local".to_string(),
                reference: "/home/user/lib.rs".to_string(),
                label: "lib.rs".to_string(),
                content_cache: Some("pub mod foo;".to_string()),
                sort_order: Some(1),
            },
        )
        .unwrap();

        // List
        let items = list_note_context(&conn, &note.id).unwrap();
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].label, "file.rs");
        assert_eq!(items[1].label, "lib.rs");

        // Reorder
        reorder_note_context(&conn, &ctx2.id, -1).unwrap();
        let items = list_note_context(&conn, &note.id).unwrap();
        assert_eq!(items[0].label, "lib.rs");
        assert_eq!(items[1].label, "file.rs");

        // Update cache
        update_note_context_cache(&conn, &ctx1.id, "fn main() { println!(\"hi\"); }").unwrap();
        let items = list_note_context(&conn, &note.id).unwrap();
        let ctx1_updated = items.iter().find(|i| i.id == ctx1.id).unwrap();
        assert_eq!(
            ctx1_updated.content_cache.as_deref(),
            Some("fn main() { println!(\"hi\"); }")
        );

        // Remove
        remove_note_context(&conn, &ctx1.id).unwrap();
        let items = list_note_context(&conn, &note.id).unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].label, "lib.rs");
    }

    #[test]
    fn test_context_set_crud() {
        let conn = init_memory_db().unwrap();

        // Create context set
        let set = create_context_set(
            &conn,
            &CreateContextSet {
                name: "Rust Project".to_string(),
                trigger_tags: vec!["plan".to_string(), "blog".to_string()],
            },
        )
        .unwrap();
        assert_eq!(set.name, "Rust Project");
        assert_eq!(set.trigger_tags, vec!["plan", "blog"]);

        // Get
        let fetched = get_context_set(&conn, &set.id).unwrap().unwrap();
        assert_eq!(fetched.name, "Rust Project");
        assert_eq!(fetched.trigger_tags.len(), 2);

        // Update
        let updated = update_context_set(
            &conn,
            &set.id,
            &UpdateContextSet {
                name: Some("Rust Core".to_string()),
                trigger_tags: None,
            },
        )
        .unwrap();
        assert_eq!(updated.name, "Rust Core");
        assert_eq!(updated.trigger_tags.len(), 2); // unchanged

        // List
        let sets = list_context_sets(&conn).unwrap();
        assert_eq!(sets.len(), 1);

        // Delete
        delete_context_set(&conn, &set.id).unwrap();
        assert!(get_context_set(&conn, &set.id).unwrap().is_none());
    }

    #[test]
    fn test_context_set_items() {
        let conn = init_memory_db().unwrap();

        let set = create_context_set(
            &conn,
            &CreateContextSet {
                name: "My Set".to_string(),
                trigger_tags: vec!["chat".to_string()],
            },
        )
        .unwrap();

        // Add items
        let item1 = add_context_set_item(
            &conn,
            &CreateContextSetItem {
                context_set: set.id.clone(),
                item_type: "local".to_string(),
                reference: "/path/to/file.rs".to_string(),
                label: "file.rs".to_string(),
                pinned: Some(true),
                sort_order: Some(0),
            },
        )
        .unwrap();
        assert!(item1.pinned);

        add_context_set_item(
            &conn,
            &CreateContextSetItem {
                context_set: set.id.clone(),
                item_type: "url".to_string(),
                reference: "https://example.com".to_string(),
                label: "Example".to_string(),
                pinned: None,
                sort_order: Some(1),
            },
        )
        .unwrap();

        // List
        let items = list_context_set_items(&conn, &set.id).unwrap();
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].label, "file.rs");
        assert_eq!(items[1].label, "Example");

        // Remove
        remove_context_set_item(&conn, &item1.id).unwrap();
        let items = list_context_set_items(&conn, &set.id).unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].label, "Example");

        // Cascade delete: deleting set removes items
        delete_context_set(&conn, &set.id).unwrap();
        let items = list_context_set_items(&conn, &set.id).unwrap();
        assert_eq!(items.len(), 0);
    }

    #[test]
    fn test_find_context_sets_by_tags() {
        let conn = init_memory_db().unwrap();

        create_context_set(
            &conn,
            &CreateContextSet {
                name: "Plan Context".to_string(),
                trigger_tags: vec!["plan".to_string()],
            },
        )
        .unwrap();

        create_context_set(
            &conn,
            &CreateContextSet {
                name: "Chat Context".to_string(),
                trigger_tags: vec!["chat".to_string(), "scratch".to_string()],
            },
        )
        .unwrap();

        // Match plan
        let found = find_context_sets_by_tags(&conn, &["plan".to_string()]).unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].name, "Plan Context");

        // Match chat
        let found = find_context_sets_by_tags(&conn, &["chat".to_string()]).unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].name, "Chat Context");

        // Match scratch (in Chat Context)
        let found = find_context_sets_by_tags(&conn, &["scratch".to_string()]).unwrap();
        assert_eq!(found.len(), 1);

        // No match
        let found = find_context_sets_by_tags(&conn, &["blog".to_string()]).unwrap();
        assert_eq!(found.len(), 0);

        // Empty tags
        let found = find_context_sets_by_tags(&conn, &[]).unwrap();
        assert_eq!(found.len(), 0);
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
