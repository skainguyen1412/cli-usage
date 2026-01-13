# CLI Quota Tracker — Docs & Implementation Plan

> **Goal**: Build a small, scriptable CLI that lets users **track quota + usage** across supported AI tooling.
>
> **Key takeaway**: there are _two_ different “usage” concepts you may want to track:
>
> -   **Proxy usage stats** (requests/tokens seen by CLIProxyAPI): `UsageStats` from the management API endpoint `GET /usage`.
> -   **Provider quota remaining** (rate limits / billing cycle quotas): fetched per provider/account via provider-specific fetchers (auth files, local IDE DBs, and provider APIs).

---

## Scope

### MVP (v0.1)

-   Show **proxy usage stats** if CLIProxyAPI is reachable (local or remote):
    -   total requests, success/fail counts
    -   input/output/total tokens
-   Show **provider quotas** for a small “high signal” set:
    -   **Codex/OpenAI** (from `~/.cli-proxy-api/codex-*.json` + OpenAI usage endpoint)
    -   **GitHub Copilot** (from `~/.cli-proxy-api/github-copilot-*.json` + Copilot entitlement endpoint)
    -   **Claude Code** (from `~/.cli-proxy-api/claude-*.json` + Anthropic OAuth usage endpoint)
    -   **Antigravity** (from `~/.cli-proxy-api/antigravity-*.json` + Cloud Code quota API; returns per-model remaining + reset)
-   Show **Gemini CLI account presence** (quota currently unknown):
    -   reads `~/.gemini/oauth_creds.json` + `~/.gemini/google_accounts.json`
    -   returns a placeholder `ModelQuota(name: "gemini-quota", percentage: -1)` (recommended convention for “unknown”)

### v0.2+

-   Add **Cursor** and **Trae** (reads local SQLite `state.vscdb` then calls vendor API).
-   Add “watch mode” + caching.
-   Add export formats and notifications hooks.

### Non-goals (at first)

-   Managing OAuth flows / logging in (let existing tools generate auth files).
-   Running/upgrading a proxy server binary (out of scope for a quota-tracking CLI).
-   Perfect parity with every provider.

---

## Key concepts & data flow

### A) Proxy usage stats (requests/tokens)

-   If the user runs a local proxy with a management API, it may expose an endpoint like `GET /usage`.
-   Define a simple schema for this response, e.g.:
    -   `UsageStats` → `UsageData(total_requests, success_count, failure_count, total_tokens, input_tokens, output_tokens)`

**CLI implication**: the CLI can provide value _even without provider-specific scraping_ by simply querying `/usage`.

### B) Provider quota remaining (per provider + per account)

Normalize provider quota into a stable, provider-agnostic structure, e.g.:

-   `ProviderQuotaData(models: [ModelQuota], lastUpdated: Date, isForbidden: Bool, planType: String?)`
-   Each `ModelQuota` includes:
    -   `name`, `percentage`, `resetTime`
    -   optional `used/limit/remaining` for providers that support richer info (e.g. Cursor)

**CLI implication**: a single normalized schema lets you add providers incrementally without changing output consumers.

---

## Proposed CLI UX

### Command name

Pick something short and unambiguous:

-   `quota` (simple)
-   `ai-quota`
-   `quota-tracker`

### Subcommands

Use any CLI framework that supports subcommands (examples: Commander, oclif, yargs, click, cobra, clap).

-   `<cli> status` _(default)_
    -   Fetch provider quotas and print a summary table (or JSON).
-   `<cli> proxy-usage`
    -   Fetch `/usage` from CLIProxyAPI and print request/token stats.
-   `<cli> doctor`
    -   Show what data sources are available on this machine (auth-dir files found, Cursor DB found, proxy reachable).
-   `<cli> export --format json --out <path>`
    -   Save a JSON snapshot for tooling/CI.
-   `<cli> watch --interval 30`
    -   Periodically refresh and re-render (or emit JSON lines).

### Common flags

-   `--format table|json` (default `table`)
-   `--auth-dir <path>` (default `~/.cli-proxy-api`)
-   `--base-url <url>` (default `http://localhost:8317` for management API)
-   `--management-key <key>` (optional; if required by your CLIProxyAPI setup)
-   `--timeout <seconds>` (default 15)
-   `--provider <name>` (filter providers)
-   `--account <id>` (filter accounts)
-   `--no-network` (only read local state; skip provider API calls)

