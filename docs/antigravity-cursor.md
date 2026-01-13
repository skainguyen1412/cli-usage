# Provider Data Guide: Antigravity + Cursor

This document describes **where to read auth data**, **which endpoints to call**, and **how to interpret responses** in order to display quota/usage for:

-   **Antigravity** (Cloud Code “available models” quotas)
-   **Cursor** (billing-cycle usage + on-demand usage)

It is written to be **portable** (no dependency on any specific repository).

---

## Important warnings (read first)

-   **Treat tokens as secrets**:
    -   Never log access tokens / refresh tokens.
    -   Never store tokens in plaintext cache unless you fully understand the risk.
-   **Some endpoints may be unofficial/internal** (especially Antigravity):
    -   They can change without notice.
    -   Ensure your usage complies with the provider’s terms.
-   **Local IDE databases can change** (Cursor):
    -   Query patterns must be resilient; expect schema changes.

---

## Shared output model (recommended)

Use a normalized structure per provider/account:

-   **ProviderQuotaData**
    -   `models: ModelQuota[]`
    -   `lastUpdated: ISO8601 timestamp`
    -   `isForbidden: boolean`
    -   `planType?: string`
-   **ModelQuota**
    -   `name: string`
    -   `percentage: number` (**remaining** percent; use `-1` to mean “unknown”)
    -   `resetTime: ISO8601 string | ""`
    -   optional `used/limit/remaining` for providers that return raw counts

---

## Antigravity

### What you can fetch

-   **Per-model remaining quota** as a fraction/percentage, plus a **reset time** (when provided).
-   Optional **subscription metadata** (tier name, upgrade URL, project id).

### Auth source (local files)

-   Directory (common default): `~/.cli-proxy-api/`
-   File pattern: `antigravity-*.json`

Recommended behavior:

-   **Read the email from the JSON file** when present (don’t rely on filename parsing).
-   Validate file permissions and warn if world-readable.

#### Expected auth JSON fields (observed)

-   `access_token` (string) — required
-   `refresh_token` (string) — optional but commonly present
-   `expired` (string ISO8601) — optional expiry timestamp
-   `email` (string) — commonly present

### Token refresh (Google OAuth)

If you have a refresh token and your auth source includes expiry:

-   When token is expired, exchange refresh token at:
    -   `POST https://oauth2.googleapis.com/token`
    -   `Content-Type: application/x-www-form-urlencoded`
    -   body fields:
        -   `grant_type=refresh_token`
        -   `refresh_token=<...>`
        -   `client_id=<...>`
        -   `client_secret=<...>`

**Critical note**: refresh requires `client_id` and `client_secret` that match the OAuth client that issued the refresh token.

-   If you don’t have valid client credentials, **you cannot refresh**; mark account as `needs_reauth`.
-   Prefer “read-only by default”: do not rewrite the original auth file unless user opts in.

### Fetch subscription/project info (optional but useful)

This call may return a “project id” that improves quota results.

-   Endpoint:
    -   `POST https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist`
-   Headers:
    -   `Authorization: Bearer <access_token>`
    -   `Content-Type: application/json`
    -   `User-Agent: <client-like user agent>` (some clients send a specific UA; if omitted and request fails, try adding a UA)
-   Body:
    -   `{"metadata":{"ideType":"ANTIGRAVITY"}}`

Response (observed fields you may care about):

-   `cloudaicompanionProject` (string) — use as `project` in the quota call
-   tier info such as `currentTier`, `paidTier`, upgrade URL fields (optional)

### Fetch quota (available models)

-   Endpoint:
    -   `POST https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels`
-   Headers:
    -   `Authorization: Bearer <access_token>`
    -   `Content-Type: application/json`
    -   `User-Agent: <client-like user agent>` (if needed)
-   Body:
    -   `{}` (works in some cases)
    -   or `{"project":"<cloudaicompanionProject>"}` if you fetched it

#### Response shape (observed)

Top-level: `models` map keyed by model name, where each value may include:

-   `quotaInfo.remainingFraction` (number 0..1)
-   `quotaInfo.resetTime` (ISO8601 string)

#### Interpreting the response

-   Convert to remaining percent:
    -   `percentage = remainingFraction * 100`
-   Suggested filtering:
    -   include models whose names contain `gemini` or `claude` (if you want to display only relevant model quotas)
-   Forbidden handling:
    -   If response status is `403`, mark `isForbidden = true` for that account/provider.

#### Resilience recommendations

-   Retry policy: up to 3 attempts on transient failures (`429`, `502/503/504`, timeouts) with exponential backoff.
-   If quota fetch fails but subscription fetch succeeds:
    -   still show tier/project metadata, and mark quotas as unknown/stale.

