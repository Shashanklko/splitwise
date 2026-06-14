"""
CSV Import API endpoints
POST /api/import/preview  - Parse CSV, return anomalies without writing to DB
POST /api/import/commit   - Commit accepted rows to DB after user review
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session
from typing import List, Optional
from decimal import Decimal
from datetime import datetime
import json

from app import models, crud, schemas
from app.database import get_db
from app.auth import get_current_user
from app.import_parser import parse_csv, USD_TO_INR_RATE

router = APIRouter(prefix="/api/import", tags=["import"])


@router.post("/preview")
async def preview_import(
    file: UploadFile = File(...),
    group_id: int = Form(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Step 1 of 2: Parse the CSV and return anomaly report.
    Does NOT write anything to the database.
    The client receives the full anomaly list and clean rows for user review.
    """
    if not crud.is_user_in_group(db, group_id, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must be a member of this group to import expenses"
        )

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    # Get current active member names for validation
    memberships = db.query(models.GroupMember).filter(
        models.GroupMember.group_id == group_id,
        models.GroupMember.left_at == None
    ).all()
    member_ids = [m.user_id for m in memberships]
    members = db.query(models.User).filter(models.User.id.in_(member_ids)).all()
    known_members = [u.name for u in members]

    result = parse_csv(content, known_members)

    return {
        "total_rows": result["total_rows"],
        "clean_rows": len(result["clean_rows"]),
        "anomaly_count": result["anomaly_count"],
        "anomalies": result["anomalies"],
        "ready_rows": result["clean_rows"],
        "known_members": known_members,
    }


@router.post("/commit")
async def commit_import(
    payload: schemas.ImportCommitRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Step 2 of 2: Commit approved rows to the database.
    Only the rows that the user has accepted (ready_rows + resolved anomalies where user_decision='ACCEPT')
    are written to the database.
    """
    group_id = payload.group_id

    if not crud.is_user_in_group(db, group_id, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must be a member of this group to import expenses"
        )

    # Collect all rows to import: clean rows + user-accepted anomaly rows
    rows_to_import = list(payload.ready_rows)
    skipped = 0
    for anomaly in payload.resolved_anomalies:
        if anomaly.user_decision == "ACCEPT":
            rows_to_import.append(anomaly.resolved_row)
        else:
            skipped += 1

    # Get all group members (including former) for name→id lookup
    all_memberships = db.query(models.GroupMember).filter(
        models.GroupMember.group_id == group_id
    ).all()
    member_ids = list({m.user_id for m in all_memberships})
    members = db.query(models.User).filter(models.User.id.in_(member_ids)).all()
    name_to_id = {u.name.lower(): u.id for u in members}

    imported = 0
    errors = []

    for idx, row_data in enumerate(rows_to_import):
        try:
            raw = row_data.get("raw_row", row_data)
            description = str(raw.get("description", raw.get("expense", "Imported Expense"))).strip()
            if not description:
                description = "Imported Expense"

            # Amount (always in INR after conversion)
            amount_str = row_data.get("amount_inr") or raw.get("amount", "0")
            try:
                amount = Decimal(str(amount_str).replace(",", ""))
            except Exception:
                errors.append(f"Row {idx+1}: Could not parse amount '{amount_str}' — skipped")
                continue

            # Skip zero amounts
            if amount == Decimal("0"):
                skipped += 1
                continue

            currency = str(row_data.get("currency", "INR"))
            original_amount = row_data.get("original_amount")
            exchange_rate = row_data.get("exchange_rate")

            # Date
            date_str = row_data.get("parsed_date")
            if date_str:
                try:
                    expense_date = datetime.fromisoformat(date_str)
                except Exception:
                    expense_date = datetime.utcnow()
            else:
                expense_date = datetime.utcnow()

            # Payer
            paid_by_name = str(raw.get("paid_by", "")).strip()
            payer_id = name_to_id.get(paid_by_name.lower())
            if not payer_id:
                # Default to current user if payer unknown
                payer_id = current_user.id

            # Split participants
            split_with_raw = str(raw.get("split_with", "")).strip()
            if split_with_raw:
                split_names = [n.strip() for n in split_with_raw.split(";") if n.strip()]
            else:
                split_names = [u.name for u in members]  # Default: all members

            split_user_ids = []
            for name in split_names:
                uid = name_to_id.get(name.lower())
                if uid:
                    split_user_ids.append(uid)

            # Ensure payer is in split
            if payer_id not in split_user_ids:
                split_user_ids.insert(0, payer_id)

            if not split_user_ids:
                errors.append(f"Row {idx+1}: No valid split members found — skipped")
                continue

            # Calculate equal split
            per_person = (abs(amount) / len(split_user_ids)).quantize(Decimal("0.01"))

            # Build expense
            expense_data = schemas.ExpenseCreate(
                group_id=group_id,
                description=description,
                amount=abs(amount),
                currency=currency,
                original_amount=Decimal(original_amount) if original_amount else None,
                exchange_rate=Decimal(exchange_rate) if exchange_rate else None,
                split_type="equally",
                payers=[schemas.ExpensePayerCreate(user_id=payer_id, amount_paid=abs(amount))],
                splits=[
                    schemas.ExpenseSplitCreate(user_id=uid, amount_owed=per_person)
                    for uid in split_user_ids
                ]
            )

            db_expense = crud.create_expense(db, expense_data)

            # Backdate the expense created_at to the original date
            db.query(models.Expense).filter(models.Expense.id == db_expense.id).update(
                {"created_at": expense_date}
            )
            db.commit()
            imported += 1

        except Exception as e:
            errors.append(f"Row {idx+1}: {str(e)}")
            continue

    return {
        "imported": imported,
        "skipped": skipped,
        "errors": errors,
        "total_processed": len(rows_to_import),
    }
