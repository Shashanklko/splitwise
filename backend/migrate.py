"""Migration: add new columns to group_members and expenses tables."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from app.database import engine
import sqlalchemy as sa

with engine.connect() as conn:
    inspector = sa.inspect(engine)

    # group_members
    gm_cols = [c['name'] for c in inspector.get_columns('group_members')]
    if 'joined_at' not in gm_cols:
        conn.execute(sa.text('ALTER TABLE group_members ADD COLUMN joined_at TIMESTAMP'))
        print('Added joined_at to group_members')
    else:
        print('joined_at already exists')

    if 'left_at' not in gm_cols:
        conn.execute(sa.text('ALTER TABLE group_members ADD COLUMN left_at TIMESTAMP'))
        print('Added left_at to group_members')
    else:
        print('left_at already exists')

    # expenses
    exp_cols = [c['name'] for c in inspector.get_columns('expenses')]
    if 'currency' not in exp_cols:
        conn.execute(sa.text("ALTER TABLE expenses ADD COLUMN currency VARCHAR NOT NULL DEFAULT 'INR'"))
        print('Added currency to expenses')
    else:
        print('currency already exists')

    if 'original_amount' not in exp_cols:
        conn.execute(sa.text('ALTER TABLE expenses ADD COLUMN original_amount NUMERIC(10,4)'))
        print('Added original_amount to expenses')
    else:
        print('original_amount already exists')

    if 'exchange_rate' not in exp_cols:
        conn.execute(sa.text('ALTER TABLE expenses ADD COLUMN exchange_rate NUMERIC(10,6)'))
        print('Added exchange_rate to expenses')
    else:
        print('exchange_rate already exists')

    conn.commit()
    print('Migration complete.')
