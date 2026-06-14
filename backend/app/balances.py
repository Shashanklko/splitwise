from sqlalchemy.orm import Session
from sqlalchemy import func
from decimal import Decimal
from typing import List, Dict, Tuple, Any
from app import models, schemas

def get_group_member_balances(db: Session, group_id: int) -> Dict[int, Decimal]:
    """
    Calculates the net balance of each user in a group.
    Net Balance = (Total Paid + Total Settled Paid) - (Total Owed + Total Settled Received).
    """
    # Get all members of the group
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
        return {}

    member_ids = [m.id for m in group.members]
    balances = {uid: Decimal("0.00") for uid in member_ids}

    # 1. Add amount_paid by user in group expenses
    payers_query = (
        db.query(models.ExpensePayer.user_id, func.sum(models.ExpensePayer.amount_paid))
        .join(models.Expense)
        .filter(models.Expense.group_id == group_id)
        .filter(models.ExpensePayer.user_id.in_(member_ids))
        .group_by(models.ExpensePayer.user_id)
        .all()
    )
    for uid, amt in payers_query:
        if amt:
            balances[uid] += Decimal(str(amt))

    # 2. Subtract amount_owed by user in group expenses
    splits_query = (
        db.query(models.ExpenseSplit.user_id, func.sum(models.ExpenseSplit.amount_owed))
        .join(models.Expense)
        .filter(models.Expense.group_id == group_id)
        .filter(models.ExpenseSplit.user_id.in_(member_ids))
        .group_by(models.ExpenseSplit.user_id)
        .all()
    )
    for uid, amt in splits_query:
        if amt:
            balances[uid] -= Decimal(str(amt))

    # 3. Add amount settled (paid) by user in group settlements
    settled_paid_query = (
        db.query(models.Settlement.payer_id, func.sum(models.Settlement.amount))
        .filter(models.Settlement.group_id == group_id)
        .filter(models.Settlement.payer_id.in_(member_ids))
        .group_by(models.Settlement.payer_id)
        .all()
    )
    for uid, amt in settled_paid_query:
        if amt:
            balances[uid] += Decimal(str(amt))

    # 4. Subtract amount settled (received) by user in group settlements
    settled_recv_query = (
        db.query(models.Settlement.payee_id, func.sum(models.Settlement.amount))
        .filter(models.Settlement.group_id == group_id)
        .filter(models.Settlement.payee_id.in_(member_ids))
        .group_by(models.Settlement.payee_id)
        .all()
    )
    for uid, amt in settled_recv_query:
        if amt:
            balances[uid] -= Decimal(str(amt))

    # Quantize to 2 decimals
    for uid in balances:
        balances[uid] = balances[uid].quantize(Decimal("0.01"))

    return balances

def simplify_debts(balances: Dict[int, Decimal], db: Session) -> List[schemas.DebtCalculation]:
    """
    Min-Cash-Flow Algorithm to find the simplified transactions list inside a group.
    """
    # Filter out users with zero balance
    debtors = []  # will store lists of [user_id, balance] where balance is negative
    creditors = []  # will store lists of [user_id, balance] where balance is positive

    for uid, bal in balances.items():
        if bal < Decimal("-0.005"):
            debtors.append([uid, bal])
        elif bal > Decimal("0.005"):
            creditors.append([uid, bal])

    # Fetch user names to populate the response
    all_user_ids = list(balances.keys())
    user_names = {}
    if all_user_ids:
        users = db.query(models.User).filter(models.User.id.in_(all_user_ids)).all()
        user_names = {u.id: u.name for u in users}

    simplified_txs = []

    # Greedily match largest debtor with largest creditor
    while debtors and creditors:
        # Sort so we have the max debtor (most negative) and max creditor (most positive)
        debtors.sort(key=lambda x: x[1])  # e.g. -50 is before -10
        creditors.sort(key=lambda x: x[1], reverse=True)  # e.g. 50 is before 10

        debtor = debtors[0]
        creditor = creditors[0]

        debtor_id, debtor_bal = debtor
        creditor_id, creditor_bal = creditor

        # Amount to transfer
        transfer_amount = min(-debtor_bal, creditor_bal).quantize(Decimal("0.01"))

        if transfer_amount > Decimal("0.00"):
            simplified_txs.append(
                schemas.DebtCalculation(
                    debtor_id=debtor_id,
                    debtor_name=user_names.get(debtor_id, f"User {debtor_id}"),
                    creditor_id=creditor_id,
                    creditor_name=user_names.get(creditor_id, f"User {creditor_id}"),
                    amount=transfer_amount
                )
            )

        # Update balances
        debtor[1] += transfer_amount
        creditor[1] -= transfer_amount

        # Remove if balance is resolved
        if abs(debtor[1]) < Decimal("0.005"):
            debtors.pop(0)
        if abs(creditor[1]) < Decimal("0.005"):
            creditors.pop(0)

    return simplified_txs

