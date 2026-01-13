# CLI Usage Flow Examples

This document shows realistic usage scenarios and outputs for the quota tracker CLI.

---

## Scenario 1: First-time user checking quota

### Command
```bash
quota status
```

### Output (table format, default)
```
┌──────────────┬─────────────────────┬──────────┬───────────┬──────────┬────────────────────────┐
│ Provider     │ Account             │ Plan     │ Remaining │ Reset    │ Notes                  │
├──────────────┼─────────────────────┼──────────┼───────────┼──────────┼────────────────────────┤
│ Codex        │ user@example.com    │ Plus     │ 72%       │ 8h 23m   │                        │
│ Copilot      │ github-user         │ Business │ 45%       │ 2d 4h    │                        │
│ Claude       │ user@example.com    │ Pro      │ 88%       │ 1h 15m   │                        │
│ Antigravity  │ user@example.com    │ -        │ 91%       │ 23h 45m  │ (lowest: gemini-2.0)   │
│ Gemini CLI   │ user@example.com    │ -        │ unknown   │ -        │ quota API unavailable  │
└──────────────┴─────────────────────┴──────────┴───────────┴──────────┴────────────────────────┘

⚠️  1 provider has low quota (< 50%)
```

### What happened internally
1. CLI scanned `~/.cli-proxy-api/` for auth files
2. Found 4 provider auth files (codex, copilot, claude, antigravity)
3. Found Gemini CLI auth at `~/.gemini/oauth_creds.json`
4. Made concurrent API calls to each provider (with rate limiting)
5. Normalized responses into `ProviderQuotaData`
6. Rendered table sorted by provider name

---

## Scenario 2: Checking proxy usage stats

### Command
```bash
quota proxy-usage
```

### Output
```
CLIProxyAPI Usage Stats (http://localhost:8317)
Last updated: 2026-01-13 15:30:45

Total Requests:     1,234
  ✓ Success:        1,200 (97.2%)
  ✗ Failed:         34 (2.8%)

Token Usage:
  Input tokens:     555,555
  Output tokens:    432,099
  Total tokens:     987,654
```

### What happened internally
1. CLI connected to `http://localhost:8317/usage` (default base URL)
2. Fetched `UsageStats` JSON response
3. Formatted as human-readable summary
4. Cached result for 15 seconds

---

## Scenario 3: JSON output for automation

### Command
```bash
quota status --format json
```

### Output
```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-01-13T15:30:45Z",
  "providers": {
    "codex": {
      "accounts": {
        "user@example.com": {
          "planType": "plus",
          "isForbidden": false,
          "lastUpdated": "2026-01-13T15:30:45Z",
          "models": [
            {
              "name": "codex-weekly",
              "percentage": 72.0,
              "resetTime": "2026-01-14T00:00:00Z",
              "resetInSeconds": 30195
            }
          ]
        }
      }
    },
    "copilot": {
      "accounts": {
        "github-user": {
          "planType": "business",
          "isForbidden": false,
          "lastUpdated": "2026-01-13T15:30:45Z",
          "models": [
            {
              "name": "copilot-monthly",
              "percentage": 45.0,
              "resetTime": "2026-01-15T00:00:00Z",
              "resetInSeconds": 187200
            }
          ]
        }
      }
    },
    "claude": {
      "accounts": {
        "user@example.com": {
          "planType": "pro",
          "isForbidden": false,
          "lastUpdated": "2026-01-13T15:30:45Z",
          "models": [
            {
              "name": "claude-pro",
              "percentage": 88.0,
              "resetTime": "2026-01-13T16:45:00Z",
              "resetInSeconds": 4500
            }
          ]
        }
      }
    },
    "antigravity": {
      "accounts": {
        "user@example.com": {
          "planType": null,
          "isForbidden": false,
          "lastUpdated": "2026-01-13T15:30:45Z",
          "models": [
            {
              "name": "gemini-2.0-flash-exp",
              "percentage": 91.0,
              "resetTime": "2026-01-14T15:15:00Z",
              "resetInSeconds": 85500
            },
            {
              "name": "claude-3-5-sonnet",
              "percentage": 95.0,
              "resetTime": "2026-01-14T15:15:00Z",
              "resetInSeconds": 85500
            }
          ]
        }
      }
    },
    "gemini-cli": {
      "accounts": {
        "user@example.com": {
          "planType": null,
          "isForbidden": false,
          "lastUpdated": "2026-01-13T15:30:45Z",
          "models": [
            {
              "name": "gemini-quota",
              "percentage": -1,
              "resetTime": null,
              "resetInSeconds": null
            }
          ]
        }
      }
    }
  }
}
```

