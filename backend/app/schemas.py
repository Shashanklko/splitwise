from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional
from decimal import Decimal
from datetime import datetime

# --- Auth Schemas ---

class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)
    name: str = Field(..., min_length=1)

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: int
    email: str
    name: str
    created_at: datetime

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None

# --- Group Schemas ---

class GroupCreate(BaseModel):
    name: str = Field(..., min_length=1)

class GroupResponse(BaseModel):
    id: int
    name: str
    creator_id: int
    created_at: datetime

    class Config:
        from_attributes = True

class GroupDetailResponse(BaseModel):
    id: int
    name: str
    creator_id: int
    created_at: datetime
    members: List[UserResponse]

    class Config:
        from_attributes = True

# --- Expense Schemas ---

class ExpensePayerCreate(BaseModel):
    user_id: int
    amount_paid: Decimal

class ExpenseSplitCreate(BaseModel):
    user_id: int
    split_value: Optional[Decimal] = None  # None for equally, raw values for others

class ExpenseCreate(BaseModel):
    group_id: Optional[int] = None
    description: str = Field(..., min_length=1)
    amount: Decimal
    currency: str = "INR"
    original_amount: Optional[Decimal] = None
    exchange_rate: Optional[Decimal] = None
    split_type: str  # equally, unequally, percentage, shares
    payers: List[ExpensePayerCreate]
    splits: List[ExpenseSplitCreate]

class ExpensePayerResponse(BaseModel):
    user_id: int
    amount_paid: Decimal
    user_name: str

    class Config:
        from_attributes = True

class ExpenseSplitResponse(BaseModel):
    user_id: int
    amount_owed: Decimal
    split_value: Optional[Decimal] = None
    user_name: str

    class Config:
        from_attributes = True

class ExpenseResponse(BaseModel):
    id: int
    group_id: Optional[int]
    description: str
    amount: Decimal
    currency: str
    original_amount: Optional[Decimal] = None
    exchange_rate: Optional[Decimal] = None
    split_type: str
    created_at: datetime
    payers: List[ExpensePayerResponse]
    splits: List[ExpenseSplitResponse]

    class Config:
        from_attributes = True

# --- Settlement Schemas ---

class SettlementCreate(BaseModel):
    group_id: Optional[int] = None
    payer_id: int
    payee_id: int
    amount: Decimal

class SettlementResponse(BaseModel):
    id: int
    group_id: Optional[int]
    payer_id: int
    payee_id: int
    amount: Decimal
    created_at: datetime
    payer_name: str
    payee_name: str

    class Config:
        from_attributes = True

# --- Comment Schemas ---

class CommentCreate(BaseModel):
    message: str = Field(..., min_length=1)

class CommentResponse(BaseModel):
    id: int
    expense_id: int
    user_id: int
    message: str
    created_at: datetime
    user_name: str

    class Config:
        from_attributes = True

# --- Balance Summaries ---

class DebtCalculation(BaseModel):
    debtor_id: int
    debtor_name: str
    creditor_id: int
    creditor_name: str
    amount: Decimal

class UserBalanceSummary(BaseModel):
    user_id: int
    name: str
    net_balance: Decimal  # Positive means owed money, negative means owes money

# --- CSV Import Schemas ---

class ImportAnomalyItem(BaseModel):
    row_index: int
    anomaly_type: str       # e.g. "DUPLICATE", "CURRENCY_MISMATCH", "NEGATIVE_AMOUNT"
    description: str        # Human-readable explanation
    proposed_action: str    # e.g. "SKIP", "CONVERT_TO_INR", "TREAT_AS_REFUND"
    raw_row: dict           # The original CSV row data
    resolved_row: Optional[dict] = None  # The cleaned row if action is applied
    user_decision: Optional[str] = None  # "ACCEPT" or "REJECT" - set by user

class ImportPreviewResponse(BaseModel):
    total_rows: int
    clean_rows: int
    anomaly_count: int
    anomalies: List[ImportAnomalyItem]
    ready_rows: List[dict]  # Rows with no anomalies, ready to commit

class ImportCommitRequest(BaseModel):
    group_id: int
    ready_rows: List[dict]
    resolved_anomalies: List[ImportAnomalyItem]  # Only those with user_decision=="ACCEPT"
