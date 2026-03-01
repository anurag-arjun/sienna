//! Notion REST API integration — page search, block fetching, blocks-to-Markdown.
//!
//! Uses an internal integration token for authentication.
//! All calls go through the Notion API v1 (version 2022-06-28).

use reqwest::header::AUTHORIZATION;
use serde::{Deserialize, Serialize};

const NOTION_API: &str = "https://api.notion.com/v1";
const NOTION_VERSION: &str = "2022-06-28";
const APP_USER_AGENT: &str = "mood-editor/0.1.0";

// ── Types ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotionUser {
    pub name: Option<String>,
    pub r#type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotionSearchResult {
    pub id: String,
    pub title: String,
    pub object: String, // "page" or "database"
    pub icon: Option<String>,
    pub last_edited: String,
    pub url: String,
}

// ── Internal API response types ────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct SearchResponse {
    results: Vec<SearchObject>,
    has_more: bool,
    #[serde(default)]
    next_cursor: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SearchObject {
    id: String,
    object: String, // "page" or "database"
    url: String,
    last_edited_time: String,
    #[serde(default)]
    icon: Option<IconObject>,
    #[serde(default)]
    properties: serde_json::Value,
}

#[derive(Debug, Deserialize)]
struct IconObject {
    r#type: String,
    #[serde(default)]
    emoji: Option<String>,
}

#[derive(Debug, Deserialize)]
struct BlockChildrenResponse {
    results: Vec<Block>,
    has_more: bool,
    #[serde(default)]
    next_cursor: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Block {
    id: String,
    r#type: String,
    has_children: bool,
    #[serde(flatten)]
    data: serde_json::Value,
}

#[derive(Debug, Deserialize)]
struct RichText {
    plain_text: String,
    #[serde(default)]
    annotations: Option<Annotations>,
    #[serde(default)]
    href: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Annotations {
    #[serde(default)]
    bold: bool,
    #[serde(default)]
    italic: bool,
    #[serde(default)]
    strikethrough: bool,
    #[serde(default)]
    code: bool,
}

#[derive(Debug, Deserialize)]
struct UsersMeResponse {
    #[serde(default)]
    name: Option<String>,
    r#type: String,
    #[serde(default)]
    bot: Option<BotInfo>,
}

#[derive(Debug, Deserialize)]
struct BotInfo {
    owner: serde_json::Value,
    workspace_name: Option<String>,
}

// ── Client helpers ─────────────────────────────────────────────────────

fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent(APP_USER_AGENT)
        .build()
        .expect("failed to build HTTP client")
}

async fn notion_get(token: &str, path: &str) -> Result<reqwest::Response, String> {
    let url = format!("{NOTION_API}{path}");
    client()
        .get(&url)
        .header(AUTHORIZATION, format!("Bearer {token}"))
        .header("Notion-Version", NOTION_VERSION)
        .send()
        .await
        .map_err(|e| format!("Notion request failed: {e}"))
}

async fn notion_post(
    token: &str,
    path: &str,
    body: &serde_json::Value,
) -> Result<reqwest::Response, String> {
    let url = format!("{NOTION_API}{path}");
    client()
        .post(&url)
        .header(AUTHORIZATION, format!("Bearer {token}"))
        .header("Notion-Version", NOTION_VERSION)
        .json(body)
        .send()
        .await
        .map_err(|e| format!("Notion request failed: {e}"))
}

// ── Public API ─────────────────────────────────────────────────────────

/// Validate a Notion integration token. Returns workspace name.
pub async fn validate_token(token: &str) -> Result<String, String> {
    let resp = notion_get(token, "/users/me").await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Notion auth failed ({status}): {body}"));
    }

    let user: UsersMeResponse = resp.json().await.map_err(|e| e.to_string())?;

    // For bot integrations, return workspace name
    if let Some(bot) = &user.bot {
        if let Some(ws) = &bot.workspace_name {
            return Ok(ws.clone());
        }
    }

    Ok(user.name.unwrap_or_else(|| "Notion workspace".to_string()))
}

