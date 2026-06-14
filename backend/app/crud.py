from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_
from fastapi import HTTPException, status
from decimal import Decimal
from typing import List, Optional
from app import models, schemas
from app.auth import get_password_hash

# --- User CRUD ---

def get_user_by_email(db: Session, email: str) -> Optional[models.User]:
    return db.query(models.User).filter(models.User.email == email).first()

def get_user_by_id(db: Session, user_id: int) -> Optional[models.User]:
    return db.query(models.User).filter(models.User.id == user_id).first()

def create_user(db: Session, user: schemas.UserRegister) -> models.User:
    db_user = models.User(
        email=user.email,
        password_hash=get_password_hash(user.password),
        name=user.name
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def search_users(db: Session, query: str, current_user_id: int) -> List[models.User]:
    return db.query(models.User).filter(
        models.User.id != current_user_id,
        or_(
            models.User.email.ilike(f"%{query}%"),
            models.User.name.ilike(f"%{query}%")
        )
    ).limit(10).all()

# --- Group CRUD ---

def get_group_by_id(db: Session, group_id: int) -> Optional[models.Group]:
    return db.query(models.Group).filter(models.Group.id == group_id).first()

def get_groups_for_user(db: Session, user_id: int) -> List[models.Group]:
    # Fetch all groups where user is a member
    user = db.query(models.User).filter(models.User.id == user_id).first()
    return user.groups if user else []

def create_group(db: Session, group_in: schemas.GroupCreate, creator_id: int) -> models.Group:
    db_group = models.Group(name=group_in.name, creator_id=creator_id)
    db.add(db_group)
    db.commit()
    db.refresh(db_group)
    
    # Creator is automatically a member
    import datetime
    db_member = models.GroupMember(
        group_id=db_group.id,
        user_id=creator_id,
        joined_at=datetime.datetime.utcnow()
    )
    db.add(db_member)
    db.commit()
    
    db.refresh(db_group)
    return db_group

def add_user_to_group(db: Session, group_id: int, user_email: str, joined_at=None) -> models.User:
    import datetime
    user = get_user_by_email(db, user_email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found with this email"
        )
    
    # Check if already in group (active)
    existing_member = db.query(models.GroupMember).filter(
        models.GroupMember.group_id == group_id,
        models.GroupMember.user_id == user.id,
        models.GroupMember.left_at == None
    ).first()
    
    if existing_member:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is already a member of this group"
        )
    
    db_member = models.GroupMember(
        group_id=group_id,
        user_id=user.id,
        joined_at=joined_at or datetime.datetime.utcnow()
    )
    db.add(db_member)
    db.commit()
    return user

def remove_user_from_group(db: Session, group_id: int, user_id: int, left_at=None):
    import datetime
    db_member = db.query(models.GroupMember).filter(
        models.GroupMember.group_id == group_id,
        models.GroupMember.user_id == user_id,
        models.GroupMember.left_at == None
    ).first()
    
    if not db_member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User is not a member of this group"
        )
    
    # Soft delete: record when they left instead of deleting the row
    db_member.left_at = left_at or datetime.datetime.utcnow()
    db.commit()

def is_user_in_group(db: Session, group_id: int, user_id: int) -> bool:
    """Check if user is currently an active member (no left_at set)."""
    return db.query(models.GroupMember).filter(
        models.GroupMember.group_id == group_id,
        models.GroupMember.user_id == user_id,
        models.GroupMember.left_at == None
    ).first() is not None

def get_member_active_window(db: Session, group_id: int, user_id: int):
    """Return (joined_at, left_at) for a member's most recent membership record."""
    record = db.query(models.GroupMember).filter(
        models.GroupMember.group_id == group_id,
        models.GroupMember.user_id == user_id
    ).order_by(models.GroupMember.joined_at.desc()).first()
    if not record:
        return None, None
    return record.joined_at, record.left_at

# --- Expense & Split Calculation Logic ---

