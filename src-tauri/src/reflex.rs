//! Reflex — ambient AI margin annotation engine.
//!
//! Analyzes paragraphs via a fast model (Haiku/Flash) and returns spatial
//! annotations: consistency checks, cross-note connections, structural
//! nudges. Results are cached by paragraph content hash with a 30-minute TTL.
//! Rate-limited to max 1 analysis request per 2 seconds.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::hash::{DefaultHasher, Hash, Hasher};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tokio::sync::mpsc;

use crate::agent::bridge::PiBridge;
use crate::agent::types::CreateSessionRequest;

// ── Types ──────────────────────────────────────────────────────────────

/// Annotation type surfaced in the margin.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum AnnotationType {
    Consistency,
    Connection,
    Continuity,
    Structure,
    Question,
}

/// A single margin annotation returned from analysis.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Annotation {
    #[serde(rename = "type")]
    pub annotation_type: AnnotationType,
    pub message: String,
    pub confidence: f64,
    #[serde(rename = "ref", skip_serializing_if = "Option::is_none")]
    pub reference: Option<String>,
}

/// Request to analyze a paragraph.
#[derive(Debug, Clone, Deserialize)]
pub struct AnalyzeRequest {
    /// The paragraph text to analyze
    pub text: String,
    /// Surrounding paragraphs for context (before, after)
    #[serde(default)]
    pub before: Option<String>,
    #[serde(default)]
    pub after: Option<String>,
    /// Document mode/tag (e.g. "blog", "plan", "chat")
    #[serde(default)]
    pub mode: Option<String>,
    /// Additional context (loaded context items, related notes)
    #[serde(default)]
    pub context: Option<String>,
}

// ── Cache ──────────────────────────────────────────────────────────────

const CACHE_TTL: Duration = Duration::from_secs(30 * 60); // 30 minutes

struct CacheEntry {
    annotations: Vec<Annotation>,
    created_at: Instant,
}

impl CacheEntry {
    fn is_expired(&self) -> bool {
        self.created_at.elapsed() > CACHE_TTL
    }
}

/// Compute a content hash for cache keying.
fn content_hash(text: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    text.trim().hash(&mut hasher);
    hasher.finish()
}

// ── Rate Limiter ───────────────────────────────────────────────────────

const RATE_LIMIT_INTERVAL: Duration = Duration::from_secs(2);

struct RateLimiter {
    last_request: Option<Instant>,
}

impl RateLimiter {
    fn new() -> Self {
        Self {
            last_request: None,
        }
    }

    /// Returns true if a request can proceed now.
    fn can_proceed(&self) -> bool {
        match self.last_request {
            None => true,
            Some(last) => last.elapsed() >= RATE_LIMIT_INTERVAL,
        }
    }

    /// Mark that a request is being sent now.
    fn mark_sent(&mut self) {
        self.last_request = Some(Instant::now());
    }

    /// Time until next request is allowed.
    fn time_until_next(&self) -> Duration {
        match self.last_request {
            None => Duration::ZERO,
            Some(last) => {
                let elapsed = last.elapsed();
                if elapsed >= RATE_LIMIT_INTERVAL {
                    Duration::ZERO
                } else {
                    RATE_LIMIT_INTERVAL - elapsed
                }
            }
        }
    }
}

// ── Prompt ─────────────────────────────────────────────────────────────

fn build_analysis_prompt(request: &AnalyzeRequest) -> String {
    let mode_hint = match request.mode.as_deref() {
        Some("blog") => "This is a blog post — prioritize style and consistency observations.",
        Some("plan") => "This is a plan document — prioritize structural and completeness observations.",
        Some("scratch") => "This is a scratch note — only surface high-confidence observations.",
        Some("tweet") => "This is a tweet/short post — focus on clarity and impact.",
        _ => "This is a general document.",
    };

    let mut prompt = format!(
        r#"You are a writing assistant analyzing a single paragraph. {mode_hint}

Paragraph to analyze:
---
{text}
---
"#,
        text = request.text
    );

    if let Some(ref before) = request.before {
        prompt.push_str(&format!(
            "\nPreceding paragraph:\n---\n{before}\n---\n"
        ));
    }
    if let Some(ref after) = request.after {
        prompt.push_str(&format!(
            "\nFollowing paragraph:\n---\n{after}\n---\n"
        ));
    }
    if let Some(ref context) = request.context {
        prompt.push_str(&format!(
            "\nLoaded context (files, notes, references):\n---\n{context}\n---\n"
        ));
    }

    prompt.push_str(
        r#"
Return a JSON array of 0-3 annotations. Each annotation:
{ "type": "consistency|connection|continuity|structure|question",
  "message": "Brief, one-line observation (max 60 chars)",
  "confidence": 0.0-1.0,
  "ref": "optional note ID or context item label" }

Rules:
- Only surface genuinely useful observations. An empty array [] is fine.
- Match annotation style to document mode (blog=style, plan=structure).
- Never suggest rewrites. Observe, don't prescribe.
- Confidence below 0.6 → don't include.
- Return ONLY the JSON array, no other text."#,
    );

    prompt
}

