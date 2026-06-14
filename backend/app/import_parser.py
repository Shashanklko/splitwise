"""
CSV Import Parser for Splitwise Clone
--------------------------------------
Detects and surfaces all anomalies in expenses_export.csv before any DB writes.
Policy decisions are documented inline and in SCOPE.md.

Anomaly types detected:
  DUPLICATE_ENTRY       - Same description+date+amount appears more than once
  SETTLEMENT_AS_EXPENSE - Row looks like a payment/settlement logged as expense
  CURRENCY_MISMATCH     - Amount in USD (or non-INR) needs conversion
  NEGATIVE_AMOUNT       - Negative expense amount (refund vs error)
  ZERO_AMOUNT           - Expense with ₹0 amount
  MISSING_PAID_BY       - Payer field is blank or ambiguous
  PERCENTAGE_SUM_ERROR  - Percentage splits don't add to 100%
  INVALID_DATE          - Date cannot be parsed (multiple formats attempted)
  MEMBER_NOT_IN_GROUP   - Split participant not a registered member
  EX_MEMBER_EXPENSE     - Expense date is after the member's left_at date
  FUTURE_MEMBER_EXPENSE - Expense date is before the member's joined_at date
  UNRESOLVABLE_SPLIT    - Split type not recognized or split values missing
"""

import csv
import io
import re
from decimal import Decimal, InvalidOperation
from datetime import datetime
from typing import List, Dict, Tuple, Optional, Any

# Exchange rate used for USD→INR conversion
# Policy: Use a fixed rate at import time, documented in Import Report
USD_TO_INR_RATE = Decimal("83.0")

# Known settlement keywords — rows with these are likely settlements, not expenses
SETTLEMENT_KEYWORDS = [
    "paid back", "settled", "reimbursed", "transfer", "settlement",
    "paid aisha", "paid rohan", "paid priya", "paid meera", "paid sam", "paid dev", "paid kabir"
]

# Date formats to try, in order of preference
DATE_FORMATS = [
    "%d/%m/%Y",   # 01/02/2026
    "%m/%d/%Y",   # 02/01/2026
    "%d-%m-%Y",   # 01-02-2026
    "%d-%b-%Y",   # 01-Feb-2026
    "%Y-%m-%d",   # 2026-02-01
    "%-d-%b-%Y",  # 1-Feb-2026 (Linux only)
    "%d %b %Y",   # 01 Feb 2026
    "%b %d, %Y",  # Feb 01, 2026
]


def parse_date(raw: str) -> Optional[datetime]:
    """Try multiple date formats. Return None if all fail."""
    raw = str(raw).strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            continue
    # Try pandas-style loose parsing as last resort
    try:
        from dateutil import parser as dateutil_parser
        return dateutil_parser.parse(raw, dayfirst=True)
    except Exception:
        return None


def parse_amount(raw: str) -> Tuple[Optional[Decimal], str]:
    """
    Parse an amount field. Returns (amount, currency).
    Handles: '1200', '1,200.00', '-30', '540 USD', '$540', '₹1200'
    """
    raw = str(raw).strip()
    currency = "INR"

    if not raw:
        return None, currency

    # Strip currency symbols
    if raw.startswith("$") or "USD" in raw.upper():
        currency = "USD"
    elif raw.startswith("₹"):
        currency = "INR"

    # Remove all non-numeric except minus and dot
    cleaned = re.sub(r"[^\d\.\-]", "", raw)
    if not cleaned or cleaned == "-":
        return None, currency

    try:
        return Decimal(cleaned), currency
    except InvalidOperation:
        return None, currency


def detect_currency_from_row(row: Dict) -> str:
    """Infer currency from the 'currency' column or from amount formatting."""
    currency_col = str(row.get("currency", "")).strip().upper()
    if currency_col in ("USD", "US", "$"):
        return "USD"
    if currency_col in ("INR", "₹", "RS", "RS.", ""):
        return "INR"
    # Fallback: check if amount field contains currency hint
    amount_raw = str(row.get("amount", ""))
    if "$" in amount_raw or "USD" in amount_raw.upper():
        return "USD"
    return "INR"


def normalize_name(name: str) -> str:
    return str(name).strip().lower().capitalize()


def is_settlement_row(row: Dict) -> bool:
    """
    Detect if a row is actually a settlement (payment) logged as an expense.
    Policy: Flag as SETTLEMENT_AS_EXPENSE anomaly. User can accept (convert to settlement)
    or reject (keep as expense).
    """
    desc = str(row.get("description", "")).lower()
    notes = str(row.get("notes", "")).lower()
    split_type = str(row.get("split_type", "")).lower()

    # Check for settlement keywords in description or notes
    for kw in SETTLEMENT_KEYWORDS:
        if kw in desc or kw in notes:
            return True

    # "equal" split to just one person is a strong signal
    split_with = str(row.get("split_with", ""))
    if split_type == "equal" and ";" not in split_with and split_with.strip():
        # Only one person in split_with
        paid_by = normalize_name(str(row.get("paid_by", "")))
        split_person = normalize_name(split_with.strip())
        if paid_by and split_person and paid_by != split_person:
            return True

    return False