---

## Cursor

### What you can fetch

From Cursor’s API:

-   Billing-cycle usage window: `billingCycleStart`, `billingCycleEnd`
-   Plan usage: used/limit/remaining and percent-used breakdowns
-   On-demand usage: used, optional limit/remaining

### Auth source (local SQLite DB)

Cursor stores auth/session state in a SQLite database (macOS path):

-   `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb`

Read-only open recommendations:

-   Open read-only.
-   Use “immutable” style access where supported to avoid WAL file requirements.

### Extract auth fields from DB

Observed query pattern:

-   `SELECT key, value FROM ItemTable WHERE key LIKE 'cursorAuth/%'`

Observed keys:

-   `cursorAuth/accessToken` → access token (required for API calls)
-   `cursorAuth/refreshToken` → refresh token (may exist; refresh flow is not documented here)
-   `cursorAuth/cachedEmail` → email (best-effort)
-   `cursorAuth/stripeMembershipType` → membership type (pro/free/etc)
-   `cursorAuth/stripeSubscriptionStatus` → subscription status
-   `cursorAuth/cachedSignUpType` → sign-up type

### Fetch usage summary (Cursor API)

-   Endpoint:
    -   `GET https://api2.cursor.sh/auth/usage-summary`
-   Headers:
    -   `Authorization: Bearer <accessToken>`
    -   `Accept: application/json`
    -   Optionally set a browser-like `User-Agent` if you see rejections.

Status handling:

-   `200`: parse usage payload
-   `401`: treat as auth expired; return “account present but quota unknown” and mark `needs_reauth`
-   non-200: treat as transient failure; fall back to cached data if present

#### Response fields (observed)

Top-level:

-   `membershipType` (string)
-   `isUnlimited` (boolean)
-   `billingCycleStart` (ISO8601 string, fractional seconds)
-   `billingCycleEnd` (ISO8601 string, fractional seconds)
-   `individualUsage.plan` object:
    -   `enabled` (bool)
    -   `used` (int)
    -   `limit` (int)
    -   `remaining` (int)
    -   `totalPercentUsed` (number)
    -   `autoPercentUsed` (number)
    -   `apiPercentUsed` (number)
-   `individualUsage.onDemand` object:
    -   `enabled` (bool)
    -   `used` (int)
    -   `limit` (int | null)
    -   `remaining` (int | null)

#### Converting to normalized models

Recommended mapping:

-   Add a `ModelQuota` named `plan-usage` when plan is enabled:
    -   `percentage = remaining / limit * 100`
    -   `resetTime = billingCycleEnd` (if present)
    -   include `used/limit/remaining` fields
-   Add a `ModelQuota` named `on-demand` when enabled:
    -   if `limit` and `remaining` are present: `percentage = remaining / limit * 100`
    -   else: `percentage = 100` (treat as effectively unlimited / no cap known)
    -   include `used/limit/remaining` fields
-   If you can’t parse usage but you do have a valid-looking account:
    -   return a placeholder `ModelQuota(name: "cursor-usage", percentage: -1)`

### Cursor DB schema stability

You should expect Cursor updates to change DB layout.

Recommended protections:

-   Record `PRAGMA user_version` in `doctor` output.
-   Treat missing `ItemTable` or missing keys as “schema incompatible”; don’t crash.

---

## TypeScript appendix (examples)

These are **illustrative**, not production-hardened.

### Scan Antigravity auth files

```ts
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const authDir = path.join(os.homedir(), ".cli-proxy-api");
const files = await fs.readdir(authDir);
const antigravityFiles = files.filter(
    (f) => f.startsWith("antigravity-") && f.endsWith(".json")
);
```

### Read Cursor tokens from SQLite (better-sqlite3)

```ts
import Database from "better-sqlite3";
import os from "node:os";
import path from "node:path";

const dbPath = path.join(
    os.homedir(),
    "Library/Application Support/Cursor/User/globalStorage/state.vscdb"
);

const db = new Database(dbPath, { readonly: true, fileMustExist: true });
const rows = db
    .prepare("SELECT key, value FROM ItemTable WHERE key LIKE 'cursorAuth/%'")
    .all();
const kv = new Map(rows.map((r) => [r.key as string, r.value as string]));

const accessToken = kv.get("cursorAuth/accessToken");
```

### Call Cursor usage API

```ts
const res = await fetch("https://api2.cursor.sh/auth/usage-summary", {
    headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
    },
});
if (res.status === 401) {
    // needs re-auth
}
const json = await res.json();
```