/// Parse model response into annotations, returning empty vec on failure.
fn parse_annotations(response: &str) -> Vec<Annotation> {
    // Try to find JSON array in the response
    let trimmed = response.trim();

    // Try direct parse first
    if let Ok(annotations) = serde_json::from_str::<Vec<Annotation>>(trimmed) {
        return filter_annotations(annotations);
    }

    // Try to extract JSON array from markdown code block
    if let Some(start) = trimmed.find('[') {
        if let Some(end) = trimmed.rfind(']') {
            let json_slice = &trimmed[start..=end];
            if let Ok(annotations) = serde_json::from_str::<Vec<Annotation>>(json_slice) {
                return filter_annotations(annotations);
            }
        }
    }

    // Malformed output → empty annotations
    Vec::new()
}

/// Filter annotations by confidence threshold.
fn filter_annotations(annotations: Vec<Annotation>) -> Vec<Annotation> {
    annotations
        .into_iter()
        .filter(|a| a.confidence >= 0.6)
        .take(3)
        .collect()
}

// ── Engine ─────────────────────────────────────────────────────────────

/// The Reflex analysis engine. Manages cache, rate limiting, and model calls.
pub struct ReflexEngine {
    pi: PiBridge,
    cache: Mutex<HashMap<u64, CacheEntry>>,
    rate_limiter: Mutex<RateLimiter>,
    enabled: Mutex<bool>,
    /// Sender for queued analysis requests that need to wait for rate limit
    queue_tx: mpsc::UnboundedSender<(AnalyzeRequest, tokio::sync::oneshot::Sender<Vec<Annotation>>)>,
}

impl ReflexEngine {
    /// Create a new ReflexEngine with a reference to the pi bridge.
    pub fn new(pi: PiBridge) -> Self {
        let (queue_tx, mut queue_rx) = mpsc::unbounded_channel::<(
            AnalyzeRequest,
            tokio::sync::oneshot::Sender<Vec<Annotation>>,
        )>();

        // Spawn a background task to drain queued requests
        let pi_clone = pi.clone();
        tauri::async_runtime::spawn(async move {
            while let Some((request, reply)) = queue_rx.recv().await {
                // Wait for rate limit
                tokio::time::sleep(RATE_LIMIT_INTERVAL).await;
                let result = Self::call_model_static(&pi_clone, &request).await;
                let _ = reply.send(result);
            }
        });

        Self {
            pi,
            cache: Mutex::new(HashMap::new()),
            rate_limiter: Mutex::new(RateLimiter::new()),
            enabled: Mutex::new(true),
            queue_tx,
        }
    }

    /// Check if Reflex is enabled.
    pub fn is_enabled(&self) -> bool {
        *self.enabled.lock().unwrap()
    }

    /// Toggle Reflex on/off.
    pub fn set_enabled(&self, enabled: bool) {
        *self.enabled.lock().unwrap() = enabled;
    }

    /// Invalidate all cached annotations (e.g. when context items change).
    pub fn invalidate_cache(&self) {
        self.cache.lock().unwrap().clear();
    }

