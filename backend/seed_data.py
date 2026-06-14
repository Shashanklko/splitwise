import sys
import os
import datetime
from decimal import Decimal

# Add the backend directory to path so we can import app
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from app.database import SessionLocal, Base
from app import models, schemas, crud

# User list to create
users_data = [
    {"name": "Aisha", "email": "aisha@test.com", "password": "aisha123"},
    {"name": "Priya", "email": "priya@test.com", "password": "priya123"},
    {"name": "Rohan", "email": "rohan@test.com", "password": "rohan123"},
    {"name": "Dev", "email": "dev@test.com", "password": "dev123"},
    {"name": "Meera", "email": "meera@test.com", "password": "meera123"},
    {"name": "Sam", "email": "sam@test.com", "password": "sam123"},
    {"name": "Kabir", "email": "kabir@test.com", "password": "kabir123"}
]

# Standard conversion rate from USD to INR
USD_TO_INR = 83.0

expenses_data = [
    # Feb 2026
    {
        "date": "2026-02-01",
        "description": "February rent",
        "paid_by": "aisha",
        "amount": 48000.00,
        "split_type": "equally",
        "split_with": ["aisha", "rohan", "priya", "meera"],
    },
    {
        "date": "2026-02-03",
        "description": "Groceries BigBasket",
        "paid_by": "priya",
        "amount": 2340.00,
        "split_type": "equally",
        "split_with": ["aisha", "rohan", "priya", "meera"],
    },
    {
        "date": "2026-02-05",
        "description": "Wifi bill Feb",
        "paid_by": "rohan",
        "amount": 1199.00,
        "split_type": "equally",
        "split_with": ["aisha", "rohan", "priya", "meera"],
    },
    {
        "date": "2026-02-08",
        "description": "Dinner at Marina Bites",
        "paid_by": "dev",
        "amount": 3200.00,
        "split_type": "equally",
        "split_with": ["aisha", "rohan", "priya", "dev"],
    },
    {
        "date": "2026-02-08",
        "description": "dinner - marina bites",
        "paid_by": "dev",
        "amount": 3200.00,
        "split_type": "equally",
        "split_with": ["aisha", "rohan", "priya", "dev"],
    },
    {
        "date": "2026-02-10",
        "description": "Electricity Feb",
        "paid_by": "aisha",
        "amount": 1200.00,
        "split_type": "equally",
        "split_with": ["aisha", "rohan", "priya", "meera"],
    },
    {
        "date": "2026-02-12",
        "description": "Maid salary Feb",
        "paid_by": "meera",
        "amount": 3000.00,
        "split_type": "equally",
        "split_with": ["aisha", "rohan", "priya", "meera"],
    },
    {
        "date": "2026-02-14",
        "description": "Movie night snacks",
        "paid_by": "priya",
        "amount": 640.00,
        "split_type": "equally",
        "split_with": ["aisha", "rohan", "priya"],
    },
    {
        "date": "2026-02-15",
        "description": "Cylinder refill",
        "paid_by": "rohan",
        "amount": 900.00,  # 899.995 rounded
        "split_type": "equally",
        "split_with": ["aisha", "rohan", "priya", "meera"],
    },
    {
        "date": "2026-02-18",
        "description": "Groceries DMart",
        "paid_by": "priya",
        "amount": 1875.00,
        "split_type": "equally",
        "split_with": ["aisha", "rohan", "priya", "meera"],
    },
    {
        "date": "2026-02-20",
        "description": "Aisha birthday cake",
        "paid_by": "rohan",
        "amount": 1500.00,
        "split_type": "unequally",
        "split_with": [
            ("rohan", 700.00),
            ("priya", 400.00),
            ("meera", 400.00),
        ],
    },
    {
        "date": "2026-02-22",
        "description": "House cleaning supplies",
        "paid_by": ["aisha", "rohan", "priya", "meera"],  # "can't remember who paid", so they split payment equally
        "amount": 780.00,
        "split_type": "equally",
        "split_with": ["aisha", "rohan", "priya", "meera"],
    },
    {
        "date": "2026-02-25",
        "is_settlement": True,
        "payer": "rohan",
        "payee": "aisha",
        "amount": 5000.00,
    },
    {
        "date": "2026-02-28",
        "description": "Pizza Friday",
        "paid_by": "aisha",
        "amount": 1440.00,
        "split_type": "percentage",
        "split_with": [
            ("aisha", 27.27),
            ("rohan", 27.27),
            ("priya", 27.27),
            ("meera", 18.19),
        ]
    },
    # Mar 2026
    {
        "date": "2026-03-01",
        "description": "March rent",
        "paid_by": "aisha",
        "amount": 48000.00,
        "split_type": "equally",
        "split_with": ["aisha", "rohan", "priya", "meera"],
    },
    {
        "date": "2026-03-03",
        "description": "Groceries BigBasket",
        "paid_by": "meera",
        "amount": 2810.00,
        "split_type": "equally",
        "split_with": ["aisha", "rohan", "priya", "meera"],
    },
    {
        "date": "2026-03-05",
        "description": "Wifi bill Mar",
        "paid_by": "rohan",
        "amount": 1199.00,
        "split_type": "equally",
        "split_with": ["aisha", "rohan", "priya", "meera"],
    },
    {
        "date": "2026-03-08",
        "description": "Goa flights",
        "paid_by": "aisha",
        "amount": 32400.00,
        "split_type": "equally",
        "split_with": ["aisha", "rohan", "priya", "dev"],
    },
    {
        "date": "2026-03-09",
        "description": "Goa villa booking",
        "paid_by": "dev",
        "amount": 540.00 * USD_TO_INR,
        "split_type": "equally",
        "split_with": ["aisha", "rohan", "priya", "dev"],
    },
    {
        "date": "2026-03-10",
        "description": "Beach shack lunch",
        "paid_by": "rohan",
        "amount": 84.00 * USD_TO_INR,
        "split_type": "equally",
        "split_with": ["aisha", "rohan", "priya", "dev"],
    },
    {
        "date": "2026-03-10",
        "description": "Scooter rentals",
        "paid_by": "priya",
        "amount": 3600.00,
        "split_type": "shares",
        "split_with": [
            ("aisha", 1.00),
            ("rohan", 2.00),
            ("priya", 1.00),
            ("dev", 2.00),
        ]
    },
    {
        "date": "2026-03-11",
        "description": "Parasailing",
        "paid_by": "dev",
        "amount": 150.00 * USD_TO_INR,
        "split_type": "equally",
        "split_with": ["aisha", "rohan", "priya", "dev", "kabir"],
    },
    {
        "date": "2026-03-11",
        "description": "Dinner at Thalassa",
        "paid_by": "aisha",
        "amount": 2400.00,
        "split_type": "equally",
        "split_with": ["aisha", "rohan", "priya", "dev"],
    },
    {
        "date": "2026-03-11",
        "description": "Thalassa dinner",
        "paid_by": "rohan",
        "amount": 2450.00,
        "split_type": "equally",
        "split_with": ["aisha", "rohan", "priya", "dev"],
    },
    {
        "date": "2026-03-12",
        "description": "Parasailing refund",
        "paid_by": "dev",
        "amount": -30.00 * USD_TO_INR,
        "split_type": "equally",
        "split_with": ["aisha", "rohan", "priya", "dev"],
    },
    {
        "date": "2026-03-14",
        "description": "Airport cab",
        "paid_by": "rohan",
        "amount": 1100.00,
        "split_type": "equally",
        "split_with": ["aisha", "rohan", "priya", "dev"],
    },
    {
        "date": "2026-03-15",
        "description": "Groceries DMart",
        "paid_by": "priya",
        "amount": 2105.00,
        "split_type": "equally",
        "split_with": ["aisha", "rohan", "priya", "meera"],
    },
    {
        "date": "2026-03-18",
        "description": "Electricity Mar",
        "paid_by": "aisha",
        "amount": 1450.00,
        "split_type": "equally",
        "split_with": ["aisha", "rohan", "priya", "meera"],
    },
    {
        "date": "2026-03-20",
        "description": "Maid salary Mar",
        "paid_by": "meera",
        "amount": 3000.00,
        "split_type": "equally",
        "split_with": ["aisha", "rohan", "priya", "meera"],
    },
    {
        "date": "2026-03-22",
        "description": "Dinner order Swiggy",
        "paid_by": "priya",
        "amount": 0.00,
        "split_type": "equally",
        "split_with": ["aisha", "rohan", "priya", "meera"],
    },
    {
        "date": "2026-03-25",
        "description": "Weekend brunch",
        "paid_by": "meera",
        "amount": 2200.00,
        "split_type": "percentage",
        "split_with": [
            ("aisha", 27.27),
            ("rohan", 27.27),
            ("priya", 27.27),
            ("meera", 18.19),
        ]
    },
    {
        "date": "2026-03-28",
        "description": "Meera farewell dinner",
        "paid_by": "aisha",
        "amount": 4800.00,
        "split_type": "equally",
        "split_with": ["aisha", "rohan", "priya", "meera"],
    },
    {
        "date": "2026-04-05",  # Deep cleaning service
        "description": "Deep cleaning service",
        "paid_by": "rohan",
        "amount": 2500.00,
        "split_type": "equally",
        "split_with": ["aisha", "rohan", "priya", "meera"],
    },
    # Apr 2026
    {
        "date": "2026-04-01",
        "description": "April rent",
        "paid_by": "aisha",
        "amount": 48000.00,
        "split_type": "shares",
        "split_with": [
            ("aisha", 2.00),
            ("rohan", 1.00),
            ("priya", 1.00),
        ]
    },
    {
        "date": "2026-04-02",
        "description": "Groceries BigBasket",
        "paid_by": "priya",
        "amount": 2640.00,
        "split_type": "equally",
        "split_with": ["aisha", "rohan", "priya", "meera"],
    },
    {
        "date": "2026-04-05",
        "description": "Wifi bill Apr",
        "paid_by": "rohan",
        "amount": 1199.00,
        "split_type": "equally",
        "split_with": ["aisha", "rohan", "priya"],
    },
    {
        "date": "2026-04-08",
        "description": "Sam deposit share",
        "paid_by": "sam",
        "amount": 15000.00,
        "split_type": "equally",
        "split_with": ["aisha"],
    },
    {
        "date": "2026-04-10",
        "description": "Housewarming drinks",
        "paid_by": "sam",
        "amount": 3100.00,
        "split_type": "equally",
        "split_with": ["aisha", "rohan", "priya", "sam"],
    },
    {
        "date": "2026-04-12",
        "description": "Electricity Apr",
        "paid_by": "aisha",
        "amount": 1360.00,
        "split_type": "equally",
        "split_with": ["aisha", "rohan", "priya", "sam"],
    },
    {
        "date": "2026-04-15",
        "description": "Groceries DMart",
        "paid_by": "sam",
        "amount": 1990.00,
        "split_type": "equally",
        "split_with": ["aisha", "rohan", "priya", "sam"],
    },
    {
        "date": "2026-04-18",
        "description": "Furniture for common room",
        "paid_by": "aisha",
        "amount": 12000.00,
        "split_type": "equally",
        "split_with": ["aisha", "rohan", "priya", "sam"],
    },
    {
        "date": "2026-04-20",
        "description": "Maid salary Apr",
        "paid_by": "priya",
        "amount": 3000.00,
        "split_type": "equally",
        "split_with": ["aisha", "rohan", "priya", "sam"],
    }
]