---

## Data sources (what the CLI reads)

### 1) CLIProxyAPI Management API (proxy usage stats)

-   Endpoint: `GET {baseURL}/usage`
-   Model: `UsageStats` / `UsageData`
-   What it represents:
    -   traffic observed by CLIProxyAPI (requests + token counts)
    -   not “monthly quota remaining”; it’s usage telemetry

### 2) `~/.cli-proxy-api/` auth directory (provider quotas)

This is a common place to store per-provider auth files. Make it configurable (`--auth-dir`) so your CLI works with other layouts too.

MVP patterns:

-   **OpenAI/Codex**: `codex-<email>.json`
    -   decode token(s), refresh if needed, then call OpenAI usage endpoint
-   **Copilot**: `github-copilot-<username>.json`
    -   decode access token, call Copilot entitlement endpoints
-   **Claude**: `claude-<email>.json`
    -   decode access token, call `https://api.anthropic.com/api/oauth/usage`
-   **Antigravity**: `antigravity-<email>.json`
    -   decode/refresh Google OAuth tokens, then call Cloud Code internal endpoints (e.g. fetch-available-models)
    -   normalize results into `ProviderQuotaData(models: [ModelQuota])` (model names include Gemini/Claude variants)

### 3) Local IDE databases (Cursor/Trae)

-   Cursor example path (macOS):  
    `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb`
-   Read auth token(s) from SQLite, then call vendor API (e.g. Cursor usage-summary).

**Privacy note**: consider making IDE scanning opt-in (e.g. via `doctor` or explicit flags) since it reads local application state.

### 4) Gemini CLI local auth (account detection; quota unknown)

-   Auth files:
    -   `~/.gemini/oauth_creds.json`
    -   `~/.gemini/google_accounts.json`
-   Notes:
    -   Gemini CLI may not expose a public quota API; if quota can’t be fetched reliably, treat this as “account is connected” only and display quota as unknown (percentage `-1`).

---

## Output design

### Human output (table)

Recommended columns:

-   Provider
-   Account
-   Plan (if known)
-   Lowest remaining %
-   Reset (relative, e.g. `2h 15m`)
-   Notes (forbidden / auth expired / offline)

### Machine output (JSON)

Make schema stable and versioned:

```json
{
    "schemaVersion": 1,
    "generatedAt": "2026-01-13T12:34:56Z",
    "proxyUsage": {
        "totalRequests": 1234,
        "successCount": 1200,
        "failureCount": 34,
        "totalTokens": 987654,
        "inputTokens": 555555,
        "outputTokens": 432099
    },
    "providers": {
        "codex": {
            "accounts": {
                "user@example.com": {
                    "planType": "plus",
                    "isForbidden": false,
                    "models": [
                        {
                            "name": "codex-weekly",
                            "percentage": 72.0,
                            "resetTime": "2026-01-14T00:00:00Z"
                        }
                    ]
                }
            }
        }
    }
}
```

---

## JSON schema versioning & time formatting

### When to bump `schemaVersion`

Bump `schemaVersion` when you make a **breaking change** for consumers, such as:

-   removing/renaming fields
-   changing a field’s type (e.g. string → number)
-   changing semantics (e.g. `percentage` meaning flips from remaining → used)

Do **not** bump for additive changes (adding new optional fields).

### Absolute + relative time

-   In **human output**, show relative times (e.g. `2h 15m`).
-   In **JSON**, always include absolute timestamps (ISO8601), and optionally include a computed relative field:
    -   `resetTime`: ISO8601 string (or empty if unknown)
    -   optional `resetInSeconds`: number (or null)

---

## Architecture proposal (keep it simple, but reusable)

### Option A (recommended): shared “core” module + CLI executable

Structure the project so the CLI stays thin:

-   `QuotaCore` (library/module)
    -   Models: `UsageStats`, `ProviderQuotaData`, `ModelQuota`
    -   Clients: proxy management client (optional)
    -   Fetchers: one per provider (OpenAI/Codex, Copilot, Claude, Antigravity, Gemini CLI, etc.)
-   `QuotaCLI` (executable)
    -   Argument parsing
    -   Output formatting (table/json)
    -   Config + caching

### Option B: single-binary implementation

Put everything in one executable target. Faster to start; harder to test/reuse long-term.

---