---

## Scenario 4: Diagnostic check with `doctor`

### Command
```bash
quota doctor
```

### Output
```
Quota Tracker Diagnostics
=========================

Configuration
-------------
Auth directory:     ~/.cli-proxy-api
Proxy base URL:     http://localhost:8317
Timeout:            15s
Cache directory:    ~/Library/Caches/quota/

Auth Files Discovered
---------------------
✓ Codex:            codex-user@example.com.json (valid, expires in 2d)
✓ Copilot:          github-copilot-github-user.json (valid, expires in 7d)
✓ Claude:           claude-user@example.com.json (valid, expires in 30d)
✓ Antigravity:      antigravity-user@example.com.json (valid, expires in 1h)
✓ Gemini CLI:       ~/.gemini/oauth_creds.json (found)

IDE Databases
-------------
✓ Cursor:           ~/Library/Application Support/Cursor/User/globalStorage/state.vscdb
                    Schema version: 1 (compatible)
✗ Trae:             not found

Proxy Connectivity
------------------
✓ Management API:   http://localhost:8317/usage (reachable, 45ms)

Warnings
--------
⚠️  Antigravity token expires in 1h (consider refreshing)
⚠️  Auth file permissions: codex-user@example.com.json is world-readable (chmod 600 recommended)

Summary
-------
5/5 providers configured
1/2 IDE databases found
Proxy: reachable
```

### What happened internally
1. Scanned `--auth-dir` for all known auth file patterns
2. Validated each auth file (parsed JSON, checked expiry if present)
3. Checked file permissions (warned about world-readable files)
4. Looked for IDE databases in standard locations
5. Tested proxy connectivity with a quick ping
6. Displayed comprehensive diagnostic report

---

## Scenario 5: Partial failure with fallback to cache

### Command
```bash
quota status
```

### Output (when Claude API is down)
```
┌──────────────┬─────────────────────┬──────────┬───────────┬──────────┬────────────────────────┐
│ Provider     │ Account             │ Plan     │ Remaining │ Reset    │ Notes                  │
├──────────────┼─────────────────────┼──────────┼───────────┼──────────┼────────────────────────┤
│ Codex        │ user@example.com    │ Plus     │ 72%       │ 8h 23m   │                        │
│ Copilot      │ github-user         │ Business │ 45%       │ 2d 4h    │                        │
│ Claude       │ user@example.com    │ Pro      │ 88%       │ 1h 15m   │ stale (12m ago) ⚠️     │
│ Antigravity  │ user@example.com    │ -        │ 91%       │ 23h 45m  │ (lowest: gemini-2.0)   │
│ Gemini CLI   │ user@example.com    │ -        │ unknown   │ -        │ quota API unavailable  │
└──────────────┴─────────────────────┴──────────┴───────────┴──────────┴────────────────────────┘

⚠️  1 provider returned stale data (network error)

Exit code: 0
```

### JSON output (same scenario)
```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-01-13T15:30:45Z",
  "errors": [
    {
      "provider": "claude",
      "account": "user@example.com",
      "error": "network_timeout",
      "message": "Request timed out after 15s",
      "fallbackUsed": true
    }
  ],
  "providers": {
    "claude": {
      "accounts": {
        "user@example.com": {
          "planType": "pro",
          "isForbidden": false,
          "isStale": true,
          "cachedAt": "2026-01-13T15:18:30Z",
          "ageSeconds": 735,
          "lastUpdated": "2026-01-13T15:18:30Z",
          "models": [
            {
              "name": "claude-pro",
              "percentage": 88.0,
              "resetTime": "2026-01-13T16:45:00Z",
              "resetInSeconds": 4500
            }
          ]
        }
      }
    }
  }
}
```

