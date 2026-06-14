import sys
import os

# Add the backend directory to path so we can import app
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from app.database import SessionLocal
from app.models import User

def main():
    print("Connecting to database...")
    db = SessionLocal()
    try:
        users = db.query(User).all()
        print(f"Connection successful. Found {len(users)} users.")
        for u in users:
            print(f"- ID: {u.id}, Email: {u.email}, Name: {u.name}")
    except Exception as e:
        print("Error connecting to database:", e)
    finally:
        db.close()

if __name__ == "__main__":
    main()