def clear_db(db):
    print("Clearing existing data from database...")
    db.query(models.Comment).delete()
    db.query(models.Settlement).delete()
    db.query(models.ExpenseSplit).delete()
    db.query(models.ExpensePayer).delete()
    db.query(models.Expense).delete()
    db.query(models.GroupMember).delete()
    db.query(models.Group).delete()
    db.query(models.User).delete()
    db.commit()
    print("Database cleared.")

def create_users_and_group(db):
    print("Creating user accounts...")
    user_map = {}
    for user_info in users_data:
        reg = schemas.UserRegister(
            email=user_info["email"],
            password=user_info["password"],
            name=user_info["name"]
        )
        db_user = crud.create_user(db, reg)
        user_map[user_info["name"].lower()] = db_user.id
        print(f"Created user {db_user.name} ({db_user.email}) with ID {db_user.id}")

    print("Creating group...")
    # Aisha creates the group
    group_in = schemas.GroupCreate(name="Flatmates & Friends")
    db_group = crud.create_group(db, group_in, creator_id=user_map["aisha"])
    print(f"Created group '{db_group.name}' with ID {db_group.id}")

    # Add all other users as members to this group
    for user_info in users_data:
        if user_info["name"].lower() != "aisha":
            crud.add_user_to_group(db, db_group.id, user_info["email"])
            print(f"Added {user_info['name']} to group")

    return user_map, db_group.id

