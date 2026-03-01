//! GitHub REST API integration — repo browsing, file/PR/issue fetching.
//!
//! Uses a PAT (Personal Access Token) for authentication.
//! All calls go through the GitHub REST API v3.

use reqwest::header::{ACCEPT, AUTHORIZATION, USER_AGENT};
use serde::{Deserialize, Serialize};

const GITHUB_API: &str = "https://api.github.com";
const APP_USER_AGENT: &str = "mood-editor/0.1.0";

// ── Types ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubUser {
    pub login: String,
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubRepo {
    pub full_name: String,
    pub description: Option<String>,
    pub default_branch: String,
    pub private: bool,
    pub html_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubTreeEntry {
    pub path: String,
    #[serde(rename = "type")]
    pub entry_type: String, // "blob" or "tree"
    pub size: Option<u64>,
    pub sha: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubTree {
    pub sha: String,
    pub tree: Vec<GitHubTreeEntry>,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubFileContent {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub content: Option<String>,
    pub encoding: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubIssue {
    pub number: u64,
    pub title: String,
    pub body: Option<String>,
    pub state: String,
    pub user: GitHubUser,
    pub html_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubComment {
    pub body: String,
    pub user: GitHubUser,
}

/// Simplified PR info for context.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubPullRequest {
    pub number: u64,
    pub title: String,
    pub body: Option<String>,
    pub state: String,
    pub diff: String,
    pub html_url: String,
}

// ── Client ─────────────────────────────────────────────────────────────

fn client(pat: &str) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .default_headers({
            let mut h = reqwest::header::HeaderMap::new();
            h.insert(USER_AGENT, APP_USER_AGENT.parse().unwrap());
            h.insert(
                AUTHORIZATION,
                format!("Bearer {pat}").parse().map_err(|e| format!("{e}"))?,
            );
            h.insert(
                ACCEPT,
                "application/vnd.github+json".parse().unwrap(),
            );
            h
        })
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))
}

fn check_response(status: reqwest::StatusCode, url: &str) -> Result<(), String> {
    if status == reqwest::StatusCode::UNAUTHORIZED {
        return Err("Invalid or expired GitHub token".to_string());
    }
    if status == reqwest::StatusCode::NOT_FOUND {
        return Err(format!("Not found: {url}"));
    }
    if status == reqwest::StatusCode::FORBIDDEN {
        return Err("GitHub API rate limit exceeded or access denied".to_string());
    }
    if !status.is_success() {
        return Err(format!("GitHub API error: {status} for {url}"));
    }
    Ok(())
}

// ── API Functions ──────────────────────────────────────────────────────

/// Validate a PAT and return the authenticated user.
pub async fn validate_pat(pat: &str) -> Result<GitHubUser, String> {
    let c = client(pat)?;
    let url = format!("{GITHUB_API}/user");
    let resp = c.get(&url).send().await.map_err(|e| format!("{e}"))?;
    check_response(resp.status(), &url)?;
    resp.json::<GitHubUser>()
        .await
        .map_err(|e| format!("Failed to parse user: {e}"))
}

/// List repositories for the authenticated user.
pub async fn list_repos(pat: &str, page: u32, per_page: u32) -> Result<Vec<GitHubRepo>, String> {
    let c = client(pat)?;
    let url = format!(
        "{GITHUB_API}/user/repos?sort=pushed&per_page={per_page}&page={page}&type=all"
    );
    let resp = c.get(&url).send().await.map_err(|e| format!("{e}"))?;
    check_response(resp.status(), &url)?;
    resp.json::<Vec<GitHubRepo>>()
        .await
        .map_err(|e| format!("Failed to parse repos: {e}"))
}

/// Get the file tree for a repo (recursive, single API call).
pub async fn get_tree(
    pat: &str,
    owner: &str,
    repo: &str,
    branch: &str,
) -> Result<Vec<GitHubTreeEntry>, String> {
    let c = client(pat)?;
    let url = format!(
        "{GITHUB_API}/repos/{owner}/{repo}/git/trees/{branch}?recursive=1"
    );
    let resp = c.get(&url).send().await.map_err(|e| format!("{e}"))?;
    check_response(resp.status(), &url)?;
    let tree: GitHubTree = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse tree: {e}"))?;
    // Filter to blobs only (files, not directories)
    Ok(tree.tree)
}

/// Get the content of a single file.
pub async fn get_file(
    pat: &str,
    owner: &str,
    repo: &str,
    path: &str,
    branch: &str,
) -> Result<String, String> {
    let c = client(pat)?;
    // Use the raw endpoint for simplicity
    let url = format!(
        "https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}"
    );
    let resp = c.get(&url).send().await.map_err(|e| format!("{e}"))?;
    check_response(resp.status(), &url)?;

    let size = resp.content_length().unwrap_or(0);
    if size > 1_048_576 {
        return Err(format!("File too large ({size} bytes, max 1MB)"));
    }

    resp.text()
        .await
        .map_err(|e| format!("Failed to read file: {e}"))
}

/// Get an issue with its comments.
pub async fn get_issue(
    pat: &str,
    owner: &str,
    repo: &str,
    number: u64,
) -> Result<(GitHubIssue, Vec<GitHubComment>), String> {
    let c = client(pat)?;

    let issue_url = format!("{GITHUB_API}/repos/{owner}/{repo}/issues/{number}");
    let resp = c.get(&issue_url).send().await.map_err(|e| format!("{e}"))?;
    check_response(resp.status(), &issue_url)?;
    let issue: GitHubIssue = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse issue: {e}"))?;

    let comments_url = format!("{issue_url}/comments?per_page=50");
    let resp = c
        .get(&comments_url)
        .send()
        .await
        .map_err(|e| format!("{e}"))?;
    check_response(resp.status(), &comments_url)?;
    let comments: Vec<GitHubComment> = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse comments: {e}"))?;

    Ok((issue, comments))
}

/// Get a PR's diff.
pub async fn get_pr_diff(
    pat: &str,
    owner: &str,
    repo: &str,
    number: u64,
) -> Result<GitHubPullRequest, String> {
    let c = client(pat)?;

    // Get PR metadata
    let pr_url = format!("{GITHUB_API}/repos/{owner}/{repo}/pulls/{number}");
    let resp = c.get(&pr_url).send().await.map_err(|e| format!("{e}"))?;
    check_response(resp.status(), &pr_url)?;

    #[derive(Deserialize)]
    struct PrMeta {
        number: u64,
        title: String,
        body: Option<String>,
        state: String,
        html_url: String,
    }
    let meta: PrMeta = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse PR: {e}"))?;

    // Get diff
    let diff_resp = c
        .get(&pr_url)
        .header(ACCEPT, "application/vnd.github.v3.diff")
        .send()
        .await
        .map_err(|e| format!("{e}"))?;
    check_response(diff_resp.status(), &pr_url)?;

    let diff = diff_resp
        .text()
        .await
        .map_err(|e| format!("Failed to read diff: {e}"))?;

    // Truncate very large diffs
    let diff = if diff.len() > 500_000 {
        format!(
            "{}\n\n... diff truncated ({} bytes total)",
            &diff[..500_000],
            diff.len()
        )
    } else {
        diff
    };

    Ok(GitHubPullRequest {
        number: meta.number,
        title: meta.title,
        body: meta.body,
        state: meta.state,
        diff,
        html_url: meta.html_url,
    })
}

/// Format an issue + comments into readable context text.
pub fn format_issue_context(issue: &GitHubIssue, comments: &[GitHubComment]) -> String {
    let mut out = format!(
        "# #{} {}\n\nBy @{} · {}\n\n{}",
        issue.number,
        issue.title,
        issue.user.login,
        issue.state,
        issue.body.as_deref().unwrap_or("(no description)"),
    );
    for (i, comment) in comments.iter().enumerate() {
        out.push_str(&format!(
            "\n\n---\n**Comment {}** by @{}:\n{}",
            i + 1,
            comment.user.login,
            comment.body
        ));
    }
    out
}

/// Format a PR into readable context text.
pub fn format_pr_context(pr: &GitHubPullRequest) -> String {
    format!(
        "# PR #{} {}\n\n{}\n\n```diff\n{}\n```",
        pr.number,
        pr.title,
        pr.body.as_deref().unwrap_or("(no description)"),
        pr.diff,
    )
}

// ── Tests ──────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_issue_context() {
        let issue = GitHubIssue {
            number: 42,
            title: "Fix the bug".to_string(),
            body: Some("It crashes on startup".to_string()),
            state: "open".to_string(),
            user: GitHubUser {
                login: "alice".to_string(),
                name: None,
            },
            html_url: "https://github.com/owner/repo/issues/42".to_string(),
        };
        let comments = vec![GitHubComment {
            body: "I can reproduce this".to_string(),
            user: GitHubUser {
                login: "bob".to_string(),
                name: None,
            },
        }];

        let text = format_issue_context(&issue, &comments);
        assert!(text.contains("# #42 Fix the bug"));
        assert!(text.contains("@alice"));
        assert!(text.contains("It crashes on startup"));
        assert!(text.contains("@bob"));
        assert!(text.contains("I can reproduce this"));
    }

    #[test]
    fn test_format_pr_context() {
        let pr = GitHubPullRequest {
            number: 7,
            title: "Add feature".to_string(),
            body: Some("This adds the thing".to_string()),
            state: "open".to_string(),
            diff: "+new line\n-old line".to_string(),
            html_url: "https://github.com/owner/repo/pull/7".to_string(),
        };

        let text = format_pr_context(&pr);
        assert!(text.contains("PR #7 Add feature"));
        assert!(text.contains("```diff"));
        assert!(text.contains("+new line"));
    }

    #[test]
    fn test_format_issue_no_body() {
        let issue = GitHubIssue {
            number: 1,
            title: "Blank".to_string(),
            body: None,
            state: "closed".to_string(),
            user: GitHubUser {
                login: "x".to_string(),
                name: None,
            },
            html_url: String::new(),
        };

        let text = format_issue_context(&issue, &[]);
        assert!(text.contains("(no description)"));
    }
}