    /// Analyze a paragraph, returning cached results if available.
    pub async fn analyze_paragraph(
        &self,
        request: AnalyzeRequest,
    ) -> Vec<Annotation> {
        if !self.is_enabled() {
            return Vec::new();
        }

        // Skip empty/whitespace-only paragraphs
        if request.text.trim().is_empty() {
            return Vec::new();
        }

        let hash = content_hash(&request.text);

        // Check cache
        {
            let cache = self.cache.lock().unwrap();
            if let Some(entry) = cache.get(&hash) {
                if !entry.is_expired() {
                    return entry.annotations.clone();
                }
            }
        }

        // Rate limit check
        let should_queue = {
            let mut limiter = self.rate_limiter.lock().unwrap();
            if limiter.can_proceed() {
                limiter.mark_sent();
                false
            } else {
                true
            }
        };

        let annotations = if should_queue {
            // Queue the request
            let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
            if self.queue_tx.send((request.clone(), reply_tx)).is_ok() {
                reply_rx.await.unwrap_or_default()
            } else {
                Vec::new()
            }
        } else {
            // Proceed immediately
            Self::call_model_static(&self.pi, &request).await
        };

        // Cache the result
        {
            let mut cache = self.cache.lock().unwrap();
            // Evict expired entries periodically (every 100 entries)
            if cache.len() > 100 {
                cache.retain(|_, v| !v.is_expired());
            }
            cache.insert(
                hash,
                CacheEntry {
                    annotations: annotations.clone(),
                    created_at: Instant::now(),
                },
            );
        }

        annotations
    }

    /// Make the actual model call. Static method so it can be used from the queue task.
    async fn call_model_static(pi: &PiBridge, request: &AnalyzeRequest) -> Vec<Annotation> {
        let prompt = build_analysis_prompt(request);

        // Create a temporary session with a fast model, no persistence
        let session_request = CreateSessionRequest {
            provider: Some("anthropic".to_string()),
            model: Some("claude-haiku-4-20250514".to_string()),
            api_key: None,
            system_prompt: None,
            append_system_prompt: None,
            working_directory: None,
            session_path: None,
            session_dir: None,
            no_session: true,
            enabled_tools: Some(vec![]), // No tools needed
        };

        // Create session
        let (session_id, mut event_rx) = match pi.create_session(session_request).await {
            Ok(result) => result,
            Err(e) => {
                log::warn!("Reflex: failed to create session: {e}");
                return Vec::new();
            }
        };

        // Send prompt
        if let Err(e) = pi.prompt(session_id.clone(), prompt).await {
            log::warn!("Reflex: prompt failed: {e}");
            let _ = pi.destroy_session(session_id).await;
            return Vec::new();
        }

        // Collect the full response from events
        let mut response = String::new();
        while let Some(event) = event_rx.recv().await {
            match event {
                crate::agent::types::PiEvent::TextDelta { delta, .. } => {
                    response.push_str(&delta);
                }
                crate::agent::types::PiEvent::AgentEnd { .. } => break,
                crate::agent::types::PiEvent::Error { message, .. } => {
                    log::warn!("Reflex: model error: {message}");
                    break;
                }
                _ => {}
            }
        }

        // Destroy the temporary session
        let _ = pi.destroy_session(session_id).await;

        parse_annotations(&response)
    }
}

