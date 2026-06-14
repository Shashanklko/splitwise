# Splitwise Clone Build Plan

This document provides a comprehensive review of the design, architectural decisions, collaboration processes, and trade-offs made during the creation of the Splitwise Clone application.

---

## 1. Product Research

### Study of Splitwise
We analyzed the core product features of the original Splitwise application, focusing on:
*   **Balance Aggregation**: How Splitwise consolidates complex, multi-person transactions into clean summaries like *"You are owed ₹500"* or *"You owe ₹200"*.
*   **Debt Simplification**: Studying how transactions are minimized inside a group to reduce the absolute number of payments needed to settle up.
*   **Split Adjustments**: Analyzing how various splits (unequally, shares, percentages) handle fractional cents/paisa divisions when sharing odd totals.
*   **Real-time Collaboration**: Observing how users discuss specific bills in inline feeds.

### Workflows Identified
We mapped and implemented five critical user workflows:
1.  **User Onboarding**: Signup and secure JWT-based sign-in.
2.  **Group Structuring**: Inviting registered users to group boards by email. Only the group creator (admin) can remove members.
3.  **Advanced Bill Splitting**: Logging bills with multiple payers and any of 4 split algorithms (Equally, Unequally, Percentage, or Shares) with rounding corrections.
4.  **Debt Minimization & Settlement**: Calculating net balances dynamically and applying a greedy matching algorithm (Min-Cash-Flow) to simplify transactions, followed by a manual "Settle Up" action.
5.  **Interactive Bill Discussions**: Joining live, real-time WebSocket chat feeds linked to individual bills.

### Product Assumptions
*   **Registered Search**: Users can only invite other registered members to a group by searching their exact email addresses.
*   **Base Currency Standardization**: While expenses can be entered in foreign currencies (like USD), the app converts and standardizes the ledger into a base currency (Rupees - ₹) at a fixed exchange rate upon import/entry to avoid live FX volatility.
*   **Time-Aware Liability**: A user's financial liability in a group only spans the exact window between when they joined and when they left (soft-deleted).
*   **Manual Settle Up**: Settlements are recorded manually as ledger balances. No real payment gateways (such as Stripe or UPI links) are integrated.

---

## 2. Architecture

### Tech Stack
*   **Core Backend**: FastAPI (Python 3.11), leveraging Uvicorn and SQLAlchemy.
*   **Database ORM**: PostgreSQL in production (fallbacks to local SQLite for instant developer setup).
*   **Real-Time Layer**: Native FastAPI WebSockets.
*   **Core Frontend**: React, Vite, TypeScript, and TailwindCSS.
*   **Web Server / Reverse Proxy**: Nginx (Alpine).
*   **Orchestration**: Docker & Docker Compose.

### Database Schema
*   `users`: ID, email, password hash, name, and timestamp.
*   `groups`: ID, group name, creator ID (admin), and timestamp.
*   `group_members`: Composite primary key `(group_id, user_id)` mapping memberships.
*   `expenses`: ID, description, amount, split type, and timestamps.
*   `expense_payers`: Composite key `(expense_id, user_id)` mapping who paid what amount.
*   `expense_splits`: Composite key `(expense_id, user_id)` mapping who owes what amount, including original raw splits.
*   `settlements`: ID, group ID (optional), payer ID (sender), payee ID (receiver), and amount.
*   `comments`: ID, expense ID, user ID, chat message, and timestamp.

### API Design
*   `POST /api/auth/register` - Create user account.
*   `POST /api/auth/login` - Verify password and return JWT access token.
*   `GET /api/auth/me` - Profile context.
*   `GET /api/groups` & `POST /api/groups` - Group listing and creation.
*   `POST /api/groups/{group_id}/members` - Add member to group.
*   `DELETE /api/groups/{group_id}/members/{user_id}` - Soft-remove member (sets `left_at`).
*   `GET /api/groups/{group_id}/balances` - Calculate time-aware ledger and simplified debts.
*   `GET /api/groups/{group_id}/breakdown/{user_id}` - Granular expense breakdown for a member.
*   `POST /api/expenses` & `PUT/DELETE /api/expenses/{id}` - Expense CRUD.
*   `POST /api/settlements` - Record settlement.
*   `POST /api/import/preview` & `POST /api/import/commit` - Two-phase CSV import.
*   `WS /ws/expenses/{id}/comments?token=JWT` - Real-time thread for specific expense.
*   `WS /ws/groups/{group_id}/chat?token=JWT` - Real-time group-level chat channel.

