import datetime
from sqlalchemy import Column, String, Integer, Numeric, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.database import Base

class GroupMember(Base):
    __tablename__ = "group_members"

    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    joined_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=True)
    left_at = Column(DateTime, nullable=True)  # None means still active

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    name = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    groups = relationship("Group", secondary="group_members", back_populates="members")

class Group(Base):
    __tablename__ = "groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    creator_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    creator = relationship("User", foreign_keys=[creator_id])
    members = relationship("User", secondary="group_members", back_populates="groups")
    expenses = relationship("Expense", back_populates="group", cascade="all, delete-orphan")
    settlements = relationship("Settlement", back_populates="group", cascade="all, delete-orphan")

class Expense(Base):
    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=True)
    description = Column(String, nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)  # Always stored in INR
    currency = Column(String, default="INR", nullable=False)  # Original currency code
    original_amount = Column(Numeric(10, 4), nullable=True)  # Original amount in source currency
    exchange_rate = Column(Numeric(10, 6), nullable=True)  # Rate used for conversion to INR
    split_type = Column(String, nullable=False)  # equally, unequally, percentage, shares
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    group = relationship("Group", back_populates="expenses")
    payers = relationship("ExpensePayer", back_populates="expense", cascade="all, delete-orphan")
    splits = relationship("ExpenseSplit", back_populates="expense", cascade="all, delete-orphan")
    comments = relationship("Comment", back_populates="expense", cascade="all, delete-orphan")

class ExpensePayer(Base):
    __tablename__ = "expense_payers"

    expense_id = Column(Integer, ForeignKey("expenses.id", ondelete="CASCADE"), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    amount_paid = Column(Numeric(10, 2), nullable=False)

    # Relationships
    expense = relationship("Expense", back_populates="payers")
    user = relationship("User")

    @property
    def user_name(self) -> str:
        return self.user.name if self.user else ""

class ExpenseSplit(Base):
    __tablename__ = "expense_splits"

    expense_id = Column(Integer, ForeignKey("expenses.id", ondelete="CASCADE"), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    amount_owed = Column(Numeric(10, 2), nullable=False)
    split_value = Column(Numeric(10, 2), nullable=True)  # Raw percentage, shares, or unequal amount

    # Relationships
    expense = relationship("Expense", back_populates="splits")
    user = relationship("User")

    @property
    def user_name(self) -> str:
        return self.user.name if self.user else ""

class Settlement(Base):
    __tablename__ = "settlements"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=True)
    payer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    payee_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    group = relationship("Group", back_populates="settlements")
    payer = relationship("User", foreign_keys=[payer_id])
    payee = relationship("User", foreign_keys=[payee_id])

    @property
    def payer_name(self) -> str:
        return self.payer.name if self.payer else ""

    @property
    def payee_name(self) -> str:
        return self.payee.name if self.payee else ""

class Comment(Base):
    __tablename__ = "comments"

    id = Column(Integer, primary_key=True, index=True)
    expense_id = Column(Integer, ForeignKey("expenses.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    message = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    expense = relationship("Expense", back_populates="comments")
    user = relationship("User")

    @property
    def user_name(self) -> str:
        return self.user.name if self.user else ""


class GroupMessage(Base):
    """
    Persistent group-level chat messages.
    Separate from expense-level comments — this is the group's shared channel,
    accessible from the group page sidebar.
    """
    __tablename__ = "group_messages"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    message = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    group = relationship("Group")
    user = relationship("User")

    @property
    def user_name(self) -> str:
        return self.user.name if self.user else ""