def calculate_splits(
    amount: Decimal,
    split_type: str,
    splits_in: List[schemas.ExpenseSplitCreate]
) -> List[tuple]:
    """
    Returns a list of tuples: (user_id, amount_owed, split_value)
    Performs remainder rounding adjustments on the first participant's split.
    """
    n = len(splits_in)
    if n == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one split participant must be specified"
        )
    
    calculated_splits = []
    
    if split_type == "equally":
        # Divide amount equally
        base_share = (amount / Decimal(n)).quantize(Decimal("0.01"))
        sum_shares = base_share * Decimal(n)
        diff = amount - sum_shares
        
        for idx, s in enumerate(splits_in):
            user_owed = base_share
            if idx == 0:
                user_owed += diff
            calculated_splits.append((s.user_id, user_owed, None))
            
    elif split_type == "unequally":
        # Split values are direct currency amounts
        total_value = sum(s.split_value for s in splits_in if s.split_value is not None)
        if total_value != amount:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Total split amounts ({total_value}) must equal the total expense amount ({amount})"
            )
        for s in splits_in:
            if s.split_value is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Split value must be provided for unequally split type"
                )
            calculated_splits.append((s.user_id, s.split_value, s.split_value))
            
    elif split_type == "percentage":
        # Split values are percentages that must sum to 100
        total_percentage = sum(s.split_value for s in splits_in if s.split_value is not None)
        if total_percentage != Decimal("100"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Total percentages ({total_percentage}%) must equal 100%"
            )
        
        sum_owed = Decimal("0.00")
        temp_splits = []
        for s in splits_in:
            if s.split_value is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Percentage split value must be provided for percentage split type"
                )
            owed = (s.split_value / Decimal("100") * amount).quantize(Decimal("0.01"))
            sum_owed += owed
            temp_splits.append((s.user_id, owed, s.split_value))
            
        # Adjust remainder on first participant
        diff = amount - sum_owed
        if temp_splits:
            user_id, owed, val = temp_splits[0]
            temp_splits[0] = (user_id, owed + diff, val)
        calculated_splits = temp_splits
        
    elif split_type == "shares":
        # Split values are share coefficients
        total_shares = sum(s.split_value for s in splits_in if s.split_value is not None)
        if total_shares <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Total shares must be greater than zero"
            )
        
        sum_owed = Decimal("0.00")
        temp_splits = []
        for s in splits_in:
            if s.split_value is None or s.split_value < 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Shares value must be positive"
                )
            owed = (s.split_value / total_shares * amount).quantize(Decimal("0.01"))
            sum_owed += owed
            temp_splits.append((s.user_id, owed, s.split_value))
            
        # Adjust remainder on first participant
        diff = amount - sum_owed
        if temp_splits:
            user_id, owed, val = temp_splits[0]
            temp_splits[0] = (user_id, owed + diff, val)
        calculated_splits = temp_splits
        
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid split type: {split_type}"
        )
        
    return calculated_splits

def create_expense(db: Session, expense_in: schemas.ExpenseCreate) -> models.Expense:
    # 1. Validate payers: sum of amount_paid must equal total amount
    total_paid = sum(p.amount_paid for p in expense_in.payers)
    if total_paid != expense_in.amount:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Total amount paid ({total_paid}) must equal total expense amount ({expense_in.amount})"
        )
        
    # 2. Calculate splits
    calculated_splits = calculate_splits(expense_in.amount, expense_in.split_type, expense_in.splits)
    
    # 3. Create core expense record
    db_expense = models.Expense(
        group_id=expense_in.group_id,
        description=expense_in.description,
        amount=expense_in.amount,
        currency=getattr(expense_in, 'currency', 'INR') or 'INR',
        original_amount=getattr(expense_in, 'original_amount', None),
        exchange_rate=getattr(expense_in, 'exchange_rate', None),
        split_type=expense_in.split_type
    )
    db.add(db_expense)
    db.commit()
    db.refresh(db_expense)
    
    # 4. Save payers
    for p in expense_in.payers:
        db_payer = models.ExpensePayer(
            expense_id=db_expense.id,
            user_id=p.user_id,
            amount_paid=p.amount_paid
        )
        db.add(db_payer)
        
    # 5. Save splits
    for user_id, amount_owed, split_value in calculated_splits:
        db_split = models.ExpenseSplit(
            expense_id=db_expense.id,
            user_id=user_id,
            amount_owed=amount_owed,
            split_value=split_value
        )
        db.add(db_split)
        
    db.commit()
    db.refresh(db_expense)
    return db_expense

def get_expense_by_id(db: Session, expense_id: int) -> Optional[models.Expense]:
    return db.query(models.Expense).filter(models.Expense.id == expense_id).first()