### Frontend Structure
*   `src/context/AuthContext.tsx`: Manages active session caching and tokens.
*   `src/pages/Landing.tsx`: Responsive landing page featuring rotating animated polygon illustrations.
*   `src/pages/Dashboard.tsx`: Lists user groups, overall net balance summaries, friends, and transaction feeds.
*   `src/pages/GroupDetails.tsx`: Shows expenses ledger, group member lists, and simplified debt transactions.
*   `src/components/Modals`: Checklists and forms for adding groups, inviting members, settled balances, logging expenses (all 4 split forms), and viewing chat comment records.

### Deployment Approach
*   **Local Development**: Run FastAPI and Vite dev server concurrently, proxying `/api` locally. Alternatively, run `docker compose up --build` to launch all services locally behind Nginx.
*   **Production Deployment**: Configured via [render.yaml](file:///e:/Project/Splitwise/render.yaml) using Render Blueprints. The blueprint spins up a PostgreSQL database, builds the FastAPI app from the backend Dockerfile, and serves the static React frontend from a CDN with Nginx-like rewrite paths.

---

## 3. AI Collaboration Process

### Instruction Flow & Role Dynamic
The project was built from scratch using a strict role-based dynamic: **The User acted as the Product Manager and Senior Developer**, defining the architecture, product requirements, and business rules. **Antigravity AI acted as the Junior Engineer**, executing the code, scaffolding the stack, and implementing the requested features under the user's guidance.

The Senior Developer (User) guided the Junior Engineer (Antigravity AI) across consecutive phases:
1.  **Backend Foundation**: Instructing the development of the FastAPI routes, models, and WebSocket server.
2.  **Frontend Layout**: Building the React app pages, Tailwind grid styling, modals, and linking AuthContext.
3.  **Visual Styling Adjustments**: Specifying a global light geometric repeating triangular grid background across all views.
4.  **Advanced Data Import**: Designing a two-phase CSV import tool to handle messy historical data, explicitly instructing the AI to "not silently fix anything" but rather surface 12 specific anomaly types for user resolution.
5.  **Time-Aware Memberships**: Correcting the AI's initial "hard-delete" approach to member removal, instructing it to implement soft-deletes (`left_at`) to preserve historical balance accuracy.
6.  **Transparency & Communication**: Requesting a granular expense breakdown endpoint ("no magic numbers") and expanding WebSockets into a full-featured persistent group chat panel.

### Queries and Answers
*   *Database Choices*: The Senior Developer mandated PostgreSQL for production and SQLite for local development fallbacks.
*   *Tailwind & Styling*: Selected TailwindCSS for styling layout cards, utilizing custom glassmorphism colors based on the Senior Developer's visual specs.
*   *Currency Handling*: When a spreadsheet revealed USD expenses, the Senior Developer instructed the AI to store original currencies but calculate balances in a fixed baseline currency.

### AI_CONTEXT.md Maintenance
The [AI_CONTEXT.md](file:///e:/Project/Splitwise/AI_CONTEXT.md) was maintained by the Junior Engineer as the single source of truth at the start of each conversation step, reflecting the Senior Developer's architectural decisions.

---

## 4. Tradeoffs

### Simplifications
*   **No Real Payment Gateways**: Debts are settled logically via form logs without integrating Stripe or PayPal APIs.
*   **Group-Level Debt Minimization**: The Min-Cash-Flow algorithm operates within individual groups rather than calculating global net offsets across all shared groups.
*   **No Password Recovery**: Access is strictly reliant on active passwords; email recovery/reset mechanisms were avoided.

### Hardcoded Elements
*   **Base Currency**: Rupee (₹) symbol is statically rendered on all badges and aggregate lists, even if the underlying `original_amount` is in USD.
*   **Token Expirations**: JWT tokens are configured to expire after a fixed duration (7 days) for convenience.

### Avoided Complexities
*   **No Receipt OCR Scanning**: Processing receipt images with computer vision was omitted to focus on split math logic.
*   **No Recurring Expenses**: Scheduled bills were avoided to prevent background chron-job overhead.
*   **No Global State Libraries**: Redux and Zustand were avoided in favor of clean React Context and Local State Hooks, reducing bundle size.

### Improvements for the Future
*   **Database Pooling**: Integrate PgBouncer in production to handle highly concurrent database connections efficiently.
*   **Live FX API**: Replace the fixed import-time exchange rate with a live FX API for real-time dynamic multi-currency ledgers.
*   **WebSocket Resiliency**: Implement exponential backoff reconnection strategies on the React client side in case of network drops.
*   **Push Notifications**: Add browser push notifications for comments logged on shared bills.