/// Search for pages and databases in the workspace.
pub async fn search(
    token: &str,
    query: &str,
    page_size: u32,
) -> Result<Vec<NotionSearchResult>, String> {
    let body = serde_json::json!({
        "query": query,
        "page_size": page_size,
        "sort": {
            "direction": "descending",
            "timestamp": "last_edited_time"
        }
    });

    let resp = notion_post(token, "/search", &body).await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Notion search failed ({status}): {body}"));
    }

    let data: SearchResponse = resp.json().await.map_err(|e| e.to_string())?;

    let results = data
        .results
        .into_iter()
        .map(|obj| {
            let title = extract_title(&obj);
            let icon = obj.icon.and_then(|i| i.emoji);
            NotionSearchResult {
                id: obj.id,
                title,
                object: obj.object,
                icon,
                last_edited: obj.last_edited_time,
                url: obj.url,
            }
        })
        .collect();

    Ok(results)
}

/// Fetch a page's content as Markdown by retrieving all blocks recursively.
pub async fn get_page_content(token: &str, page_id: &str) -> Result<String, String> {
    let blocks: Vec<String> = fetch_blocks_recursive(token, page_id, 0).await?;
    Ok(blocks.join("\n"))
}

// ── Block fetching and conversion ──────────────────────────────────────

fn fetch_blocks_recursive<'a>(
    token: &'a str,
    block_id: &'a str,
    depth: u32,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<Vec<String>, String>> + Send + 'a>> {
    Box::pin(fetch_blocks_recursive_inner(token, block_id, depth))
}

async fn fetch_blocks_recursive_inner(
    token: &str,
    block_id: &str,
    depth: u32,
) -> Result<Vec<String>, String> {
    if depth > 5 {
        return Ok(vec!["<!-- nested too deep -->".to_string()]);
    }

    let mut all_lines: Vec<String> = Vec::new();
    let mut cursor: Option<String> = None;

    loop {
        let path = match &cursor {
            Some(c) => format!("/blocks/{block_id}/children?page_size=100&start_cursor={c}"),
            None => format!("/blocks/{block_id}/children?page_size=100"),
        };

        let resp = notion_get(token, &path).await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("Failed to fetch blocks ({status}): {body}"));
        }

        let data: BlockChildrenResponse = resp.json().await.map_err(|e| e.to_string())?;

        for block in &data.results {
            let line = block_to_markdown(block, depth);
            if !line.is_empty() {
                all_lines.push(line);
            }

            // Recurse into children
            if block.has_children {
                let children = fetch_blocks_recursive(token, &block.id, depth + 1).await?;
                all_lines.extend(children);
            }
        }

        if data.has_more {
            cursor = data.next_cursor;
        } else {
            break;
        }
    }

    Ok(all_lines)
}