def feed_transactions(db, user_map, group_id):
    print("Feeding transactions...")
    for idx, t in enumerate(expenses_data):
        date_obj = datetime.datetime.strptime(t["date"], "%Y-%m-%d")
        
        if t.get("is_settlement"):
            payer_id = user_map[t["payer"]]
            payee_id = user_map[t["payee"]]
            settlement_in = schemas.SettlementCreate(
                group_id=group_id,
                payer_id=payer_id,
                payee_id=payee_id,
                amount=Decimal(str(t["amount"]))
            )
            db_settle = crud.create_settlement(db, settlement_in)
            db_settle.created_at = date_obj
            db.commit()
            print(f"[{t['date']}] Settlement: {t['payer'].title()} paid {t['payee'].title()} {t['amount']} INR")
            continue

        description = t["description"]
        amount = Decimal(str(t["amount"]))
        split_type = t["split_type"]

        # 1. Setup payers
        payers_list = []
        paid_by = t["paid_by"]
        if isinstance(paid_by, list):
            n_payers = len(paid_by)
            share_paid = (amount / Decimal(n_payers)).quantize(Decimal("0.01"))
            for p_idx, p_name in enumerate(paid_by):
                p_id = user_map[p_name]
                p_amt = share_paid
                if p_idx == 0:
                    # Adjust remainder
                    p_amt += amount - (share_paid * Decimal(n_payers))
                payers_list.append(schemas.ExpensePayerCreate(user_id=p_id, amount_paid=p_amt))
        else:
            p_id = user_map[paid_by]
            payers_list.append(schemas.ExpensePayerCreate(user_id=p_id, amount_paid=amount))

        # 2. Setup splits
        splits_list = []
        split_with = t["split_with"]
        if split_type == "equally":
            for s_name in split_with:
                s_id = user_map[s_name]
                splits_list.append(schemas.ExpenseSplitCreate(user_id=s_id, split_value=None))
        else:
            # unequally, percentage, shares
            for s_name, s_val in split_with:
                s_id = user_map[s_name]
                splits_list.append(schemas.ExpenseSplitCreate(user_id=s_id, split_value=Decimal(str(s_val))))

        expense_in = schemas.ExpenseCreate(
            group_id=group_id,
            description=description,
            amount=amount,
            split_type=split_type,
            payers=payers_list,
            splits=splits_list
        )

        db_expense = crud.create_expense(db, expense_in)
        db_expense.created_at = date_obj
        db.commit()
        print(f"[{t['date']}] Expense: {description} ({amount} INR) - Split: {split_type}")

def main():
    db = SessionLocal()
    try:
        clear_db(db)
        user_map, group_id = create_users_and_group(db)
        feed_transactions(db, user_map, group_id)
        print("\nAll details successfully seeded!")
    except Exception as e:
        print("Error during seed process:", e)
        db.rollback()
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    main()
