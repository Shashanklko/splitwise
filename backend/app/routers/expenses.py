from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app import schemas, crud, models
from app.database import get_db
from app.auth import get_current_user

router = APIRouter(prefix="/api/expenses", tags=["expenses"])

@router.get("", response_model=List[schemas.ExpenseResponse])
def list_expenses(
    group_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    return crud.get_expenses_for_user(db, current_user.id, group_id)

@router.post("", response_model=schemas.ExpenseResponse, status_code=status.HTTP_201_CREATED)
def create_expense(
    expense_in: schemas.ExpenseCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # Verify group membership if group_id is specified
    if expense_in.group_id is not None:
        if not crud.is_user_in_group(db, expense_in.group_id, current_user.id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not a member of the group specified in the expense"
            )
            
    # Also verify that all payers and split participants are in the group if group_id is specified
    if expense_in.group_id is not None:
        participant_ids = set([p.user_id for p in expense_in.payers] + [s.user_id for s in expense_in.splits])
        for p_id in participant_ids:
            if not crud.is_user_in_group(db, expense_in.group_id, p_id):
                user_obj = db.query(models.User).filter(models.User.id == p_id).first()
                name = user_obj.name if user_obj else f"ID {p_id}"
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"User {name} is not a member of this group"
                )

    return crud.create_expense(db, expense_in)

@router.get("/{expense_id}", response_model=schemas.ExpenseResponse)
def get_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    expense = crud.get_expense_by_id(db, expense_id)
    if not expense:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")
        
    # Verify membership
    if expense.group_id is not None:
        if not crud.is_user_in_group(db, expense.group_id, current_user.id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not authorized to view this expense")
    else:
        # Check if user is part of standalone expense
        payer_ids = [p.user_id for p in expense.payers]
        split_ids = [s.user_id for s in expense.splits]
        if current_user.id not in payer_ids and current_user.id not in split_ids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not authorized to view this expense")
            
    return expense

@router.put("/{expense_id}", response_model=schemas.ExpenseResponse)
def update_expense(
    expense_id: int,
    expense_in: schemas.ExpenseCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    expense = crud.get_expense_by_id(db, expense_id)
    if not expense:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")
        
    # Verify authorization
    if expense.group_id is not None:
        if not crud.is_user_in_group(db, expense.group_id, current_user.id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not a member of the expense's group")
    else:
        payer_ids = [p.user_id for p in expense.payers]
        split_ids = [s.user_id for s in expense.splits]
        if current_user.id not in payer_ids and current_user.id not in split_ids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not authorized to edit this expense")

    # Check new group membership if changed
    if expense_in.group_id is not None:
        if not crud.is_user_in_group(db, expense_in.group_id, current_user.id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not a member of the new group specified"
            )
            
    return crud.update_expense(db, expense_id, expense_in)

@router.delete("/{expense_id}", status_code=status.HTTP_200_OK)
def delete_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    expense = crud.get_expense_by_id(db, expense_id)
    if not expense:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")
        
    # Verify authorization
    if expense.group_id is not None:
        if not crud.is_user_in_group(db, expense.group_id, current_user.id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not a member of the expense's group")
    else:
        payer_ids = [p.user_id for p in expense.payers]
        split_ids = [s.user_id for s in expense.splits]
        if current_user.id not in payer_ids and current_user.id not in split_ids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not authorized to delete this expense")
            
    crud.delete_expense(db, expense_id)
    return {"message": "Expense deleted successfully"}