/// Convert a single Notion block to its Markdown representation.
fn block_to_markdown(block: &Block, depth: u32) -> String {
    let indent = "  ".repeat(depth as usize);
    let block_type = &block.r#type;

    // Get the type-specific data object
    let type_data = &block.data[block_type];

    match block_type.as_str() {
        "paragraph" => {
            let text = rich_text_to_markdown(type_data);
            if text.is_empty() {
                String::new()
            } else {
                format!("{indent}{text}")
            }
        }
        "heading_1" => {
            let text = rich_text_to_markdown(type_data);
            format!("{indent}# {text}")
        }
        "heading_2" => {
            let text = rich_text_to_markdown(type_data);
            format!("{indent}## {text}")
        }
        "heading_3" => {
            let text = rich_text_to_markdown(type_data);
            format!("{indent}### {text}")
        }
        "bulleted_list_item" => {
            let text = rich_text_to_markdown(type_data);
            format!("{indent}- {text}")
        }
        "numbered_list_item" => {
            let text = rich_text_to_markdown(type_data);
            format!("{indent}1. {text}")
        }
        "to_do" => {
            let text = rich_text_to_markdown(type_data);
            let checked = type_data.get("checked").and_then(|v| v.as_bool()).unwrap_or(false);
            let marker = if checked { "[x]" } else { "[ ]" };
            format!("{indent}- {marker} {text}")
        }
        "toggle" => {
            let text = rich_text_to_markdown(type_data);
            format!("{indent}<details>\n{indent}<summary>{text}</summary>\n")
        }
        "code" => {
            let text = rich_text_to_markdown(type_data);
            let lang = type_data
                .get("language")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            format!("{indent}```{lang}\n{text}\n{indent}```")
        }
        "quote" | "callout" => {
            let text = rich_text_to_markdown(type_data);
            let icon = if block_type == "callout" {
                type_data
                    .get("icon")
                    .and_then(|i| i.get("emoji"))
                    .and_then(|e| e.as_str())
                    .map(|e| format!("{e} "))
                    .unwrap_or_default()
            } else {
                String::new()
            };
            // Prefix each line with >
            let quoted = text
                .lines()
                .map(|l| format!("{indent}> {icon}{l}"))
                .collect::<Vec<_>>()
                .join("\n");
            quoted
        }
        "divider" => format!("{indent}---"),
        "image" => {
            let url = extract_file_url(type_data);
            let caption = rich_text_array_to_string(type_data.get("caption"));
            if let Some(u) = url {
                format!("{indent}![{caption}]({u})")
            } else {
                format!("{indent}![{caption}](image)")
            }
        }
        "bookmark" => {
            let url = type_data
                .get("url")
                .and_then(|v| v.as_str())
                .unwrap_or("(no url)");
            let caption = rich_text_array_to_string(type_data.get("caption"));
            if caption.is_empty() {
                format!("{indent}[{url}]({url})")
            } else {
                format!("{indent}[{caption}]({url})")
            }
        }
        "table_of_contents" | "breadcrumb" | "column_list" | "column" => {
            // Structural blocks — skip (children handled recursively)
            String::new()
        }
        "child_page" => {
            let title = type_data
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or("Untitled");
            format!("{indent}📄 **{title}**")
        }
        "child_database" => {
            let title = type_data
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or("Untitled");
            format!("{indent}📊 **{title}**")
        }
        "equation" => {
            let expr = type_data
                .get("expression")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            format!("{indent}$$\n{expr}\n{indent}$$")
        }
        "table_row" => {
            // Table rows contain cells as arrays of rich text
            if let Some(cells) = type_data.get("cells").and_then(|v| v.as_array()) {
                let row = cells
                    .iter()
                    .map(|cell| rich_text_array_to_string(Some(cell)))
                    .collect::<Vec<_>>()
                    .join(" | ");
                format!("{indent}| {row} |")
            } else {
                String::new()
            }
        }
        "embed" | "video" | "file" | "pdf" => {
            let url = extract_file_url(type_data)
                .or_else(|| type_data.get("url").and_then(|v| v.as_str()).map(|s| s.to_string()));
            let caption = rich_text_array_to_string(type_data.get("caption"));
            let label = if caption.is_empty() { block_type.to_string() } else { caption };
            match url {
                Some(u) => format!("{indent}[{label}]({u})"),
                None => format!("{indent}[{label}]"),
            }
        }
        _ => {
            // Unknown block types — try to extract rich text
            let text = rich_text_to_markdown(type_data);
            if text.is_empty() {
                String::new()
            } else {
                format!("{indent}{text}")
            }
        }
    }
}

/// Extract rich text from a block's type-specific data and convert to Markdown.
fn rich_text_to_markdown(type_data: &serde_json::Value) -> String {
    let rt_array = type_data.get("rich_text").and_then(|v| v.as_array());
    match rt_array {
        Some(arr) => arr
            .iter()
            .filter_map(|item| {
                let rt: RichText = serde_json::from_value(item.clone()).ok()?;
                Some(format_rich_text(&rt))
            })
            .collect::<Vec<_>>()
            .join(""),
        None => String::new(),
    }
}

/// Format a single RichText object with Markdown annotations.
fn format_rich_text(rt: &RichText) -> String {
    let mut text = rt.plain_text.clone();

    if let Some(ann) = &rt.annotations {
        if ann.code {
            text = format!("`{text}`");
        }
        if ann.bold {
            text = format!("**{text}**");
        }
        if ann.italic {
            text = format!("*{text}*");
        }
        if ann.strikethrough {
            text = format!("~~{text}~~");
        }
    }

    if let Some(href) = &rt.href {
        text = format!("[{text}]({href})");
    }

    text
}