## Concurrency + reliability rules

-   Keep fetchers **stateless** (or isolate shared state carefully) so parallel execution is safe.
-   In commands, run provider fetches concurrently, but:
    -   rate-limit to avoid API throttling
    -   add caching TTL (e.g., 5 minutes)
-   Never print tokens in logs; redact secrets.

---

## Configuration & precedence

### Precedence order (highest → lowest)

1. CLI flags
2. Environment variables
3. Config file
4. Built-in defaults

### Recommended config keys (examples)

-   Flags:
    -   `--auth-dir`, `--base-url`, `--timeout`, `--format`, `--provider`, `--account`
-   Env vars:
    -   `AIQUOTA_AUTH_DIR`, `AIQUOTA_BASE_URL`, `AIQUOTA_TIMEOUT`, `AIQUOTA_FORMAT`
-   Config file (JSON/YAML/TOML):
    -   `authDir`, `baseUrl`, `timeoutSeconds`, `format`, `rateLimit`, `providers`

### Cross-platform config/cache locations

-   Prefer platform conventions:
    -   **macOS**: `~/Library/Application Support/<app>/` and `~/Library/Caches/<app>/`
    -   **Linux**: XDG (`$XDG_CONFIG_HOME`, `$XDG_CACHE_HOME`)
    -   **Windows**: `%APPDATA%` / `%LOCALAPPDATA%`

---

## Authentication & token management

### Principle: treat tokens as opaque

-   Assume **access tokens may be opaque** and can change format without notice.
-   Only decode JWTs when you must (e.g. reading an **ID token** to extract an email), and treat that as best-effort.

### Token lifecycle states

For each account/provider, model these states:

-   **valid**: API call succeeds; quota fetched
-   **expired-refreshable**: access token expired but refresh token exists and refresh succeeds
-   **expired-non-refreshable**: no refresh token or refresh fails; user must re-auth
-   **invalid**: token malformed/invalid; user must re-auth
-   **unknown**: cannot determine; show “unknown quota” and surface error details

### Refresh strategy (recommended behavior)

-   If the auth file contains `expires_at` / `expiry_date` / `expired`, check it first.
-   Otherwise, treat `401/403` as the source of truth:
    -   on `401`, attempt refresh **only if** a refresh token exists and the provider supports refresh
    -   on `403`, mark `isForbidden=true` (quota denied / access revoked) unless docs suggest otherwise

### Read-only by default

Default behavior should be **read-only**:

-   Never rewrite auth files unless the user explicitly opts in (e.g. `--write-auth`).
-   Prefer keeping refreshed access tokens in memory; optionally persist them to a secure cache instead of rewriting upstream auth files.

---

## Error handling & resilience

### Timeouts

-   Provide a global `--timeout` and allow per-provider overrides in config.
-   Use shorter timeouts for local resources (files/DB) and longer for network.

### Retries (network only)

-   Retry only on **safe, transient** errors:
    -   timeouts, connection reset, DNS temporary failure, `429`, `502/503/504`
-   Use exponential backoff with jitter (example policy):
    -   base: 500ms, max: 10s, attempts: 3 (configurable)
-   Never retry on deterministic failures (e.g. `401` without refresh token).

### Partial failure behavior

If 2/4 providers fail:

-   CLI returns **success exit code** by default, but indicates partial failures in:
    -   a top-level `errors` array in JSON
    -   a “Notes” column in table output
-   Provide `--strict` to fail the command (non-zero exit) if any provider fails.

### Fallback to cache

If live fetch fails:

-   return the **most recent cached result** (if present) and mark it as stale:
    -   JSON: `isStale: true`, `cachedAt`, `ageSeconds`
    -   table: add note like `stale (last updated 12m ago)`

### Malformed or changing APIs

-   Validate responses against minimal expectations.
-   If response shape changes:
    -   record a structured error (`provider`, `account`, `reason: "schema_changed"`)
    -   surface a concise user message and advise updating the CLI

### Exit codes (suggestion)

-   `0`: success (even with partial failures unless `--strict`)
-   `1`: general error (bad config, unexpected crash)
-   `2`: invalid CLI usage (bad flags)
-   `3`: no accounts found / nothing to report (optional)
-   `4`: strict mode failure (at least one provider failed)

---

## Rate limiting & concurrency

### Defaults (safe)