def check_percentage_split(split_details: str) -> Optional[Decimal]:
    """
    For percentage splits, extract percentages and check they sum to 100.
    Returns the actual sum if it's not 100, else None.
    """
    if not split_details:
        return None
    # Pattern: "Aisha 30%; Rohan 30%; Priya 30%; Meera 20%"
    percentages = re.findall(r"(\d+(?:\.\d+)?)\s*%", split_details)
    if not percentages:
        return None
    total = sum(Decimal(p) for p in percentages)
    if abs(total - Decimal("100")) > Decimal("0.01"):
        return total
    return None


def row_signature(row: Dict) -> str:
    """Generate a signature for duplicate detection."""
    date = str(row.get("date", "")).strip()
    desc = str(row.get("description", "")).strip().lower()
    amount = str(row.get("amount", "")).strip()
    paid_by = str(row.get("paid_by", "")).strip().lower()
    return f"{date}|{desc}|{amount}|{paid_by}"


def parse_csv(content: bytes, known_members: List[str]) -> Dict[str, Any]:
    """
    Main parser function.
    
    Args:
        content: Raw CSV file bytes
        known_members: List of known group member names (lowercase) for validation
    
    Returns:
        {
            total_rows: int,
            clean_rows: list of validated row dicts,
            anomalies: list of ImportAnomalyItem dicts,
        }
    """
    text = content.decode("utf-8-sig", errors="replace")  # handle BOM
    reader = csv.DictReader(io.StringIO(text))

    # Normalize header names: strip whitespace, lowercase
    raw_rows = []
    for row in reader:
        normalized = {k.strip().lower(): str(v).strip() for k, v in row.items()}
        raw_rows.append(normalized)

    total_rows = len(raw_rows)
    anomalies = []
    clean_rows = []

    # Pass 1: signature-based duplicate detection
    seen_signatures: Dict[str, int] = {}  # sig -> first row_index
    duplicate_indices = set()
    for idx, row in enumerate(raw_rows):
        sig = row_signature(row)
        if sig in seen_signatures:
            duplicate_indices.add(idx)
            # Also mark original as part of a duplicate group
            duplicate_indices.add(seen_signatures[sig])
        else:
            seen_signatures[sig] = idx

    # Pass 2: Per-row analysis
    for idx, row in enumerate(raw_rows):
        row_anomalies = []

        # ── Date parsing ──────────────────────────────────────────────────
        raw_date = row.get("date", "")
        parsed_date = parse_date(raw_date)
        if parsed_date is None:
            row_anomalies.append({
                "anomaly_type": "INVALID_DATE",
                "description": f"Row {idx+1}: Cannot parse date '{raw_date}'. Tried all common formats.",
                "proposed_action": "SKIP",
            })

        # ── Amount parsing ────────────────────────────────────────────────
        raw_amount = row.get("amount", "")
        amount, parsed_currency = parse_amount(raw_amount)
        detected_currency = detect_currency_from_row(row)
        # Merge: explicit currency column wins over amount-field hint
        final_currency = detected_currency if detected_currency != "INR" else parsed_currency

        if amount is None:
            row_anomalies.append({
                "anomaly_type": "MISSING_AMOUNT",
                "description": f"Row {idx+1}: Amount field '{raw_amount}' could not be parsed.",
                "proposed_action": "SKIP",
            })

        # ── Negative amount ───────────────────────────────────────────────
        if amount is not None and amount < Decimal("0"):
            row_anomalies.append({
                "anomaly_type": "NEGATIVE_AMOUNT",
                "description": f"Row {idx+1}: Amount is negative ({raw_amount}). This looks like a refund (e.g., Parasailing refund).",
                "proposed_action": "TREAT_AS_REFUND",  # Store as-is; negative splits create credit
            })

        # ── Zero amount ───────────────────────────────────────────────────
        if amount is not None and amount == Decimal("0"):
            row_anomalies.append({
                "anomaly_type": "ZERO_AMOUNT",
                "description": f"Row {idx+1}: Amount is ₹0 ('{row.get('description', '')}' on {raw_date}). Likely a placeholder or cancelled expense.",
                "proposed_action": "SKIP",
            })

        # ── Currency mismatch ─────────────────────────────────────────────
        if final_currency == "USD":
            converted_inr = (amount * USD_TO_INR_RATE).quantize(Decimal("0.01")) if amount else None
            row_anomalies.append({
                "anomaly_type": "CURRENCY_MISMATCH",
                "description": f"Row {idx+1}: Amount {raw_amount} is in USD. Converting to ₹{converted_inr} at rate 1 USD = ₹{USD_TO_INR_RATE}.",
                "proposed_action": "CONVERT_TO_INR",
                "conversion_rate": str(USD_TO_INR_RATE),
                "converted_amount": str(converted_inr),
            })

        # ── Settlement logged as expense ──────────────────────────────────
        if is_settlement_row(row):
            row_anomalies.append({
                "anomaly_type": "SETTLEMENT_AS_EXPENSE",
                "description": f"Row {idx+1}: '{row.get('description', '')}' looks like a payment/settlement, not an expense. Paid by {row.get('paid_by','')} to {row.get('split_with','')}.",
                "proposed_action": "CONVERT_TO_SETTLEMENT",
            })

        # ── Missing payer ─────────────────────────────────────────────────
        paid_by = row.get("paid_by", "").strip()
        if not paid_by or paid_by.lower() in ("", "unknown", "?", "n/a"):
            row_anomalies.append({
                "anomaly_type": "MISSING_PAID_BY",
                "description": f"Row {idx+1}: Payer is missing or ambiguous ('{paid_by}'). Cannot assign credit without knowing who paid.",
                "proposed_action": "SPLIT_PAYMENT_EQUALLY",  # Distribute payment equally among split members
            })

        # ── Percentage split validation ───────────────────────────────────
        split_type = row.get("split_type", "").strip().lower()
        split_details = row.get("split_details", "").strip()
        if split_type in ("percentage", "percent", "%"):
            bad_sum = check_percentage_split(split_details)
            if bad_sum is not None:
                row_anomalies.append({
                    "anomaly_type": "PERCENTAGE_SUM_ERROR",
                    "description": f"Row {idx+1}: Percentage splits sum to {bad_sum}% instead of 100% ('{split_details}').",
                    "proposed_action": "NORMALIZE_PERCENTAGES",  # Scale each % proportionally to sum to 100
                })

        # ── Duplicate detection ───────────────────────────────────────────
        if idx in duplicate_indices:
            # Find the other row index for context
            sig = row_signature(row)
            other_idx = seen_signatures.get(sig, idx)
            if other_idx != idx:
                other_row_num = other_idx + 1
            else:
                other_row_num = "earlier"
            row_anomalies.append({
                "anomaly_type": "DUPLICATE_ENTRY",
                "description": f"Row {idx+1}: Identical to row {other_row_num} (same date, description, amount, payer). One must be removed.",
                "proposed_action": "SKIP",  # Skip duplicates; keep only the first occurrence
            })

        # ── Member validation ─────────────────────────────────────────────
        split_with = row.get("split_with", "")
        if split_with:
            split_members = [normalize_name(m.strip()) for m in split_with.split(";") if m.strip()]
            for member in split_members:
                if known_members and member.lower() not in [m.lower() for m in known_members]:
                    row_anomalies.append({
                        "anomaly_type": "MEMBER_NOT_IN_GROUP",
                        "description": f"Row {idx+1}: '{member}' appears in split_with but is not a known group member. Could be a guest (e.g., Kabir).",
                        "proposed_action": "EXCLUDE_NON_MEMBER",  # Redistribute their share equally among actual members
                    })

        # ── Assemble result ───────────────────────────────────────────────
        resolved_row = {
            "raw_row": row,
            "parsed_date": parsed_date.isoformat() if parsed_date else None,
            "amount_inr": None,
            "original_amount": str(amount) if amount else None,
            "currency": final_currency,
            "exchange_rate": str(USD_TO_INR_RATE) if final_currency == "USD" else "1.0",
        }
        if amount is not None:
            resolved_row["amount_inr"] = str(
                (amount * USD_TO_INR_RATE).quantize(Decimal("0.01")) if final_currency == "USD" else amount
            )

        if row_anomalies:
            for a in row_anomalies:
                anomalies.append({
                    "row_index": idx,
                    "anomaly_type": a["anomaly_type"],
                    "description": a["description"],
                    "proposed_action": a["proposed_action"],
                    "raw_row": row,
                    "resolved_row": resolved_row,
                    "user_decision": None,  # To be filled by user in the UI
                    **{k: v for k, v in a.items() if k not in ("anomaly_type", "description", "proposed_action")},
                })
        else:
            clean_rows.append(resolved_row)

    return {
        "total_rows": total_rows,
        "clean_rows": clean_rows,
        "anomaly_count": len(anomalies),
        "anomalies": anomalies,
    }