def calculate_overall_user_balances(db: Session, user_id: int) -> Dict[str, Any]:
    """
    Calculates:
    1. Overall Net Balance of a user across all groups and direct relationships.
    2. Net Balance per group.
    3. Net balance with each friend (direct/simplified peer-to-peer).
    """
    # Find all groups this user belongs to
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        return {"net_balance": Decimal("0.00"), "group_balances": {}, "friend_balances": {}}

    group_ids = [g.id for g in user.groups]

    # Calculate group-level balances
    group_balances = {}
    overall_net = Decimal("0.00")

    for gid in group_ids:
        g_balances = get_group_member_balances(db, gid)
        user_bal = g_balances.get(user_id, Decimal("0.00"))
        group_balances[gid] = user_bal
        overall_net += user_bal

    # Standalone non-group transactions involving this user
    # 1. Standalone Paid
    standalone_paid = db.query(func.sum(models.ExpensePayer.amount_paid)).join(models.Expense).filter(
        models.Expense.group_id == None,
        models.ExpensePayer.user_id == user_id
    ).scalar() or Decimal("0.00")

    # 2. Standalone Owed
    standalone_owed = db.query(func.sum(models.ExpenseSplit.amount_owed)).join(models.Expense).filter(
        models.Expense.group_id == None,
        models.ExpenseSplit.user_id == user_id
    ).scalar() or Decimal("0.00")

    # 3. Standalone Settlements Paid
    standalone_settled_paid = db.query(func.sum(models.Settlement.amount)).filter(
        models.Settlement.group_id == None,
        models.Settlement.payer_id == user_id
    ).scalar() or Decimal("0.00")

    # 4. Standalone Settlements Received
    standalone_settled_recv = db.query(func.sum(models.Settlement.amount)).filter(
        models.Settlement.group_id == None,
        models.Settlement.payee_id == user_id
    ).scalar() or Decimal("0.00")

    standalone_net = (standalone_paid + standalone_settled_paid) - (standalone_owed + standalone_settled_recv)
    overall_net += standalone_net

    # Calculate peer-to-peer friend relationships for displaying on dashboard
    # To find friend balances, we can aggregate simplified debts for each group,
    # plus standalone debts between this user and others.
    friend_balances = {}

    # Gather peer balances from group-level simplified debts
    for gid in group_ids:
        g_balances = get_group_member_balances(db, gid)
        simplified = simplify_debts(g_balances, db)
        for debt in simplified:
            if debt.debtor_id == user_id:
                # User owes someone
                creditor_id = debt.creditor_id
                friend_balances[creditor_id] = friend_balances.get(creditor_id, Decimal("0.00")) - debt.amount
            elif debt.creditor_id == user_id:
                # Someone owes user
                debtor_id = debt.debtor_id
                friend_balances[debtor_id] = friend_balances.get(debtor_id, Decimal("0.00")) + debt.amount

    # Standalone peer balances calculation
    # We query all standalone expenses involving the user
    standalone_expenses = db.query(models.Expense).filter(models.Expense.group_id == None).all()
    for exp in standalone_expenses:
        # Calculate who paid what and who owes what for this expense
        # Note: Standalone expenses are typically direct peer-to-peer
        payers = {p.user_id: p.amount_paid for p in exp.payers}
        splits = {s.user_id: s.amount_owed for s in exp.splits}
        
        # User net in this expense
        user_paid = payers.get(user_id, Decimal("0.00"))
        user_owed = splits.get(user_id, Decimal("0.00"))
        
        # Distribute net difference among other participants
        for other_uid in set(list(payers.keys()) + list(splits.keys())):
            if other_uid == user_id:
                continue
            # Simplified direct split share:
            # Let's say user paid X, other paid Y. User owes splits_u, other owes splits_o.
            # We can model net balance directly.
            # But let's keep it simple: who owes whom.
            other_paid = payers.get(other_uid, Decimal("0.00"))
            other_owed = splits.get(other_uid, Decimal("0.00"))
            
            # Direct net balance logic:
            # (User Paid - User Owed) vs (Other Paid - Other Owed)
            # If user paid for other's share, other owes user.
            # Let's calculate: amount user paid that went to other:
            # In a direct expense, we can simplify:
            # Net balance between user and other_uid from this expense:
            # User is owed other_owed if user paid the entire amount.
            # Formally: (user_paid / exp.amount * other_owed) - (other_paid / exp.amount * user_owed)
            # This handles multi-payer proportional splitting perfectly!
            if exp.amount > 0:
                user_share_of_other = (user_paid / exp.amount) * other_owed
                other_share_of_user = (other_paid / exp.amount) * user_owed
                net_diff = (user_share_of_other - other_share_of_user).quantize(Decimal("0.01"))
                friend_balances[other_uid] = friend_balances.get(other_uid, Decimal("0.00")) + net_diff

    # Standalone settlements
    standalone_settlements = db.query(models.Settlement).filter(models.Settlement.group_id == None).all()
    for setl in standalone_settlements:
        if setl.payer_id == user_id:
            # User paid friend, so friend owes user less (or user owes friend less)
            # This increases friend_balances (moving it closer to positive / less negative)
            friend_balances[setl.payee_id] = friend_balances.get(setl.payee_id, Decimal("0.00")) + setl.amount
        elif setl.payee_id == user_id:
            # Friend paid user, so friend_balances decreases
            friend_balances[setl.payer_id] = friend_balances.get(setl.payer_id, Decimal("0.00")) - setl.amount

    # Map friend user ids to friend objects containing name and net balance
    friends_list = []
    if friend_balances:
        friends = db.query(models.User).filter(models.User.id.in_(list(friend_balances.keys()))).all()
        for f in friends:
            bal = friend_balances[f.id].quantize(Decimal("0.01"))
            if abs(bal) > Decimal("0.005"):
                friends_list.append({
                    "id": f.id,
                    "name": f.name,
                    "email": f.email,
                    "net_balance": bal
                })

    # Convert group balances keys to strings for JSON compatibility
    group_balances_str = {str(k): v.quantize(Decimal("0.01")) for k, v in group_balances.items()}

    return {
        "net_balance": overall_net.quantize(Decimal("0.01")),
        "group_balances": group_balances_str,
        "friends": friends_list
    }