-   Global max concurrency: 4
-   Per-provider max concurrency: 1–2 (configurable)
-   Respect `Retry-After` headers if present.

### User configuration

Allow configuring:

-   max concurrency globally and per provider
-   backoff/attempt counts
-   optional “polite mode” that slows down automatically when rate limits are detected

---

## Security considerations

### Local file safety

-   Validate auth file permissions and warn if overly permissive (e.g. world-readable).
-   Avoid reading more data than needed; never print raw file contents.

### Cache safety

-   Do not store access tokens in cache by default.
-   If caching tokens is unavoidable:
    -   store in OS keychain/credential store where possible
    -   otherwise, store encrypted and with restrictive permissions (0600)

### Logging

-   Implement token redaction:
    -   never log `Authorization` headers
    -   redact `access_token`, `refresh_token`, `id_token` fields
-   Provide `--debug` that still redacts secrets.

---

## IDE database schema stability (Cursor/Trae)

SQLite schemas can change between IDE versions. Plan for this:

-   **Version detection**: query `PRAGMA user_version` and record it in diagnostics output.
-   **Flexible queries**: avoid depending on one exact table shape; prefer key-value lookups when available.
-   **Fallback behavior**: if schema doesn’t match:
    -   skip the provider and mark as `schema_incompatible`
    -   advise running `doctor` to show detected versions

---

## Provider endpoints reference (living table)

Maintain a table in the repo (or generated docs) with:

-   **Provider**
-   **Auth source** (file/db/env)
-   **Auth file pattern**
-   **Quota endpoints**
-   **Refresh supported?** (yes/no/unknown)
-   **Known rate limits** (if documented)
-   **Docs links**

Example starter table (fill/adjust as you implement):

| Provider     | Auth source | Auth pattern            | Quota endpoint(s)                           | Refresh     | Notes                      |
| ------------ | ----------- | ----------------------- | ------------------------------------------- | ----------- | -------------------------- |
| OpenAI/Codex | file        | `codex-*.json`          | _(provider-specific usage endpoint)_        | yes/unknown | treat token as opaque      |
| Copilot      | file        | `github-copilot-*.json` | _(provider-specific entitlement endpoint)_  | yes/unknown | may involve token exchange |
| Claude       | file        | `claude-*.json`         | `https://api.anthropic.com/api/oauth/usage` | unknown     | handle 401 → re-auth       |
| Antigravity  | file        | `antigravity-*.json`    | _(Cloud Code internal endpoints)_           | yes         | internal APIs may change   |
| Gemini CLI   | file        | `~/.gemini/*.json`      | none known                                  | n/a         | show account presence only |
| Cursor       | sqlite      | `state.vscdb`           | _(provider usage endpoint)_                 | unknown     | schema may change          |

---

## Testing strategy

### Unit tests

-   Parse/validate auth file fixtures (good + malformed + missing fields).
-   Parse provider API responses from fixtures (golden files).
-   Snapshot test JSON output for stability (ensure `schemaVersion` contract).

### Integration tests

-   Mock provider APIs (HTTP replay or local mock server).
-   Test partial failure behavior and `--strict`.

### End-to-end tests (optional)

-   Run `doctor` against a temp fixture directory.
-   Run `status --format json` and validate against a JSON schema.

---

## Troubleshooting guide (quick)

-   **No providers found**
    -   check `--auth-dir`
    -   run `<cli> doctor` to see what’s detected
-   **Forbidden / 403**
    -   quota exhausted, org policy, or access revoked; try re-auth
-   **Unauthorized / 401**
    -   token expired/invalid; refresh if supported, otherwise re-auth
-   **Timeout**
    -   increase `--timeout`, check network, reduce concurrency
-   **Schema incompatible (IDE DB)**
    -   IDE updated; run `doctor` for version and file path checks

---

## Extensibility (adding a provider)

Define a clear contract:

-   `ProviderFetcher` interface:
    -   `discoverAccounts()`
    -   `fetchQuota(account)`
    -   `supportsRefresh` + `refreshIfNeeded(account)` (optional)
-   Register in a provider registry:
    -   name/id, auth pattern, default rate limits, docs links
-   Update:
    -   provider reference table
    -   fixtures/tests
    -   `doctor` diagnostics

---

## Caching & persistence

### Cache goals

-   Reduce repeated provider API calls
-   Make `watch` mode cheap
-   Make results available for “last known state” when offline