/// Extract plain text from a rich_text array (for captions, etc.)
fn rich_text_array_to_string(value: Option<&serde_json::Value>) -> String {
    value
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|item| {
                    item.get("plain_text").and_then(|v| v.as_str()).map(|s| s.to_string())
                })
                .collect::<Vec<_>>()
                .join("")
        })
        .unwrap_or_default()
}

/// Extract file URL from various Notion file hosting patterns.
fn extract_file_url(type_data: &serde_json::Value) -> Option<String> {
    // Notion-hosted file
    if let Some(url) = type_data
        .get("file")
        .and_then(|f| f.get("url"))
        .and_then(|v| v.as_str())
    {
        return Some(url.to_string());
    }
    // External file
    if let Some(url) = type_data
        .get("external")
        .and_then(|f| f.get("url"))
        .and_then(|v| v.as_str())
    {
        return Some(url.to_string());
    }
    None
}

/// Extract the title from a Notion search result object.
fn extract_title(obj: &SearchObject) -> String {
    // For pages: properties.title or properties.Name
    if let Some(props) = obj.properties.as_object() {
        // Try "title" property first
        for (_key, val) in props {
            if let Some(arr) = val.get("title").and_then(|v| v.as_array()) {
                let title: String = arr
                    .iter()
                    .filter_map(|item| item.get("plain_text").and_then(|v| v.as_str()))
                    .collect();
                if !title.is_empty() {
                    return title;
                }
            }
        }
    }

    // For databases: title array at top level
    if let Some(title_arr) = obj.properties.get("title") {
        if let Some(arr) = title_arr.as_array() {
            let title: String = arr
                .iter()
                .filter_map(|item| item.get("plain_text").and_then(|v| v.as_str()))
                .collect();
            if !title.is_empty() {
                return title;
            }
        }
    }

    "Untitled".to_string()
}