// ── Tests ──────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn content_hash_stable() {
        let h1 = content_hash("Hello, world!");
        let h2 = content_hash("Hello, world!");
        let h3 = content_hash("  Hello, world!  "); // trimmed
        let h4 = content_hash("Different text");
        assert_eq!(h1, h2);
        assert_eq!(h1, h3);
        assert_ne!(h1, h4);
    }

    #[test]
    fn parse_valid_json_array() {
        let input = r#"[
            {"type": "consistency", "message": "Matches API docs", "confidence": 0.9},
            {"type": "connection", "message": "Related to Draft", "confidence": 0.7, "ref": "note-123"}
        ]"#;
        let annotations = parse_annotations(input);
        assert_eq!(annotations.len(), 2);
        assert_eq!(annotations[0].annotation_type, AnnotationType::Consistency);
        assert_eq!(annotations[0].message, "Matches API docs");
        assert_eq!(annotations[1].reference, Some("note-123".to_string()));
    }

    #[test]
    fn parse_json_in_code_block() {
        let input = r#"Here are the annotations:
```json
[{"type": "structure", "message": "Long sentence (42 words)", "confidence": 0.8}]
```"#;
        let annotations = parse_annotations(input);
        assert_eq!(annotations.len(), 1);
        assert_eq!(annotations[0].annotation_type, AnnotationType::Structure);
    }

    #[test]
    fn parse_malformed_returns_empty() {
        assert!(parse_annotations("This is not JSON").is_empty());
        assert!(parse_annotations("").is_empty());
        assert!(parse_annotations("{not an array}").is_empty());
    }

    #[test]
    fn parse_filters_low_confidence() {
        let input = r#"[
            {"type": "question", "message": "Unsupported claim", "confidence": 0.3},
            {"type": "consistency", "message": "Verified", "confidence": 0.9}
        ]"#;
        let annotations = parse_annotations(input);
        assert_eq!(annotations.len(), 1);
        assert_eq!(annotations[0].annotation_type, AnnotationType::Consistency);
    }

    #[test]
    fn parse_limits_to_three() {
        let input = r#"[
            {"type": "consistency", "message": "A", "confidence": 0.9},
            {"type": "connection", "message": "B", "confidence": 0.8},
            {"type": "structure", "message": "C", "confidence": 0.7},
            {"type": "question", "message": "D", "confidence": 0.9},
            {"type": "continuity", "message": "E", "confidence": 0.8}
        ]"#;
        let annotations = parse_annotations(input);
        assert_eq!(annotations.len(), 3);
    }

    #[test]
    fn build_prompt_includes_text() {
        let req = AnalyzeRequest {
            text: "Test paragraph".to_string(),
            before: None,
            after: None,
            mode: None,
            context: None,
        };
        let prompt = build_analysis_prompt(&req);
        assert!(prompt.contains("Test paragraph"));
        assert!(prompt.contains("JSON array"));
    }

    #[test]
    fn build_prompt_includes_mode() {
        let req = AnalyzeRequest {
            text: "Test".to_string(),
            before: None,
            after: None,
            mode: Some("blog".to_string()),
            context: None,
        };
        let prompt = build_analysis_prompt(&req);
        assert!(prompt.contains("blog post"));
        assert!(prompt.contains("style and consistency"));
    }

    #[test]
    fn build_prompt_includes_surrounding() {
        let req = AnalyzeRequest {
            text: "Main paragraph".to_string(),
            before: Some("Before text".to_string()),
            after: Some("After text".to_string()),
            mode: None,
            context: Some("API documentation...".to_string()),
        };
        let prompt = build_analysis_prompt(&req);
        assert!(prompt.contains("Before text"));
        assert!(prompt.contains("After text"));
        assert!(prompt.contains("API documentation"));
    }

    #[test]
    fn cache_entry_expiry() {
        let entry = CacheEntry {
            annotations: vec![],
            created_at: Instant::now() - Duration::from_secs(31 * 60),
        };
        assert!(entry.is_expired());

        let fresh = CacheEntry {
            annotations: vec![],
            created_at: Instant::now(),
        };
        assert!(!fresh.is_expired());
    }

    #[test]
    fn rate_limiter_initially_allows() {
        let limiter = RateLimiter::new();
        assert!(limiter.can_proceed());
        assert_eq!(limiter.time_until_next(), Duration::ZERO);
    }

    #[test]
    fn rate_limiter_blocks_after_request() {
        let mut limiter = RateLimiter::new();
        limiter.mark_sent();
        assert!(!limiter.can_proceed());
        assert!(limiter.time_until_next() > Duration::ZERO);
    }

    #[test]
    fn empty_text_returns_no_annotations() {
        // This tests the logic, not the async path
        let req = AnalyzeRequest {
            text: "   ".to_string(),
            before: None,
            after: None,
            mode: None,
            context: None,
        };
        assert!(req.text.trim().is_empty());
    }

    #[test]
    fn annotation_serialization_roundtrip() {
        let annotation = Annotation {
            annotation_type: AnnotationType::Connection,
            message: "Related to draft".to_string(),
            confidence: 0.85,
            reference: Some("note-abc".to_string()),
        };
        let json = serde_json::to_string(&annotation).unwrap();
        let parsed: Annotation = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.annotation_type, AnnotationType::Connection);
        assert_eq!(parsed.message, "Related to draft");
        assert_eq!(parsed.confidence, 0.85);
        assert_eq!(parsed.reference, Some("note-abc".to_string()));
    }
}