### What happened internally
1. Concurrent API calls started for all providers
2. Claude API call timed out after 15s
3. CLI checked cache for Claude data
4. Found cached result from 12 minutes ago
5. Returned cached data with `isStale: true` flag
6. Added error to top-level `errors` array
7. Exit code 0 (success with degraded data)

---

## Scenario 6: Strict mode (fail on any error)

### Command
```bash
quota status --strict
```

### Output (when Claude API is down)
```
Error: Failed to fetch quota for 1 provider(s)

Failed providers:
  - claude (user@example.com): network timeout after 15s

Use 'quota status' without --strict to see partial results with cached data.

Exit code: 4
```

---

## Scenario 7: Filtering by provider

### Command
```bash
quota status --provider antigravity
```

### Output
```
┌──────────────┬─────────────────────┬──────┬───────────┬──────────┬──────────────────────┐
│ Provider     │ Account             │ Plan │ Remaining │ Reset    │ Notes                │
├──────────────┼─────────────────────┼──────┼───────────┼──────────┼──────────────────────┤
│ Antigravity  │ user@example.com    │ -    │ 91%       │ 23h 45m  │ (lowest: gemini-2.0) │
└──────────────┴─────────────────────┴──────┴───────────┴──────────┴──────────────────────┘

Models:
  gemini-2.0-flash-exp:  91% remaining (reset in 23h 45m)
  claude-3-5-sonnet:     95% remaining (reset in 23h 45m)
```

---

## Scenario 8: Watch mode (live updates)

### Command
```bash
quota watch --interval 30
```

### Output (refreshes every 30 seconds)
```
[2026-01-13 15:30:45] Refreshing...

┌──────────────┬─────────────────────┬──────────┬───────────┬──────────┬────────────────────────┐
│ Provider     │ Account             │ Plan     │ Remaining │ Reset    │ Notes                  │
├──────────────┼─────────────────────┼──────────┼───────────┼──────────┼────────────────────────┤
│ Codex        │ user@example.com    │ Plus     │ 72%       │ 8h 23m   │                        │
│ Copilot      │ github-user         │ Business │ 45%       │ 2d 4h    │                        │
│ Claude       │ user@example.com    │ Pro      │ 88%       │ 1h 15m   │                        │
│ Antigravity  │ user@example.com    │ -        │ 91%       │ 23h 45m  │ (lowest: gemini-2.0)   │
│ Gemini CLI   │ user@example.com    │ -        │ unknown   │ -        │ quota API unavailable  │
└──────────────┴─────────────────────┴──────────┴───────────┴──────────┴────────────────────────┘

Next refresh in 30s (Ctrl+C to stop)

[2026-01-13 15:31:15] Refreshing...
[screen clears and updates]
```

---

## Scenario 9: Export for CI/monitoring

### Command
```bash
quota export --format json --out /tmp/quota-snapshot.json
```

### Output
```
Exported quota snapshot to /tmp/quota-snapshot.json
5 providers, 5 accounts
```

### File contents (`/tmp/quota-snapshot.json`)
Same as Scenario 3 JSON output, saved to file.

---

## Scenario 10: No accounts configured

### Command
```bash
quota status
```

### Output
```
No provider accounts found.

Run 'quota doctor' to see available data sources.

Searched in:
  - ~/.cli-proxy-api/ (auth files)
  - ~/.gemini/ (Gemini CLI)
  - ~/Library/Application Support/Cursor/ (IDE databases)

To configure providers, ensure auth files exist in the auth directory.

Exit code: 0
```

### With `--strict`
```
Error: No provider accounts found

Exit code: 3
```

---

## Scenario 11: Token expired (needs refresh)

### Command
```bash
quota status
```