### Suggested locations (macOS-friendly)

-   Config: `~/Library/Application Support/<app>/config.json`
-   Cache: `~/Library/Caches/<app>/`
-   Optional snapshots: `~/Library/Application Support/<app>/snapshots/`

### Cache shape

-   Store per provider+account JSON payload + timestamp
-   TTL defaults:
    -   provider quota: 5 minutes
    -   proxy usage: 15 seconds

---

## Implementation milestones

### Milestone 0 — Repo scaffolding

-   Create a CLI project with subcommands (any language/runtime).
-   Implement `--help` plus `status`, `proxy-usage`, and `doctor` subcommands.

### Milestone 1 — Proxy usage stats

-   Implement `/usage` client (local-only first, then add remote support).
-   Print a small summary + JSON output.

### Milestone 2 — Auth dir scanning

-   Implement `--auth-dir` scanning for:
    -   `codex-*.json`
    -   `github-copilot-*.json`
    -   `claude-*.json`
    -   `antigravity-*.json`
-   Convert fetched results into `ProviderQuotaData`.
-   Add a `--no-network` mode that still lists discovered accounts but marks quota as unknown/offline.

### Milestone 2.5 — Gemini CLI account detection (quota unknown)

-   Read `~/.gemini/oauth_creds.json` and `~/.gemini/google_accounts.json`
-   Surface the active account email
-   Represent quota as “unknown” (convention: `percentage = -1`)

### Milestone 2.6 — Gemini quota research (before locking in “unknown”)

Investigate whether Gemini quota can be surfaced reliably via one of:

-   `gcloud` commands (if available) or local Gemini CLI diagnostics
-   Google Cloud Console APIs (quota/usage endpoints)
-   Vertex AI quota endpoints (if Gemini usage maps to a project/quota metric)

Deliverable: a short “Gemini quota research” note (what works, what doesn’t, and what auth is required).

### Milestone 3 — Cursor (optional)

-   Read Cursor `state.vscdb` in read-only SQLite mode.
-   Call Cursor usage endpoint and populate `ModelQuota(used/limit/remaining)` where available.

### Milestone 4 — Packaging

-   Provide release build instructions for your chosen runtime (e.g., Node “single binary” packagers, or just `npm install -g`).
-   optional Homebrew formula / GitHub release packaging

---

## TypeScript/Node.js (optional appendix)

If you’re implementing this in TypeScript:

-   **CLI frameworks**: `yargs`, `commander`, `oclif`
-   **HTTP**: `fetch` (Node 18+), or `undici`
-   **SQLite read-only** (Cursor/Trae): `better-sqlite3` or `sqlite3` (prefer read-only/immutable modes when possible)
-   **Home directory paths**: use Node’s `os.homedir()` and `path.join(...)` (never hardcode `~` without expanding)
-   **Concurrency**: use a concurrency limiter (e.g. `p-limit`) when hitting multiple provider endpoints
-   **Config/cache locations**:
    -   macOS: `~/Library/Application Support/<app>/` and `~/Library/Caches/<app>/`
    -   cross-platform: consider XDG (`$XDG_CONFIG_HOME`, `$XDG_CACHE_HOME`) with sane fallbacks

---

## Open questions (decide early)

-   Should the CLI **depend on CLIProxyAPI** being installed/running, or operate fully standalone?
    -   Recommendation: support both; proxy usage is additive.
-   Should `doctor` scan IDE databases by default?
    -   Recommendation: opt-in flags to match a conservative privacy posture.
-   Do you want the CLI to be **read-only** (recommended), or also manage auth flows?

---

## Critical behavior decisions (recommended defaults)

-   **If the proxy `/usage` endpoint returns malformed data**:
    -   treat it as unavailable, return cached proxy stats if present, and include a structured error in output.
-   **Should the CLI validate auth file schemas before API calls?**
    -   yes: validate minimally (required keys + types) and fail fast per account with a clear error.
-   **Interactive re-auth required (refresh fails)**
    -   mark account as `needs_reauth` and print the next step (which tool/login flow produces the auth file).
-   **Should `doctor` auto-fix issues (refresh tokens, chmod)?**
    -   default: no (read-only). Optional: add `doctor --fix` later with explicit prompts/flags.
-   **When `--provider` matches no configured accounts**
    -   return success with an empty result by default; add `--strict` to turn this into an error.
