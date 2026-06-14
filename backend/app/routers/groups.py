from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Dict, Any
from app import schemas, crud, models, balances
from app.database import get_db
from app.auth import get_current_user

router = APIRouter(prefix="/api/groups", tags=["groups"])

@router.get("", response_model=List[schemas.GroupResponse])
def list_groups(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return crud.get_groups_for_user(db, current_user.id)

@router.post("", response_model=schemas.GroupResponse, status_code=status.HTTP_201_CREATED)
def create_group(group_in: schemas.GroupCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return crud.create_group(db, group_in, current_user.id)

@router.get("/{group_id}", response_model=schemas.GroupDetailResponse)
def get_group(group_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if not crud.is_user_in_group(db, group_id, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this group"
        )
    group = crud.get_group_by_id(db, group_id)
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
    return group

@router.post("/{group_id}/members", response_model=schemas.UserResponse)
def add_member(group_id: int, payload: Dict[str, str], db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if not crud.is_user_in_group(db, group_id, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must be a member of this group to add users"
        )
    
    email = payload.get("email")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email field is required"
        )
        
    return crud.add_user_to_group(db, group_id, email)

@router.delete("/{group_id}/members/{user_id}", status_code=status.HTTP_200_OK)
def remove_member(group_id: int, user_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    group = crud.get_group_by_id(db, group_id)
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
        
    # Check if current user is the creator
    if group.creator_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the group creator can remove members"
        )
        
    if user_id == group.creator_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The group creator cannot be removed from the group"
        )
        
    crud.remove_user_from_group(db, group_id, user_id)
    return {"message": "Member removed successfully"}

@router.get("/{group_id}/balances")
def get_group_balances(group_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if not crud.is_user_in_group(db, group_id, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this group"
        )
        
    g_balances = balances.get_group_member_balances(db, group_id)
    simplified_debts = balances.simplify_debts(g_balances, db)
    
    # Format user balances for display
    users = db.query(models.User).filter(models.User.id.in_(list(g_balances.keys()))).all()
    user_names = {u.id: u.name for u in users}
    
    balances_list = []
    for uid, bal in g_balances.items():
        balances_list.append({
            "user_id": uid,
            "name": user_names.get(uid, f"User {uid}"),
            "net_balance": bal
        })
        
    return {
        "balances": balances_list,
        "simplified_debts": simplified_debts
    }

@router.get("/{group_id}/breakdown/{user_id}")
def get_member_breakdown(
    group_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Returns the expense-by-expense breakdown of a member's balance in the group.
    Satisfies Rohan's requirement: see exactly which expenses make up the total owed.
    """
    if not crud.is_user_in_group(db, group_id, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this group"
        )
    breakdown = balances.get_member_expense_breakdown(db, group_id, user_id)
    return {"breakdown": breakdown}

