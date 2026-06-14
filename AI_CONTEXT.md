# AI_CONTEXT.md
This document serves as the single source of truth for the Splitwise Clone project. The entire application (requirements, architecture, schema, UI, logic, deployment, and testing) will be buildable from this specification.

---

## 1. Product Goals & Core Workflows
- **Primary Goal**: A simplified Splitwise-inspired expense-sharing application to track shared expenses, calculate balances, and record manual settlements.
- **Core Workflows**:
  - **User Registration & Authentication**: Sign up and log in.
  - **Group Operations**: Create groups, add/remove members, and view member lists.
  - **Expense Tracking**: Create, edit, and delete expenses with split calculations.
  - **Discussions**: Real-time comments/chat on specific expenses.
  - **Balances & Settlements**: View individual and group-level balances (who owes whom), and manually record settlements to bring balances to zero.

## 2. User Personas & MVP Scope
- **User Personas**: Friends, roommates, and teammates sharing group-based or individual expenses.
- **MVP Scope (In-Scope)**:
  - **Auth**: Register, Login, Logout.
  - **Groups**: Create group, invite/add users, remove users, and list group members.
  - **Expenses**: CRUD operations on expenses. Support for 4 split types:
    - Equally (divided evenly among members).
    - Unequally (specific currency amounts specified per member).
    - Percentage (percentages totaling 100% specified per member).
    - Shares (share counts specified per member; total expense divided proportionally).
  - **Balances**: Group balances & overall user balance summary ("who owes whom").
  - **Settlements**: Record manual settlements (no real payment gateway) with details: Payer, Recipient, and Amount.
  - **Expense Chat**: Real-time discussions/comments thread on individual expenses.
- **Out-of-Scope**:
  - Payment gateway integrations.
  - Multi-currency support (standardizing on a single currency, e.g., INR/₹).
  - Recurring expenses.
  - Receipt scanning/OCR.

## 3. Data Model & Database Choice
- **Database**: PostgreSQL (Relational)
- **Frontend Stack**: React + Vite (TypeScript/JavaScript)
- **Backend Stack**: Python with FastAPI
- **Real-Time System**: Native FastAPI WebSockets for real-time chat discussions
- **Data Model Schema**:
  - `users`:
    - `id` (UUID or Serial PK)
    - `email` (VARCHAR, Unique, Indexed)
    - `password_hash` (VARCHAR)
    - `name` (VARCHAR)
    - `created_at` (TIMESTAMP)
  - `groups`:
    - `id` (UUID or Serial PK)
    - `name` (VARCHAR)
    - `creator_id` (FK to `users`, Cascade Delete - the group creator/admin)
    - `created_at` (TIMESTAMP)
  - `group_members`:
    - `group_id` (FK to `groups`, Cascade Delete)
    - `user_id` (FK to `users`, Cascade Delete)
    - *Composite PK*: `(group_id, user_id)`
  - `expenses`:
    - `id` (UUID or Serial PK)
    - `group_id` (FK to `groups`, Nullable for non-group direct expenses)
    - `description` (VARCHAR)
    - `amount` (DECIMAL/NUMERIC)
    - `split_type` (VARCHAR: `equally`, `unequally`, `percentage`, `shares`)
    - `created_at` (TIMESTAMP)
  - `expense_payers`:
    - `expense_id` (FK to `expenses`, Cascade Delete)
    - `user_id` (FK to `users`, Cascade Delete)
    - `amount_paid` (DECIMAL/NUMERIC)
    - *Composite PK*: `(expense_id, user_id)`
  - `expense_splits`:
    - `expense_id` (FK to `expenses`, Cascade Delete)
    - `user_id` (FK to `users`, Cascade Delete)
    - `amount_owed` (DECIMAL/NUMERIC)
    - `split_value` (DECIMAL/NUMERIC, Nullable - stores raw percentage, shares, or unequal amount inputted)
    - *Composite PK*: `(expense_id, user_id)`
  - `settlements`:
    - `id` (UUID or Serial PK)
    - `group_id` (FK to `groups`, Nullable for non-group settlements)
    - `payer_id` (FK to `users` - the one paying, Cascade Delete)
    - `payee_id` (FK to `users` - the one receiving, Cascade Delete)
    - `amount` (DECIMAL/NUMERIC)
    - `created_at` (TIMESTAMP)
  - `comments`:
    - `id` (UUID or Serial PK)
    - `expense_id` (FK to `expenses`, Cascade Delete)
    - `user_id` (FK to `users`, Cascade Delete)
    - `message` (TEXT)
    - `created_at` (TIMESTAMP)

## 4. Authentication & Security
- **Authentication Strategy**: JSON Web Tokens (JWT) access tokens stored securely (e.g., HTTPOnly cookies or Authorization header).
- **Security**: Password hashing using **bcrypt**.

## 5. Groups, Expenses & Settlements
- **Group Management & Roles**:
  - **Adding Members**: Added members must be already registered in the system (searched and looked up by email).
  - **Removing Members**: Only the group creator (`creator_id` admin) is permitted to remove users from the group.
  - **Expense Operations**: Any group member can create, edit, or delete expenses in the group.
- **Split Mechanics & Rounding**:
  - All monetary splits are stored and calculated with 2 decimal places of precision.
  - **Equally**: Total expense amount divided evenly among split participants. Any rounding remainder (e.g. splitting ₹100.00 among 3 participants leaves a ₹0.01 remainder) is added to or subtracted from the first participant's split to ensure the sum of splits matches the total expense exactly.
  - **Unequally**: Explicit amounts are provided for each participant. Sum of split amounts must equal the total expense amount.
  - **Percentage**: Percentages are provided for each participant. Sum of percentages must equal 100%. Individual share = round(percentage / 100 * total expense, 2). Any rounding remainder is adjusted on the first participant's split.
  - **Shares**: Share coefficients are provided. Total shares = sum of all shares. Individual share = round(user_shares / total_shares * total expense, 2). Any rounding remainder is adjusted on the first participant's split.
