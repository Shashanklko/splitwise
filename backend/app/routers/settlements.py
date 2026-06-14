from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app import schemas, crud, models
from app.database import get_db
from app.auth import get_current_user

router = APIRouter(prefix="/api/settlements", tags=["settlements"])

@router.post("", response_model=schemas.SettlementResponse, status_code=status.HTTP_201_CREATED)
def create_settlement(
    settlement_in: schemas.SettlementCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # Verify current user is either the payer or the payee to perform this action
    if current_user.id != settlement_in.payer_id and current_user.id != settlement_in.payee_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only record settlements that involve yourself"
        )
        
    # Verify group membership if group_id is specified
    if settlement_in.group_id is not None:
        if not crud.is_user_in_group(db, settlement_in.group_id, settlement_in.payer_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Payer is not a member of this group"
            )
        if not crud.is_user_in_group(db, settlement_in.group_id, settlement_in.payee_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Recipient is not a member of this group"
            )

    return crud.create_settlement(db, settlement_in)

@router.get("", response_model=List[schemas.SettlementResponse])
def list_settlements(
    group_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    if group_id is not None:
        if not crud.is_user_in_group(db, group_id, current_user.id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not a member of this group"
            )
    return crud.get_settlements_for_user(db, current_user.id, group_id)