def get_expenses_for_user(
    db: Session,
    user_id: int,
    group_id: Optional[int] = None
) -> List[models.Expense]:
    query = db.query(models.Expense)
    
    if group_id is not None:
        # User must be member of this group
        if not is_user_in_group(db, group_id, user_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User is not a member of this group"
            )
        return query.filter(models.Expense.group_id == group_id).order_by(models.Expense.created_at.desc()).all()
    else:
        # Expenses from all user's groups, or non-group direct expenses where user is payer/split-recipient
        user_groups = db.query(models.GroupMember.group_id).filter(models.GroupMember.user_id == user_id).all()
        user_group_ids = [g[0] for g in user_groups]
        
        # Direct expenses involving the user
        direct_expense_ids = db.query(models.ExpensePayer.expense_id).filter(models.ExpensePayer.user_id == user_id).subquery()
        direct_expense_ids2 = db.query(models.ExpenseSplit.expense_id).filter(models.ExpenseSplit.user_id == user_id).subquery()
        
        return query.filter(
            or_(
                models.Expense.group_id.in_(user_group_ids) if user_group_ids else False,
                models.Expense.id.in_(direct_expense_ids),
                models.Expense.id.in_(direct_expense_ids2)
            )
        ).order_by(models.Expense.created_at.desc()).all()

def update_expense(db: Session, expense_id: int, expense_in: schemas.ExpenseCreate) -> models.Expense:
    db_expense = get_expense_by_id(db, expense_id)
    if not db_expense:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Expense not found"
        )
        
    # Validate payers: sum of amount_paid must equal total amount
    total_paid = sum(p.amount_paid for p in expense_in.payers)
    if total_paid != expense_in.amount:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Total amount paid ({total_paid}) must equal total expense amount ({expense_in.amount})"
        )
        
    # Calculate splits
    calculated_splits = calculate_splits(expense_in.amount, expense_in.split_type, expense_in.splits)
    
    # Update expense details
    db_expense.description = expense_in.description
    db_expense.amount = expense_in.amount
    db_expense.split_type = expense_in.split_type
    db_expense.group_id = expense_in.group_id
    
    # Remove old payers and splits
    db.query(models.ExpensePayer).filter(models.ExpensePayer.expense_id == expense_id).delete()
    db.query(models.ExpenseSplit).filter(models.ExpenseSplit.expense_id == expense_id).delete()
    
    # Add new payers
    for p in expense_in.payers:
        db_payer = models.ExpensePayer(
            expense_id=expense_id,
            user_id=p.user_id,
            amount_paid=p.amount_paid
        )
        db.add(db_payer)
        
    # Add new splits
    for user_id, amount_owed, split_value in calculated_splits:
        db_split = models.ExpenseSplit(
            expense_id=expense_id,
            user_id=user_id,
            amount_owed=amount_owed,
            split_value=split_value
        )
        db.add(db_split)
        
    db.commit()
    db.refresh(db_expense)
    return db_expense

def delete_expense(db: Session, expense_id: int):
    db_expense = get_expense_by_id(db, expense_id)
    if not db_expense:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Expense not found"
        )
    db.delete(db_expense)
    db.commit()

# --- Settlements CRUD ---

def create_settlement(db: Session, settlement_in: schemas.SettlementCreate) -> models.Settlement:
    db_settlement = models.Settlement(
        group_id=settlement_in.group_id,
        payer_id=settlement_in.payer_id,
        payee_id=settlement_in.payee_id,
        amount=settlement_in.amount
    )
    db.add(db_settlement)
    db.commit()
    db.refresh(db_settlement)
    return db_settlement

def get_settlements_for_user(
    db: Session,
    user_id: int,
    group_id: Optional[int] = None
) -> List[models.Settlement]:
    query = db.query(models.Settlement)
    if group_id is not None:
        return query.filter(models.Settlement.group_id == group_id).order_by(models.Settlement.created_at.desc()).all()
    else:
        # Any settlement where the user is either the payer or payee
        return query.filter(
            or_(
                models.Settlement.payer_id == user_id,
                models.Settlement.payee_id == user_id
            )
        ).order_by(models.Settlement.created_at.desc()).all()

# --- Comments CRUD ---

def create_comment(db: Session, expense_id: int, user_id: int, message: str) -> models.Comment:
    db_comment = models.Comment(
        expense_id=expense_id,
        user_id=user_id,
        message=message
    )
    db.add(db_comment)
    db.commit()
    db.refresh(db_comment)
    return db_comment

def get_comments_for_expense(db: Session, expense_id: int) -> List[models.Comment]:
    return db.query(models.Comment).filter(models.Comment.expense_id == expense_id).order_by(models.Comment.created_at.asc()).all()