### Output
```
┌──────────────┬─────────────────────┬──────────┬───────────┬──────────┬────────────────────────┐
│ Provider     │ Account             │ Plan     │ Remaining │ Reset    │ Notes                  │
├──────────────┼─────────────────────┼──────────┼───────────┼──────────┼────────────────────────┤
│ Codex        │ user@example.com    │ Plus     │ 72%       │ 8h 23m   │                        │
│ Copilot      │ github-user         │ -        │ -         │ -        │ needs re-auth ⚠️       │
│ Claude       │ user@example.com    │ Pro      │ 88%       │ 1h 15m   │                        │
└──────────────┴─────────────────────┴──────────┴───────────┴──────────┴────────────────────────┘

⚠️  1 account needs re-authentication:
  - Copilot (github-user): token expired, no refresh token available
    → Re-authenticate using your IDE or auth tool to generate a new token

Exit code: 0
```

---

## Scenario 12: Combining proxy usage + provider status

### Command
```bash
quota status && quota proxy-usage
```

### Output
```
┌──────────────┬─────────────────────┬──────────┬───────────┬──────────┬────────────────────────┐
│ Provider     │ Account             │ Plan     │ Remaining │ Reset    │ Notes                  │
├──────────────┼─────────────────────┼──────────┼───────────┼──────────┼────────────────────────┤
│ Codex        │ user@example.com    │ Plus     │ 72%       │ 8h 23m   │                        │
│ Copilot      │ github-user         │ Business │ 45%       │ 2d 4h    │                        │
│ Claude       │ user@example.com    │ Pro      │ 88%       │ 1h 15m   │                        │
│ Antigravity  │ user@example.com    │ -        │ 91%       │ 23h 45m  │ (lowest: gemini-2.0)   │
└──────────────┴─────────────────────┴──────────┴───────────┴──────────┴────────────────────────┘

CLIProxyAPI Usage Stats (http://localhost:8317)
Last updated: 2026-01-13 15:30:45

Total Requests:     1,234
  ✓ Success:        1,200 (97.2%)
  ✗ Failed:         34 (2.8%)

Token Usage:
  Input tokens:     555,555
  Output tokens:    432,099
  Total tokens:     987,654
```

---

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         User runs CLI                           │
│                    quota status [flags]                         │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Parse CLI arguments                          │
│  • Load config file (if exists)                                 │
│  • Merge with env vars                                          │
│  • Apply CLI flags (highest precedence)                         │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Discover provider accounts                      │
│  • Scan auth-dir for auth files                                 │
│  • Check Gemini CLI paths                                       │
│  • Scan IDE databases (if enabled)                              │
│  • Apply --provider and --account filters                       │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Check cache (TTL: 5min)                      │
│  • If fresh cache exists and --no-cache not set                 │
│  • Return cached data (skip API calls)                          │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Fetch quota (concurrent, rate-limited)             │
│                                                                 │
│  For each provider:                                             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 1. Read auth file                                        │  │
│  │ 2. Validate token (check expiry if available)            │  │
│  │ 3. Call provider API (with timeout + retry)              │  │
│  │ 4. Handle response:                                      │  │
│  │    • Success → normalize to ProviderQuotaData            │  │
│  │    • 401 → attempt refresh (if supported)                │  │
│  │    • 403 → mark as forbidden                             │  │
│  │    • Timeout → fallback to cache (if exists)             │  │
│  │    • Other error → record error, continue                │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Aggregate results                          │
│  • Collect all ProviderQuotaData                                │
│  • Collect all errors                                           │
│  • Update cache with fresh data                                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Format output                               │
│  • --format table → render table with columns                   │
│  • --format json → build JSON with schemaVersion                │
│  • Include warnings/errors in output                            │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Determine exit code                          │
│  • 0: success (even with partial failures)                      │
│  • 3: no accounts found (if --strict)                           │
│  • 4: provider failures (if --strict)                           │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
                        Exit with code
```

---

## Key Takeaways

1. **Default behavior is forgiving**: partial failures still return exit code 0
2. **Cache provides resilience**: stale data is better than no data
3. **Strict mode for CI**: use `--strict` when you need guarantees
4. **JSON is stable**: `schemaVersion` ensures consumers can detect breaking changes
5. **Doctor is your friend**: use it to debug configuration issues
6. **Watch mode for monitoring**: keep an eye on quota in real-time
