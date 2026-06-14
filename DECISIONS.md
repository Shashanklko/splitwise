# DECISIONS.md — Key Engineering Decisions

This document captures significant design and engineering decisions made during development of the Shared Expenses App. Each entry explains the problem, the options considered, the choice made, and the reasoning.

---

## D0: Collaboration Model — Senior Developer + Junior AI Engineer

**Problem**: Building a complex application from scratch using AI requires strict guardrails to prevent architectural drift and hallucinated business logic.

**Options**:
A) Let the AI make product decisions
B) Establish a strict hierarchy

**Decision**: The User acts as the Product Manager/Senior Developer; the AI acts as the Junior Engineer.

**Reasoning**: This ensures the AI (Antigravity) focuses purely on code execution, scaffolding, and syntax, while the User maintains absolute control over architecture, business rules (like time-aware memberships), edge-case handling (anomaly detection), and final feature sign-off.

---

## D1: Database — PostgreSQL over SQLite

**Problem**: Need a persistent, concurrent database for a multi-user web app.

**Options**:
- SQLite: Zero setup, file-based, no concurrency
- PostgreSQL: Production-grade, handles concurrent writes, hosted on Render

**Decision**: PostgreSQL on Render (free tier).

**Reasoning**: SQLite would fail under any real concurrent usage. PostgreSQL is what Render provides natively as an add-on. SQLAlchemy abstracts the differences cleanly.

---

## D2: Schema Migrations — Manual ALTER TABLE over Alembic

**Problem**: The initial schema needed new columns (`currency`, `original_amount`, `exchange_rate` on `expenses`; `joined_at`, `left_at` on `group_members`) after the app was already deployed.

**Options**:
- Alembic: Proper migration framework — handles up/down migrations, version history
- Manual ALTER TABLE: One-off script, faster to write

**Decision**: Manual migration script (`migrate.py`) using SQLAlchemy inspect + ALTER TABLE.

**Reasoning**: At this stage of the project (single-developer, assignment scope), Alembic adds overhead. The migration is idempotent (checks column existence before adding). Trade-off acknowledged: harder to roll back in production. Alembic should be used in any production setting.

---

## D3: Currency Storage — INR canonical, original preserved

**Problem**: Priya noted that the spreadsheet treated $1 as ₹1 — a data integrity error. Need to handle USD expenses.

**Options**:
A) Convert everything to INR at import, discard original amount
B) Store both the original amount (in source currency) and the INR equivalent
C) Multi-currency system — store amounts in any currency, convert at read time

**Decision**: Option B — `amount` column is always INR, new `original_amount` and `exchange_rate` columns preserve the source data.

**Reasoning**: Option A loses information. Option C is complex and out of scope. Option B is simple, auditable, and lets us show users "originally $84 USD, ₹6,972 at ₹83/USD" in the UI. The exchange rate used is fixed at import time (1 USD = ₹83.0, documented in the import report) — we don't call a live FX API to keep the system deterministic.

---

## D4: Time-aware Membership — Soft Delete over Hard Delete

**Problem**: Meera left end of March; Sam joined mid-April. If we delete membership records when a user leaves, we lose the time window needed for correct balance calculations.

**Options**:
A) Hard delete: remove `group_members` row when user leaves
B) Soft delete: set `left_at` timestamp; keep the row

**Decision**: Soft delete (Option B). `left_at = NULL` means currently active; `left_at = <date>` means they left on that date.

**Reasoning**: Hard delete makes it impossible to reconstruct "what was Meera's balance at the time she left?" Soft delete costs one column and enables time-windowed queries. The balance calculation filters expenses by `created_at >= joined_at AND created_at <= left_at`.

---

## D5: Import Design — Two-Phase (Preview → Commit)

**Problem**: Raw CSV data has many problems. Silently fixing them or silently skipping rows would destroy trust ("magic numbers").

**Options**:
A) Import all, silently correct what you can, skip the rest
B) Reject the whole file if any anomaly is found
C) Two-phase: parse → show all anomalies → user decides row-by-row → commit approved rows

**Decision**: Option C — two-phase import.

**Reasoning**: Option A violates the trust model the users explicitly stated. Option B is too harsh — a file with 40 rows and 3 anomalies would be rejected entirely. Option C is the right product decision: expose all issues transparently, let humans decide, then commit only what was approved. This is exactly how Rohan and Sam's requirements are satisfied: "no magic numbers" and "I need to understand my balance."

---

## D6: Balance Algorithm — Min-Cash-Flow over Pair-wise

**Problem**: With N members, naive pair-wise balances produce up to N*(N-1)/2 transactions to settle a group.

**Options**:
A) Pair-wise: each pair tracks their own balance
B) Net balances only: show each person's net position but no settlement instructions
C) Min-Cash-Flow: greedy algorithm that minimises the total number of transactions

**Decision**: Min-Cash-Flow (Option C).

**Reasoning**: This is the same algorithm Splitwise uses. With 6 members, it can reduce 15 possible pair-wise debts to as few as 5 transactions. This directly satisfies Aisha's requirement: "I just want one number per person. Who pays whom, how much, done."

---

## D7: Expense Breakdown Endpoint — On-demand vs Precomputed

**Problem**: Rohan needs to see exactly which expenses make up his owed amount. Computing this for all members eagerly would bloat the `/api/groups/{id}/balances` response.

**Options**:
A) Precompute and return with balances response
B) Lazy-load: separate endpoint `/api/groups/{id}/breakdown/{user_id}`, only called when user expands a member

**Decision**: Option B — lazy-load on demand.

**Reasoning**: The balances endpoint is called on every group page load. Adding full expense breakdowns (potentially 40+ expense rows per member) would significantly increase payload size and query time. Option B keeps the main view fast and fetches detail only when requested.

---

## D8: Split Type for CSV Imports — Default to Equal

**Problem**: CSV rows may have a `split_type` column (percentage, equal, custom) but the data is often incomplete or in unrecognised formats.

**Options**:
A) Try to parse every split type; fail noisily if not parseable
B) Default to equal split if split type is absent or unrecognised; surface as anomaly
C) Block import of any row with missing split details

**Decision**: Option B — default to equal split, surface as a `UNRESOLVABLE_SPLIT` anomaly when detected.

**Reasoning**: Option A creates too many edge cases. Option C blocks too many valid rows. Equal split is the most common real-world default and is transparent to the user. The anomaly system ensures nothing is silently converted — it's shown to the user who can reject the row if they want.

---

## D9: WebSocket for Comments — Real-time over Polling

**Problem**: Users discussing expense details should see each other's comments without refreshing.

**Options**:
A) HTTP polling (every 3s)
B) Server-Sent Events (SSE)
C) WebSocket

**Decision**: WebSocket (Option C).

**Reasoning**: WebSockets are bidirectional, which is needed for sending new comments from client to server. SSE is unidirectional. Polling wastes resources. FastAPI has native WebSocket support — `@app.websocket(...)` — making this straightforward.

---

## D10: Authentication — JWT Bearer Tokens over Sessions

**Problem**: Frontend (React SPA) and backend (FastAPI) are on different origins. Need stateless authentication.

**Options**:
A) Session cookies: requires same-origin, server-side session storage
B) JWT Bearer tokens: stateless, stored in localStorage, sent via Authorization header

**Decision**: JWT (Option B).

**Reasoning**: SPA + separate API origin = CORS. JWTs work naturally across origins. The secret key is in env vars; tokens expire (configurable). Trade-off: tokens can't be invalidated before expiry without a blocklist, which is out of scope.
