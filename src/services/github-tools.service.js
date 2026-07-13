'use strict';

/**
 * Read-only tool for the Personal AI Agent to query recent commit history on
 * whitelisted GitHub repos (GITHUB_REPOS in .env). Returns commit metadata
 * only (message/author/date/short sha) - never fetches diffs or file content.
 *
 * Phase 6-5: also exposes createGithubIssue, a write call used only by the
 * pending_actions execute step (never called directly by the agent's
 * tool-use loop - see pending-actions.service.js). Uses GITHUB_ISSUE_TOKEN,
 * a separate token from the read-only GITHUB_TOKEN above, so issue-creation
 * scope can be granted/revoked independently of commit-history read access.
 */

const GITHUB_API_BASE = 'https://api.github.com';

function getAllowedRepoSlugs() {
  return String(process.env.GITHUB_REPOS || '')
    .split(',')
    .map((slug) => slug.trim())
    .filter(Boolean);
}

function resolveRepoSlug(repo) {
  const allowed = getAllowedRepoSlugs();
  const match = allowed.find((slug) => slug === repo || slug.endsWith(`/${repo}`));

  if (!match) {
    throw new Error(
      `Repo "${repo}" is not in the configured whitelist (GITHUB_REPOS). Allowed repos: ${allowed.join(', ') || '(none configured)'}`
    );
  }

  return match;
}

async function getRecentCommits({ repo, limit } = {}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN is not set in .env');
  }

  const repoSlug = resolveRepoSlug(repo);
  const safeLimit = Math.max(1, Math.min(Number(limit) || 5, 20));

  const response = await fetch(`${GITHUB_API_BASE}/repos/${repoSlug}/commits?per_page=${safeLimit}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json'
    }
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`GitHub API returned HTTP ${response.status} for ${repoSlug}: ${text.slice(0, 300)}`);
  }

  const commits = await response.json();

  return (Array.isArray(commits) ? commits : []).map((commit) => ({
    sha: String(commit?.sha || '').slice(0, 7),
    message: commit?.commit?.message || '',
    author: commit?.commit?.author?.name || commit?.author?.login || 'unknown',
    date: commit?.commit?.author?.date || null
  }));
}

async function createGithubIssue({ repo, title, body, labels } = {}) {
  const token = process.env.GITHUB_ISSUE_TOKEN;
  if (!token) {
    throw new Error('GITHUB_ISSUE_TOKEN is not set in .env');
  }

  if (!title) {
    throw new Error('title is required to create a GitHub issue');
  }

  const repoSlug = resolveRepoSlug(repo);
  const safeLabels = Array.isArray(labels) ? labels.map((label) => String(label)) : [];

  const response = await fetch(`${GITHUB_API_BASE}/repos/${repoSlug}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ title: String(title), body: body ? String(body) : '', labels: safeLabels })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`GitHub API returned HTTP ${response.status} for ${repoSlug}: ${text.slice(0, 300)}`);
  }

  const issue = await response.json();

  return {
    issue_number: issue?.number ?? null,
    issue_url: issue?.html_url || null
  };
}

module.exports = { getRecentCommits, createGithubIssue };
