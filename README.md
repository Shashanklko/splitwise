# Splitwise Clone

A production-ready, containerized full-stack expense-sharing application inspired by Splitwise. It enables roommates, friends, and travel partners to log shared bills, calculate net balances, simplify debts, and chat on individual bills in real-time.

---

## Key Features

*   **Secure Authentication**: JWT-based access sessions coupled with secure bcrypt password hashing.
*   **Group and Member Ledgering**: Organize expense pools into separate groups, invite members by email, and manage administrative controls.
*   **Advanced Bill Splitting**: Split totals using four distinct methods:
    *   *Equally*: Divided evenly.
    *   *Unequally*: Specify exact amounts per member.
    *   *Percentage*: Shares allocated by percentages (must sum to 100%).
    *   *Shares*: Fractional coefficient calculations.
    *   *Fractional Rounding*: Leftover remainders (e.g., ₹100.00 / 3) are automatically corrected on the first participant to maintain 100% currency alignment.
*   **Debt Minimization (Min-Cash-Flow)**: Automatically runs a greedy matching algorithm to aggregate balances and simplify debts, minimizing the number of transactions needed to settle.
*   **Real-time bill Discussion**: Native WebSocket room hubs per bill for instant messaging.
*   **Polygonal Tessellation Graphics**: Modern interface featuring live rotating vector drawings styled directly from original CSS palettes.

---

## Directory Structure

*   `/backend`: FastAPI Python REST API, WebSocket room managers, balances calculus, and SQLAlchemy Postgres/SQLite database mappings.
*   `/frontend`: Vite React Single Page Application utilizing TypeScript and TailwindCSS.
*   `docker-compose.yml`: Container orchestration setup mapping the frontend, backend, and PostgreSQL DB.
*   `render.yaml`: Blueprint configuration for one-click automated deployment on Render.

---

## Getting Started

### 1. Running with Docker (Recommended)

To run the entire stack (PostgreSQL DB, FastAPI backend, React Nginx web proxy) locally in containerized form:

1.  Ensure **Docker Desktop** is open and active.
2.  Run the compose build command in the root folder:
    ```powershell
    docker compose up --build -d
    ```
3.  Access the services:
    *   **Frontend Application**: `http://localhost` (Port 80)
    *   **Interactive API documentation**: `http://localhost/docs`

---

### 2. Manual Local Development

If you prefer to run services individually without Docker:

#### Prerequisites
*   Python 3.11+
*   Node.js 18+

#### Setup Backend API
1.  Navigate to `/backend`:
    ```bash
    cd backend
    ```
2.  Initialize and activate a virtual environment:
    ```bash
    python -m venv .venv
    # Windows:
    .venv\Scripts\activate
    # macOS/Linux:
    source .venv/bin/activate
    ```
3.  Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```
4.  Launch the hot-reload API server:
    ```bash
    uvicorn app.main:app --reload --port 8000
    ```
    *A local SQLite database will be created automatically at `backend/splitwise.db` on startup.*

#### Setup Frontend SPA
1.  Navigate to `/frontend` in a new terminal:
    ```bash
    cd frontend
    ```
2.  Install packages:
    ```bash
    npm install
    ```
3.  Launch the Vite hot-reloading dev server:
    ```bash
    npm run dev
    ```
4.  Open `http://localhost:5173` in your browser.

---

## Production Deployment (Render Blueprint)

This project is configured with a Render Blueprint to automate multi-service configurations:

1.  Push your repository commits to your GitHub account.
2.  Open your **Render Dashboard** and select **New > Blueprint**.
3.  Connect your repository.
4.  Render will parse the [render.yaml](file:///e:/Project/Splitwise/render.yaml) file to automatically provision a PostgreSQL DB, compile your React Static Site (applying the correct proxy rewrite rules to target `/api` and `/ws`), and build the backend Docker service in a single step.

---

## Running Backend Integration Tests

To verify calculations and split precision:
1.  Navigate to `/backend` and activate the virtual environment.
2.  Run the tests suite using PyTest:
    ```bash
    pytest
    ```