// ── Tests ──────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_block(block_type: &str, data: serde_json::Value) -> Block {
        let mut full_data = serde_json::json!({});
        full_data[block_type] = data;
        Block {
            id: "test-block".to_string(),
            r#type: block_type.to_string(),
            has_children: false,
            data: full_data,
        }
    }

    fn rt(text: &str) -> serde_json::Value {
        serde_json::json!([{"plain_text": text, "annotations": {"bold": false, "italic": false, "strikethrough": false, "code": false}}])
    }

    fn rt_bold(text: &str) -> serde_json::Value {
        serde_json::json!([{"plain_text": text, "annotations": {"bold": true, "italic": false, "strikethrough": false, "code": false}}])
    }

    #[test]
    fn test_paragraph() {
        let block = make_block("paragraph", serde_json::json!({"rich_text": rt("Hello world")}));
        assert_eq!(block_to_markdown(&block, 0), "Hello world");
    }

    #[test]
    fn test_headings() {
        let h1 = make_block("heading_1", serde_json::json!({"rich_text": rt("Title")}));
        let h2 = make_block("heading_2", serde_json::json!({"rich_text": rt("Section")}));
        let h3 = make_block("heading_3", serde_json::json!({"rich_text": rt("Sub")}));
        assert_eq!(block_to_markdown(&h1, 0), "# Title");
        assert_eq!(block_to_markdown(&h2, 0), "## Section");
        assert_eq!(block_to_markdown(&h3, 0), "### Sub");
    }

    #[test]
    fn test_list_items() {
        let bullet = make_block("bulleted_list_item", serde_json::json!({"rich_text": rt("Item")}));
        let numbered = make_block("numbered_list_item", serde_json::json!({"rich_text": rt("Step")}));
        assert_eq!(block_to_markdown(&bullet, 0), "- Item");
        assert_eq!(block_to_markdown(&numbered, 0), "1. Step");
    }

    #[test]
    fn test_to_do() {
        let unchecked = make_block("to_do", serde_json::json!({"rich_text": rt("Task"), "checked": false}));
        let checked = make_block("to_do", serde_json::json!({"rich_text": rt("Done"), "checked": true}));
        assert_eq!(block_to_markdown(&unchecked, 0), "- [ ] Task");
        assert_eq!(block_to_markdown(&checked, 0), "- [x] Done");
    }

    #[test]
    fn test_code_block() {
        let block = make_block("code", serde_json::json!({"rich_text": rt("fn main() {}"), "language": "rust"}));
        assert_eq!(block_to_markdown(&block, 0), "```rust\nfn main() {}\n```");
    }

    #[test]
    fn test_quote() {
        let block = make_block("quote", serde_json::json!({"rich_text": rt("Wise words")}));
        assert_eq!(block_to_markdown(&block, 0), "> Wise words");
    }

    #[test]
    fn test_callout_with_icon() {
        let block = make_block("callout", serde_json::json!({
            "rich_text": rt("Important"),
            "icon": {"type": "emoji", "emoji": "⚠️"}
        }));
        assert_eq!(block_to_markdown(&block, 0), "> ⚠️ Important");
    }

    #[test]
    fn test_divider() {
        let block = make_block("divider", serde_json::json!({}));
        assert_eq!(block_to_markdown(&block, 0), "---");
    }

    #[test]
    fn test_bold_annotation() {
        let block = make_block("paragraph", serde_json::json!({"rich_text": rt_bold("strong")}));
        assert_eq!(block_to_markdown(&block, 0), "**strong**");
    }

    #[test]
    fn test_mixed_rich_text() {
        let block = make_block("paragraph", serde_json::json!({
            "rich_text": [
                {"plain_text": "Hello ", "annotations": {"bold": false, "italic": false, "strikethrough": false, "code": false}},
                {"plain_text": "world", "annotations": {"bold": true, "italic": false, "strikethrough": false, "code": false}},
                {"plain_text": "!", "annotations": {"bold": false, "italic": false, "strikethrough": false, "code": false}}
            ]
        }));
        assert_eq!(block_to_markdown(&block, 0), "Hello **world**!");
    }

    #[test]
    fn test_link_in_rich_text() {
        let block = make_block("paragraph", serde_json::json!({
            "rich_text": [
                {"plain_text": "Click ", "annotations": {"bold": false, "italic": false, "strikethrough": false, "code": false}},
                {"plain_text": "here", "annotations": {"bold": false, "italic": false, "strikethrough": false, "code": false}, "href": "https://example.com"}
            ]
        }));
        assert_eq!(block_to_markdown(&block, 0), "Click [here](https://example.com)");
    }

    #[test]
    fn test_indentation() {
        let block = make_block("bulleted_list_item", serde_json::json!({"rich_text": rt("Nested")}));
        assert_eq!(block_to_markdown(&block, 2), "    - Nested");
    }

    #[test]
    fn test_toggle() {
        let block = make_block("toggle", serde_json::json!({"rich_text": rt("Details")}));
        assert_eq!(block_to_markdown(&block, 0), "<details>\n<summary>Details</summary>\n");
    }

    #[test]
    fn test_table_row() {
        let block = make_block("table_row", serde_json::json!({
            "cells": [
                [{"plain_text": "A"}],
                [{"plain_text": "B"}],
                [{"plain_text": "C"}]
            ]
        }));
        assert_eq!(block_to_markdown(&block, 0), "| A | B | C |");
    }

    #[test]
    fn test_empty_paragraph() {
        let block = make_block("paragraph", serde_json::json!({"rich_text": []}));
        assert_eq!(block_to_markdown(&block, 0), "");
    }

    #[test]
    fn test_extract_title_from_page() {
        let obj = SearchObject {
            id: "test".to_string(),
            object: "page".to_string(),
            url: "https://notion.so/test".to_string(),
            last_edited_time: "2026-01-01T00:00:00Z".to_string(),
            icon: None,
            properties: serde_json::json!({
                "Name": {
                    "title": [{"plain_text": "My Page"}]
                }
            }),
        };
        assert_eq!(extract_title(&obj), "My Page");
    }

    #[test]
    fn test_extract_title_untitled() {
        let obj = SearchObject {
            id: "test".to_string(),
            object: "page".to_string(),
            url: "https://notion.so/test".to_string(),
            last_edited_time: "2026-01-01T00:00:00Z".to_string(),
            icon: None,
            properties: serde_json::json!({}),
        };
        assert_eq!(extract_title(&obj), "Untitled");
    }
}
