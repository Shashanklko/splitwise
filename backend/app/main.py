from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, Query, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from jose import jwt, JWTError
import json
import logging
from typing import List, Dict

from app.database import engine, Base, get_db
from app.config import settings
from app import models, schemas, crud
from app.routers import auth, groups, expenses, settlements, users, import_csv
from app.auth import get_current_user

import time
from sqlalchemy.exc import OperationalError

# Initialize Database Tables with retry logic
max_retries = 10
for i in range(max_retries):
    try:
        Base.metadata.create_all(bind=engine)
        print("Database tables initialized successfully.")
        break
    except OperationalError as e:
        if i == max_retries - 1:
            print("Could not connect to the database after maximum retries. Exiting.")
            raise e
        print(f"Database connection failed: {e}. Retrying in 3 seconds ({i+1}/{max_retries})...")
        time.sleep(3)


app = FastAPI(title="Splitwise Clone API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(auth.router)
app.include_router(groups.router)
app.include_router(expenses.router)
app.include_router(settlements.router)
app.include_router(users.router)
app.include_router(import_csv.router)

# WebSocket Connection Manager
class ConnectionManager:
    def __init__(self):
        # Maps expense_id -> list of active WebSockets
        self.active_connections: Dict[int, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, expense_id: int):
        await websocket.accept()
        if expense_id not in self.active_connections:
            self.active_connections[expense_id] = []
        self.active_connections[expense_id].append(websocket)

    def disconnect(self, websocket: WebSocket, expense_id: int):
        if expense_id in self.active_connections:
            if websocket in self.active_connections[expense_id]:
                self.active_connections[expense_id].remove(websocket)
            if not self.active_connections[expense_id]:
                del self.active_connections[expense_id]

    async def broadcast(self, message_json: str, expense_id: int):
        if expense_id in self.active_connections:
            for connection in self.active_connections[expense_id]:
                try:
                    await connection.send_text(message_json)
                except Exception:
                    # Stale connection, manager will clean it up on disconnect
                    pass

manager = ConnectionManager()

def get_ws_user(token: str, db: Session) -> models.User:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        user = db.query(models.User).filter(models.User.email == email).first()
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

@app.websocket("/ws/expenses/{expense_id}/comments")
async def websocket_endpoint(
    websocket: WebSocket,
    expense_id: int,
    token: str = Query(...)
):
    # Obtain a fresh database session
    db: Session = next(get_db())
    
    # 1. Authenticate connection
    try:
        user = get_ws_user(token, db)
    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        db.close()
        return

    # 2. Check membership
    expense = crud.get_expense_by_id(db, expense_id)
    if not expense:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        db.close()
        return

    if expense.group_id is not None:
        if not crud.is_user_in_group(db, expense.group_id, user.id):
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            db.close()
            return
    else:
        # Standalone expense verification
        payer_ids = [p.user_id for p in expense.payers]
        split_ids = [s.user_id for s in expense.splits]
        if user.id not in payer_ids and user.id not in split_ids:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            db.close()
            return

    # Connect to room
    await manager.connect(websocket, expense_id)
    
    # Send existing comments history upon connection
    try:
        comments = crud.get_comments_for_expense(db, expense_id)
        history = [
            {
                "id": c.id,
                "expense_id": c.expense_id,
                "user_id": c.user_id,
                "user_name": c.user_name,
                "message": c.message,
                "created_at": c.created_at.isoformat()
            } for c in comments
        ]
        await websocket.send_text(json.dumps({"type": "history", "comments": history}))
        
        # Keep listening for new comments
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)
            message_text = payload.get("message", "").strip()
            
            if message_text:
                # Save comment
                comment = crud.create_comment(db, expense_id, user.id, message_text)
                # Broadcast comment to all connections in room
                broadcast_payload = {
                    "type": "comment",
                    "comment": {
                        "id": comment.id,
                        "expense_id": comment.expense_id,
                        "user_id": comment.user_id,
                        "user_name": comment.user_name,
                        "message": comment.message,
                        "created_at": comment.created_at.isoformat()
                    }
                }
                await manager.broadcast(json.dumps(broadcast_payload), expense_id)
                
    except WebSocketDisconnect:
        manager.disconnect(websocket, expense_id)
    except Exception as e:
        manager.disconnect(websocket, expense_id)
    finally:
        db.close()

@app.get("/api/health")
def health_check():
    return {"status": "healthy"}


# ── Group Chat: REST history endpoint ────────────────────────────────────────

@app.get("/api/groups/{group_id}/messages")
def get_group_messages(
    group_id: int,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Fetch the last `limit` messages for a group channel (for initial load)."""
    if not crud.is_user_in_group(db, group_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a member of this group")

    msgs = (
        db.query(models.GroupMessage)
        .filter(models.GroupMessage.group_id == group_id)
        .order_by(models.GroupMessage.created_at.asc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": m.id,
            "group_id": m.group_id,
            "user_id": m.user_id,
            "user_name": m.user_name,
            "message": m.message,
            "created_at": m.created_at.isoformat(),
        }
        for m in msgs
    ]


# ── Group Chat: WebSocket ─────────────────────────────────────────────────────

# Separate connection manager for group chat rooms (keyed by group_id)
group_chat_manager = ConnectionManager()


@app.websocket("/ws/groups/{group_id}/chat")
async def group_chat_websocket(
    websocket: WebSocket,
    group_id: int,
    token: str = Query(...),
):
    """
    Group-level real-time chat channel.
    All active members of the group can send and receive messages here.
    Messages are persisted in the `group_messages` table.
    """
    db: Session = next(get_db())

    # 1. Authenticate
    try:
        user = get_ws_user(token, db)
    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        db.close()
        return

    # 2. Check group membership
    if not crud.is_user_in_group(db, group_id, user.id):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        db.close()
        return

    # 3. Connect to the group room
    await group_chat_manager.connect(websocket, group_id)

    # 4. Send message history on connect
    try:
        msgs = (
            db.query(models.GroupMessage)
            .filter(models.GroupMessage.group_id == group_id)
            .order_by(models.GroupMessage.created_at.asc())
            .limit(100)
            .all()
        )
        history = [
            {
                "id": m.id,
                "group_id": m.group_id,
                "user_id": m.user_id,
                "user_name": m.user_name,
                "message": m.message,
                "created_at": m.created_at.isoformat(),
            }
            for m in msgs
        ]
        await websocket.send_text(json.dumps({"type": "history", "messages": history}))

        # 5. Listen for new messages
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)
            message_text = payload.get("message", "").strip()

            if message_text:
                # Persist message
                db_msg = models.GroupMessage(
                    group_id=group_id,
                    user_id=user.id,
                    message=message_text,
                )
                db.add(db_msg)
                db.commit()
                db.refresh(db_msg)

                # Broadcast to all room members
                broadcast_payload = {
                    "type": "message",
                    "message": {
                        "id": db_msg.id,
                        "group_id": db_msg.group_id,
                        "user_id": db_msg.user_id,
                        "user_name": db_msg.user_name,
                        "message": db_msg.message,
                        "created_at": db_msg.created_at.isoformat(),
                    },
                }
                await group_chat_manager.broadcast(json.dumps(broadcast_payload), group_id)

    except WebSocketDisconnect:
        group_chat_manager.disconnect(websocket, group_id)
    except Exception:
        group_chat_manager.disconnect(websocket, group_id)
    finally:
        db.close()

