from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List
from app import schemas, crud, models, balances
from app.database import get_db
from app.auth import get_current_user

router = APIRouter(prefix="/api/users", tags=["users"])

@router.get("/search", response_model=List[schemas.UserResponse])
def search_users(
    q: str = Query("", min_length=1),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    return crud.search_users(db, q, current_user.id)

@router.get("/me/balances")
def get_user_balances(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    return balances.calculate_overall_user_balances(db, current_user.id)
