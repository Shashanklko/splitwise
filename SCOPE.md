# SCOPE.md — Shared Expenses App

## Project Dynamic
* **Product Manager & Senior Developer**: The User (defined architecture, anomaly edge-cases, and business rules).
* **Junior Engineer**: Antigravity AI (executed scaffolding, React components, and backend endpoints).

## What This App Does

A multi-user shared expense tracker for groups of flat mates. Users can log expenses, split them in four different ways, track who owes whom, settle up, chat on expenses, and now import historical data from a spreadsheet CSV.

---

## Data Anomaly Catalogue

The CSV from the spreadsheet contained the following anomalies. Each has a detection method, a policy decision, and the proposed resolution surfaced to the user.

| # | Anomaly Type | Description | Detection Method | Policy / Resolution |
|---|-------------|-------------|-----------------|-------------------|
| 1 | **DUPLICATE_ENTRY** | Same dinner logged twice (same date, description, amount, payer) | Signature hash: `date|desc|amount|paid_by` — if seen more than once, flag all occurrences | Propose SKIP for the second occurrence. User decides. |
| 2 | **SETTLEMENT_AS_EXPENSE** | Rohan paid Aisha back ₹5,000 — logged as an expense, not a settlement | Keyword scan on description/notes (e.g. "paid back", "settled", "paid [name]") + single-person split pattern | Propose CONVERT_TO_SETTLEMENT. If accepted, recorded in `settlements` table instead of `expenses`. |
| 3 | **CURRENCY_MISMATCH** | Goa trip amounts in USD (villa ₹540→$540, beach lunch $84, parasailing $150) — treated as INR in original sheet | `currency` column value or `$`/`USD` in amount field | Propose CONVERT_TO_INR at 1 USD = ₹83.0. Rate fixed at import time and stored in `exchange_rate` column. |
| 4 | **NEGATIVE_AMOUNT** | Parasailing refund −$30 — negative value in amount | `amount < 0` | Propose TREAT_AS_REFUND. Stored as-is; negative split creates a credit for the affected members. |
| 5 | **ZERO_AMOUNT** | Swiggy dinner order logged as ₹0 | `amount == 0` | Propose SKIP. Likely a placeholder or cancelled order. User decides. |
| 6 | **MISSING_PAID_BY** | House cleaning supplies — payer field left blank or "can't remember" | Payer field empty or matches ambiguous strings: `unknown`, `?`, `n/a`, empty | Propose SPLIT_PAYMENT_EQUALLY — distributes the payer credit equally among all split members. |
| 7 | **PERCENTAGE_SUM_ERROR** | Pizza Friday: percentages sum to 110% (30+30+30+20=110) | Parse all `%` values from `split_details` column and sum them | Propose NORMALIZE_PERCENTAGES — scale each % proportionally to sum to 100%. |
| 8 | **INVALID_DATE** | Mixed date formats: DD-MM-YYYY, MM/DD/YYYY, ambiguous values | Try parsing with 8 format strings + dateutil fallback. Return None if all fail. | Propose SKIP. Date cannot be reliably reconstructed. |
| 9 | **MEMBER_NOT_IN_GROUP** | Kabir appears in split_with for parasailing — not a registered group member | Compare split_with names against `known_members` list from DB | Propose EXCLUDE_NON_MEMBER — redistribute Kabir's share among actual members. |
| 10 | **EX_MEMBER_EXPENSE** | Meera on April expenses (moved out end of March) | Compare expense date against member's `left_at` timestamp in `group_members` | Flag for review. Balance calculation already excludes her from post-departure expenses. |
| 11 | **FUTURE_MEMBER_EXPENSE** | Sam on March expenses (moved in mid-April) | Compare expense date against member's `joined_at` timestamp | Flag for review. Balance calculation already excludes Sam from pre-joining expenses. |
| 12 | **MISSING_AMOUNT** | Amount field blank or non-parseable | Regex strip non-numeric chars → if empty, `None` | Propose SKIP. Cannot import without a value. |

---

## Database Schema

### `users`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | Auto-increment |
| `name` | VARCHAR | Display name |
| `email` | VARCHAR UNIQUE | Login identifier |
| `hashed_password` | VARCHAR | bcrypt |
| `created_at` | TIMESTAMP | |

### `groups`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `name` | VARCHAR | |
| `creator_id` | INTEGER FK→users | |
| `created_at` | TIMESTAMP | |

### `group_members`
| Column | Type | Notes |
|--------|------|-------|
| `group_id` | INTEGER FK→groups | Composite PK |
| `user_id` | INTEGER FK→users | Composite PK |
| `joined_at` | TIMESTAMP | **NEW** — when the member joined |
| `left_at` | TIMESTAMP NULL | **NEW** — when they left; NULL = still active |

### `expenses`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `group_id` | INTEGER FK NULL | NULL for standalone expenses |
| `description` | VARCHAR | |
| `amount` | NUMERIC(10,2) | **Always in INR** |
| `currency` | VARCHAR | **NEW** — original currency code (INR/USD) |
| `original_amount` | NUMERIC(10,4) NULL | **NEW** — amount in source currency |
| `exchange_rate` | NUMERIC(10,6) NULL | **NEW** — rate applied at import time |
| `split_type` | VARCHAR | equally / unequally / percentage / shares |
| `created_at` | TIMESTAMP | **Backdated to CSV date on import** |

### `expense_payers`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `expense_id` | INTEGER FK→expenses | |
| `user_id` | INTEGER FK→users | |
| `amount_paid` | NUMERIC(10,2) | Amount paid by this payer |

### `expense_splits`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `expense_id` | INTEGER FK→expenses | |
| `user_id` | INTEGER FK→users | |
| `amount_owed` | NUMERIC(10,2) | Amount owed by this person |
| `split_value` | NUMERIC NULL | Raw split value (percentage/shares) |

### `settlements`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `group_id` | INTEGER FK NULL | |
| `payer_id` | INTEGER FK→users | Person paying |
| `payee_id` | INTEGER FK→users | Person receiving |
| `amount` | NUMERIC(10,2) | |
| `created_at` | TIMESTAMP | |

### `expense_comments`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `expense_id` | INTEGER FK→expenses | |
| `user_id` | INTEGER FK→users | |
| `user_name` | VARCHAR | Denormalized for display speed |
| `message` | TEXT | |
| `created_at` | TIMESTAMP | |

---

## Key Constraints & Business Rules

1. **Balance isolation by time window**: A member's balance only includes expenses whose `created_at` falls between their `joined_at` and `left_at` (or today if still active).
2. **Soft delete for membership**: When a member leaves, `left_at` is set — the row is not deleted. This preserves historical data.
3. **USD stored + INR equivalent**: Both the original foreign amount and the converted INR amount are stored. The `amount` column always contains INR.
4. **Import is a two-phase transaction**: Preview returns anomalies with no DB writes. Commit writes only the rows the user approved.
5. **Min-Cash-Flow simplification**: The `simplify_debts` algorithm (O(n log n)) minimises the number of transactions needed to settle the group.