- **Payer Types**: Supports multiple payers per expense (recorded in `expense_payers`). The sum of all `amount_paid` must equal the total expense `amount`.
- **Group vs. Non-Group**: Expenses can be group-based or standalone (direct between users, with `group_id` set to Null).
- **Settlements Workflow**:
  - Initiated via "Settle Up" action.
  - Required fields: Payer (who paid), Recipient (who received), Amount, and optional Group ID.
  - Creates a record in `settlements` and adjusts overall/group balances.

## 6. Balance Calculation Logic
- **Direct Debts Calculation**:
  - For each user in a group (or overall):
    - **Total Paid**: Sum of all `amount_paid` by the user in `expense_payers`.
    - **Total Owed**: Sum of all `amount_owed` by the user in `expense_splits`.
    - **Total Settled Paid**: Sum of all `amount` where the user was the payer in `settlements`.
    - **Total Settled Received**: Sum of all `amount` where the user was the payee in `settlements`.
    - **Net Balance** = (Total Paid + Total Settled Paid) - (Total Owed + Total Settled Received).
    - If positive, they are owed money. If negative, they owe money.
- **Simplification of Debts (Min-Cash-Flow Algorithm)**:
  - Within each group:
    1. Calculate the net balance of each user (Total Paid + Total Settled Paid - Total Owed - Total Settled Received).
    2. Separate users into creditors (net balance > 0) and debtors (net balance < 0).
    3. Greedily match the largest debtor with the largest creditor:
       - Let `debtor` be the user with the most negative balance, and `creditor` be the user with the most positive balance.
       - Calculate the transfer amount: `amount = min(-debtor_balance, creditor_balance)`.
       - Record that `debtor` owes `creditor` `amount`.
       - Update the balances of `debtor` and `creditor`.
       - Repeat until all balances are settled (equal to 0).
    4. These calculated simplified transactions represent "who owes whom" in the group view.

## 7. UI Screens, Routing & Frontend Architecture
- **Routing**: `react-router-dom` v6 for SPA client-side routing.
- **Styling**: TailwindCSS for styling and responsive layout.
- **Key Views**:
  - `/login`: User login page.
  - `/register`: User registration page.
  - `/`: Main dashboard. Lists all groups, overall net balance summary, list of friends, and settlement history.
  - `/groups/:group_id`: Group details view. Lists all expenses, group members, option to add/remove users, simplified list of who owes whom in this group, and a "Settle Up" action.
  - `/expenses/:expense_id` (or within a modal): Expense detail modal showing split details (who paid, who owes what) and the real-time comment/discussion feed.
- **State Management**: React Context/hooks for global authentication and basic local state.

## 8. Backend Architecture & API Design
- **API Style**: RESTful HTTP API with JSON payloads.
- **HTTP Endpoints**:
  - `POST /api/auth/register` - Create user.
  - `POST /api/auth/login` - Authenticate user, return JWT.
  - `GET /api/auth/me` - Get current authenticated user profile.
  - `GET /api/groups` - List user's groups.
  - `POST /api/groups` - Create a new group.
  - `POST /api/groups/{group_id}/members` - Add user to group by email.
  - `DELETE /api/groups/{group_id}/members/{user_id}` - Remove user from group.
  - `GET /api/groups/{group_id}/balances` - Get balances and simplified debts for a group.
  - `GET /api/expenses` - List user's expenses (all or group-filtered).
  - `POST /api/expenses` - Create expense (supports multi-payer + any of the 4 split types).
  - `PUT /api/expenses/{expense_id}` - Edit expense.
  - `DELETE /api/expenses/{expense_id}` - Delete expense.
  - `POST /api/settlements` - Record manual settlement.
  - `GET /api/users/search?q={query}` - Search users by email or name to invite.
- **WebSocket Endpoint**:
  - `/ws/expenses/{expense_id}/comments` - WebSocket connection per expense.
  - **Authentication**: JWT token passed as a query parameter (e.g., `/ws/expenses/{expense_id}/comments?token=JWT_TOKEN`) to authenticate the client during the WebSocket connection handshake.
  - Clients send comments in JSON: `{ "message": "hello" }`.
  - Backend persists comments to the `comments` table and broadcasts them to all active connections on that expense.

## 9. Deployment & Testing Plan
- **Frontend Deployment**: Deployed on Vercel or static hosting.
- **Backend & Database**: Deployed on Railway or Render (FastAPI app + PostgreSQL database instance).
- **Database Migrations**: Simple automated startup database initialization using SQLAlchemy (`Base.metadata.create_all`).
- **Testing Plan**:
  - Backend integration tests using `pytest` and `httpx.AsyncClient` targeting critical auth, expense split, and balance logic.
  - Manual visual verification of UI flows and WebSocket connections.

## 10. Known Risks, Tradeoffs & Constraints
- **Time Constraint (3-Day Limit)**:
  - Focus on code clarity and core workflows.
  - No complex Redux/Zustand state managers unless needed (React Context is sufficient).
  - Minimalistic WebSocket error recovery (simple reconnect on client-side).
  - Decimal precision: Use PostgreSQL `NUMERIC(10, 2)` or `DECIMAL(10, 2)` to avoid floating-point math issues.
  - Direct connection to PostgreSQL without pooling proxy (e.g., PgBouncer) for simplicity.
